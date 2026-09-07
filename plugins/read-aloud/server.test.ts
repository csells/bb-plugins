import { describe, expect, it } from "vitest";
import { toSpeakable } from "./server";

/**
 * Markdown is written to be read, not heard. These cases pin the behavior a
 * listener actually notices: syntax spoken aloud, URLs spelled out one
 * character at a time, and headings running into the next sentence.
 */
describe("toSpeakable", () => {
  it("replaces fenced code with a spoken marker rather than dropping it", () => {
    const spoken = toSpeakable("Before\n\n```js\nconst x = 1;\n```\n\nAfter");
    // Silence would leave the listener wondering what they missed.
    expect(spoken).toContain("(code block omitted)");
    expect(spoken).not.toContain("const x");
    expect(spoken).toContain("Before");
    expect(spoken).toContain("After");
  });

  it("handles tilde-fenced code too", () => {
    expect(toSpeakable("~~~\nraw\n~~~")).toBe("(code block omitted)");
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

  it("flattens a table into clauses instead of reading pipes", () => {
    const spoken = toSpeakable("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(spoken).not.toContain("|");
    expect(spoken).toContain("a, b.");
    expect(spoken).toContain("1, 2.");
  });

  it("keeps emphasized words without their markers", () => {
    expect(toSpeakable("**bold** and *italic* and ~~struck~~")).toBe(
      "bold and italic and struck",
    );
  });

  it("collapses an ellipsis, which reads as a stumble", () => {
    expect(toSpeakable("wait... ok")).toBe("wait. ok");
  });

  it("returns an empty string for input with nothing to say", () => {
    expect(toSpeakable("")).toBe("");
    expect(toSpeakable("   \n\n  ")).toBe("");
  });
});
