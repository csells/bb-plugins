// Neural speech synthesis over Microsoft Edge's Read Aloud WebSocket API.
//
// Implemented directly rather than through a package, for two reasons found the
// hard way:
//
//   1. The Python `edge-tts` CLI works, but shelling out to it made the plugin
//      uninstallable for anyone without that virtualenv.
//   2. The npm ports are stale. `edge-tts-node@1.5.7` pins its client version
//      to Chromium 130, which the service refuses outright, while `msedge-tts`
//      ships a `preinstall: npx only-allow pnpm` hook that aborts npm installs.
//
// So the whole protocol lives here, and its only dependency is `ws` (needed
// because the browser WebSocket API cannot set the Origin/User-Agent headers
// the service requires).
//
// ---------------------------------------------------------------------------
// On client-version rot, which is the one thing here that decays:
//
// The service checks Sec-MS-GEC-Version against a MINIMUM and enforces no
// maximum. Measured directly against the endpoint (2026-09):
//
//     131.0.0.0 -> 403      135.0.0.0 -> OK      150.0.0.0 -> OK
//     132.0.0.0 -> OK       143.0.3650.75 -> OK  999.0.0.0 -> OK
//
// So the floor sits at 132 while current Edge is ~143: it ratchets upward but
// lags real releases by about a year. Because nothing rejects a *higher*
// version, a stale pin is always recoverable by escalating — which is what
// negotiation below does automatically, caching whatever works so the cost is
// paid once. That turns "bump a constant when it breaks" into "it fixes
// itself", and is why edge-tts-node's hard pin at 130 is permanently broken
// while this is not.
// ---------------------------------------------------------------------------
import { createHash, randomUUID } from "node:crypto";
import WebSocket from "ws";

/** Published client token shared by every Read Aloud client. */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
/** A real, current Edge version — the honest first choice. */
export const DEFAULT_CLIENT_VERSION = "143.0.3650.75";
/**
 * Major-version bumps to try if the pinned value is below the floor. Generous
 * on purpose: Chrome ships ~10 majors a year, so +150 is a decade of runway,
 * and there is no upper bound to trip over.
 */
const ESCALATION_STEPS = [20, 60, 150];
const BASE = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

export const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
/** Bytes per second of the default format, for duration math. */
export const OUTPUT_BYTES_PER_SECOND = 6000;

/** Seconds between the Windows FILETIME epoch (1601) and the Unix epoch. */
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600n;
/** FILETIME is in 100ns units, so five minutes is 3e9 of them. */
const FIVE_MINUTES_IN_TICKS = 3_000_000_000n;

let overrideVersion: string | null = null;
let learnedVersion: string | null = null;
let onVersionLearned: ((version: string) => void) | null = null;

/**
 * Supplies an explicit version, a previously learned one, and a sink to
 * remember a newly negotiated one. All optional.
 */
export function configureClientVersion(options: {
  override?: string | null;
  learned?: string | null;
  onLearned?: (version: string) => void;
}): void {
  const trimmedOverride = options.override?.trim() ?? "";
  overrideVersion = trimmedOverride === "" ? null : trimmedOverride;
  const trimmedLearned = options.learned?.trim() ?? "";
  if (trimmedLearned !== "") learnedVersion = trimmedLearned;
  if (options.onLearned !== undefined) onVersionLearned = options.onLearned;
}

function bumpMajor(version: string, by: number): string {
  const parts = version.split(".");
  const major = Number(parts[0]);
  if (!Number.isFinite(major)) return version;
  return [String(major + by), ...parts.slice(1)].join(".");
}

/** Ordered candidates: an explicit override is used alone and never escalated. */
function candidateVersions(): string[] {
  if (overrideVersion !== null) return [overrideVersion];
  const base = learnedVersion ?? DEFAULT_CLIENT_VERSION;
  return [base, ...ESCALATION_STEPS.map((step) => bumpMajor(base, step))];
}

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

function authQuery(version: string): string {
  return `Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${version}`;
}

/** Headers the service checks on the upgrade request. */
function handshakeHeaders(version: string): Record<string, string> {
  const major = version.split(".")[0] ?? "143";
  return {
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" +
      ` (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36` +
      ` Edg/${major}.0.0.0`,
    "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${major}", "Chromium";v="${major}"`,
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

/** Resolves once the socket is open, rejects if the handshake is refused. */
function openSocket(version: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url =
      `wss://${BASE}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&${authQuery(version)}&ConnectionId=${randomUUID().replace(/-/g, "")}`;
    const socket = new WebSocket(url, { headers: handshakeHeaders(version) });
    socket.binaryType = "nodebuffer";
    const onOpen = () => {
      socket.off("error", onError);
      resolve(socket);
    };
    const onError = (cause: Error) => {
      socket.off("open", onOpen);
      try {
        socket.close();
      } catch {
        // Already closing.
      }
      reject(cause);
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

/**
 * Opens a socket, escalating the client version if the handshake is refused,
 * and remembers whichever version worked.
 */
async function connect(): Promise<WebSocket> {
  const candidates = candidateVersions();
  let last: Error | null = null;
  for (const version of candidates) {
    try {
      const socket = await openSocket(version);
      if (version !== learnedVersion) {
        learnedVersion = version;
        // Only worth persisting when it differs from the shipped default.
        if (version !== DEFAULT_CLIENT_VERSION) onVersionLearned?.(version);
      }
      return socket;
    } catch (cause) {
      last = cause instanceof Error ? cause : new Error(String(cause));
    }
  }
  throw new Error(
    `handshake refused for client versions ${candidates.join(", ")}` +
      `${last === null ? "" : ` (${last.message})`}`,
  );
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

  const socket = await connect();
  if (signal?.aborted === true) {
    socket.close();
    return;
  }

  // Bridge push-based socket events into pull-based iteration.
  const queue: Uint8Array[] = [];
  let done = false;
  const failure: { current: Error | null } = { current: null };
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const abort = () => {
    failure.current = new Error("aborted");
    done = true;
    try {
      socket.close();
    } catch {
      // Already closing.
    }
    notify();
  };
  signal?.addEventListener("abort", abort, { once: true });

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
    failure.current = cause;
    done = true;
    notify();
  });
  socket.on("close", () => {
    done = true;
    notify();
  });

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
    if (failure.current !== null && failure.current.message !== "aborted") {
      throw failure.current;
    }
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

/** The voice catalog, for `bb read-aloud voices`. Escalates like connect(). */
export async function listVoices(): Promise<VoiceSummary[]> {
  const candidates = candidateVersions();
  let lastStatus = 0;
  for (const version of candidates) {
    const response = await fetch(
      `https://${BASE}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}&${authQuery(version)}`,
      { headers: handshakeHeaders(version) },
    );
    if (!response.ok) {
      lastStatus = response.status;
      continue;
    }
    if (version !== learnedVersion) {
      learnedVersion = version;
      if (version !== DEFAULT_CLIENT_VERSION) onVersionLearned?.(version);
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
  throw new Error(`voice list failed (${lastStatus})`);
}

/** The version currently in use, for diagnostics. */
export function activeClientVersion(): string {
  return overrideVersion ?? learnedVersion ?? DEFAULT_CLIENT_VERSION;
}
