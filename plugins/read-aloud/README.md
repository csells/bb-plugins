# bb-plugin-read-aloud

Speak any chat message out loud, with a streaming neural voice and a real
transport: seek, speed, pause, stop.

Adds a speaker button to every message's action row, beside **Copy message**.
Click it and a floating pill appears with elapsed time, ±10s seek, pause,
playback speed, and stop.

Audio is free and unmetered — it uses the same neural voices Microsoft Edge's
Read Aloud feature uses, via [`edge-tts`](https://github.com/rany2/edge-tts).

## Requirements

`edge-tts` must be on the machine running the BB server:

```bash
python3 -m venv ~/.local/share/edge-tts-venv
~/.local/share/edge-tts-venv/bin/pip install edge-tts
```

That path is the first one the plugin checks, followed by `/opt/homebrew/bin`,
`/usr/local/bin`, and `PATH`. Override it in the plugin's settings if yours
lives elsewhere. Verify with:

```bash
bb read-aloud status
bb read-aloud voices en-GB     # filter the voice catalog
```

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Voice | `en-US-AndrewMultilingualNeural` | Any Microsoft neural voice |
| Rate | `+8%` | **Synthesis** speed, baked into the audio |
| edge-tts path | *(empty)* | Empty means search the paths above |

Playback speed is separate and lives in `localStorage`, not here: it is a
per-device UI preference you change mid-sentence, whereas plugin settings are
server-side, global, and read once per load.

## How it works

**Two routes, not one.** `POST /prepare` takes the message text and returns a
job id; `GET /stream?id=` returns `audio/mpeg`. A single GET would be simpler,
but message text runs to tens of thousands of characters and would not survive
a URL — and an `<audio>` element can only issue a GET anyway.

**Stop genuinely cancels.** Clearing the element's `src` aborts the HTTP
response, which runs the stream's `cancel()`, which SIGKILLs every live synth
process. Stopping a twelve-minute read costs nothing instead of letting
synthesis finish unheard.

**Chunked, pipelined synthesis.** `edge-tts` returns a chunk's audio only once
that chunk is fully synthesized. Handing it a whole message means the first
byte lands ~11s after the click. Instead the text is split on sentence
boundaries with a deliberately tiny first chunk (~160 chars) and larger ones
after (~700), synthesizing three ahead. Measured first audio: **~2–4s**.
Synthesis runs ~1.6x realtime, so once started the buffer stays ahead of
playback.

Each chunk's ID3/Xing header is stripped before it enters the stream. MP3 has
no global header — only per-frame headers — so parts concatenate fine, but a
per-chunk Xing header mid-stream describes only its own chunk and makes
decoders miscompute duration and seeking.

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

- **Seeking is clamped against `seekable`, not `buffered`.** The response is
  chunked with no `Content-Length`, so `duration` is `Infinity` — but measured
  in Chrome, `seekable.end` is `Infinity` too, and a forward seek past the
  buffered edge lands exactly and keeps playing. Clamping to `buffered` would
  be wrong: on a stream the browser treats as live it holds only ~2s ahead of
  the playhead, which pins a 10-second jump to about two.
- **Not self-contained.** It shells out to a Python `edge-tts`. Making this
  installable by anyone means porting the protocol to Node — the WebSocket and
  its time-based trusted-client token.
- **`edge-tts` uses an undocumented endpoint.** No SLA, and it has broken
  before when Microsoft changed the token scheme. Fine personally; think twice
  before depending on it in something you ship.
- Voice catalog only — no cloning, and no control over the 24kHz/48kbps output
  format.

## Selection reading

Highlight text inside a message and the action also appears in the selection
menu, reading only what you highlighted.
