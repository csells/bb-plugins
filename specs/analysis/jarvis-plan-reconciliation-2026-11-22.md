# Jarvis plan reconciliation — November 22, 2026

## Verdict and baseline

**All five plans remain active.** The branch contains a working integration and
useful, narrowly tested controls. It does not contain an accepted hands-free
chief of staff. We got stuck qualifying voice: CosyVoice sounds best to Chris,
but its startup is too slow and its background noise is not accepted. Repeated
interruptions and the complete real-device workflow remain unqualified.

This reconciliation inspects `specs/jarvis-vision` at implementation commit
`08a9fe96ab33bff71638fe24eed24aae66eb2bce`. It is not merged into freshly fetched
`origin/main` (`908e99b`). Source was inspected on November 22; runtime evidence
below comes from November 14–15 reports. No runtime tests, infrastructure changes
or promotion occurred during this documentation-only reconciliation.

Baseline: five plans in `specs/plans/`, no plans index, no archive, no architecture
folder, and **zero unresolved references** from the skill's reference checker.
The new [plans index](../plans/README.md), [specs index](../README.md) and
[current architecture](../architecture/0001-jarvis-current-design.md) provide the
missing navigation and actual-design record. No plan meets its purpose yet, so
none is archived and every remainder stays in its original active plan. No
repository AGENTS.md or equivalent needed updating; global staging rules remain
applicable and unchanged.

## Later same-day operational update

The [Mac cleanup](../research/jarvis-mac-cleanup-2026-11-22.md) subsequently read
fresh registry state: Chris retained VM100 and VM222 on November 21, superseding
the old VM review expiry. Both were preserved. Five obsolete Mac staging jobs
were unloaded at his request; review access must be deliberately re-established
with valid credentials before further tests. The expiry discussion below is the
original documentation-only baseline, not authority to delete retained VMs.

## Where work stopped

| Issue | Last evidence | Disposition |
| --- | --- | --- |
| Android/car silent until earlier audio played much later | Earlier browser transport failed with capture active; authorized LiveKit spike received Chris's positive feedback | Transport direction selected, not physical-device acceptance of the later CosyVoice implementation |
| Voice selection | Chris preferred CosyVoice over Kokoro/Qwen; complained of background static/hum | Preference recorded; no noise/quality sign-off |
| Noise | Light post-generation filter reduced one quiet-window measurement by about 2.5 dB; same sample count; 79 ms processing; 53-word browser sample transcribed exactly | Implemented mitigation, not a proven root cause or noise-free listening result |
| Start latency, dynamic briefing | Warm CosyVoice 13,083 ms; Kokoro 14,403 ms to first decoded non-silent audio | **Fails <1,000 ms**; full briefing/model wait and batch synthesis remain |
| Start latency, stock text | Warm George 2,222 ms; Fable 2,141 ms; CosyVoice 2,606 ms; Qwen 4,013 ms, or 13,427 ms when switching/loading | **Every trial fails <1,000 ms**, even without briefing inference |
| Repeated interruptions | Small desktop CosyVoice sample: 655/611/611 ms; Qwen recovered poorly after its first interruption | CosyVoice misses proposed 250 ms target; Qwen is experimental; no full current Android/car qualification |
| Qwen End then restart reports active conversation | Abandoned startup reservation/cancellation identity regression reproduced then fixed | Bounded startup/end/restart evidence; not a cure for Qwen inference stalls |
| What needs me while speaking throws busy error | Control lane retained ownership through playout; controls now preempt and fence stale work | Reproduced and fixed in real browser; same fix covers other explicit controls |
| Stop speaking during briefing preparation | Pending generation could speak later; now invalidates presentation and cancels relay inference | Regression fixed, including typed Send supersession |
| End retry leaves old error | Failed close retains cleanup credentials; successful retry now clears resolved error | Affected recovery path retested after final UI edit |

Sources: [streaming/start audit](../research/jarvis-streaming-api-audit-2026-11-15.md),
[stock comparison](../research/jarvis-stock-briefing-2026-11-15.md),
[three-engine spike](../research/jarvis-self-hosted-tts-spikes-2026-11-15.md),
[noise/control follow-up](../research/jarvis-cosy-controls-noise-2026-11-15.md),
[start recovery](../research/jarvis-start-recovery-2026-11-15.md), and
[all-controls audit](../research/jarvis-control-audit-2026-11-15.md).
These timing samples are individual trials, not p50/p95 distributions.

**Did every button get tested?** Eventually, yes within a specified desktop
staging run: all 14 button IDs, voice/pace selectors, disclosures and download
payloads were exercised in 29 browser checks with real BB/model/CosyVoice and a
silent synthetic microphone. After the final error-clear fix, three affected
recovery checks were rerun; the entire suite was not rerun. This does not establish
every click ordering, every engine, active-worker termination, real acoustic echo,
or Android/Bluetooth behavior. The earlier spot checks were insufficient; the
later audit is stronger evidence with explicit boundaries.

## What must happen next

1. **Restore a verified staging baseline.** Use the home-lab skill to discover
   actual registry state and verify ownership/capacity before reusing or replacing
   disposable resources. The last app VM100 lease and network expiry were
   `2026-11-18T23:59:59Z`; current availability is unverified. Inspect the inference
   VM222, relay expiry, least-privilege credentials, media routes and service
   versions too. Preserve evidence before any authorized teardown. Keep the
   stable installation unchanged; do not treat an old review URL as healthy.
2. **Prove true streaming CosyVoice at the requested pace.** The current server
   uses `stream=False` and collects full waveforms. Forward actual incremental
   PCM yields, keep cancellation effective, and qualify continuous tempo/noise
   processing at brisk pace without restarting filters per chunk or losing words.
   Compare the preserved reference and cleanup variants by listening and capture.
   Prewarm the selected model. Measure prepared-text-to-audio separately from
   Start-to-audio. A streaming API or a first-byte timestamp alone is not a pass.
3. **Remove the other startup/response waits.** The host model requests SSE but
   returns a complete string; the LiveKit adapter emits that as one delta. Stream
   safe conversational output to speech while preserving typed action validation,
   exact-question presentation and generation fencing. Move permissible readiness
   work off the click path; retain explicit microphone activation. Do not make an
   old briefing, unheard question, canned greeting or cached audio look like a
   fresh useful answer. Retest both stock Start and grounded Brief me/normal Start.
4. **Qualify the exact candidate end to end.** Run the complete all-controls suite
   after the final edit, plus controls during preparation and speech, End during
   startup, restart, failed cleanup, typed fallback and competing ownership.
   Use real model/service paths and repeated spoken interruptions, including
   interruption of the second and later answers. Test all offered voices or mark
   unqualified choices as experimental. Then run at least 30 representative turns
   on each primary desktop and physical Android/car configuration. Report missing
   words, false turns, echo-triggered commands and actual audible timing. Preserve
   **Start <1 s; turn response p50 ≤800 ms/p95 <2 s; interruption ≤250 ms** as the
   existing gates/engineering targets, with failures visible and no metric swaps.
5. **Close Slice A/B control and useful-work acceptance.** Exercise two real
   concurrent workers while chatting, spoken approval and denial, stale/ambiguous
   questions, competing clients, uncertain effects across restart, owned
   descendants and observed process termination without unrelated work stopping.
   Validate enabled domain authority through actual worker tools. Implement the
   missing staff/context/routing/recovery pieces. Establish the direct-BB baseline
   and frozen real-task scorecard before claiming task success or reduced user
   effort. Package supported install/upgrade/disable/cleanup and expose useful
   dependency failures. This is still required after voice becomes acceptable.
6. **Complete later vision work in order.** Implement sourced memory and recall
   under 0003, including correction/deletion/replay suppression and export. Then
   implement one explicitly enabled external event and one scheduled review under
   0004 through BB's supported mechanisms. Future source/schedule enablement still
   needs the specific scope described in that plan; this reconciliation grants
   none. Complete each real journey before claiming the full awesome-Jarvis vision.
7. **Review, then promote only if explicitly approved.** Present the actual
   working staged candidate with source revision, evidence, device coverage and
   remaining limits. Approval of a spike or permission to implement is not
   promotion approval. After approved promotion and production verification,
   preserve rollback/evidence and remove dedicated staging resources, credentials
   and routes under the global rules.

Primary next implementation owner is this Jarvis branch, specifically 0002/0005
for steps 1–4 and 0003/0001 for step 5. Nothing requires another framework spike
before measuring CosyVoice's real streaming path; whether it can meet the budget
on the available hardware is still an experiment, not a promise.

## Reading the requirement ledger

**Partial** means implementation or bounded evidence exists but the complete
requirement/acceptance is unmet. **Unmet** means absent or not verified; it does
not imply the user dropped it. **Historical** means dated evidence, not current
health. Quoted labels below retain the plans' terminology. All clauses in each
linked section remain required; only the explicitly evidenced subset is credited.
The original complete text remains in the active plans, including constraints and
checklists. No unchecked acceptance step is converted to complete by this report.

Source symbols and test links are in the [architecture record](../architecture/0001-jarvis-current-design.md).
The [54-family matrix](../research/jarvis-scenario-matrix-2026-11-15.md) remains the
broad scenario inventory. Its earlier busy-control and companion-down fallback
failures have the later bounded fixes above; its other gaps remain open.

## 0001 — Delivery: active

[Plan and all remaining requirements](../plans/0001-jarvis.md).

| Step or requirement, in the plan's terms | Evidence and verdict |
| --- | --- |
| “Foundation and reuse”; “Research-backed bootstrap” | Source reviews and bootstrap ledger exist; Qwen modules/provenance present. Historical main base `1c66e84` retained. Partial: donor research does not establish integration acceptance or all reuse objectives. |
| 1. “Establish the current SDK contracts and an explicit capability/gap matrix” | SDK snapshot and plugin pin `0.6.132` exist; real spawn/send/question/stop paths exercised. Partial: all provider capabilities and minimum-version compatibility are not qualified. |
| 2. “Deliver a responsive conversation and visible staff” | Coordinator journals, task list, director and independent conversation exist. Partial: complete staff view/links, selected context, routing and restart/reconnect acceptance remain. |
| 3. “Integrate speech with Pocket Alfred preferred” | LiveKit, explicit activation, captions, voice selection and ownership exist. Preference changed to CosyVoice; common voice contract remains. Partial: quality, latency, handoff and acoustic/device suite unmet. |
| 4. “Close the control loop” | Typed validation, exact questions, stale/concurrent unit tests, narrow real answers and one observed process stop. Partial: full spoken allow/deny, domain enforcement and stop/recovery suite unmet. |
| 5. “Add durable personal memory and proactive coordination” | Thread watching/quiet mode partially implemented. Memory and wider proactive coordination unmet. |
| 6. “Verify the actual plugin end to end in disposable staging” | Dated real staging reports exist. Partial: full acceptance/review/promotion unmet; approved-promotion cleanup remains future required work. |
| “Pocket discovery and verification”; “SDK feasibility snapshot” | Historical discovery/format/API evidence only. Pocket public-path/lease lifecycle requirements remain conditional on offering Pocket, unqualified as a complete supported path. |
| “Interview decisions”; dedicated BB talker session | BB worker delegation/observation and bounded talker exist. Direct account-pool model replaces the proposed thread in source; full provider selection/thread persistence is unmet, not silently equivalent. |
| “Slice A” | Partial coordination; complete chief-of-staff, authority and recovery acceptance unmet. |
| “Slice B” | Partial voice; accepted brisk voice, natural turns and click-free control qualification unmet. |
| “Slice C” | Memory, correction/deletion and sourced recall unmet; watching alone does not satisfy it. |
| “Slice D” | External-event and scheduled-review journeys unmet; owned by 0004. |
| “Optional later scope” | Sensors/wake words/companion clients remain optional; no completion claim or added dependency on them. |
| “Verification strategy”; “Staging and promotion evidence” | Narrow real-service tests and saved evidence exist. Full sample counts, device/network coverage, real outcomes and promotion gate remain unmet. |
| “Real-task acceptance scorecard” baseline and thresholds | Unmet: no frozen direct-BB comparison suite, per-journey budgets or completed intervention/outcome scorecard. |
| “Home-lab diagnosis” | Unmet as a scored Jarvis journey against actual diagnosis evidence. |
| “Research/browser work” | Unmet as a scored Jarvis deliverable/source-verification journey. |
| “Calendar/email” | Unmet as a scored real account/draft journey; no assumed account or send authority. |
| “Concurrent staff” | Narrow real workers tested; simultaneous conversation, decision and independently verified stop scorecard remains unmet. |
| “Personal recall (Slice C)” | Unmet; no implemented sourced-memory/history recall. |
| “Initiative (Slice D)” | Unmet; no enabled event and due-review acceptance. |
| Scorecard outcomes, intervention classes, erroneous interruptions/hour, blocker/termination timing | Unmet as a complete measured suite; preserve denominators, failures and unconfirmed states rather than use isolated successes as rates. |
| “Blueprint gap traceability” G1–G7 | Requirements have owners in 0001–0004; implementation closure remains partial/unmet as detailed below. Specification coverage is not delivery. |

## 0002 — Conversation and speech: active

[Plan and all remaining requirements](../plans/0002-jarvis-conversation-and-speech.md).

| Component or behavior | Evidence and verdict |
| --- | --- |
| “Talker session” | Model-only host account-pool adapter and bounded journal exist. Dedicated BB conversation, persisted thread reference, in-product provider choice, selected-session/memory context and full login recovery experience unmet. |
| “Coordinator” | Typed delegate/inspect/steer/answer/stop, task references, async observation and preemptible controls exist. Partial: sustained concurrent-user/worker and priority/recovery qualification. |
| “Speech adapters” | BB batch STT and Pocket/local TTS adapters exist, explicit selection/readiness failure. Partial: accepted quality and true incremental local TTS absent. |
| “Session controller” | Expiring owner/generation and takeover tests exist. Partial: complete passive clients, deliberate UI handoff and physical-device/reconnect journey. |
| “Presentation” | Panel, transcript/captions, question and task displays, controls exist. Full BB ThreadChat/navigation integration, thread links/staff view, memory controls and active app-wide orb unmet. |
| Durable state; ephemeral audio; diagnostic privacy | Versioned journals and bounded/redacted diagnostics tested. BB talker transcript persistence differs; complete retention/migration/dependency-log audit remains unmet. |
| “Explicit Start”; separate listening/quiet/work controls | Source and all-controls audit support tested transitions. Full physical capture-release/route-change qualification remains unmet. |
| “Model state separately from device state” | UI/events distinguish several states. Partial: complete disconnected/ownership/queued-output semantics and device evidence. |
| “Use streaming PCM”; correct format | Frame/sample-integrity tests and browser PCM evidence exist. Local synthesis buffers waveforms; true low-latency synthesis unmet. Pocket-specific path remains baseline, not current default. |
| Segmentation and generation-tagged late-chunk rejection | Sentence serialization, abort and generation tests exist. Partial: mixed-turn/device recovery and all late-event orderings. |
| “Barge-in”; speech versus work cancellation | LiveKit interruption and explicit stops implemented. Partial: timing target missed; repeated physical interruption and real spoken work-stop suite unmet. |
| “Use echo cancellation and test speaker playback” | Browser capture/LiveKit transport exists; historical user spike feedback. Current CosyVoice car echo, background-speech and ambiguous-approval acceptance unmet. |
| “On speech failure, retain captions and typed control” | Real companion-outage text reply and autoplay/close recovery tested. Partial: full busy/expiry/network/device matrix. |
| “Natural turn-taking” | VAD/continuous session and false-interruption resumption exist. Semantic turn detection, calibrated pre-roll/quiet onset, continuation merging, overflow/noise/echo authority acceptance unmet. |
| “Playback without microphone capture” | Mic toggle/quiet/watching and denied-mic fallback have bounded tests. Complete independent output ownership, visible blocked/busy/expiry queue, coalescing and no-capture real-announcement matrix unmet. |
| “Pocket lifecycle” | Optional baseline lease code/historical tests exist. Unattended least-privilege reacquisition, independent announcement reservations, busy/401/release-failure/public-path qualification remain unmet when offering Pocket. |
| “Mobile browser transport decision”; “Source-backed bootstrap” | LiveKit replaces Pipecat as implemented media choice. Turn/claim donors and source reviews exist; semantic detector evaluation/calibration and full delivered-text accounting remain unqualified. |

Implementation checklist (none fully complete):

| Existing checklist step | Verdict |
| --- | --- |
| “Check the current SDK and inspect existing origin/eli components against main” | Partial: SDK/reuse evidence; complete provider, orb/event reuse and replacement behavior not qualified. |
| “Implement and exercise the typed talker/coordinator path with a real BB worker and a second concurrent user request” | Partial: real worker and typed paths; required simultaneous useful-answer journey not fully accepted. |
| “Add the panel, transcript, task links, captions and distinct listening/quiet/stop controls” | Partial: basic panel/control evidence; complete links, keyboard/screen-reader and full phone workflow unmet. |
| “Add and calibrate turn detection, bounded pre-roll, continuation handling and noise rejection with real microphones” | Unmet as a calibrated complete suite; current VAD is only a starting implementation. |
| “Add Pocket leases, streaming playback, generation cancellation, device ownership, independent capture/playback controls, explicit failure recovery and user-visible configuration” | Partial adapters/controls; remaining lifecycle, ownership and selected-provider acceptance above. |
| “Measure the actual candidate and compare suitable configured talker models” | Partial timing probes; correctness/latency/sustained-turn model comparison, accepted default and cost/usage observations unmet. |

| Acceptance scenario | Verdict |
| --- | --- |
| “Talk while worker runs” | Partial integration evidence; required second useful answer before long-task finish and task attribution not fully scored. |
| “Natural conversation” | Unmet full short-answer/pause/correction/quiet-onset/noise/echo suite. |
| “Microphone-off update” | Partial control/fallback tests; full real completion, capture-off, quiet, blocked/busy visible queue and dedupe acceptance unmet. |
| “Alfred output” | PCM/transcription samples and Cosy preference; actual intended voice/noise/pace listening acceptance unmet. |
| “Barge-in” | Small real-service trials; 250 ms target missed and sustained physical suite unmet. |
| “Voice control” | Typed and narrow directed-answer paths; full spoken approval/denial/stop with observed results unmet. |
| “Device handoff” | Owner fencing unit/browser tests; full desktop/phone transition unmet. |
| “Service trouble” | Some outage/autoplay/start/close cases pass; complete selected-adapter trouble/release suite unmet. |
| “Reconnect/reload” | Journal/uncertainty tests and limited restart evidence; complete no-replay/no-duplicate/no-stale-action journey unmet. |
| “Accessibility” | Phone-width layout, labels and text path checked; keyboard/screen-reader same-workflow acceptance unmet. |
| 30 turns/configuration; stage timing and p50/p95/failures | Unmet; one-off or three-trial measurements do not meet sample requirement. |
| Noise/quiet onset/resumed turns; errors per turn and activations/hour | Unmet as a calibrated suite with observation durations. |
| Named baseline, quality thresholds and representative persona dialogue | Persona instructions exist; independent baseline/dialogue acceptance unmet. |
| Spoken-stop onset/recognition/dispatch/observed termination | One foreground-process termination case exists; complete spoken timing distributions and uncertainty cases unmet. |
| Foreground versus locked/background; version/network/model/lease evidence | Some report metadata exists. Full current-device bundle unmet; locked/background support is not claimed. |

## 0003 — Coordination, control and memory: active

[Plan and all remaining requirements](../plans/0003-jarvis-coordination-and-memory.md).

| Requirement area | Evidence and verdict |
| --- | --- |
| “Task” record; “idle alone is not task success” | Version-1 intent/task journal and cancellation states exist; verification remains unverified. Complete lifecycle/result evidence and migrations unmet. |
| “Pending decision” | Focused questions, current payload/generation checks and uncertain-delivery receipts exist. Partial: complete form/provider and spoken approval coverage. |
| “Memory” record | Unmet; assistant conversation journal is not personal memory. |
| “Notification” | Persisted deliveries/claims and dedupe tests exist; complete importance/source queue/expiry/dismissal behavior unmet. |
| “Audit action” | Operation/decision receipts exist; complete authority-to-observed-outcome/retention audit unmet. |
| “Delegation and recovery” — target selection/reuse | Configured single project/environment/provider path implemented. Per-request routing, capability discovery, ambiguity UX and safe adopted scope unmet. |
| Intent before dispatch; reconcile uncertain outcomes; bounded briefs | Coordinator tests and narrow real workers support partial implementation. Stable client retry identity and full restart/uncertain-effect real tests remain. |
| Events/cursors/snapshots/order/descendants/concurrency/auxiliary cleanup | Snapshot polling and descendant stop support a subset. Durable event cursor, all state distinctions, explicit queue/continuation control and full cleanup recovery unmet. |
| Plugin reload/disable cleanup while preserving user work | Some process/session teardown exists; complete supported plugin lifecycle and restart acceptance unmet. |
| “Domain capability and authority” | Unmet as an enforced real-domain matrix; generic typed scope checks do not establish domain-specific authorization. |
| Email/calendar; Spending; Infrastructure; Code; Physical security | Each allowed/denied real-tool path, concrete enforcing integration/version and alternate-tool bypass test remains unmet/unverified. No implied permission to spend/send/promote/unlock. |
| “Watched work, selected context and ordinary questions” | Existing visible thread snapshots and exact directed answer extension exist. Staff view/links, adopted-control labeling, selected-source API/picker and descendant display remain partial/unmet. |
| Ordinary-question journey: pre-existing, answered, ambiguous, reload, competing clients, descendant, selection changes | Narrow real current-question answer and stale/concurrent unit tests exist. Entire real journey remains unmet. |
| “Approval and cancellation contract” — typed operations/exact interactions | Server validation and current-payload unit tests exist. Full real spoken allow/deny/changed/expired/ambiguous/competing-provider coverage unmet. |
| Untrusted content; provider enforcement | Talker has no tools and handlers validate independently. Full external-text adversarial and actual worker/tool boundary qualification unmet. |
| “Jarvis, stop”; descendants, adopted scope, named stop, queued restart | Scoped stop/late-descendant unit tests and one actual bounded process stop. Named/adopted stop, complete spoken/offline/unresponsive/queued-restart journey unmet. |
| Stop acknowledgement versus observed termination | Explicit uncertainty exists and one process termination observed. Broad actual process/descendant verification remains unmet; never claim external effects undone. |
| “Selective awareness” | Visible-session refresh, change watching, quiet and current-question refresh exist. Source pin/off/mute/dismiss, durable cursor, complete priority/expiry/reconnect digest and result-grounded completion remain incomplete. |
| “Personal memory” | Capture, provenance, explicit/inferred precedence, correction, deletion, source suppression, cache/index cleanup, export, relevant retrieval, memory-off and per-item controls all unmet. |
| “Recall of past conversations” | Bounded sourced decision/reason/date/correction recall, unavailable-source handling and deletion-safe retrieval all unmet. |
| “Source-backed bootstrap and recovery cases” | Turn/delivery ownership tests and research donors exist. Transactional complete recovery, late adopted generations and forgetting/purge-phase failure cases unmet. |

Every original implementation/acceptance checklist item remains open:

| Checklist item | Verdict |
| --- | --- |
| Durable task/decision records; one request creates one task across retry/reconnect | Partial unit/core evidence; stable end-to-end request identity and full real journey unmet. |
| Domain authority matrix | Unmet for each enabled integration. |
| Watched-session visibility, selected context, ordinary questions | Partial as above; full journeys unmet. |
| Actual approvals: allow/deny/question/stale/duplicate/competing/ambiguous speech | Partial unit and narrow question evidence; full real matrix unmet. |
| Stop real process and descendants; no restart; disconnected/unresponsive; unrelated survives | Partial one-process evidence; complete journey unmet. |
| Event cursors/reconciliation/dedupe/selective notifications | Partial snapshots/claims/quiet; durable cursor and complete real completion/failure/needs-user/reload suite unmet. |
| Memory capture/source/correction/deletion/export/retrieval and restart/replay | Unmet. |
| Past-decision recall, changed preferences, unavailable history | Unmet. |
| Parent real-task scorecard and intervention classification | Unmet. |
| Third-party content cannot approve/rewrite preferences via typed UI and voice | Partial typed validation; complete adversarial real test and memory path unmet. |
| Credential/audio retention, migration/restart, evidence and promotion/cleanup | Partial diagnostic tests and saved evidence; full storage/lifecycle acceptance unmet. |
| Final combined two-task/side-question/voice-approval/memory-correction/quiet/stop/reconnect journey | Unmet; cannot pass before memory and full control qualification exist. |

## 0004 — Events and scheduled follow-ups: active, planned

[Plan and all remaining requirements](../plans/0004-jarvis-events-and-scheduled-follow-ups.md).
No implemented source/review adapter or real acceptance evidence was found.
The existing BB-thread watcher is not an external-event or scheduling implementation.

| Requirement/check | Verdict |
| --- | --- |
| “Scope and capability gate”: one real enabled event and one chosen due review; supported BB execution | Unmet; source/capability discovery and specific enablement still required. No separate scheduler or invented feed permitted. |
| “Configuration and authority”: owner/purpose/scope/cadence/timezone/expiry/authority/state/health, inspect/pause/edit/disable | Unmet; no source/review records or UI. |
| Trigger authority, revoked access, changed commitment | Unmet; remembering a commitment must not silently enable a schedule or action. |
| “Execution and recovery”: intent/correlation, dedupe, source evidence | Unmet for these journeys. |
| Timezone/DST, missed/expired/coalesced runs, unknown started effects, generation fencing, bounded retry | Unmet. |
| Notification priority/expiry/quiet/microphone-off/current digest | Unmet for real external/due events; partial thread watching does not satisfy it. |
| Pause/disable future dispatch, queued updates and owned-trigger cleanup; preserve running/unrelated work | Unmet. |
| Checklist: “Record the real source, supported APIs, permissions and versioned configuration” | Unmet. |
| Checklist: “Observe a safe actual source event” without fresh utterance or duplicates | Unmet. |
| Checklist: “Let a real enabled commitment/checklist review become due” | Unmet. |
| Checklist: “Exercise restart/disconnection spanning a due occurrence” and timezone | Unmet. |
| Checklist: “Verify quiet mode, microphone-off playback, blocked audio and reconnect digest” | Unmet for this source; qualify the selected voice path, with Pocket-specific checks if offered. |
| Checklist: “Pause, edit, expire and disable a source”; revoked access | Unmet. |
| Checklist: “Add both journeys to the parent scorecard” and retire owned schedules/subscriptions | Unmet. |
| Optional sensors/closed-session listening/locked playback | Still deferred, not silently added to the initial release. |

## 0005 — LiveKit integration: active

[Plan and all remaining requirements](../plans/0005-jarvis-livekit-integration.md).

| Implementation step | Evidence and verdict |
| --- | --- |
| 1. “Move the successful TypeScript companion into the plugin's supported voice component” and package lifecycle | Source, pinned LiveKit dependencies, embedded panel and build scripts exist. Partial: operator-managed deployment is not supported install/upgrade/disable lifecycle. |
| 2. “Connect quiet/watch/update delivery to the live conversation” with priority/stale suppression/speech binding | Director delivery/claim tests, LiveKit speech handles and bounded browser cases exist. Partial: full priority/reconnect/mic-off/device acceptance. |
| 3. “Remove the redundant conversational classification round trip where safe” and measure model timing | Single-call chat with timing metrics implemented/tested. Partial: complete-text buffering still defeats first-text-to-speech latency; full useful-response acceptance unmet. |
| 4. “Exercise real owned workers” delegation/question/answer/steering/scoped stop and typed path | Narrow real integration and one-process stop evidence exist. Partial: full concurrent/spoken/descendant/recovery acceptance. |
| 5. “Verify candidate builds, policy/recovery tests, rendered BB integration, real voice service round trips, restart/reconnect and desktop/phone acceptance” | Historical builds/component/browser checks and earlier Android smoke feedback exist. Partial: final complete suite, current Cosy quality, latency and sustained physical-device acceptance unmet. |
| Extended route changes/cellular recovery/background limitations | Unmet qualification; no background/locked-phone support claim. |
| Self-hosted voice comparison and stock briefing | Implemented spikes and fixed-text fresh synthesis. Cosy preferred; Qwen experimental. No production engine acceptance. |
| Less than one second after Start | Fails both grounded and stock paths; implementation correction pending. |
| Full roadmap, real-task acceptance and promotion gate | Unmet as above; integration does not close memory/recall/external-event milestones or authorize promotion. |

## Evidence and document maintenance

No implementation was changed to make the documentation appear complete. The
architecture now records LiveKit, tool-less host inference, restricted control,
batch buffering, operator-managed dependencies, and absent memory/scheduling.
0001/0002 distinguish current voice preference and transport from historical
Pocket/Pipecat decisions. 0003 now says partially implemented rather than merely
planned; 0004 stays unimplemented; 0005 has an explicit active status and latest
bounded fixes. Original requirements remain in the active plans.

The November 15 scenario/gap reports remain dated evidence. Their current-reading
notes point here so a future agent does not reopen fixed controls or assume all
remaining gaps disappeared. No archive moves or broken-link repairs were needed.
The final reference check reports zero unresolved references, matching the initial
baseline. The checker initially interpreted the architecture’s branch name as a
file path; its formatting was corrected. Whitespace validation also passes.
Runtime tests were not rerun for this documentation-only change.
