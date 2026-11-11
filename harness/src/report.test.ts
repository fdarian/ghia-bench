import { describe, expect, test } from "bun:test"
import { buildReport, renderEnvironment, summaryMetrics } from "./report"
import { appInfos } from "./fixtures/stamps"
import type { Env, Frame, Input, PhaseOutput, Proc, Sample, SessionRecord, WindowStatus } from "./types"

const MS = 1e6
const BASE = 1_000_000_000_000

function proc(pid: number, name: string, cpuMs: number): Proc {
  return {
    pid, ppid: 1, name, userNs: cpuMs * MS, sysNs: 0, instructions: cpuMs * 1000, cycles: cpuMs * 2000, energyNj: cpuMs * 1000, gpuNs: cpuMs * MS / 2,
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
  macos: "1", scrollBars: "WhenScrolling", chip: "chip", memBytes: 2 ** 34, display: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 },
  loadAverage: [1, 1, 1], cpuCores: 10, bun: "1", apps: appInfos(["electron"]), warnings: [],
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

describe("renderEnvironment", () => {
  const all = renderEnvironment({ ...env, args: { ...env.args, apps: ["electron", "ghia", "gpui", "swiftui", "mygo"] }, apps: appInfos(["electron", "ghia", "gpui", "swiftui", "mygo"]) })

  test("each app's versions come from its stamp", () => {
    expect(all).toContain("- Ghia 8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15, zed 451f7ec4d15f7d7444a1f347d5b916e2a7989bab, @ghia/native 0.11.1, @ghia/solid 0.11.1, from https://github.com/fdarian/ghia.git; built with Bun 1.4.4+38afee6c8.")
    expect(all).toContain("- GPUI app: upstream gpui from https://github.com/zed-industries/zed at 654efae441bc8eb117d0042bb28cd7cf3570bdc9, rustc 1.97.1 (abcdef 2026-09-01).")
    expect(all).toContain("- Electron 45.2.2, Chromium 156.0.8078.80.")
    expect(all).toContain("- MyGo v0.7.5-0.20261105040656-977ea57e0baf, go 1.27.3.")
    expect(all).toContain("- Swift 6.4.2; Xcode 27.2 (27B52); macOS SDK 27.0.")
  })

  test("Ghia (bun AOT) lists the Bun that compiled it and AOT", () => {
    const withAot = renderEnvironment({ ...env, args: { ...env.args, apps: ["ghia", "ghia-aot"] }, apps: appInfos(["ghia", "ghia-aot"]) })
    expect(withAot).toContain("- Ghia (bun AOT) 8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15, zed 451f7ec4d15f7d7444a1f347d5b916e2a7989bab, @ghia/native 0.11.1, @ghia/solid 0.11.1, from https://github.com/fdarian/ghia.git; built with Bun 1.4.4-canary.1+b1305ddc7, AOT on.")
    expect(all).not.toContain("bun AOT")
  })

  test("GPUIX lists its three npm packages", () => {
    const withGpuix = renderEnvironment({ ...env, args: { ...env.args, apps: ["ghia", "gpuix"] }, apps: appInfos(["ghia", "gpuix"]) })
    expect(withGpuix).toContain("- GPUIX @gpuix/solid 0.11.0, @gpuix/native 0.11.0, @gpuix/native-darwin-arm64 0.11.0, from npm.")
    expect(all).not.toContain("GPUIX")
  })

  test("NSH lists its version, commit and source", () => {
    const withNsh = renderEnvironment({ ...env, args: { ...env.args, apps: ["ghia", "nsh"] }, apps: appInfos(["ghia", "nsh"]) })
    expect(withNsh).toContain("- NSH 0.4.0, commit e626a8d, from homebrew.")
    expect(all).not.toContain("NSH 0.4.0")
  })

  test("names when and from which bench commit each bundle was built", () => {
    expect(all).toContain("Electron 2026-11-06T01:00:00.000Z at bench aaaaaaa")
    expect(all).toContain("MyGo 2026-11-06T01:04:00.000Z at bench aaaaaaa")
  })

  test("an app in the run with no recorded bundle is an error", () => {
    expect(() => renderEnvironment({ ...env, apps: {} })).toThrow("electron")
  })
})

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

  test("a phase whose target region never changed is warned about", () => {
    const quiet = session(0, true)
    const scroll = quiet.phases.scroll
    if (scroll.status !== "ok") throw new Error("fixture scroll phase must be ok")
    scroll.data.frames = scroll.data.frames!.map((entry) => ({ ...entry, changed: [] }))
    const report = buildReport(env, [quiet], { includeInvalid: false })
    expect(report).toContain("WARNING Electron scroll: no frame showed a change in the target region in 1 of 1 sessions")
    expect(report).not.toContain("WARNING Electron type: no frame")
  })

  test("skipped and failed phases are listed with their reasons; usage is still reported", () => {
    const report = buildReport(env, records, { includeInvalid: false })
    expect(report).toContain("synthetic skip")
    expect(report).toContain("synthetic failure")
    expect(report).toContain("| CPU (% of one core) | 10 |")
    expect(report).toContain("| gpu |")
  })

  test("GPU rows and the breakdown column report the sampled GPU time", () => {
    const report = buildReport(env, [session(0, true)], { includeInvalid: false })
    expect(report).toContain("| GPU (% of one GPU) | 5 |")
    expect(report).toContain("| GPU time (ms) | 100 |")
    expect(report).toContain("GPU % idle")
  })

  test("runs recorded without gpuNs show GPU as missing, not NaN or 0", () => {
    const old = session(0, true)
    for (const phaseResult of Object.values(old.phases)) {
      if (phaseResult.status !== "ok") continue
      for (const sampleOf of [phaseResult.data.rusageBefore, phaseResult.data.rusageAfter, phaseResult.data.rusageAfterTail]) {
        for (const entry of sampleOf.procs) delete entry.gpuNs
      }
    }
    const report = buildReport(env, [old], { includeInvalid: false })
    expect(report).toContain("| GPU (% of one GPU) | – |")
    expect(report).toContain("| GPU time (ms) | – |")
    expect(report).not.toContain("NaN")
  })

  test("includeInvalid brings the inactive session back", () => {
    const report = buildReport(env, records, { includeInvalid: true })
    expect(report).toContain("| Sessions (window active and uncovered / total) | 2 / 2 |")
    expect(report).toContain("INCLUDES sessions")
  })
})

describe("summaryMetrics", () => {
  const records = [session(0, true), session(1, false)]
  const metrics = summaryMetrics(env, records)
  const numbers = (key: string) => metrics.find((metric) => metric.key === key)!.cells.electron!.numbers

  test("carries the numbers behind the table cells, with unique keys", () => {
    expect(new Set(metrics.map((metric) => metric.key)).size).toBe(metrics.length)
    expect(numbers("startup.windowVisibleMs")).toEqual([400])
    expect(numbers("scroll.appFrames")).toEqual([6])
    expect(numbers("samples.sessions")).toEqual([1, 2])
    expect(numbers("type.resultNoChange")).toEqual([1, 2])
    expect(numbers("idle.cpuPct")).toEqual([10])
    expect(numbers("idle.gpuPct")).toEqual([5])
    expect(numbers("idle.gpuMs")).toEqual([100])
  })

  test("percentile cells list p50 then p95", () => {
    const echo = numbers("type.echoMs")
    expect(echo).toHaveLength(2)
    expect(echo[0]).toBeCloseTo(13.5)
    expect(echo[1]).toBeCloseTo(14.8, 1)
  })

  test("cells without data have no numbers", () => {
    expect(numbers("hover.fps")).toEqual([])
  })

  test("sections and labels are the table's", () => {
    const row = metrics.find((metric) => metric.key === "idle.instructionsM")!
    expect(row.section).toBe("Idle (10 s)")
    expect(row.label).toBe("Instructions (millions)")
  })
})
