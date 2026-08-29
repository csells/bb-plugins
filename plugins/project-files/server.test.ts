import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin, { isGeneratedPath, normalizePath, relativePath } from "./server";

describe("path helpers", () => {
  it("normalizes separators and project-relative prefixes", () => {
    expect(normalizePath("./src\\feature/")).toBe("src/feature");
  });

  it("confines host display paths to the selected source", () => {
    expect(relativePath("/code/app", "/code/app/src/main.ts")).toBe("src/main.ts");
    expect(relativePath("/code/app", "/elsewhere/file.txt")).toBe("elsewhere/file.txt");
  });

  it("recognizes generated directory segments without hiding similarly named files", () => {
    expect(isGeneratedPath("packages/ui/node_modules/react/index.js")).toBe(true);
    expect(isGeneratedPath("src/build-report.ts")).toBe(false);
  });
});
describe("project-files backend", () => {
  it("discovers sources and known project environments", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "project-files",
      sdk: {
        projects: {
          sidebarBootstrap: async () => ({
            sections: [],
            projects: [{
              id: "project-1", name: "Apollo", kind: "standard",
              createdAt: 1, updatedAt: 1, gitRemoteUrl: null,
              sources: [{
                id: "source-1", projectId: "project-1", hostId: "host-1",
                path: "/code/apollo", type: "local_path", isDefault: true,
                createdAt: 1, updatedAt: 1,
              }],
              defaultExecutionOptions: null,
              threads: [{
                id: "thread-1", projectId: "project-1", environmentId: "env-1",
                environmentHostId: "host-1", environmentName: "Feature orbit",
                environmentBranchName: "feature/orbit",
                environmentWorkspaceDisplayKind: "managed-worktree",
              }],
            }],
          }),
        },
        hosts: { list: async () => [{ id: "host-1", name: "Studio" }] },
      },
    });
    await plugin(bb);

    const result = await harness.behavior.callRpc("browser_bootstrap", null);
    expect(result.projects[0]).toMatchObject({
      id: "project-1",
      name: "Apollo",
      workspaces: [
        { kind: "environment", environmentId: "env-1", label: "Feature orbit" },
        { kind: "source", rootPath: "/code/apollo", label: "Project source" },
      ],
    });
    await harness.lifecycle.dispose();
  });

  it("lists environment paths and filters generated directories", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "project-files",
      sdk: {
        environments: {
          paths: async () => ({
            truncated: false,
            paths: [
              { kind: "directory", name: "src", path: "src", positions: [], score: 1 },
              { kind: "file", name: "main.ts", path: "src/main.ts", positions: [], score: 1 },
              { kind: "file", name: "react.js", path: "node_modules/react.js", positions: [], score: 1 },
            ],
          }),
        },
      },
    });
    await plugin(bb);
    const result = await harness.behavior.callRpc("browser_paths", {
      workspace: { kind: "environment", environmentId: "env-1" },
      query: "",
      showGenerated: false,
      limit: 4000,
    });
    expect(result.paths.map((entry) => entry.path)).toEqual(["src", "src/main.ts"]);
    await harness.lifecycle.dispose();
  });
});
