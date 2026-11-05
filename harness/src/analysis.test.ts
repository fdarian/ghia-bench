import { describe, expect, test } from "bun:test"
import {
  diffUsage, diffUsageByGroup, electronGroupOf, footprintByGroup, frameValidity, idleFrameCount, keyLatencies,
  motionMetrics, percentile, startupMs, summarize,
} from "./analysis"
import type { Frame, Input, Proc, Sample, WindowStatus } from "./types"

const MS = 1e6

function proc(pid: number, overrides: Partial<Proc> = {}): Proc {
  return {
    pid, ppid: 1, name: "p", userNs: 0, sysNs: 0, instructions: 0, cycles: 0, energyNj: 0,
    idleWakeups: 0, interruptWakeups: 0, footprint: 0, resident: 0, ...overrides,
  }
}

function sample(tNs: number, procs: Proc[]): Sample {
  return { tNs, procs }
}

function frame(tMs: number, changed: string[], first = false): Frame {
  return first ? { tNs: tMs * MS, changed, first: true } : { tNs: tMs * MS, changed }
}

function keyDown(tMs: number, key: string): Input {
  return { tNs: tMs * MS, kind: "keyDown", key }
}

describe("percentile and summarize", () => {
  test("linear interpolation", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
    expect(percentile([10], 99)).toBe(10)
    expect(percentile([5, 1, 3], 0)).toBe(1)
    expect(percentile([5, 1, 3], 100)).toBe(5)
    expect(percentile([0, 100], 95)).toBeCloseTo(95)
  })
  test("empty input", () => {
    expect(() => percentile([], 50)).toThrow()
    expect(summarize([])).toBeNull()
    expect(summarize([3, 1, 2])).toEqual({ n: 3, median: 2, min: 1, max: 3 })
  })
})

describe("diffUsage", () => {
  test("sums deltas over the tree", () => {
    const before = sample(10e9, [
      proc(1, { userNs: 100 * MS, sysNs: 50 * MS, instructions: 1000, cycles: 2000, idleWakeups: 4, interruptWakeups: 6 }),
      proc(2, { userNs: 10 * MS, instructions: 100, cycles: 200 }),
    ])
    const after = sample(12e9, [
      proc(1, { userNs: 300 * MS, sysNs: 100 * MS, instructions: 5000, cycles: 6000, idleWakeups: 14, interruptWakeups: 16 }),
      proc(2, { userNs: 60 * MS, instructions: 600, cycles: 700 }),
    ])
    const usage = diffUsage(before, after)
    expect(usage.durationSec).toBe(2)
    expect(usage.cpuMs).toBeCloseTo(250 + 50)
    expect(usage.cpuPct).toBeCloseTo((0.3 / 2) * 100)
    expect(usage.instructions).toBe(4000 + 500)
    expect(usage.cycles).toBe(4000 + 500)
    expect(usage.wakeups).toBe(20)
    expect(usage.wakeupsPerSec).toBe(10)
    expect(usage.energyMj).toBeNull()
    expect(usage.newProcesses).toBe(0)
  })

  test("pids new during the phase count from zero", () => {
    const before = sample(0.5e9, [proc(1, { userNs: 100 * MS, cycles: 100 })])
    const after = sample(1.5e9, [
      proc(1, { userNs: 150 * MS, cycles: 150 }),
      proc(7, { userNs: 40 * MS, sysNs: 10 * MS, cycles: 90, instructions: 70, energyNj: 3_000_000 }),
    ])
    const usage = diffUsage(before, after)
    expect(usage.cpuMs).toBeCloseTo(50 + 50)
    expect(usage.cycles).toBe(50 + 90)
    expect(usage.instructions).toBe(70)
    expect(usage.newProcesses).toBe(1)
    expect(usage.energyMj).toBeCloseTo(3)
  })

  test("a pid that exited contributes nothing and is counted", () => {
    const before = sample(0, [proc(1, { userNs: 10 * MS }), proc(2, { userNs: 900 * MS })])
    const after = sample(1e9, [proc(1, { userNs: 20 * MS })])
    const usage = diffUsage(before, after)
    expect(usage.cpuMs).toBeCloseTo(10)
    expect(usage.exitedProcesses).toBe(1)
  })

  test("a reused pid (counters went backwards) counts from zero", () => {
    const before = sample(0, [proc(5, { userNs: 800 * MS, cycles: 8000, instructions: 4000 })])
    const after = sample(1e9, [proc(5, { userNs: 30 * MS, cycles: 300, instructions: 100 })])
    const usage = diffUsage(before, after)
    expect(usage.cpuMs).toBeCloseTo(30)
    expect(usage.cycles).toBe(300)
    expect(usage.newProcesses).toBe(1)
  })

  test("energy counted as of the first reading for a new pid; all-zero energy is absent", () => {
    const before = sample(0, [proc(1, { energyNj: 1_000_000 })])
    const after = sample(1e9, [proc(1, { energyNj: 4_000_000 }), proc(2, { energyNj: 500_000 })])
    expect(diffUsage(before, after).energyMj).toBeCloseTo(3.5)
    expect(diffUsage(sample(0, [proc(1, { energyNj: null })]), sample(1e9, [proc(1, { energyNj: null })])).energyMj).toBeNull()
  })

  test("groups split the same churn", () => {
    const before = sample(0, [proc(1, { name: "Mailbox-Electron", userNs: 10 * MS })])
    const after = sample(1e9, [
      proc(1, { name: "Mailbox-Electron", userNs: 30 * MS }),
      proc(2, { name: "Mailbox-Electron Helper (Rendere", userNs: 100 * MS }),
    ])
    const groups = diffUsageByGroup(before, after, (p) => electronGroupOf(p.name, p.pid === 1))
    expect(groups.main.cpuMs).toBeCloseTo(20)
    expect(groups.renderer.cpuMs).toBeCloseTo(100)
    expect(footprintByGroup(sample(0, [proc(1, { footprint: 5 }), proc(2, { footprint: 7 })]), (p) => (p.pid === 1 ? "a" : "b")))
      .toEqual({ a: 5, b: 7 })
  })

  test("out-of-order samples throw", () => {
    expect(() => diffUsage(sample(5, [proc(1)]), sample(5, [proc(1)]))).toThrow()
  })
})

describe("electronGroupOf", () => {
  test("classifies by process name, tolerating proc_name truncation", () => {
    expect(electronGroupOf("Mailbox-Electron", true)).toBe("main")
    expect(electronGroupOf("Mailbox-Electron Helper (Rendere", false)).toBe("renderer")
    expect(electronGroupOf("Mailbox-Electron Helper (Renderer)", false)).toBe("renderer")
    expect(electronGroupOf("Mailbox-Electron Helper (GPU)", false)).toBe("gpu")
    expect(electronGroupOf("Mailbox-Electron Helper", false)).toBe("network/utility")
    expect(electronGroupOf("chrome_crashpad_handler", false)).toBe("other")
    expect(electronGroupOf(null, false)).toBe("other")
  })
})

describe("startupMs", () => {
  test("subtracts t0", () => {
    const launch = {
      pid: 1, t0Ns: 600_000_000_000_000, windowVisibleNs: 600_000_000_000_000 + 412 * MS, windowFrame: null,
      windowFrameAtVisible: null, contentReadyNs: null,
    }
    expect(startupMs(launch)).toEqual({ windowVisibleMs: 412, contentReadyMs: null })
  })
})

describe("keyLatencies", () => {
  const inputs = [keyDown(1000, "q"), keyDown(1150, "u"), keyDown(1300, "a")]

  test("first frame after each key with the region changed", () => {
    const frames = [
      frame(900, [], true),
      frame(1012, ["search"]),
      frame(1030, ["list", "count"]),
      frame(1170, ["search"]),
      frame(1190, ["count"]),
      frame(1310, ["search"]),
      frame(1340, ["list"]),
    ]
    expect(keyLatencies(frames, inputs, ["search"])).toEqual([12, 20, 10])
    expect(keyLatencies(frames, inputs, ["list", "count"])).toEqual([30, 40, 40])
  })

  test("a frame after the next keyDown is not attributed to the earlier key", () => {
    // 1210 is 210 ms after key 1 but only 60 ms after key 2; 1060 changed the wrong region.
    const frames = [frame(1060, ["detail"]), frame(1210, ["list"])]
    expect(keyLatencies(frames, inputs, ["list"])).toEqual([null, 60, null])
  })

  test("a change after the next keyDown is attributed to nobody earlier: null", () => {
    const frames = [frame(1155, ["search"])]
    expect(keyLatencies(frames, inputs, ["search"])).toEqual([null, 5, null])
  })

  test("the last key is cut off after the median key spacing", () => {
    const frames = [frame(1300 + 400, ["search"])]
    expect(keyLatencies(frames, inputs, ["search"])).toEqual([null, null, null])
    expect(keyLatencies([frame(1300 + 149, ["search"])], inputs, ["search"])).toEqual([null, null, 149])
  })

  test("the initial frame and frames not after the key are ignored", () => {
    const frames = [frame(1000, ["search"]), frame(1001, ["search"], true)]
    expect(keyLatencies(frames, inputs, ["search"])).toEqual([null, null, null])
  })

  test("keyUp events are not keys", () => {
    const withUp: Input[] = [keyDown(0, "x"), { tNs: 15 * MS, kind: "keyUp", key: "x" }, keyDown(120, "x")]
    expect(keyLatencies([frame(20, ["detail"])], withUp, ["detail"])).toEqual([20, null])
  })
})

describe("motionMetrics", () => {
  const inputs: Input[] = [0, 100, 1000].map((t) => ({ tNs: t * MS, kind: "scroll", dy: -30 }))

  test("counts frames in the input window and long frames over 1.5x the refresh interval", () => {
    const frames = [
      frame(-50, [], true),
      frame(-20, ["list"]), // before the first input
      frame(8, ["list"]),
      frame(16.6, ["list"]),
      frame(25, ["list"]),
      frame(60, ["list"]), // 35 ms gap: long at 120 Hz (threshold 12.5 ms)
      frame(70, ["list"]),
      frame(1000, ["list"]),
      frame(1010, ["list"]), // after the last input
    ]
    const metrics = motionMetrics(frames, inputs, 120, "list")
    expect(metrics.frames).toBe(6)
    expect(metrics.intervalsMs.map((v) => Math.round(v * 10) / 10)).toEqual([8.6, 8.4, 35, 10, 930])
    expect(metrics.longFrameThresholdMs).toBeCloseTo(12.5)
    expect(metrics.longFrames).toBe(2)
    expect(metrics.spanMs).toBe(1000)
    expect(metrics.fps).toBeCloseTo(6)
    expect(metrics.firstInputLatencyMs).toBe(8)
  })

  test("first-input latency needs the region to change; null when it never does", () => {
    const frames = [frame(5, ["search"]), frame(15, ["detail"])]
    expect(motionMetrics(frames, inputs, 60, "list").firstInputLatencyMs).toBeNull()
    expect(motionMetrics([frame(5, ["search"]), frame(15, ["list"])], inputs, 60, "list").firstInputLatencyMs).toBe(15)
  })

  test("no frames in the window", () => {
    const metrics = motionMetrics([frame(-10, [], true)], inputs, 120, "list")
    expect(metrics.frames).toBe(0)
    expect(metrics.fps).toBe(0)
    expect(metrics.intervalsMs).toEqual([])
  })
})

describe("idleFrameCount", () => {
  test("counts non-initial frames inside the window only", () => {
    const frames = [frame(0, [], true), frame(50, ["search"]), frame(600, ["search"]), frame(1200, ["search"]), frame(2000, ["search"])]
    expect(idleFrameCount(frames, 100 * MS, 1500 * MS)).toBe(2)
  })
})

describe("frameValidity", () => {
  const base: WindowStatus = {
    frame: { x: 0, y: 0, w: 1, h: 1 }, titlebarHeight: 28, onScreen: true, frontmost: true, appActive: true,
    coveredFraction: 0, coveredBy: [],
  }
  test("valid when active and uncovered", () => {
    expect(frameValidity(base)).toEqual({ valid: true, reasons: [] })
  })
  test("inactive and covered are reported with reasons", () => {
    const result = frameValidity({
      ...base, appActive: false, coveredFraction: 0.25,
      coveredBy: [{ pid: 9, owner: "Terminal", frame: base.frame }, { pid: 9, owner: "Terminal", frame: base.frame }],
    })
    expect(result.valid).toBe(false)
    expect(result.reasons).toEqual([
      "app was not the active application (appActive=false)",
      "window 25.0% covered by Terminal",
    ])
  })
  test("missing window status is invalid", () => {
    expect(frameValidity(null).valid).toBe(false)
  })
})
