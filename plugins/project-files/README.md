# Project Files

A responsive, read-only file browser for bb projects.

Project Files adds a **Project Files** panel to bb's sidebar. It discovers
configured project source directories and worktree environments associated
with project threads, then presents them as a searchable tree. Selecting a
file delegates to bb's native file preview and installed file openers.

## Features

- Switch between bb projects and their known source directories or worktrees.
- Search file and folder names without losing their hierarchy.
- Hide generated directories such as `.git`, `node_modules`, `dist`, and
  `coverage` by default, with a control to reveal them.
- Refresh the current workspace on demand and after reconnecting.
- Responsive desktop and mobile layouts with touch-sized controls.
- Theme-aware styling using bb's host tokens.

The browser is intentionally read-only. It does not upload, rename, edit, or
delete files.

## Develop

From the repository root:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Install the local collection and reload it after a build:

```sh
bb plugin install path:. --plugin project-files
bb plugin reload project-files
```

The build emits the server and application bundles under `dist/`.

## Structure

- `server.ts` discovers projects and workspaces and lists their paths through
  bb's host-aware SDK.
- `app.tsx` builds the project/workspace controls and file tree.
- `app.css` owns the responsive desktop, mobile, and coarse-pointer layouts.
- `server.test.ts` and `app.test.tsx` cover path behavior, discovery, filtering,
  tree synthesis, sorting, and app registration.
