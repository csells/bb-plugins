import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gecV2 } from "./gec";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

describe("gecV2", () => {
  it("joins a 16-hex checksum and a 64-hex digest", () => {
    expect(gecV2(`134065728000000000${TOKEN}`)).toMatch(
      /^[0-9A-F]{16}-[0-9A-F]{64}$/,
    );
  });

  it("is not plain SHA-256, which the service now refuses", () => {
    const input = `134065728000000000${TOKEN}`;
    const v1 = createHash("sha256").update(input).digest("hex").toUpperCase();
    expect(gecV2(input).split("-")[1]).not.toBe(v1);
  });

  it("pins regression outputs from the live-verified implementation", () => {
    // Pinned from this implementation after it was accepted live (2026-10-28).
    // Upstream publishes no vectors, so these guard against a refactor
    // silently changing the arithmetic rather than proving the port correct.
    expect(gecV2(`134000000000000000${TOKEN}`)).toBe(
      "0BA3746AC6CDE629-57AFCA24B569E73E5ACB7945F415DC12441D2E92946EED526B4ABB80843738EB",
    );
    expect(gecV2(`134065728000000000${TOKEN}`)).toBe(
      "91EB2A41004BE3A0-F77732C3B043BD12BFDAFF131170B082F6906F6C96164ACA9F2D8C13B2097190",
    );
  });
});
