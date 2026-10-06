import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sockets: [] as MockSocket[], autoOpen: true }));
class MockSocket extends EventEmitter {
  binaryType = "";
  sent: string[] = [];
  open = false;
  readonly options: unknown;
  constructor(_url: string, options: unknown) {
    super();
    this.options = options;
    state.sockets.push(this);
    if (state.autoOpen) queueMicrotask(() => { this.open = true; this.emit("open"); });
  }
  send(text: string): void { this.sent.push(text); }
  close(): void { this.emit("close"); }
  terminate(): void {
    if (!this.open) this.emit("error", new Error("Handshake aborted"));
    this.emit("close");
  }
}
vi.mock("ws", () => ({ default: MockSocket }));

beforeEach(() => { state.sockets.length = 0; state.autoOpen = true; });
afterEach(() => { vi.useRealTimers(); });

describe("speech socket failures", () => {
  it("cancel during connection closes the socket without trying another version", async () => {
    state.autoOpen = false;
    const { synthesize } = await import("./synth");
    const controller = new AbortController();
    const iterator = synthesize({ text: "hello", voice: "voice", signal: controller.signal });
    const pending = iterator.next();
    const rejected = expect(pending).rejects.toThrow("aborted");
    controller.abort();
    await rejected;
    expect(state.sockets).toHaveLength(1);
  });

  it("a closed socket cannot masquerade as a completed MP3 section", async () => {
    const { synthesize } = await import("./synth");
    const iterator = synthesize({ text: "hello", voice: "voice" });
    const pending = iterator.next();
    const rejected = expect(pending).rejects.toThrow("before the audio finished");
    await vi.waitFor(() => { expect(state.sockets[0]?.sent).toHaveLength(2); });
    state.sockets[0]!.emit("close");
    await rejected;
  });

  it("a silent established socket times out instead of leaving playback spinning", async () => {
    vi.useFakeTimers();
    const { synthesize } = await import("./synth");
    const iterator = synthesize({ text: "hello", voice: "voice" });
    const pending = iterator.next();
    const rejected = expect(pending).rejects.toThrow("stopped responding");
    await vi.advanceTimersByTimeAsync(20_001);
    await rejected;
  });
});
