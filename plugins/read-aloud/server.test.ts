import { describe, expect, it } from "vitest";
import { chunkForSynthesis, toSpeakable } from "./server";

/**
 * Markdown is written to be read, not heard. These cases pin the behavior a
 * listener actually notices: syntax spoken aloud, URLs spelled out one
 * character at a time, and headings running into the next sentence.
 */
describe("toSpeakable", () => {
  it("names a code block's language and size rather than dropping it", () => {
    const spoken = toSpeakable("Before\n\n```js\nconst x = 1;\n```\n\nAfter");
    // "(code block omitted)" told the listener something was cut but not what,
    // so there was no way to judge whether to go and look at it.
    expect(spoken).toContain("(js code block, 1 line)");
    expect(spoken).not.toContain("const x");
    expect(spoken).toContain("Before");
    expect(spoken).toContain("After");
  });

  it("handles tilde-fenced code too", () => {
    expect(toSpeakable("~~~\nraw\n~~~")).toBe("(code block, 1 line)");
  });

  it("reads code verbatim when asked to", () => {
    expect(toSpeakable("```py\nx = 1\n```", { codeBlocks: "read" })).toBe(
      "x = 1",
    );
  });

  it("passes over code in silence when asked to", () => {
    expect(toSpeakable("A\n\n```\nx\n```\n\nB", { codeBlocks: "skip" })).toBe(
      "A\n\nB",
    );
  });

  it("treats an unterminated fence as running to the end, as the renderer does", () => {
    // Pairing fences by regex let one stray fence swallow everything to the
    // next one, silently eating the prose in between.
    const spoken = toSpeakable("Intro\n\n```sh\nrm -rf /\nls");
    expect(spoken).toContain("Intro");
    expect(spoken).toContain("(sh code block, 2 lines)");
    expect(spoken).not.toContain("rm -rf");
  });

  it("keeps a link's label and drops its target", () => {
    expect(toSpeakable("See [the docs](https://example.com/x) now")).toBe(
      "See the docs now",
    );
  });

  it("strips bare URLs, which a voice would read character by character", () => {
    expect(toSpeakable("Go to https://example.com/a/b now")).toBe("Go to now");
  });

  it("drops image syntax entirely", () => {
    expect(toSpeakable("A ![a chart](chart.png) B")).toBe("A B");
  });

  it("unwraps inline code so identifiers are spoken", () => {
    expect(toSpeakable("Run `npm run build` first")).toBe(
      "Run npm run build first",
    );
  });

  it("gives a heading a full stop so the voice lands", () => {
    expect(toSpeakable("## Loose ends")).toBe("Loose ends.");
  });

  it("removes list, quote, and rule markers", () => {
    expect(toSpeakable("- one\n- two")).toBe("one\ntwo");
    expect(toSpeakable("1. first\n2. second")).toBe("first\nsecond");
    expect(toSpeakable("> quoted")).toBe("quoted");
    expect(toSpeakable("before\n\n---\n\nafter")).toContain("before");
  });

  it("pairs every table cell with its column header", () => {
    // Position carries the column on the page and nothing at all aloud, so
    // "Signal, HOLD, CUT" is three values with no way to tell them apart.
    const spoken = toSpeakable(
      "| | Fixed | Risk-based |\n| --- | --- | --- |\n| Signal | HOLD | CUT |",
    );
    expect(spoken).not.toContain("|");
    expect(spoken).toContain("Table, 1 row.");
    expect(spoken).toContain("Signal. Fixed: HOLD. Risk-based: CUT.");
  });

  it("uses the first column as the row label", () => {
    const spoken = toSpeakable(
      "| Metric | Before | After |\n| --- | --- | --- |\n| Latency | 100ms | 50ms |",
    );
    expect(spoken).toContain("Latency. Before: 100ms. After: 50ms.");
  });

  it("falls back to plain clauses for a table with no header row", () => {
    const spoken = toSpeakable("| 1 | 2 |\n| 3 | 4 |");
    expect(spoken).toBe("1, 2.\n3, 4.");
  });

  it("keeps emphasized words without their markers", () => {
    expect(toSpeakable("**bold** and *italic* and ~~struck~~")).toBe(
      "bold and italic and struck",
    );
    expect(toSpeakable("__bold__ and _italic_")).toBe("bold and italic");
  });

  it("leaves snake_case identifiers intact", () => {
    // Underscore emphasis used to match inside a word, so a filename came out
    // as "gascityinc.md" — wrong, and wrong in a way only a listener hears.
    expect(toSpeakable("Check gas_city_inc.md and MAX_TEXT_CHARS")).toBe(
      "Check gas_city_inc.md and MAX_TEXT_CHARS",
    );
  });

  it("speaks money and rate shorthand as words", () => {
    expect(toSpeakable("$120K/yr and $2.60M and $13.0K/mo")).toBe(
      "$120 thousand per year and $2.60 million and $13.0 thousand per month",
    );
  });

  it("expands abbreviations a voice stumbles over", () => {
    expect(toSpeakable("rigid vs. guardrails")).toBe("rigid versus guardrails");
    expect(toSpeakable("CUT -> $100")).toBe("CUT to $100");
  });

  it("collapses an ellipsis, which reads as a stumble", () => {
    expect(toSpeakable("wait... ok")).toBe("wait. ok");
  });

  it("returns an empty string for input with nothing to say", () => {
    expect(toSpeakable("")).toBe("");
    expect(toSpeakable("   \n\n  ")).toBe("");
  });
});

/**
 * Chunking exists so a dropped socket costs one turn instead of the rest of
 * the message. The property that matters most is that nothing goes missing.
 */
describe("chunkForSynthesis", () => {
  it("keeps every word, which is the whole point", () => {
    const text = Array.from(
      { length: 40 },
      (_, index) => `Sentence number ${index} carries its own words.`,
    ).join(" ");
    const rejoined = chunkForSynthesis(text, 200).join(" ");
    expect(rejoined).toBe(text);
  });

  it("starts small so the look-ahead has something to hand over to", () => {
    // Look-ahead does nothing until the chunk being drained runs out, so a
    // full-size first chunk leaves the opening minute with no lead at all.
    const text = Array.from(
      { length: 60 },
      (_, index) => `Sentence ${index} has a handful of words in it.`,
    ).join(" ");
    const chunks = chunkForSynthesis(text);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0]?.length ?? 0).toBeLessThanOrEqual(150);
    expect(chunks[1]?.length ?? 0).toBeLessThanOrEqual(300);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(400);
    // The ramp is an opening concession, not the steady state.
    expect(chunks[3]?.length ?? 0).toBeGreaterThan(chunks[0]?.length ?? 0);
  });

  it("breaks at sentence boundaries, not mid-sentence", () => {
    const chunks = chunkForSynthesis(
      "One two three. Four five six. Seven eight nine.",
      20,
    );
    for (const chunk of chunks) expect(chunk).toMatch(/\.$/);
  });

  it("respects the target where sentences allow it", () => {
    const chunks = chunkForSynthesis(
      "Short one. Short two. Short three. Short four.",
      24,
    );
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(24);
  });

  it("still breaks up a single sentence longer than the target", () => {
    // One unbounded turn is the failure this guards against, so an
    // unpunctuated wall of text cannot be allowed to become one.
    const chunks = chunkForSynthesis("x".repeat(500), 100);
    expect(chunks).toHaveLength(5);
    expect(chunks.join("")).toBe("x".repeat(500));
  });

  it("returns nothing for empty input", () => {
    expect(chunkForSynthesis("")).toEqual([]);
    expect(chunkForSynthesis("   \n\n ")).toEqual([]);
  });
});
