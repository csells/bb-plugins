// Jarvis's non-verbal sounds, synthesized with Web Audio so there are no assets.
//
// Three cues, each distinct enough to tell apart without looking:
//   heard     two soft rising notes, the instant the user stops talking
//   thinking  a quiet low pulse, only if the answer is slow to start
//   alert     three bright notes, before Jarvis interrupts with news
//
// Spoken filler ("on it") gets old by the third time; a tone does not.

const PEAK = 0.12;

function note(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  duration: number,
  peak = PEAK,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  // A fast attack and exponential release keep the tone from clicking.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function playHeard(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime + 0.01;
  note(ctx, destination, 660, now, 0.11);
  note(ctx, destination, 880, now + 0.09, 0.16);
}

/** Resolves when the alert has finished, so speech starts after it, not over it. */
export function playAlert(ctx: AudioContext, destination: AudioNode): Promise<void> {
  const now = ctx.currentTime + 0.01;
  note(ctx, destination, 988, now, 0.12, 0.1);
  note(ctx, destination, 740, now + 0.11, 0.12, 0.1);
  note(ctx, destination, 1175, now + 0.22, 0.22, 0.1);
  return new Promise((resolve) => setTimeout(resolve, 480));
}

/**
 * A soft pulse that runs until stopped. Returns the stop function, which fades
 * it out rather than cutting it off.
 */
export function startThinking(ctx: AudioContext, destination: AudioNode): () => void {
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const gain = ctx.createGain();
  const out = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 196;
  // The LFO swings the gain between 0 and 2x base, about once a second.
  lfo.frequency.value = 0.9;
  lfoDepth.gain.value = 0.025;
  gain.gain.value = 0.025;
  lfo.connect(lfoDepth).connect(gain.gain);
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.4);
  osc.connect(gain).connect(out).connect(destination);
  osc.start();
  lfo.start();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.stop(now + 0.3);
    lfo.stop(now + 0.3);
  };
}
