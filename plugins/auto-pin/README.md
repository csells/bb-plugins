# Auto Pin

Auto Pin is a minimal headless BB plugin that automatically pins each visible
root thread when it is created or becomes active. That includes an existing
unpinned thread when you send it another message. Hidden threads, child
threads, and threads that are already pinned are ignored. Visible root forks
are included.

The plugin has no settings or user interface.

Install it from the GitHub collection:

```sh
bb plugin install git:https://github.com/csells/bb-plugins.git@main --plugin auto-pin
```

Auto Pin does not backfill historical threads just because the plugin starts.
An existing thread is pinned the next time it becomes active. Manually
unpinning a thread is not immediately reversed, but the thread is pinned again
if you resume it. BB may show visible child threads nested beneath their pinned
parent, but Auto Pin does not pin those children separately.

## Development

```sh
npm run typecheck
npm test
npm run build
```
