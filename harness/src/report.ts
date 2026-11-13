import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  analyzeLaunch, analyzeSession, CAPTURE_BOUND_RATIO, groupNames, percentile, summarize,
  type LaunchAnalysis, type PhaseAnalysis, type SessionAnalysis, type Summary,
} from "./analysis"
import { appSpec } from "./apps"
import { buildOf, type BuildStamp } from "./stamp"
import type { AppId, Env, LaunchRecord, PhaseName, RunRecord, SessionRecord } from "./types"
import { APP_IDS, APP_LABELS, INPUT_PHASES, PHASE_NAMES } from "./types"

const MIB = 1024 * 1024

export function readRuns(dir: string): RunRecord[] {
  return readFileSync(join(dir, "runs.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line) as RunRecord
      } catch (error) {
        throw new Error(`runs.jsonl line ${index + 1} is not JSON: ${(error as Error).message}`)
      }
    })
}

export function readEnv(dir: string): Env {
  return JSON.parse(readFileSync(join(dir, "env.json"), "utf8")) as Env
}

function digitsFor(value: number): number {
  const magnitude = Math.abs(value)
  if (magnitude >= 100) return 0
  if (magnitude >= 10) return 1
  return 2
}

export function num(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(digitsFor(value))
}

function medianRange(summary: Summary | null): string {
  if (!summary) return "–"
  if (summary.min === summary.max) return num(summary.median)
  return `${num(summary.median)} [${num(summary.min)}–${num(summary.max)}]`
}

function medianRangeOf(values: number[], scale = 1): string {
  return medianRange(summarize(values.map((value) => value / scale)))
}

function pooledPercentiles(values: number[], points: number[]): string {
  if (values.length === 0) return "–"
  return points.map((point) => num(percentile(values, point))).join(" / ")
}

/** A summary cell: what the table shows, and the numbers behind it (median; percentiles in order; counts), empty when there is no data. */
export type Cell = { text: string; numbers: number[] }

function medianCell(values: number[], scale = 1): Cell {
  const summary = summarize(values.map((value) => value / scale))
  return { text: medianRange(summary), numbers: summary ? [summary.median] : [] }
}

function percentileCell(values: number[], points: number[]): Cell {
  return { text: pooledPercentiles(values, points), numbers: values.length === 0 ? [] : points.map((point) => percentile(values, point)) }
}

function textCell(text: string, numbers: number[] = []): Cell {
  return { text, numbers }
}

function present(values: (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => value !== null && value !== undefined)
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return [...counts.entries()]
}

function definedItems<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null)
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function table(header: string[], rows: string[][]): string {
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map((_, index) => (index === 0 ? "---" : "---:")).join(" | ")} |`]
  for (const row of rows) lines.push(`| ${row.map(escapeCell).join(" | ")} |`)
  return lines.join("\n")
}

function plainTable(header: string[], rows: string[][]): string {
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`]
  for (const row of rows) lines.push(`| ${row.map(escapeCell).join(" | ")} |`)
  return lines.join("\n")
}

type AppData = {
  app: AppId
  launches: LaunchAnalysis[]
  startupFromSessions: boolean
  sessions: { record: SessionRecord; analysis: SessionAnalysis }[]
  /** Sessions whose frame and latency metrics are used. */
  frameSessions: { record: SessionRecord; analysis: SessionAnalysis }[]
}

function collect(env: Env, records: RunRecord[], includeInvalid: boolean): AppData[] {
  return APP_IDS.filter((app) => records.some((record) => record.app === app)).map((app) => {
    const launchRecords = records.filter((record): record is LaunchRecord => record.type === "launch" && record.app === app)
    const sessionRecords = records.filter((record): record is SessionRecord => record.type === "session" && record.app === app)
    const sessions = sessionRecords.map((record) => ({ record, analysis: analyzeSession(record, env.display.refreshHz) }))
    const kept = definedItems(launchRecords.filter((record) => !record.discarded).map(analyzeLaunch))
    const startupFromSessions = kept.length === 0
    const launches = startupFromSessions
      ? definedItems(sessionRecords.map((record) => analyzeLaunch({
        app, index: record.round, discarded: false, launch: record.launch, sample: null,
      })))
      : kept
    return {
      app,
      launches,
      startupFromSessions,
      sessions,
      frameSessions: includeInvalid ? sessions : sessions.filter((session) => session.analysis.frameValidity.valid),
    }
  })
}

type Row = { key: string; label: string; cells: Cell[] } | { heading: string }

function phaseOf(session: { analysis: SessionAnalysis }, name: PhaseName): PhaseAnalysis | undefined {
  return session.analysis.phases[name]
}

function phaseValues(
  sessions: AppData["sessions"], name: PhaseName, pick: (phase: PhaseAnalysis) => number | null | undefined,
): number[] {
  return present(sessions.map((session) => {
    const phase = phaseOf(session, name)
    return phase ? pick(phase) : null
  }))
}

function usageRows(data: AppData[], name: PhaseName): Row[] {
  const spec: { key: string; label: string; scale: number; pick: (phase: PhaseAnalysis) => number | null }[] = [
    { key: "cpuPct", label: "CPU (% of one core)", scale: 1, pick: (phase) => phase.usage.cpuPct },
    { key: "cpuMs", label: "CPU time (ms)", scale: 1, pick: (phase) => phase.usage.cpuMs },
    { key: "gpuPct", label: "GPU (% of one GPU)", scale: 1, pick: (phase) => phase.usage.gpuPct },
    { key: "gpuMs", label: "GPU time (ms)", scale: 1, pick: (phase) => phase.usage.gpuMs },
    { key: "instructionsM", label: "Instructions (millions)", scale: 1e6, pick: (phase) => phase.usage.instructions },
    { key: "cyclesM", label: "Cycles (millions)", scale: 1e6, pick: (phase) => phase.usage.cycles },
    { key: "energyMj", label: "Energy (mJ)", scale: 1, pick: (phase) => phase.usage.energyMj },
    { key: "wakeupsPerSec", label: "Wakeups (per s)", scale: 1, pick: (phase) => phase.usage.wakeupsPerSec },
  ]
  return spec.map((entry) => ({
    key: `${name}.${entry.key}`,
    label: entry.label,
    cells: data.map((app) => medianCell(phaseValues(app.sessions, name, entry.pick), entry.scale)),
  }))
}

function frameCell(
  data: AppData, name: PhaseName, pick: (phase: PhaseAnalysis) => number | null | undefined, scale = 1,
): Cell {
  return medianCell(phaseValues(data.frameSessions, name, pick), scale)
}

function pooledMotion(data: AppData, name: PhaseName): number[] {
  const intervals: number[] = []
  for (const session of data.frameSessions) {
    const phase = phaseOf(session, name)
    if (phase && phase.motion) intervals.push(...phase.motion.intervalsMs)
  }
  return intervals
}

function pooledKeys(
  data: AppData, name: PhaseName, pick: (phase: PhaseAnalysis) => (number | null)[] | null | undefined,
): { values: number[]; noChange: number; total: number } {
  const values: number[] = []
  let total = 0
  for (const session of data.frameSessions) {
    const phase = phaseOf(session, name)
    const latencies = phase ? pick(phase) : null
    if (!latencies) continue
    total += latencies.length
    values.push(...present(latencies))
  }
  return { values, noChange: total - values.length, total }
}

function keyCells(data: AppData[], name: PhaseName, pick: (phase: PhaseAnalysis) => (number | null)[] | null | undefined) {
  return {
    percentiles: data.map((app) => percentileCell(pooledKeys(app, name, pick).values, [50, 95])),
    noChange: data.map((app): Cell => {
      const keys = pooledKeys(app, name, pick)
      return keys.total === 0 ? textCell("–") : textCell(`${keys.noChange} / ${keys.total}`, [keys.noChange, keys.total])
    }),
  }
}

function deliveryRow(data: AppData[], name: PhaseName): Extract<Row, { label: string }> {
  return {
    key: `${name}.deliveryFps`,
    label: "Capture delivery (frames/s, changed or not)",
    cells: data.map((app) => frameCell(app, name, (phase) => phase.delivery?.framesPerSec)),
  }
}

function summaryRows(env: Env, data: AppData[]): Row[] {
  const rows: Row[] = []
  const cells = (make: (app: AppData) => Cell) => data.map(make)
  const launchValues = (app: AppData, pick: (launch: LaunchAnalysis) => number | null) => present(app.launches.map(pick))
  rows.push({ heading: "Samples" })
  rows.push({ key: "samples.launches", label: "Startup launches kept", cells: cells((app) => textCell(`${app.launches.length}${app.startupFromSessions ? " (from sessions)" : ""}`, [app.launches.length])) })
  rows.push({ key: "samples.sessions", label: "Sessions (window active and uncovered / total)", cells: cells((app) => textCell(`${app.frameSessions.length} / ${app.sessions.length}`, [app.frameSessions.length, app.sessions.length])) })

  rows.push({ heading: "Startup" })
  rows.push({ key: "startup.windowVisibleMs", label: "Window visible (ms)", cells: cells((app) => medianCell(launchValues(app, (launch) => launch.windowVisibleMs))) })
  rows.push({ key: "startup.contentReadyMs", label: "Content ready (ms)", cells: cells((app) => medianCell(launchValues(app, (launch) => launch.contentReadyMs))) })
  rows.push({ key: "startup.footprintMiB", label: "Footprint at launch + 1 s (MiB)", cells: cells((app) => medianCell(launchValues(app, (launch) => launch.footprint), MIB)) })

  rows.push({ heading: "Idle (10 s)" })
  rows.push(...usageRows(data, "idle"))
  rows.push({ key: "idle.appFrames", label: "App frames (a region changed)", cells: cells((app) => frameCell(app, "idle", (phase) => phase.idleFrames)) })
  rows.push(deliveryRow(data, "idle"))
  rows.push({ key: "idle.footprintMiB", label: "Footprint after idle (MiB)", cells: cells((app) => medianCell(phaseValues(app.sessions, "idle", (phase) => phase.footprint), MIB)) })

  for (const name of ["scroll", "hover"] as const) {
    rows.push({ heading: name === "scroll" ? "Scroll (3 s down, 3 s up, 120 events/s)" : "Hover (2 s down, 2 s up, 120 moves/s)" })
    rows.push(...usageRows(data, name))
    rows.push({ key: `${name}.appFrames`, label: "App frames between first and last input (list changed)", cells: cells((app) => frameCell(app, name, (phase) => phase.motion?.frames)) })
    rows.push({ key: `${name}.fps`, label: "App frame rate (fps, higher is better)", cells: cells((app) => frameCell(app, name, (phase) => phase.motion?.fps)) })
    rows.push({ key: `${name}.intervalMs`, label: "App frame interval p50 / p95 / p99 (ms, pooled)", cells: cells((app) => percentileCell(pooledMotion(app, name), [50, 95, 99])) })
    rows.push({ key: `${name}.longFrames`, label: `Long frames (> ${num(1500 / env.display.refreshHz)} ms)`, cells: cells((app) => frameCell(app, name, (phase) => phase.motion?.longFrames)) })
    rows.push({
      key: `${name}.firstInputLatencyMs`,
      label: name === "scroll" ? "First-input latency (ms)" : "First-row-change latency (ms)",
      cells: cells((app) => frameCell(app, name, (phase) => phase.motion?.firstInputLatencyMs)),
    })
    if (name === "hover") {
      const crossings = keyCells(data, "hover", (phase) => phase.motion?.rowLatenciesMs)
      rows.push({ key: "hover.rowLatencyMs", label: "Row-change latency p50 / p95 (ms, pooled per row crossing)", cells: crossings.percentiles })
      rows.push({ key: "hover.rowNoChange", label: "Row crossings with no visible change", cells: crossings.noChange })
    }
    rows.push(deliveryRow(data, name))
  }

  rows.push({ heading: "Type (\"quarterly report\", then 16 backspaces, 150 ms per key)" })
  rows.push(...usageRows(data, "type"))
  const echo = keyCells(data, "type", (phase) => phase.echoMs)
  const result = keyCells(data, "type", (phase) => phase.resultMs)
  rows.push({ key: "type.echoMs", label: "Echo latency p50 / p95 (ms, pooled per key)", cells: echo.percentiles })
  rows.push({ key: "type.echoNoChange", label: "Echo: keys with no visible change", cells: echo.noChange })
  rows.push({ key: "type.resultMs", label: "Result latency p50 / p95 (ms, pooled per key)", cells: result.percentiles })
  rows.push({ key: "type.resultNoChange", label: "Result: keys with no visible change", cells: result.noChange })
  rows.push(deliveryRow(data, "type"))

  rows.push({ heading: "Navigate (30 x ArrowDown, 120 ms per key)" })
  rows.push(...usageRows(data, "navigate"))
  const detail = keyCells(data, "navigate", (phase) => phase.detailMs)
  rows.push({ key: "navigate.detailMs", label: "Detail latency p50 / p95 (ms, pooled per key)", cells: detail.percentiles })
  rows.push({ key: "navigate.detailNoChange", label: "Detail: keys with no visible change", cells: detail.noChange })
  rows.push(deliveryRow(data, "navigate"))

  rows.push({ heading: "After workload" })
  rows.push({ key: "workload.footprintMiB", label: "Footprint after workload (MiB)", cells: cells((app) => medianCell(present(app.sessions.map((session) => session.analysis.workloadFootprint)), MIB)) })

  rows.push({ heading: "Size" })
  const sizeCell = (app: AppData, pick: (info: NonNullable<Env["apps"][AppId]>) => number): Cell => {
    const info = env.apps[app.app]
    return info ? textCell(num(pick(info)), [pick(info)]) : textCell("–")
  }
  rows.push({ key: "size.bundleMiB", label: "App bundle (MiB, du -sk)", cells: cells((app) => sizeCell(app, (info) => info.bundleKb / 1024)) })
  rows.push({ key: "size.executableMiB", label: "Main executable (MiB)", cells: cells((app) => sizeCell(app, (info) => info.executableBytes / MIB)) })
  return rows
}

export type SummaryMetric = { key: string; section: string; label: string; cells: Partial<Record<AppId, Cell>> }

/** The rows of report.md's summary table with the numbers behind each cell, for machine-readable records. */
export function summaryMetrics(env: Env, records: RunRecord[], includeInvalid = false): SummaryMetric[] {
  const data = collect(env, records, includeInvalid)
  const metrics: SummaryMetric[] = []
  let section = ""
  for (const row of summaryRows(env, data)) {
    if ("heading" in row) {
      section = row.heading
      continue
    }
    metrics.push({
      key: row.key,
      section,
      label: row.label,
      cells: Object.fromEntries(data.map((app, index) => [app.app, row.cells[index]])),
    })
  }
  return metrics
}

function renderSummary(env: Env, data: AppData[]): string {
  const header = ["Metric", ...data.map((app) => APP_LABELS[app.app])]
  const lines = [`| ${header.join(" | ")} |`, `| --- | ${data.map(() => "---:").join(" | ")} |`]
  const sections: { heading: string; rows: { label: string; cells: Cell[] }[] }[] = []
  for (const row of summaryRows(env, data)) {
    if ("heading" in row) sections.push({ heading: row.heading, rows: [] })
    else sections[sections.length - 1].rows.push(row)
  }
  for (const section of sections) {
    const empty = section.rows.length > 0 && section.rows.every((row) => row.cells.every((cell) => cell.text === "–"))
    lines.push(`| **${section.heading}**${empty ? " (not measured, see Validity)" : ""} | ${data.map(() => "").join(" | ")} |`)
    if (empty) continue
    for (const row of section.rows) lines.push(`| ${escapeCell(row.label)} | ${row.cells.map((cell) => escapeCell(cell.text)).join(" | ")} |`)
  }
  return lines.join("\n")
}

function renderBreakdown(app: AppData): string | null {
  const groups = groupNames(app.app)
  if (!groups || app.sessions.length === 0) return null
  const phases: PhaseName[] = PHASE_NAMES
  const rows = [...groups, "total"].map((group) => {
    const footprint = (kind: "idle" | "workload") => {
      const values = present(app.sessions.map((session) => {
        if (group === "total") {
          return kind === "idle" ? phaseOf(session, "idle")?.footprint : session.analysis.workloadFootprint
        }
        const byGroup = kind === "idle" ? phaseOf(session, "idle")?.groupFootprint : session.analysis.workloadGroupFootprint
        return byGroup ? byGroup[group] : null
      }))
      return medianRangeOf(values, MIB)
    }
    const cpu = (name: PhaseName) => medianRangeOf(present(app.sessions.map((session) => {
      const phase = phaseOf(session, name)
      if (!phase) return null
      if (group === "total") return phase.usage.cpuPct
      const usage = phase.groups[group]
      return usage ? usage.cpuPct : null
    })))
    const gpu = (name: PhaseName) => medianRangeOf(present(app.sessions.map((session) => {
      const phase = phaseOf(session, name)
      if (!phase) return null
      if (group === "total") return phase.usage.gpuPct
      const usage = phase.groups[group]
      return usage ? usage.gpuPct : null
    })))
    return [group, footprint("idle"), footprint("workload"), ...phases.map(cpu), ...phases.map(gpu)]
  })
  const groupNote = appSpec(app.app).chromium
    ? "main = the root pid; renderer, GPU and network come from the Chromium `--type` on the process command line (a plain `Helper` runs both GPU and network), other = any other utility or unclassified process."
    : "main = the root pid, helpers = every other process in the tree."
  return table(
    ["Process group", "Footprint after idle (MiB)", "Footprint after workload (MiB)", ...phases.map((name) => `CPU % ${name}`), ...phases.map((name) => `GPU % ${name}`)],
    rows,
  ) + `\n\nMedian [min–max] across sessions. Groups: ${groupNote} A group that did not exist in a session is left out of that median; footprints are \`phys_footprint\`, which can double-count shared pages across processes.`
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n")
}

function ghiaLine(stamp: BuildStamp<"ghia">): string {
  const v = stamp.versions
  return `Ghia ${v.sha}${v.dirty ? " (tree had uncommitted changes)" : ""}, zed ${v.zedSha}, @ghia/native ${v.native}, @ghia/solid ${v.solid}, from ${v.source}; built with Bun ${v.bun}.`
}

function ghiaAotLine(stamp: BuildStamp<"ghia-aot">): string {
  const v = stamp.versions
  return `Ghia (bun AOT) ${v.sha}${v.dirty ? " (tree had uncommitted changes)" : ""}, zed ${v.zedSha}, @ghia/native ${v.native}, @ghia/solid ${v.solid}, from ${v.source}; built with Bun ${v.bun}, AOT ${v.aot ? "on" : "off"}.`
}

function ghiaReactLine(stamp: BuildStamp<"ghia-react">): string {
  const v = stamp.versions
  return `Ghia (React) ${v.sha}${v.dirty ? " (tree had uncommitted changes)" : ""}, zed ${v.zedSha}, @ghia/native ${v.native}, @ghia/react ${v.react}, React ${v.reactLib}, Base UI ${v.baseUi}, StyleX ${v.stylex}, React Compiler ${v.compiler}, from ${v.source}; built with Bun ${v.bun}.`
}

function gpuixLine(stamp: BuildStamp<"gpuix">): string {
  const v = stamp.versions
  return `GPUIX @gpuix/solid ${v.solid}, @gpuix/native ${v.native}, @gpuix/native-darwin-arm64 ${v.addon}, from ${v.source}.`
}

function gpuiLine(stamp: BuildStamp<"gpui">): string {
  return `GPUI app: upstream gpui from ${stamp.versions.git} at ${stamp.versions.commit}, ${stamp.versions.rustc}.`
}

function electronLine(stamp: BuildStamp<"electron">): string {
  return `Electron ${stamp.versions.electron}, Chromium ${stamp.versions.chromium}.`
}

function mygoLine(stamp: BuildStamp<"mygo">): string {
  return `MyGo ${stamp.versions.mygo}, go ${stamp.versions.go}.`
}

function swiftLine(stamp: BuildStamp<"swiftui">): string {
  const v = stamp.versions
  return `Swift ${v.swift}; Xcode ${v.xcode} (${v.xcodeBuild}); macOS SDK ${v.sdk}.`
}

function nshLine(stamp: BuildStamp<"nsh">): string {
  const v = stamp.versions
  return `NSH ${v.nsh}, commit ${v.commit}, from ${v.source}.`
}

function builtLine(stamp: BuildStamp): string {
  return `${APP_LABELS[stamp.app]} ${stamp.builtAt} at bench ${stamp.bench.sha.slice(0, 7)}${stamp.bench.dirty ? " (dirty)" : ""}`
}

export function renderEnvironment(env: Env): string {
  const lines = [
    env.sources
      ? `Composed from per-app runs (see Sources); machine fields below are from the newest, ${env.startedAt}.`
      : `Run started ${env.startedAt}; apps ${env.args.apps.join(", ")}; ${env.args.launches} startup launches and ${env.args.rounds} sessions per app.`,
    `macOS ${env.macos}, ${env.chip} (${env.cpuCores} cores), ${(env.memBytes / 2 ** 30).toFixed(0)} GiB RAM.`,
    `Scroll bars (System Settings): ${env.scrollBars ?? "unknown"}${env.scrollBars === "unset" ? " (Automatic)" : ""}.`,
    `Main display ${env.display.widthPt} x ${env.display.heightPt} pt, scale ${env.display.scale}, ${env.display.refreshHz} Hz.`,
    ...(env.sources ? [] : [`Load average (1/5/15 min) at start: ${env.loadAverage.map((value) => value.toFixed(2)).join(" / ")}.`]),
    ...(env.args.apps.includes("ghia") ? [ghiaLine(buildOf(env, "ghia"))] : []),
    ...(env.args.apps.includes("ghia-aot") ? [ghiaAotLine(buildOf(env, "ghia-aot"))] : []),
    ...(env.args.apps.includes("ghia-react") ? [ghiaReactLine(buildOf(env, "ghia-react"))] : []),
    ...(env.args.apps.includes("gpuix") ? [gpuixLine(buildOf(env, "gpuix"))] : []),
    ...(env.args.apps.includes("gpui") ? [gpuiLine(buildOf(env, "gpui"))] : []),
    ...(env.args.apps.includes("electron") ? [electronLine(buildOf(env, "electron"))] : []),
    ...(env.args.apps.includes("mygo") ? [mygoLine(buildOf(env, "mygo"))] : []),
    ...(env.args.apps.includes("swiftui") ? [swiftLine(buildOf(env, "swiftui"))] : []),
    ...(env.args.apps.includes("nsh") ? [nshLine(buildOf(env, "nsh"))] : []),
    `Bun ${env.bun}.`,
    `Bundles built (from the stamps in the bundles): ${env.args.apps.map((app) => builtLine(buildOf(env, app))).join("; ")}.`,
    `Frame capture: ${env.capture.enabled ? "on" : "off"} (${env.capture.reason}). Input: ${env.input.enabled ? "on" : "off"} (${env.input.reason}).`,
  ]
  for (const app of env.args.apps) {
    const info = env.apps[app]
    if (!info) continue
    const largest = info.largeExecutables.slice(0, 3).map((file) => `${file.path} ${(file.bytes / MIB).toFixed(1)} MiB`).join("; ")
    lines.push(`${APP_LABELS[app]}: ${(info.bundleKb / 1024).toFixed(1)} MiB bundle, executable \`${info.executable}\` ${(info.executableBytes / MIB).toFixed(1)} MiB${largest ? `; largest code files: ${largest}` : ""}.`)
  }
  return bulletList(lines)
}

const DELIVERY_PHASES: PhaseName[] = ["scroll", "hover", "type", "navigate"]

type DeliveryRowSource = { app: AppData; name: PhaseName; sessions: { analysis: PhaseAnalysis }[] }

function deliverySources(data: AppData[]): DeliveryRowSource[] {
  return data.flatMap((app) => PHASE_NAMES.map((name) => ({
    app,
    name,
    sessions: app.sessions.flatMap((session) => {
      const analysis = phaseOf(session, name)
      return analysis && analysis.delivery ? [{ analysis }] : []
    }),
  }))).filter((source) => source.sessions.length > 0)
}

/** Warnings for input phases only: an idle window may legitimately deliver fewer frames. */
export function captureWarnings(env: Env, data: AppData[]): string[] {
  const warnings: string[] = []
  for (const source of deliverySources(data)) {
    if (!DELIVERY_PHASES.includes(source.name)) continue
    const bound = source.sessions.filter((session) => session.analysis.delivery!.captureBound)
    if (bound.length === 0) continue
    const rates = bound.map((session) => session.analysis.delivery!.framesPerSec)
    warnings.push(
      `WARNING ${APP_LABELS[source.app.app]} ${source.name}: capture delivered ${num(Math.min(...rates))}–${num(Math.max(...rates))} frames/s `
      + `(< ${CAPTURE_BOUND_RATIO} x ${env.display.refreshHz} Hz) in ${bound.length} of ${source.sessions.length} sessions; `
      + "its frame rate and latencies are capture-bound, not app-bound.",
    )
  }
  for (const source of deliverySources(data)) {
    if (!DELIVERY_PHASES.includes(source.name)) continue
    const silent = source.app.sessions.filter((session) => {
      const phase = phaseOf(session, source.name)
      return phase !== undefined && phase.delivery && !showedChange(phase)
    })
    if (silent.length > 0) {
      warnings.push(
        `WARNING ${APP_LABELS[source.app.app]} ${source.name}: no frame showed a change in the target region in ${silent.length} of ${source.sessions.length} sessions; `
        + "the input had no visible effect or the capture missed it.",
      )
    }
  }
  return warnings
}

function showedChange(phase: PhaseAnalysis): boolean {
  if (phase.motion) return phase.motion.frames > 0
  const latencies = [phase.echoMs, phase.detailMs].find((entry) => entry !== undefined && entry !== null)
  return latencies !== undefined && latencies !== null && latencies.some((value) => value !== null)
}

function renderDelivery(env: Env, data: AppData[]): string {
  const sources = deliverySources(data)
  if (sources.length === 0) return "No frames were captured."
  const rows = sources.map((source) => {
    const deliveries = source.sessions.map((session) => session.analysis.delivery!)
    const helper = deliveries.flatMap((delivery) => (delivery.helper ? [delivery.helper] : []))
    const helperCell = (pick: (entry: NonNullable<(typeof deliveries)[number]["helper"]>) => number, scale = 1) =>
      helper.length === 0 ? "–" : medianRangeOf(helper.map(pick), scale)
    const statuses = new Map<string, number>()
    for (const entry of helper) for (const [status, count] of Object.entries(entry.statusCounts)) statuses.set(status, (statuses.get(status) ?? 0) + count)
    return [
      APP_LABELS[source.app.app],
      source.name,
      medianRangeOf(deliveries.map((delivery) => delivery.framesPerSec)),
      deliveries.filter((delivery) => delivery.captureBound).length + " / " + deliveries.length,
      medianRangeOf(deliveries.map((delivery) => delivery.intervalP50Ms)),
      medianRangeOf(deliveries.map((delivery) => delivery.intervalP95Ms)),
      medianRangeOf(deliveries.map((delivery) => delivery.intervalMaxMs)),
      helperCell((entry) => entry.meanIntervalMs),
      helperCell((entry) => entry.gapsOver1p5),
      helperCell((entry) => entry.handlerMaxMs),
      helperCell((entry) => entry.framesWithoutDirtyRects),
      helper.length === 0 ? "–" : [...statuses.entries()].map(([status, count]) => `${status} ${count}`).join(", "),
    ]
  })
  const warnings = captureWarnings(env, data)
  return (warnings.length > 0 ? bulletList(warnings) + "\n\n" : "No input phase was capture-bound.\n\n")
    + plainTable(
      [
        "App", "Phase", "Delivered frames/s", `Sessions < ${CAPTURE_BOUND_RATIO} x ${env.display.refreshHz} Hz`, "Interval p50 (ms)", "Interval p95 (ms)",
        "Interval max (ms)", "Helper: mean interval (ms)", "Helper: gaps > 1.5 x display", "Helper: handler max (ms)",
        "Helper: complete frames without dirty rects", "Helper: SCK frame statuses (all sessions)",
      ],
      rows,
    )
    + `\n\nFrames/s and intervals are every frame the capture delivered between the first and last input (the whole 10 s for idle), changed or not; cells are median [min–max] over sessions. Helper columns are the helper's own counts over the whole phase and are – for runs recorded before the helper counted them. A static window may legitimately deliver fewer frames, so a warning is a reason to check the capture, not a proof.`
}

function renderValidity(env: Env, records: RunRecord[], data: AppData[], includeInvalid: boolean): string {
  const sections: string[] = []
  const sessionRecords = records.filter((record): record is SessionRecord => record.type === "session")
  const launchRecords = records.filter((record): record is LaunchRecord => record.type === "launch")

  const headline = [
    `Frame capture ${env.capture.enabled ? "was on" : "was OFF"}: ${env.capture.reason}.`,
    `Input phases ${env.input.enabled ? "ran" : "were SKIPPED"}: ${env.input.reason}.`,
  ]
  if (includeInvalid) headline.push("This report INCLUDES sessions whose frame and latency metrics are marked invalid below.")
  sections.push(bulletList(headline))

  const skipped: string[][] = []
  for (const app of data) {
    const entries: { phase: PhaseName; reason: string }[] = []
    for (const record of sessionRecords.filter((candidate) => candidate.app === app.app)) {
      for (const name of PHASE_NAMES) {
        const phase = record.phases[name]
        if (phase.status === "skipped") entries.push({ phase: name, reason: phase.reason })
      }
    }
    for (const reasonEntry of countBy(entries, (entry) => entry.reason)) {
      const phases = PHASE_NAMES.filter((name) => entries.some((entry) => entry.phase === name && entry.reason === reasonEntry[0]))
      skipped.push([APP_LABELS[app.app], phases.join(", "), String(reasonEntry[1]), reasonEntry[0]])
    }
  }
  sections.push("### Skipped phases\n\n" + (skipped.length > 0 ? plainTable(["App", "Phases", "Skipped (phase x session)", "Reason"], skipped) : "None."))

  const contentMissing = data.map((app) => {
    const launches = app.launches
    const missing = launches.filter((launch) => launch.contentReadyMs === null)
    if (missing.length === 0) return null
    const reasons = [...new Set(missing.map((launch) => launch.contentReadyReason ?? "capture off"))]
    return [APP_LABELS[app.app], `${missing.length} / ${launches.length}`, reasons.join("; ")]
  }).filter((row): row is string[] => row !== null)
  sections.push("### Content-ready not measured\n\n" + (contentMissing.length > 0 ? plainTable(["App", "Launches", "Reason"], contentMissing) : "None."))

  const invalid = sessionRecords.map((record) => {
    const session = data.find((app) => app.app === record.app)?.sessions.find((entry) => entry.record === record)
    return session && !session.analysis.frameValidity.valid
      ? [APP_LABELS[record.app], String(record.round + 1), session.analysis.frameValidity.reasons.join("; ")]
      : null
  }).filter((row): row is string[] => row !== null)
  const invalidGrouped = countBy(invalid, (row) => `${row[0]}\u0000${row[2]}`).map((entry) => {
    const parts = entry[0].split("\u0000")
    const rounds = invalid.filter((row) => row[0] === parts[0] && row[2] === parts[1]).map((row) => row[1]).join(", ")
    return [parts[0], rounds, parts[1]]
  })
  sections.push(
    `### Sessions with invalid frame and latency metrics${includeInvalid ? " (included in the numbers above)" : " (excluded from the numbers above)"}\n\n`
    + (invalidGrouped.length > 0 ? plainTable(["App", "Rounds", "Reason"], invalidGrouped) : "None.")
    + "\n\nCPU, instruction, energy, wakeup and memory metrics of those sessions are still used.",
  )

  sections.push("### Capture delivery\n\n" + renderDelivery(env, data))

  const captureErrors: string[][] = []
  const phaseErrors: string[][] = []
  const stderrNotes: string[][] = []
  for (const record of sessionRecords) {
    for (const name of PHASE_NAMES) {
      const phase = record.phases[name]
      if (phase.status === "error") phaseErrors.push([APP_LABELS[record.app], name, phase.error])
      if (phase.status === "ok" && phase.data.captureError) captureErrors.push([APP_LABELS[record.app], name, phase.data.captureError])
      if (phase.status === "ok" && phase.helperStderr) stderrNotes.push([APP_LABELS[record.app], name, phase.helperStderr])
    }
  }
  const group = (rows: string[][], header: string[]) => rows.length === 0 ? "None." : plainTable(
    [...header, "Count"],
    countBy(rows, (row) => row.join("\u0000")).map((entry) => [...entry[0].split("\u0000"), String(entry[1])]),
  )
  sections.push("### Capture errors reported by the helper\n\n" + group(captureErrors, ["App", "Phase", "Error"]))
  sections.push("### Phase errors\n\n" + group(phaseErrors, ["App", "Phase", "Error"]))
  sections.push("### Helper warnings (stderr of successful phases)\n\n" + group(stderrNotes, ["App", "Phase", "Message"]))

  const stepErrors: string[][] = []
  for (const record of [...sessionRecords, ...launchRecords]) {
    for (const entry of record.errors) stepErrors.push([APP_LABELS[record.app], record.type, entry.step, entry.error])
  }
  sections.push("### Other step errors\n\n" + group(stepErrors, ["App", "Record", "Step", "Error"]))

  const churn: string[] = []
  for (const app of data) {
    let lost = 0
    for (const session of app.sessions) {
      for (const name of PHASE_NAMES) {
        const phase = phaseOf(session, name)
        if (phase && phase.usage.exitedProcesses > 0) lost += 1
      }
    }
    if (lost > 0) churn.push(`${APP_LABELS[app.app]}: ${lost} phase measurement(s) had a process exit mid-phase; its cost is not in the totals.`)
  }
  const quits = [...sessionRecords, ...launchRecords].filter((record) => record.quit !== null)
  const killed = quits.filter((record) => record.quit!.sigkilled.length > 0)
  const notTerm = quits.filter((record) => record.quit!.sigtermExitMs === null)
  const loadRecords = [...sessionRecords, ...launchRecords]
  const loads = loadRecords.flatMap((record) => [record.loadBefore[0], record.loadAfter[0]])
  const other = [
    ...churn,
    `${killed.length} of ${quits.length} quits needed SIGKILL on a straggler; ${notTerm.length} root processes ignored SIGTERM for 3 s.`,
    loads.length > 0 ? `1-minute load average around runs: median ${percentile(loads, 50).toFixed(1)}, max ${Math.max(...loads).toFixed(1)} (${env.cpuCores} cores).` : "",
  ].filter((line) => line !== "")
  sections.push("### Other notes\n\n" + bulletList(other))
  return sections.join("\n\n")
}

const METHOD_NOTES = [
  "Every metric is lower is better unless marked. Cells are median [min–max] over sessions (or startup launches); latency, interval and p50 / p95 cells pool every key or frame across valid sessions. – means no data; the reason is under Validity.",
  "Startup is measured from the mach time just before the launch call. Window visible = first poll that sees an on-screen window of the pid; content ready = first captured frame matching the Mailbox signature. The first startup launch per app is discarded.",
  "CPU, instructions, cycles, energy and wakeups are rusage deltas summed over the app's whole process tree during the phase. Processes that first appear during a phase count from zero.",
  "GPU time is the accumulated GPU time of the accelerator user clients each process in the tree owns (the IOKit registry source of Activity Monitor's GPU column), as a delta over the phase. It counts the app's own submissions; WindowServer's compositing is not attributed to the app, same as CPU. – means the run predates GPU sampling.",
  "The capture delivers a frame per display refresh whether or not the app drew, so every frame metric counts only app frames: frames in which the phase's target region changed (idle: any content region; scroll and hover: the list; type: search, list or count; navigate: the detail pane). The title bar is ignored. The search caret's blink repaints the search region, so an idle app with a blinking caret shows a few frames.",
  "Capture delivery rows count every delivered frame, changed or not. When it is below 0.9 x the refresh rate during an input phase, the app's frame rate and latencies cannot be better than the capture: see Validity.",
  "Scroll first-input latency = first input post to the first frame in which the list changed. Hover moves change the list only when the pointer enters another 72 pt row, so first-row-change latency runs from the first input that crosses into a new row, and every crossing gets its own latency.",
  "Echo latency = first frame after a keyDown in which the search box changed; result latency = first frame in which the list or the count changed; only frames before the next keyDown count, otherwise the key has no visible change. Detail latency (navigate) uses the detail pane the same way. Long frames are intervals over 1.5 x the refresh interval.",
]

/** Where each app's numbers come from, for a comparison composed from per-app runs. */
export function renderSources(env: Env): string {
  const sources = env.sources ?? {}
  const rows = APP_IDS.filter((app) => sources[app]).map((app) => {
    const source = sources[app]!
    return [
      APP_LABELS[app], source.version, source.key, source.runId, source.startedAt.slice(0, 16).replace("T", " ") + "Z",
      source.load === null ? "–" : source.load.toFixed(1), source.reused === undefined ? "–" : source.reused ? "re-used" : "measured",
    ]
  })
  return plainTable(["App", "Version", "Key", "Run", "Measured (UTC)", "Median load", "This sitting"], rows)
    + "\n\nEach app's numbers come from its newest clean run of that version (results/<app>/<version>-<key>/<run>/). Apps measured in different runs were measured at different times and loads."
}

export function buildReport(env: Env, records: RunRecord[], options: { includeInvalid: boolean }): string {
  const data = collect(env, records, options.includeInvalid)
  const parts = [
    env.sources ? "# ghia-bench comparison" : "# ghia-bench report",
    ...(env.sources ? ["## Sources", renderSources(env)] : []),
    "## Environment",
    renderEnvironment(env),
    "## Summary",
    renderSummary(env, data),
    bulletList(METHOD_NOTES),
  ]
  const warnings = captureWarnings(env, data)
  if (warnings.length > 0) parts.push(`**${warnings.length} capture warning(s), see Validity > Capture delivery: the affected fps and latency numbers may be capture-bound or empty.**`)
  for (const app of data) {
    const breakdown = renderBreakdown(app)
    if (breakdown) parts.push(`## ${APP_LABELS[app.app]} per-process breakdown`, breakdown)
  }
  parts.push("## Validity", renderValidity(env, records, data, options.includeInvalid))
  return parts.join("\n\n") + "\n"
}

export function writeReport(dir: string, options: { includeInvalid: boolean } = { includeInvalid: false }): void {
  writeFileSync(join(dir, "report.md"), buildReport(readEnv(dir), readRuns(dir), options))
}
