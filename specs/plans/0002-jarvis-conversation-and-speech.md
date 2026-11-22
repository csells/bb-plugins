# Jarvis conversation and speech

Status: active — reconciled 2026-11-22. LiveKit conversation exists; startup latency fails, voice quality is not accepted, and full desktop/phone conversation qualification remains unmet. Parent: [delivery plan](0001-jarvis.md).

Current evidence and every remaining acceptance area are recorded in the
[November 22 reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
The [architecture record](../architecture/0001-jarvis-current-design.md) describes
what is built. Historical staging statements below are dated evidence, not a
claim that staging is available today. Unchecked acceptance items remain unmet;
partial implementation does not check them off.

## Outcome and dependencies

Chris can talk or type to Jarvis in an open BB session, continue talking while BB workers execute tasks, inspect their state, answer approvals by voice, and stop work. Prefer Pocket Alfred without tying the talker to Pocket's local language model. This plan depends on the task/control contracts in [coordination](0003-jarvis-coordination-and-memory.md); develop the typed control path before adding speech recognition to it.

## Components and boundaries

1. **Talker session:** a dedicated BB conversation with a configurable provider/model, short spoken answers, and bounded context from the task ledger, selected session, pending interactions, and relevant memories. Persist its thread reference and recover it after reload. Use BB's provider selection/authentication rather than copying provider credentials. A missing model or expired login is an actionable visible state.
2. **Coordinator:** server-side typed operations for delegate, inspect, steer, answer, and stop. Tool calls return promptly with task references. Worker completion arrives asynchronously. Neither the talker nor its tools synchronously waits for a long worker. Prioritize user input over batched announcements and bound event context to avoid an ever-growing conversation backlog.
3. **Speech adapters:** separate transcription, synthesis, and optional future native speech-to-speech interfaces. Start with BB's configured transcription and Pocket REST TTS; evaluate Pocket transcription against real requests if BB transcription is insufficient. Identify the active adapter and its failure; never silently switch private audio to a new third party.
4. **Session controller:** one server-arbitrated active audio owner per Jarvis user, identified by an expiring client lease and generation. A deliberate handoff invalidates the old owner. Reload, reconnect and lost heartbeat release ownership. Microphone teardown releases capture; a playback-enabled owner may remain available for announcements without capturing audio. Multiple passive clients can view state without speaking or capturing audio.
5. **Presentation:** a Jarvis navigation panel with conversation, pending decisions, task cards and memory controls, plus a small app-wide status/orb while active. Reuse BB navigation and ThreadChat. Show text for every spoken answer and real thread links for work. Prefer host UI over recreating BB's transcript or approval widgets.

Persist durable state server-side; microphone frames and playback queues are ephemeral. Avoid raw-audio retention by default. Transcripts live in the BB conversation; diagnostics should use timing, outcome, and correlation IDs rather than recording private content. Label dependency logging limits: Pocket's own private operational logs may contain transcripts and are governed by that service's policy.

## Audio behavior

- Explicit Start activates microphone/audio following browser permission and gesture rules. Stop listening releases microphone capture and any idle listening lease; it does not imply cancellation of ongoing tasks. Quiet mode prevents unsolicited announcements; it does not disable the microphone. Controls must distinguish these meanings.
- Model state separately from device state: microphone off/listening/hearing, talker processing, playback speaking, service disconnected, and task working/blocked/complete are distinct facts. A visually idle talker can have active workers.
- Use streaming PCM from Pocket through an authenticated backend proxy, with continuous buffered browser playback. Apply the advertised sample rate and audio format; do not relabel 24 kHz PCM as the browser's native rate. WAV is useful for diagnostics but must not force every normal reply to wait for complete synthesis.
- Segment utterances at useful boundaries under Pocket's 2,000-character limit. Tag each request/chunk with response and playback generation. Ignore late chunks after interruption, model supersession, ownership transfer, or disconnect.
- Barge-in immediately cuts playback and aborts synthesis, then accepts the new utterance. It does not stop workers by itself. Explicit stop bypasses the slow model path once recognized and invokes the backend cancellation contract. Provide a persistent Stop work control with the same semantics.
- Use echo cancellation and test speaker playback, not only headphones. Do not let Jarvis's own speech authorize an action. Low-confidence or ambiguous approval recognition requires clarification or the visible card.
- On speech failure, retain captions and typed control. Prefer a visible error and retry to an unannounced replacement voice. A configured alternative may be selected explicitly. Do not claim microphone readiness in a suspended background tab or locked phone.

## Natural turn-taking

After Start, listen continuously across conversational turns until Stop listening, loss of capture permission, or session teardown. Use voice activity detection plus conversational end-of-turn detection: acoustic silence alone is insufficient. Keep a bounded in-memory pre-roll so quiet onset and initial consonants survive segmentation. Select the detector and tune silence windows from measured real-microphone quality; record configuration and version rather than mandating a library in advance.

Preserve short answers, pauses within sentences and self-corrections. If Chris resumes after premature end detection, invalidate the pending reply generation, stop any playback and incorporate the continuation before issuing a replacement reply. Discard unsent proposals from the superseded turn; already dispatched actions retain their real task state and cannot be treated as undone. Apply the coordinator's correlation rules to prevent duplicate dispatch.

Reject non-speech and playback echo before dispatch. Background speech and uncertain transcripts must not silently authorize a consequential action. Bound buffered audio and utterance length with documented limits selected during calibration; show a clear recovery prompt on overflow or transcription failure instead of submitting a silent truncation. Raw pre-roll expires with its utterance and is not retained in diagnostics.

## Playback without microphone capture

Track capture permission/state, browser playback permission, announcement preference, quiet mode, audio owner and Pocket reservation separately. A user gesture can enable output without enabling capture. Only the current output owner may play an announcement; passive clients display it without duplicate speech.

With watching enabled, microphone off, announcements enabled and quiet mode off, speak a consequential update when browser playback and a supported Pocket reservation are available. On blocked autoplay, busy capacity or absent ownership, queue the update visibly with the reason and an explicit play/enable-audio control. Never reacquire the microphone to make an announcement. Quiet mode queues unsolicited output regardless of playback permission. Retry only still-relevant, unexpired updates at the next valid opportunity, coalescing older ones into a current digest. Open-session browser restrictions remain applicable.

## Pocket lifecycle

Discover the service and runbook through the registry. Use the supported exclusive reservation flow. Keep administrator credentials on the voice host; a staging guest gets only its own short-lived lease. For initial staging, the operator can issue that lease via the registered client, and the backend renews/releases it. Production unattended reacquisition needs a supported least-privilege issuer on the owning host or an explicit credential provisioning decision; do not copy the master key into Jarvis. Treat this as an integration gate, not an already-existing API capability.

Acquire when an active conversation needs speech capacity, renew before expiry, and release when it ends. A microphone-off announcement independently acquires a short-lived reservation, releases it after playback, and never activates capture. Do not hold a Pocket reservation merely because watching or playback permission is enabled. On 409 show busy; never force-release another client. On 401 stop sending audio and reacquire through the authorized path. If release fails, show pending cleanup and rely on bounded expiry/reconciliation rather than claiming capacity is free. REST transcription and synthesis share serialized capacity; avoid blocking interruption on an outstanding TTS request. Do not start Pocket realtime in parallel with REST. Client arbitration does not increase service capacity.

Resolve the observed public-path 502 from the staging VM using verified TLS and current registry routes. Local synthesis success alone is insufficient. Shared-service changes, if needed, require their own disposable candidate and explicit promotion approval.

## Mobile browser transport decision — current as of 2026-11-22

The authorized [LiveKit spike](../research/jarvis-livekit-spike.md) and
[November 15 integration](0005-jarvis-livekit-integration.md) replaced the earlier
Pipecat SmallWebRTC candidate. The active implementation is the Node/TypeScript
LiveKit companion, a browser microphone RTP track and persistent remote audio.
The remote endpoint requirement remains: implement and verify reachable ICE/TURN,
request cancellation, queued-audio draining, stale-generation suppression and
honest delivered-text accounting. A one-browser/two-peer spike does not satisfy
real remote media, interruption or reconnect acceptance.

BB remains the execution authority. Pipecat and the older browser playback
experiments are historical research, not alternate completed production paths.

BB supplies batch transcription; the host relay supplies model-only inference.
Self-hosted CosyVoice is the preferred voice candidate after Chris's comparison;
Pocket is a baseline/optional adapter. Qwen and CosyVoice Python inference stays
outside the TypeScript plugin. No hosted TTS API key is required for these spikes.

The current session uses VAD turn detection, not the semantic end-of-turn behavior
required above. The model and local synthesis paths buffer complete responses
and phrases. True incremental synthesis, brisk streaming tempo, natural-turn
calibration and sustained physical Android/car qualification remain unmet.
Stock-text Start isolates synthesis/startup; Brief me still uses real BB context.
Neither path meets Chris's additional **Start-to-first-spoken-audio <1 second**
gate. Keep that gate alongside the turn-response and interruption targets below.

The original dedicated BB talker thread and full provider-selection experience
remain unmet by the direct model adapter. See the current architecture for this
explicit deviation. Retain all common speech, microphone-off, delivery-generation,
recovery and acceptance requirements; apply Pocket lease/public-path checks only
when qualifying the Pocket adapter. Do not require Chris to interpret another
ambiguous diagnostic matrix: report physical observations separately from
browser automation and measured acceptance gates.

## Source-backed bootstrap

Follow the [voice source review](../research/jarvis-voice-source-review.md) and [BB reuse review](../research/jarvis-moltis-and-bb-source-review.md): adapt Qwen's turn/correlation primitives and notification claims, reuse BB's speech normalization and UI components, and adopt Paseo's ordered STT-finalization and played-acknowledgement contracts. Evaluate Pipecat Smart Turn as a pinned narrow dependency against supported provider detection before selecting the detector; check model terms separately. Avoid copying silence thresholds that already consume the end-to-audio budget. Require the current claimant and playback generation when acknowledging delivered speech; preserve interrupted/unknown delivery honestly.

## Implementation sequence

- [ ] Check the current SDK and inspect existing origin/eli components against main. Reuse tested sentence normalization, orb and event handling where sound; replace the speech-only interrupt and hardcoded brain/provider behavior.
- [ ] Implement and exercise the typed talker/coordinator path with a real BB worker and a second concurrent user request.
- [ ] Add the panel, transcript, task links, captions and distinct listening/quiet/stop controls. Ensure keyboard and screen-reader labels and usable phone touch targets.
- [ ] Add and calibrate turn detection, bounded pre-roll, continuation handling and noise rejection with real microphones.
- [ ] Add Pocket leases, streaming playback, generation cancellation, device ownership, independent capture/playback controls, explicit failure recovery and user-visible configuration.
- [ ] Measure the actual candidate and compare suitable configured talker models on correctness, useful response latency and sustained conversation. Record the chosen default and cost/usage observations.

## Acceptance and measurement

All end-to-end checks use the actual plugin in the disposable environment and real BB/provider/Pocket interfaces. Unit tests can cover parsers, state transitions and race handling; they do not replace these checks.

| Scenario | Required evidence |
| --- | --- |
| Talk while worker runs | Second independent question receives a useful answer before the long task finishes; progress remains attributable to its task |
| Natural conversation | Repeated turns, short answers, thoughtful pauses, corrections and quiet onset preserve words and intent; background speech, noise and echo do not dispatch unintended commands |
| Microphone-off update | A real worker completion speaks with playback enabled and available capacity; capture stays off. Quiet mode suppresses it; blocked autoplay/busy Pocket queues it visibly without duplication |
| Alfred output | Actual speaker/output capture verifies intended audio, with captions and correct voice configuration |
| Barge-in | Recorded playback stops promptly and late audio never resumes; worker continues unless explicitly cancelled |
| Voice control | Spoken approval, denial and stop complete through the coordinator without clicks; exact results visible |
| Device handoff | Two tabs and desktop/phone transition produce at most one active speaker/microphone owner |
| Service trouble | Busy, expiry, interrupted stream and public-path failure remain visible; typed operation still works; owned lease released |
| Reconnect/reload | No historical speech replay, duplicate task dispatch, or stale approval execution |
| Accessibility | Typed controls, keyboard navigation, captions and phone layout exercise the same workflow |

Run at least 30 representative turns per primary desktop and phone configuration, including approvals, status questions, follow-ups and simultaneous worker activity. Report end-of-speech detection, transcription, first model text, TTS first byte, and actual first audio separately, with p50/p95 and failure count. Aim for p50 end-of-speech-to-useful-audio at or below the blueprint's approximately 800 ms budget and p95 below 2 seconds; these are proposed engineering targets, not source claims. Target playback interruption within 250 ms of detected barge-in. If the candidate misses them, investigate and report the measured gap; do not quietly redefine the metric as an earcon or lower the target. Separate cold starts from warmed turns.

For each configuration include quiet speech, background conversation, speaker echo, mid-sentence pauses, resumed turns and repeated exchanges in the 30-turn suite. Report clipped, missed and prematurely ended turns per attempted turn; report unintended activations and commands per observed listening hour, including the observation duration. Wake-word false accepts are inapplicable until a wake word ships. Establish the named baseline and quality thresholds before candidate acceptance using the parent plan's scorecard process. Review representative status, blocker, error, disagreement and completion dialogue against the vision's persona defaults; retain examples without treating style review as proof of task success.

Measure spoken-stop onset, recognition, cancellation dispatch and verified worker termination separately, including unconfirmed cancellations. The 250 ms playback target is not a worker-termination target; use the task-suite baseline for the latter.

Do not claim locked-phone/background support from a successful foreground test. Include the tested browser/device/version, network, provider/model, Pocket transport and lease state in the evidence bundle.
