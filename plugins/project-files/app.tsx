import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  definePluginApp,
  experimental_FileLink as FileLink,
  useBbContext,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type {
  ExperimentalLiveFileTarget,
  PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import type {
  BrowserFileEntry,
  BrowserProject,
  BrowserWorkspace,
  BrowserWorkspaceInput,
  rpcContract,
} from "./server";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { Input } from "./components/ui/input";
import { cn } from "./lib/utils";
import "./app.css";

export interface FileTreeNode extends BrowserFileEntry {
  children: FileTreeNode[];
  depth: number;
  synthetic?: boolean;
}

interface MutableTreeNode extends BrowserFileEntry {
  children: Map<string, MutableTreeNode>;
  synthetic?: boolean;
}

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function buildFileTree(entries: BrowserFileEntry[]): FileTreeNode[] {
  const root = new Map<string, MutableTreeNode>();
  const nodesByPath = new Map<string, MutableTreeNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let siblings = root;
    let accumulated = "";
    parts.forEach((part, index) => {
      accumulated = accumulated === "" ? part : `${accumulated}/${part}`;
      const existing = nodesByPath.get(accumulated);
      if (existing !== undefined) {
        if (index === parts.length - 1) {
          existing.kind = entry.kind;
          existing.name = entry.name;
          existing.targetPath = entry.targetPath;
          existing.synthetic = false;
        }
        siblings = existing.children;
        return;
      }
      const isLeaf = index === parts.length - 1;
      const node: MutableTreeNode = {
        kind: isLeaf ? entry.kind : "directory",
        name: isLeaf ? entry.name : part,
        path: accumulated,
        targetPath: isLeaf ? entry.targetPath : accumulated,
        children: new Map(),
        synthetic: !isLeaf,
      };
      siblings.set(part, node);
      nodesByPath.set(accumulated, node);
      siblings = node.children;
    });
  }

  const materialize = (nodes: Map<string, MutableTreeNode>, depth: number): FileTreeNode[] =>
    [...nodes.values()]
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true });
      })
      .map((node) => ({
        kind: node.kind,
        name: node.name || baseName(node.path),
        path: node.path,
        targetPath: node.targetPath,
        depth,
        ...(node.synthetic ? { synthetic: true } : {}),
        children: materialize(node.children, depth + 1),
      }));

  return materialize(root, 0);
}

function flattenVisible(
  nodes: FileTreeNode[],
  expanded: ReadonlySet<string>,
): FileTreeNode[] {
  const visible: FileTreeNode[] = [];
  for (const node of nodes) {
    visible.push(node);
    if (node.kind === "directory" && expanded.has(node.path)) {
      visible.push(...flattenVisible(node.children, expanded));
    }
  }
  return visible;
}

function allDirectoryPaths(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "directory"
      ? [node.path, ...allDirectoryPaths(node.children)]
      : [],
  );
}

function workspaceInput(workspace: BrowserWorkspace): BrowserWorkspaceInput {
  return workspace.kind === "environment"
    ? { kind: "environment", environmentId: workspace.environmentId }
    : { kind: "source", hostId: workspace.hostId, rootPath: workspace.rootPath };
}

function fileTarget(
  workspace: BrowserWorkspace,
  node: FileTreeNode,
): ExperimentalLiveFileTarget {
  return workspace.kind === "environment"
    ? { kind: "workspace", environmentId: workspace.environmentId, path: node.targetPath }
    : { kind: "host", hostId: workspace.hostId, path: node.targetPath };
}

function EmptyState({ icon, children }: { icon: "Folder" | "Search" | "AlertCircle"; children: ReactNode }) {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground shadow-sm">
        <Icon name={icon} className="size-5" />
      </div>
      <div className="text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring coarse:h-11 coarse:text-base"
      >
        {children}
      </select>
    </label>
  );
}

function TreeRow({
  node,
  workspace,
  expanded,
  onToggle,
}: {
  node: FileTreeNode;
  workspace: BrowserWorkspace;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = { "--tree-depth": node.depth } as CSSProperties;
  const content = (
    <>
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
        {node.kind === "directory" ? (
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
        ) : (
          <span className="size-3.5" />
        )}
      </span>
      <Icon
        name={node.kind === "directory" ? (expanded ? "FolderOpen" : "Folder") : "File"}
        className={cn("size-4 shrink-0", node.kind === "directory" ? "text-file-accent" : "text-muted-foreground")}
      />
      <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
      {node.kind === "file" ? (
        <Icon name="ArrowRight" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" />
      ) : null}
    </>
  );

  return node.kind === "directory" ? (
    <button
      type="button"
      style={style}
      className="project-file-row group flex w-full items-center gap-1.5 rounded-md pr-2 text-sm text-foreground outline-none hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {content}
    </button>
  ) : (
    <FileLink
      style={style}
      className="project-file-row group flex w-full items-center gap-1.5 rounded-md pr-2 text-sm text-foreground no-underline outline-none hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
      target={fileTarget(workspace, node)}
    >
      {content}
    </FileLink>
  );
}

function ProjectFilesPage(_props: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId: routeProjectId } = useBbContext();
  const connection = useRealtimeConnectionState();
  const priorConnection = useRef(connection);
  const [projects, setProjects] = useState<BrowserProject[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);
  const [entries, setEntries] = useState<BrowserFileEntry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const result = await rpc.call("browser_bootstrap");
      setProjects(result.projects);
      setSelectedProjectId((current) => {
        if (result.projects.some((project) => project.id === current)) return current;
        if (routeProjectId && result.projects.some((project) => project.id === routeProjectId)) {
          return routeProjectId;
        }
        return result.projects[0]?.id ?? "";
      });
      setError(null);
    } catch (cause) {
      report(cause);
    }
  }, [report, routeProjectId, rpc]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedWorkspace = useMemo(
    () => selectedProject?.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedProject, selectedWorkspaceId],
  );

  useEffect(() => {
    if (selectedProject === null) return;
    if (!selectedProject.workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(selectedProject.workspaces[0]?.id ?? "");
    }
  }, [selectedProject, selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspace === null) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    setEntries(null);
    rpc.call("browser_paths", {
      workspace: workspaceInput(selectedWorkspace),
      query: debouncedQuery,
      showGenerated,
      limit: 4000,
    }).then((result) => {
      if (cancelled) return;
      setEntries(result.paths);
      setTruncated(result.truncated);
      setError(null);
    }, (cause) => {
      if (!cancelled) report(cause);
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, refreshKey, report, rpc, selectedWorkspace, showGenerated]);

  useEffect(() => {
    const was = priorConnection.current;
    priorConnection.current = connection;
    if (connection === "connected" && was === "reconnecting") {
      void loadProjects();
      setRefreshKey((value) => value + 1);
    }
  }, [connection, loadProjects]);

  const tree = useMemo(() => buildFileTree(entries ?? []), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (debouncedQuery !== "") setExpanded(new Set(allDirectoryPaths(tree)));
  }, [debouncedQuery, tree]);
  const visible = useMemo(() => flattenVisible(tree, expanded), [expanded, tree]);
  const fileCount = entries?.filter((entry) => entry.kind === "file").length ?? 0;
  const folderCount = entries?.filter((entry) => entry.kind === "directory").length ?? 0;

  return (
    <div className="project-files-shell flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="h-0.5 shrink-0 bg-primary" />
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border bg-surface-scrim px-3 py-3 backdrop-blur md:grid-cols-[minmax(150px,0.8fr)_minmax(190px,1fr)_minmax(220px,1.35fr)_auto] md:px-4">
        <SelectField className="col-span-2 md:col-span-1" label="Project" value={selectedProjectId} onChange={setSelectedProjectId}>
          {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </SelectField>
        <SelectField className="col-span-2 md:col-span-1" label="Workspace" value={selectedWorkspaceId} onChange={setSelectedWorkspaceId}>
          {(selectedProject?.workspaces ?? []).map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.label}</option>
          ))}
        </SelectField>
        <div className="relative min-w-0 md:col-auto">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find files and folders" aria-label="Find files and folders" className="pl-9 pr-9" />
          {query !== "" ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground">
              <Icon name="X" className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh files" onClick={() => setRefreshKey((value) => value + 1)} className="coarse:h-11 coarse:w-11">
          <Icon name="RotateCcw" className="size-4" />
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(230px,280px)_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="border-b border-border bg-surface-recessed px-3 py-3 lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-file-accent shadow-sm">
              <Icon name={selectedWorkspace?.kind === "environment" ? "GitBranch" : "FolderOpen"} className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selectedWorkspace?.label ?? "Choose a workspace"}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{selectedWorkspace?.detail ?? "Select a project to browse its files."}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground lg:grid lg:grid-cols-2 lg:gap-2">
            <span><strong className="font-medium text-foreground">{fileCount}</strong> files</span>
            <span><strong className="font-medium text-foreground">{folderCount}</strong> folders</span>
            {truncated ? <span className="text-warning-text lg:col-span-2">First 4,000 paths shown</span> : null}
          </div>
          <label className="mt-3 flex min-h-9 cursor-pointer items-center gap-2 rounded-md text-xs text-muted-foreground lg:border-t lg:border-border lg:pt-3 coarse:min-h-11 coarse:text-sm">
            <input type="checkbox" checked={showGenerated} onChange={(event) => setShowGenerated(event.target.checked)} className="size-4 accent-primary" />
            Show generated folders
          </label>
        </aside>

        <main className="relative flex min-h-0 flex-col bg-background">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:px-4">
            <span>{debouncedQuery ? `Results for “${debouncedQuery}”` : "Repository tree"}</span>
            {connection !== "connected" ? <span className="normal-case tracking-normal">Reconnecting…</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 md:p-3" role="tree" aria-label="Project files">
            {error !== null ? (
              <EmptyState icon="AlertCircle"><p className="font-medium text-foreground">Files could not be loaded</p><p className="mt-1">{error}</p></EmptyState>
            ) : projects === null || entries === null ? (
              <div className="space-y-1 p-1" aria-label="Loading files">
                {Array.from({ length: 9 }, (_, index) => <div key={index} className="project-files-skeleton h-9 rounded-md bg-muted" style={{ width: `${72 - (index % 4) * 7}%` }} />)}
              </div>
            ) : projects.length === 0 ? (
              <EmptyState icon="Folder">No browsable projects were found. Add a project source or open a thread in a project environment.</EmptyState>
            ) : visible.length === 0 ? (
              <EmptyState icon={debouncedQuery ? "Search" : "Folder"}>{debouncedQuery ? "No paths match this search." : "This workspace contains no visible files."}</EmptyState>
            ) : (
              <div className="space-y-0.5">
                {visible.map((node) => (
                  <TreeRow key={node.path} node={node} workspace={selectedWorkspace!} expanded={expanded.has(node.path)} onToggle={() => {
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
                      return next;
                    });
                  }} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "project-files",
    title: "Project Files",
    icon: "FolderOpen",
    path: "files",
    component: ProjectFilesPage,
  });
});
