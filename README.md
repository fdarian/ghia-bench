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

## Running

### Prerequisites

- macOS on Apple silicon, [Bun](https://bun.sh), and the Swift toolchain (for the helper).
- The measurement helper: `harness/helper/build.sh` (writes `harness/bin/benchhelper`).
- The three bundles `dist/Mailbox-Electron.app`, `dist/Mailbox-Ghia.app` and `dist/Mailbox-GPUI.app` (a missing one is skipped unless you name it in `--apps`), and `data/messages.json` (`bun run data`).
- Two permissions for the terminal app you run the harness from (System Settings > Privacy & Security): **Screen Recording** (frame capture: content-ready time, idle frames, frame rate and latency) and **Accessibility** (the `CGEventPostToPid` scroll, hover and keyboard input). Without them `run` still works and says what it skipped: startup (window visible), idle CPU and memory are measured, the input phases are recorded as skipped, and frame metrics are absent.
- Run from a **foreground terminal window** on the main display, started by you: a launch from a background or agent process does not make the app the active application, and a session whose window is not active or is covered by another window has its frame and latency metrics marked invalid. Leave the machine alone while it runs (no clicks, no windows opening in front of the Mailbox window at screen (100, 100), plugged in, display awake, no other `Mailbox-*` app running; `run` refuses to start if one is).

### Commands

```
bun harness/src/bench.ts check
bun harness/src/bench.ts run [--apps electron,ghia,gpui] [--rounds 5] [--launches 10] [--capture auto|on|off] [--out results/<ISO>]
bun harness/src/bench.ts report <results dir> [--include-invalid]
bun test harness/src
```

`harness/package.json` has the same as `bun run check|run|report|test` from `harness/`.

- `check` prints what is measurable right now and why not (permissions), the load average, the display and its refresh rate, any running `Mailbox-*` process, and which bundles exist in `dist/`. Run it first.
- `run` does `--launches` startup-only launches per app (the first is discarded: launch, wait for the window to stop moving, +1 s, quit), then `--rounds` full sessions per app (launch, settle 3 s, window check, idle 10 s, scroll, hover, type, navigate, settle 2 s, memory sample, quit). App order is rotated every launch and round (E G R, G R E, R E G, ...). `--capture auto` captures frames only when Screen Recording is granted, `on` forces an attempt, `off` never captures. Quitting is SIGTERM to the app's root pid, then SIGKILL of any still-running pid of the tree it sampled after 3 s; nothing else is ever signalled. Ctrl-C quits the app under test and stops. The run writes `report.md` at the end.
- `report` regenerates `report.md` from `runs.jsonl` and `env.json`. Sessions whose window was not active or was covered are left out of the frame and latency numbers; `--include-invalid` puts them back.

### Output (`results/<timestamp>/`, gitignored)

- `env.json`: the permission probe, macOS, chip, RAM, display and refresh rate, load average, Ghia and zed SHAs, Electron and Chromium versions, Bun and rustc versions, bundle sizes (`du -sk`) and executable sizes, the run arguments, what capture and input were enabled and why, and any warnings.
- `runs.jsonl`: one JSON line per launch or session, appended as it finishes. Everything the helper printed is kept raw (mach-ns timestamps, rusage samples per process, every input, every captured frame with the regions that changed), plus load average before and after, the window check (`appActive`, `coveredFraction`, `coveredBy`), per-phase status (`ok`, `skipped` with the reason, or `error`) and how the app quit. All metrics are derived from it at report time, so analysis changes never need a re-run.
- `report.md`: environment, one summary table (median [min-max] per app; latency and interval cells pool all keys or frames), the Electron per-process memory and CPU breakdown, and a Validity section listing every skipped phase, invalid session, capture error and the reason.

Analysis lives in `harness/src/analysis.ts` (pure functions, unit-tested with synthetic frames and inputs).
