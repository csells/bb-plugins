import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.events.on("thread.created", async ({ thread }) => {
    if (
      thread.visibility !== "visible" ||
      thread.parentThreadId !== null ||
      thread.pinnedAt !== null
    ) {
      return;
    }

    await bb.sdk.threads.pin({ threadId: thread.id });
  });
}
