Open **You should know** beside a conversation to get a quiet, independent perspective without entering a prompt. It adds only consequential information the main agent has not already communicated. When there is nothing to add, it shows **No new findings** with the check time.

## How it works

While visible, the panel reviews on opening and when the main thread goes idle. New activity starts a five-minute countdown; another idle transition triggers a review sooner. Continued activity is checked every five minutes. Hiding the panel pauses new reviews; an in-flight review finishes and is saved.

Findings remain in the panel. The observer does not send messages to the main conversation. It uses hidden Codex Sol reviewers with separate personal workspaces and retains the latest twenty findings per thread.

## Requirements and limits

Requires BB 0.43.4 or newer and a subscription-authenticated Codex CLI on the BB execution host. Reviews consume your Codex subscription usage. The observer reads a bounded recent transcript, not repository artifacts, and labels its coverage. Novelty and significance are model judgments; it can miss things.
