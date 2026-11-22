# First integrated LiveKit candidate

Status: active — reconciled 2026-11-22. Integration implemented on unmerged branch; portable lifecycle, latency, audio quality and full device/control acceptance remain open.

Current evidence and every remaining acceptance area are recorded in the
[November 22 reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
The [architecture record](../architecture/0001-jarvis-current-design.md) describes
what is built. Historical staging statements below are dated evidence, not a
claim that staging is available today. Unchecked acceptance items remain unmet;
partial implementation does not check them off.

Authorized by Chris on 2026-11-15 after the successful Android spike.
Stable stays unchanged; the actual candidate runs in disposable staging.

Deliver the BB panel with Start/briefing, automatic thread updates and exact
questions, directed answers, typed fallback, task visibility, delegation/steering,
separate speech/work stops, and observable recovery. Reuse LiveKit's media and
turn handling. Preserve question binding, ownership and BB permission checks.

Implementation sequence:
1. Move the successful TypeScript companion into the plugin's supported voice
   component. Embed its authenticated interface in the BB panel and package its
   installation, health and lifecycle configuration.
2. Connect quiet/watch/update delivery to the live conversation; prioritize user
   input, suppress stale updates and bind delivery completion to its speech handle.
3. Remove the redundant conversational classification round trip where safe;
   measure real model time-to-first-text/total and retain explicit action guards.
4. Exercise real owned workers: delegation, unsolicited question, directed answer,
   steering and verified scoped stop. Test typed input through the same contract.
5. Verify candidate builds, policy/recovery tests, rendered BB integration, real
   voice service round trips, restart/reconnect and desktop/phone acceptance.

Evidence goes in specs/research/. Existing research remains historical. A successful
integration does not complete memory, recall, scheduled reviews or external event
milestones. No production promotion follows without review of this candidate.

Historical November 15 status: the integrated candidate was implemented and staged. Real BB
worker delegation, named automatic announcement, exact directed answer and
steering are verified; quiet mode, startup cancellation, service restart and
microphone-denied text/audio fallback are verified in the panel.
57 policy tests and three PCM framing tests pass on the VM. The initial measured
conversational response reached browser audio about four seconds after detected
speech end. See [integration evidence](../research/jarvis-livekit-integration.md).

Remaining qualification: extended Android/car conversations, route changes and
cellular recovery/background behavior. Initial briefing still waits for complete
model text, and companion provisioning remains operator-managed. These limits
are preserved as work; this candidate does not close the full Jarvis roadmap.


Follow-up to the full gap analysis: Stop now preempts briefing preparation and
playback, with stale presentation fenced. Use text connects directly to the
existing authenticated director; its browser bundle loads from BB while the
companion is stopped. Candidate component coverage is now 57 + 6 tests. Actual
browser checks include both stop phases, competing-client ownership, text/model
reply during a real companion outage, and independently observed termination of
one bounded foreground worker process. See [control recovery evidence](../research/jarvis-control-recovery-2026-11-15.md).

These repairs do not close A/B: full real spoken approval/denial, concurrent-worker,
restart/uncertain-effect, acoustic/device and useful-work acceptance remain open.
The [54-family audit](../research/jarvis-scenario-matrix-2026-11-15.md) remains the
baseline; the follow-up evidence closes only its specifically exercised defects.
Latency, memory, sourced recall and external initiative are not resolved here.

Self-hosted speech follow-up: Kokoro, Qwen3-TTS and CosyVoice3 now have executable
inference spikes connected to this same LiveKit companion, with server-owned
voice/pace selection and an optional listening-grade export. Hosted-provider
activation was removed. The plugin stays TypeScript; Qwen/CosyVoice Python
inference is isolated in disposable VM222. Component coverage is now 57 + 16.
See the [three-engine evidence and remaining limits](../research/jarvis-self-hosted-tts-spikes-2026-11-15.md).
Desktop PCM, transcription and interruption results qualify only their stated
cases. Human voice preference, Android/car acceptance and the original latency
gates remain open; no engine is selected for production by this spike.

Startup acceptance correction: Chris requires first spoken audio less than one
second after Start. The new real-browser gate fails at 13.1 s (CosyVoice) and 14.4 s
(Kokoro), despite warm models. Full-briefing buffering, media startup and batch
TTS all remain on the critical path. See the [API/startup audit](../research/jarvis-streaming-api-audit-2026-11-15.md).
Do not mark conversation acceptance complete from quality/interruption passes.

Stock-text comparison is now staged at Chris's request: Start skips briefing
inference and synthesizes identical text afresh. Warm click-to-audio remains
2.1–4.0 seconds; Qwen is re-enabled for this comparison with its reliability
warning, not accepted for production. See the [stock briefing results](../research/jarvis-stock-briefing-2026-11-15.md).

## Latest disposition — 2026-11-22

Chris prefers CosyVoice. Light noise cleanup is implemented, but perceived-noise
acceptance is still open. The Qwen End/restart reservation failure and the
What needs me during speech failure have bounded regression evidence. The
subsequent [all-controls audit](../research/jarvis-control-audit-2026-11-15.md)
exercised all 14 buttons in 29 browser checks, then retested the three affected
recovery checks after its final UI fix. It did not rerun the complete suite after
that last fix. Latest recorded component coverage is 57 plugin + 17 companion
tests, not an end-to-end release result.

The [noise/control](../research/jarvis-cosy-controls-noise-2026-11-15.md),
[start recovery](../research/jarvis-start-recovery-2026-11-15.md) and
[streaming audit](../research/jarvis-streaming-api-audit-2026-11-15.md) preserve the
boundary between fixed defects and open acceptance. Next: revalidate disposable
staging, implement and measure real streaming CosyVoice with brisk pace, remove
full-response buffering, then run complete control and repeated-interruption
qualification on the exact candidate. Full steps and later roadmap remain in the
reconciliation; this plan stays active.
