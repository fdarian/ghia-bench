# ghia-bench

One app, "Mailbox" (a 10,000-message mail client with a virtualized list, a live search filter and a detail pane), implemented eight ways to one pixel spec: Electron, [Ghia](https://github.com/fdarian/ghia), the same Ghia app compiled ahead of time by Bun (`bun build --compile --aot`), [gpuix](https://github.com/remorses/gpuix) (the upstream project Ghia forks, as published on npm), raw GPUI, native SwiftUI, [NSH](https://nsh.dev) (Longbridge's Rust UI framework, TSX on its bundled QuickJS engine) and [MyGo](https://github.com/egoist/mygo) (its native `ui` package) ([SPEC.md](./SPEC.md)). An external harness launches the packaged builds and measures them identically; the apps carry no benchmark code.

## Results

<!-- results:start -->

2026-11-05. Apple M1 Pro, 16 GiB RAM, macOS 27.0.1 (26A434), 1512 x 982 pt display at 120 Hz, scroll bars: when scrolling, load average 3.85 / 4.72 / 4.83. Ghia 8fe6300 (zed 7579b16), gpui 654efae, Electron 45.2.2 (Chromium 156.0.8078.80), MyGo v0.7.5-0.20261105040656-977ea57e0baf, Swift 6.4.2, Xcode 27.2, Bun 1.4.4.

Frame capture: off (--capture off). Input: on (post-event and Accessibility granted).

| Metric | Electron | Ghia | GPUI | SwiftUI | MyGo |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Samples** |  |  |  |  |  |
| Startup launches kept | 9 | 9 | 9 | 9 | 9 |
| Sessions (window active and uncovered / total) | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 |
| **Startup** |  |  |  |  |  |
| Window visible (ms) | 507 [485–730] | 536 [491–740] | 339 [316–345] | 438 [414–523] | 370 [344–465] |
| Footprint at launch + 1 s (MiB) | 186 [186–188] | 124 [123–125] | 110 [102–110] | 74.0 [73.4–74.6] | 124 [123–124] |
| **Idle (10 s)** |  |  |  |  |  |
| CPU (% of one core) | 1.64 [1.49–2.04] | 2.07 [1.71–2.26] | 1.24 [1.20–1.28] | 0.03 [0.02–0.04] | 1.38 [1.33–1.44] |
| CPU time (ms) | 164 [149–204] | 207 [171–226] | 124 [120–128] | 3.19 [1.71–4.31] | 138 [133–144] |
| Instructions (millions) | 108 [108–305] | 321 [318–322] | 194 [189–194] | 2.53 [2.30–2.59] | 257 [250–264] |
| Cycles (millions) | 242 [195–355] | 315 [283–353] | 195 [182–201] | 4.93 [3.54–6.15] | 229 [217–279] |
| Energy (mJ) | 8.03 [7.36–76.1] | 32.5 [30.6–40.6] | 15.8 [14.4–17.9] | 0.19 [0.13–0.29] | 23.7 [21.2–25.7] |
| Wakeups (per s) | 70.3 [68.7–72.5] | 20.3 [18.0–22.0] | 14.3 [14.2–14.7] | 0.70 [0.70–0.80] | 147 [130–160] |
| Footprint after idle (MiB) | 153 [153–153] | 125 [117–127] | 109 [102–110] | 74.0 [57.4–74.3] | 123 [123–125] |
| **Scroll (3 s down, 3 s up, 120 events/s)** |  |  |  |  |  |
| CPU (% of one core) | 51.7 [40.1–53.6] | 47.4 [47.3–49.6] | 35.4 [34.3–41.8] | 36.0 [35.6–37.2] | 36.5 [32.1–41.8] |
| CPU time (ms) | 3109 [2410–3225] | 2852 [2844–2984] | 2128 [2061–2515] | 2162 [2139–2236] | 2193 [1930–2514] |
| Instructions (millions) | 4109 [4095–4124] | 15212 [14525–15505] | 8256 [8136–8488] | 10418 [10312–10430] | 6213 [5933–6279] |
| Cycles (millions) | 5954 [5563–6302] | 7159 [6900–7404] | 4672 [4276–4970] | 6688 [6676–6933] | 4274 [3969–4833] |
| Energy (mJ) | 1141 [1046–1343] | 4475 [4184–4637] | 2010 [1759–2270] | 4423 [4371–4469] | 1396 [1375–1824] |
| Wakeups (per s) | 400 [394–412] | 157 [148–214] | 125 [121–126] | 122 [72.7–125] | 3340 [3207–3825] |
| **Hover (2 s down, 2 s up, 120 moves/s)** |  |  |  |  |  |
| CPU (% of one core) | 10.6 [9.98–11.0] | 16.7 [15.5–18.1] | 9.54 [9.13–9.88] | 9.17 [8.50–10.4] | 9.61 [8.92–11.0] |
| CPU time (ms) | 427 [400–441] | 669 [621–725] | 383 [366–397] | 368 [341–416] | 386 [358–443] |
| Instructions (millions) | 365 [360–370] | 1068 [1004–1111] | 373 [372–377] | 332 [326–334] | 389 [386–394] |
| Cycles (millions) | 573 [500–587] | 1052 [981–1092] | 559 [505–578] | 500 [489–586] | 527 [488–655] |
| Energy (mJ) | 33.8 [29.6–34.7] | 194 [159–202] | 34.2 [26.8–40.8] | 28.9 [26.1–37.2] | 39.2 [33.8–42.9] |
| Wakeups (per s) | 184 [159–192] | 132 [70.0–141] | 118 [114–120] | 111 [90.2–119] | 236 [208–256] |
| **Type ("quarterly report", then 16 backspaces, 150 ms per key)** |  |  |  |  |  |
| CPU (% of one core) | 14.7 [12.3–16.0] | 15.7 [11.0–16.5] | 8.69 [7.58–8.95] | 45.3 [45.0–45.6] | 7.19 [6.73–7.40] |
| CPU time (ms) | 690 [578–750] | 733 [515–772] | 407 [355–420] | 2121 [2109–2136] | 337 [315–347] |
| Instructions (millions) | 1209 [1198–1319] | 2079 [2004–2159] | 885 [873–886] | 28747 [28725–28799] | 562 [560–569] |
| Cycles (millions) | 1181 [1128–1216] | 1270 [1199–1296] | 654 [620–699] | 5948 [5926–5991] | 546 [525–566] |
| Energy (mJ) | 259 [245–385] | 444 [411–712] | 136 [133–174] | 5492 [5442–5562] | 83.4 [77.0–89.0] |
| Wakeups (per s) | 234 [232–238] | 63.2 [60.2–66.4] | 44.0 [42.3–47.6] | 12.4 [11.5–13.2] | 508 [493–513] |
| **Navigate (30 x ArrowDown, 120 ms per key)** |  |  |  |  |  |
| CPU (% of one core) | 15.4 [12.8–15.8] | 37.7 [36.2–39.6] | 11.4 [10.3–12.1] | 34.1 [34.0–34.7] | 10.4 [10.3–10.6] |
| CPU time (ms) | 540 [451–557] | 1326 [1271–1391] | 401 [362–425] | 1200 [1194–1221] | 367 [362–374] |
| Instructions (millions) | 683 [679–693] | 7038 [6756–7148] | 861 [854–875] | 6017 [5977–6027] | 636 [632–644] |
| Cycles (millions) | 877 [825–892] | 3150 [3005–3779] | 663 [578–674] | 3022 [2965–3045] | 609 [588–624] |
| Energy (mJ) | 148 [142–193] | 1903 [1800–2821] | 131 [115–133] | 1668 [1635–1701] | 97.8 [87.4–108] |
| Wakeups (per s) | 254 [250–261] | 129 [122–131] | 60.3 [58.3–60.6] | 10.2 [8.82–11.4] | 714 [703–732] |
| **After workload** |  |  |  |  |  |
| Footprint after workload (MiB) | 203 [194–206] | 171 [169–183] | 163 [154–163] | 87.1 [69.7–87.8] | 130 [127–130] |
| **Size** |  |  |  |  |  |
| App bundle (MiB, du -sk) | 261 | 131 | 16.4 | 9.94 | 18.6 |
| Main executable (MiB) | 0.03 | 122 | 6.99 | 0.48 | 9.18 |

Left out because they have no data in this run: Content ready, App frames, Capture delivery, App frames between first and last input, App frame rate, App frame interval p50 / p95 / p99, Long frames, First-input latency, First-row-change latency, Row-change latency p50 / p95, Row crossings with no visible change, Echo latency p50 / p95, Echo: keys with no visible change, Result latency p50 / p95, Result: keys with no visible change, Detail latency p50 / p95, Detail: keys with no visible change. They need Screen Recording to capture frames of the app window; this run had capture off (--capture off). See the full report.

The per-process breakdown and the validity notes are in [published/2026-11-05-no-capture/report.md](./published/2026-11-05-no-capture/report.md).

<!-- results:end -->

## Fairness rules

- **Idiomatic per framework.** Each app is written the way that framework's users would write it, to the same spec:

  | | UI | Virtualized list | Search input |
  | --- | --- | --- | --- |
  | Electron | Solid + Vite + CSS, default Electron settings | `@tanstack/solid-virtual` | DOM `<input>` |
  | Ghia | `@ghia/solid`, style objects | `<virtual-list>` | `<input>` |
  | Ghia (bun AOT) | the Ghia app, unchanged, compiled to machine code by a Bun with `--aot` | `<virtual-list>` | `<input>` |
  | GPUIX | `@gpuix/solid` 0.11.0 from npm (prebuilt native addon), style objects | `<virtual-list>` | `<input>` |
  | GPUI | Rust, upstream gpui (git, `zed-industries/zed` `main`), default features | `uniform_list` | a `TextInput` entity with `EntityInputHandler` |
  | SwiftUI | Swift 6, SwiftUI views, `@Observable` | `List` (NSTableView-backed, recycled rows) | `TextField` with `.onKeyPress` for ArrowUp/ArrowDown |
  | NSH | TSX on nsh 0.4.0 (QuickJS), native AppKit views, style objects | `List` (layer-backed, recycled rows) | `Input` (native `NSTextField`) |
  | MyGo | Go, MyGo's native `ui` package (pinned `977ea57`) | `ui.List` | `ui.TextInputBase` |

- **Shipped builds.** All eight run as release/production packaged `.app` bundles (Electron packaged with `--asar`, MyGo bundled by `go tool mygo build`, NSH by `nsh package --target macos`), launched the way a user launches an app: `NSWorkspace.openApplication`, not by spawning the binary.
- **Upstream gpui, not Ghia's.** The GPUI app depends on upstream gpui the way a GPUI author does: a git dependency on `https://github.com/zed-industries/zed`, branch `main`, at the commit `apps/gpui/Cargo.lock` pins (recorded in the GPUI build stamp, so in `env.json` and the report's environment block; refresh with `cargo update -p gpui` in `apps/gpui`, together with the channel in `apps/gpui/rust-toolchain.toml`, which follows upstream's). It uses no `[patch]`, and `gpui_platform` with the `font-kit` feature opens the window. Ghia is built on its own fork of gpui (`fdarian/zed`, pinned by `scripts/setup-ghia.sh`), so GPUI vs Ghia differs by both the fork's patches and Ghia's layer on top; it is not a pure framework-overhead comparison.
- **Measured externally and identically.** One harness, the same phases, the same input events and the same analysis for every app.
- **Rotated run order.** App order rotates every launch and round so drift in machine state does not favour one app.

## What is measured

| Metric | How |
| --- | --- |
| Startup: window visible | Time from just before launch until an on-screen, non-transparent window of the app's pid appears (`CGWindowListCopyWindowInfo`, polled every 1 ms) |
| Startup: content ready | Time until the first captured frame whose pixels match the spec's signature (sidebar, first-row avatar, detail text); needs Screen Recording |
| Memory | `phys_footprint` from `proc_pid_rusage`, summed over the app's process tree, at the end of idle and after the workload |
| Idle CPU, instructions, energy, wakeups | `proc_pid_rusage` diff over a 10 s idle phase, summed over the process tree; frames presented while idle |
| GPU time | Accumulated GPU time of the accelerator user clients (`IOAccelerator` children in IOKit, `AppUsage`) each process in the tree owns, as a diff over the phase. The app's own submissions only; WindowServer's compositing is not attributed to the app, same as CPU |
| Scroll and hover frame pacing | ScreenCaptureKit stream of the app window during 120 Hz wheel / pointer events: frames per second, interval p50/p95/p99, long frames |
| Typing latency | OS event post to the first captured frame where the region changed: echo (search input) and result (list or count line) per key |
| Navigation latency | Same method for ArrowDown, on the detail region |
| Bundle size | `du -sk` of the `.app` |

Input is posted to the app's pid with `CGEventPostToPid`, at positions derived from the real window frame; the events are tagged with the app's window (SkyLight `SLEventSetWindowLocation`, a private API) so they reach the views, scroll wheel included. The session phases and rounds are described under [Commands](#commands); the app contract is [SPEC.md](./SPEC.md).

## Setup

Prerequisites: macOS on Apple silicon, Xcode with the Metal toolchain (and Swift 6 for the SwiftUI app), [rustup](https://rustup.rs), [Go](https://go.dev) 1.27.3 or newer (MyGo), [Bun](https://bun.sh), pnpm and Node, and the [nsh](https://nsh.dev) CLI on `PATH` for the NSH app (`brew install longbridge/tap/nsh`). Ghia is cloned from GitHub at the pinned `GHIA_REV`, with its `zed` submodule fetched as a single blobless commit (still a few hundred MB). To use a local checkout instead, set `GHIA_SRC=/path/to/ghia`; it must contain the pinned `GHIA_REV` and its zed revision.

```
scripts/build-all.sh
```

From a fresh clone this builds the pinned Ghia (`scripts/setup-ghia.sh`), generates `data/messages.json`, builds the measurement helper and the status panel, then the eight apps into `dist/Mailbox-Electron.app`, `dist/Mailbox-Ghia.app`, `dist/Mailbox-GhiaAOT.app`, `dist/Mailbox-GPUIX.app`, `dist/Mailbox-GPUI.app`, `dist/Mailbox-SwiftUI.app`, `dist/Mailbox-NSH.app` and `dist/Mailbox-MyGo.app`, and prints their sizes. It takes a long time (a release gpui build, twice, plus the Swift and Go builds).

<details>
<summary>Build notes</summary>

- Each step is also runnable alone: `scripts/setup-ghia.sh`, `bun run data`, `harness/helper/build.sh` (writes `harness/bin/benchhelper`), `harness/status/build.sh` (writes `harness/bin/benchstatus`, the progress panel), `apps/<electron|ghia|gpuix|gpui|swiftui|nsh|mygo>/build.sh` and `apps/ghia/build-aot.sh` (the Ghia app again, compiled by the canary Bun in `$BUN_AOT`, default `~/.bun-canary/bin/bun`; it needs `verbatimModuleSyntax` removed from `vendor/ghia/packages/{native,solid}/tsconfig.json`, see the script). Each app script installs its own dependencies from its lockfile.
- NSH: `apps/nsh/build.sh` needs `data/messages.json` and the `nsh` CLI on `PATH`. It runs `nsh check` and `nsh package . --target macos`, which uses a prebuilt runtime, so no Rust toolchain is needed; the script then renames the executable to `Mailbox-NSH` and copies `messages.json` into the bundle (see SPEC.md, NSH parity notes).
- The harness has no dependencies to install.
- Optional env vars: `GHIA_SRC=/path/to/ghia` (local Ghia checkout, see above) and `GHIA_HEAVY=<wrapper>`, a command such as a lock script that the Ghia native build and the GPUI and MyGo builds are run through (`$GHIA_HEAVY cargo build --release`). Without it, or if it is not executable, they run directly. `setup-ghia.sh`, `apps/gpui/build.sh` and `apps/mygo/build.sh` honour both as applicable.
- A missing bundle is skipped by the harness unless you name it in `--apps`.
- Every build script ends by writing `Contents/Resources/bench-build.json` into its bundle (`harness/src/build-stamp.ts`, before the bundle is code-signed): the versions it was built from (Ghia: `@ghia/native` and `@ghia/solid` versions, Ghia and zed SHAs, whether the Ghia tree had uncommitted changes, where it was cloned from; GPUIX: the `@gpuix/solid`, `@gpuix/native` and `@gpuix/native-darwin-arm64` npm package versions; GPUI: gpui commit and rustc; SwiftUI: Swift, Xcode and SDK; NSH: the `nsh` version and commit from `nsh --version`, source `homebrew`; MyGo: Go and MyGo; Electron: Electron and Chromium), this repo's commit and the build time. `run` reads the stamps from the bundles it launches and stops if one is missing or unreadable (rebuild that app), so a bundle built on another machine records what it was built from, not what this checkout holds.

</details>

## Running

Permissions, for the terminal app you run the harness from (System Settings > Privacy & Security):

- **Screen Recording**: frame capture (content-ready time, idle frames, frame rate and latency).
- **Accessibility**: the `CGEventPostToPid` scroll, hover and keyboard input.

`check` and `run` stop with a non-zero exit when one is missing: they trigger the macOS permission dialogs (first time only) and name what is missing. `run` refuses to start without Screen Recording unless `--capture off` or `--allow-missing-permissions` is given. Grant the permission to the terminal app, then quit that terminal completely (not just the window) and reopen it: macOS applies a new grant only to newly started processes. Then rerun.

`--capture off` runs everything except the frame, latency and content-ready metrics (startup, idle, scroll, hover, typing and navigation input, memory) and needs only Accessibility. `run --allow-missing-permissions` runs anyway and says what it skipped: startup (window visible), idle CPU and memory are measured, the input phases are recorded as skipped, and frame metrics are absent.

Run from a **foreground terminal window** on the main display, started by you: a launch from a background or agent process does not make the app the active application, and a session whose window is not active or is covered by another window has its frame and latency metrics marked invalid. Keep the machine quiet while it runs: no clicks, no windows opening in front of the Mailbox window at screen (100, 100), plugged in, display awake, no other `Mailbox-*` app running (`run` refuses to start if one is).

### Commands

```
bun harness/src/bench.ts check
bun harness/src/bench.ts plan [--apps ...] [--fresh ghia,gpui|all]
bun harness/src/bench.ts run [--apps electron,ghia,ghia-aot,gpuix,gpui,swiftui,nsh,mygo] [--fresh ghia,gpui|all] [--tag name] [--rounds 5] [--launches 10] [--capture auto|on|off] [--allow-missing-permissions] [--status on|off] [--out <dir>]
bun harness/src/bench.ts report [<run dir>] [--include-invalid]
bun test harness/src
```

`harness/package.json` has the same as `bun run check|run|report|test` from `harness/`.

- `check` prints what is measurable right now and why not (permissions), the load average, the display and its refresh rate, any running `Mailbox-*` process, and which bundles exist in `dist/`. Run it first.
- `run` does `--launches` startup-only launches per app (the first is discarded: launch, wait for the window to stop moving, +1 s, quit), then `--rounds` full sessions per app (launch, settle 3 s, window check, idle 10 s, scroll, hover, type, navigate, settle 2 s, memory sample, quit). App order is rotated every launch and round. `--capture auto` captures frames only when Screen Recording is granted, `on` forces an attempt, `off` never captures and needs only Accessibility. Quitting is SIGTERM to the app's root pid, then SIGKILL of any still-running pid of the tree it sampled after 3 s; nothing else is ever signalled. Ctrl-C quits the app under test and stops. While it runs, `--status on` (the default) writes progress to `/tmp/ghia-bench-status.json` and opens the panel `harness/bin/benchstatus` (built by `harness/status/build.sh`) at the top right of the main display: "Hands off" with the current unit, units done and the estimated finish time, then Done or Stopped (click it to close; it quits itself after 30 minutes). Without the binary the run says so and carries on; `--status off` does neither. The run writes `report.md` at the end.
- `run` measures only what changed. Each app's version key (below) is worked out from its bundle's build stamp; an app with a clean stored run of the same key is re-used, not measured. `--fresh <apps>` (or `all`) measures them anyway. `plan` prints what a run would measure or re-use, and why, without running anything. `--out <dir>` is experiment mode: every app is measured into that one folder and the store is left alone, for A/B runs the key can't tell apart (an environment variable, a local patch).
- `report` regenerates `report.md` from `runs.jsonl` and `env.json`. With no folder it writes `results/comparison.md`: the newest clean run of every app on the newest run's machine setup, with a Sources table naming the version, key, run, date and load of each app's numbers. Sessions whose window was not active or was covered are left out of the frame and latency numbers; `--include-invalid` puts them back.

### Output (`results/`, gitignored), stored per app and version

```
results/<app>/<version>-<key>/version.json        what the key is made of
results/<app>/<version>-<key>/<run id>/env.json   that run's environment, with this app's bundle
results/<app>/<version>-<key>/<run id>/runs.jsonl this app's records
results/<app>/<version>-<key>/<run id>/report.md
results/comparison.md                             newest clean run of every app
```

A run that measures several apps interleaves them as before and writes one run folder under each, with the same run id (`env.json` `sitting` lists them). The key is a hash of:

- the **upstream versions** from the bundle's stamp (Electron and Chromium; the gpui commit and rustc; @gpuix packages; Swift, Xcode build and SDK; nsh; go and mygo; the Ghia and zed commits);
- the **app code**: the git tree of `apps/<app>/` the bundle was built from, uncommitted files and lockfiles included, recorded in the stamp at build time;
- the **measurement code**: the helper's Swift sources, `procs.ts`, `helper.ts`, `data/generate.ts`, and `SESSION_REVISION` in `harness/src/keys.ts`, which must be bumped by hand when `run.ts` changes how a session or launch is driven;
- the **machine setup**: chip, macOS build, display size, scale and refresh rate, the scroll-bar setting, and whether capture was on.

A build whose code can't be identified (a dirty Ghia tree, or a stamp from before code hashes with a dirty bench tree) is stored with a `-dirty` or plain label but never re-used. A run is re-used only when it is clean: it finished every launch and session, input ran, at most one session failed or lost focus, and its median load was under 10. The flat per-run folders from before 2026-11-10 were split into this layout; the originals are in `results/_flat/`.

- `env.json`: the permission probe, macOS, chip, RAM, display and refresh rate, load average, Bun version, each app's build stamp (below), bundle sizes (`du -sk`) and executable sizes, the run arguments, what capture and input were enabled and why, and any warnings.
- `runs.jsonl`: one JSON line per launch or session, appended as it finishes. Everything the helper printed is kept raw (mach-ns timestamps, rusage samples per process, every input, every captured frame with the regions that changed), plus load average before and after, the window check (`appActive`, `coveredFraction`, `coveredBy`), per-phase status (`ok`, `skipped` with the reason, or `error`) and how the app quit. All metrics are derived from it at report time, so analysis changes never need a re-run.
- `report.md`: environment, one summary table (median [min-max] per app; latency and interval cells pool all keys or frames), the Electron per-process memory and CPU breakdown, and a Validity section listing every skipped phase, invalid session, capture error and the reason.

Analysis lives in `harness/src/analysis.ts` (pure functions, unit-tested with synthetic frames and inputs).

## Reading the numbers

- **Memory double-counts shared pages for Electron.** `phys_footprint` is summed over the process tree, and Electron's processes share pages that are counted once per process. The report breaks Electron down per Chromium process type.
- **WindowServer compositing is not attributed to any app.** Its cost shows up in no app's CPU or energy numbers.
- **Capture is not free, but it is equal.** The ScreenCaptureKit stream runs only during the frame phases (scroll, hover, type, navigate), never during idle, and costs the same for all eight apps.
- **SwiftUI's type-phase cost is mostly `String.contains`.** About 85% of it is Swift's grapheme-aware, Foundation-backed `String.contains` in the filter, not SwiftUI rendering; the other languages' standard substring searches are byte-level, and the app keeps the idiomatic call.
- **SwiftUI's caret blink is free at idle.** It is a render-server animation (`NSTextInsertionIndicator`), so it costs the app nothing, while the other apps redraw the caret.
- **MyGo's high wakeup counts come from its runtime**, not from app code: Go callbacks on the pinned main thread and handoffs with its Metal presenter thread.
- **MyGo's scrollbar shows only while the pointer is over a scroll area** (its default), so keyboard scrolling shows none.
- **GPUIX's scrollbar thumbs are always visible** (6 px, black at 35%): gpuix 0.11.0 paints the thumb permanently once a colour is set, with no show-on-scroll or hide timer.
- **Scrollbar style follows System Settings > "Show scroll bars"** for Electron, Ghia, SwiftUI and NSH; `env.json` records the setting.
- **Results are machine-specific.** `env.json` records the chip, RAM, display, refresh rate, load average, and the versions each bundle was built from. Compare runs only within one machine and one display setup.
- **The apps are not pixel-identical.** The known differences (Electron's async data fetch before first paint, missing `letter-spacing` in Ghia and GPUI, Ghia's windowed `<virtual-list>`, GPUIX's always-visible scrollbar thumbs and its window placement through libobjc, GPUI's chosen line heights, SwiftUI's line-height emulation, NSH's caret blink, MyGo's caret blink period) are listed under "Parity notes" in [SPEC.md](./SPEC.md).

## Layout

```
SPEC.md              app spec, the contract all apps meet
data/generate.ts     seeded generator -> data/messages.json (gitignored)
scripts/             setup-ghia.sh, build-all.sh
apps/electron/       Solid + Vite + Electron
apps/ghia/           @ghia/solid app (build.sh; build-aot.sh builds it again with Bun AOT)
apps/gpuix/          @gpuix/solid app (npm 0.11.0)
apps/gpui/           Rust crate on gpui
apps/swiftui/        Swift package, native SwiftUI
apps/nsh/            TSX on nsh 0.4.0 (QuickJS), native AppKit views
apps/mygo/           Go module on MyGo's native ui package
harness/helper/      Swift CLI: launch timing, process metrics, input, frame capture
harness/status/      Swift AppKit panel: progress of a run (what is running, what is left)
harness/src/         Bun orchestrator: rounds, stats, report
dist/                packaged apps (gitignored)
results/             per-app, per-version output (gitignored)
```
