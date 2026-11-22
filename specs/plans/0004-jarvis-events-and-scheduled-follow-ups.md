# Jarvis events and scheduled follow-ups

Status: active, planned Slice D — reconciled 2026-11-22; no external-event or scheduled-review journey implemented. Outside the initial release. Parent: [delivery plan](0001-jarvis.md).

Current evidence and every remaining acceptance area are recorded in the
[November 22 reconciliation](../analysis/jarvis-plan-reconciliation-2026-11-22.md).
The [architecture record](../architecture/0001-jarvis-current-design.md) describes
what is built. Historical staging statements below are dated evidence, not a
claim that staging is available today. Unchecked acceptance items remain unmet;
partial implementation does not check them off.

Builds on [coordination and memory](0003-jarvis-coordination-and-memory.md) and
[conversation and speech](0002-jarvis-conversation-and-speech.md). Product outcome:
Jarvis notices relevant changes and follows up on commitments without a fresh utterance.

## Scope and capability gate

Deliver one real, explicitly enabled external event and one scheduled commitment/checklist review through BB agents. Start with a registered lab-service event where a supported feed exists, or an available authorized calendar/inbox integration; select the actual source during capability discovery. For the scheduled journey, use a real commitment Chris chooses to track, with a due time and review purpose he confirms. This plan authorizes neither subscribing to arbitrary accounts nor enabling a schedule merely because a commitment was remembered.

Inspect supported BB scheduling/automation and event interfaces before choosing adapters. Reuse their durable execution and normal skills/tools; Jarvis stores configuration, correlation and notification state rather than building another scheduler or direct domain integration. If the intended feed or scheduling interface is unavailable, record the concrete gap and leave that journey unverified. An explicitly enabled periodic check through a BB worker can serve as an event source only when its cadence, read scope and detection delay are disclosed. Do not fabricate an event service to pass acceptance.

Camera capture, presence tracking, ambient screen surveillance, closed-session listening and locked-phone playback remain optional deferred scope. Selected BB-session context is covered in 0003 and does not require those sensors.

## Configuration and authority

For each source/review persist its owner, purpose, source identity, read scope, triggering condition or checklist, cadence/due time, timezone, expiry, allowed worker action, authority reference and enabled/paused state. Include delivery preference, quiet-mode behavior, last observed cursor/run, next due time and current health. Show this configuration with inspect, pause, edit and disable controls.

A trigger authorizes only the enabled check and notification within its recorded scope. It cannot turn a reminder into permission to send email, buy something, modify infrastructure or change a lock. Revalidate authority and current source state at execution time through 0003's domain contract. Expired account access, revoked scope or deleted commitments must prevent further work and produce an actionable visible state. Remembering a changed date invalidates the old schedule; propose the updated review and apply it only within the existing configuration authority.

## Execution and recovery

Route a due review or qualifying event to a bounded BB worker with a source/run correlation ID. Persist dispatch intent before execution and reconcile ambiguous responses before retrying. Deduplicate by source event ID or schedule ID plus due occurrence; repeated delivery must not spawn duplicate work or repeated speech. Retain the event/source time and evidence explaining why the notification matters.

Use the scheduling service's timezone semantics and record how daylight-saving transitions are handled. Test ambiguous and skipped local times against the chosen documented policy. After downtime, evaluate the current condition: skip expired occurrences, coalesce missed checks into at most one relevant catch-up review per source, and report skipped/late work visibly. Do not replay every missed reminder. Following the [OpenClaw recovery review](../research/jarvis-openclaw-source-review.md), distinguish a missed read-only occurrence from an already-started occurrence with unknown effects: persist start/result/delivery receipts and reconcile the latter instead of executing it again. Editing or disabling a source fences old delivery generations. Bound retries and expose repeated failure without generating recursive alert storms.

Deliver resulting updates through the existing notification queue: priority, expiry, supersession, quiet mode and microphone-off playback rules all apply. Queue while Chris is speaking or output is unavailable. On reconnect, deliver a current digest instead of obsolete announcements. A closed browser can still have server-side work only where the supported BB scheduler provides it; it does not imply background voice playback.

Pause/disable prevents future dispatch and removes queued unsolicited updates for that source. Display any already-running worker and offer explicit cancellation under the normal stop contract. Disabling Jarvis must disable its owned triggers through the supported scheduling interface; if that operation cannot be confirmed, expose pending cleanup and reconcile before claiming the source is off. Preserve unrelated schedules and user work.

## Acceptance and evidence

- [ ] Record the real source, supported APIs, permissions and versioned configuration. Show Chris exactly what enabling it observes and can do.
- [ ] Observe a safe actual source event, such as the next real service-status change or an authorized calendar update. With no fresh utterance, verify one appropriately scoped BB worker and one relevant update with source evidence. Duplicate delivery of that actual event produces neither duplicate work nor speech.
- [ ] Let a real enabled commitment/checklist review become due. Verify execution time, source inspection and resulting update without manual prompting. A reminder never grants additional action authority.
- [ ] Exercise restart/disconnection spanning a due occurrence; verify catch-up, expiry and deduplication against real persisted state. Verify the selected timezone policy.
- [ ] Verify quiet mode, microphone-off playback, blocked audio and reconnect digest behavior using the real notification and Pocket path. No microphone is silently opened.
- [ ] Pause, edit, expire and disable a source; confirm future work stops and existing workers remain accurately represented. Test revoked access and show failure honestly.
- [ ] Add both journeys to the parent scorecard, including actual outcomes, erroneous interruptions, dispatch/delivery delay and required user interventions. Preserve evidence and retire task-owned subscriptions/schedules during staging cleanup.

Slice D passes only when both real journeys and their recovery/disable controls are verified. Follow the parent's disposable staging and explicit promotion requirements. If real access or safe test conditions are unavailable, report the blocker; the full-vision claim stays pending.
