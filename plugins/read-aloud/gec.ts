// SPDX-License-Identifier: LGPL-3.0-only
// Derived from edge-tts 7.3.0 by rany <rany@riseup.net>.
// TypeScript adaptation Copyright (c) 2026 Chris Sells.
// Modified 2026-10-28: ported Python token arithmetic to TypeScript.
// Source: https://github.com/rany2/edge-tts/blob/7.3.0/src/edge_tts/drm.py
// License notices and terms: licenses/edge-tts-LICENSE.txt and GPL-3.0.txt.
// This file retains the upstream LGPLv3 license.
//
// The v2 Sec-MS-GEC token, ported from the reference `edge-tts` client
// (rany2/edge-tts, src/edge_tts/drm.py, 7.3.0).
//
// In October 2026 the service stopped accepting the v1 token — plain SHA-256 of
// the rounded FILETIME plus the trusted client token — and began answering 403
// to every handshake, at every client version. v2 hashes the same input two
// ways and joins them as "<CS64, 16 hex>-<SHA-256, 64 hex>":
//
//   - The SHA-256 is of the input behind a secret 57-byte prefix. Only the
//     state midway through the first block is published, so hashing resumes
//     from round 14 of that block, with the adjustments that fold the prefix's
//     last byte into the schedule.
//   - CS64 is a keyed 64-bit checksum whose two keys come from that digest.
//
// The constants are opaque and copied verbatim. Everything is 32-bit modular
// arithmetic: Math.imul and >>> 0 stand in for the Python's `& 0xFFFFFFFF`,
// which is exact because each value is eventually reduced mod 2^32 anyway.

/** FIPS 180-4 initial hash value. */
const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];
/** Working registers after round 13 of the secret first block. */
const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab,
  0xfeb0a7e4, 0x03effbd2,
];
/** The secret block's contribution to schedule words 16..29. */
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491,
  0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_ADJUSTMENT = 0xc9dc06a7;
/** Round constants for the first block, where round 14 absorbs the prefix. */
const SHA256_BLOCK_CONSTANTS = SHA256_ROUND_CONSTANTS.map((value, index) =>
  index === 14 ? SHA256_ADJUSTMENT : value,
);
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

/** [coefficient, offset] pairs that seed the CS64 term lists. */
const CS64_COEFFICIENTS: readonly (readonly [number, number])[] = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

const mul = (a: number, b: number): number => Math.imul(a, b) >>> 0;
const rotr = (value: number, by: number): number =>
  ((value >>> by) | (value << (32 - by))) >>> 0;
const rol16 = (value: number): number =>
  ((value << 16) | (value >>> 16)) >>> 0;
const sigma0 = (value: number): number =>
  (rotr(value, 7) ^ rotr(value, 18) ^ (value >>> 3)) >>> 0;
const sigma1 = (value: number): number =>
  (rotr(value, 17) ^ rotr(value, 19) ^ (value >>> 10)) >>> 0;

/** Index into an array the algorithm guarantees is long enough. */
function at(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`gec: index ${index} out of range`);
  return value;
}

/** Extends a message schedule to 64 words, starting at `firstWord`. */
function expandSchedule(words: number[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index++) {
    words.push(
      (sigma1(at(words, index - 2)) +
        at(words, index - 7) +
        sigma0(at(words, index - 15)) +
        at(words, index - 16)) >>>
        0,
    );
  }
}

/** Standard compression rounds, optionally resuming partway into a block. */
function rounds(
  state: readonly number[],
  words: readonly number[],
  firstRound = 0,
): number[] {
  let [a, b, c, d, e, f, g, h] = state.map((_, index) => at(state, index)) as [
    number, number, number, number, number, number, number, number,
  ];
  const constants =
    firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let index = firstRound; index < 64; index++) {
    const t1 =
      h +
      (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
      ((g ^ (e & (f ^ g))) >>> 0) +
      at(constants, index) +
      at(words, index);
    const t2 =
      (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
      (((a & b) | (c & (a | b))) >>> 0);
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function addState(left: readonly number[], right: readonly number[]): number[] {
  return left.map((value, index) => (value + at(right, index)) >>> 0);
}

/** The hash state after the secret prefix and the input's first seven bytes. */
function initialState(head: Uint8Array): number[] {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const words = Array<number>(14).fill(0);
  words.push((view.getUint16(0) << 8) | view.getUint8(2), view.getUint32(3));
  for (let index = 16; index < 30; index++) {
    let value = at(SHA256_SCHEDULE, index - 16);
    if (index - 2 >= 14) {
      const s1 = sigma1(at(words, index - 2));
      value += index === 16 ? (s1 ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0 : s1;
    }
    if (index - 7 >= 14) value += at(words, index - 7);
    if (index - 15 >= 14) {
      const s0 = sigma0(at(words, index - 15));
      value += index === 29 ? (s0 ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0 : s0;
    }
    words.push(value >>> 0);
  }
  words.push(
    (sigma1(at(words, 28)) +
      at(words, 23) +
      sigma0(at(words, 15)) +
      at(words, 14) +
      SHA256_ADJUSTMENT -
      at(SHA256_ROUND_CONSTANTS, 14)) >>>
      0,
  );
  expandSchedule(words, 31);
  return addState(SHA256_INITIAL, rounds(SHA256_STATE, words, 14));
}

/** SHA-256 of the secret prefix followed by `data`. */
function prefixedSha256(data: Uint8Array): Uint8Array {
  if (data.length < 7) throw new Error("gec: input must be at least 7 bytes");
  const length = 57 + data.length;
  const padding = (((55 - length) % 64) + 64) % 64;
  const tail = new Uint8Array(data.length - 7 + 1 + padding + 8);
  tail.set(data.subarray(7));
  tail[data.length - 7] = 0x80;
  const tailView = new DataView(tail.buffer);
  tailView.setBigUint64(tail.length - 8, BigInt(length * 8));

  let state = initialState(data.subarray(0, 7));
  for (let offset = 0; offset < tail.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 16; index++) {
      words.push(tailView.getUint32(offset + index * 4));
    }
    expandSchedule(words);
    state = addState(state, rounds(state, words));
  }
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  state.forEach((value, index) => {
    digestView.setUint32(index * 4, value);
  });
  return digest;
}

/** Little-endian 32-bit words, zero-padded to an even count. */
function evenLittleEndianWords(data: Uint8Array): number[] {
  const padded = new Uint8Array(Math.ceil(data.length / 4) * 4);
  padded.set(data);
  const view = new DataView(padded.buffer);
  const words: number[] = [];
  for (let offset = 0; offset < padded.length; offset += 4) {
    words.push(view.getUint32(offset, true));
  }
  if (words.length % 2 === 1) words.push(0);
  return words;
}

/** The keyed 64-bit checksum, as two 32-bit words. */
function cs64(data: Uint8Array, digest: Uint8Array): [number, number] {
  const digestView = new DataView(digest.buffer, digest.byteOffset);
  const keyA = (digestView.getUint32(0, true) | 1) >>> 0;
  const keyB = (digestView.getUint32(4, true) | 1) >>> 0;
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];

  const terms = CS64_COEFFICIENTS.map(([coefficient], index) =>
    mul(coefficient, at(factors, index % 2)),
  );
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  evenLittleEndianWords(prefixed).forEach((word, index) => {
    const even = index % 2 === 0;
    let term = mul(word, even ? keyA : keyB);
    let offset = mul(rol16(word), even ? 0xef0569fb : 0xc31713db);
    if (index === 0) {
      term = (term + mul(CS64_ADJUSTMENT0, at(factors, 0))) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  });

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = at(terms, index);
    const y = at(terms, index + 1);
    let q = mul(rol16((at(offsets, index) + x) >>> 0), 0x76f50f34);
    swapAcc = (swapAcc + ((mul(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;
    q = mul(rol16((at(offsets, index + 1) + y) >>> 0), 0x1881ce3c);
    swapLast = (mul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul(state, keyA) + x) >>> 0;
    state = mul(rol16(state), 0xcf98b111);
    state = mul(rol16(state), 0x87085b9f);
    state = mul(rol16(state), 0x12ceb96d);
    state = mul(rol16(state), 0x257e1d83);
    acc = (acc + state) >>> 0;
    let t = (mul(state, keyB) + y) >>> 0;
    t = mul(rol16(t), 0xa27416f5);
    t = mul(rol16(t), 0xd38396ff);
    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69);
    acc = (acc + state) >>> 0;
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex").toUpperCase();
}

/** "<CS64>-<SHA-256>" for one already-rounded FILETIME tick string. */
export function gecV2(input: string): string {
  const data = new TextEncoder().encode(input);
  const digest = prefixedSha256(data);
  const checksum = new Uint8Array(8);
  const view = new DataView(checksum.buffer);
  const [low, high] = cs64(data, digest);
  view.setUint32(0, low, true);
  view.setUint32(4, high, true);
  return `${hex(checksum)}-${hex(digest)}`;
}
