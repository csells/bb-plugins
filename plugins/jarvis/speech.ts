// Turning Jarvis's markdown replies into speech.
//
// toSpeakable() and its helpers come from read-aloud/server.ts, which learned
// the hard way how markdown sounds when read aloud. SentenceStream is Jarvis's own:
// the brain's reply arrives as a stream of deltas, and speech should start on
// the first finished sentence rather than when the whole reply lands.

/** What to do with a fenced code block. See the `codeBlocks` setting. */
export type CodeBlockMode = "describe" | "read" | "skip";

export interface SpeakableOptions {
  codeBlocks?: CodeBlockMode;
}

/** A fence opener: ``` or ~~~, with an optional language tag. */
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
/** A table row: a line that both starts and ends with a pipe. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** A table's `|---|:--:|` separator, which is layout and never spoken. */
const SEPARATOR_CELL = /^:?-{1,}:?$/;

/** Splits one table row into trimmed cells, honoring escaped pipes. */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

/**
 * Linearizes a table so every cell keeps the column it belongs to.
 *
 * A sighted reader gets the column from its position; a listener cannot, so
 * "Signal, HOLD, CUT" is three floating values. Repeating the header with each
 * cell is wordier on the page and the only version that survives being heard.
 * The first column becomes the row's label, which is what it almost always is.
 */
function speakTable(rows: string[]): string {
  const parsed = rows.map(tableCells);
  const headed = parsed.length >= 2 && isSeparatorRow(parsed[1] ?? []);
  const body = (headed ? parsed.slice(2) : parsed).filter(
    (cells) => !isSeparatorRow(cells) && cells.some((cell) => cell !== ""),
  );
  if (body.length === 0) return "";

  // No header row means no columns to name; fall back to a plain clause.
  const header = headed ? (parsed[0] ?? []) : null;
  if (header === null) {
    return body
      .map((cells) => cells.filter(Boolean).join(", ") + ".")
      .join("\n");
  }

  const spoken = body.map((cells) => {
    const label = (cells[0] ?? "").trim();
    const parts: string[] = [];
    for (let column = 1; column < cells.length; column += 1) {
      const cell = (cells[column] ?? "").trim();
      if (cell === "") continue;
      const name = (header[column] ?? "").trim();
      parts.push(name === "" ? `${cell}.` : `${name}: ${cell}.`);
    }
    return (label === "" ? "" : `${label}. `) + parts.join(" ");
  });
  return [
    `Table, ${body.length} row${body.length === 1 ? "" : "s"}.`,
    ...spoken,
  ].join("\n");
}

/**
 * Says what a code block is instead of reading it. Braces, sigils and
 * indentation are noise aloud, but silence leaves the listener wondering what
 * they missed — so name the language and the size, which is what they would
 * want in order to decide whether to go look.
 */
function speakCode(
  language: string,
  lines: string[],
  mode: CodeBlockMode,
): string {
  if (mode === "skip") return "";
  if (mode === "read") return lines.join("\n");
  const count = lines.filter((line) => line.trim() !== "").length;
  const named = language.trim() === "" ? "code block" : `${language} code block`;
  return `(${named}, ${count} line${count === 1 ? "" : "s"})`;
}

/**
 * Rewrites the shorthand that reads correctly but speaks badly. "$120K/yr"
 * comes out as letters and a slash; the spelled-out form is what a person
 * would say.
 */
function speakNotation(text: string): string {
  return (
    text
      // Money shorthand. "$$" is a literal dollar sign in a replacement.
      .replace(/\$(\d[\d,]*(?:\.\d+)?)\s?K\b/g, "$$$1 thousand")
      .replace(/\$(\d[\d,]*(?:\.\d+)?)\s?M\b/g, "$$$1 million")
      .replace(/\$(\d[\d,]*(?:\.\d+)?)\s?B\b/g, "$$$1 billion")
      // Rates.
      .replace(/\/yr\b/g, " per year")
      .replace(/\/mo\b/g, " per month")
      .replace(/\/hr\b/g, " per hour")
      // Abbreviations a voice stumbles over or spells out.
      .replace(/\bvs\.?(?=\s)/gi, "versus")
      .replace(/\be\.g\.(?=\s)/gi, "for example,")
      .replace(/\bi\.e\.(?=\s)/gi, "that is,")
      // Arrows, which otherwise read as punctuation or nothing at all.
      .replace(/\s(?:->|=>|→)\s/g, " to ")
  );
}

/**
 * Markdown is written to be read, not heard. Left raw, a TTS engine says
 * "hash hash Loose ends" and spells out URLs a character at a time. This
 * flattens the message into something speakable while keeping the prose.
 *
 * Fences and tables are handled by scanning lines rather than by regex over
 * the whole string: a regex pair-matches fences positionally, so one stray
 * ``` swallows everything to the next one, and a table needs its header row
 * to make sense of the rows beneath it.
 */
export function toSpeakable(
  markdown: string,
  options: SpeakableOptions = {},
): string {
  const codeBlocks = options.codeBlocks ?? "describe";
  const lines = markdown.split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    const fence = FENCE_OPEN.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? "```";
      const language = fence[2] ?? "";
      const body: string[] = [];
      index += 1;
      // An unterminated fence runs to the end of the message, which is what
      // the renderer shows and therefore what the listener sees.
      while (index < lines.length) {
        const current = lines[index] ?? "";
        if (new RegExp(`^\\s{0,3}${marker[0] ?? "`"}{3,}\\s*$`).test(current)) {
          break;
        }
        body.push(current);
        index += 1;
      }
      blocks.push(speakCode(language, body, codeBlocks));
      continue;
    }

    if (TABLE_ROW.test(line)) {
      const rows: string[] = [];
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? "")) {
        rows.push(lines[index] ?? "");
        index += 1;
      }
      index -= 1;
      blocks.push(speakTable(rows));
      continue;
    }

    blocks.push(line);
  }

  let text = blocks.join("\n");

  // Images before links: an image's alt text is rarely worth speaking.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Links -> their label. A bare autolink keeps nothing worth saying.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/<https?:\/\/[^>]+>/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");

  // Inline code -> its contents. Identifiers read better than backticks.
  text = text.replace(/`([^`]+)`/g, "$1");

  // Headings become their own sentence so the voice lands a full stop.
  text = text.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, "$1.");
  // Blockquote and list markers.
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "");
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, "");
  // Horizontal rules.
  text = text.replace(/^\s{0,3}([-*_]\s*){3,}$/gm, "");
  // Emphasis / strikethrough, keeping the words. Underscore emphasis has to
  // refuse intra-word matches or it eats the middle of snake_case_names.
  text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1");
  text = text.replace(/\*(?=\S)([^*\n]*?\S)\*/g, "$1");
  text = text.replace(/(^|[^\w\\])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1$2");
  text = text.replace(/(^|[^\w\\])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  // Leftover HTML tags.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  text = speakNotation(text);

  // Collapse whitespace; a blank line becomes a paragraph break, which the
  // synth renders as a longer pause than a newline would.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/ *\n */g, "\n");
  // "..." reads as a stumble; a period is cleaner.
  text = text.replace(/\.{3,}/g, ".");
  return text.trim();
}

/** A line that opens or closes a fenced code block. */
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/gm;
/** Sentence ends, or a paragraph break. The lookahead keeps "3.5" and "e.g.x" whole. */
const BOUNDARY = /[.!?]["')\]]*(?=\s)|\n[ \t]*\n/g;
/** A run this long with no boundary is cut anyway, so speech never waits on it. */
const MAX_UNBROKEN = 400;

function insideFence(text: string): boolean {
  return (text.match(FENCE_LINE)?.length ?? 0) % 2 === 1;
}

/**
 * Turns a stream of text deltas into whole sentences.
 *
 * Speech has to start before the reply is finished, which means deciding where
 * a sentence ends while more text is still coming. A boundary is only trusted
 * once the character after it has arrived: "3." might be "3.5". A code fence is
 * held until it closes, so a code block is never split across two utterances.
 */
export class SentenceStream {
  private buffer = "";

  /** Adds a delta and returns every sentence it completed, in order. */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const cut = this.nextCut();
      if (cut === null) break;
      const sentence = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (sentence !== "") out.push(sentence);
    }
    return out;
  }

  /** Returns whatever is left, e.g. when the message is complete. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest === "" ? [] : [rest];
  }

  private nextCut(): number | null {
    BOUNDARY.lastIndex = 0;
    for (let match = BOUNDARY.exec(this.buffer); match !== null; match = BOUNDARY.exec(this.buffer)) {
      const end = match.index + match[0].length;
      // The lookahead needs a following character; a boundary at the very end
      // of the buffer is not yet known to be one.
      if (end >= this.buffer.length) return null;
      if (!insideFence(this.buffer.slice(0, end))) return end;
    }
    if (this.buffer.length > MAX_UNBROKEN && !insideFence(this.buffer)) {
      const space = this.buffer.lastIndexOf(" ", MAX_UNBROKEN);
      return space > 0 ? space : MAX_UNBROKEN;
    }
    return null;
  }
}

/** The brain's way of saying "nothing worth saying aloud". */
export function isSilentReply(text: string): boolean {
  return /^\(?\s*silent\s*\)?\.?$/i.test(text.trim());
}
