// Following the brain thread's output as it is written.
//
// The brain is an ordinary BB thread. Its reply is persisted as a stream of
// `item/agentMessage/delta` events, and BB tells plugins (at most once a
// second) that a thread's event sequence advanced. BrainFollower reads the new
// rows on each such notification and turns them into whole sentences, so Jarvis
// starts speaking on the first finished sentence instead of the last.
//
// Rows are untrusted JSON from the SDK, so every field is checked where it is
// read instead of trusting a cast.
import { EVENT_PREFIX } from "./relay";
import { isSilentReply, SentenceStream } from "./speech";

/** The row fields the follower reads. */
export interface EventRow {
  seq: number;
  type: string;
  data: unknown;
  scope?: unknown;
}

export type BrainPhase = "thinking" | "idle";

export interface Sentence {
  /** The brain turn this sentence belongs to. */
  turnId: string;
  /** Monotonic within the turn, so the client can order and dedupe. */
  index: number;
  /** Markdown as the brain wrote it. */
  text: string;
  /** True when the turn answers other threads' events rather than the user. */
  announcement: boolean;
}

export interface BrainSink {
  sentence(sentence: Sentence): void;
  phase(phase: BrainPhase, turnId: string | null): void;
}

export const FOLLOWED_TYPES = [
  "client/turn/requested",
  "turn/started",
  "item/agentMessage/delta",
  "item/completed",
  "turn/completed",
] as const;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The plain text of a turn request's input blocks. */
function inputText(data: unknown): string {
  const input = field(data, "input");
  if (!Array.isArray(input)) return "";
  return input.map((block) => text(field(block, "text"))).join("\n");
}

export class BrainFollower {
  private turnId: string | null = null;
  private index = 0;
  private announcement = false;
  /** Set when the next requested turn is an announcement, before it starts. */
  private pendingAnnouncement = false;
  private muted = false;
  /** Whether the current turn has said anything yet; "(silent)" only counts first. */
  private spoke = false;
  private readonly streams = new Map<string, SentenceStream>();
  /** Items whose text arrived as deltas; their completion carries nothing new. */
  private readonly streamed = new Set<string>();

  private readonly sink: BrainSink;

  constructor(sink: BrainSink) {
    this.sink = sink;
  }

  /** Drops the rest of the current turn's speech, e.g. when the user barges in. */
  interrupt(): void {
    this.muted = true;
  }

  get currentTurnId(): string | null {
    return this.turnId;
  }

  apply(row: EventRow): void {
    switch (row.type) {
      case "client/turn/requested":
        this.pendingAnnouncement = inputText(row.data).startsWith(EVENT_PREFIX);
        return;
      case "turn/started": {
        const turnId = text(field(row.scope, "turnId")) || `seq-${row.seq}`;
        this.turnId = turnId;
        this.index = 0;
        this.announcement = this.pendingAnnouncement;
        this.pendingAnnouncement = false;
        this.muted = false;
        this.spoke = false;
        this.streams.clear();
        this.streamed.clear();
        this.sink.phase("thinking", turnId);
        return;
      }
      case "item/agentMessage/delta": {
        const itemId = text(field(row.data, "itemId"));
        const delta = text(field(row.data, "delta"));
        if (itemId === "" || delta === "") return;
        this.streamed.add(itemId);
        this.emit(this.stream(itemId).push(delta));
        return;
      }
      case "item/completed": {
        const item = field(row.data, "item");
        if (text(field(item, "type")) !== "agentMessage") return;
        const itemId = text(field(item, "id"));
        if (this.streamed.has(itemId)) {
          this.emit(this.stream(itemId).flush());
        } else {
          // A provider that reports the message whole, with no deltas.
          const stream = new SentenceStream();
          this.emit([...stream.push(text(field(item, "text"))), ...stream.flush()]);
        }
        this.streams.delete(itemId);
        return;
      }
      case "turn/completed":
        for (const stream of this.streams.values()) this.emit(stream.flush());
        this.streams.clear();
        this.sink.phase("idle", this.turnId);
        return;
      default:
        return;
    }
  }

  private stream(itemId: string): SentenceStream {
    let stream = this.streams.get(itemId);
    if (stream === undefined) {
      stream = new SentenceStream();
      this.streams.set(itemId, stream);
    }
    return stream;
  }

  private emit(sentences: readonly string[]): void {
    for (const sentence of sentences) {
      if (!this.spoke && isSilentReply(sentence)) {
        // The brain decided an event batch was not worth interrupting for.
        this.muted = true;
        continue;
      }
      this.spoke = true;
      if (this.muted || this.turnId === null) continue;
      this.sink.sentence({
        turnId: this.turnId,
        index: this.index,
        text: sentence,
        announcement: this.announcement,
      });
      this.index += 1;
    }
  }
}
