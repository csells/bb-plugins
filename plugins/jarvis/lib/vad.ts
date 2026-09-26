// Voice activity detection: deciding when the user started and stopped talking.
//
// Energy-based against an adaptive noise floor, which is crude next to a neural
// VAD but needs no model download and runs on one number per frame. Two
// thresholds matter:
//
//   normal    Jarvis is quiet; any clear speech starts an utterance.
//   barge-in  Jarvis is talking. Echo cancellation removes most of Jarvis's own voice
//             from the mic, but not all of it, so speech must be louder and
//             last longer before it counts as the user interrupting. Without
//             this, Jarvis cuts itself off mid-sentence.

export interface VadOptions {
  /** Duration of one frame. */
  frameMs: number;
  /** Speech this long starts an utterance while Jarvis is quiet. */
  onsetMs?: number;
  /** Speech this long interrupts Jarvis while it is talking. */
  bargeOnsetMs?: number;
  /** Silence this long ends an utterance. */
  hangoverMs?: number;
  /** Utterances shorter than this are coughs and clicks, not words. */
  minSpeechMs?: number;
  /** Utterances are cut off at this length. */
  maxSpeechMs?: number;
}

export type VadEvent = "start" | "end" | "discard" | null;

/** Speech must be this many times the noise floor, and at least the absolute minimum. */
const RATIO = 3;
const ABS_MIN = 0.012;
const BARGE_RATIO = 6;
const BARGE_ABS_MIN = 0.03;
const INITIAL_FLOOR = 0.008;
const FLOOR_MIN = 0.002;

export class VoiceActivityDetector {
  private readonly frameMs: number;
  private readonly onsetFrames: number;
  private readonly bargeOnsetFrames: number;
  private readonly hangoverFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxSpeechFrames: number;

  private floor = INITIAL_FLOOR;
  private loudRun = 0;
  private quietRun = 0;
  private speechFrames = 0;
  private active = false;

  constructor(options: VadOptions) {
    const frames = (ms: number) => Math.max(1, Math.round(ms / options.frameMs));
    this.frameMs = options.frameMs;
    this.onsetFrames = frames(options.onsetMs ?? 120);
    this.bargeOnsetFrames = frames(options.bargeOnsetMs ?? 280);
    this.hangoverFrames = frames(options.hangoverMs ?? 750);
    this.minSpeechFrames = frames(options.minSpeechMs ?? 300);
    this.maxSpeechFrames = frames(options.maxSpeechMs ?? 30_000);
  }

  /** True between "start" and "end"/"discard". */
  get inSpeech(): boolean {
    return this.active;
  }

  /** How many frames of audio before "start" belong to the utterance. */
  get onsetLengthFrames(): number {
    return Math.max(this.onsetFrames, this.bargeOnsetFrames);
  }

  get noiseFloor(): number {
    return this.floor;
  }

  /**
   * Feeds one frame's RMS level. `elisTalking` selects the barge-in threshold.
   * Returns what changed, if anything.
   */
  push(rms: number, elisTalking: boolean): VadEvent {
    const loud = elisTalking
      ? rms > Math.max(this.floor * BARGE_RATIO, BARGE_ABS_MIN)
      : rms > Math.max(this.floor * RATIO, ABS_MIN);

    if (!this.active) {
      this.loudRun = loud ? this.loudRun + 1 : 0;
      // The floor only learns from what is not speech. It falls quickly and
      // rises slowly, so a door slam does not deafen it for a minute.
      if (!loud) {
        const rate = rms < this.floor ? 0.1 : 0.01;
        this.floor = Math.max(FLOOR_MIN, this.floor + (rms - this.floor) * rate);
      }
      const needed = elisTalking ? this.bargeOnsetFrames : this.onsetFrames;
      if (this.loudRun >= needed) {
        this.active = true;
        this.speechFrames = this.loudRun;
        this.quietRun = 0;
        return "start";
      }
      return null;
    }

    this.speechFrames += 1;
    this.quietRun = loud ? 0 : this.quietRun + 1;
    if (this.quietRun >= this.hangoverFrames || this.speechFrames >= this.maxSpeechFrames) {
      this.active = false;
      this.loudRun = 0;
      const spoken = this.speechFrames - this.quietRun;
      this.speechFrames = 0;
      this.quietRun = 0;
      return spoken >= this.minSpeechFrames ? "end" : "discard";
    }
    return null;
  }

  /** Abandons an utterance in progress, e.g. when the session stops. */
  reset(): void {
    this.active = false;
    this.loudRun = 0;
    this.quietRun = 0;
    this.speechFrames = 0;
  }

  /** Milliseconds per frame, for callers sizing buffers. */
  get frameDurationMs(): number {
    return this.frameMs;
  }
}

/** Root-mean-square level of one frame of samples. */
export function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}
