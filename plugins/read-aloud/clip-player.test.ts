import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipPlayer, unlockAudio } from "./clip-player";

class FakeAudio extends EventTarget {
  src = "";
  duration = 2;
  currentTime = 0;
  play = vi.fn(() => { this.dispatchEvent(new Event("loadedmetadata")); return Promise.resolve(); });
}
function setup(options: { fetchAudio?: typeof fetch; denied?: boolean } = {}) {
  const audio = new FakeAudio();
  if (options.denied === true) audio.play.mockRejectedValue(new DOMException("Tap to play", "NotAllowedError"));
  const statuses: string[] = [];
  const onEnd = vi.fn();
  const controller = new AbortController();
  const fetchAudio = options.fetchAudio ?? vi.fn(async () => new Response(new Uint8Array(12_000), {
    headers: { "Content-Type": "audio/mpeg" },
  }));
  let sequence = 0;
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => `blob:${++sequence}`), revokeObjectURL: vi.fn() });
  const player = new ClipPlayer({
    audio: audio as unknown as HTMLAudioElement, urls: ["/one", "/two", "/three", "/four"],
    signal: controller.signal, onStatus: (status) => { statuses.push(status); }, onEnd, fetchAudio,
  });
  return { audio, player, statuses, onEnd, controller, fetchAudio };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("iOS playback", () => {
  it("authorizes audio synchronously in the gesture, before any fetch", () => {
    const audio = new FakeAudio();
    unlockAudio(audio as unknown as HTMLAudioElement);
    expect(audio.src).toMatch(/^data:audio\/wav/);
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("shows a Play state when iOS blocks autoplay, instead of waiting forever", async () => {
    const { player, statuses } = setup({ denied: true });
    await player.start();
    expect(statuses.at(-1)).toBe("ready");
    expect(statuses).not.toContain("error");
    player.dispose();
  });

  it("plays sections in order, starts before the full message, and completes once", async () => {
    const { audio, player, onEnd, fetchAudio } = setup();
    await player.start();
    expect(fetchAudio).toHaveBeenCalledTimes(3);
    expect(audio.src).toBe("blob:1");
    audio.currentTime = 2;
    audio.dispatchEvent(new Event("ended"));
    await vi.waitFor(() => { expect(audio.src).toBe("blob:2"); });
    audio.currentTime = 0.5;
    expect(player.position()).toBe(2.5);
    player.seekBy(-1);
    await vi.waitFor(() => { expect(audio.currentTime).toBe(1.5); });
    // End the returned-to section, then each remaining section.
    for (let i = 0; i < 4; i += 1) {
      audio.dispatchEvent(new Event("ended"));
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    expect(onEnd).toHaveBeenCalledOnce();
    player.dispose();
  });

  it("stopping during preparation cannot resurrect playback or leak a blob", async () => {
    let release!: (response: Response) => void;
    const fetching = new Promise<Response>((resolve) => { release = resolve; });
    const { audio, player, controller, statuses } = setup({ fetchAudio: vi.fn(() => fetching) });
    const pending = player.start();
    controller.abort();
    player.dispose();
    release(new Response(new Uint8Array([1, 2])));
    await pending;
    expect(audio.play).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- stubbed static function, no receiver
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(statuses).toEqual(["loading"]);
  });

  it("surfaces a stalled audio download as an error", async () => {
    vi.useFakeTimers();
    const fetchAudio = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    })) as unknown as typeof fetch;
    const { player, statuses } = setup({ fetchAudio });
    const pending = player.start();
    await vi.advanceTimersByTimeAsync(35_000);
    await pending;
    expect(statuses.at(-1)).toBe("error");
    player.dispose();
  });
});
