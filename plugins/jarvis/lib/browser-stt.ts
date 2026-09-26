// The browser's own speech recognition, as a fallback ear.
//
// Jarvis prefers BB's configured transcription service, but that needs a working
// service login on the server. When it has none, Chrome, Edge, and Safari can
// still recognize speech with no key and no setup. Jarvis's own detector keeps
// deciding when the user starts and stops talking (and when they interrupt),
// so turn-taking behaves the same either way; this only supplies the words.
//
// Recognition hears the speakers too, so it is paused while Jarvis talks and
// resumed the moment the user barges in or Jarvis finishes.

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function browserRecognitionAvailable(): boolean {
  return recognitionConstructor() !== null;
}

/** How long to wait for recognition to finalize after the user stops talking. */
const FINALIZE_MS = 1_200;

export class BrowserTranscriber {
  private recognition: Recognition | null = null;
  private running = false;
  private wanted = false;
  private finals = "";
  private interim = "";
  private waiter: (() => void) | null = null;
  private readonly onInterim: (text: string) => void;

  constructor(onInterim: (text: string) => void) {
    this.onInterim = onInterim;
  }

  /** Starts listening; call from the user's tap. */
  start(): void {
    const Constructor = recognitionConstructor();
    if (Constructor === null) throw new Error("This browser has no speech recognition.");
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal === true) this.finals += `${text} `;
        else interim += text;
      }
      this.interim = interim;
      this.onInterim(`${this.finals}${interim}`.trim());
      if (interim === "") this.waiter?.();
    };
    recognition.onerror = () => undefined;
    // Chrome ends continuous recognition after a while of silence; restart it
    // for as long as the session wants it.
    recognition.onend = () => {
      this.running = false;
      this.waiter?.();
      if (this.wanted) this.resume();
    };
    this.recognition = recognition;
    this.wanted = true;
    this.resume();
  }

  /** Stops hearing (while Jarvis talks), dropping anything half-heard. */
  pause(): void {
    this.wanted = false;
    this.clear();
    if (this.running) this.recognition?.abort();
  }

  resume(): void {
    this.wanted = true;
    if (this.running || this.recognition === null) return;
    try {
      this.recognition.start();
      this.running = true;
    } catch {
      // Already starting; onend will retry.
    }
  }

  stop(): void {
    this.wanted = false;
    this.recognition?.abort();
    this.recognition = null;
    this.clear();
  }

  /**
   * The words of the utterance that just ended. Waits briefly for recognition
   * to finish its last words, then falls back to its best interim guess.
   */
  async take(): Promise<string> {
    if (this.interim !== "") {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FINALIZE_MS);
        this.waiter = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiter = null;
    }
    const text = `${this.finals}${this.interim}`.trim();
    this.clear();
    return text;
  }

  /** Forgets anything heard so far, e.g. noise before the user started talking. */
  clear(): void {
    this.finals = "";
    this.interim = "";
  }
}
