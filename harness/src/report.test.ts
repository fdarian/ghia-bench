import { describe, expect, test } from "bun:test"
import { buildReport } from "./report"
import type { Env, Frame, Input, PhaseOutput, Proc, Sample, SessionRecord, WindowStatus } from "./types"

const MS = 1e6
const BASE = 1_000_000_000_000

function proc(pid: number, name: string, cpuMs: number): Proc {
  return {
    pid, ppid: 1, name, userNs: cpuMs * MS, sysNs: 0, instructions: cpuMs * 1000, cycles: cpuMs * 2000, energyNj: cpuMs * 1000,
    idleWakeups: 0, interruptWakeups: cpuMs, footprint: 100 * 1024 * 1024, resident: 0,
  }
}

function sample(tMs: number, cpuMs: number): Sample {
  return { tNs: BASE + tMs * MS, procs: [proc(10, "Mailbox-Electron", cpuMs), proc(11, "Mailbox-Electron Helper", cpuMs)] }
}

function phase(name: PhaseOutput["name"], inputs: Input[], frames: Frame[] | null): PhaseOutput {
  return {
    name, windowFrame: { x: 100, y: 100, w: 1280, h: 832 }, titlebarHeight: 32,
    rusageBefore: sample(0, 0), rusageAfter: sample(2000, 100), rusageAfterTail: sample(2500, 110),
    inputs, frames,
  }
}

const env: Env = {
  startedAt: "2026-01-01T00:00:00Z",
  args: { apps: ["electron"], rounds: 2, launches: 0, capture: "auto", out: "x" },
  capture: { enabled: true, reason: "test" },
  input: { enabled: true, reason: "test" },
  probe: { screenCapture: true, postEvent: true, axTrusted: true, mainDisplay: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 }, osVersion: "1", cpu: "chip", memBytes: 2 ** 34 },
  macos: "1", chip: "chip", memBytes: 2 ** 34, display: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 },
  loadAverage: [1, 1, 1], cpuCores: 10, ghia: { sha: null, zedSha: null }, electron: null, bun: "1", rustc: null, apps: {}, warnings: [],
}

function windowStatus(appActive: boolean): WindowStatus {
  return {
    frame: { x: 100, y: 100, w: 1280, h: 832 }, titlebarHeight: 32, onScreen: true, frontmost: appActive, appActive,
    coveredFraction: 0, coveredBy: [],
  }
}

function session(round: number, appActive: boolean): SessionRecord {
  const scrollInputs: Input[] = [0, 500, 1000].map((t) => ({ tNs: BASE + t * MS, kind: "scroll", dy: -30 }))
  const scrollFrames: Frame[] = [{ tNs: BASE - 100 * MS, changed: [], first: true }, ...[5, 20, 200, 500, 900, 1000].map((t) => ({ tNs: BASE + t * MS, changed: ["list"] }))]
  const typeInputs: Input[] = [
    { tNs: BASE + 100 * MS, kind: "keyDown", key: "q" }, { tNs: BASE + 115 * MS, kind: "keyUp", key: "q" },
    { tNs: BASE + 250 * MS, kind: "keyDown", key: "u" },
  ]
  const typeFrames: Frame[] = [
    { tNs: BASE + 112 * MS, changed: ["search"] }, { tNs: BASE + 130 * MS, changed: ["list", "count"] },
    { tNs: BASE + 265 * MS, changed: ["search"] },
  ]
  return {
    type: "session", app: "electron", round, startedAt: "", loadBefore: [1, 1, 1], loadAfter: [1, 1, 1],
    launch: { pid: 10, t0Ns: BASE, windowVisibleNs: BASE + 400 * MS, windowFrame: null, windowFrameAtVisible: null, contentReadyNs: BASE + 600 * MS },
    window: windowStatus(appActive),
    phases: {
      idle: { status: "ok", data: phase("idle", [], [{ tNs: BASE - 1, changed: [], first: true }, { tNs: BASE + 300 * MS, changed: ["search"] }]) },
      scroll: { status: "ok", data: phase("scroll", scrollInputs, scrollFrames) },
      hover: { status: "skipped", reason: "synthetic skip" },
      type: { status: "ok", data: phase("type", typeInputs, typeFrames) },
      navigate: { status: "error", error: "synthetic failure" },
    },
    finalSample: sample(3000, 120),
    processTypes: { "10": "browser", "11": "gpu-process" },
    quit: { sigtermExitMs: 100, sigkilled: [] },
    errors: [],
  }
}

describe("buildReport", () => {
  const records = [session(0, true), session(1, false)]

  test("valid sessions feed frame metrics; the invalid one is excluded with its reason", () => {
    const report = buildReport(env, records, { includeInvalid: false })
    expect(report).toContain("| Sessions (window active and uncovered / total) | 1 / 2 |")
    expect(report).toContain("| Window visible (ms) | 400 |")
    expect(report).toContain("| Content ready (ms) | 600 |")
    expect(report).toContain("| App frames (a region changed) | 1 |")
    expect(report).toContain("| App frames between first and last input (list changed) | 6 |")
    expect(report).toContain("| Long frames (> 12.5 ms) | 5 |")
    expect(report).toContain("| First-input latency (ms) | 5 |")
    expect(report).toContain("WARNING Electron scroll: capture delivered 6–6 frames/s (< 0.9 x 120 Hz) in 2 of 2 sessions")
    expect(report).toContain("| Electron | scroll | 6 | 2 / 2 |")
    expect(report).toContain("| Echo latency p50 / p95 (ms, pooled per key) | 13.5 / 14.8 |")
    expect(report).toContain("| Result: keys with no visible change | 1 / 2 |")
    expect(report).toContain("| App | Rounds | Reason |")
    expect(report).toContain("app was not the active application (appActive=false)")
  })

  test("columns follow the registry order for any subset of apps", () => {
    const mygo = { ...session(0, true), app: "mygo" as const }
    const swiftui = { ...session(0, true), app: "swiftui" as const }
    const report = buildReport(env, [mygo, swiftui, session(0, true)], { includeInvalid: false })
    expect(report).toContain("| Metric | Electron | SwiftUI | MyGo |")
    expect(report.match(/per-process breakdown/g)!.length).toBe(1)
  })

  test("skipped and failed phases are listed with their reasons; usage is still reported", () => {
    const report = buildReport(env, records, { includeInvalid: false })
    expect(report).toContain("synthetic skip")
    expect(report).toContain("synthetic failure")
    expect(report).toContain("| CPU (% of one core) | 10 |")
    expect(report).toContain("| gpu |")
  })

  test("includeInvalid brings the inactive session back", () => {
    const report = buildReport(env, records, { includeInvalid: true })
    expect(report).toContain("| Sessions (window active and uncovered / total) | 2 / 2 |")
    expect(report).toContain("INCLUDES sessions")
  })
})
