# bb-plugin-open-in-window

Adds **Open in new window** to every bb thread actions menu (sidebar row "...",
right-click, and thread header). It opens the thread's URL the way a
`target="_blank"` link does.

- `app.ts` registers the thread action with `app.slots.experimental_threadAction`.
- `server.ts` is the required backend entry; it only logs on load.

```sh
npm test
npm run typecheck
bb plugin build
bb plugin install path:. # from this directory
```
