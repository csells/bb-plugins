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

## Auto Pin

`plugins/auto-pin` automatically pins future visible root threads, including
visible root forks. It ignores hidden threads, child threads, and threads that
are already pinned.

```sh
bb plugin install git:https://github.com/csells/bb-plugins.git@main --plugin auto-pin
```

Development commands:

```sh
npm install
npm run typecheck
npm test
npm run build
```
