# bb-plugin-jarvis

Jarvis is a voice-first chief of staff for BB. Talk to it, hear what your agents
are doing, and answer them by voice. Rename it in its settings; the name is what
it answers to, what its thread is called, and what the sidebar shows.

- **Brain:** a pinned Claude thread named after the assistant, created the first
  time you start it. Everything it writes is spoken; type to it in the
  Conversation tab if you would rather not talk.
- **Ears:** the browser detects when you start and stop talking. The words come
  from BB's transcription service when the server has one signed in, and from
  the browser's own speech recognition (Chrome, Edge, Safari) when it does not.
  Talking over the assistant interrupts it.
- **Voice:** Microsoft Edge's neural voices, streamed sentence by sentence as
  the brain writes, with no API key.
- **Screen:** the brain calls `jarvis_show` to put markdown on the page, and
  captions follow the voice word by word. Controls appear when you touch the
  stage.
- **Awareness:** BB lifecycle events (a thread finished, failed, or is waiting
  on you) are batched and sent to the brain, which decides whether they are
  worth interrupting you for. Tones mark "heard you", "thinking", and "news".

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Name | `Jarvis` | What the assistant is called |
| Voice | `en-US-AndrewMultilingualNeural` | Any Microsoft neural voice |
| Rate | `+8%` | Speaking speed |
| Watch | `all` | `all` visible top-level threads, `pinned`, or `off` |
| Tones | on | Earcons for heard, thinking, and news |
| Brain model | *(default)* | Claude model for a newly created brain |

`bb jarvis status` shows the brain thread, pending events, and the last sentence
spoken.
