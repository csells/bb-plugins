# Project Files

A responsive, read-only file browser for bb projects.

Project Files adds a context-aware **Project Files** tab to bb's thread and
New Thread panels. Existing threads browse their exact environment; New Thread
follows the project currently selected in bb. Selecting a file delegates to
bb's native file preview and installed file openers.

## Features

- Follow the current bb thread or selected New Thread project automatically.
- Switch workspaces only when a project has more than one available source.
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
- `app.tsx` contributes project-aware panel actions and builds the file tree.
- `app.css` owns the responsive desktop, mobile, and coarse-pointer layouts.
- `server.test.ts` and `app.test.tsx` cover path behavior, discovery, filtering,
  tree synthesis, sorting, and app registration.
