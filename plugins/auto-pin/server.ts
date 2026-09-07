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

    try {
      await bb.sdk.threads.pin({ threadId: thread.id });
    } catch (cause) {
      // Thread events are fire-and-forget, so a throw here is swallowed into
      // the plugin's handler stats. Without this line the only symptom is a
      // thread that quietly did not get pinned, with nothing to look at.
      bb.log.warn(
        `could not pin thread ${thread.id}: ` +
          (cause instanceof Error ? cause.message : String(cause)),
      );
    }
  });
}
