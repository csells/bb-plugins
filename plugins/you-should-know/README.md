# You should know

Open a thread, show BB's right panel, choose **+ → You should know** beside **Start side chat**. No prompt is needed. The panel reviews the conversation when opened. While visible, it reviews immediately when the conversation goes idle, then waits quietly. New activity starts a five-minute countdown; going idle sooner triggers the next review immediately. Long-running active work is checked every five minutes. Idle transitions during a review queue a fresh snapshot after that reviewer finishes, with no overlap. Close or hide it to pause new reviews. A review already underway finishes once and saves its result; reopening reconnects without restarting it. Reopening retains the earlier perspectives.

The plugin never sends into the watched conversation. It uses hidden, unparented Codex Sol medium reviewers with subscription authentication, each in a fresh BB personal workspace. Completed reviewers are stopped and archived. Multiple views of the same conversation share a reviewer; disconnected views expire after 90 seconds. An unchanged snapshot costs no inference. Errors remain visible and retry at the next eligible review (on activity followed by five minutes, or when the conversation goes idle). Reopening also retries.

## Coverage

This is the user-scoped You should know skill applied to a bounded, read-only transcript snapshot: two early and eight recent user requests are retained independently of the tool window (up to 1,800 characters each). Recent activity covers up to 100 relevant events / 32,000 characters, including completed assistant messages and up to twelve command/output excerpts (500 / 1,800 characters each). Known credential patterns are redacted and recognized credential-reading commands are omitted. Truncation and limited coverage are identified. It does not inspect repository artifacts or guarantee a full-thread audit. Earlier context may be missing. Transcript claims are not proof of deployment or testing.

The latest 20 distinct perspectives persist per source thread. Only consequential information the main agent has not already communicated qualifies for a note. Paraphrases, reminders, recaps and all-clears are excluded. No note is added when nothing is missing, including the first review or an empty conversation. After a quiet review, the panel shows **No new findings** with the check time. This status replaces the previous check status without adding a finding card; earlier findings remain visible. A timestamped **Observer activity** history records panel opening, active/idle transitions, the five-minute trigger, reading, model review, findings, no new findings, unchanged snapshots, pauses, queued idle checks, and failures. These messages come from deterministic plugin state, not model narration. The last eight transitions are shown from a bounded history of twenty. An unchanged snapshot is explicitly labeled as requiring no new review. The panel also records the last included event.

## Development

Requires BB 0.43.4 or newer and SDK 0.5.9 and a working subscription-authenticated Codex CLI on the BB execution machine. The published SDK is pinned for reproducible development.

- `npm install --include=dev`
- `node --experimental-strip-types --test manager.test.ts`
- `bb plugin build`
- `node --test backend.test.mjs`
- `node_modules/.bin/tsc --noEmit`
- `bb plugin install . --yes` to install the reviewed local plugin.

Tests cover active/idle transitions, a five-minute active cadence, in-flight idle transitions, multiple tabs, unchanged content, cancellation, expired browser leases, visible failures/recovery, worker isolation, cleanup and public SDK use. Real Sol checks must cover both consequential omissions (including an implication not explained by the main agent) and correctly silent cases where the issue is already explained or repaired. Mechanical status tests alone do not establish reviewer usefulness.

The plugin is full-trust BB code. The model is instructed not to use tools; this is not a separate tool-denial security sandbox. No raw credentials are passed to the review prompt.

YSK is currently a development plugin. Chris has authorized live updates during development; the stable-service promotion gate applies once an installation is designated stable. This exception does not apply to other BB services or plugins.
