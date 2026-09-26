// Realtime channel names and payloads shared by server.ts and the frontend.
// A separate module so the browser bundle never imports server code.
import type { BrainPhase, Sentence } from "./brain";

export const CHANNELS = {
  /** One sentence of Jarvis's reply, ready to speak. */
  say: "jarvis/say",
  /** The brain started or finished a turn. */
  phase: "jarvis/phase",
  /** Something for the screen, from the jarvis_show tool. */
  visual: "jarvis/visual",
  /** The brain thread was created. */
  brain: "jarvis/brain",
} as const;

export interface SayPayload extends Sentence {
  speakable: string;
}
export interface PhasePayload {
  phase: BrainPhase;
  turnId: string | null;
}
export interface VisualPayload {
  title: string | null;
  markdown: string | null;
}
export interface BrainPayload {
  brainThreadId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Realtime payloads cross the network, so the frontend checks their shape
// before trusting them.

export function isSayPayload(value: unknown): value is SayPayload {
  return (
    isRecord(value) &&
    typeof value["turnId"] === "string" &&
    typeof value["index"] === "number" &&
    typeof value["text"] === "string" &&
    typeof value["speakable"] === "string" &&
    typeof value["announcement"] === "boolean"
  );
}

export function isPhasePayload(value: unknown): value is PhasePayload {
  return (
    isRecord(value) &&
    (value["phase"] === "thinking" || value["phase"] === "idle") &&
    (typeof value["turnId"] === "string" || value["turnId"] === null)
  );
}

export function isVisualPayload(value: unknown): value is VisualPayload {
  return (
    isRecord(value) &&
    (typeof value["title"] === "string" || value["title"] === null) &&
    (typeof value["markdown"] === "string" || value["markdown"] === null)
  );
}

export function isBrainPayload(value: unknown): value is BrainPayload {
  return isRecord(value) && typeof value["brainThreadId"] === "string";
}
