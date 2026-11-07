// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { threadUrl } from "./app";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("threadUrl", () => {
  it("uses /threads/<id> for the personal project", () => {
    expect(
      threadUrl({ id: "thr_abc", projectId: "proj_personal" }, "https://bb.example"),
    ).toBe("https://bb.example/threads/thr_abc");
  });

  it("uses /projects/<project>/threads/<id> for other projects", () => {
    expect(
      threadUrl({ id: "thr_abc", projectId: "proj_x" }, "https://bb.example"),
    ).toBe("https://bb.example/projects/proj_x/threads/thr_abc");
  });

  it("encodes ids so they cannot escape the path", () => {
    expect(
      threadUrl({ id: "../a?b", projectId: "p/q" }, "https://bb.example"),
    ).toBe("https://bb.example/projects/p%2Fq/threads/..%2Fa%3Fb");
  });
});

describe("thread action", () => {
  it("adds an Open in new window item that opens the thread in a window", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.threadActions.map((action) => action.id)).toEqual([
      "open-in-new-window",
    ]);

    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    const registration = app.threadActions[0]!;
    const item = registration.item({
      thread: { id: "thr_1", projectId: "proj_2" },
    } as Parameters<typeof registration.item>[0]);

    expect(item?.label).toBe("Open in new window");
    await item!.run({ requestRename: vi.fn() });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.href).toBe(`${window.location.origin}/projects/proj_2/threads/thr_1`);
    expect(clicked[0]!.target).toBe("_blank");
    expect(clicked[0]!.rel).toBe("noopener noreferrer");
  });
});
