import { afterEach, describe, expect, it, vi } from "vitest";
import { audioResponse, ClipStore } from "./clips";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const synthesis = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./synth", async (importOriginal) => ({
  ...await importOriginal<typeof import("./synth")>(),
  synthesize: async function* () {
    synthesis.calls += 1;
    yield new Uint8Array([10, 20, 30, 40, 50, 60]);
  },
}));

afterEach(() => { vi.useRealTimers(); });

describe("finite audio routes", () => {
  it("serves Safari's repeated ranges without losing the job or generating audio twice", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "read-aloud" });
    await plugin(bb);
    try {
      const prepared = await harness.behavior.fetchHttp("POST", "/prepare-clips", {
        body: JSON.stringify({ text: "Read this sentence." }),
        headers: { "content-type": "application/json" },
      });
      const job = await prepared.json() as { id: string; sections: number };
      expect(job.sections).toBe(1);
      const before = synthesis.calls;
      const first = await harness.behavior.fetchHttp("GET", `/clip?id=${job.id}&index=0`, {
        headers: { Range: "bytes=0-1" },
      });
      expect(first.status).toBe(206);
      expect(first.headers.get("Content-Range")).toBe("bytes 0-1/6");
      expect(first.headers.get("Content-Length")).toBe("2");
      expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([10, 20]);
      const rest = await harness.behavior.fetchHttp("GET", `/clip?id=${job.id}&index=0`, {
        headers: { Range: "bytes=2-" },
      });
      expect(rest.status).toBe(206);
      expect([...new Uint8Array(await rest.arrayBuffer())]).toEqual([30, 40, 50, 60]);
      expect(synthesis.calls - before).toBe(1);
      await harness.behavior.fetchHttp("DELETE", `/clips?id=${job.id}`);
      const stopped = await harness.behavior.fetchHttp("GET", `/clip?id=${job.id}&index=0`);
      expect(stopped.status).toBe(404);
    } finally { await harness.lifecycle.dispose(); }
  });

  it("bounds input and rejects an invalid section before synthesis", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "read-aloud" });
    await plugin(bb);
    try {
      const response = await harness.behavior.fetchHttp("POST", "/prepare-clips", {
        body: JSON.stringify({ text: "a".repeat(50_001) }),
        headers: { "content-type": "application/json" },
      });
      expect(response.status).toBe(400);
      expect((await harness.behavior.fetchHttp("GET", "/clip?id=x&index=-1")).status).toBe(400);
    } finally { await harness.lifecycle.dispose(); }
  });
});

describe("audio ranges", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  it("honors suffix ranges and clamps an oversized end", async () => {
    expect([...new Uint8Array(await audioResponse(bytes, "bytes=-2").arrayBuffer())]).toEqual([3, 4]);
    expect(audioResponse(bytes, "bytes=1-999").headers.get("Content-Range")).toBe("bytes 1-3/4");
  });
  it("returns 416 for impossible ranges and full content for unsupported forms", () => {
    for (const range of ["bytes=4-", "bytes=2-1", "bytes=-0"]) {
      const response = audioResponse(bytes, range);
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */4");
    }
    expect(audioResponse(bytes, "bytes=0-1,2-3").status).toBe(200);
  });
});

describe("clip lifecycle", () => {
  it("shares overlapping requests and aborts synthesis when stopped", async () => {
    let calls = 0;
    let signal: AbortSignal | undefined;
    const store = new ClipStore(async function* (options) {
      calls += 1;
      signal = options.signal;
      await new Promise<void>((resolve) => { options.signal?.addEventListener("abort", () => { resolve(); }, { once: true }); });
      yield new Uint8Array([1]);
    });
    const id = store.prepare(["hello"], "voice", "");
    const first = store.get(id, 0);
    const second = store.get(id, 0);
    const results = Promise.allSettled([first, second]);
    store.cancel(id);
    expect(signal?.aborted).toBe(true);
    expect((await results).every((result) => result.status === "rejected")).toBe(true);
    expect(calls).toBe(1);
    await expect(store.get(id, 0)).rejects.toMatchObject({ status: 404 });
  });

  it("turns a stalled synthesis into a timeout and leaves it retryable", async () => {
    vi.useFakeTimers();
    const store = new ClipStore(async function* (options) {
      await new Promise<void>((resolve) => { options.signal?.addEventListener("abort", () => { resolve(); }, { once: true }); });
      yield new Uint8Array([1]);
    });
    const id = store.prepare(["hello"], "voice", "");
    const pending = store.get(id, 0);
    const rejected = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    store.dispose();
  });

  it("expires idle jobs, keeps touched jobs, and bounds concurrent readers", async () => {
    let now = 0;
    const store = new ClipStore(async function* () { yield new Uint8Array([1]); }, () => now);
    const idle = store.prepare(["hello"], "voice", "");
    const active = store.prepare(["hello"], "voice", "");
    now = 15 * 60_000;
    await store.get(active, 0);
    now = 21 * 60_000;
    store.sweep();
    await expect(store.get(idle, 0)).rejects.toMatchObject({ status: 404 });
    await expect(store.get(active, 0)).resolves.toEqual(new Uint8Array([1]));
    for (let i = 0; i < 7; i += 1) store.prepare(["hello"], "voice", "");
    expect(() => store.prepare(["hello"], "voice", "")).toThrow("Too many active reads");
    store.dispose();
  });
});
