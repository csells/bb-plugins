# Jarvis's implemented architecture

Status: implemented on branch **specs/jarvis-vision** at `08a9fe9`; unmerged and unaccepted.
Inspected 2026-11-22. [Plan verdicts and next steps](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
This record describes source and dated evidence, not current staging health.

## Decision

Use BB for worker execution and permission enforcement, a restricted host relay
for coordination and model inference, and a Node/TypeScript LiveKit companion
for browser voice. The BB navigation panel embeds the conversation interface.
Self-hosted TTS inference is a separate dependency. CosyVoice is the preferred
candidate after Chris's comparison, with light noise cleanup in the last staged
configuration; it has not passed quality or latency acceptance.

On November 15, the authorized LiveKit integration replaced the Pipecat media
candidate after the Android spike. Older browser capture/WAV playback and
Pipecat experiments remain in source as historical experiments. Their existence
does not mean the active panel uses them. Pocket is retained as a baseline
adapter. Kokoro, Qwen and CosyVoice are comparison candidates, not three qualified
production choices. Qwen retains an interruption/recovery failure.

## Why

The earlier browser path produced delayed audio with Android/car microphone
capture. Pipecat trials then exposed false interruptions and missing speech.
The [LiveKit spike](../research/jarvis-livekit-spike.md) worked well enough on the
user's Android setup to authorize integration. Reusing WebRTC and LiveKit's audio
and interruption machinery avoids maintaining another browser media pipeline.
It does not solve model buffering, inference latency or physical-device quality
by itself.

Keeping BB as the worker runtime preserves project instructions and existing
permission controls. The relay offers bounded operations rather than granting
the conversational model shell/browser tools. The relay is full-trust plugin
infrastructure; typed handlers are not a universal sandbox for worker actions.
The [domain authority contract](../plans/0003-jarvis-coordination-and-memory.md)
still needs real integration qualification.

## Where: presentation and conversation

- [app.tsx](../../plugins/jarvis/app.tsx), `Jarvis`: the `staff` nav panel embeds
  the authenticated `/api/v1/plugins/jarvis/http/livekit` interface.
- [server.ts](../../plugins/jarvis/server.ts): plugin-side HTTP integration.
- [voice/page.mjs](../../plugins/jarvis/voice/page.mjs) and
  [voice/src/browser.ts](../../plugins/jarvis/voice/src/browser.ts): Start/End,
  text/voice input, briefing/questions, watch/quiet, microphone, speech/work stops,
  audio recovery, diagnostics and voice grading. Voice/pace selection locks while
  active. Start cancellation and failed-close recovery preserve cleanup identity.
- [voice/src/server.ts](../../plugins/jarvis/voice/src/server.ts), `Connection`:
  LiveKit `AgentSession` with Silero VAD, BB transcription/director adapters and
  selected TTS. It uses `turnDetection: 'vad'`, a 500 ms minimum endpoint delay,
  VAD interruptions, false-interruption resumption and disabled preemptive
  generation. Semantic end-of-turn detection is not implemented here.
- [voice/src/control-lane.ts](../../plugins/jarvis/voice/src/control-lane.ts),
  `ControlLane`: preemption and generation fencing. Stop speaking and typed Send
  cancel pending presentation/inference as well as current audio. A late result
  cannot restart the superseded speech.

Stock mode is an operator configuration (`startupBriefing: 'sample'`). Start
speaks fixed text synthesized afresh and pauses watching. It avoids a briefing
model call; it is not a cached audio greeting or a live thread briefing. Brief me
and later turns still use the real relay/model. Without sample configuration,
normal startup prepares a real briefing.

Typed fallback talks to the authenticated director independently of the voice
companion. This has an actual companion-outage browser check. A task list and
pending-question display exist; app-wide orb, complete staff dashboard, selected
thread integration, memory controls and a full BB transcript UI are not delivered
by this iframe. Old component files do not establish active UI coverage.

## Where: models and media

[relay/model.mjs](../../plugins/jarvis/relay/model.mjs), `createTalker`, calls the
BB host account pool's Responses endpoint, defaults to `gpt-6.1-sol`, and offers
no model tools. The host reads its existing authentication locally; it does not
send that credential to the candidate VM. The model is configurable by private
operator configuration, not a completed in-product provider picker.

The endpoint uses SSE, but `createTalker` accumulates deltas and returns a complete
string. [relay/director.mjs](../../plugins/jarvis/relay/director.mjs),
`createDirector`, prepares grounded briefings and interprets typed intent. Normal
chat classification and reply share one model call. Actions still pass separate
validation; the conversational model never directly executes a BB mutation.

[voice/src/relay.ts](../../plugins/jarvis/voice/src/relay.ts), `BBSTT`,
`BBDirectorStream`, `JarvisAgent` and `AlfredAgent`, bridges the services to LiveKit.
Transcription is batch. `BBDirectorStream` awaits the director's complete response
then emits it as one delta. `JarvisAgent.speakState` uses the selected TTS and
tracks the speech handle. Pocket has a separate baseline audio adapter.

[voice/src/local-tts.ts](../../plugins/jarvis/voice/src/local-tts.ts) declares
nonstreaming synthesis, serializes sentence requests and aborts cancelled inference.
[The engine server](../research/spikes/local-tts/engine-server.py) uses CosyVoice
`stream=False`, collects waveforms, and optionally applies
`highpass=f=70,afftdn=nr=6:nf=-50` after generation. Framing completed PCM for HTTP
transport is not incremental synthesis. Qwen also returns full waveforms.
[The broker](../research/spikes/local-tts/broker.mjs) manages the local engine
selection. Qwen/CosyVoice Python runs in the inference VM; the BB plugin and
LiveKit companion remain TypeScript/Node. These are self-hosted spikes and do
not require hosted TTS API keys.

This differs from the original dedicated BB talker-session proposal: assistant
history is in a relay journal, not a persisted BB talker thread. Full provider
selection, transcript integration and memory/selected-session context remain
unmet rather than being silently declared equivalent.

## Where: control, ownership and persistence

[coordinator.mjs](../../plugins/jarvis/coordinator.mjs), `createCoordinator`,
records intent before worker dispatch, tracks uncertainty, validates task scope,
steers owned work and distinguishes stop acknowledgement from observed state.
It uses a configured project/environment/provider; general per-request routing
and safe adoption of pre-existing work are not complete. Tasks start with
`verification: 'unverified'`; there is no completed independent result verifier.

[relay/director.mjs](../../plugins/jarvis/relay/director.mjs) and
[relay/questions.mjs](../../plugins/jarvis/relay/questions.mjs) observe visible
threads, select current questions, and bind answers to question identity,
generation and presentation. The authorized existing-thread reply extension
allows directed answers to that exact current question. Watching alone never
authorizes steering, stopping or approving unrelated work. Other staging writes
remain constrained to task-owned work and existing user authorization.

Client lease/generation checks fence stale owners. Playback acknowledgements
track delivery; interruption cannot authorize an unheard question. Snapshot
refresh and polling supply current state. A durable BB event cursor, complete
source-level notification controls and full passive-client/handoff UI are absent.

[relay/main.mjs](../../plugins/jarvis/relay/main.mjs) uses version-1 journals,
atomic replacement and a single loopback listener as its writer lock.
Operational history, tasks, pending questions and delivery state are not personal
memory. There is no implemented memory capture/correction/deletion/export/recall
system, no external-source configuration and no Jarvis scheduled-review adapter.
Version checks do not substitute for schema migration/recovery acceptance.

## What holds it in place

- [Coordinator tests](../../plugins/jarvis/tests/coordinator.test.mjs): dispatch
  deduplication, uncertain spawn/approval handling, ownership, steering, current
  approval payload and late descendants during stop.
- [Director tests](../../plugins/jarvis/tests/director.test.mjs): exact/stale
  question handling, competing answers, owner takeover, interrupted validation,
  delivery acknowledgement, quiet watching and single-call chat.
- [Relay tests](../../plugins/jarvis/tests/relay.test.mjs) and
  [diagnostics tests](../../plugins/jarvis/tests/diagnostics.test.mjs): authenticated
  restricted forwarding and bounded/redacted diagnostic records.
- [Control-lane tests](../../plugins/jarvis/voice/tests/control-lane.test.mjs),
  [framing tests](../../plugins/jarvis/voice/tests/framing.test.mjs),
  [local TTS tests](../../plugins/jarvis/voice/tests/local-tts.test.mjs) and
  [speech tests](../../plugins/jarvis/voice/tests/speech.test.mjs): cancellation,
  sample integrity, explicit readiness failures and selection constraints.
- [Integration evidence](../research/jarvis-livekit-integration.md),
  [control recovery](../research/jarvis-control-recovery-2026-11-15.md),
  [startup recovery](../research/jarvis-start-recovery-2026-11-15.md) and
  [all-controls audit](../research/jarvis-control-audit-2026-11-15.md): bounded real
  staging journeys. See each report for its runtime revision and limitations.

The latest recorded totals are 57 plugin and 17 companion component tests.
The all-controls run passed 29 browser checks; three affected recovery checks
passed after the final UI fix. The full suite was not rerun after that last fix.
These are historical results, not tests rerun during this documentation change.

## Known limits and deployment boundary

The [reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md) owns the
remaining requirement ledger. Chief blockers are complete-response and waveform
buffering, Start latency above one second, unaccepted noise/pace, interruption
above the proposed 250 ms target, and incomplete real desktop/Android/car suites.
No current noise filter result proves physical listening quality. Browser tests
with a silent synthetic microphone cannot establish echo or Bluetooth behavior.

Companion provisioning, engine deployment and supervision remain operator-managed.
Examples under [voice/deploy](../../plugins/jarvis/voice/deploy) do not constitute
a portable install/uninstall/upgrade lifecycle. Diagnostics exist but are not a
complete correlated cost, task-success and conversational-quality analytics suite.

The last recorded disposable app VM was Dragon VM100, with inference on Lynx
VM222. The app staging record and network expiry were November 18, now past.
Revalidate the registry, ownership, capacity, routes and credentials before
resuming; this reconciliation does not establish that either VM is still present
or reachable. Stable remains outside candidate changes. No merge or promotion is
approved by this record. After explicit approval and production verification,
preserve evidence/rollback artifacts and remove dedicated staging resources as
required by the global service-development rules.


Operational update later on November 22: fresh registry records establish
November 21 operator retention of VM100/VM222. The [Mac cleanup](../research/jarvis-mac-cleanup-2026-11-22.md)
unloaded five obsolete local staging jobs; both remote VMs and the shared voice
service were preserved. Re-establish the relay/tunnels and valid credentials
before claiming the review path works. This supersedes the earlier unknown
retention state, but is not a fresh remote-VM functional test.
