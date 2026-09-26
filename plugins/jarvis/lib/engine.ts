// The voice engine: microphone, turn-taking, playback, and tones.
//
// One engine per app window, owned by a module-level singleton rather than a
// component, because a conversation must survive navigation: the user can walk
// away from the Jarvis page and keep talking. Components subscribe to snapshots
// (useSyncExternalStore) for anything that changes a few times a second; the
// orb reads levels() directly every animation frame instead, so 60 fps meters
// never re-render React.
//
// Every window receives Jarvis's sentences, but only a window whose session is on
// speaks them, so two open tabs never talk over each other.
import type { PhasePayload, SayPayload, VisualPayload } from "../channels";
import { BrowserTranscriber, browserRecognitionAvailable } from "./browser-stt";
import { playAlert, playHeard, startThinking } from "./earcons";
import { rmsOf, VoiceActivityDetector } from "./vad";
import { concatFrames, downsample, encodeWav, toBase64 } from "./wav";

const ROUTE = "/api/v1/plugins/jarvis/http";
const FRAME_SIZE = 2048;
/** Audio kept from before speech was detected, so the first syllable survives. */
const PREROLL_MS = 600;
/** How long an answer may take to start before the thinking pulse begins. */
const THINKING_DELAY_MS = 1_200;
/** Sentences synthesized ahead of the one playing. */
const PREFETCH = 2;
/** Speaking pace for captions when there is no audio to time them by. */
const SILENT_MS_PER_WORD = 330;

export type Mode =
  | "off"
  | "starting"
  | "listening"
  | "hearing"
  | "sending"
  | "thinking"
  | "speaking";

export interface Caption {
  text: string;
  /** performance.now() when the sentence started. */
  startedAt: number;
  durationMs: number;
}

export interface Snapshot {
  /** What the user calls their assistant (the `name` setting). */
  name: string;
  mode: Mode;
  caption: Caption | null;
  heard: string | null;
  visual: VisualPayload | null;
  error: string | null;
  brainThreadId: string | null;
  earcons: boolean;
  /** How many Jarvis pages are mounted; the floating orb hides while one is. */
  stagesMounted: number;
}

export interface EngineBindings {
  /**
   * Ensures the brain thread exists. Also reports whether the server's
   * transcription service works; when it does not, the browser's own speech
   * recognition supplies the words instead.
   */
  start(): Promise<{ brainThreadId: string; serverTranscription: boolean }>;
  /** Tells the server to drop the rest of the current reply. */
  interrupt(): Promise<void>;
}

interface Queued {
  payload: SayPayload;
  audio: Promise<AudioBuffer | null> | null;
}

class VoiceEngine {
  private snapshot: Snapshot = {
    name: "Jarvis",
    mode: "off",
    caption: null,
    heard: null,
    visual: null,
    error: null,
    brainThreadId: null,
    earcons: true,
    stagesMounted: 0,
  };
  private readonly listeners = new Set<() => void>();
  private bindings: EngineBindings | null = null;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private outGain: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private vad: VoiceActivityDetector | null = null;
  private preroll: Float32Array[] = [];
  private utterance: Float32Array[] | null = null;
  /** Set when the server cannot transcribe and the browser does it instead. */
  private transcriber: BrowserTranscriber | null = null;

  private queue: Queued[] = [];
  private readonly seen = new Set<string>();
  private readonly mutedTurns = new Set<string>();
  private currentTurnId: string | null = null;
  private lastAnnouncedTurn: string | null = null;
  private playing = false;
  private source: AudioBufferSourceNode | null = null;
  /** Bumped to cancel everything queued or playing. */
  private generation = 0;
  private stopThinking: (() => void) | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly scratch = new Float32Array(FRAME_SIZE);

  // ------------------------------------------------------------ store API --

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  bind(bindings: EngineBindings | null): void {
    this.bindings = bindings;
  }

  stageMounted(delta: 1 | -1): void {
    this.set({ stagesMounted: Math.max(0, this.snapshot.stagesMounted + delta) });
  }

  setBrain(brainThreadId: string | null): void {
    if (brainThreadId !== this.snapshot.brainThreadId) this.set({ brainThreadId });
  }

  setName(name: string): void {
    if (name !== this.snapshot.name) this.set({ name });
  }

  setEarcons(earcons: boolean): void {
    this.set({ earcons });
  }

  // --------------------------------------------------------------- levels --

  /** Current mic and output levels, 0 to about 1, for the orb. */
  levels(): { mic: number; out: number } {
    return { mic: this.level(this.micAnalyser), out: this.level(this.outAnalyser) };
  }

  private level(analyser: AnalyserNode | null): number {
    if (analyser === null) return 0;
    analyser.getFloatTimeDomainData(this.scratch);
    return Math.min(1, rmsOf(this.scratch) * 6);
  }

  // -------------------------------------------------------------- session --

  get active(): boolean {
    return this.snapshot.mode !== "off" && this.snapshot.mode !== "starting";
  }

  async start(): Promise<void> {
    if (this.snapshot.mode !== "off") return;
    this.set({ mode: "starting", error: null });
    try {
      // Must run inside the user's tap: browsers only allow audio and the mic
      // to start from a gesture.
      const ctx = new AudioContext();
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.ctx = ctx;
      this.stream = stream;

      const mic = ctx.createMediaStreamSource(stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = FRAME_SIZE;
      mic.connect(this.micAnalyser);

      // ScriptProcessor is deprecated but universal, and needs no worklet
      // module URL, which a plugin bundle cannot easily provide.
      this.processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      mic.connect(this.processor);
      this.processor.connect(sink).connect(ctx.destination);
      const frameMs = (FRAME_SIZE / ctx.sampleRate) * 1000;
      this.vad = new VoiceActivityDetector({ frameMs });
      const prerollFrames = Math.ceil(PREROLL_MS / frameMs);
      this.processor.onaudioprocess = (event) => {
        this.onFrame(new Float32Array(event.inputBuffer.getChannelData(0)), prerollFrames);
      };

      this.outGain = ctx.createGain();
      this.outAnalyser = ctx.createAnalyser();
      this.outAnalyser.fftSize = FRAME_SIZE;
      this.outGain.connect(this.outAnalyser).connect(ctx.destination);

      this.set({ mode: "listening" });
      const started = await this.bindings?.start();
      if (started !== undefined) {
        this.setBrain(started.brainThreadId);
        if (!started.serverTranscription) this.useBrowserRecognition();
      }
    } catch (cause) {
      this.teardown();
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it for this site, then tap again."
          : cause instanceof Error
            ? cause.message
            : String(cause);
      this.set({ mode: "off", error: message });
    }
  }

  private useBrowserRecognition(): void {
    if (!browserRecognitionAvailable()) {
      this.set({
        error:
          "No speech recognition: set up BB's transcription service on the server, or use Chrome, Edge, or Safari.",
      });
      return;
    }
    this.transcriber = new BrowserTranscriber((text) => {
      if (this.snapshot.mode === "hearing" && text !== "") this.set({ heard: text });
    });
    this.transcriber.start();
  }

  stop(): void {
    this.cancelSpeech();
    this.transcriber?.stop();
    this.transcriber = null;
    this.teardown();
    this.set({ mode: "off", caption: null });
  }

  private teardown(): void {
    this.clearThinking();
    this.processor?.disconnect();
    if (this.processor !== null) this.processor.onaudioprocess = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.stream = null;
    this.processor = null;
    this.micAnalyser = null;
    this.outAnalyser = null;
    this.outGain = null;
    this.vad = null;
    this.preroll = [];
    this.utterance = null;
  }

  // ------------------------------------------------------------ listening --

  private onFrame(frame: Float32Array, prerollFrames: number): void {
    const vad = this.vad;
    if (vad === null) return;
    const talking = this.playing || this.queue.length > 0;
    const event = vad.push(rmsOf(frame), talking);

    if (this.utterance !== null) this.utterance.push(frame);
    else {
      this.preroll.push(frame);
      if (this.preroll.length > prerollFrames) this.preroll.shift();
    }

    if (event === "start") {
      if (talking) this.bargeIn();
      // Results arrive after speech, so nothing heard yet belongs to this
      // utterance; anything buffered is earlier noise.
      this.transcriber?.clear();
      this.transcriber?.resume();
      this.clearThinking();
      this.utterance = [...this.preroll];
      this.preroll = [];
      this.set({ mode: "hearing" });
    } else if (event === "end" || event === "discard") {
      const frames = this.utterance ?? [];
      this.utterance = null;
      if (event === "end") void this.send(frames);
      else {
        this.transcriber?.clear();
        this.settle();
      }
    }
  }

  /** The user talked over Jarvis: stop now, and drop the rest of that reply. */
  private bargeIn(): void {
    if (this.currentTurnId !== null) this.mutedTurns.add(this.currentTurnId);
    this.cancelSpeech();
    void this.bindings?.interrupt().catch(() => undefined);
  }

  private async send(frames: Float32Array[]): Promise<void> {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (this.snapshot.earcons && this.outGain !== null) playHeard(ctx, this.outGain);
    this.set({ mode: "sending" });
    try {
      let response: Response;
      if (this.transcriber !== null) {
        const text = await this.transcriber.take();
        if (text === "") {
          this.settle();
          return;
        }
        response = await fetch(`${ROUTE}/say`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      } else {
        const samples = downsample(concatFrames(frames), ctx.sampleRate);
        response = await fetch(`${ROUTE}/hear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: toBase64(encodeWav(samples)), mimeType: "audio/wav" }),
        });
      }
      const body = (await response.json().catch(() => ({}))) as { text?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
      const heard = typeof body.text === "string" ? body.text : "";
      if (heard === "") {
        this.settle();
        return;
      }
      this.set({ heard, error: null });
      if (this.snapshot.mode === "sending") {
        this.set({ mode: "thinking" });
        this.armThinking();
      }
    } catch (cause) {
      this.set({ error: cause instanceof Error ? cause.message : String(cause) });
      this.settle();
    }
  }

  // -------------------------------------------------------------- server --

  onBrainPhase(payload: PhasePayload): void {
    if (payload.phase === "thinking") {
      this.currentTurnId = payload.turnId;
      return;
    }
    if (this.snapshot.mode === "thinking" && !this.playing && this.queue.length === 0) {
      this.settle();
    }
  }

  onVisual(payload: VisualPayload): void {
    this.set({ visual: payload.markdown === null ? null : payload });
  }

  clearVisual(): void {
    this.set({ visual: null });
  }

  onSay(payload: SayPayload): void {
    const key = `${payload.turnId}:${payload.index}`;
    if (this.seen.has(key) || this.mutedTurns.has(payload.turnId)) return;
    this.seen.add(key);
    if (this.seen.size > 500) this.seen.clear();
    this.currentTurnId = payload.turnId;

    if (!this.active) {
      // No voice session in this window: caption only, at a speaking pace.
      const words = payload.speakable.split(/\s+/).length;
      this.set({
        caption: {
          text: payload.speakable,
          startedAt: performance.now(),
          durationMs: words * SILENT_MS_PER_WORD,
        },
      });
      return;
    }
    this.queue.push({ payload, audio: null });
    this.prefetch();
    if (!this.playing) void this.drain();
  }

  // ------------------------------------------------------------- speaking --

  private prefetch(): void {
    for (const item of this.queue.slice(0, PREFETCH + 1)) {
      item.audio ??= this.synthesize(item.payload.speakable);
    }
  }

  private async synthesize(text: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (ctx === null) return null;
    try {
      const response = await fetch(`${ROUTE}/tts?text=${encodeURIComponent(text)}`);
      if (!response.ok) throw new Error(`voice failed: HTTP ${response.status}`);
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (cause) {
      this.set({ error: cause instanceof Error ? cause.message : String(cause) });
      return null;
    }
  }

  private async drain(): Promise<void> {
    const generation = this.generation;
    this.playing = true;
    while (this.queue.length > 0 && generation === this.generation) {
      const item = this.queue.shift();
      if (item === undefined) break;
      this.prefetch();
      const { payload } = item;

      if (
        payload.announcement &&
        payload.turnId !== this.lastAnnouncedTurn &&
        this.snapshot.earcons &&
        this.ctx !== null &&
        this.outGain !== null
      ) {
        this.lastAnnouncedTurn = payload.turnId;
        await playAlert(this.ctx, this.outGain);
      }

      const buffer = await (item.audio ?? this.synthesize(payload.speakable));
      if (generation !== this.generation) break;
      this.clearThinking();
      // Recognition would transcribe the assistant's own voice.
      this.transcriber?.pause();
      this.set({ mode: "speaking" });

      const ctx = this.ctx;
      if (buffer === null || ctx === null || this.outGain === null) {
        // Voice unavailable: show the sentence for as long as it would take.
        const durationMs = payload.speakable.split(/\s+/).length * SILENT_MS_PER_WORD;
        this.set({ caption: { text: payload.speakable, startedAt: performance.now(), durationMs } });
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        continue;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outGain);
      this.source = source;
      const ended = new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
      source.start();
      this.set({
        caption: { text: payload.speakable, startedAt: performance.now(), durationMs: buffer.duration * 1000 },
      });
      await ended;
      this.source = null;
    }
    if (generation === this.generation) {
      this.playing = false;
      this.settle();
    }
  }

  /** Stops talking now and forgets everything queued. */
  cancelSpeech(): void {
    this.generation += 1;
    this.queue = [];
    this.playing = false;
    try {
      this.source?.stop();
    } catch {
      // Already stopped.
    }
    this.source = null;
  }

  /** The stop button: silence Jarvis without ending the session. */
  stopSpeaking(): void {
    this.bargeIn();
    this.settle();
  }

  /** Returns to listening once nothing is in flight. */
  private settle(): void {
    if (!this.active || this.playing || this.queue.length > 0) return;
    if (this.snapshot.mode === "hearing" || this.snapshot.mode === "sending") return;
    this.clearThinking();
    this.transcriber?.resume();
    this.set({ mode: "listening" });
  }

  private armThinking(): void {
    this.clearThinking();
    this.thinkingTimer = setTimeout(() => {
      this.thinkingTimer = null;
      if (this.snapshot.mode !== "thinking" || !this.snapshot.earcons) return;
      if (this.ctx !== null && this.outGain !== null) {
        this.stopThinking = startThinking(this.ctx, this.outGain);
      }
    }, THINKING_DELAY_MS);
  }

  private clearThinking(): void {
    if (this.thinkingTimer !== null) clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
    this.stopThinking?.();
    this.stopThinking = null;
  }
}

export const engine = new VoiceEngine();
