# Jarvis specifications

As of 2026-11-22, Jarvis is an **unaccepted implementation on the unmerged
`specs/jarvis-vision` branch**. The inspected implementation is `08a9fe9`.
LiveKit conversation and a restricted BB relay exist; neither the full voice
acceptance suite nor the chief-of-staff release is complete. CosyVoice is Chris's
preferred candidate, with latency and perceived noise still unresolved.

Start with the [reconciliation and next work](analysis/jarvis-plan-reconciliation-2026-11-22.md).
It distinguishes source implementation, historical staging evidence, unmet
requirements and the work needed to resume. Staging availability was not checked
on November 22; old review links are not current health evidence.

- [Product vision](vision/jarvis.md): the intended experience and boundaries.
- [Active plans](plans/README.md): all five remain active; none is ready to archive.
- [Current architecture](architecture/0001-jarvis-current-design.md): what this branch actually runs.
- [Blueprint gap analysis](analysis/jarvis-blueprint-gap-analysis.md): original vision/specification comparison.
- [Scenario matrix](research/jarvis-scenario-matrix-2026-11-15.md): 54 scenario families; apply the later fixes recorded in the reconciliation.
- [Research and reuse decisions](research/jarvis-bootstrap-decisions.md): source-backed starting points.
- [Latest control audit](research/jarvis-control-audit-2026-11-15.md): all 14 buttons exercised, with explicit limits on that evidence.

Research, probes and sanitized evidence stay in `specs/research/`. Plans describe
required behavior; research reports describe dated observations. Neither test
counts nor a successful spike constitute user acceptance or promotion approval.
