# Jarvis coordination, control, and memory

Status: active — reconciled 2026-11-22. Coordination is partially implemented and narrowly verified; domain authority, broader recovery and staff presentation remain incomplete. Personal memory and sourced recall are unimplemented. Parent: [delivery plan](0001-jarvis.md).

Current evidence and every remaining acceptance area are recorded in the
[November 22 reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
The [architecture record](../architecture/0001-jarvis-current-design.md) describes
what is built. Historical staging statements below are dated evidence, not a
claim that staging is available today. Unchecked acceptance items remain unmet;
partial implementation does not check them off.

Depends on BB SDK capability validation and supplies the control contract for
[conversation and speech](0002-jarvis-conversation-and-speech.md).

## Outcome

Jarvis coordinates Chris's life through ordinary BB agents and sessions, remembers useful personal context, and speaks up when something warrants attention. It preserves BB's permissions and records what actually happened. It does not become a second agent scheduler or a new set of email/calendar/home integrations.

## Durable records

Use plugin-owned server storage with versioned schemas and migration tests. Keep operational records bounded and source-linked.

| Record | Minimum information |
| --- | --- |
| Task | ID, originating user request/turn, purpose, project/environment, worker thread IDs, ownership scope, dispatch correlation, status, evidence links, timestamps, cancellation outcome |
| Pending decision | Kind (approval, structured question, ordinary question), thread and source message IDs; interaction ID only for structured interactions, current action details/fingerprint, requested response schema, presented generation/client, pending/resolved/stale state, observed outcome |
| Memory | Fact/preference/commitment, explicit versus inferred source, source thread/event/time, scope, confidence or uncertainty, revision, correction/deletion state |
| Notification | Source task/thread/event sequence, importance/reason, dedupe key, queued/presented/dismissed state, expiry or supersession |
| Audit action | User request or policy authority, target, operation, bounded decision details, attempted time, confirmed result or uncertainty |

BB threads remain the authoritative conversation and execution records. Plugin metadata can carry correlations, but is not an authorization boundary. Store no credentials or raw audio in these records. Task state should distinguish dispatching, queued, working, needs-user, completed, failed, cancelling, cancelled, and unknown; idle alone is not task success.

## Delegation and recovery

Resolve a request to the intended BB project/environment and provider. Reuse an existing session when it fits the request; create another when isolation or independent work is appropriate. Ask about genuinely ambiguous targets, not routine engineering choices. Preserve project instructions and permission modes. A visible watched session may be summarized freely within scope, but redirecting it needs a user request covering that action.

Track intent before dispatch and reconcile uncertain SDK outcomes before retrying. A timeout after spawn/send can mean the action happened. Discover by correlation and real BB state; do not blindly create duplicate workers. Pass a bounded task brief and relevant memory, not the entire personal history. Return promptly to the talker.

Use events with persisted cursors plus a fresh snapshot on reconnect. Deduplicate delivery, tolerate out-of-order state, and periodically reconcile active owned tasks. Distinguish lost visibility, missing thread, provider outage, and completed work. Subagents/descendants appear under their owning task. Apply BB's existing concurrency controls; queue new work rather than bypassing capacity limits. Release plugin-owned auxiliary reviewer runtimes when done, while preserving useful user-facing conversation history.

Plugin reload/disable stops listeners, timers and owned ephemeral resources, releases audio leases and stops its talker/auxiliary runtimes as appropriate. Existing delegated user work can remain in BB and be recovered later; disabling the UI must not secretly delete it. An explicit stop-work action has the separate semantics below.

## Domain capability and authority

Before offering an action, discover the selected BB worker's actual skills, tools, account access and provider enforcement capabilities. Record the concrete integration/version, authority source and enforcing component for each supported path below. Classify each as tool-enforced, prompt-only, or unsupported; broad shell/browser permission is not evidence of domain-specific enforcement. Show limitations before delegation. If a required boundary cannot be enforced, restrict the worker to a demonstrably safe read/prepare path or mark execution unavailable.

| Domain | Inspect or prepare | Consequential action and authority to verify |
| --- | --- | --- |
| Email/calendar | Read authorized items, draft a message or proposed change | Send, invite or change an event only within explicit request/standing authorization and applicable account/tool approval |
| Spending | Research and compare | Purchase only within authorized item, recipient, amount and other limits; verify the payment tool enforces them |
| Infrastructure | Inspect status and diagnose | Modify only within the authorized operation and lab rules; service promotion requires approval of the staged candidate |
| Code | Inspect, edit and prepare a reviewable change within scope | Push, merge or promote according to the actual user/project authorization; development permission alone does not authorize service promotion |
| Physical security | Inspect authorized device state | Change lock/alarm state only through a supported enforcing tool and explicit applicable authority; no test unlock merely to prove the route |

These rows define what to validate, not a universal ask-every-time policy or new standing permission. Preserve existing authorization and ask only for missing scope or a required current approval. For each enabled consequential path, trace an allowed and a denied/out-of-scope request through the real selected worker/tool. Verify that external text, a different agent's message and alternate broad tools cannot bypass the boundary, and that already-authorized work avoids redundant questions. Use safe real operations or requests actually denied before side effects. Record unavailable integrations as unverified; prompt-only paths cannot pass an enforced-authority claim.

## Watched work, selected context and ordinary questions

Show all in-scope existing top-level sessions alongside Jarvis-owned tasks, including sessions created before Jarvis started. Label observation versus adopted control, link the real thread, and show fresh state or unknown/stale status. Group owned descendants under their task and deduplicate appearances/announcements. Watching alone never permits steering or stopping a session.

Capture selected-session context through supported BB UI/session APIs: thread ID, selection time, relevant visible source message IDs and a bounded context excerpt. Show the selected source and refresh its current state before target-dependent operations. Selection narrows relevance; it does not authorize changes. If the SDK cannot expose selection, offer an explicit thread picker and disclose the limitation. Do not substitute ambient screen capture.

Prefer structured interactions for questions and approvals. For an ordinary worker question, store the source thread/message, quoted question, current conversational generation and whether a response appears outstanding. Treat uncertain detection as “possible question” with a source link, not confirmed completion or a fabricated approval. Before relaying Chris's answer, re-read the thread to ensure the question is current and unanswered; clarify ambiguous targets. Send the answer with ordinary BB messaging, reconcile uncertain delivery and verify subsequent state. An answer supplies only its actual authorized content; it cannot resolve a separate tool approval.

Acceptance: a pre-existing session appears without being adopted, asks a textual question, receives Chris's explicitly directed answer once and resumes. Repeat with an already-answered question, an ambiguous answer, reload and competing clients. Verify an owned descendant remains visible without duplicate notification. Exercise selected-thread changes so stale context never redirects the wrong session.

## Approval and cancellation contract

The model proposes a typed operation; server handlers validate target, ownership/scope and current state. Never resolve an approval merely because the talker produced reassuring text. Use threads.interactions.get/list/resolve/respond with the exact threadId and interactionId and the current provider/plugin response schema.

Present one focused spoken decision with a matching visible card. “Yes” applies only to the still-current focused decision, not every queued request. Re-read before applying. If details changed, another client answered, the request expired, or there are multiple plausible targets, refresh/clarify instead. Audit the answer and confirmed result. An answer to a conversational question is distinct from an approval. Outbound actions beyond the user request remain gated by existing policy even if a worker asks Jarvis to approve them.

Treat instructions embedded in worker outputs, websites or remembered facts as untrusted data. Do not expose broad shell access to the talker merely to run the old digest/wait skill. Restrict the talker through provider-supported tool controls where available and validate control operations independently. Plugins are full-trust code; prompts and tool lists alone must not be advertised as a security sandbox. If a provider cannot enforce the required control path, document the gap and do not certify that path as guarded.

“Jarvis, stop” immediately aborts speech and dispatches stop for active tasks Jarvis delegated, including known owned descendants. Inhibit new delegation and remove Jarvis-owned queued follow-ups so cancelled tasks do not restart. For a reused existing session, cancel only the work adopted under the request; if BB cannot isolate that scope, expose the actual stop scope rather than killing unrelated work silently. A named stop can target a specific session when requested.

`threads.stop` returning `{ok:true}` acknowledges the API request. Verify subsequent BB runtime state and, in acceptance tests, actual owned process termination. Report stopped, already completed, and cancellation-unconfirmed separately. Retry only safely scoped operations; never claim an external side effect was undone. Disconnected clients can silence local audio immediately, but must show server cancellation as unconfirmed until reconnected.

## Selective awareness

Watch visible, unarchived top-level sessions by default; include owned descendant state without duplicate announcements. Exclude Jarvis's talker and auxiliary work from recursive notification triggers. Support pinned-only/off controls as optional narrowing, while retaining the agreed default.

Batch source events, deduplicate already-known updates, and prioritize pending decisions and consequential failures/completions. A completion message must be grounded in the actual result, not every idle event. Do not interrupt while Chris is speaking; queue until the conversational boundary. Quiet mode holds unsolicited speech until requested. Present routine status visually and allow Chris to dismiss or mute a source. After a long disconnection, produce a concise current digest rather than reading every missed event.

Maintain durable notification delivery state and supersede obsolete requests. Run deterministic event filtering before spending model inference. Avoid inference polling for unchanged sessions. External events and scheduled reviews follow [0004](0004-jarvis-events-and-scheduled-follow-ups.md), a later release gate. Default thread awareness is not authorization for ambient surveillance.

## Personal memory

Automatically extract stable preferences, people, commitments and decisions from authorized conversation context, with provenance. Explicit user statements outrank inferred preferences; conflicting claims remain distinguishable until resolved. Do not turn a speculative worker output into a personal fact. Store temporary work state in tasks/BB history rather than personal memory.

Provide “What do you remember?”, “Remember this”, “Correct that”, and “Forget that” through speech and UI. Corrections invalidate stale retrieval entries and derived summaries. Deletion removes derived memory, retrieval indexes and caches; persist a content-free source suppression marker when necessary so replay does not recreate a deleted item. Explain that original BB transcripts and governed backups have separate retention. Avoid embedding forgotten content in deletion logs. Export personal memory in a readable format.

Retrieve only material relevant to the current request and worker scope. Secrets remain in established stores. Avoid importing existing history wholesale during installation; new conversation memory and deliberately consulted task sources are enough for the initial release. Provide memory-off and per-item controls without disabling ordinary BB history.

## Recall of past conversations

Support “Why did we decide that last time?” by retrieving relevant authorized BB history on demand and combining it with sourced memory. Return the decision, its recorded reasoning, date/source link and any later correction as distinct facts. Keep retrieval bounded to the request and respect source visibility and memory suppression/deletion rules; explicit history recall must not silently recreate forgotten derived memory. If the source is missing, inaccessible or inconclusive, say so and distinguish remembered facts from verified reasoning.

Acceptance: recall a real prior decision from an accessible BB conversation, verify the explanation against that source, then exercise a later correction and an unavailable source. Confirm unrelated history stays out of worker context and corrected/deleted memories do not return through replay. Do not bulk-import history to satisfy the test.

## Source-backed bootstrap and recovery cases

Use the [research ledger](../research/jarvis-bootstrap-decisions.md) to bootstrap the coordinator: separate execution, verified result and notification delivery; persist operation identities before dispatch; revalidate target generation after asynchronous reads. Apply Qwen notification claims transactionally, with mandatory owner/generation checks. Internal completion events queue without interrupting a busy user turn. Stop inhibits continuations and rechecks late owned descendants while protecting newer adopted-session generations.

For forgetting, commit a content-free suppression identity before purging derived records, summaries, indexes and caches. Keep deletion-pending state on partial failure and resume cleanup after restart; mixed-source summaries must be removed or regenerated without the forgotten fact. Port OpenClaw's purge-phase failure scenarios and Hermes/Moltis compare-before-change cases to BB storage. These additions strengthen the existing requirements; upstream implementations do not prove our acceptance.

## Implementation sequence and acceptance

- [ ] Implement durable task/decision records, dispatch reconciliation, typed control handlers and a visible task list. Real-worker test proves one request creates one task even across a client retry or reconnect.
- [ ] Validate the domain authority matrix against each enabled real integration, preserving evidence of allowed and denied paths and explicitly unverified domains.
- [ ] Verify watched-session visibility, selected context and ordinary-message question routing with the journeys above.
- [ ] Prove approvals with actual BB interactions: allow, deny, ordinary question answer, stale action, duplicate response, competing clients, and deliberately ambiguous speech. No case resolves the wrong action.
- [ ] Prove stop using a real bounded worker process and owned descendants. Confirm process termination and absence of queued restart; test an unresponsive/disconnected worker and show uncertainty honestly. Verify unrelated work survives.
- [ ] Implement event cursors, reconciliation, dedupe and selective notifications. Trigger real completion, failure and needs-user cases; verify quiet mode, no recursive announcements and no repeated replay after reload.
- [ ] Implement memory capture, source inspection, correction, deletion, export and relevant retrieval. Use identifiable task-owned test preferences supplied through the actual conversation; these are test inputs, not substitute registries/services. Verify deletion across restart and event replay, and remove test memories afterward.
- [ ] Verify sourced past-decision recall, changed preferences and unavailable history using the recall journey above.
- [ ] Run the parent plan’s real-task scorecard, independently verifying outcomes and classifying each user intervention.
- [ ] Verify third-party content cannot approve work or rewrite explicit preferences through the coordinator. Test the same controls via typed UI and voice.
- [ ] Inspect retained logs/storage for credential/audio leakage, apply documented retention limits, and exercise migration/restart recovery. Preserve evidence outside staging and follow the parent plan's review/promotion/cleanup gate.

The final acceptance journey combines these behaviors: delegate two real tasks, ask an unrelated question while they run, receive one pending decision, approve it by voice, correct a remembered preference, enter quiet mode, stop delegated work, and reconnect from another client. The state and history must agree with actual BB execution at each step.
