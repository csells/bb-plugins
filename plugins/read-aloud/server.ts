// bb-plugin-read-aloud — backend entry.
//
// Streams neural TTS audio for a chat message. Two routes, deliberately:
//
//   POST /prepare  { text }  -> { id }
//   GET  /stream?id=<id>     -> audio/mpeg, streamed
//
// A single GET would be simpler, but message text runs to tens of thousands of
// characters and would not survive a URL. The frontend POSTs the text, gets a
// short-lived job id, then points an <audio> element at /stream. That matters
// for more than size: an <audio> element can only issue a GET, and pointing it
// at a streaming response is what makes playback start in ~1s instead of after
// a full synthesis. Clearing the element's src aborts the HTTP request, which
// runs the stream's cancel() below and kills the synth process mid-sentence.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Frontend listens on this and stops playback. */
const STOP_CHANNEL = "read-aloud/stop";

/** A prepared job. Text only — synthesis happens on GET /stream. */
interface Job {
  text: string;
  createdAt: number;
}

const JOB_TTL_MS = 10 * 60_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_JOBS = 32;

export const rpcContract = defineRpcContract({
  /** Frontend preflight: is a synth binary actually present? */
  status: {
    input: z.null(),
    output: z.object({
      ready: z.boolean(),
      binary: z.string().nullable(),
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
        ? line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")
            .map((cell) => cell.trim()).filter(Boolean).join(", ") + "."
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

/**
 * Splits text for synthesis. The first chunk is deliberately tiny.
 *
 * edge-tts returns a chunk's audio only when that chunk is fully synthesized,
 * and synthesis runs at roughly 1.6x realtime with ~1.6s of fixed startup.
 * Handing it the whole message means the first byte lands 11+ seconds after
 * the click. A one-sentence opener returns in under two seconds, and because
 * synthesis outpaces playback, later chunks finish while earlier ones are
 * still being heard.
 */
export function splitForSynthesis(text: string): string[] {
  const FIRST_TARGET = 160;
  const REST_TARGET = 700;
  // Keep the delimiter with its sentence; fall back to the whole text.
  const pieces = text.match(/[^.!?\n]+[.!?]*[ \t]*\n?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    const target = chunks.length === 0 ? FIRST_TARGET : REST_TARGET;
    if (current !== "" && current.length + piece.length > target) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current.trim() !== "") chunks.push(current.trim());
  return chunks.filter((chunk) => chunk !== "");
}

/**
 * Strips ID3v2 and a leading Xing/Info frame.
 *
 * MP3 has no global header — only per-frame headers — so concatenated parts
 * play, but a per-chunk Xing header mid-stream describes only its own chunk and
 * makes decoders miscompute duration and seeking. Dropping them leaves one
 * clean CBR frame stream.
 */
export function stripMp3Headers(data: Uint8Array): Uint8Array {
  let index = 0;
  if (
    data.length > 10 &&
    data[0] === 0x49 &&
    data[1] === 0x44 &&
    data[2] === 0x33
  ) {
    const size =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f);
    index = 10 + size;
  }
  while (
    index < data.length - 4 &&
    !(data[index] === 0xff && (data[index + 1] & 0xe0) === 0xe0)
  ) {
    index += 1;
  }
  const head = Buffer.from(
    data.subarray(index, Math.min(index + 200, data.length)),
  ).toString("latin1");
  if (head.includes("Xing") || head.includes("Info")) {
    let next = index + 4;
    while (
      next < data.length - 4 &&
      !(data[next] === 0xff && (data[next + 1] & 0xe0) === 0xe0)
    ) {
      next += 1;
    }
    index = next;
  }
  return data.subarray(index);
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
      description: 'Speed adjustment, e.g. "+8%" or "-10%". Empty means default pace.',
      default: "+8%",
    },
    binaryPath: {
      type: "string",
      label: "edge-tts path",
      description:
        "Absolute path to the edge-tts executable. Leave empty to search PATH.",
      default: "",
    },
  });

  /** Candidate binaries, most specific first. */
  async function resolveBinary(): Promise<string | null> {
    const { binaryPath } = await settings.get();
    const candidates = [
      binaryPath.trim(),
      join(process.env.HOME ?? "", ".local/share/edge-tts-venv/bin/edge-tts"),
      "/opt/homebrew/bin/edge-tts",
      "/usr/local/bin/edge-tts",
    ].filter((candidate) => candidate !== "");

    for (const candidate of candidates) {
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }
    // Fall back to PATH resolution by spawn.
    return "edge-tts";
  }

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
      const { voice } = await settings.get();
      const binary = await resolveBinary();
      const probe = await new Promise<string>((resolve) => {
        const child = spawn(binary ?? "edge-tts", ["--help"], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("error", (cause: Error) => resolve(cause.message));
        child.on("close", (code) => resolve(code === 0 ? "" : `exit ${code}`));
      });
      return probe === ""
        ? { ready: true, binary, voice, detail: "ready" }
        : {
            ready: false,
            binary,
            voice,
            detail: `edge-tts not runnable (${probe}). Install it and set the path in settings.`,
          };
    },
  });

  bb.http.route(
    "POST",
    "/prepare",
    async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      const parsed = z
        .object({ text: z.string() })
        .safeParse(body);
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
      const binary = (await resolveBinary()) ?? "edge-tts";
      const chunks = splitForSynthesis(job.text);

      // The job is single-use: replaying re-prepares. Keeps the map small and
      // makes a stale id fail loudly instead of re-synthesizing on a stray GET.
      jobs.delete(id);

      const dir = await mkdtemp(join(tmpdir(), "bb-read-aloud-"));
      const live = new Set<ChildProcess>();
      let aborted = false;
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        void rm(dir, { recursive: true, force: true }).catch(() => {});
      };

      /**
       * Synthesizes one chunk to a buffer. Never rejects: a queued promise that
       * rejected while we were awaiting an earlier chunk would surface as an
       * unhandled rejection, so failures come back as a value instead.
       */
      const synth = async (
        text: string,
        index: number,
      ): Promise<{ audio: Uint8Array; error: string | null }> => {
        // edge-tts takes text via -f. A temp file avoids both argv limits and
        // any quoting question for text we did not author.
        const textPath = join(dir, `chunk-${index}.txt`);
        try {
          await writeFile(textPath, text, "utf8");
        } catch (cause) {
          return {
            audio: new Uint8Array(),
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }
        if (aborted) return { audio: new Uint8Array(), error: null };

        const args = [
          "--voice",
          voice,
          "-f",
          textPath,
          "--write-media",
          "/dev/stdout",
        ];
        if (rate.trim() !== "") args.push(`--rate=${rate.trim()}`);

        return await new Promise((resolve) => {
          const child = spawn(binary, args, {
            stdio: ["ignore", "pipe", "pipe"],
          });
          live.add(child);
          const parts: Buffer[] = [];
          let stderr = "";
          child.stdout.on("data", (part: Buffer) => parts.push(part));
          child.stderr.on("data", (part: Buffer) => {
            if (stderr.length < 2_000) stderr += part.toString("utf8");
          });
          child.on("error", (cause: Error) => {
            live.delete(child);
            resolve({ audio: new Uint8Array(), error: cause.message });
          });
          child.on("close", (code) => {
            live.delete(child);
            if (aborted) {
              resolve({ audio: new Uint8Array(), error: null });
              return;
            }
            if (code !== 0) {
              resolve({
                audio: new Uint8Array(),
                error: stderr.trim() || `edge-tts exited ${code}`,
              });
              return;
            }
            resolve({
              audio: stripMp3Headers(new Uint8Array(Buffer.concat(parts))),
              error: null,
            });
          });
        });
      };

      // Synthesize ahead of playback. Depth 3 keeps the buffer full without
      // running the whole message when the listener stops after one sentence.
      const LOOKAHEAD = 3;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const queue: Promise<{ audio: Uint8Array; error: string | null }>[] =
            [];
          let next = 0;
          const fill = () => {
            while (queue.length < LOOKAHEAD && next < chunks.length) {
              queue.push(synth(chunks[next] ?? "", next));
              next += 1;
            }
          };
          fill();

          try {
            while (queue.length > 0) {
              const result = await queue.shift();
              if (aborted || result === undefined) break;
              if (result.error !== null) {
                bb.log.error("synth chunk failed", { error: result.error });
                // Partial audio already sent is better than a hard failure, so
                // stop cleanly rather than erroring the stream mid-sentence.
                break;
              }
              if (result.audio.length > 0) controller.enqueue(result.audio);
              fill();
            }
            if (!aborted) controller.close();
          } catch (cause) {
            try {
              controller.error(cause);
            } catch {
              // Already closed or errored.
            }
          } finally {
            cleanup();
          }
        },
        // The Stop button clears the <audio> src, which aborts this response.
        // Killing every live child is what makes stopping free rather than
        // letting a 12-minute synthesis run to completion unheard.
        cancel() {
          aborted = true;
          for (const child of live) child.kill("SIGKILL");
          live.clear();
          cleanup();
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
    bb.realtime.publish(STOP_CHANNEL, { reason: "thread-active", threadId: thread.id });
  });

  bb.cli.register({
    name: "read-aloud",
    summary: "Inspect the Read Aloud plugin's speech setup",
    commands: [
      { name: "status", summary: "Check that edge-tts is runnable", usage: "bb read-aloud status" },
      { name: "voices", summary: "List available neural voices", usage: "bb read-aloud voices [filter]" },
    ],
    async run(argv) {
      const [command, ...args] = argv;
      const binary = (await resolveBinary()) ?? "edge-tts";
      switch (command) {
        case "status": {
          const { voice, rate } = await settings.get();
          return {
            exitCode: 0,
            stdout: [`binary: ${binary}`, `voice:  ${voice}`, `rate:   ${rate || "(default)"}`].join("\n"),
          };
        }
        case "voices": {
          const filter = (args[0] ?? "en-").toLowerCase();
          const output = await new Promise<{ code: number; text: string }>((resolve) => {
            const child = spawn(binary, ["--list-voices"], { stdio: ["ignore", "pipe", "pipe"] });
            let out = "";
            child.stdout.on("data", (chunk: Buffer) => {
              if (out.length < 200_000) out += chunk.toString("utf8");
            });
            child.on("error", (cause: Error) => resolve({ code: 1, text: cause.message }));
            child.on("close", (code) => resolve({ code: code ?? 1, text: out }));
          });
          if (output.code !== 0) return { exitCode: 1, stderr: output.text.trim() };
          const rows = output.text
            .split("\n")
            .filter((line) => line.toLowerCase().includes(filter));
          return { exitCode: 0, stdout: rows.join("\n").trim() || "No matching voices." };
        }
        default:
          return {
            exitCode: 1,
            stderr: "Usage:\n  bb read-aloud status\n  bb read-aloud voices [filter]",
          };
      }
    },
  });

  bb.onDispose(() => {
    jobs.clear();
  });
}
