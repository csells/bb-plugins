import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const workspaceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("environment"), id: z.string(), environmentId: z.string(),
    label: z.string(), detail: z.string(), hostId: z.string(),
  }),
  z.object({
    kind: z.literal("source"), id: z.string(), hostId: z.string(),
    rootPath: z.string(), label: z.string(), detail: z.string(),
  }),
]);

const projectSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(["standard", "personal"]),
  workspaces: z.array(workspaceSchema),
});

const fileEntrySchema = z.object({
  kind: z.enum(["directory", "file"]), name: z.string(), path: z.string(),
  targetPath: z.string(),
});

const workspaceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("environment"), environmentId: z.string().min(1) }),
  z.object({
    kind: z.literal("source"), hostId: z.string().min(1), rootPath: z.string().min(1),
  }),
]);

export type BrowserWorkspace = z.infer<typeof workspaceSchema>;
export type BrowserProject = z.infer<typeof projectSchema>;
export type BrowserFileEntry = z.infer<typeof fileEntrySchema>;
export type BrowserWorkspaceInput = z.infer<typeof workspaceInputSchema>;

export const rpcContract = defineRpcContract({
  browser_bootstrap: {
    input: z.null(), output: z.object({ projects: z.array(projectSchema) }),
  },
  browser_paths: {
    input: z.object({
      workspace: workspaceInputSchema,
      query: z.string().max(240).default(""),
      showGenerated: z.boolean().default(false),
      limit: z.number().int().min(100).max(5000).default(4000),
    }),
    output: z.object({ paths: z.array(fileEntrySchema), truncated: z.boolean() }),
  },
});

const GENERATED_SEGMENTS = new Set([
  ".git", ".next", ".nuxt", ".terraform", ".tox", ".venv",
  "__pycache__", "build", "coverage", "dist", "node_modules", "out",
  "target", "vendor",
]);

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function relativePath(rootPath: string, absolutePath: string): string {
  const root = normalizePath(rootPath);
  const target = normalizePath(absolutePath);
  if (target === root) return "";
  return target.startsWith(`${root}/`)
    ? target.slice(root.length + 1)
    : target.replace(/^\/+/, "");
}

export function isGeneratedPath(path: string): boolean {
  return normalizePath(path).split("/").some((segment) => GENERATED_SEGMENTS.has(segment));
}

function workspaceLabel(thread: {
  environmentName: string | null;
  environmentBranchName: string | null;
  environmentWorkspaceDisplayKind: string;
}): string {
  return thread.environmentName ?? thread.environmentBranchName ??
    (thread.environmentWorkspaceDisplayKind === "managed-worktree"
      ? "Managed worktree" : "Working directory");
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  bb.rpc.register(rpcContract, {
    browser_bootstrap: async () => {
      const [snapshot, hosts] = await Promise.all([
        bb.sdk.projects.sidebarBootstrap(), bb.sdk.hosts.list(),
      ]);
      const hostNames = new Map(hosts.map((host) => [host.id, host.name]));
      const projects: BrowserProject[] = snapshot.projects.map((project) => {
        const environments = new Map<string, BrowserWorkspace>();
        for (const thread of project.threads) {
          if (thread.environmentId === null || thread.environmentHostId === null) continue;
          if (environments.has(thread.environmentId)) continue;
          const label = workspaceLabel(thread);
          environments.set(thread.environmentId, {
            kind: "environment", id: `environment:${thread.environmentId}`,
            environmentId: thread.environmentId, hostId: thread.environmentHostId,
            label,
            detail: [thread.environmentBranchName, hostNames.get(thread.environmentHostId)]
              .filter((value): value is string => Boolean(value)).join(" · "),
          });
        }
        const sources: BrowserWorkspace[] = project.sources.map((source) => ({
          kind: "source", id: `source:${source.id}`, hostId: source.hostId,
          rootPath: source.path, label: "Project source",
          detail: `${hostNames.get(source.hostId) ?? "Machine"} · ${source.path}`,
        }));
        return {
          id: project.id, name: project.name, kind: project.kind,
          workspaces: [...environments.values(), ...sources],
        };
      });
      return {
        projects: projects.filter((project) => project.workspaces.length > 0)
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    },

    browser_paths: async ({ workspace, query, showGenerated, limit }) => {
      const trimmedQuery = query.trim();
      if (workspace.kind === "environment") {
        const result = await bb.sdk.environments.paths({
          environmentId: workspace.environmentId,
          includeDirectories: "true", includeFiles: "true", limit: String(limit),
          ...(trimmedQuery === "" ? {} : { query: trimmedQuery }),
        });
        const paths = result.paths.map((entry) => ({
          kind: entry.kind, name: entry.name, path: normalizePath(entry.path),
          targetPath: normalizePath(entry.path),
        })).filter((entry) => showGenerated || !isGeneratedPath(entry.path));
        return { paths, truncated: result.truncated };
      }
      const result = await bb.sdk.files.listPaths({
        hostId: workspace.hostId, path: workspace.rootPath,
        includeDirectories: true, includeFiles: true, limit,
        ...(trimmedQuery === "" ? {} : { query: trimmedQuery }),
      });
      const paths = result.paths.map((entry) => ({
        kind: entry.kind, name: entry.name,
        path: relativePath(workspace.rootPath, entry.path), targetPath: entry.path,
      })).filter((entry) => entry.path !== "")
        .filter((entry) => showGenerated || !isGeneratedPath(entry.path));
      return { paths, truncated: result.truncated };
    },
  });

  bb.onDispose(() => bb.log.info("disposed"));
}
