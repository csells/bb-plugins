import { describe, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

describe("auto-pin", () => {
  it("pins a visible unpinned root thread, including a root fork", async () => {
    const pin = vi.fn(async () => ({ success: true }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "auto-pin",
      sdk: { threads: { pin } },
    });
    plugin(bb);

    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thread-visible-root-fork",
        visibility: "visible",
        parentThreadId: null,
        sourceThreadId: "thread-source",
        pinnedAt: null,
      }),
    });

    expect(pin).toHaveBeenCalledOnce();
    expect(pin).toHaveBeenCalledWith({
      threadId: "thread-visible-root-fork",
    });
    await harness.lifecycle.dispose();
  });

  it.each([
    ["hidden", { visibility: "hidden" as const }],
    ["child", { parentThreadId: "thread-parent" }],
    ["already pinned", { pinnedAt: 1 }],
  ])("ignores a %s thread", async (_description, overrides) => {
    const pin = vi.fn(async () => ({ success: true }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "auto-pin",
      sdk: { threads: { pin } },
    });
    plugin(bb);

    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thread-ignored",
        visibility: "visible",
        parentThreadId: null,
        pinnedAt: null,
        ...overrides,
      }),
    });

    expect(pin).not.toHaveBeenCalled();
    await harness.lifecycle.dispose();
  });
  it("logs a warning instead of failing silently when pinning is rejected", async () => {
    const pin = vi.fn(async () => {
      throw new Error("thread is archived");
    });
    const { bb, harness } = createFakePluginHost({
      pluginId: "auto-pin",
      sdk: { threads: { pin } },
    });
    plugin(bb);

    // Thread events are fire-and-forget, so this must not reject.
    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({
        id: "thread-unpinnable",
        visibility: "visible",
        parentThreadId: null,
        pinnedAt: null,
      }),
    });

    expect(pin).toHaveBeenCalledOnce();
    const warnings = harness.inspection.logEntries.filter(
      (entry) => entry.level === "warn",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("thread-unpinnable");
    expect(warnings[0]!.message).toContain("thread is archived");
    await harness.lifecycle.dispose();
  });
});
