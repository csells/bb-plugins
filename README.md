# bb plugins

Personal bb extensions maintained as a multi-plugin repository.

## Project Files

`plugins/project-files` adds a responsive file browser to bb. It discovers
standard projects, their configured source directories, and worktree
environments already associated with project threads. File activation uses
bb's native preview and installed file-opener system.

Install the local checkout:

```sh
bb plugin install path:. --plugin project-files
```
Development commands:

```sh
npm install
npm run typecheck
npm test
npm run build
```
