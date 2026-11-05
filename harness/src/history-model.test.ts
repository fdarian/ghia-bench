import { describe, expect, test } from "bun:test"
import {
  captureNotes, compareSemver, deltaPercent, formatDelta, lineChartSvg, machineNotes, metricRow, metricsTable, orderEntries,
  parseTarget, renderReadme, snapshotLabel, CHARTS, METRICS, type HistoryEntry, type Machine,
} from "./history-model"

const MACHINE: Machine = { chip: "Apple M4", macos: "26.1 (25B78)", displayHz: 120, scrollBars: "unset", memGiB: 16 }

function entry(label: string, overrides: Partial<HistoryEntry> = {}, ghia: Record<string, number[]> = {}, electron: Record<string, number[]> = {}): HistoryEntry {
  return {
    schema: 1, label, kind: /^\d/.test(label) ? "npm" : "git", status: "ok", ghiaVersion: "0.11.1", gitSha: null, zedSha: null,
    commitDate: null, recordedAt: "2026-11-05T10:00:00.000Z", benchSha: "abcdef0123", benchDirty: false, machine: MACHINE,
    load: { before: [1, 1, 1], after: [1.5, 1, 1] }, capture: { requested: "off", enabled: false, reason: "--capture off" },
    run: { rounds: 5, launches: 10 }, versions: { electron: "39", chromium: "142", bun: "1.4.4" },
    metrics: { ghia, electron }, ...overrides,
  }
}

describe("parseTarget", () => {
  test("versions are npm, hex shas are git revisions", () => {
    expect(parseTarget("0.11.1")).toEqual({ kind: "npm", version: "0.11.1" })
    expect(parseTarget("1.0.0-rc.1")).toEqual({ kind: "npm", version: "1.0.0-rc.1" })
    expect(parseTarget("8FCD806")).toEqual({ kind: "git", rev: "8fcd806" })
    expect(parseTarget("8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15").kind).toBe("git")
  })
  test("anything else is rejected", () => {
    expect(() => parseTarget("main")).toThrow()
    expect(() => parseTarget("0.11")).toThrow()
    expect(() => parseTarget("abc")).toThrow()
  })
  test("snapshot labels use seven sha characters", () => {
    expect(snapshotLabel("8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15")).toBe("main-8fcd806")
  })
})

describe("compareSemver", () => {
  test("compares numerically, not as text", () => {
    expect(compareSemver("0.9.0", "0.11.0")).toBe(-1)
    expect(compareSemver("0.11.1", "0.11.0")).toBe(1)
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0)
    expect(compareSemver("0.2.10", "0.2.9")).toBe(1)
  })
  test("a release outranks its prerelease, prerelease identifiers compare per semver", () => {
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBe(-1)
    expect(compareSemver("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1)
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1)
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBe(-1)
    expect(compareSemver("0.0.0-stage", "0.0.0")).toBe(-1)
  })
  test("rejects non-versions", () => {
    expect(() => compareSemver("main-abc", "0.1.0")).toThrow()
  })
})

describe("orderEntries", () => {
  test("releases by semver, then snapshots by commit date", () => {
    const labels = orderEntries([
      entry("main-bbbbbbb", { commitDate: "2026-11-05T09:00:00Z" }),
      entry("0.11.10"),
      entry("main-aaaaaaa", { commitDate: "2026-11-01T09:00:00Z" }),
      entry("0.9.0"),
      entry("0.11.2"),
    ]).map((item) => item.label)
    expect(labels).toEqual(["0.9.0", "0.11.2", "0.11.10", "main-aaaaaaa", "main-bbbbbbb"])
  })
  test("a snapshot without a commit date sorts by recording date", () => {
    const labels = orderEntries([
      entry("main-late", { recordedAt: "2026-11-05T12:00:00Z" }),
      entry("main-early", { recordedAt: "2026-11-05T08:00:00Z" }),
    ]).map((item) => item.label)
    expect(labels).toEqual(["main-early", "main-late"])
  })
})

describe("deltas", () => {
  test("percent change against the previous value", () => {
    expect(deltaPercent(200, 150)).toBe(-25)
    expect(deltaPercent(100, 110)).toBeCloseTo(10)
  })
  test("no delta without both values or from zero", () => {
    expect(deltaPercent(undefined, 5)).toBeNull()
    expect(deltaPercent(5, undefined)).toBeNull()
    expect(deltaPercent(0, 5)).toBeNull()
  })
  test("formatting keeps a sign and one decimal; tiny moves read as zero", () => {
    expect(formatDelta(3.24)).toBe("+3.2%")
    expect(formatDelta(-12.46)).toBe("-12.5%")
    expect(formatDelta(0.01)).toBe("0.0%")
    expect(formatDelta(-0.04)).toBe("0.0%")
  })
})

describe("metricRow", () => {
  const spec = METRICS.find((metric) => metric.key === "idle.instructionsM")!
  test("first column is a bare value, the next ones carry the delta to their predecessor", () => {
    const entries = [
      entry("0.11.0", {}, { "idle.instructionsM": [100] }),
      entry("0.11.1", {}, { "idle.instructionsM": [80] }),
      entry("main-abc1234", {}, { "idle.instructionsM": [88] }),
    ]
    expect(metricRow(entries, "ghia", spec)).toEqual(["100", "80 (-20.0%)", "88 (+10.0%)"])
  })
  test("a missing value shows a dash and the next delta skips back to the last value", () => {
    const entries = [
      entry("0.11.0", {}, { "idle.instructionsM": [100] }),
      entry("0.11.1", {}, {}),
      entry("0.11.2", {}, { "idle.instructionsM": [50] }),
    ]
    expect(metricRow(entries, "ghia", spec)).toEqual(["100", "–", "50 (-50.0%)"])
  })
  test("an index picks the percentile out of the numbers", () => {
    const echo = METRICS.find((metric) => metric.key === "type.echoMs")!
    expect(metricRow([entry("0.11.0", {}, { "type.echoMs": [12, 30] })], "ghia", echo)).toEqual(["12"])
  })
})

describe("metricsTable", () => {
  test("pairs every Ghia row with its Electron reference and drops metrics nobody has", () => {
    const entries = [
      entry("0.11.0", {}, { "idle.instructionsM": [100] }, { "idle.instructionsM": [900] }),
      entry("0.11.1", {}, { "idle.instructionsM": [90] }, { "idle.instructionsM": [990] }),
    ]
    const table = metricsTable(entries, METRICS.filter((metric) => metric.group === "headline"))!
    expect(table).toContain("| Instructions, idle (millions) | Ghia | 100 | 90 (-10.0%) |")
    expect(table).toContain("| | Electron (reference) | 900 | 990 (+10.0%) |")
    expect(table).not.toContain("navigate")
    expect(metricsTable(entries, METRICS.filter((metric) => metric.group === "capture"))).toBeNull()
  })
})

describe("notes", () => {
  test("a changed chip, macOS, refresh rate or scroll bar setting is called out against the previous entry", () => {
    const notes = machineNotes([
      entry("0.11.0"),
      entry("0.11.1", { machine: { ...MACHINE, macos: "26.2 (25C1)" } }),
      entry("main-abc1234", { machine: { ...MACHINE, macos: "26.2 (25C1)", displayHz: 60 } }),
    ])
    expect(notes).toHaveLength(2)
    expect(notes[0]).toContain("0.11.1 was recorded on a different machine setup than 0.11.0")
    expect(notes[0]).toContain("macOS 26.1 (25B78) -> 26.2 (25C1)")
    expect(notes[1]).toContain("display 120 Hz -> 60 Hz")
    expect(notes[1]).not.toContain("macOS")
  })
  test("no note for the same machine", () => {
    expect(machineNotes([entry("0.11.0"), entry("0.11.1")])).toEqual([])
  })
  test("a mix of capture modes is noted", () => {
    const on = { requested: "auto", enabled: true, reason: "granted" }
    expect(captureNotes([entry("0.11.0"), entry("0.11.1")])).toEqual([])
    expect(captureNotes([entry("0.11.0", { capture: on }), entry("0.11.1")])).toHaveLength(1)
  })
})

describe("charts", () => {
  test("a polyline through the entries that have the metric, labelled by version", () => {
    const entries = [
      entry("0.11.0", {}, { "idle.instructionsM": [100] }),
      entry("0.11.1", {}, { "idle.instructionsM": [80] }),
    ]
    const svg = lineChartSvg(CHARTS[0], entries)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("<polyline")
    expect(svg).toContain(">0.11.0<")
    expect(svg).toContain(">80<")
    expect(svg.match(/<circle/g)).toHaveLength(2)
  })
  test("a gap leaves no line through the missing entry and a single point draws a dot only", () => {
    const gap = lineChartSvg(CHARTS[0], [
      entry("0.11.0", {}, { "idle.instructionsM": [100] }),
      entry("0.11.1", {}, {}),
      entry("0.11.2", {}, { "idle.instructionsM": [90] }),
    ])
    expect(gap).not.toContain("<polyline")
    expect(gap.match(/<circle/g)).toHaveLength(2)
    const single = lineChartSvg(CHARTS[0], [entry("0.11.0", {}, { "idle.instructionsM": [100] })])
    expect(single).not.toContain("<polyline")
    expect(single).toContain("<circle")
  })
  test("labels are escaped", () => {
    expect(lineChartSvg(CHARTS[0], [entry("a<b&c", {}, { "idle.instructionsM": [1] })])).toContain("a&lt;b&amp;c")
  })
})

describe("renderReadme", () => {
  test("lists recorded entries in order, failures apart, and the recording instructions", () => {
    const failed = entry("0.10.0", { status: "failed", failure: { stage: "build", reason: "no such package | really" }, machine: null, metrics: {} })
    const readme = renderReadme([
      entry("main-abc1234", { commitDate: "2026-11-05T00:00:00Z", gitSha: "abc1234def" }, { "idle.instructionsM": [70] }),
      entry("0.11.1", {}, { "idle.instructionsM": [80] }),
      entry("0.11.0", {}, { "idle.instructionsM": [100] }),
      failed,
    ])
    expect(readme).toContain("| Metric | App | 0.11.0 | 0.11.1 | main-abc1234 |")
    expect(readme).toContain("100 | 80 (-20.0%) | 70 (-12.5%)")
    expect(readme).toContain("## Versions that could not be recorded")
    expect(readme).toContain("| 0.10.0 | build | no such package \\| really |")
    expect(readme).toContain("## Recording a new version")
    expect(readme).toContain("Machine-state sensitive")
  })
  test("an empty history still renders", () => {
    expect(renderReadme([])).toContain("No version has been recorded yet.")
  })
})
