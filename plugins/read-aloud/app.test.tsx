// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

vi.mock("@/components/ui/icon", () => ({ Icon: () => <span /> }));

class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  duration = 2;
  ended = false;
  preservesPitch = true;
  preload = "";
  playbackRate = 1;
  denyNext = true;
  play(): Promise<void> {
    if (this.src.startsWith("blob:") && this.denyNext) {
      this.denyNext = false;
      return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
    }
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  pause(): void { this.dispatchEvent(new Event("pause")); }
  getAttribute(): string | null { return this.src || null; }
  removeAttribute(): void { this.src = ""; }
  load(): void { /* Browser teardown fixture. */ }
}

afterEach(() => { vi.unstubAllGlobals(); });

it("the message action exposes Play after gesture denial, resumes, then Stop cancels the job", async () => {
  const created: FakeAudio[] = [];
  vi.stubGlobal("Audio", class extends FakeAudio { constructor() { super(); created.push(this); } });
  vi.stubGlobal("MediaSource", undefined);
  let sequence = 0;
  vi.stubGlobal("URL", { createObjectURL: () => `blob:${++sequence}`, revokeObjectURL: () => { /* fixture */ } });
  const fetching = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      if (new Headers(init.headers).get("Content-Type") !== "application/json") return new Response("JSON required", { status: 415 });
      return new Response(JSON.stringify({ stopped: true }));
    }
    if (typeof input === "string" && input.includes("prepare-clips")) return new Response(JSON.stringify({ id: "job1", sections: 2 }));
    return new Response(new Uint8Array(12_000), { headers: { "Content-Type": "audio/mpeg" } });
  });
  vi.stubGlobal("fetch", fetching);
  const app = await loadPluginApp(() => import("./app"));
  const player = renderSlot(app.appOverlays[0]!, {}, { context: { threadId: "t1", projectId: null } });
  try {
    await act(async () => {
      await app.messageActions[0]!.run({
        threadId: "t1", message: { id: "m1", threadId: "t1", role: "assistant", text: "Read me.", sourceSeqEnd: 1 },
        openPanel: () => false,
      });
    });
    expect(await player.findByText("Ready — tap Play")).toBeTruthy();
    await act(async () => { fireEvent.click(player.getByLabelText("Play")); });
    expect(await player.findByText("Reading assistant message")).toBeTruthy();
    // The synchronous gesture prime must not leave subsequent playing events ignored.
    expect(created[0]?.src).toBe("blob:1");
    await act(async () => { fireEvent.click(player.getByLabelText("Stop")); });
    expect(player.queryByText("Reading assistant message")).toBeNull();
    const cancellation = fetching.mock.calls.find(([url, init]) => typeof url === "string" && url.includes("clips?id=job1") && init?.method === "DELETE");
    expect(cancellation).toBeDefined();
    expect(new Headers(cancellation?.[1]?.headers).get("Content-Type")).toBe("application/json");
    expect(cancellation?.[1]?.body).toBe("{}");
  } finally { player.lifecycle.unmount(); }
});
