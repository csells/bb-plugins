# bb-plugin-read-aloud

Speak any chat message out loud, with a streaming neural voice and a real
transport: seek, speed, pause, stop.

Adds a speaker button to every message's action row, beside **Copy message**.
Click it and a floating pill appears with elapsed time, ±10s seek, pause,
playback speed, and stop.

No API key, no metering, and **no external binary** — synthesis speaks
Microsoft Edge's Read Aloud protocol directly over a WebSocket.

## Install

```bash
bb plugin install <this directory or git url>
```

That is the whole setup. Verify with:

```bash
bb read-aloud status
bb read-aloud voices en-GB     # filter the live voice catalog
```

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Voice | `en-US-AndrewMultilingualNeural` | Any Microsoft neural voice |
| Rate | `+8%` | **Synthesis** speed, baked into the audio |

Playback speed is separate and lives in `localStorage`: it is a per-device UI
preference you change mid-sentence, whereas plugin settings are server-side,
global, and read once per load.

## How it works

**Native synthesis.** `synth.ts` implements the protocol in about forty lines:
the `Sec-MS-GEC` token (SHA-256 of the current Windows FILETIME rounded to a
five-minute boundary, which must be computed with `BigInt` — the tick count
exceeds `Number.MAX_SAFE_INTEGER` and floating point silently hashes to a
rejected token), the WebSocket handshake, and the binary framing. The only
dependency is `ws`, needed because the browser WebSocket API cannot set the
`Origin`/`User-Agent` headers the service checks.

Earlier versions shelled out to the Python `edge-tts` CLI, which made the
plugin uninstallable for anyone without that virtualenv. The npm ports were not
usable either: `edge-tts-node` pins its client version to Chromium 130 and the
service now refuses that handshake outright (close 1006), while `msedge-tts`
ships a `preinstall: npx only-allow pnpm` hook that aborts any npm install.

**One request, streamed.** The service streams a whole request incrementally —
measured at ~1.5s to first byte and ~4.75x realtime for a six-minute message —
so there is no text splitting and no stitching of parts. The 11-second startup
the chunked version worked around was the Python CLI, not the service.

**Two routes, not one.** `POST /prepare` takes the message text and returns a
job id; `GET /stream?id=` returns `audio/mpeg`. A single GET would be simpler,
but message text runs to tens of thousands of characters and would not survive
a URL.

**Stop genuinely cancels.** Stopping aborts the request, which runs the
stream's `cancel()` and closes the synthesis socket. Stopping a twelve-minute
read costs nothing instead of letting it finish unheard.

**Playback goes through MediaSource,** which exists entirely for seeking.
Pointed straight at a chunked response the browser treats it as live: it
throttles reads to ~2s ahead of the playhead and reports `seekable` as
`[0, Infinity]`, so a 10-second jump either moves about two seconds or sails
past the received audio and resets to zero. Appending every byte as it arrives
makes `buffered` mean what it says — measured 36s of lead versus 2.3s — so a
jump lands exactly and the true edge is knowable. Seeks clamp to that edge;
landing on it starves playback, which surfaces as the "Preparing" state until
more audio arrives. Engines without MSE for mp3 fall back to direct streaming,
where playback works but jumps are smaller.

**Markdown is flattened first.** Raw markdown through a TTS engine says "hash
hash Loose ends" and spells out URLs character by character. Code fences become
"(code block omitted)" rather than vanishing silently, links reduce to their
labels, tables become comma clauses, and headings gain a full stop so the voice
lands.

**Auto-stop** happens two ways. Switching threads is detected in the overlay
via `useBbContext()`. New prompts go through the backend: `thread.active`
publishes on a realtime channel and the overlay stops, filtered to the thread
being read so background threads never interrupt you. The server-side signal
covers every composer surface and layout, unlike a frontend submit hook.

**Why two registrations.** `messageAction` is host-rendered chrome — `run` is a
plain callback, not a component — so it cannot draw transport buttons as
siblings of itself. The button triggers; `experimental_appOverlay` renders the
transport. A module-level store bridges them, because `run` fires outside React
and the overlay mounts and unmounts underneath it.

## Mobile

Touch targets grow on coarse pointers using BB's own `coarse-pointer-sizing`
classes. The pill clears the mobile composer and respects
`env(safe-area-inset-bottom)`, constrains itself to the viewport width, and
drops its text label first on narrow screens so the controls always fit.

## Known limitations

- **The protocol endpoint is undocumented.** There is no SLA, and it has broken
  before when Microsoft changed the token scheme. `CHROMIUM_VERSION` in
  `synth.ts` is the single value that rots: if synthesis starts failing with
  close code 1006, bump it to a current Edge version. `bb read-aloud status`
  says so in its error output.
- Voice catalog only — no cloning, and no control over the 24kHz/48kbps output
  format.
- Without MSE for mp3, ±10s jumps are limited by how little the browser
  buffers ahead.

## Selection reading

Highlight text inside a message and the action also appears in the selection
menu, reading only what you highlighted.
