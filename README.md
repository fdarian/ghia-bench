# ghia-bench

One app, "Mailbox" (a 10,000-message mail client with a virtualized list, a live search filter and a detail pane), implemented on Electron, [Ghia](https://github.com/fdarian/ghia) and raw GPUI to one pixel spec ([SPEC.md](./SPEC.md)). An external harness launches the packaged builds and measures them identically; the apps carry no benchmark code.

## Fairness rules

- **Idiomatic per framework.** Each app is written the way that framework's users would write it, to the same spec:

  | | UI | Virtualized list | Search input |
  | --- | --- | --- | --- |
  | Electron | Solid + Vite + CSS, default Electron settings | `@tanstack/solid-virtual` | DOM `<input>` |
  | Ghia | `@ghia/solid`, style objects | `<virtual-list>` | `<input>` |
  | GPUI | Rust, default gpui features | `uniform_list` | a `TextInput` entity with `EntityInputHandler` |

- **Shipped builds.** All three run as release/production packaged `.app` bundles (Electron packaged with `--asar`), launched the way a user launches an app: `NSWorkspace.openApplication`, not by spawning the binary.
- **Same gpui.** Ghia and the GPUI app are built on the identical pinned gpui: the GPUI crate path-depends on `vendor/ghia/zed/crates/gpui`, and `scripts/setup-ghia.sh` pins both the Ghia and the zed revision.
- **Measured externally and identically.** One harness, the same phases, the same input events and the same analysis for every app.
- **Rotated run order.** App order rotates every launch and round (E G R, G R E, R E G, ...) so drift in machine state does not favour one app.

## What is measured

| Metric | How |
| --- | --- |
| Startup: window visible | Time from just before launch until an on-screen, non-transparent window of the app's pid appears (`CGWindowListCopyWindowInfo`, polled every 1 ms) |
| Startup: content ready | Time until the first captured frame whose pixels match the spec's signature (sidebar, first-row avatar, detail text); needs Screen Recording |
| Memory | `phys_footprint` from `proc_pid_rusage`, summed over the app's process tree, at the end of idle and after the workload |
| Idle CPU, instructions, energy, wakeups | `proc_pid_rusage` diff over a 10 s idle phase, summed over the process tree; frames presented while idle |
| Scroll and hover frame pacing | ScreenCaptureKit stream of the app window during 120 Hz wheel / pointer events: frames per second, interval p50/p95/p99, long frames |
| Typing latency | OS event post to the first captured frame where the region changed: echo (search input) and result (list or count line) per key |
| Navigation latency | Same method for ArrowDown, on the detail region |
| Bundle size | `du -sk` of the `.app` |

Input is posted to the app's pid with `CGEventPostToPid`, at positions derived from the real window frame. The session phases and rounds are described under [Commands](#commands); the app contract is [SPEC.md](./SPEC.md).

## Setup

Prerequisites: macOS on Apple silicon, Xcode with the Metal toolchain, [rustup](https://rustup.rs), [Bun](https://bun.sh), pnpm and Node. Ghia is cloned from a local checkout (`GHIA_SRC`, default `~/code/fdarian/ghia`, which must contain the pinned `GHIA_REV` and its zed revision).

```
scripts/build-all.sh
```

From a fresh clone this builds the pinned Ghia (`scripts/setup-ghia.sh`), generates `data/messages.json`, builds the measurement helper, then the three apps into `dist/Mailbox-Electron.app`, `dist/Mailbox-Ghia.app` and `dist/Mailbox-GPUI.app`, and prints their sizes. It takes a long time (a release gpui build, twice).

<details>
<summary>Build notes</summary>

- Each step is also runnable alone: `scripts/setup-ghia.sh`, `bun run data`, `harness/helper/build.sh` (writes `harness/bin/benchhelper`), `apps/<electron|ghia|gpui>/build.sh`. Each app script installs its own dependencies from its lockfile.
- The harness has no dependencies to install.
- The Ghia and GPUI cargo builds go through a shared lock script (`~/.claude/notes/plans/gpuix-heavy.sh`; `GHIA_HEAVY` overrides it for `setup-ghia.sh`, `apps/gpui/build.sh` hardcodes it).
- A missing bundle is skipped by the harness unless you name it in `--apps`.

</details>

## Running

Permissions, for the terminal app you run the harness from (System Settings > Privacy & Security):

- **Screen Recording**: frame capture (content-ready time, idle frames, frame rate and latency).
- **Accessibility**: the `CGEventPostToPid` scroll, hover and keyboard input.

Without them `run` still works and says what it skipped: startup (window visible), idle CPU and memory are measured, the input phases are recorded as skipped, and frame metrics are absent.

Run from a **foreground terminal window** on the main display, started by you: a launch from a background or agent process does not make the app the active application, and a session whose window is not active or is covered by another window has its frame and latency metrics marked invalid. Keep the machine quiet while it runs: no clicks, no windows opening in front of the Mailbox window at screen (100, 100), plugged in, display awake, no other `Mailbox-*` app running (`run` refuses to start if one is).

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

## Reading the numbers

- **Memory double-counts shared pages for Electron.** `phys_footprint` is summed over the process tree, and Electron's processes share pages that are counted once per process. The report breaks Electron down per Chromium process type.
- **WindowServer compositing is not attributed to any app.** Its cost shows up in no app's CPU or energy numbers.
- **Capture is not free, but it is equal.** The ScreenCaptureKit stream runs only during the frame phases (scroll, hover, type, navigate), never during idle, and costs the same for all three apps.
- **Results are machine-specific.** `env.json` records the chip, RAM, display, refresh rate, load average, and the Ghia, zed, Electron/Chromium, Bun and rustc versions. Compare runs only within one machine and one display setup.
- **The apps are not pixel-identical.** The known differences (Electron's async data fetch before first paint, missing `letter-spacing` in Ghia and GPUI, Ghia's windowed `<virtual-list>`, GPUI's chosen line heights) are listed under "Parity notes" in [SPEC.md](./SPEC.md).

## Layout

```
SPEC.md              app spec, the contract all apps meet
data/generate.ts     seeded generator -> data/messages.json (gitignored)
scripts/             setup-ghia.sh, build-all.sh
apps/electron/       Solid + Vite + Electron
apps/ghia/           @ghia/solid app
apps/gpui/           Rust crate on gpui
harness/helper/      Swift CLI: launch timing, process metrics, input, frame capture
harness/src/         Bun orchestrator: rounds, stats, report
dist/                packaged apps (gitignored)
results/             per-run output (gitignored)
```
