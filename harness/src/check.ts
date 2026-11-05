import { cpus } from "node:os"
import { currentLoadAverage, bundlePath, existingApps } from "./env"
import { probe } from "./helper"
import { runningMailboxProcesses } from "./procs"
import { resolveCapture, resolveInput } from "./run"
import { APP_IDS, APP_LABELS } from "./types"

function grid(header: string[], rows: string[][]): string {
  const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column].length)))
  const line = (row: string[]) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ")
  return [line(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)].join("\n")
}

export async function check(): Promise<void> {
  const result = await probe()
  const capture = resolveCapture("auto", result)
  const input = resolveInput(result)
  const yes = (ok: boolean) => (ok ? "measurable" : "NOT measurable")
  const rows: string[][] = [
    ["Startup: window visible", "measurable", "needs no permission (CGWindowList polling)"],
    ["Startup: content ready", yes(capture.enabled), capture.enabled ? "Screen Recording granted" : capture.reason],
    ["Idle CPU, energy, wakeups, memory", "measurable", "needs no permission (proc_pid_rusage)"],
    ["Input phases (scroll, hover, type, navigate)", yes(input.enabled), input.reason],
    [
      "Frames and latency",
      yes(capture.enabled && input.enabled),
      [
        capture.enabled ? null : capture.reason,
        input.enabled ? null : "no input is delivered, so there is nothing to time",
      ].filter((reason): reason is string => reason !== null).join("; ") || "Screen Recording and post-event access granted",
    ],
  ]
  console.log(grid(["Measurement", "Now", "Why"], rows))
  console.log()
  console.log("Permissions: Screen Recording " + result.screenCapture + ", post-event " + result.postEvent + ", Accessibility " + result.axTrusted)
  if (result.postEvent && !result.axTrusted) console.log("Warning: post-event is granted but Accessibility is not trusted; posted events may still be dropped.")
  console.log("Frame and latency metrics are only valid when the launched app is the active, uncovered app; `run` checks that per session after launch (a background-launched app is not activated) and marks the session invalid if not.")
  console.log()
  const load = currentLoadAverage()
  const cores = cpus().length
  console.log(`Load average (1/5/15): ${load.map((value) => value.toFixed(2)).join(" / ")} on ${cores} cores${load[0] > cores / 2 ? "  <-- busy: timing results will be noisy" : ""}`)
  const display = result.mainDisplay
  console.log(`Main display: ${display.widthPt} x ${display.heightPt} pt, scale ${display.scale}, ${display.refreshHz} Hz`)
  console.log(`${result.cpu}, ${(result.memBytes / 2 ** 30).toFixed(0)} GiB RAM, macOS ${result.osVersion}`)
  const running = await runningMailboxProcesses()
  console.log(running.length === 0
    ? "Running Mailbox-* processes: none"
    : `Running Mailbox-* processes (run would refuse to start): ${running.map((entry) => `${entry.pid} ${entry.command}`).join(", ")}`)
  const existing = existingApps()
  console.log("Built apps in dist/:")
  for (const app of APP_IDS) {
    console.log(`  ${APP_LABELS[app].padEnd(9)} ${existing.includes(app) ? "present" : "missing"}  ${bundlePath(app)}`)
  }
}
