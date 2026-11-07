// bb-plugin-open-in-window — frontend entry.
//
// Adds "Open in new window" to every thread actions menu: the "..." menu on a
// sidebar row, its right-click menu, the thread header's menu, and the phone
// long-press drawer. Picking it opens that thread the way a target="_blank"
// link does.
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
} from "@get-bb/plugin-sdk/app";

/** bb serves threads of the personal project at /threads/<id>. */
const PERSONAL_PROJECT_ID = "proj_personal";

/** The absolute URL bb routes to the thread, the same one "Copy link" copies. */
export function threadUrl(
  thread: { id: string; projectId: string },
  origin: string,
): string {
  const threadId = encodeURIComponent(thread.id);
  const path =
    thread.projectId === PERSONAL_PROJECT_ID
      ? `/threads/${threadId}`
      : `/projects/${encodeURIComponent(thread.projectId)}/threads/${threadId}`;
  return new URL(path, origin).toString();
}

/**
 * Opens the thread exactly as clicking an `<a target="_blank">` link would,
 * so the browser applies its normal new-tab/new-window behavior.
 */
export function openThreadInNewWindow(thread: {
  id: string;
  projectId: string;
}): void {
  const link = document.createElement("a");
  link.href = threadUrl(thread, window.location.origin);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "open-in-new-window",
    title: "Open in new window",
    icon: "AppWindow",
    group: experimental_THREAD_ACTION_GROUPS.open,
    // After bb's Open in split (10) and Copy link (20).
    order: 25,
    item: ({ thread }) => ({
      label: "Open in new window",
      icon: "AppWindow",
      run: () => {
        openThreadInNewWindow(thread);
      },
    }),
  });
});
