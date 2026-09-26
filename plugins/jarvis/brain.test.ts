import { describe, expect, it } from "vitest";
import { BrainFollower, type BrainPhase, type EventRow, type Sentence } from "./brain";
import { EVENT_PREFIX, VOICE_PREFIX } from "./relay";

function harness() {
  const sentences: Sentence[] = [];
  const phases: BrainPhase[] = [];
  const follower = new BrainFollower({
    sentence: (sentence) => sentences.push(sentence),
    phase: (phase) => phases.push(phase),
  });
  let seq = 0;
  const row = (type: string, data: unknown, scope?: unknown): EventRow => {
    seq += 1;
    return { seq, type, data, scope };
  };
  const turn = (input: string, deltas: string[], turnId = "t1") => {
    follower.apply(row("client/turn/requested", { input: [{ type: "text", text: input }] }));
    follower.apply(row("turn/started", {}, { kind: "turn", turnId }));
    for (const delta of deltas) {
      follower.apply(row("item/agentMessage/delta", { itemId: "i1", delta }));
    }
    follower.apply(
      row("item/completed", { item: { type: "agentMessage", id: "i1", text: deltas.join("") } }),
    );
    follower.apply(row("turn/completed", {}));
  };
  return { follower, sentences, phases, row, turn };
}

describe("BrainFollower", () => {
  it("speaks each sentence as soon as it is complete, in order", () => {
    const { sentences, phases, turn } = harness();
    turn(`${VOICE_PREFIX} status?`, ["All quiet. Two thr", "eads finished. Nothing needs you."]);
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      "All quiet.",
      "Two threads finished.",
      "Nothing needs you.",
    ]);
    expect(sentences.map((sentence) => sentence.index)).toEqual([0, 1, 2]);
    expect(phases).toEqual(["thinking", "idle"]);
  });

  it("marks replies to other threads' events as announcements", () => {
    const { sentences, turn } = harness();
    turn(`${EVENT_PREFIX} 1 update`, ["Nitro is asking to run the tests. "]);
    expect(sentences[0]?.announcement).toBe(true);
  });

  it("stays quiet when the brain answers an event batch with (silent)", () => {
    const { sentences, turn } = harness();
    turn(`${EVENT_PREFIX} 1 update`, ["(silent)"]);
    expect(sentences).toEqual([]);
  });

  it("drops the rest of a reply after an interrupt, and speaks the next turn", () => {
    const { follower, sentences, row, turn } = harness();
    follower.apply(row("turn/started", {}, { turnId: "t1" }));
    follower.apply(row("item/agentMessage/delta", { itemId: "i1", delta: "First. " }));
    follower.interrupt();
    follower.apply(row("item/agentMessage/delta", { itemId: "i1", delta: "Second. " }));
    follower.apply(row("turn/completed", {}));
    turn(`${VOICE_PREFIX} go on`, ["Next turn."], "t2");
    expect(sentences.map((sentence) => sentence.text)).toEqual(["First.", "Next turn."]);
  });

  it("speaks a message that arrives whole, with no deltas", () => {
    const { follower, sentences, row } = harness();
    follower.apply(row("turn/started", {}, { turnId: "t1" }));
    follower.apply(
      row("item/completed", { item: { type: "agentMessage", id: "i9", text: "Hello there. Bye." } }),
    );
    expect(sentences.map((sentence) => sentence.text)).toEqual(["Hello there.", "Bye."]);
  });

  it("does not repeat a streamed message when its completion arrives", () => {
    const { sentences, turn } = harness();
    turn(`${VOICE_PREFIX} hi`, ["Hi there."]);
    expect(sentences.map((sentence) => sentence.text)).toEqual(["Hi there."]);
  });
});
