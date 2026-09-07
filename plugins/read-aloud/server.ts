// bb-plugin-read-aloud — backend entry.
//
// Streams neural TTS audio for a chat message. Two routes, deliberately:
//
//   POST /prepare  { text }  -> { id }
//   GET  /stream?id=<id>     -> audio/mpeg, streamed
//
// A single GET would be simpler, but message text runs to tens of thousands of
// characters and would not survive a URL. The frontend POSTs the text, gets a
// short-lived job id, then points playback at /stream. That matters for more
// than size: streaming the response is what makes playback start in ~1.5s
// instead of after a full synthesis. Aborting the request runs the stream's
// cancel() below and closes the synthesis socket mid-sentence.
//
// Synthesis is native (see synth.ts) — no Python, no external binary.
import { randomUUID } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  activeClientVersion,
  configureClientVersion,
  listVoices,
  synthesize,
} from "./synth";

/** Frontend listens on this and stops playback. */
const STOP_CHANNEL = "read-aloud/stop";

interface Job {
  text: string;
  createdAt: number;
}

const JOB_TTL_MS = 10 * 60_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_JOBS = 32;

export const rpcContract = defineRpcContract({
  status: {
    input: z.null(),
    output: z.object({
      ready: z.boolean(),
      voice: z.string(),
      detail: z.string(),
    }),
  },
});

/**
 * Markdown is written to be read, not heard. Left raw, a TTS engine says
 * "hash hash Loose ends" and spells out URLs a character at a time. This
 * flattens the message into something speakable while keeping the prose.
 */
export function toSpeakable(markdown: string): string {
  let text = markdown;

  // Fenced code: unspeakable by nature. Replace with a short spoken marker
  // rather than dropping it silently, so the listener knows something was cut.
  text = text.replace(/```[\s\S]*?```/g, "\n(code block omitted)\n");
  text = text.replace(/~~~[\s\S]*?~~~/g, "\n(code block omitted)\n");

  // Images before links: an image's alt text is rarely worth speaking.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Links -> their label. A bare autolink keeps nothing worth saying.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/<https?:\/\/[^>]+>/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");

  // Inline code -> its contents. Identifiers read better than backticks.
  text = text.replace(/`([^`]+)`/g, "$1");

  // Tables: keep the cells as a clause, drop the pipes and separator rows.
  text = text
    .split("\n")
    .filter((line) => !/^\s*\|?[\s:|-]{6,}\|?\s*$/.test(line))
    .map((line) =>
      /^\s*\|.*\|\s*$/.test(line)
        ? line
            .replace(/^\s*\|/, "")
            .replace(/\|\s*$/, "")
            .split("|")
            .map((cell) => cell.trim())
            .filter(Boolean)
            .join(", ") + "."
        : line,
    )
    .join("\n");

  // Headings become their own sentence so the voice lands a full stop.
  text = text.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, "$1.");
  // Blockquote and list markers.
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "");
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, "");
  // Horizontal rules.
  text = text.replace(/^\s{0,3}([-*_]\s*){3,}$/gm, "");
  // Emphasis / strikethrough markers, keeping the words.
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  // Leftover HTML tags.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // Collapse whitespace; a blank line becomes a paragraph break, which the
  // synth renders as a longer pause than a newline would.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/ *\n */g, "\n");
  // "..." reads as a stumble; a period is cleaner.
  text = text.replace(/\.{3,}/g, ".");
  return text.trim();
}

/** Pulls just enough of a synthesis to prove the handshake works. */
async function probeSynthesis(voice: string, rate: string): Promise<void> {
  for await (const chunk of synthesize({ text: "ok", voice, rate })) {
    if (chunk.length > 0) return;
  }
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    voice: {
      type: "string",
      label: "Voice",
      description:
        'Microsoft neural voice, e.g. en-US-AndrewMultilingualNeural. Run "bb read-aloud voices" to list them.',
      default: "en-US-AndrewMultilingualNeural",
    },
    rate: {
      type: "string",
      label: "Rate",
      description:
        'Synthesis speed, e.g. "+8%" or "-10%". Empty means the natural pace. Playback speed is separate, in the player.',
      default: "+8%",
    },
    clientVersion: {
      type: "string",
      label: "Client version override",
      description:
        "Advanced. Pin the Sec-MS-GEC client version, e.g. 143.0.3650.75. Leave empty to negotiate automatically, which is almost always right.",
      default: "",
    },
  });

  // Client-version rot handling. The service enforces a minimum version and no
  // maximum, so a pin that falls below the floor is recoverable by escalating.
  // Remember whatever worked, so the retry cost is paid once per install
  // instead of once per synthesis. An explicit override skips negotiation.
  const LEARNED_VERSION_KEY = "client-version";
  const initial = await settings.get();
  configureClientVersion({
    override: initial.clientVersion,
    learned: await bb.storage.kv.get<string>(LEARNED_VERSION_KEY),
    onLearned: (version) => {
      bb.log.info(`negotiated a newer client version: ${version}`);
      void bb.storage.kv.set(LEARNED_VERSION_KEY, version);
    },
  });

  const jobs = new Map<string, Job>();

  function sweepJobs(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
    // Hard cap, oldest first, so a client that never plays cannot grow this.
    while (jobs.size > MAX_JOBS) {
      const oldest = [...jobs.entries()].sort(
        (a, b) => a[1].createdAt - b[1].createdAt,
      )[0];
      if (oldest === undefined) break;
      jobs.delete(oldest[0]);
    }
  }

  bb.rpc.register(rpcContract, {
    status: async () => {
      const { voice, rate } = await settings.get();
      try {
        await probeSynthesis(voice, rate);
        return {
          ready: true,
          voice,
          detail: `synthesis reachable (client ${activeClientVersion()})`,
        };
      } catch (cause) {
        return {
          ready: false,
          voice,
          detail:
            cause instanceof Error
              ? `synthesis failed: ${cause.message}`
              : "synthesis failed",
        };
      }
    },
  });

  bb.http.route(
    "POST",
    "/prepare",
    async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      const parsed = z.object({ text: z.string() }).safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "expected { text: string }" }, 400);
      }
      const text = toSpeakable(parsed.data.text).slice(0, MAX_TEXT_CHARS);
      if (text === "") return context.json({ error: "nothing to speak" }, 400);

      sweepJobs();
      const id = randomUUID();
      jobs.set(id, { text, createdAt: Date.now() });
      return context.json({ id, characters: text.length });
    },
    { auth: "local" },
  );

  bb.http.route(
    "GET",
    "/stream",
    async (context) => {
      const id = context.req.query("id") ?? "";
      const job = jobs.get(id);
      if (job === undefined) return context.text("unknown or expired job", 404);

      const { voice, rate } = await settings.get();

      // The job is single-use: replaying re-prepares. Keeps the map small and
      // makes a stale id fail loudly instead of re-synthesizing on a stray GET.
      jobs.delete(id);

      // The service streams a whole request incrementally — measured at ~1.5s
      // to first byte and ~4.75x realtime for a six-minute message — so there
      // is no need to split the text or stitch parts together. One request, one
      // continuous MP3 stream, and therefore no per-part headers to strip.
      const controller = new AbortController();

      const stream = new ReadableStream<Uint8Array>({
        async start(sink) {
          try {
            for await (const chunk of synthesize({
              text: job.text,
              voice,
              rate,
              signal: controller.signal,
            })) {
              if (controller.signal.aborted) break;
              sink.enqueue(chunk);
            }
            if (!controller.signal.aborted) sink.close();
          } catch (cause) {
            bb.log.error(
              `synthesis failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
            try {
              sink.error(cause);
            } catch {
              // Already closed or errored.
            }
          }
        },
        // Stop aborts this response. Closing the socket is what makes stopping
        // free rather than letting a twelve minute synthesis finish unheard.
        cancel() {
          controller.abort();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    },
    { auth: "local" },
  );

  // Auto-stop when the user sends a new prompt. Doing this server-side covers
  // every composer surface and layout, which a frontend-only submit hook would
  // not. The frontend filters on threadId so background threads do not
  // interrupt listening.
  bb.events.on("thread.active", ({ thread }) => {
    bb.realtime.publish(STOP_CHANNEL, {
      reason: "thread-active",
      threadId: thread.id,
    });
  });

  bb.cli.register({
    name: "read-aloud",
    summary: "Inspect the Read Aloud plugin's speech setup",
    commands: [
      {
        name: "status",
        summary: "Check that synthesis is reachable",
        usage: "bb read-aloud status",
      },
      {
        name: "voices",
        summary: "List available neural voices",
        usage: "bb read-aloud voices [filter]",
      },
    ],
    async run(argv) {
      const [command, ...args] = argv;
      switch (command) {
        case "status": {
          const { voice, rate } = await settings.get();
          try {
            await probeSynthesis(voice, rate);
            return {
              exitCode: 0,
              stdout: [
                "synthesis: reachable (native, no external binary)",
                `voice:     ${voice}`,
                `rate:      ${rate || "(natural)"}`,
                `client:    ${activeClientVersion()}${initial.clientVersion.trim() === "" ? " (negotiated)" : " (pinned)"}`,
              ].join("\n"),
            };
          } catch (cause) {
            return {
              exitCode: 1,
              stderr: [
                `synthesis unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
                "If this looks like a refused handshake, bump CHROMIUM_VERSION in synth.ts.",
              ].join("\n"),
            };
          }
        }
        case "voices": {
          const filter = (args[0] ?? "en-").toLowerCase();
          try {
            const voices = await listVoices();
            const rows = voices
              .filter(
                (voice) =>
                  voice.shortName.toLowerCase().includes(filter) ||
                  voice.locale.toLowerCase().includes(filter),
              )
              .map(
                (voice) =>
                  `${voice.shortName.padEnd(38)} ${voice.gender.padEnd(7)} ${voice.personalities}`,
              );
            return {
              exitCode: 0,
              stdout: rows.join("\n") || "No matching voices.",
            };
          } catch (cause) {
            return {
              exitCode: 1,
              stderr: cause instanceof Error ? cause.message : String(cause),
            };
          }
        }
        default:
          return {
            exitCode: 1,
            stderr:
              "Usage:\n  bb read-aloud status\n  bb read-aloud voices [filter]",
          };
      }
    },
  });

  bb.onDispose(() => {
    jobs.clear();
  });
}
