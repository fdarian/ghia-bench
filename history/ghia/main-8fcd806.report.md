# ghia-bench report

## Environment

- Run started 2026-11-05T13:39:54.729Z; apps electron, ghia; 10 startup launches and 5 sessions per app.
- macOS 27.0.1 (26A434), Apple M1 Pro (10 cores), 16 GiB RAM.
- Scroll bars (System Settings): WhenScrolling.
- Main display 1512 x 982 pt, scale 2, 120 Hz.
- Load average (1/5/15 min) at start: 4.53 / 5.21 / 5.43.
- Ghia from git 8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15 (zed 451f7ec4d15f7d7444a1f347d5b916e2a7989bab), built from source by scripts/setup-ghia.sh.
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
| Sessions (window active and uncovered / total) | 5 / 5 | 5 / 5 |
| **Startup** |  |  |
| Window visible (ms) | 478 [450–547] | 550 [473–653] |
| Content ready (ms) | – | – |
| Footprint at launch + 1 s (MiB) | 187 [186–196] | 123 [121–126] |
| **Idle (10 s)** |  |  |
| CPU (% of one core) | 1.51 [1.34–1.73] | 2.48 [2.25–2.68] |
| CPU time (ms) | 151 [134–174] | 248 [225–268] |
| Instructions (millions) | 109 [107–111] | 440 [438–442] |
| Cycles (millions) | 189 [176–236] | 404 [368–433] |
| Energy (mJ) | 7.56 [6.46–7.92] | 72.6 [63.1–75.3] |
| Wakeups (per s) | 70.0 [68.3–71.9] | 20.8 [20.5–23.2] |
| App frames (a region changed) | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| Footprint after idle (MiB) | 153 [153–153] | 123 [122–124] |
| **Scroll (3 s down, 3 s up, 120 events/s)** |  |  |
| CPU (% of one core) | 53.3 [47.6–55.0] | 47.2 [46.8–47.6] |
| CPU time (ms) | 3205 [2865–3305] | 2838 [2812–2861] |
| Instructions (millions) | 4114 [4091–4127] | 15197 [14950–15498] |
| Cycles (millions) | 6167 [5612–6187] | 7093 [6904–7500] |
| Energy (mJ) | 1015 [989–1151] | 4446 [4256–4846] |
| Wakeups (per s) | 403 [393–413] | 186 [148–240] |
| App frames between first and last input (list changed) | – | – |
| App frame rate (fps, higher is better) | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – |
| Long frames (> 12.5 ms) | – | – |
| First-input latency (ms) | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Hover (2 s down, 2 s up, 120 moves/s)** |  |  |
| CPU (% of one core) | 10.9 [10.4–11.3] | 16.4 [16.2–20.7] |
| CPU time (ms) | 437 [416–455] | 660 [652–829] |
| Instructions (millions) | 367 [364–375] | 1059 [1002–2177] |
| Cycles (millions) | 566 [530–648] | 1009 [996–1488] |
| Energy (mJ) | 29.9 [26.7–36.8] | 185 [158–508] |
| Wakeups (per s) | 185 [163–188] | 109 [49.1–136] |
| App frames between first and last input (list changed) | – | – |
| App frame rate (fps, higher is better) | – | – |
| App frame interval p50 / p95 / p99 (ms, pooled) | – | – |
| Long frames (> 12.5 ms) | – | – |
| First-row-change latency (ms) | – | – |
| Row-change latency p50 / p95 (ms, pooled per row crossing) | – | – |
| Row crossings with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Type ("quarterly report", then 16 backspaces, 150 ms per key)** |  |  |
| CPU (% of one core) | 15.1 [10.9–16.1] | 16.0 [14.9–16.5] |
| CPU time (ms) | 707 [511–754] | 750 [698–771] |
| Instructions (millions) | 1296 [1212–1331] | 2053 [2014–2133] |
| Cycles (millions) | 1258 [1112–1324] | 1265 [1251–1353] |
| Energy (mJ) | 292 [269–356] | 440 [394–473] |
| Wakeups (per s) | 240 [231–241] | 64.7 [63.0–68.1] |
| Echo latency p50 / p95 (ms, pooled per key) | – | – |
| Echo: keys with no visible change | – | – |
| Result latency p50 / p95 (ms, pooled per key) | – | – |
| Result: keys with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **Navigate (30 x ArrowDown, 120 ms per key)** |  |  |
| CPU (% of one core) | 14.8 [13.9–15.7] | 39.5 [38.3–41.0] |
| CPU time (ms) | 521 [490–551] | 1389 [1347–1442] |
| Instructions (millions) | 686 [679–691] | 7155 [7054–7277] |
| Cycles (millions) | 850 [822–912] | 3206 [3200–3231] |
| Energy (mJ) | 154 [142–156] | 1914 [1894–1965] |
| Wakeups (per s) | 255 [253–258] | 127 [123–129] |
| Detail latency p50 / p95 (ms, pooled per key) | – | – |
| Detail: keys with no visible change | – | – |
| Capture delivery (frames/s, changed or not) | – | – |
| **After workload** |  |  |
| Footprint after workload (MiB) | 198 [195–206] | 167 [164–177] |
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
| main | 44.0 [43.8–44.2] | 44.8 [44.6–44.9] | 0.06 [0.06–0.07] | 11.7 [10.5–12.0] | 9.41 [8.98–9.84] | 3.48 [2.53–4.51] | 2.88 [2.67–3.03] |
| renderer | 60.7 [60.7–61.0] | 58.6 [56.5–67.0] | 0.41 [0.34–0.44] | 26.3 [23.4–27.3] | 0.42 [0.41–0.49] | 7.55 [5.44–7.97] | 7.22 [6.84–7.68] |
| gpu | 40.9 [40.9–41.0] | 87.1 [87.0–87.2] | 1.04 [0.94–1.22] | 15.2 [13.8–15.7] | 1.09 [0.97–1.18] | 3.95 [2.94–4.05] | 4.66 [4.42–4.97] |
| network | 7.16 [7.06–7.22] | 7.16 [7.06–7.22] | 0.00 [0.00–0.00] | 0 | 0 | 0 | 0 |
| other | – | – | – | – | – | – | – |
| total | 153 [153–153] | 198 [195–206] | 1.51 [1.34–1.73] | 53.3 [47.6–55.0] | 10.9 [10.4–11.3] | 15.1 [10.9–16.1] | 14.8 [13.9–15.7] |

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

- 0 of 30 quits needed SIGKILL on a straggler; 0 root processes ignored SIGTERM for 3 s.
- 1-minute load average around runs: median 4.6, max 8.6 (10 cores).
