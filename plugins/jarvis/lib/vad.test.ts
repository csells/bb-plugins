import { describe, expect, it } from "vitest";
import { rmsOf, VoiceActivityDetector } from "./vad";
import { downsample, encodeWav } from "./wav";

const FRAME_MS = 40;
const QUIET = 0.004;
const SPEECH = 0.08;
/** Loud enough to count normally, not loud enough to barge in over Jarvis. */
const ECHO = 0.025;

function run(vad: VoiceActivityDetector, level: number, ms: number, talking = false) {
  const events: string[] = [];
  for (let at = 0; at < ms; at += FRAME_MS) {
    const event = vad.push(level, talking);
    if (event !== null) events.push(event);
  }
  return events;
}

describe("VoiceActivityDetector", () => {
  it("brackets an utterance with start and end", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    expect(run(vad, QUIET, 1000)).toEqual([]);
    expect(run(vad, SPEECH, 1200)).toEqual(["start"]);
    expect(run(vad, QUIET, 1000)).toEqual(["end"]);
  });

  it("discards a blip too short to be words", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    run(vad, QUIET, 1000);
    expect([...run(vad, SPEECH, 160), ...run(vad, QUIET, 1000)]).toEqual(["start", "discard"]);
  });

  it("rides through the short pauses between words", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    run(vad, QUIET, 1000);
    const events = [
      ...run(vad, SPEECH, 600),
      ...run(vad, QUIET, 400),
      ...run(vad, SPEECH, 600),
      ...run(vad, QUIET, 1000),
    ];
    expect(events).toEqual(["start", "end"]);
  });

  it("ignores leaked echo of Jarvis's own voice while Jarvis is talking", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    run(vad, QUIET, 1000);
    expect(run(vad, ECHO, 2000, true)).toEqual([]);
  });

  it("still lets the user barge in over Jarvis", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    run(vad, QUIET, 1000);
    expect(run(vad, SPEECH, 600, true)).toEqual(["start"]);
  });

  it("adapts to a noisier room instead of hearing it as speech", () => {
    const vad = new VoiceActivityDetector({ frameMs: FRAME_MS });
    // A fan that ramps up slowly never trips it.
    for (let level = QUIET; level < 0.03; level *= 1.02) {
      expect(vad.push(level, false)).toBeNull();
    }
    expect(vad.noiseFloor).toBeGreaterThan(0.01);
  });
});

describe("wav", () => {
  it("measures level as root mean square", () => {
    expect(rmsOf(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });

  it("downsamples 48 kHz to 16 kHz by three", () => {
    expect(downsample(new Float32Array(4800), 48_000).length).toBe(1600);
  });

  it("writes a valid 16-bit mono header", () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1]));
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});
