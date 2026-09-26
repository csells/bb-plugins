// bb-plugin-jarvis — frontend entry.
//
// Two registrations:
//   navPanel "jarvis"        the assistant's page (Stage), with the conversation
//                            as a fixed tab in the right panel
//   experimental_appOverlay  AssistantHost: mounted once per window, app-wide. It
//                            wires the voice engine to the server and keeps a
//                            small orb on screen while a session is live and
//                            the assistant's page is not, so walking away from it
//                            does not end the conversation.
import { useEffect } from "react";
import {
  definePluginApp,
  experimental_useAppPanel,
  ThreadChat,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import {
  CHANNELS,
  isBrainPayload,
  isPhasePayload,
  isSayPayload,
  isVisualPayload,
} from "./channels";
import type { rpcContract } from "./server";
import { Orb } from "@/components/Orb";
import { Stage, useEngine } from "@/components/Stage";
import { engine } from "@/lib/engine";

const TRANSCRIPT_TAB = { panelId: "jarvis", id: "conversation" } as const;

/**
 * The assistant's name for the sidebar entry. Slots are registered before any
 * component runs, so it is read once at load, with a quick fallback so a slow
 * server never delays the app. A rename shows in the sidebar after a reload.
 */
async function loadName(): Promise<string> {
  try {
    const response = await fetch("/api/v1/plugins/jarvis/http/name", {
      signal: AbortSignal.timeout(1_500),
    });
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === "string" && body.name.trim() !== "" ? body.name : "Jarvis";
  } catch {
    return "Jarvis";
  }
}

const assistantName = await loadName();

function AssistantHost() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const state = useEngine();

  useEffect(() => {
    engine.bind({
      start: () => rpc.call("start"),
      interrupt: async () => {
        await rpc.call("interrupt");
      },
    });
    rpc.call("state").then(
      (current) => {
        engine.setName(current.name);
        engine.setBrain(current.brainThreadId);
        engine.setEarcons(current.earcons);
      },
      () => undefined,
    );
    return () => engine.bind(null);
  }, [rpc]);

  useRealtime(CHANNELS.say, (payload) => {
    if (isSayPayload(payload)) engine.onSay(payload);
  });
  useRealtime(CHANNELS.phase, (payload) => {
    if (isPhasePayload(payload)) engine.onBrainPhase(payload);
  });
  useRealtime(CHANNELS.visual, (payload) => {
    if (isVisualPayload(payload)) engine.onVisual(payload);
  });
  useRealtime(CHANNELS.brain, (payload) => {
    if (isBrainPayload(payload)) engine.setBrain(payload.brainThreadId);
  });

  if (state.mode === "off" || state.stagesMounted > 0) return null;
  return (
    <button
      type="button"
      aria-label={`Open ${state.name}`}
      onClick={() => navigate.toPluginPanel("jarvis")}
      className="fixed right-5 bottom-5 z-50 rounded-full bg-slate-950/80 shadow-xl ring-1 ring-white/10 backdrop-blur"
    >
      <Orb mode={state.mode} size={64} />
    </button>
  );
}

function AssistantPage() {
  const panel = experimental_useAppPanel();
  return (
    <Stage
      onOpenTranscript={() => {
        panel.openFixedTab({ surface: { kind: "current" }, tab: TRANSCRIPT_TAB });
      }}
    />
  );
}

function Conversation() {
  const { brainThreadId, name } = useEngine();
  if (brainThreadId === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Talk to {name} and the conversation shows up here. You can type to {name} here too.
      </div>
    );
  }
  return <ThreadChat threadId={brainThreadId} variant="compact" />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "jarvis",
    title: assistantName,
    icon: "AudioWaveform",
    path: "jarvis",
    component: AssistantPage,
    fixedTabs: [
      {
        ...TRANSCRIPT_TAB,
        title: "Conversation",
        icon: "MessageSquareText",
        component: Conversation,
        layout: "flush",
      },
    ],
  });
  app.slots.experimental_appOverlay({ id: "assistant-host", component: AssistantHost });
});
