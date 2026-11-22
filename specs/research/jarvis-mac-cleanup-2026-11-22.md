# Jarvis Mac mini cleanup — November 22, 2026

Chris requested shutdown of no-longer-needed services created on the Mac mini
to reclaim resources. This is operational cleanup, not implementation or promotion.

## Discovery correction

Fresh registry records supersede the old November 18 staging expiry: on November
21 Chris explicitly retained the remote Jarvis app VM100 and inference VM222.
They were preserved. The old relay credential still has its November 18 expiry;
the Mac relay and preview tunnel were already inactive. Neither an active registry
lifecycle nor VM retention proves a functional review URL.

The Mac is registry machine `machine-orca`, locally `csells-mini-m4.local`, with
32 GiB RAM. The measurement showed about 6.1 GiB swap used and elevated memory
pressure. Disk had about 496 GiB available. Shared Pocket/Alfred launch agents
belong to the production `voice` service, not disposable Jarvis plugin staging.

## Removed from launchd

Ownership was verified from exact launchd labels, registered dependencies,
program paths and preserved task plists before unloading:

- `com.csells.jarvis-stage-relay-thr-qpanimf2w7`: expired, already exited.
- `com.csells.jarvis-stage-tunnel-thr-qpanimf2w7`: inactive preview/relay tunnel.
- `com.csells.jarvis-tts-inference-thr-qpanimf2w7`: leftover inference SSH tunnel.
- `com.csells.jarvis-tts-stage-thr-qpanimf2w7`: leftover stage SSH tunnel.
- `com.csells.jarvis-turn-expire-thr-qpanimf2w7`: timer whose exact-forward removal
  had completed; its completion marker confirmed the temporary forward absent.

All five bootouts succeeded. The two live tunnel jobs had four SSH processes in
total, using **4.8 MiB aggregate resident memory** immediately before shutdown.
All four PIDs subsequently disappeared. Ports 4840, 4842, 4847 and 18550 were closed;
no residual Jarvis staging runtime process was found. This is modest cleanup,
not a remedy for the Mac's overall memory pressure.

Source, private configuration, task journals, plists and research evidence were
preserved in task storage. No VM or disk was deleted, no remote service was
stopped, and no shared voice configuration changed. Pocket's existing supervisor
remained PID21167 and its local health endpoint returned HTTP200 after cleanup.

The process inventory also found about 370 iOS Simulator processes and ordinary
Chrome workloads. These are separate from this task and were left running.
Aggregate RSS across those processes can double-count shared pages and must not
be represented as memory that this cleanup would necessarily reclaim.

## Resume and records

Preserved task plists are outside the automatic login LaunchAgents directory;
resumption requires deliberate bootstrap. Revalidate registry state, credentials,
network routes and retained VMs before bringing the candidate back for review.
Do not restart the completed expiry timer or the retired standalone LiveKit
signaling tunnel. The original relay expiry must be addressed explicitly.

Private before/after evidence is in
`/Users/csells/.bb/thread-storage/thr_qpanimf2w7/jarvis-staging/mac-cleanup-20261122/`.
Registry readback verified app revision33, inference revision11 and machine
revision87, each with `mac_staging_cleanup_20261122`. These record the local
shutdown, preserved remote retention and resume requirements. No complete
staging teardown or production acceptance is claimed.
