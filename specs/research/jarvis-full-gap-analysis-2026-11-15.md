# Jarvis: implementation, blueprint and acceptance gaps

Current-reading note (2026-11-22): this is a dated assessment. Subsequent fixes
cover startup reservation cleanup, controls during speech/preparation, independent
text fallback and close-error recovery. See the
[plan reconciliation and next steps](../analysis/jarvis-plan-reconciliation-2026-11-22.md)
for their exact evidence and the remaining gates. The full voice/control roadmap
is still incomplete; old staging links are not current health checks.

Assessment: 2026-11-15. Candidate: `274acbf0faccc9c8faf941100e8606e1c113d94a`.
All 65 tracked plugin files match the disposable VM source. The original
`awesome-jarvis/blueprint.md` is unchanged from the pinned `0378a680` version.
This audit adds tests/evidence; it does not change the product or promote it.

Requirements: [BB vision](../vision/jarvis.md), [release slices](../plans/0001-jarvis.md),
[conversation](../plans/0002-jarvis-conversation-and-speech.md),
[coordination and memory](../plans/0003-jarvis-coordination-and-memory.md),
[events and schedules](../plans/0004-jarvis-events-and-scheduled-follow-ups.md),
[LiveKit integration](../plans/0005-jarvis-livekit-integration.md), and the
[original blueprint](https://github.com/csells/awesome-jarvis/blob/0378a680/blueprint.md).

## Verdict

Jarvis is a working voice-and-BB coordination prototype, with real delegation,
questions and directed answers demonstrated. It is not close to the full personal
assistant vision, and it has not passed either complete initial release gate A
or B. C's personal memory/recall and D's external initiative remain unimplemented.
The previous “ready for staging review” meant a reviewable integration candidate,
not completion of the original acceptance criteria.

The idea remains useful: it could let Chris supervise real BB work while driving
without navigating individual sessions. I would continue with the BB/LiveKit
architecture. The critical assumption is that conversation and control remain
available when work, audio or connectivity is busy or failing. The fresh audit
found that assumption false in two concrete paths. These are fixable integration
problems, not evidence that another voice framework is needed.

**We do not have extensive passing end-to-end coverage of all promised scenarios.**
We now have a [54-family requirement matrix](jarvis-scenario-matrix-2026-11-15.md),
a runnable browser audit, and explicit failed/unverified gates. Missing features
are not counted as skipped successes. An overall completion percentage would
hide the difference between working demonstrations and unmet release gates.

## Fresh evidence and its limits

| Check | Result | What it establishes |
| --- | --- | --- |
| Candidate VM component suite | 57 + 3 passed | Parser, coordinator, director, ownership and framing behavior under the test fixtures |
| Real browser voice loop | 30/30 expected answers with decoded audio | Ten generated prompts repeated three times through the actual BB panel, LiveKit/TURN, configured STT, real model and Alfred |
| Detected-end-to-decoded-audio | p50 **3,347 ms**, p95 **4,328 ms**, n=30 | Fails planned <=800 ms median and <2,000 ms p95; excludes acoustic endpointing and physical speaker delay |
| Opening briefing / phone-width layout | Passed | Actual briefing audio; 390px layout without horizontal overflow |
| Second active tab | Passed | Visible ownership conflict; does not establish deliberate handoff or passive viewing |
| Typed reply with microphone off | Passed | Real model reply and received audio, capture remains off |
| Stop delegated work during opening briefing | **Failed** | UI reports command failure; stop is rejected before its dispatch |
| Use text with unavailable voice companion | **Failed** | Injected HTTP503 makes Send stay disabled; no model call is possible through the fallback |
| Browser page exceptions | None | Does not override the two visible functional failures |

The browser audit exits nonzero. “30/30” is a narrowly successful voice-loop
sample, not a release pass. It includes one continuous self-correction repeated
three times, but no long thinking pauses, noise, actual approvals or worker
concurrency. Output is verified by received audio energy plus expected generated
answer; the captured waveform has not been independently transcribed to prove
word-for-word audio correctness. This is a foreground desktop browser using an
injected MediaStream. It cannot certify physical Android capture, acoustic AEC,
Bluetooth routing or what Chris heard. The earlier positive phone report remains
valuable but covered the spike, approximately 96 seconds and three turns.

The metric starts at the framework's detected user end, so it is more generous
than mouth-to-speaker latency. All 30 samples exceed two seconds even by this
metric. Longer substantive answers, model cold starts and large thread contexts
may be slower; this sample cannot estimate their percentiles.

[Sanitized results](evidence/jarvis-livekit-audit-2026-11-15.json),
[browser runner](probes/jarvis-browser-audit.mjs),
[inputs](probes/jarvis-audit-cases.json), and
[reproduction instructions](probes/jarvis-browser-audit.md) are retained.
Private raw evidence/fixtures live outside the VM in the task's
`jarvis-staging/audit-20261115/` directory. All test browsers are closed; the
candidate remains staged.

## What the existing passing tests actually cover

The 60 tests comprise 23 director tests, 12 coordinator tests, three relay
diagnostics tests, one HTTP relay test, two PCM transport tests, three current
voice framing tests, and 16 tests for older/auxiliary paths. Those 16 are seven
Qwen turn-state tests, four vendored notification-queue tests, three legacy media
playback tests and two duplex-spike checks. The vendored notification queue is
not imported by the current runtime; the old conversation controller is no longer
used by the panel. These tests may protect useful code, but they do not validate
LiveKit session integration.

In particular, tests whose names mention “real SDK send contract” still use an
in-memory SDK fixture. They validate argument shape and policy, not a real BB
provider. The three companion tests exercise WAV/PCM framing, not `Connection`,
watch scheduling, command priority, browser lifecycle or audio-owner races.
The busy-stop failure sits precisely in that untested integration layer.

Prior integration evidence establishes real single-question replies, named
updates, steering receipts independently confirmed by workers, microphone denial
fallback, and a starting task becoming observed idle. Historical legacy evidence
includes an ordinary-question flow and one foreground-process cancellation.
These must remain attributed to their exact versions and scopes; they do not
certify every equivalent LiveKit path or all descendant processes.

## Blueprint and release-plan comparison

| Blueprint capability | Current implementation | Remaining gap |
| --- | --- | --- |
| Natural listening, rare interruption | Native WebRTC, LiveKit VAD/interruption, configured false-interruption recovery | VAD-only endpointing, batch STT, buffered model response; no complete pause/noise/echo/short-control qualification; latency fails |
| Remembers you | Bounded recent conversation journal | No sourced preferences/people/commitments, relevant retrieval, correction/deletion/export, or personal-memory controls |
| Acts through tools | Real BB delegation, owned-task steering, exact question handlers | Fixed project/environment/provider; no capability discovery, domain authority validation, session adoption or real-life outcome suite |
| Notices context | Recent visible top-level BB snapshots | No selected-thread context, watched-work dashboard, continuous owned-descendant view or enabled external source |
| Speaks first selectively | Idle watched-update polling and quiet mode | Routine progress can trigger speech; no source mute/dismiss, complete failure queue, event cursors, schedules or commitments |
| Shows work | Current response/question, voice status and owned-task text rows | No real thread links, watched-task cards, descendants, evidence states, history view, memory UI or app-wide active indicator |
| Runs a staff | Real task creation, steering, question answering and scoped stop attempts | Busy-stop bug, named stop absent, concurrent staff acceptance incomplete, actual approval/denial and lifecycle recovery matrix absent |

Plan 0001 defines **A+B** as the first accepted review candidate, **C** as the
complete initial experience, and **D** as the broader planned vision:

- **A — partial:** basic coordination works; domain authority, full staff view,
  routing, concurrent workflows and recovery/control acceptance remain open.
- **B — partial:** voice round trips work; control availability, typed outage
  fallback, conversational quality, latency and mixed device acceptance fail or
  remain unverified.
- **C — mostly absent:** no personal memory or sourced historical recall. Existing
  persona/awareness is not the whole slice; the real-task scorecard is missing.
- **D — absent:** no external event/schedule adapters or their enable/disable,
  occurrence, timezone, deduplication and recovery contracts.

Wake words, ambient camera/presence/screen capture and closed/locked-phone
listening were deliberately excluded from the initial BB scope. Their absence is
not an initial-release defect. Foreground network recovery remains required.
The original starter builds are alternatives, not instructions to install every
named framework or add Python to this plugin.

## Ranked gaps and concrete closure tests

### 1. Critical controls depend on the busy speech path — fixable, highest priority

`Connection.command()` rejects when `commandBusy` is true. Start holds that flag
through the entire briefing playout. The stop-work endpoint routes through that
same method, so the UI's kill switch fails exactly while Jarvis is speaking its
briefing. This was reproduced in the actual browser; source is
[server.ts](../../plugins/jarvis/voice/src/server.ts#L62).

Make cancellation an independently available high-priority control. Its release
test must stop a real bounded process during briefing generation, briefing
playback, another control command, and a degraded voice path; verify process death,
queue inhibition, late descendants and survival of unrelated work. Unit mocks and
an idle task becoming idle do not close this requirement.

### 2. Text fallback requires the voice system to start — fixable

Use text calls the same room/session startup and only enables Send after that
succeeds. A voice-companion failure therefore removes text/control access despite
a healthy BB director. The browser fault test reproduces it; source is
[browser.ts](../../plugins/jarvis/voice/src/browser.ts#L37).

Provide a text/control connection independent of media initialization. Test actual
text replies, exact answers and scoped stop with voice startup unavailable, TURN
failure, capture denial, TTS busy, and a mid-session synthesis failure. The current
permission-denial pass covers only capture failure after a successful room start.

### 3. Spoken approvals and end-to-end authority remain uncertified — fixable

Exact hashes, current interactions, ownership and uncertain receipts are valuable
server checks. They are not a substitute for a real spoken allow/deny suite.
Current acceptance has exercised question answers, not the complete real
permission path. Multi-select and unknown forms require another interface; the
current plain question box does not embed BB's action card or link to that thread.

Build bounded, task-owned real approval workers. Drive allow, deny, ambiguity,
stale details, two-client competition, duplicate/replayed input and wrong-target
speech through browser capture -> STT -> model -> actual BB interaction. Assert
both the worker result and absence of unintended changes. Separately validate
allowed and denied real-tool paths for each offered domain. Do not perform a
purchase, external send or physical-security action just to manufacture coverage.

### 4. Natural conversation and the latency budget are not met — fixable

The current configuration explicitly uses `turnDetection:'vad'`, not semantic
end-of-turn detection. Installed Silero defaults provide 500ms prefix padding,
550ms silence and a 60s buffer; this is not missing VAD or missing buffering. What
is missing is calibrated conversational completion and quality evidence. The BB
STT adapter remains batch; the model consumes all SSE output before returning;
the TTS adapter accumulates complete text before requesting Alfred.

Use supported streaming/provider mechanisms and measure each boundary. Expand the
30-turn suite to short approval phrases, quiet onset, unfinished phrases with
pauses, corrections after endpointing, speaker echo, backchannels, noise and
simultaneous staff activity. Preserve the existing thresholds. Compare model
choices on correct useful answers and costs; a fast acknowledgment is not a reply.

### 5. Staff management is narrower than the promised product — fixable

The coordinator always uses one configured project/environment/provider. Task
rows show owned roots only and `verification` remains `unverified`. The browser
contains no watched-session dashboard, thread links, selected-context picker,
descendant grouping or result-verification workflow. Named stop/session adoption
is absent. One missing/deleted owned thread can reject `tasks()`'s whole
`Promise.all`, which is also consulted during intent classification.

Complete the staff view and scope-aware routing, then run two real tasks while
answering a separate conversational question. Verify one worker question, one
failure, progress attribution, missing-thread isolation, exact steering, named
cancellation and independently inspected results. Persist the originating client
request ID through retries: coordinator same-ID dedupe does not cover the current
fresh UUID generated for each conversational provider request.

### 6. Notifications, recovery and deployment are not production-complete — fixable

Snapshots and delivery records provide useful foundations. They are not durable
event cursors or a full outbox: changed routine excerpts can produce speech after
a 30-second throttle, failed deliveries are not pending retries, and there is no
visible queue/dismiss/source-mute UI. `update-error` events are not rendered by the
browser. If opening briefing preparation fails before the watcher assignment,
the periodic watcher is never installed. These are source-confirmed gaps; only
the busy-stop and fallback defects were dynamically reproduced in this audit.

The companion rejects a second owner but exposes no takeover/passive-view path.
The panel closes the voice session on navigation. Operator-installed companion,
media server, TURN and host relay are required; no plugin install/update/disable
lifecycle manages them. Settings do not yet make this a portable Jarvis plugin.
Model timing logs lack a turn correlation ID; there is no outcome/cost dashboard,
SLO monitoring or complete retention/migration policy.

Close these with real restart/outage tests at pending-action and delivery
boundaries, including failed startup briefing, source supersession, quiet-mode
catch-up, interrupted audio, old-owner fencing and plugin disable. Reconcile
unknown action outcomes; never reexecute work merely to make a test green.

### 7. Memory, recall and initiative are separate unbuilt milestones — fixable

Recent transcript history is not personal memory. No APIs or UI implement the
planned fact store, provenance, corrections, tombstones, retrieval, export,
source-linked decision recall, external event subscriptions or scheduled reviews.
These require feature work before their end-to-end tests can pass. They cannot
be closed by strengthening prompts or adding more voice-loop tests.

## Comparison with the strongest researched patterns

The ideal here is the combined product contract, not a claim that any one OSS
agent already passes every requirement. Chris's awesome-Jarvis lab results record
voice approvals and cancellation failures in otherwise strong projects.

| Pinned source/pattern | Already adopted | Still missing in BB Jarvis |
| --- | --- | --- |
| LiveKit AgentSession and standard room output | Framework-owned media, speech handles and interruption recovery in TypeScript | Complete turn-quality/recovery suite and correct priority/lifecycle around the BB adapter |
| OpenClaw execution/result/delivery separation and uncertain receipts | Persisted task intent and unknown outcomes; observed-idle distinction | Verified result lifecycle, stable originating IDs, complete delivery reconciliation, late-work cancellation fences |
| Hermes independent workers and queued internal completion | Talker can return without awaiting worker completion; idle update polling | Proven concurrent-work journey, complete internal-event race suite; bounded sourced memory and separate historical search |
| Happy exact request/session identity and stale-callback checks | Exact question binding and revalidation | Real competing-client voice approval tests, deliberate device handoff and current-session UI |
| Moltis propose/validate/apply memory changes; OpenClaw tombstone-first forgetting | No memory subsystem yet | Deterministic correction/deletion with replay/crash recovery, relevant retrieval and source controls |

These comparisons reuse the repository's pinned source audits, not a fresh claim
about every upstream HEAD or runtime. See the [reuse ledger](jarvis-bootstrap-decisions.md),
[OpenClaw review](jarvis-openclaw-source-review.md),
[Hermes/Happy review](jarvis-hermes-happy-source-review.md),
[Moltis review](jarvis-moltis-and-bb-source-review.md), and
[LiveKit adoption decision](oss-conversation-stack-recommendation.md).
The old Qwen notification and turn primitives should either be deliberately wired
into a required path or retired from the claimed active coverage; carrying tests
for unused code must not inflate confidence in current behavior.

## What to do next

1. **Finish A+B control correctness:** fix the two reproduced failures; turn real
   approval/denial, concurrent workers, process cancellation and recovery into a
   checked-in browser release suite. Gate on observed BB effects, not acknowledgments.
2. **Qualify conversation and useful work:** address pipeline latency, run the
   complete mixed desktop/phone suite, and freeze a direct-BB baseline for actual
   lab diagnosis, research and authorized calendar/email preparation. Record
   verified outcomes, necessary vs avoidable interventions and interruptions/hour.
3. **Implement C, then D using the researched patterns:** sourced memory and
   historical recall with deletion recovery; only then explicitly enabled external
   events and scheduled commitment reviews through BB. Retain the agreed scope.

A consolidated release command should report pass/fail/unverified by scenario ID,
retain candidate/model/provider/browser/fixture versions and actual BB evidence,
exit nonzero for any required failure, and never silently skip unavailable required
integrations. Fast deterministic component tests, real-service browser tests and
physical-device qualification serve different purposes; all three are needed.

## Confidence, drift and blind spots

High confidence in the code gaps, source match and reproduced browser failures.
Moderate confidence in behavior inferred from source without fault injection.
No new physical-phone, acoustic or destructive-domain qualification was attempted.
The lab's original test report and pinned upstream source reviews are historical
comparators, not fresh upstream certifications.

The active vision/0001/0002 status text still references earlier acceptance work;
0002's transport decision still says Pipecat while 0005 and the code use LiveKit.
The plugin skill still describes playback-gated answers/direct-entry buttons that
no longer exactly match the current UI. Those are documentation gaps to reconcile
without dropping the original unmet requirements. No plan should be archived as
complete on the strength of this audit.

Primary inspection covered the current app/server entries, director, coordinator,
question/voice/model adapters, LiveKit browser/worker/adapters and all test names
and fixtures. This audit did not re-audit every retired experiment, notably
`spikes/pipecat/server.py`, `turn/server.py`, the old `lib/conversation.ts`, or all
third-party native RTC internals. They are not evidence for active-path acceptance.
