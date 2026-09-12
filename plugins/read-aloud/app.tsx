// bb-plugin-read-aloud — frontend entry.
//
// Two registrations:
//   messageAction           -> the speaker button in each message's action row,
//                              beside Copy message.
//   experimental_appOverlay -> a floating transport (seek / play / speed / stop)
//                              shown only while something is playing.
//
// messageAction is host-rendered chrome: `run` is a plain callback, not a
// component, so it cannot draw transport siblings of itself. Hence the split,
// and hence the module-level store below — `run` fires outside React and has to
// reach the overlay, which may mount, unmount, and remount underneath it.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  definePluginApp,
  useBbContext,
  useRealtime,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";

/** Routes are namespaced by plugin id; auth "local" accepts the BB app origin. */
const PLUGIN_ROUTE = "/api/v1/plugins/read-aloud/http";
const STOP_CHANNEL = "read-aloud/stop";
const SEEK_SECONDS = 10;

/**
 * Bytes per second of the 24kHz/48kbps stream the server produces, used to turn
 * a buffer target in seconds into a byte count.
 */
const STREAM_BYTES_PER_SECOND = 6000;
/**
 * Seconds of audio to hold before playback starts. Playing from the first
 * appended bytes is fine on localhost and stutters over a tunnel to a phone:
 * the buffer starts at zero, so the first jitter starves it.
 *
 * Measured against a stream that hesitates for 4s right after connecting:
 * with no cushion, playback starves once for 1.8s of dead silence
 * mid-sentence; with this cushion, it does not starve at all. The trade is
 * startup latency — synthesis outruns playback by roughly 4.75x, so at 1.5x
 * speed this delays first audio by about 1.3s. Silence up front reads as
 * loading; silence mid-sentence reads as broken.
 */
const PREBUFFER_SECONDS = 4;
/**
 * The service sends small frames. Appending each one individually means an
 * updateend round-trip per frame, and appendBuffer runs on the main thread —
 * exactly the thread that must stay free to keep the media pipeline fed.
 * Coalescing cuts that churn by roughly an order of magnitude.
 */
const APPEND_FLUSH_BYTES = 8192;
/**
 * Age at which a partial batch is appended anyway. Bounds how long audio can
 * sit in hand while the buffer runs down waiting for a batch to fill.
 */
const APPEND_FLUSH_MS = 200;

/**
 * Playback speed lives in localStorage, not plugin settings. Plugin settings
 * are server-side, global, and read once per load — wrong for a per-client
 * preference the user toggles mid-sentence. This persists instantly and per
 * device, which is what "remember my speed" actually means here.
 */
const RATE_KEY = "bb-read-aloud.playbackRate";
const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function loadRate(): number {
  try {
    const stored = Number(localStorage.getItem(RATE_KEY));
    // Only honor a value we actually offer, so a hand-edited key cannot
    // strand playback at 0.01x.
    if (RATE_PRESETS.some((preset) => preset === stored)) return stored;
  } catch {
    // localStorage can throw in restrictive contexts; fall through to default.
  }
  return 1;
}
function saveRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // Persisting is best-effort; playback still works this session.
  }
}

/**
 * "loading" is the initial prepare-and-connect wait; "buffering" is running out
 * of audio mid-stream because the next synth chunk has not landed yet. They
 * look the same to the user but differ in what the transport can do: there is
 * nothing to seek or pause before playback has ever started.
 */
type Status =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "error";

interface PlayerState {
  status: Status;
  /** Thread the audio belongs to, so switching away can stop it. */
  threadId: string | null;
  label: string;
  error: string | null;
  position: number;
  rate: number;
}

const IDLE: Omit<PlayerState, "rate"> = {
  status: "idle",
  threadId: null,
  label: "",
  error: null,
  position: 0,
};

let state: PlayerState = { ...IDLE, rate: 1 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getState(): PlayerState {
  return state;
}
function emit(): void {
  for (const listener of listeners) listener();
}
function setState(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  emit();
}

/**
 * Guards against a stale request finishing after a stop. Without it, pressing
 * Stop during /prepare lets the response arrive and start playing anyway.
 */
let generation = 0;

/** One element for the whole app, created lazily on first use. */
let audio: HTMLAudioElement | null = null;
/** Last whole second pushed to the store, so the clock re-renders once a second. */
let lastRenderedSecond = -1;

function ensureAudio(): HTMLAudioElement {
  if (audio !== null) return audio;
  const element = new Audio();
  element.preload = "none";
  // Without this, speeding up a voice raises its pitch.
  element.preservesPitch = true;

  // The clock renders mm:ss, so anything faster than once per second is a
  // re-render that produces identical output. timeupdate alone fires ~4x a
  // second and progress fires far more often; on a phone that main-thread
  // churn competes with appendBuffer.
  const syncProgress = () => {
    const whole = Math.floor(element.currentTime);
    if (whole === lastRenderedSecond) return;
    lastRenderedSecond = whole;
    setState({ position: element.currentTime });
  };

  element.addEventListener("playing", () => {
    setState({ status: "playing", error: null });
  });
  element.addEventListener("pause", () => {
    // Clearing src to stop also fires "pause". Only a pause on a still-loaded
    // element is a real pause; otherwise stop() already set the state.
    if (element.getAttribute("src") !== null && !element.ended) {
      setState({ status: "paused" });
    }
  });
  element.addEventListener("ended", () => {
    stop();
  });
  // Starved mid-stream. Distinct from a user pause (paused stays false) and
  // from the initial load, so only promote an already-running playback —
  // "waiting" also fires before the first frame and right after a seek.
  const onStarved = () => {
    if (element.getAttribute("src") === null) return;
    if (getState().status === "playing") setState({ status: "buffering" });
  };
  element.addEventListener("waiting", onStarved);
  element.addEventListener("stalled", onStarved);
  element.addEventListener("timeupdate", syncProgress);
  element.addEventListener("error", () => {
    // A cleared src reports MEDIA_ELEMENT_ERROR; that is our own teardown.
    if (element.getAttribute("src") === null) return;
    setState({
      status: "error",
      error: "Playback failed. Check `bb read-aloud status`.",
    });
  });
  audio = element;
  return element;
}

/** Aborts the in-flight synthesis request. */
let inFlight: AbortController | null = null;
/** Object URL backing the MediaSource, revoked on stop. */
let objectUrl: string | null = null;

const MSE_MIME = "audio/mpeg";
function canUseMediaSource(): boolean {
  return (
    typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(MSE_MIME)
  );
}

/**
 * Feeds the response into a MediaSource instead of assigning it as src.
 *
 * This exists for seeking. Pointed straight at a chunked response the browser
 * treats it as live: it throttles reads to ~2s ahead of the playhead and
 * reports `seekable` as [0, Infinity], so a 10-second jump either moves about
 * two seconds or sails past the received audio and resets to zero. Appending
 * every byte we receive makes `buffered` mean what it says — and since
 * synthesis runs several times faster than playback, it runs far ahead — so a
 * jump lands exactly and the true edge is knowable.
 */
async function feedViaMediaSource(
  element: HTMLAudioElement,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  const mediaSource = new MediaSource();
  objectUrl = URL.createObjectURL(mediaSource);
  element.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", () => { resolve(); }, { once: true });
    mediaSource.addEventListener("error", () => { reject(new Error("MediaSource failed")); }, {
      once: true,
    });
  });
  if (signal.aborted) return;

  const buffer = mediaSource.addSourceBuffer(MSE_MIME);
  // A SourceBuffer accepts one append at a time; queue behind updateend.
  const appended = (chunk: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      const onDone = () => {
        buffer.removeEventListener("updateend", onDone);
        buffer.removeEventListener("error", onFail);
        resolve();
      };
      const onFail = () => {
        buffer.removeEventListener("updateend", onDone);
        buffer.removeEventListener("error", onFail);
        reject(new Error("append failed"));
      };
      buffer.addEventListener("updateend", onDone, { once: true });
      buffer.addEventListener("error", onFail, { once: true });
      buffer.appendBuffer(chunk as unknown as BufferSource);
    });

  const response = await fetch(url, { signal });
  if (!response.ok || response.body === null) {
    throw new Error(`stream failed (${response.status})`);
  }
  const reader = response.body.getReader();

  // Resolved once there is enough audio to start on, or when the stream ends
  // first — a two-second message must not wait for a four-second cushion.
  // The Promise executor runs synchronously, so this is assigned before any
  // caller can reach it — no placeholder body needed.
  let releasePlayback!: () => void;
  const ready = new Promise<void>((resolve) => {
    releasePlayback = resolve;
  });

  // Playing faster drains the cushion faster, so ask for proportionally more.
  const target =
    PREBUFFER_SECONDS * STREAM_BYTES_PER_SECOND * Math.max(1, state.rate);
  let appendedBytes = 0;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let lastAppendAt = Date.now();

  const flush = async () => {
    if (pendingBytes === 0) return;
    const batch = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const part of pending) {
      batch.set(part, offset);
      offset += part.length;
    }
    pending = [];
    pendingBytes = 0;
    lastAppendAt = Date.now();
    await appended(batch);
    appendedBytes += batch.length;
    if (appendedBytes >= target) releasePlayback();
  };

  // Drive the read loop without blocking the caller: the prebuffer gate below
  // decides when playback starts, not the end of synthesis.
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;
        if (value.length > 0) {
          pending.push(value);
          pendingBytes += value.length;
          // Batching keeps appendBuffer off the main thread on a phone, but a
          // size-only threshold withholds up to a batch of audio for as long
          // as the bytes keep trickling — worst at a synthesis seam, which is
          // exactly when the cushion can least afford it. Age is the second
          // trigger, so a lull flushes what is already in hand.
          if (
            pendingBytes >= APPEND_FLUSH_BYTES ||
            Date.now() - lastAppendAt >= APPEND_FLUSH_MS
          ) {
            await flush();
          }
        }
      }
      await flush();
      if (!signal.aborted && mediaSource.readyState === "open") {
        // Sets a finite duration, which makes the whole timeline seekable.
        mediaSource.endOfStream();
      }
      // Short message, or the stream ended before the cushion filled.
      releasePlayback();
    } catch (cause) {
      releasePlayback();
      // A user abort is the expected way out; anything else means the rest of
      // the message will never be spoken. Left silent — as this was — playback
      // drains the buffer and stalls on "waiting" forever, which reads as the
      // reader simply stopping partway with no explanation.
      if (signal.aborted) return;
      setState({
        status: "error",
        error:
          cause instanceof Error
            ? `Playback stopped early: ${cause.message}`
            : "Playback stopped early.",
      });
    }
  })();

  // Hold the caller — and therefore play() — until there is a cushion. The
  // pill stays on "Preparing" a moment longer in exchange for not starving
  // three seconds in.
  await ready;
}

/**
 * Stops playback and tears down the request, which runs the server stream's
 * cancel() and closes the synthesis socket — so stopping a long read costs
 * nothing rather than letting it finish unheard.
 */
function stop(): void {
  generation += 1;
  lastRenderedSecond = -1;
  inFlight?.abort();
  inFlight = null;
  const element = audio;
  if (element !== null) {
    element.pause();
    element.removeAttribute("src");
    element.load();
  }
  if (objectUrl !== null) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  state = { ...IDLE, rate: state.rate };
  emit();
}

function pause(): void {
  audio?.pause();
}

function resume(): void {
  void audio?.play().catch(() => {
    setState({ status: "error", error: "Could not resume playback." });
  });
}

/**
 * Seeks relative to the playhead, clamped to audio actually received.
 *
 * `seekable` is the wrong ceiling: on an unbounded stream it reports
 * [0, Infinity], so a jump past the received audio does not wait for data — the
 * element resets to zero, which reads as the player wrapping to the start.
 * `buffered` is the honest edge, and because MediaSource is fed every byte as
 * it arrives while synthesis outruns playback several times over, it sits well
 * ahead of the playhead.
 *
 * Landing exactly on that edge starves playback, which surfaces as the
 * "Preparing" state until more audio lands — the right answer for "I fast
 * forwarded past what exists yet".
 */
function seekBy(delta: number): void {
  const element = audio;
  if (element === null) return;
  const bufferedEnd =
    element.buffered.length > 0
      ? element.buffered.end(element.buffered.length - 1)
      : element.currentTime;
  const target = Math.max(
    0,
    Math.min(element.currentTime + delta, bufferedEnd),
  );
  try {
    element.currentTime = target;
    setState({ position: target });
  } catch {
    // Some states reject a seek outright; leave playback untouched.
  }
}

function cycleRate(): void {
  const index = RATE_PRESETS.indexOf(
    state.rate as (typeof RATE_PRESETS)[number],
  );
  const next = RATE_PRESETS[(index + 1) % RATE_PRESETS.length] ?? 1;
  if (audio !== null) audio.playbackRate = next;
  saveRate(next);
  setState({ rate: next });
}

async function speak(input: {
  threadId: string;
  text: string;
  label: string;
}): Promise<void> {
  stop();
  const mine = ++generation;
  setState({
    status: "loading",
    threadId: input.threadId,
    label: input.label,
    error: null,
    position: 0,
  });

  try {
    const response = await fetch(`${PLUGIN_ROUTE}/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(detail.error ?? `prepare failed (${response.status})`);
    }
    const { id } = (await response.json()) as { id: string };
    if (mine !== generation) return; // Stopped while preparing.

    const element = ensureAudio();
    const url = `${PLUGIN_ROUTE}/stream?id=${encodeURIComponent(id)}`;
    const controller = new AbortController();
    inFlight = controller;

    if (canUseMediaSource()) {
      await feedViaMediaSource(element, url, controller.signal);
    } else {
      // Fallback for engines without MSE for mp3: playback works, but the
      // browser buffers barely ahead, so a 10-second jump moves less.
      element.src = url;
    }
    if (mine !== generation) return; // Stopped while connecting.

    // Apply the stored preference before play(), including on a fresh element.
    element.playbackRate = state.rate;
    await element.play();
  } catch (cause) {
    if (mine !== generation) return;
    setState({
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The same mark as assets/speaker.svg, which is this plugin's manifest icon and
 * therefore the glyph BB draws on the message action button. Kept inline and in
 * sync deliberately: the pill's status icon has to read as "this is the read
 * aloud thing", not as a second play button competing with the real one.
 *
 * Both hand-drawn glyphs here carry `data-icon`, the marker bb's Icon component
 * puts on every glyph it draws. Anything that finds bb's icons by that marker
 * (the Fat Fingers plugin, a theme) then treats these the same as the Pause and
 * Stop glyphs beside them, instead of scaling two of the five and not the rest.
 */
function SpeakerGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      data-icon="read-aloud-speaker"
    >
      <path d="M13 4.5a1 1 0 0 0-1.7-.7L7.2 8H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 16h3.2l4.1 4.2a1 1 0 0 0 1.7-.7v-15z" />
      <path d="M16.2 8.3a1 1 0 0 1 1.4 0 5.5 5.5 0 0 1 0 7.4 1 1 0 0 1-1.4-1.4 3.5 3.5 0 0 0 0-4.6 1 1 0 0 1 0-1.4z" />
      <path d="M19.1 5.4a1 1 0 0 1 1.4 0 9.5 9.5 0 0 1 0 13.2 1 1 0 0 1-1.4-1.4 7.5 7.5 0 0 0 0-10.4 1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

/** Circular arrow with the jump size inside it, mirrored for forward. */
function SeekGlyph({ forward }: { forward: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-full", forward && "-scale-x-100")}
      fill="none"
      aria-hidden
      data-icon={forward ? "read-aloud-seek-forward" : "read-aloud-seek-back"}
    >
      <path
        d="M12 5.2a6.8 6.8 0 1 0 6.6 8.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 2.4v5.6h5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="11.6"
        y="16.6"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="650"
        fill="currentColor"
        stroke="none"
        // Counter-mirror so "10" stays readable on the forward button.
        transform={forward ? "translate(23.2,0) scale(-1,1)" : undefined}
      >
        10
      </text>
    </svg>
  );
}

function TransportButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS,
        "flex shrink-0 items-center justify-center",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}

/** The floating transport. Renders nothing unless audio is active. */
function ReadAloudPlayer() {
  const player = useSyncExternalStore(subscribe, getState, getState);
  const { threadId } = useBbContext();

  // Apply the stored speed once, before anything plays.
  useEffect(() => {
    const stored = loadRate();
    if (stored !== getState().rate) setState({ rate: stored });
  }, []);

  // Auto-stop on navigating away from the thread being read.
  useEffect(() => {
    if (player.threadId === null) return;
    if (threadId !== null && threadId !== player.threadId) stop();
  }, [threadId, player.threadId]);

  // Auto-stop when a new prompt starts this thread running. The server
  // publishes on thread.active; we only care about the thread we are reading.
  useRealtime(STOP_CHANNEL, (payload) => {
    const signal = payload as { threadId?: unknown } | null;
    const target =
      signal !== null && typeof signal.threadId === "string"
        ? signal.threadId
        : null;
    if (target !== null && target === getState().threadId) stop();
  });

  if (player.status === "idle") return null;

  const isError = player.status === "error";
  // Nothing to seek or pause until playback has started at least once.
  const isPreparing = player.status === "loading";
  // Both waits show the spinner and the "Preparing" copy.
  const isBusy = isPreparing || player.status === "buffering";

  return (
    <div
      className={cn(
        "pointer-events-auto fixed left-1/2 z-50 -translate-x-1/2",
        // Clear the composer on phones, and never sit under the home bar.
        "bottom-[max(1rem,env(safe-area-inset-bottom))]",
        "max-md:bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
        "max-w-[calc(100vw-1.5rem)]",
        "bg-popover text-popover-foreground flex items-center gap-0.5",
        "rounded-full border py-1.5 pr-1.5 pl-3 shadow-lg",
      )}
      role="status"
      aria-live="polite"
    >
      {isBusy ? (
        <Icon
          name="Loading"
          className="text-muted-foreground mr-1 size-3.5 shrink-0 animate-spin"
          aria-hidden
        />
      ) : (
        <SpeakerGlyph
          className={cn(
            "mr-1 size-3.5 shrink-0",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        />
      )}

      {/* The label is the first thing to go on a narrow screen. */}
      <span
        className={cn(
          "mr-1 truncate text-xs",
          isError ? "max-w-[16rem]" : "hidden max-w-[14rem] sm:inline",
        )}
      >
        {isError
          ? (player.error ?? "Playback failed")
          : isBusy
            ? `Preparing ${player.label}…`
            : `Reading ${player.label}`}
      </span>

      {!isError && (
        <>
          {/* Keep the clock while buffering: the position is still meaningful. */}
          {!isPreparing && (
            <span className="text-muted-foreground mr-0.5 shrink-0 text-xs tabular-nums">
              {formatClock(player.position)}
            </span>
          )}

          <TransportButton
            onClick={() => { seekBy(-SEEK_SECONDS); }}
            label="Back 10 seconds"
            disabled={isPreparing}
          >
            <span className="size-4 max-md:pointer-coarse:size-5">
              <SeekGlyph forward={false} />
            </span>
          </TransportButton>

          {player.status === "paused" ? (
            <TransportButton onClick={resume} label="Resume">
              <Icon
                name="Play"
                className="size-4 max-md:pointer-coarse:size-5"
                aria-hidden
              />
            </TransportButton>
          ) : (
            <TransportButton
              onClick={pause}
              label="Pause"
              disabled={isPreparing}
            >
              <Icon
                name="Pause"
                className="size-4 max-md:pointer-coarse:size-5"
                aria-hidden
              />
            </TransportButton>
          )}

          <TransportButton
            onClick={() => { seekBy(SEEK_SECONDS); }}
            label="Forward 10 seconds"
            disabled={isPreparing}
          >
            <span className="size-4 max-md:pointer-coarse:size-5">
              <SeekGlyph forward />
            </span>
          </TransportButton>

          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${player.rate}x, tap to change`}
            title="Playback speed"
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "focus-visible:ring-ring shrink-0 rounded-md transition-colors",
              "focus-visible:ring-2 focus-visible:outline-none",
              "h-7 min-w-9 px-1 text-xs font-medium tabular-nums",
              "max-md:pointer-coarse:h-9 max-md:pointer-coarse:min-w-11 max-md:pointer-coarse:text-sm",
            )}
          >
            {player.rate}×
          </button>
        </>
      )}

      <TransportButton onClick={stop} label={isError ? "Dismiss" : "Stop"}>
        <Icon
          name="Square"
          className="size-4 max-md:pointer-coarse:size-5"
          aria-hidden
        />
      </TransportButton>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageAction({
    id: "read-aloud",
    title: "Read aloud",
    run: ({ threadId, message, selectedText }) => {
      // Invoked from the selection menu, read only what is highlighted.
      const selection = selectedText?.trim() ?? "";
      const text = selection !== "" ? selection : message.text;
      const label =
        selection !== ""
          ? "selection"
          : message.role === "assistant"
            ? "assistant message"
            : "your message";
      void speak({ threadId, text, label });
    },
  });

  app.slots.experimental_appOverlay({
    id: "read-aloud-player",
    component: ReadAloudPlayer,
  });
});
