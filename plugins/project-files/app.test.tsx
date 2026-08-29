// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
let buildFileTree: typeof import("./app").buildFileTree;

beforeAll(async () => {
  app = await loadPluginApp(() => import("./app"));
  ({ buildFileTree } = await import("./app"));
});

describe("file tree", () => {
  it("synthesizes missing parents and sorts folders before files", () => {
    const tree = buildFileTree([
      { kind: "file", name: "README.md", path: "README.md", targetPath: "README.md" },
      { kind: "file", name: "main.ts", path: "src/main.ts", targetPath: "src/main.ts" },
    ]);
    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ["directory", "src"],
      ["file", "README.md"],
    ]);
    expect(tree[0]?.children[0]?.path).toBe("src/main.ts");
  });

  it("renders project controls and the responsive browser shell", async () => {
    const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
      context: { projectId: "project-1", threadId: null },
      rpc: {
        browser_bootstrap: () => ({
          projects: [{
            id: "project-1", name: "Apollo", kind: "standard",
            workspaces: [{
              kind: "environment", id: "environment:env-1", environmentId: "env-1",
              hostId: "host-1", label: "Main worktree", detail: "main · Studio",
            }],
          }],
        }),
        browser_paths: () => ({
          truncated: false,
          paths: [{ kind: "file", name: "README.md", path: "README.md", targetPath: "README.md" }],
        }),
      },
    });
    expect(await slot.findByLabelText("Project")).toBeTruthy();
    expect(await slot.findByLabelText("Workspace")).toBeTruthy();
    expect(await slot.findByText("README.md")).toBeTruthy();
    expect(slot.container.querySelector(".project-files-shell")).not.toBeNull();
    slot.lifecycle.unmount();
  });
});
