// The Jarvis page: the orb, what Jarvis is showing, and live captions.
//
// The screen belongs to the content. Controls stay hidden until the user moves
// the pointer or touches the stage, like a video player, and fade away again
// after a few seconds of stillness.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { experimental_Icon as Icon, Markdown } from "@get-bb/plugin-sdk/app";
import { engine, type Caption, type Mode } from "@/lib/engine";
import { Orb } from "./Orb";

const CONTROLS_IDLE_MS = 2_600;

const STATUS: Record<Exclude<Mode, "off">, string> = {
  starting: "Starting…",
  listening: "Listening",
  hearing: "Hearing you",
  sending: "Got it",
  thinking: "Thinking",
  speaking: "",
};

export function useEngine() {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

/** Reveals a caption word by word, in time with the audio. */
function CaptionLine({ caption }: { caption: Caption }) {
  const words = caption.text.split(/\s+/).filter(Boolean);
  const [spoken, setSpoken] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - caption.startedAt) / Math.max(1, caption.durationMs));
      // Leading slightly makes captions feel in sync rather than behind.
      setSpoken(Math.min(words.length, Math.ceil(progress * words.length + 0.5)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [caption, words.length]);
  return (
    <p className="text-balance text-center text-xl leading-relaxed font-medium sm:text-2xl">
      {words.map((word, index) => (
        <span
          // Words repeat within a sentence, so position is the identity.
          key={index}
          className="transition-opacity duration-150"
          style={{ opacity: index < spoken ? 1 : 0.28 }}
        >
          {word}{" "}
        </span>
      ))}
    </p>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex size-12 items-center justify-center rounded-full backdrop-blur transition-colors ${
        active ? "bg-white/90 text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      <Icon name={icon} className="size-5" aria-hidden="true" />
    </button>
  );
}

export function Stage({ onOpenTranscript }: { onOpenTranscript: () => void }) {
  const state = useEngine();
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    engine.stageMounted(1);
    return () => engine.stageMounted(-1);
  }, []);

  const reveal = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
  }, []);
  useEffect(() => () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
  }, []);

  const off = state.mode === "off";
  const showing = state.visual !== null;
  const status = state.mode === "off" ? `Tap to talk to ${state.name}` : STATUS[state.mode];

  let body: ReactNode = null;
  if (showing && state.visual !== null) {
    body = (
      // BB's chat markdown sizes tables to their content and lets them break
      // out of the text column; inside a card that spills over the edges, so
      // fit tables to the card and let long cells wrap.
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-background p-5 text-foreground shadow-2xl ring-1 ring-white/10 sm:p-6 [&_div:has(>div>table)]:mx-0! [&_div:has(>div>table)]:block! [&_div:has(>div>table)]:w-full! [&_div:has(>table)]:w-full! [&_table]:w-full!">
        {state.visual.title !== null ? (
          <h2 className="mb-3 text-lg font-semibold">{state.visual.title}</h2>
        ) : null}
        <Markdown content={state.visual.markdown ?? ""} />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#172033_0%,#0a0f1a_70%)] text-white select-none"
      onPointerMove={reveal}
      onPointerDown={reveal}
      onClick={() => {
        if (off) void engine.start();
      }}
    >
      {/* The orb sits center stage, and steps aside when there is something to show. */}
      <div
        className={`flex items-center justify-center transition-all duration-500 ${
          showing ? "absolute top-4 left-4 z-10" : "flex-1"
        }`}
      >
        <button
          type="button"
          aria-label={off ? `Start talking to ${state.name}` : state.name}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={(event) => {
            event.stopPropagation();
            if (off) void engine.start();
            else reveal();
          }}
        >
          <Orb mode={state.mode} size={showing ? 88 : 300} />
        </button>
      </div>

      {showing ? (
        <div className="flex-1 overflow-y-auto px-4 pt-28 pb-44 sm:px-8">{body}</div>
      ) : null}

      {/* Captions: what the assistant is saying, and what it heard. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6">
        {state.heard !== null && state.mode !== "speaking" ? (
          <p className="max-w-2xl text-center text-sm text-white/55">“{state.heard}”</p>
        ) : null}
        {state.caption !== null && state.mode === "speaking" ? (
          <div className="max-w-3xl">
            <CaptionLine caption={state.caption} />
          </div>
        ) : status !== "" ? (
          <p className="text-sm tracking-wide text-white/60 uppercase">{status}</p>
        ) : null}
        {state.error !== null ? (
          <p className="max-w-xl text-center text-sm text-rose-300">{state.error}</p>
        ) : null}
      </div>

      {/* Controls, shown on touch. */}
      <div
        className={`absolute inset-x-0 bottom-6 flex justify-center gap-3 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ControlButton
          label={off ? "Start listening" : "Stop listening"}
          icon={off ? "Mic" : "MicOff"}
          active={!off}
          onClick={() => {
            if (off) void engine.start();
            else engine.stop();
          }}
        />
        {state.mode === "speaking" ? (
          <ControlButton label="Stop talking" icon="Square" onClick={() => engine.stopSpeaking()} />
        ) : null}
        {showing ? (
          <ControlButton label="Clear the screen" icon="X" onClick={() => engine.clearVisual()} />
        ) : null}
        <ControlButton
          label={state.earcons ? "Turn tones off" : "Turn tones on"}
          icon={state.earcons ? "Bell" : "BellOff"}
          onClick={() => engine.setEarcons(!state.earcons)}
        />
        <ControlButton label="Show the conversation" icon="MessageSquareText" onClick={onOpenTranscript} />
      </div>
    </div>
  );
}
