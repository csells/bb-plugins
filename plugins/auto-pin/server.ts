import type {
  BbPluginApi,
  PluginThreadEventPayloads,
} from "@get-bb/plugin-sdk";

type Thread = PluginThreadEventPayloads["thread.created"]["thread"];

export default function plugin(bb: BbPluginApi) {
  const pinning = new Set<string>();

  const pinThread = async (thread: Thread) => {
    if (
      thread.visibility !== "visible" ||
      thread.parentThreadId !== null ||
      thread.pinnedAt !== null ||
      pinning.has(thread.id)
    ) {
      return;
    }

    pinning.add(thread.id);
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
    } finally {
      pinning.delete(thread.id);
    }
  };

  bb.events.on("thread.created", async ({ thread }) => {
    await pinThread(thread);
  });

  bb.events.on("thread.active", async ({ thread }) => {
    await pinThread(thread);
  });
}
