# Jarvis plugin delivery plan

Status: active — reconciled 2026-11-22 against unmerged implementation `08a9fe9`. Partial Slice A/B candidate exists; voice and real-task acceptance remain unmet. No promotion approved.

Current evidence and every remaining acceptance area are recorded in the
[November 22 reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
The [architecture record](../architecture/0001-jarvis-current-design.md) describes
what is built. Historical staging statements below are dated evidence, not a
claim that staging is available today. Unchecked acceptance items remain unmet;
partial implementation does not check them off.

Vision: [Jarvis for BB](../vision/jarvis.md).

Implementation was authorized November 14 after the requested source research.
The initial typed coordination panel was rejected as insufficient. The approved
restricted-relay staging decision is preserved in the
[staging preflight](../research/jarvis-staging-preflight.md).

## Foundation and reuse

Work on specs/jarvis-vision, based on freshly fetched origin/main at 1c66e84. Preserve unrelated edits in the original checkout. Do not merge origin/eli wholesale. Audit its voice engine, speech formatting, orb/stage, event follower, and tests for selective reuse against the current installed SDK. Main's read-aloud fixes postdate that branch; do not reintroduce its older Edge synthesis assumptions. Use BB-owned thread UI and lifecycle APIs rather than a separate agent runtime.

## Research-backed bootstrap

Use the [bootstrap decisions and reuse ledger](../research/jarvis-bootstrap-decisions.md) as the implementation starting point. Selectively reuse existing BB speech/UI code and adapt Qwen's small turn-correlation and notification-claim modules with provenance and tests. Evaluate Pipecat's existing semantic detector before inventing one. Apply OpenClaw/Hermes/Happy/Moltis recovery, approval and memory invariants through BB APIs; keep BB as the execution and scheduling runtime. The source research establishes donor choices, not a live candidate pass.

## Planned delivery order

1. Establish the current SDK contracts and an explicit capability/gap matrix for thread creation, asynchronous send, event subscription, pending interactions, cancellation, provider selection, storage, and plugin UI. Unsupported provider controls must remain visible capabilities, not prompt-level promises.
2. Deliver a responsive conversation and visible staff: the talker delegates to BB sessions without waiting synchronously, persists task-to-thread references, and receives bounded updates. Reconcile state after reload and reconnect. Show actual BB state and links.
3. Integrate speech with Pocket Alfred preferred, a configurable quality-first talker, explicit microphone activation, captions, barge-in, and one active audio owner across tabs/devices. Distinguish interruption of speech from cancellation of work. Handle lease conflicts and lost connectivity visibly.
4. Close the control loop: bind approvals to exact pending interactions and current action details; reject stale or ambiguous answers. Propagate stop to owned workers and confirm observed termination or clearly report partial failure. Preserve existing BB/provider permission enforcement.
5. Add durable personal memory and proactive coordination according to the interview decisions. Keep user intent separate from worker output and external content. Bound context and event replay; avoid recursive notification loops.
6. Verify the actual plugin end to end in disposable staging against the real lab; present a reviewable candidate. Promotion requires Chris's explicit approval of that candidate. After approved promotion and production verification, preserve source/evidence/rollback artifacts outside staging, remove dedicated VM/disks/credentials/exposure routes, release reservations, and retire records.

Detailed implementation and acceptance criteria are in [conversation and speech](0002-jarvis-conversation-and-speech.md), [coordination, control, and memory](0003-jarvis-coordination-and-memory.md), and [events and scheduled follow-ups](0004-jarvis-events-and-scheduled-follow-ups.md). The specification phase changed no service code or stable installation. Implementation now follows the staging gate below.

## Current implementation decisions — reconciled 2026-11-22

The authorized LiveKit spike and integration superseded Pipecat as the active
media path on November 15. Chris subsequently preferred self-hosted CosyVoice's
Alfred-reference voice; Pocket is retained as a baseline/optional adapter, not
the current staging default. This preference does not accept CosyVoice noise,
latency or interruption behavior. Pocket-specific availability/lease requirements
below still apply if that adapter is offered; they do not establish CosyVoice
acceptance. The common voice requirements and release gates remain unchanged.

The current talker uses model-only inference through the BB host's account pool,
not the dedicated BB talker thread proposed below. Its bounded journal and typed
control boundary exist; provider selection UI, BB conversation persistence and
selected-session/memory context are not equivalent or complete. This deviation
is recorded, not counted as delivery of the original talker contract.

## Pocket discovery and verification — 2026-11-14 (historical baseline)

Authoritative discovery: central registry record `voice`, revision 15, plus the installed managed service client and Alfred runbook. Discover live addresses and credentials through that record at implementation time; do not embed an administrator secret in the plugin or browser.

- Alfred request: POST /v1/audio/speech, model pocket-tts, voice alfred, speed 1.25.
- PCM streams signed 16-bit little-endian mono at 24 kHz; WAV waits for the complete file. Speech input is bounded to 2,000 characters. Closing the PCM response cancels generation.
- One exclusive reservation; REST requests serialize and cannot run alongside an active realtime session. Lease duration is 30–900 seconds with renewal; busy returns 409, expired credentials 401. A gateway restart invalidates leases.
- Proxy speech through the authenticated plugin backend; cross-origin browser requests are not enabled. Keep lease credentials private and never distribute the master credential. Staging gets its own expiring lease, released at teardown. Long-lived lease acquisition/renewal integration must be settled before implementation.
- Authenticated local status reported all four components ready and no active reservation. A task-owned 120-second lease synthesized “Good evening, Chris. Your agents are ready.” into valid WAV: 86,060 bytes, 24 kHz mono, 1.792 seconds of audio, 0.48 seconds total request time. Lease released and private session file deleted. This is transport/format verification, not a listening-quality test or conversational latency benchmark.
- The registered public HTTPS health URL returned 502 from this execution environment, including a retry outside the normal sandbox. Local service health does not establish remote reachability. Diagnose the public path before remote staging acceptance; do not replace it with a guessed endpoint or disable TLS.
- Runbooks include older deployment statements; the registry records the later public HTTPS migration and approved promotion. Installed service contract and live checks take precedence over those historical statements.

## Interview decisions

Chris agreed to the broader personal-assistant vision through BB agents/sessions, thread coordination first, open-session desktop/phone use, explicit microphone activation, and cloud-capable quality-first models. He selected the existing Pocket Alfred voice as the preferred speech output. He authorized autonomous delegation within his requests and existing permissions, observation of visible top-level sessions with consequential announcements and quiet mode, and automatic sourced/correctable/deletable personal memory with credentials excluded.

Implementation defaults: stop targets Jarvis-delegated work; barge-in targets speech; the talker uses a configurable BB provider rather than hardcoded Claude. Existing user and project instructions still apply. These defaults follow the agreed scope and are stated explicitly so they can be revised without reopening unrelated decisions.

## SDK feasibility snapshot

Checked 2026-11-14 using `bb plugin types --check plugins/you-should-know` and official `@get-bb/plugin-sdk@0.6.132` bundled declarations downloaded outside the checkout. The host reports SDK 0.6.132; main's newer plugins pin 0.5.9, and the root dependency installation is older still. No package pins were modified. The implementation must check its actual target BB version, pin compatible types, and document a tested minimum version.

| Capability | Available surface | Remaining proof |
| --- | --- | --- |
| Worker delegation | threads.spawn/send; provider catalog; project/environment selection | Real selected providers, permissions and restart reconciliation |
| Observation | threads.events.list; experimental_thread.events; thread.idle/failed; interaction.pending | Ordering, replay, reconnect and duplicate handling |
| Approvals/questions | threads.interactions.get/list/resolve/respond/cancel, scoped by threadId and interactionId | Correct resolution schema per interaction/provider; stale and concurrent response behavior |
| Cancellation | threads.stop returns only `{ok:true}` | Actual owned process/work termination and no later queued restart |
| UI | navPanel, ThreadChat, experimental_appOverlay | Current mobile/browser lifecycle and audio ownership |
| Speech input | system.transcribeVoice; Pocket REST audio | End-to-end recognition, busy handling and consented provider behavior |
| AI helper services | Plugin AI complete/transcribe registration | These are helper-task APIs, not a generic streaming conversational client |

Start with a dedicated BB talker session using the best suitable configured provider. Give it bounded delegation/status/control tools and no synchronous worker wait. Gate the design on measured responsiveness. If BB session delivery cannot meet the conversational target, record the bottleneck and scope a supported streaming-provider integration; do not invent a nonexistent SDK API or route conversation through the title helper.

## Release slices and completion

- **Slice A:** a typed, responsive chief of staff with durable task tracking, existing-session visibility, ordinary question relay, domain authority validation, real delegation, exact approvals and verified cancellation. Requires the coordination core before it can be represented as useful staff management.
- **Slice B:** voice-complete interaction with Alfred, natural turn-taking, desktop/phone UI, microphone-off announcements, barge-in, approvals and cancellation without clicks. Together A and B form the first review candidate.
- **Slice C:** sourced memory including past-decision recall, consistent persona and selective BB-session awareness, with correction/deletion and quiet-mode acceptance. Completes the initial experience only after the real-task scorecard passes.
- **Slice D:** one explicitly enabled external-event journey and one scheduled commitment/checklist review through BB agents, with deduplication, missed-run recovery and disable controls. [0004](0004-jarvis-events-and-scheduled-follow-ups.md) defines the requirements and acceptance. This closes the planned awareness/proactivity gap beyond the initial experience.
- **Optional later scope:** additional BB-agent workflows, sensors, wake words or companion clients. No separate orchestration platform.

The plans remain active until their implementation and verification criteria are met. Archive completed plans under specs/plans/archive, preserving links and moving any unfinished scope into a live plan. Completion of these specifications is not completion of the planned plugin.

## Verification strategy

Use real BB sessions and the real registered Pocket service. Exercise simultaneous conversation and long work, voice approval/denial, stale approval rejection, cancellation while work is executing, reconnect/restart recovery, multi-tab audio ownership, lease conflict/expiry, and typed operation when voice fails. Measure end-of-speech to actual first audible output separately from time to complete worker work. Report p50/p95, sample count, device/browser/network, and failures; never count an earcon as a substantive reply.

Before service implementation, use the home-lab skill to provision a disposable VM, verify capacity, and issue least-privilege staging credentials. Do not copy existing secrets without Chris's authorization. Real-lab constraints that prevent safe verification must be reported rather than replaced by synthetic services. Specifications can be reviewed without provisioning a VM.

## Real-task acceptance scorecard

Before candidate acceptance, name and record a baseline: Chris's current direct BB workflow on the same selected task suite, with date, actual sessions, versions and conditions. Freeze the suite, per-journey success evidence, allowed side effects, repetitions and numeric thresholds before scoring the candidate. Derive intervention and completion-time budgets from that baseline; record deliberate differences in task difficulty. Targets remain unset until this evidence exists, so an uncalibrated suite cannot be reported as passing. Never weaken thresholds after a failure without documenting the change and rerunning the affected suite.

| Journey | Desired result and independent evidence | Allowed scope and dependencies |
| --- | --- | --- |
| Home-lab diagnosis | Explain a real backup/service problem with current registry and host/service evidence; verify the diagnosis against actual status | Read-only via home-lab skill; repairs require their own applicable authorization |
| Research/browser work | Produce a useful comparison answering an actual question; inspect cited sources and required deliverable | Authorized browsing and draft artifacts; no purchase or external send |
| Calendar/email | Prepare the requested real schedule summary or draft and verify against authorized source records | Existing connected account; sending/changing remains separately scoped by the request and policy |
| Concurrent staff | Two real bounded tasks progress while a second conversational question is answered; relay a worker question and verify stop scope and actual termination | Real BB workers and safely owned processes; unrelated work survives |
| Personal recall (Slice C) | Explain a prior decision and its later correction with correct sources | Authorized real BB history; no wholesale ingestion |
| Initiative (Slice D) | Relevant external event and due review produce timely, nonduplicate updates without a fresh utterance | Only explicitly enabled sources/schedules under 0004 |

For each run record attempted, agent-reported complete, independently verified, failed and unverified tasks. Report verified/attempted success rate and questions requiring Chris per attempted task. Separate mandatory approvals, necessary ambiguity resolution and avoidable clarifications; count erroneous interruptions per observation hour. Report blocker-to-resolution time and spoken-stop-to-confirmed-termination time, including sample counts, denominators, failures and unconfirmed stops. Use p50/p95 only with sample counts and identify small samples rather than implying statistical certainty. Correctness and required approvals take precedence over lowering intervention counts.

Acceptance requires verified outcomes for every required supported journey, no unauthorized action or wrong-target approval, and the predeclared quality/intervention/timing thresholds. Missing integrations are explicitly unverified and block claims for their domains; use no invented accounts, records or replacement services. Report any proposed reduction in release coverage for Chris's review. Run this scorecard in addition to 0002's audio suite and 0003's control/recovery checks, retaining actual source evidence outside staging.

## Blueprint gap traceability

The [gap analysis](../analysis/jarvis-blueprint-gap-analysis.md) records the pre-revision assessment. These entries track specification coverage, not implementation completion.

| Finding | Requirement and acceptance owner | Release gate |
| --- | --- | --- |
| G1 Natural turn-taking | 0002: Natural turn-taking; Acceptance and measurement | B |
| G2 Domain authority | 0003: Domain capability and authority | A and each added integration |
| G3 Useful outcomes | This plan: Real-task acceptance scorecard; 0002 stop timing | A–D as journeys become applicable |
| G4 External awareness and initiative | 0004: enabled external event and scheduled review | D; full-vision claim remains pending |
| G5 Microphone-off announcements | 0002: Playback without microphone capture | B |
| G6 Existing sessions and ordinary questions | 0003: Watched work, selected context and ordinary questions | A |
| G7 Recall and persona | Vision: Conversational character; 0003: Recall; 0002 dialogue review | B persona; C recall |

## Staging and promotion evidence

Before coding a runnable candidate, discover and reserve a disposable home-lab VM using the home-lab skill. Stage the actual plugin with real BB integration and real lab services through supported interfaces. Confirm that the staged BB instance can access the intended real projects/sessions through supported authenticated access; a second empty instance is not proof of cross-session management. If this requires unapproved secret copying or the real platform cannot isolate candidate code safely, report that concrete blocker and obtain the necessary decision. Do not install candidate code into the stable BB to bypass staging.

The evidence bundle outside the VM must identify source revision, BB/SDK/provider versions, exercised real sessions, actual endpoint checks, device/browser coverage, permission outcomes, latency distributions, turn-detection errors, real-task scorecard and baseline, user interventions, cancellation observations, and known gaps. Include a working authenticated review URL via BB Connect where appropriate. Chris's review approves promotion, not the agent's implementation-correctness verdict. No synthetic services substitute for real-lab end-to-end acceptance.

A release must not claim remote speech readiness until the public Pocket path has been exercised from staging. Preferred voice unavailability is visible and typed interaction remains usable. A startup/reboot limitation in a dependency must be recorded with the actual supported availability boundary.
