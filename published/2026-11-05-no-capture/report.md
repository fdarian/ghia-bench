# ghia-bench report

## Environment

- Run started 2026-11-05T15:06:50.646Z; apps electron, ghia, gpui, swiftui, mygo; 10 startup launches and 5 sessions per app.
- macOS 27.0.1 (26A434), Apple M1 Pro (10 cores), 16 GiB RAM.
- Scroll bars (System Settings): WhenScrolling.
- Main display 1512 x 982 pt, scale 2, 120 Hz.
- Load average (1/5/15 min) at start: 3.85 / 4.72 / 4.83.
- Ghia 8fe6300d2cab694d0491fea27fbcac566e2cdc4e, zed 7579b167289190520884b3929086e4a186aaa5f7.
- GPUI app: upstream gpui from https://github.com/zed-industries/zed at 654efae441bc8eb117d0042bb28cd7cf3570bdc9.
- Electron 45.2.2, Chromium 156.0.8078.80.
- Bun 1.4.4, rustc 1.98.1 (48a229cea 2026-09-01).
- MyGo github.com/egoist/mygo v0.7.5-0.20261105040656-977ea57e0baf, go 1.27.3.
- Swift Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1); Xcode Xcode 27.2, Build version 27B52.
- Frame capture: off (--capture off). Input: on (post-event and Accessibility granted).
- Electron: 261.4 MiB bundle, executable `Mailbox-Electron` 0.0 MiB; largest code files: Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework 196.9 MiB; Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib 15.7 MiB; Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib 2.2 MiB.
- Ghia: 131.3 MiB bundle, executable `Mailbox-Ghia` 121.8 MiB; largest code files: Contents/MacOS/Mailbox-Ghia 121.8 MiB.
- GPUI: 16.4 MiB bundle, executable `Mailbox-GPUI` 7.0 MiB; largest code files: Contents/MacOS/Mailbox-GPUI 7.0 MiB.
- SwiftUI: 9.9 MiB bundle, executable `Mailbox-SwiftUI` 0.5 MiB.
- MyGo: 18.6 MiB bundle, executable `Mailbox-MyGo` 9.2 MiB; largest code files: Contents/MacOS/Mailbox-MyGo 9.2 MiB.

## Summary

| Metric | Electron | Ghia | GPUI | SwiftUI | MyGo |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Samples** |  |  |  |  |  |
| Startup launches kept | 9 | 9 | 9 | 9 | 9 |
| Sessions (window active and uncovered / total) | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 |
| **Startup** |  |  |  |  |  |
| Window visible (ms) | 507 [485–730] | 536 [491–740] | 339 [316–345] | 438 [414–523] | 370 [344–465] |
| Content ready (ms) | – | – | – | – | – |
| Footprint at launch + 1 s (MiB) | 186 [186–188] | 124 [123–125] | 110 [102–110] | 74.0 [73.4–74.6] | 124 [123–124] |
| **Idle (10 s)** |  |  |  |  |  |
| CPU (% of one core) | 1.64 [1.49–2.04] | 2.07 [1.71–2.26] | 1.24 [1.20–1.28] | 0.03 [0.02–0.04] | 1.38 [1.33–1.44] |
| CPU time (ms) | 164 [149–204] | 207 [171–226] | 124 [120–128] | 3.19 [1.71–4.31] | 138 [133–144] |
| Instructions (millions) | 108 [108–305] | 321 [318–322] | 194 [189–194] | 2.53 [2.30–2.59] | 257 [250–264] |
| Cycles (millions) | 242 [195–355] | 315 [283–353] | 195 [182–201] | 4.93 [3.54–6.15] | 229 [217–279] |
| Energy (mJ) | 8.03 [7.36–76.1] | 32.5 [30.6–40.6] | 15.8 [14.4–17.9] | 0.19 [0.13–0.29] | 23.7 [21.2–25.7] |
| Wakeups (per s) | 70.3 [68.7–72.5] | 20.3 [18.0–22.0] | 14.3 [14.2–14.7] | 0.70 [0.70–0.80] | 147 [130–160] |
| App frames (a region changed) | – | – | – | – | – |
| Capture delivery (frames/s, changed or not) | – | – | – | – | – |
| Footprint after idle (MiB) | 153 [153–153] | 125 [117–127] | 109 [102–110] | 74.0 [57.4–74.3] | 123 [123–125] |
| **Scroll (3 s down, 3 s up, 120 events/s)** |  |  |  |  |  |
| CPU (% of one core) | 51.7 [40.1–53.6] | 47.4 [47.3–49.6] | 35.4 [34.3–41.8] | 36.0 [35.6–37.2] | 36.5 [32.1–41.8] |
| CPU time (ms) | 3109 [2410–3225] | 2852 [2844–2984] | 2128 [2061–2515] | 2162 [2139–2236] | 2193 [1930–2514] |
| Instructions (millions) | 4109 [4095–4124] | 15212 [14525–15505] | 8256 [8136–8488] | 10418 [10312–10430] | 6213 [5933–6279] |
| Cycles (millions) | 5954 [5563–6302] | 7159 [6900–7404] | 4672 [4276–4970] | 6688 [6676–6933] | 4274 [3969–4833] |
| Energy (mJ) | 1141 [1046–1343] | 4475 [4184–4637] | 2010 [1759–2270] | 4423 [4371–4469] | 1396 [1375–1824] |
| Wakeups (per s) | 400 [394–412] | 157 [148–214] | 125 [121–126] | 122 [72.7–125] | 3340 [3207–3825] |
| App frames between first and last input (list changed) | – | – | – | – | – |
| App frame rate (fps, higher is better) | – | – | – | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – | – | – | – |
| Long frames (> 12.5 ms) | – | – | – | – | – |
| First-input latency (ms) | – | – | – | – | – |
| Capture delivery (frames/s, changed or not) | – | – | – | – | – |
| **Hover (2 s down, 2 s up, 120 moves/s)** |  |  |  |  |  |
| CPU (% of one core) | 10.6 [9.98–11.0] | 16.7 [15.5–18.1] | 9.54 [9.13–9.88] | 9.17 [8.50–10.4] | 9.61 [8.92–11.0] |
| CPU time (ms) | 427 [400–441] | 669 [621–725] | 383 [366–397] | 368 [341–416] | 386 [358–443] |
| Instructions (millions) | 365 [360–370] | 1068 [1004–1111] | 373 [372–377] | 332 [326–334] | 389 [386–394] |
| Cycles (millions) | 573 [500–587] | 1052 [981–1092] | 559 [505–578] | 500 [489–586] | 527 [488–655] |
| Energy (mJ) | 33.8 [29.6–34.7] | 194 [159–202] | 34.2 [26.8–40.8] | 28.9 [26.1–37.2] | 39.2 [33.8–42.9] |
| Wakeups (per s) | 184 [159–192] | 132 [70.0–141] | 118 [114–120] | 111 [90.2–119] | 236 [208–256] |
| App frames between first and last input (list changed) | – | – | – | – | – |
| App frame rate (fps, higher is better) | – | – | – | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – | – | – | – |
| Long frames (> 12.5 ms) | – | – | – | – | – |
| First-row-change latency (ms) | – | – | – | – | – |
| Row-change latency p50 / p95 (ms, pooled per row crossing) | – | – | – | – | – |
| Row crossings with no visible change | – | – | – | – | – |
| Capture delivery (frames/s, changed or not) | – | – | – | – | – |
| **Type ("quarterly report", then 16 backspaces, 150 ms per key)** |  |  |  |  |  |
| CPU (% of one core) | 14.7 [12.3–16.0] | 15.7 [11.0–16.5] | 8.69 [7.58–8.95] | 45.3 [45.0–45.6] | 7.19 [6.73–7.40] |
| CPU time (ms) | 690 [578–750] | 733 [515–772] | 407 [355–420] | 2121 [2109–2136] | 337 [315–347] |
| Instructions (millions) | 1209 [1198–1319] | 2079 [2004–2159] | 885 [873–886] | 28747 [28725–28799] | 562 [560–569] |
| Cycles (millions) | 1181 [1128–1216] | 1270 [1199–1296] | 654 [620–699] | 5948 [5926–5991] | 546 [525–566] |
| Energy (mJ) | 259 [245–385] | 444 [411–712] | 136 [133–174] | 5492 [5442–5562] | 83.4 [77.0–89.0] |
| Wakeups (per s) | 234 [232–238] | 63.2 [60.2–66.4] | 44.0 [42.3–47.6] | 12.4 [11.5–13.2] | 508 [493–513] |
| Echo latency p50 / p95 (ms, pooled per key) | – | – | – | – | – |
| Echo: keys with no visible change | – | – | – | – | – |
| Result latency p50 / p95 (ms, pooled per key) | – | – | – | – | – |
| Result: keys with no visible change | – | – | – | – | – |
| Capture delivery (frames/s, changed or not) | – | – | – | – | – |
| **Navigate (30 x ArrowDown, 120 ms per key)** |  |  |  |  |  |
| CPU (% of one core) | 15.4 [12.8–15.8] | 37.7 [36.2–39.6] | 11.4 [10.3–12.1] | 34.1 [34.0–34.7] | 10.4 [10.3–10.6] |
| CPU time (ms) | 540 [451–557] | 1326 [1271–1391] | 401 [362–425] | 1200 [1194–1221] | 367 [362–374] |
| Instructions (millions) | 683 [679–693] | 7038 [6756–7148] | 861 [854–875] | 6017 [5977–6027] | 636 [632–644] |
| Cycles (millions) | 877 [825–892] | 3150 [3005–3779] | 663 [578–674] | 3022 [2965–3045] | 609 [588–624] |
| Energy (mJ) | 148 [142–193] | 1903 [1800–2821] | 131 [115–133] | 1668 [1635–1701] | 97.8 [87.4–108] |
| Wakeups (per s) | 254 [250–261] | 129 [122–131] | 60.3 [58.3–60.6] | 10.2 [8.82–11.4] | 714 [703–732] |
| Detail latency p50 / p95 (ms, pooled per key) | – | – | – | – | – |
| Detail: keys with no visible change | – | – | – | – | – |
| Capture delivery (frames/s, changed or not) | – | – | – | – | – |
| **After workload** |  |  |  |  |  |
| Footprint after workload (MiB) | 203 [194–206] | 171 [169–183] | 163 [154–163] | 87.1 [69.7–87.8] | 130 [127–130] |
| **Size** |  |  |  |  |  |
| App bundle (MiB, du -sk) | 261 | 131 | 16.4 | 9.94 | 18.6 |
| Main executable (MiB) | 0.03 | 122 | 6.99 | 0.48 | 9.18 |

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
| main | 43.9 [43.7–44.0] | 44.7 [44.5–44.7] | 0.07 [0.06–0.78] | 11.2 [8.72–11.9] | 9.15 [8.65–9.52] | 3.64 [2.85–3.78] | 3.06 [2.48–3.11] |
| renderer | 60.7 [60.5–60.8] | 64.3 [54.6–67.0] | 0.40 [0.36–0.47] | 25.6 [19.9–26.5] | 0.42 [0.30–0.50] | 7.19 [6.16–7.98] | 7.46 [6.14–7.91] |
| gpu | 41.0 [40.9–41.0] | 87.2 [87.1–87.2] | 1.11 [0.89–1.20] | 14.8 [11.5–15.2] | 1.05 [0.92–1.11] | 3.95 [3.33–4.24] | 4.83 [4.22–4.88] |
| network | 7.13 [7.09–7.20] | 7.13 [7.09–7.20] | 0.00 [0.00–0.00] | 0 | 0 | 0 | 0 |
| other | – | – | – | – | – | – | – |
| total | 153 [153–153] | 203 [194–206] | 1.64 [1.49–2.04] | 51.7 [40.1–53.6] | 10.6 [9.98–11.0] | 14.7 [12.3–16.0] | 15.4 [12.8–15.8] |

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
| GPUI | 9 / 9 | capture off |
| SwiftUI | 9 / 9 | capture off |
| MyGo | 9 / 9 | capture off |

### Sessions with invalid frame and latency metrics (excluded from the numbers above)

None.

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

- 0 of 75 quits needed SIGKILL on a straggler; 0 root processes ignored SIGTERM for 3 s.
- 1-minute load average around runs: median 7.4, max 12.0 (10 cores).
