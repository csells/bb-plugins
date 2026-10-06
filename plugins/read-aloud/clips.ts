import { randomUUID } from "node:crypto";
import { synthesize, type SynthesisOptions } from "./synth";

const JOB_TTL_MS = 20 * 60_000;
const MAX_JOBS = 8;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CLIP_BYTES = 2 * 1024 * 1024;
const CLIP_TIMEOUT_MS = 30_000;

type Synthesizer = (options: SynthesisOptions) => AsyncIterable<Uint8Array>;
interface ClipJob {
  chunks: string[];
  voice: string;
  rate: string;
  touchedAt: number;
  controller: AbortController;
  pending: Map<number, Promise<Uint8Array>>;
}

export class ClipError extends Error {
  readonly status: 400 | 404 | 429 | 502 | 504;
  constructor(message: string, status: ClipError["status"]) {
    super(message);
    this.status = status;
  }
}

/** Complete, reusable MP3 sections for browsers without MP3 MediaSource. */
export class ClipStore {
  private readonly jobs = new Map<string, ClipJob>();
  private readonly cache = new Map<string, Uint8Array>();
  private cacheBytes = 0;
  private readonly synth: Synthesizer;
  private readonly now: () => number;

  constructor(synth: Synthesizer = synthesize, now: () => number = Date.now) {
    this.synth = synth;
    this.now = now;
  }

  prepare(chunks: string[], voice: string, rate: string): string {
    this.sweep();
    // Never evict an active reader to make room for another one.
    if (this.jobs.size >= MAX_JOBS) {
      throw new ClipError("Too many active reads. Stop another read and retry.", 429);
    }
    const id = randomUUID();
    this.jobs.set(id, {
      chunks, voice, rate, touchedAt: this.now(), controller: new AbortController(),
      pending: new Map(),
    });
    return id;
  }

  sweep(): void {
    for (const [id, job] of this.jobs) {
      if (this.now() - job.touchedAt > JOB_TTL_MS) this.cancel(id);
    }
  }

  cancel(id: string): void {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    job?.controller.abort();
    for (const [key, bytes] of this.cache) {
      if (!key.startsWith(`${id}/`)) continue;
      this.cache.delete(key);
      this.cacheBytes -= bytes.length;
    }
  }

  dispose(): void {
    for (const id of this.jobs.keys()) this.cancel(id);
  }

  async get(id: string, index: number): Promise<Uint8Array> {
    this.sweep();
    const job = this.jobs.get(id);
    if (job === undefined) throw new ClipError("Read expired. Start reading again.", 404);
    const text = job.chunks[index];
    if (!Number.isInteger(index) || index < 0 || text === undefined) {
      throw new ClipError("Invalid audio section", 400);
    }
    job.touchedAt = this.now();
    const key = `${id}/${index}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const existing = job.pending.get(index);
    if (existing !== undefined) return existing;
    if (job.pending.size >= 3) {
      throw new ClipError("Audio is already preparing. Retry shortly.", 429);
    }
    const pending = this.generate(job, text).then((bytes) => {
      if (job.controller.signal.aborted) throw new ClipError("Read stopped", 404);
      while (this.cacheBytes + bytes.length > MAX_CACHE_BYTES) {
        const oldest = this.cache.entries().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest[0]);
        this.cacheBytes -= oldest[1].length;
      }
      this.cache.set(key, bytes);
      this.cacheBytes += bytes.length;
      return bytes;
    }).finally(() => { job.pending.delete(index); });
    job.pending.set(index, pending);
    return pending;
  }

  private async generate(job: ClipJob, text: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const abort = () => { controller.abort(); };
    job.controller.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, CLIP_TIMEOUT_MS);
    try {
      const parts: Uint8Array[] = [];
      let size = 0;
      for await (const bytes of this.synth({
        text, voice: job.voice, rate: job.rate, signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        size += bytes.length;
        if (size > MAX_CLIP_BYTES) throw new ClipError("Audio section is too large", 502);
        parts.push(bytes);
      }
      if (controller.signal.aborted) {
        throw new ClipError(job.controller.signal.aborted ? "Read stopped" : "Speech service timed out. Retry.",
          job.controller.signal.aborted ? 404 : 504);
      }
      if (size === 0) throw new ClipError("Speech service returned no audio. Retry.", 502);
      const audio = new Uint8Array(size);
      let offset = 0;
      for (const bytes of parts) { audio.set(bytes, offset); offset += bytes.length; }
      return audio;
    } catch (cause) {
      if (cause instanceof ClipError) throw cause;
      throw new ClipError(controller.signal.aborted ? "Speech request stopped or timed out. Retry." : "Speech service failed. Retry.",
        controller.signal.aborted ? 504 : 502);
    } finally {
      clearTimeout(timeout);
      job.controller.signal.removeEventListener("abort", abort);
    }
  }
}

/** RFC 9110 single-byte ranges, including suffix and open-ended requests. */
export function audioResponse(bytes: Uint8Array, range?: string): Response {
  const size = bytes.length;
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Accept-Ranges": "bytes",
    "Content-Length": String(size),
  };
  if (range === undefined) return new Response(bytes as BodyInit, { headers });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const first = match?.[1] ?? "";
  const last = match?.[2] ?? "";
  // Ignore unsupported range forms, as permitted by HTTP, rather than guessing.
  if (match === null || (first === "" && last === "")) {
    return new Response(bytes as BodyInit, { headers });
  }
  const start = first === "" ? Math.max(0, size - Number(last)) : Number(first);
  const end = first === "" || last === "" ? size - 1 : Math.min(size - 1, Number(last));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start ||
      (first === "" && Number(last) === 0)) {
    return new Response(null, { status: 416, headers: {
      "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store",
    } });
  }
  headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  headers["Content-Length"] = String(end - start + 1);
  return new Response(bytes.slice(start, end + 1) as BodyInit, { status: 206, headers });
}
