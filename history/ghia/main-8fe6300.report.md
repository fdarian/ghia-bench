# ghia-bench report

## Environment

- Run started 2026-11-05T13:54:12.784Z; apps electron, ghia; 10 startup launches and 5 sessions per app.
- macOS 27.0.1 (26A434), Apple M1 Pro (10 cores), 16 GiB RAM.
- Scroll bars (System Settings): WhenScrolling.
- Main display 1512 x 982 pt, scale 2, 120 Hz.
- Load average (1/5/15 min) at start: 4.46 / 5.30 / 5.46.
- Ghia from git 8fe6300d2cab694d0491fea27fbcac566e2cdc4e (zed 7579b167289190520884b3929086e4a186aaa5f7), built from source by scripts/setup-ghia.sh.
- Electron 45.2.2, Chromium 156.0.8078.80.
- Bun 1.4.4, rustc 1.97.1 (8bab26f4f 2026-07-14).
- Frame capture: off (--capture off). Input: on (post-event and Accessibility granted).
- Electron: 261.4 MiB bundle, executable `Mailbox-Electron` 0.0 MiB; largest code files: Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework 196.9 MiB; Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib 15.7 MiB; Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib 2.2 MiB.
- Ghia: 131.3 MiB bundle, executable `Mailbox-Ghia` 121.8 MiB; largest code files: Contents/MacOS/Mailbox-Ghia 121.8 MiB.

## Summary

| Metric | Electron | Ghia |
| --- | ---: | ---: |
| **Samples** |  |  |
| Startup launches kept | 9 | 9 |
| Sessions (window active and uncovered / total) | 4 / 5 | 5 / 5 |
| **Startup** |  |  |
| Window visible (ms) | 481 [406–744] | 545 [482–615] |
| Content ready (ms) | – | – |
| Footprint at launch + 1 s (MiB) | 187 [186–187] | 124 [124–125] |
| **Idle (10 s)** |  |  |
| CPU (% of one core) | 1.39 [0.16–1.73] | 1.88 [1.62–2.07] |
| CPU time (ms) | 139 [16.3–173] | 188 [162–207] |
| Instructions (millions) | 110 [10.5–183] | 321 [318–338] |
| Cycles (millions) | 176 [22.4–255] | 297 [283–307] |
| Energy (mJ) | 7.45 [0.71–38.3] | 29.6 [28.4–51.3] |
| Wakeups (per s) | 64.1 [4.50–69.8] | 21.8 [18.2–23.2] |
| App frames (a region changed) | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| Footprint after idle (MiB) | 153 [153–157] | 125 [114–127] |
| **Scroll (3 s down, 3 s up, 120 events/s)** |  |  |
| CPU (% of one core) | 48.7 [46.2–49.9] | 46.8 [44.6–47.0] |
| CPU time (ms) | 2926 [2777–2998] | 2811 [2683–2825] |
| Instructions (millions) | 4075 [4043–4137] | 15423 [14916–15501] |
| Cycles (millions) | 5797 [5635–5849] | 7493 [7236–7990] |
| Energy (mJ) | 1048 [987–1138] | 4986 [4609–5732] |
| Wakeups (per s) | 399 [391–407] | 218 [152–251] |
| App frames between first and last input (list changed) | – | – |
| App frame rate (fps, higher is better) | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – |
| Long frames (> 12.5 ms) | – | – |
| First-input latency (ms) | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Hover (2 s down, 2 s up, 120 moves/s)** |  |  |
| CPU (% of one core) | 8.84 [8.53–10.2] | 16.5 [14.2–17.3] |
| CPU time (ms) | 355 [342–409] | 661 [569–695] |
| Instructions (millions) | 363 [323–399] | 1058 [1039–1123] |
| Cycles (millions) | 512 [431–536] | 1023 [998–1118] |
| Energy (mJ) | 33.7 [21.1–61.9] | 193 [168–238] |
| Wakeups (per s) | 111 [88.2–179] | 127 [120–142] |
| App frames between first and last input (list changed) | – | – |
| App frame rate (fps, higher is better) | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – |
| Long frames (> 12.5 ms) | – | – |
| First-row-change latency (ms) | – | – |
| Row-change latency p50 / p95 (ms, pooled per row crossing) | – | – |
| Row crossings with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Type ("quarterly report", then 16 backspaces, 150 ms per key)** |  |  |
| CPU (% of one core) | 13.8 [11.8–14.8] | 14.9 [11.0–15.3] |
| CPU time (ms) | 646 [554–695] | 698 [516–715] |
| Instructions (millions) | 1220 [1196–1314] | 2042 [2026–2065] |
| Cycles (millions) | 1179 [1099–1266] | 1271 [1244–1302] |
| Energy (mJ) | 307 [272–410] | 465 [441–624] |
| Wakeups (per s) | 230 [228–243] | 63.8 [62.5–66.2] |
| Echo latency p50 / p95 (ms, pooled per key) | – | – |
| Echo: keys with no visible change | – | – |
| Result latency p50 / p95 (ms, pooled per key) | – | – |
| Result: keys with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Navigate (30 x ArrowDown, 120 ms per key)** |  |  |
| CPU (% of one core) | 12.8 [11.3–14.7] | 39.6 [37.8–43.2] |
| CPU time (ms) | 450 [396–515] | 1391 [1327–1520] |
| Instructions (millions) | 680 [676–723] | 7090 [6778–7186] |
| Cycles (millions) | 830 [736–851] | 3234 [3064–3918] |
| Energy (mJ) | 169 [141–217] | 1943 [1854–2189] |
| Wakeups (per s) | 255 [251–259] | 126 [117–131] |
| Detail latency p50 / p95 (ms, pooled per key) | – | – |
| Detail: keys with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **After workload** |  |  |
| Footprint after workload (MiB) | 209 [197–213] | 178 [167–181] |
| **Size** |  |  |
| App bundle (MiB, du -sk) | 261 | 131 |
| Main executable (MiB) | 0.03 | 122 |

- Every metric is lower is better unless marked. Cells are median [min–max] over sessions (or startup launches); latency, interval and p50 / p95 cells pool every key or frame across valid sessions. – means no data; the reason is under Validity.
- Startup is measured from the mach time just before the launch call. Window visible = first poll that sees an on-screen window of the pid; content ready = first captured frame matching the Mailbox signature. The first startup launch per app is discarded.
- CPU, instructions, cycles, energy and wakeups are rusage deltas summed over the app's whole process tree during the phase. Processes that first appear during a phase count from zero.
- The capture delivers a frame per display refresh whether or not the app drew, so every frame metric counts only app frames: frames in which the phase's target region changed (idle: any content region; scroll and hover: the list; type: search, list or count; navigate: the detail pane). The title bar is ignored. The search caret's blink repaints the search region, so an idle app with a blinking caret shows a few frames.
- Capture delivery rows count every delivered frame, changed or not. When it is below 0.9 x the refresh rate during an input phase, the app's frame rate and latencies cannot be better than the capture: see Validity.
- Scroll first-input latency = first input post to the first frame in which the list changed. Hover moves change the list only when the pointer enters another 72 pt row, so first-row-change latency runs from the first input that crosses into a new row, and every crossing gets its own latency.
- Echo latency = first frame after a keyDown in which the search box changed; result latency = first frame in which the list or the count changed; only frames before the next keyDown count, otherwise the key has no visible change. Detail latency (navigate) uses the detail pane the same way. Long frames are intervals over 1.5 x the refresh interval.

## Electron per-process breakdown

| Process group | Footprint after idle (MiB) | Footprint after workload (MiB) | CPU % idle | CPU % scroll | CPU % hover | CPU % type | CPU % navigate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 44.0 [43.9–44.2] | 44.9 [44.8–45.0] | 0.06 [0.04–0.24] | 10.4 [10.2–10.9] | 8.46 [8.24–8.75] | 3.02 [2.99–3.93] | 2.56 [2.36–3.01] |
| renderer | 60.8 [60.6–61.0] | 69.8 [57.3–74.2] | 0.35 [0.04–0.43] | 24.2 [22.8–24.7] | 0.17 [0.05–0.43] | 6.79 [5.47–7.49] | 6.11 [5.34–7.04] |
| gpu | 40.9 [40.9–45.0] | 87.2 [87.0–87.3] | 0.97 [0.05–1.06] | 14.0 [13.2–14.4] | 0.30 [0.09–1.01] | 3.56 [3.38–4.04] | 4.13 [3.55–4.60] |
| network | 7.16 [7.08–7.20] | 7.16 [7.08–7.20] | 0.00 [0.00–0.01] | 0 | 0 | 0 | 0 |
| other | – | – | – | – | – | – | – |
| total | 153 [153–157] | 209 [197–213] | 1.39 [0.16–1.73] | 48.7 [46.2–49.9] | 8.84 [8.53–10.2] | 13.8 [11.8–14.8] | 12.8 [11.3–14.7] |

Median [min–max] across sessions. Groups: main = the root pid; renderer, GPU and network come from the Chromium `--type` on the process command line (a plain `Helper` runs both GPU and network), other = any other utility or unclassified process. A group that did not exist in a session is left out of that median; footprints are `phys_footprint`, which can double-count shared pages across processes.

## Validity

- Frame capture was OFF: --capture off.
- Input phases ran: post-event and Accessibility granted.

### Skipped phases

None.

### Content-ready not measured

| App | Launches | Reason |
| --- | --- | --- |
| Electron | 9 / 9 | capture off |
| Ghia | 9 / 9 | capture off |

### Sessions with invalid frame and latency metrics (excluded from the numbers above)

| App | Rounds | Reason |
| --- | --- | --- |
| Electron | 2 | app was not the active application (appActive=false); window 100.0% covered by bun |

CPU, instruction, energy, wakeup and memory metrics of those sessions are still used.

### Capture delivery

No frames were captured.

### Capture errors reported by the helper

None.

### Phase errors

None.

### Helper warnings (stderr of successful phases)

None.

### Other step errors

None.

### Other notes

- 0 of 30 quits needed SIGKILL on a straggler; 0 root processes ignored SIGTERM for 3 s.
- 1-minute load average around runs: median 6.0, max 7.5 (10 cores).
