import { describe, expect, it, vi } from "vitest";

/**
 * Client-version state is module-level and deliberately sticky — a learned
 * version is never meant to be forgotten at runtime — so each case works on a
 * freshly imported copy rather than depending on test order.
 */
async function freshSynth() {
  vi.resetModules();
  return await import("./synth");
}

describe("asText", () => {
  it("passes strings through and coerces primitives", async () => {
    const { asText } = await freshSynth();
    expect(asText("en-US-AndrewMultilingualNeural")).toBe(
      "en-US-AndrewMultilingualNeural",
    );
    expect(asText(42)).toBe("42");
    expect(asText(true)).toBe("true");
  });

  it("refuses non-primitives instead of stringifying them", async () => {
    const { asText } = await freshSynth();
    // The whole point: String({}) yields "[object Object]", which would have
    // been rendered into the voice catalog as a name.
    expect(asText({ Name: "x" })).toBe("");
    expect(asText([1, 2])).toBe("");
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
  });
});

describe("bumpMajor", () => {
  it("raises only the major component", async () => {
    const { bumpMajor } = await freshSynth();
    expect(bumpMajor("143.0.3650.75", 20)).toBe("163.0.3650.75");
    expect(bumpMajor("99.1.2.3", 1)).toBe("100.1.2.3");
  });

  it("leaves a version with a non-numeric major alone", async () => {
    const { bumpMajor } = await freshSynth();
    expect(bumpMajor("stable.0.0", 20)).toBe("stable.0.0");
  });
});

describe("candidateVersions", () => {
  it("escalates upward from the shipped default", async () => {
    const { candidateVersions, bumpMajor, DEFAULT_CLIENT_VERSION } =
      await freshSynth();
    // The service enforces a minimum client version and no maximum, so the
    // recovery path for a stale pin is always to go higher.
    expect(candidateVersions()).toEqual([
      DEFAULT_CLIENT_VERSION,
      bumpMajor(DEFAULT_CLIENT_VERSION, 20),
      bumpMajor(DEFAULT_CLIENT_VERSION, 60),
      bumpMajor(DEFAULT_CLIENT_VERSION, 150),
    ]);
  });

  it("escalates from a learned version once one is remembered", async () => {
    const { candidateVersions, configureClientVersion } = await freshSynth();
    configureClientVersion({ learned: "150.0.0.0" });
    expect(candidateVersions()).toEqual([
      "150.0.0.0",
      "170.0.0.0",
      "210.0.0.0",
      "300.0.0.0",
    ]);
  });

  it("uses an explicit override alone and never escalates it", async () => {
    const { candidateVersions, configureClientVersion } = await freshSynth();
    // 132 is at the service's floor; a version set deliberately has to mean
    // what it says, including when it is about to stop working.
    configureClientVersion({ override: "132.0.0.0" });
    expect(candidateVersions()).toEqual(["132.0.0.0"]);
  });

  it("treats a blank override as absent", async () => {
    const { candidateVersions, configureClientVersion, DEFAULT_CLIENT_VERSION } =
      await freshSynth();
    configureClientVersion({ override: "   " });
    const candidates = candidateVersions();
    expect(candidates[0]).toBe(DEFAULT_CLIENT_VERSION);
    expect(candidates).toHaveLength(4);
  });
});

describe("activeClientVersion", () => {
  it("prefers an override, then a learned version, then the default", async () => {
    const { activeClientVersion, configureClientVersion, DEFAULT_CLIENT_VERSION } =
      await freshSynth();
    expect(activeClientVersion()).toBe(DEFAULT_CLIENT_VERSION);

    configureClientVersion({ learned: "150.0.0.0" });
    expect(activeClientVersion()).toBe("150.0.0.0");

    configureClientVersion({ override: "132.0.0.0" });
    expect(activeClientVersion()).toBe("132.0.0.0");
  });
});
