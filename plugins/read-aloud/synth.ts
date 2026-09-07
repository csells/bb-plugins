// Neural speech synthesis over Microsoft Edge's Read Aloud WebSocket API.
//
// Implemented directly rather than through a package, for two reasons found the
// hard way:
//
//   1. The Python `edge-tts` CLI works, but shelling out to it made the plugin
//      uninstallable for anyone without that virtualenv.
//   2. The npm ports are stale. `edge-tts-node@1.5.7` pins CHROMIUM_VERSION to
//      130 and the service now rejects that handshake outright (close 1006),
//      while the maintained Python client at 143 connects fine. `msedge-tts`
//      additionally ships a `preinstall: npx only-allow pnpm` hook that aborts
//      any npm install.
//
// So the whole protocol lives here: ~40 lines of handshake and framing whose
// only dependency is `ws` (needed because the browser WebSocket API cannot set
// the Origin/User-Agent headers the service requires).
//
// CHROMIUM_VERSION below is the single thing that rots. If synthesis starts
// failing with close code 1006, bump it to a current Edge version.
import { createHash, randomUUID } from "node:crypto";
import WebSocket from "ws";

/** Published client token shared by every Read Aloud client. */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR = CHROMIUM_VERSION.split(".")[0] ?? "143";
const BASE = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

export const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
/** Bytes per second of the default format, for duration math. */
export const OUTPUT_BYTES_PER_SECOND = 6000;

/** Seconds between the Windows FILETIME epoch (1601) and the Unix epoch. */
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600n;
/** FILETIME is in 100ns units, so five minutes is 3e9 of them. */
const FIVE_MINUTES_IN_TICKS = 3_000_000_000n;

/**
 * The Sec-MS-GEC token: SHA-256 of the current Windows FILETIME rounded down to
 * a five-minute boundary, concatenated with the trusted client token.
 *
 * BigInt is not optional here. The tick count is ~1.3e17, well past
 * Number.MAX_SAFE_INTEGER, so computing it in floating point silently loses
 * low-order digits and hashes to a token the service rejects.
 */
function secMsGec(): string {
  const unixSeconds = BigInt(Math.floor(Date.now() / 1000));
  const ticks = (unixSeconds + WINDOWS_EPOCH_OFFSET_SECONDS) * 10_000_000n;
  const rounded = ticks - (ticks % FIVE_MINUTES_IN_TICKS);
  return createHash("sha256")
    .update(`${rounded}${TRUSTED_CLIENT_TOKEN}`)
    .digest("hex")
    .toUpperCase();
}

function authQuery(): string {
  return `Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`;
}

/** Headers the service checks on the upgrade request. */
function handshakeHeaders(): Record<string, string> {
  return {
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" +
      ` (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36` +
      ` Edg/${CHROMIUM_MAJOR}.0.0.0`,
    "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR}", "Chromium";v="${CHROMIUM_MAJOR}"`,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "en-US-AndrewMultilingualNeural" -> "en-US" */
function localeOf(voice: string): string {
  const parts = voice.split("-");
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "en-US";
}

export interface SynthesisOptions {
  text: string;
  voice: string;
  /** Prosody rate, e.g. "+8%". Empty means the voice's natural pace. */
  rate?: string;
  signal?: AbortSignal;
}

/**
 * Yields MP3 bytes as the service produces them.
 *
 * One socket per call. The service streams a request's audio incrementally, so
 * the first bytes arrive well before synthesis finishes.
 */
export async function* synthesize(
  options: SynthesisOptions,
): AsyncGenerator<Uint8Array> {
  const { text, voice, rate = "", signal } = options;
  if (text.trim() === "") return;

  const url = `wss://${BASE}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&${authQuery()}&ConnectionId=${randomUUID().replace(/-/g, "")}`;
  const socket = new WebSocket(url, { headers: handshakeHeaders() });
  socket.binaryType = "nodebuffer";

  // Bridge push-based socket events into pull-based iteration.
  const queue: Uint8Array[] = [];
  let done = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const abort = () => {
    failure = new Error("aborted");
    done = true;
    try {
      socket.close();
    } catch {
      // Already closing.
    }
    notify();
  };
  signal?.addEventListener("abort", abort, { once: true });

  socket.on("open", () => {
    const timestamp = new Date().toString();
    socket.send(
      `X-Timestamp:${timestamp}\r\n` +
        "Content-Type:application/json; charset=utf-8\r\n" +
        "Path:speech.config\r\n\r\n" +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: DEFAULT_OUTPUT_FORMAT,
              },
            },
          },
        }),
    );

    const prosody =
      rate.trim() === ""
        ? escapeXml(text)
        : `<prosody rate='${escapeXml(rate.trim())}'>${escapeXml(text)}</prosody>`;
    socket.send(
      `X-RequestId:${randomUUID().replace(/-/g, "")}\r\n` +
        "Content-Type:application/ssml+xml\r\n" +
        `X-Timestamp:${timestamp}Z\r\n` +
        "Path:ssml\r\n\r\n" +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${localeOf(voice)}'>` +
        `<voice name='${escapeXml(voice)}'>${prosody}</voice></speak>`,
    );
  });

  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      // Frame layout: uint16be header length, headers, then the payload.
      if (data.length < 2) return;
      const headerLength = data.readUInt16BE(0);
      const headers = data.subarray(2, 2 + headerLength).toString("utf8");
      if (headers.includes("Path:audio")) {
        const audio = data.subarray(2 + headerLength);
        if (audio.length > 0) queue.push(new Uint8Array(audio));
        notify();
      }
      return;
    }
    // Text frames carry turn.start / response / turn.end.
    if (data.toString("utf8").includes("Path:turn.end")) {
      done = true;
      try {
        socket.close();
      } catch {
        // Already closing.
      }
      notify();
    }
  });

  socket.on("error", (cause: Error) => {
    // A 1006 here almost always means the handshake was refused — see the
    // CHROMIUM_VERSION note at the top of this file.
    failure = cause;
    done = true;
    notify();
  });

  socket.on("close", () => {
    done = true;
    notify();
  });

  try {
    while (true) {
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (chunk !== undefined) yield chunk;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    // Drain anything that landed alongside the close.
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (chunk !== undefined) yield chunk;
    }
    if (failure !== null && failure.message !== "aborted") throw failure;
  } finally {
    signal?.removeEventListener("abort", abort);
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}

export interface VoiceSummary {
  shortName: string;
  gender: string;
  locale: string;
  personalities: string;
}

/** The voice catalog, for `bb read-aloud voices`. */
export async function listVoices(): Promise<VoiceSummary[]> {
  const response = await fetch(
    `https://${BASE}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}&${authQuery()}`,
    { headers: handshakeHeaders() },
  );
  if (!response.ok) {
    throw new Error(`voice list failed (${response.status})`);
  }
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) throw new Error("unexpected voice list shape");
  return raw.map((entry) => {
    const item = entry as Record<string, unknown>;
    const tags = item.VoiceTag as Record<string, unknown> | undefined;
    const personalities = Array.isArray(tags?.VoicePersonalities)
      ? (tags?.VoicePersonalities as string[]).join(", ")
      : "";
    return {
      shortName: String(item.ShortName ?? ""),
      gender: String(item.Gender ?? ""),
      locale: String(item.Locale ?? ""),
      personalities,
    };
  });
}
