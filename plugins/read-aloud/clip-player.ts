/** iOS uses finite MP3s, fetched ahead, on one gesture-authorized audio element. */
export interface ClipPlayerOptions {
  audio: HTMLAudioElement;
  urls: string[];
  signal: AbortSignal;
  onStatus: (status: "loading" | "playing" | "paused" | "ready" | "error", error?: string) => void;
  onEnd: () => void;
  fetchAudio?: typeof fetch;
}

interface Clip {
  url: string;
  duration: number;
}

export class ClipPlayer {
  private readonly options: ClipPlayerOptions;
  private readonly cache = new Map<number, Promise<Clip>>();
  private index = 0;
  private revision = 0;
  private disposed = false;
  private currentUrl: string | null = null;
  private seekCleanup: (() => void) | null = null;
  private readonly durations: number[];
  private readonly onEnded = () => {
    if (this.disposed || this.currentUrl === null || this.options.audio.src !== this.currentUrl) return;
    const duration = this.options.audio.duration;
    if (Number.isFinite(duration)) this.durations[this.index] = duration;
    if (this.index + 1 >= this.options.urls.length) { this.options.onEnd(); return; }
    void this.load(this.index + 1, 0);
  };

  constructor(options: ClipPlayerOptions) {
    this.options = options;
    this.durations = Array.from({ length: options.urls.length }, () => 0);
    options.audio.addEventListener("ended", this.onEnded);
  }

  start(): Promise<void> { return this.load(0, 0); }

  position(): number {
    return this.durations.slice(0, this.index).reduce((sum, duration) => sum + duration, 0) +
      this.options.audio.currentTime;
  }

  seekBy(seconds: number): void {
    if (this.disposed || this.currentUrl === null) return;
    let target = Math.max(0, this.position() + seconds);
    for (let index = 0; index <= this.index; index += 1) {
      const duration = this.durations[index] ?? 0;
      if (target < duration || index === this.index) {
        const offset = Math.min(target, Math.max(0, duration - 0.05));
        if (index === this.index) this.options.audio.currentTime = offset;
        else void this.load(index, offset);
        return;
      }
      target -= duration;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.revision += 1;
    this.seekCleanup?.();
    this.options.audio.removeEventListener("ended", this.onEnded);
    // Promises revoke their own URL if they finish after disposal.
    for (const clip of this.cache.values()) {
      void clip.then((value) => { URL.revokeObjectURL(value.url); }, () => { /* Failed downloads have no object URL to release. */ });
    }
    this.cache.clear();
  }

  private get(index: number): Promise<Clip> {
    const existing = this.cache.get(index);
    if (existing !== undefined) return existing;
    const url = this.options.urls[index];
    if (url === undefined) return Promise.reject(new Error("Missing audio section"));
    const controller = new AbortController();
    const abort = () => { controller.abort(); };
    this.options.signal.addEventListener("abort", abort, { once: true });
    if (this.options.signal.aborted) controller.abort();
    const timer = setTimeout(abort, 35_000);
    const fetching = (async () => {
      try {
        const response = await (this.options.fetchAudio ?? fetch)(url, { signal: controller.signal });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(detail.error ?? `Could not load audio (${response.status}). Retry.`);
        }
        const blob = await response.blob();
        if (blob.size === 0) throw new Error("No audio returned. Retry.");
        if (this.disposed || this.options.signal.aborted) throw new Error("Read stopped");
        // At most current + two upcoming clips are retained. Going back re-fetches
        // the same reusable section rather than failing with an expired job.
        return { url: URL.createObjectURL(blob), duration: blob.size / 6000 };
      } catch (cause) {
        if (controller.signal.aborted && !this.options.signal.aborted) {
          throw new Error("Audio took too long to load. Retry.", { cause });
        }
        throw cause;
      } finally {
        clearTimeout(timer);
        this.options.signal.removeEventListener("abort", abort);
      }
    })();
    this.cache.set(index, fetching);
    // A failed prefetch must be retryable when that section becomes current.
    void fetching.catch(() => { if (this.cache.get(index) === fetching) this.cache.delete(index); });
    return fetching;
  }

  private isCurrent(revision: number): boolean {
    return !this.disposed && !this.options.signal.aborted && revision === this.revision;
  }

  private async load(index: number, offset: number): Promise<void> {
    const revision = ++this.revision;
    this.seekCleanup?.();
    this.seekCleanup = null;
    this.options.onStatus("loading");
    try {
      // Prime up to three requests, before waiting for the first section.
      for (let next = index; next < Math.min(index + 3, this.options.urls.length); next += 1) {
        void this.get(next).catch(() => { /* Stop/prefetch failures are handled by the next active read. */ });
      }
      const clip = await this.get(index);
      if (!this.isCurrent(revision)) return;
      for (const [oldIndex, oldClip] of this.cache) {
        if (oldIndex >= index && oldIndex < index + 3) continue;
        this.cache.delete(oldIndex);
        void oldClip.then((value) => { URL.revokeObjectURL(value.url); }, () => { /* Failed downloads have no object URL to release. */ });
      }
      this.index = index;
      this.durations[index] = clip.duration;
      const audio = this.options.audio;
      this.currentUrl = clip.url;
      audio.src = clip.url;
      if (offset > 0) {
        const seek = () => {
          if (!this.disposed && revision === this.revision) audio.currentTime = offset;
        };
        audio.addEventListener("loadedmetadata", seek, { once: true });
        this.seekCleanup = () => { audio.removeEventListener("loadedmetadata", seek); };
      }
      this.options.onStatus("ready");
      try {
        await audio.play();
      } catch (cause) {
        if (!this.isCurrent(revision)) return;
        if (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "NotAllowedError") {
          this.options.onStatus("ready");
          return;
        }
        throw cause;
      }
    } catch (cause) {
      if (!this.isCurrent(revision)) return;
      this.options.onStatus("error", cause instanceof Error ? cause.message : "Could not play audio. Retry.");
    }
  }
}

/** Called in the click handler, before any network await loses the gesture. */
export function unlockAudio(audio: HTMLAudioElement): void {
  // A brief unmuted PCM silence: authorizes this same element for later MP3s.
  audio.src = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";
  void audio.play().catch(() => { /* Stop/prefetch failures are handled by the next active read. */ });
}
