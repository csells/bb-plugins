# Jarvis requirement-to-evidence matrix — 2026-11-15

Current-reading note (2026-11-22): this is a dated assessment. Subsequent fixes
cover startup reservation cleanup, controls during speech/preparation, independent
text fallback and close-error recovery. See the
[plan reconciliation and next steps](../analysis/jarvis-plan-reconciliation-2026-11-22.md)
for their exact evidence and the remaining gates. The full voice/control roadmap
is still incomplete; old staging links are not current health checks.

Candidate: `274acbf`. These are 54 scenario families, not 54 passing tests. A narrow pass does not close its entire family. `unit-only` means the full browser/real-service journey is not established. `not-implemented` is an open gate, never a skipped pass.

Sources: vision, plans 0001–0005, original awesome-Jarvis blueprint. See [audit](jarvis-full-gap-analysis-2026-11-15.md) for measured results and priorities. The [JSON catalog](evidence/jarvis-scenario-coverage-2026-11-15.json) retains code anchors.

| ID / slice | Required scenario | Implementation | Evidence | Exact remaining acceptance |
| --- | --- | --- | --- | --- |
| V01 / B | One-tap briefing and native duplex audio | implemented-narrow | fresh-pass | Browser Start produces real briefing text and decoded Alfred audio; physical route separate. |
| V02 / B | Thirty representative voice turns per desktop and phone | partial | fresh-pass-narrow | 30/30 simple generated desktop prompts passed; full mixed suite and phone configuration remain unverified. |
| V03 / B | Useful response latency p50<=800ms p95<2s | partial | fresh-fail | Measure full end-of-speech to audio; pipeline still batches STT and buffers complete model text. |
| V04 / B | Barge-in cuts output and preserves worker execution | implemented-narrow | prior-pass-narrow | Existing injected interruption passed; test short/quiet controls and worker state together with captured old-audio tail. |
| V05 / B | False interruption resumes without missing audio | partial | unverified | SDK configured but test cough/backchannel recovery, audio continuity and exact resume position. |
| V06 / B | Thoughtful pauses and continuations preserve one intent | partial | unverified | VAD-only end detection; test incomplete phrase + pause + continuation without premature action. |
| V07 / B | Quiet onset, short yes/no/wait and corrected speech | partial | prior-pass-narrow | Short wait passed spike; continuous correction in audit; short answers and quiet onset need repeated contextual control trials. |
| V08 / B | Echo and background speech never authorize actions | partial | unverified | Browser AEC requested; injected MediaStream bypasses acoustic AEC. Need controlled speaker/double-talk and command-rate denominator. |
| V09 / B | Microphone-off updates and independent quiet mode | implemented-narrow | prior-pass-narrow | Real named unsolicited update with capture off demonstrated; busy/autoplay queue cases remain. |
| V10 / B | Microphone denial preserves text and spoken output | implemented-narrow | prior-pass-narrow | Previous browser permission-denial check passed actual typed delegation; retain replayable regression. |
| V11 / B | Text/control fallback when voice service is unavailable | partial | fresh-fail | Client requires LiveKit session before enabling Send. Run session HTTP 503 browser fault; then verify text result through real director after repair. |
| V12 / B | Alfred busy/expiry/truncation with visible retained updates | partial | unit-only | PCM truncation components pass; need actual busy/expiry/release faults plus retry queue and no lost announcement. |
| V13 / B | Single owner across two tabs | implemented-narrow | fresh-pass | Second tab rejected visibly; does not certify handoff or per-user multi-tenant isolation. |
| V14 / B | Deliberate device handoff and passive live viewers | absent | not-implemented | Director takeover has unit tests but current companion has no takeover/passive client path. |
| V15 / B | Reconnect/reload without stale speech or duplicate work | partial | unverified | Fresh sessions after clean restart passed; outage during a turn, room recovery and uncertain dispatch are not equivalent. |
| V16 / B | Captions and history reflect actually heard output | partial | unverified | Full generated text is shown; external director history not truncated to heard words; no visible conversation history. |
| V17 / B | Phone layout, keyboard and screen-reader operation | partial | fresh-pass | 390px layout passes; full focus order, errors and screen-reader announcements not audited. |
| V18 / B | Persistent app-wide active state across panel navigation | absent | not-implemented | Iframe pagehide ends call; no active app-wide orb/session shell. |
| V19 / B | Configurable voice/persona/model with visible failures | partial | unverified | Operator config selects talker; Alfred/persona and service ports tied to deployment; no product-level choices or login recovery. |
| C01 / A | Natural delegation through real BB | implemented-narrow | prior-pass-narrow | Violet/Amber/Cedar real workers created from panel; test varied real requests and targets. |
| C02 / A | Two long workers plus independent live conversation | partial | unverified | Nonblocking architecture exists; no current complete concurrent two-worker browser/model scenario. |
| C03 / A | Project/environment/provider/skill-aware routing | absent | not-implemented | All spawned work uses one configured tuple; no per-request capability/account discovery or session reuse. |
| C04 / A | Existing watched work and owned descendants in dashboard | partial | unverified | Dashboard lists owned roots only; watched sessions and descendants absent; no real thread links or selected-context picker. |
| C05 / A | Ordinary pre-existing question answered exactly once | partial | unit-only | Bound ordinary-message unit and historical legacy browser evidence; current LiveKit pre-existing-session control journey unverified. |
| C06 / A | Structured native/Codex multi-question forms | partial | prior-pass-narrow | Current real Codex single-question answers confirmed by workers; multi-part only unit tests, unsupported/multiselect use external form. |
| C07 / A+B | Spoken approval and denial reach exact current action | partial | unit-only | Exact approval code exists; real current browser-STT-model allow/deny test matrix absent. Explicit approve once differs from blueprint bare yes. |
| C08 / A+B | Stale, duplicate and competing-client answers rejected | partial | unit-only | Mock SDK race tests pass; repeat with real pending interaction changed on another client before spoken answer. |
| C09 / A | Steer owned work and verify worker receipt | implemented-narrow | prior-pass-narrow | Real worker returned steering marker after SDK-shape fix; no browser retry stability or uncertainty reconciliation suite. |
| C10 / A+B | Stop work during briefing or command playback | partial | fresh-fail | Busy guard rejects stop before interrupt/dispatch; high-priority control must bypass speaking command lock. |
| C11 / A+B | Spoken stop kills owned process/descendants and queued restarts | partial | prior-pass-narrow | Old foreground-process sample; current starting->idle and descendant unit tests. Need spoken onset->actual process death, delayed descendant and disconnected cases. |
| C12 / A | Named stop and scoped adopted-session cancellation | absent | not-implemented | Only generic owned-work stop route; no named stop intent, adoption generation or reused-session control. |
| C13 / A | One request dispatches once across browser retries | partial | unit-only | Coordinator same-ID test passes; provider creates fresh UUID per talk call, client has no durable request identity. |
| C14 / A | Uncertain actions reconcile across restart | partial | unit-only | Spawn reconciliation exists; no automatic answer/steer receipt reconciliation or operator recovery UI. |
| C15 / A | Verified results distinct from idle, failure and unknown | partial | unverified | verification remains unverified; live BB status displayed but no result-evidence lifecycle or verification workflow. |
| C16 / A | Domain authority enforced for enabled integrations | absent | not-implemented | No email/spending/lab/code/security enforcement matrix or allowed/denied real-tool tests. BB permissions preserved, not proof of domain enforcement. |
| C17 / A | Untrusted worker/web/memory text cannot authorize actions | partial | unverified | Tool-less talker and exact handlers help; actual-model adversarial content suite missing, natural action classification is model-dependent. |
| C18 / A+C | Consequential-only notifications without recursion | partial | unverified | Changed text can trigger speech every 30 seconds; no source mute/dismiss/expiry, explicit auxiliary exclusion or interruption-rate evidence. |
| C19 / A+C | Durable event replay, supersession and visible failed queue | partial | unit-only | Snapshot/delivery journal and supersession tests; no persisted event cursors; failed updates not pending for automatic retry; no queue UI. |
| C20 / A | Missing/deleted task cannot break unrelated supervision | partial | unverified | tasks uses Promise.all of snapshots; one rejected owned thread can fail all tasks and intent context. Needs real deletion/outage isolation test. |
| M01 / C | Automatic sourced facts/preferences/people/commitments | absent | not-implemented | Recent transcript only; implement records, extraction, provenance and explicit-vs-inferred ranking. |
| M02 / C | Inspect, remember, correct, forget, export and memory-off | absent | not-implemented | No memory operations or controls; test actual browser utterances and UI parity. |
| M03 / C | Forgetting survives crash, replay and derived caches | absent | not-implemented | No tombstones/indexes/purge recovery; test each purge failure phase and restart before claiming deletion. |
| M04 / C | Past-decision reasoning with source and later correction | absent | not-implemented | No history-search adapter; last 12 exchanges/recent excerpts cannot establish sourced recall. |
| M05 / C | Private relevant memory only reaches appropriate worker | absent | not-implemented | No retrieval/scoping or suppression layer; test unrelated-history exclusion and secret handling. |
| P01 / D | Enabled external event triggers one relevant update | absent | not-implemented | No source adapter/configuration/cursor; real authorized event required, not a mock registry. |
| P02 / D | Enabled scheduled commitment review executes through BB | absent | not-implemented | No scheduler adapter or review records; explicit source/commitment enablement required. |
| P03 / D | DST, downtime catch-up and uncertain occurrence recovery | absent | not-implemented | No occurrence ledger; add timezone and uncertain-effect cases to real scheduler suite. |
| P04 / D | Pause/edit/expire/disable fences work and announcements | absent | not-implemented | No source controls or disable reconciliation; verify real triggers stop, unrelated schedules survive. |
| O01 / A-D | Install/configure/restart/disable portable BB plugin | partial | unverified | Manual service example, fixed loopback ports and task relay; no companion provisioning/update/disable contract. |
| O02 / A-D | Correlated per-turn analytics, latency/cost/outcome dashboards | partial | unverified | Useful operational logs, but model timing lacks turn correlation; no aggregate SLO, task scorecard, cost or failure denominator. |
| O03 / A-D | Durable state migrations and privacy/retention controls | partial | unit-only | Version1 JSON only; bounded history but task/decision receipts lack retirement/retention policy; old diagnostics tests do not cover all new logs. |
| O04 / A-D | Repeatable gated browser/real-model release suite | partial | unverified | Fresh audit harness added; no full release runner/CI job, exact authorization workers and all scenarios not covered. |
| O05 / A-D | Real-task baseline and independently verified outcomes | absent | not-implemented | No frozen direct-BB baseline, intervention budgets or scored lab/research/calendar/concurrent journeys. |
| X01 / Later | Wake word, ambient sensors and closed/locked listening | excluded | not-applicable | Deliberate BB first-release scope choice, not a missed initial implementation requirement. |
