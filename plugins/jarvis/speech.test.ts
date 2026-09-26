import { describe, expect, it } from "vitest";
import { isSilentReply, SentenceStream } from "./speech";

/** Feeds text one character at a time, the worst case for boundary detection. */
function trickle(text: string): string[] {
  const stream = new SentenceStream();
  const out: string[] = [];
  for (const char of text) out.push(...stream.push(char));
  return [...out, ...stream.flush()];
}

describe("SentenceStream", () => {
  it("releases a sentence only once the next character proves it ended", () => {
    const stream = new SentenceStream();
    expect(stream.push("Two threads need you.")).toEqual([]);
    expect(stream.push(" Nitro")).toEqual(["Two threads need you."]);
    expect(stream.flush()).toEqual(["Nitro"]);
  });

  it("keeps decimals and version-like numbers whole", () => {
    expect(trickle("It took 3.5 seconds. Done.")).toEqual([
      "It took 3.5 seconds.",
      "Done.",
    ]);
  });

  it("splits on question and exclamation marks and paragraph breaks", () => {
    expect(trickle("Ready? Yes! First part\n\nSecond part")).toEqual([
      "Ready?",
      "Yes!",
      "First part",
      "Second part",
    ]);
  });

  it("holds a code fence until it closes, even across sentence ends", () => {
    const text = "Here it is.\n```ts\nconst a = 1. b = 2.\n```\nThat's all.";
    expect(trickle(text)).toEqual([
      "Here it is.",
      "```ts\nconst a = 1. b = 2.\n```\nThat's all.",
    ]);
  });

  it("cuts a long run with no boundary so speech never stalls on it", () => {
    const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
    const sentences = trickle(words);
    expect(sentences.length).toBeGreaterThan(1);
    expect(sentences.join(" ")).toBe(words);
    for (const sentence of sentences.slice(0, -1)) {
      expect(sentence.length).toBeLessThanOrEqual(400);
    }
  });

  it("is the same whether text arrives whole or a character at a time", () => {
    const text = "One. Two? Three!\n\nFour 1.5 five.";
    const whole = new SentenceStream();
    expect([...whole.push(text), ...whole.flush()]).toEqual(trickle(text));
  });
});

describe("isSilentReply", () => {
  it("recognizes the brain's silent marker in its common spellings", () => {
    for (const reply of ["(silent)", "silent", "(Silent).", " ( silent ) "]) {
      expect(isSilentReply(reply)).toBe(true);
    }
  });

  it("does not swallow a real sentence that mentions silence", () => {
    expect(isSilentReply("The build went silent an hour ago.")).toBe(false);
  });
});
