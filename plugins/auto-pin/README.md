# Auto Pin

Auto Pin is a minimal headless BB plugin that automatically pins each newly
created visible root thread. Hidden threads, child threads, and threads that
are already pinned are ignored. Visible root forks are included.

The plugin has no settings or user interface.

Install it from the GitHub collection:

```sh
bb plugin install git:https://github.com/csells/bb-plugins.git@main --plugin auto-pin
```

Auto Pin applies only to future `thread.created` events; it does not backfill
historical threads. Manually unpinning a thread is not immediately reversed,
because the plugin acts only when the thread is first created. BB may show
visible child threads nested beneath their pinned parent, but Auto Pin does not
pin those children separately.

## Development

```sh
npm run typecheck
npm test
npm run build
```
