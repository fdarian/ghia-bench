# ghia-bench

One app, "Mailbox" (a 10,000-message mail client, spec in [SPEC.md](./SPEC.md)), built three times: on Electron (Solid + Vite), on Ghia (`@ghia/solid`), and on raw GPUI. A single external harness launches the packaged builds and measures startup, idle cost, scrolling, hover, typing and navigation latency identically for all three; the apps contain no benchmark code.

## Planned layout

```
SPEC.md              app spec, the contract all apps meet
data/generate.ts     seeded generator -> data/messages.json (gitignored)
scripts/             setup-ghia.sh, build-all.sh
apps/electron/       Solid + Vite + Electron
apps/ghia/           @ghia/solid app
apps/gpui/           Rust crate on gpui
harness/helper/      Swift CLI: spawn timing, process metrics, input, frame capture
harness/src/         Bun orchestrator: rounds, stats, report
results/             per-run output (gitignored)
```

## Setup/Run

TBD
