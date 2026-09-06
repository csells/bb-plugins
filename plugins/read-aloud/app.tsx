// bb-plugin-read-aloud — frontend entry.
//
// Two registrations:
//   messageAction           -> the speaker button in each message's action row,
//                              beside Copy message.
//   experimental_appOverlay -> a floating transport (seek / play / speed / stop)
//                              shown only while something is playing.
//
// messageAction is host-rendered chrome: `run` is a plain callback, not a
// component, so it cannot draw transport siblings of itself. Hence the split,
// and hence the module-level store below — `run` fires outside React and has to
// reach the overlay, which may mount, unmount, and remount underneath it.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  definePluginApp,
  useBbContext,
  useRealtime,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";

/** Routes are namespaced by plugin id; auth "local" accepts the BB app origin. */
const PLUGIN_ROUTE = "/api/v1/plugins/read-aloud/http";
const STOP_CHANNEL = "read-aloud/stop";
const SEEK_SECONDS = 10;

/**
 * Playback speed lives in localStorage, not plugin settings. Plugin settings
 * are server-side, global, and read once per load — wrong for a per-client
 * preference the user toggles mid-sentence. This persists instantly and per
 * device, which is what "remember my speed" actually means here.
 */
const RATE_KEY = "bb-read-aloud.playbackRate";
const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function loadRate(): number {
  try {
    const stored = Number(localStorage.getItem(RATE_KEY));
    // Only honor a value we actually offer, so a hand-edited key cannot
    // strand playback at 0.01x.
    if (RATE_PRESETS.some((preset) => preset === stored)) return stored;
  } catch {
    // localStorage can throw in restrictive contexts; fall through to default.
  }
  return 1;
}
function saveRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // Persisting is best-effort; playback still works this session.
  }
}

type Status = "idle" | "loading" | "playing" | "paused" | "error";

interface PlayerState {
  status: Status;
  /** Thread the audio belongs to, so switching away can stop it. */
  threadId: string | null;
  label: string;
  error: string | null;
  position: number;
  /** End of buffered audio — the hard ceiling for forward seeking. */
  bufferedEnd: number;
  rate: number;
}

const IDLE: Omit<PlayerState, "rate"> = {
  status: "idle",
  threadId: null,
  label: "",
  error: null,
  position: 0,
  bufferedEnd: 0,
};

let state: PlayerState = { ...IDLE, rate: 1 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getState(): PlayerState {
  return state;
}
function emit(): void {
  for (const listener of listeners) listener();
}
function setState(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  emit();
}

/**
 * Guards against a stale request finishing after a stop. Without it, pressing
 * Stop during /prepare lets the response arrive and start playing anyway.
 */
let generation = 0;

/** One element for the whole app, created lazily on first use. */
let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
  if (audio !== null) return audio;
  const element = new Audio();
  element.preload = "none";
  // Without this, speeding up a voice raises its pitch.
  element.preservesPitch = true;

  const syncProgress = () => {
    const bufferedEnd =
      element.buffered.length > 0
        ? element.buffered.end(element.buffered.length - 1)
        : 0;
    setState({ position: element.currentTime, bufferedEnd });
  };

  element.addEventListener("playing", () => {
    setState({ status: "playing", error: null });
  });
  element.addEventListener("pause", () => {
    // Clearing src to stop also fires "pause". Only a pause on a still-loaded
    // element is a real pause; otherwise stop() already set the state.
    if (element.getAttribute("src") !== null && !element.ended) {
      setState({ status: "paused" });
    }
  });
  element.addEventListener("ended", () => {
    stop();
  });
  element.addEventListener("timeupdate", syncProgress);
  element.addEventListener("progress", syncProgress);
  element.addEventListener("error", () => {
    // A cleared src reports MEDIA_ELEMENT_ERROR; that is our own teardown.
    if (element.getAttribute("src") === null) return;
    setState({
      status: "error",
      error: "Playback failed. Check `bb read-aloud status`.",
    });
  });
  audio = element;
  return element;
}

/**
 * Stops playback and aborts the in-flight response. Clearing src + load() is
 * what tears down the HTTP connection, which runs the server stream's cancel()
 * and kills the synth processes — so stopping a long read costs nothing.
 */
function stop(): void {
  generation += 1;
  const element = audio;
  if (element !== null) {
    element.pause();
    element.removeAttribute("src");
    element.load();
  }
  state = { ...IDLE, rate: state.rate };
  emit();
}

function pause(): void {
  audio?.pause();
}

function resume(): void {
  void audio?.play().catch(() => {
    setState({ status: "error", error: "Could not resume playback." });
  });
}

/**
 * Seeks within what has been received.
 *
 * The response is chunked with no Content-Length, so the element has no
 * duration and cannot seek past what it already holds. Backward always works;
 * forward is clamped to the buffered edge, which the synth pipeline usually
 * keeps ahead of playback but never guarantees.
 */
function seekBy(delta: number): void {
  const element = audio;
  if (element === null) return;
  const ceiling =
    element.buffered.length > 0
      ? element.buffered.end(element.buffered.length - 1)
      : element.currentTime;
  // Leave a small margin: seeking exactly to the buffered edge can stall.
  const target = Math.min(
    Math.max(0, element.currentTime + delta),
    Math.max(0, ceiling - 0.35),
  );
  try {
    element.currentTime = target;
    setState({ position: target });
  } catch {
    // Not seekable yet; leave playback untouched.
  }
}

function cycleRate(): void {
  const index = RATE_PRESETS.indexOf(
    state.rate as (typeof RATE_PRESETS)[number],
  );
  const next = RATE_PRESETS[(index + 1) % RATE_PRESETS.length] ?? 1;
  if (audio !== null) audio.playbackRate = next;
  saveRate(next);
  setState({ rate: next });
}

async function speak(input: {
  threadId: string;
  text: string;
  label: string;
}): Promise<void> {
  stop();
  const mine = ++generation;
  setState({
    status: "loading",
    threadId: input.threadId,
    label: input.label,
    error: null,
    position: 0,
    bufferedEnd: 0,
  });

  try {
    const response = await fetch(`${PLUGIN_ROUTE}/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(detail.error ?? `prepare failed (${response.status})`);
    }
    const { id } = (await response.json()) as { id: string };
    if (mine !== generation) return; // Stopped while preparing.

    const element = ensureAudio();
    element.src = `${PLUGIN_ROUTE}/stream?id=${encodeURIComponent(id)}`;
    // Apply the stored preference before play(), including on a fresh element.
    element.playbackRate = state.rate;
    await element.play();
  } catch (cause) {
    if (mine !== generation) return;
    setState({
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** Circular arrow with the jump size inside it, mirrored for forward. */
function SeekGlyph({ forward }: { forward: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-full", forward && "-scale-x-100")}
      fill="none"
      aria-hidden
    >
      <path
        d="M12 5.2a6.8 6.8 0 1 0 6.6 8.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 2.4v5.6h5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="11.6"
        y="16.6"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="650"
        fill="currentColor"
        stroke="none"
        // Counter-mirror so "10" stays readable on the forward button.
        transform={forward ? "translate(23.2,0) scale(-1,1)" : undefined}
      >
        10
      </text>
    </svg>
  );
}

function TransportButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS,
        "flex shrink-0 items-center justify-center",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}

/** The floating transport. Renders nothing unless audio is active. */
function ReadAloudPlayer() {
  const player = useSyncExternalStore(subscribe, getState, getState);
  const { threadId } = useBbContext();

  // Apply the stored speed once, before anything plays.
  useEffect(() => {
    const stored = loadRate();
    if (stored !== getState().rate) setState({ rate: stored });
  }, []);

  // Auto-stop on navigating away from the thread being read.
  useEffect(() => {
    if (player.threadId === null) return;
    if (threadId !== null && threadId !== player.threadId) stop();
  }, [threadId, player.threadId]);

  // Auto-stop when a new prompt starts this thread running. The server
  // publishes on thread.active; we only care about the thread we are reading.
  useRealtime(STOP_CHANNEL, (payload) => {
    const signal = payload as { threadId?: unknown } | null;
    const target =
      signal !== null && typeof signal.threadId === "string"
        ? signal.threadId
        : null;
    if (target !== null && target === getState().threadId) stop();
  });

  if (player.status === "idle") return null;

  const isError = player.status === "error";
  const isBusy = player.status === "loading";
  // Forward is only possible into audio we already hold.
  const canSeekForward =
    !isBusy && player.bufferedEnd - player.position > SEEK_SECONDS * 0.5;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed left-1/2 z-50 -translate-x-1/2",
        // Clear the composer on phones, and never sit under the home bar.
        "bottom-[max(1rem,env(safe-area-inset-bottom))]",
        "max-md:bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
        "max-w-[calc(100vw-1.5rem)]",
        "bg-popover text-popover-foreground flex items-center gap-0.5",
        "rounded-full border py-1.5 pr-1.5 pl-3 shadow-lg",
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        name={isBusy ? "Loading" : "Play"}
        className={cn(
          "mr-1 size-3.5 shrink-0",
          isBusy && "animate-spin",
          isError ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      />

      {/* The label is the first thing to go on a narrow screen. */}
      <span
        className={cn(
          "mr-1 truncate text-xs",
          isError ? "max-w-[16rem]" : "hidden max-w-[14rem] sm:inline",
        )}
      >
        {isError
          ? (player.error ?? "Playback failed")
          : isBusy
            ? `Preparing ${player.label}…`
            : `Reading ${player.label}`}
      </span>

      {!isError && (
        <>
          {!isBusy && (
            <span className="text-muted-foreground mr-0.5 shrink-0 text-xs tabular-nums">
              {formatClock(player.position)}
            </span>
          )}

          <TransportButton
            onClick={() => seekBy(-SEEK_SECONDS)}
            label="Back 10 seconds"
            disabled={isBusy}
          >
            <span className="size-4 max-md:pointer-coarse:size-5">
              <SeekGlyph forward={false} />
            </span>
          </TransportButton>

          {player.status === "paused" ? (
            <TransportButton onClick={resume} label="Resume">
              <Icon
                name="Play"
                className="size-4 max-md:pointer-coarse:size-5"
                aria-hidden
              />
            </TransportButton>
          ) : (
            <TransportButton onClick={pause} label="Pause" disabled={isBusy}>
              <Icon
                name="Pause"
                className="size-4 max-md:pointer-coarse:size-5"
                aria-hidden
              />
            </TransportButton>
          )}

          <TransportButton
            onClick={() => seekBy(SEEK_SECONDS)}
            label="Forward 10 seconds"
            disabled={!canSeekForward}
          >
            <span className="size-4 max-md:pointer-coarse:size-5">
              <SeekGlyph forward />
            </span>
          </TransportButton>

          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${player.rate}x, tap to change`}
            title="Playback speed"
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "focus-visible:ring-ring shrink-0 rounded-md transition-colors",
              "focus-visible:ring-2 focus-visible:outline-none",
              "h-7 min-w-9 px-1 text-xs font-medium tabular-nums",
              "max-md:pointer-coarse:h-9 max-md:pointer-coarse:min-w-11 max-md:pointer-coarse:text-sm",
            )}
          >
            {player.rate}×
          </button>
        </>
      )}

      <TransportButton onClick={stop} label={isError ? "Dismiss" : "Stop"}>
        <Icon
          name="Square"
          className="size-4 max-md:pointer-coarse:size-5"
          aria-hidden
        />
      </TransportButton>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageAction({
    id: "read-aloud",
    title: "Read aloud",
    run: ({ threadId, message, selectedText }) => {
      // Invoked from the selection menu, read only what is highlighted.
      const selection = selectedText?.trim() ?? "";
      const text = selection !== "" ? selection : message.text;
      const label =
        selection !== ""
          ? "selection"
          : message.role === "assistant"
            ? "assistant message"
            : "your message";
      void speak({ threadId, text, label });
    },
  });

  app.slots.experimental_appOverlay({
    id: "read-aloud-player",
    component: ReadAloudPlayer,
  });
});
