// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
let buildFileTree: typeof import("./app").buildFileTree;

beforeAll(async () => {
  app = await loadPluginApp(() => import("./app"));
  ({ buildFileTree } = await import("./app"));
});

function project(id: string, name: string, environmentId: string) {
  return {
    id,
    name,
    kind: "standard" as const,
    workspaces: [{
      kind: "environment" as const,
      id: `environment:${environmentId}`,
      environmentId,
      hostId: "host-1",
      label: `${name} worktree`,
      detail: "main · Studio",
    }],
  };
}

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

  it("registers project-aware surfaces instead of a global navigation page", () => {
    expect(app.navPanels).toHaveLength(0);
    expect(app.threadPanelActions).toHaveLength(1);
    expect(app.newThreadPanelActions).toHaveLength(1);
    expect(app.threadHeaderActions).toHaveLength(1);
  });

  it("locks an existing thread to its active environment", async () => {
    const slot = renderSlot(app.threadPanelActions[0]!, {
      threadId: "thread-1",
      params: null,
    }, {
      context: { projectId: "project-1", threadId: "thread-1" },
      rpc: {
        browser_bootstrap: () => ({
          project: project("project-1", "Apollo", "env-1"),
          selectedWorkspaceId: "environment:env-1",
          workspaceLocked: true,
        }),
        browser_paths: () => ({
          truncated: false,
          paths: [{ kind: "file", name: "README.md", path: "README.md", targetPath: "README.md" }],
        }),
      },
    });

    expect(await slot.findByText("README.md")).toBeTruthy();
    expect(slot.queryByLabelText("Project")).toBeNull();
    expect(slot.queryByLabelText("Workspace")).toBeNull();
    expect(slot.container.querySelector(".project-files-shell")).not.toBeNull();
    slot.lifecycle.unmount();
  });

  it("follows a changed project scope without retaining the previous workspace", async () => {
    const registration = app.newThreadPanelActions[0]!;
    const slot = renderSlot(registration, { projectId: "project-1", params: null }, {
      context: { projectId: "project-1", threadId: null },
      rpc: {
        browser_bootstrap: (input) => {
          const { projectId } = input as { projectId: string | null };
          const current = projectId === "project-2"
            ? project("project-2", "Gemini", "env-2")
            : project("project-1", "Apollo", "env-1");
          return {
            project: current,
            selectedWorkspaceId: current.workspaces[0]!.id,
            workspaceLocked: false,
          };
        },
        browser_paths: (input) => {
          const { workspace } = input as {
            workspace:
              | { kind: "environment"; environmentId: string }
              | { kind: "source"; rootPath: string };
          };
          const name =
            workspace.kind === "environment"
              ? `${workspace.environmentId}.txt`
              : "source.txt";
          return {
            truncated: false,
            paths: [{ kind: "file", name, path: name, targetPath: name }],
          };
        },
      },
    });

    await slot.findByText("env-1.txt");
    const Component = registration.component;
    slot.lifecycle.rerender(<Component projectId="project-2" params={null} />);
    expect(await slot.findByText("env-2.txt")).toBeTruthy();
    expect(slot.container.querySelector(".project-files-shell")).not.toBeNull();
    slot.lifecycle.unmount();
  });
});
