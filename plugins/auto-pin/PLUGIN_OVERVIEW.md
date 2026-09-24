## What you get

Every thread you start arrives already pinned to the top of the sidebar. An
existing unpinned thread is pinned again when you resume it, so the thread you
are actively using stays where you can find it.

This is for the habit of starting a thread, getting pulled away, and then
hunting for it in a list that has since grown by ten entries. Pinning is
something you would have done by hand a moment later anyway.

## How it works

The plugin listens for thread creation and activation and pins the thread. It
pins only threads you would want pinned: a thread has to be visible and
top-level. Child threads spawned by an agent are left alone, hidden threads are
left alone, and a thread that already carries a pin is not touched again.

Nothing else about pinning changes. You can still unpin a thread, and it stays
unpinned until you interact with it again.

If BB ever refuses a pin, the plugin logs a warning rather than failing
quietly, so a thread that did not get pinned leaves something to look at.

## Requirements

Nothing to configure. There are no settings, no commands, and no network
access. Turn it on and new threads start showing up pinned.

The source is at
[github.com/csells/bb-plugins](https://github.com/csells/bb-plugins).
