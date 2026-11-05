import type {
  AppId, Frame, Input, LaunchResult, PhaseName, PhaseOutput, Proc, Sample, SessionRecord, WindowStatus,
} from "./types"

const NS_PER_MS = 1e6
const NS_PER_SEC = 1e9

export type Summary = { n: number; median: number; min: number; max: number }

export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of an empty list")
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

export function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null
  return { n: values.length, median: percentile(values, 50), min: Math.min(...values), max: Math.max(...values) }
}

export type Usage = {
  durationSec: number
  cpuMs: number
  /** Percent of one core. */
  cpuPct: number
  instructions: number
  cycles: number
  /** null when the OS reports no energy at all (every counter zero or absent). */
  energyMj: number | null
  wakeups: number
  wakeupsPerSec: number
  processes: number
  /** Processes in the tree at the end that did not exist (or whose counters restarted) at the start. */
  newProcesses: number
  /** Processes in the tree at the start that are gone at the end; their cost is not recoverable. */
  exitedProcesses: number
}

type Accumulator = {
  cpuNs: number
  instructions: number
  cycles: number
  energyNj: number
  energySeen: boolean
  wakeups: number
  processes: number
  newProcesses: number
}

function counterRestarted(before: Proc, after: Proc): boolean {
  return after.cycles < before.cycles
    || after.instructions < before.instructions
    || after.userNs + after.sysNs < before.userNs + before.sysNs
}

/**
 * Per-group rusage difference over the process tree. A pid absent from `before` (or whose counters went backwards,
 * i.e. the pid was reused) counts from zero; a pid that vanished before `after` contributes nothing.
 */
export function diffUsageByGroup(
  before: Sample, after: Sample, groupOf: (proc: Proc) => string,
): Record<string, Usage> {
  const durationSec = (after.tNs - before.tNs) / NS_PER_SEC
  if (!(durationSec > 0)) throw new Error(`rusage samples are not in order (${before.tNs} -> ${after.tNs})`)
  const previous = new Map(before.procs.map((proc) => [proc.pid, proc]))
  const groups = new Map<string, Accumulator>()
  for (const proc of after.procs) {
    const group = groupOf(proc)
    let acc = groups.get(group)
    if (!acc) {
      acc = { cpuNs: 0, instructions: 0, cycles: 0, energyNj: 0, energySeen: false, wakeups: 0, processes: 0, newProcesses: 0 }
      groups.set(group, acc)
    }
    const old = previous.get(proc.pid)
    const base = old && !counterRestarted(old, proc) ? old : null
    acc.processes += 1
    if (!base) acc.newProcesses += 1
    acc.cpuNs += proc.userNs + proc.sysNs - (base ? base.userNs + base.sysNs : 0)
    acc.instructions += proc.instructions - (base ? base.instructions : 0)
    acc.cycles += proc.cycles - (base ? base.cycles : 0)
    acc.wakeups += proc.idleWakeups + proc.interruptWakeups - (base ? base.idleWakeups + base.interruptWakeups : 0)
    if (proc.energyNj !== null) {
      acc.energySeen = true
      acc.energyNj += proc.energyNj - (base && base.energyNj !== null ? base.energyNj : 0)
    }
  }
  const afterPids = new Set(after.procs.map((proc) => proc.pid))
  const exitedByGroup = new Map<string, number>()
  for (const proc of before.procs) {
    if (afterPids.has(proc.pid)) continue
    const group = groupOf(proc)
    exitedByGroup.set(group, (exitedByGroup.get(group) ?? 0) + 1)
  }
  const result: Record<string, Usage> = {}
  for (const [group, acc] of groups) {
    result[group] = {
      durationSec,
      cpuMs: acc.cpuNs / NS_PER_MS,
      cpuPct: (acc.cpuNs / NS_PER_SEC / durationSec) * 100,
      instructions: acc.instructions,
      cycles: acc.cycles,
      energyMj: acc.energySeen && acc.energyNj !== 0 ? acc.energyNj / 1e6 : null,
      wakeups: acc.wakeups,
      wakeupsPerSec: acc.wakeups / durationSec,
      processes: acc.processes,
      newProcesses: acc.newProcesses,
      exitedProcesses: exitedByGroup.get(group) ?? 0,
    }
  }
  return result
}

export function diffUsage(before: Sample, after: Sample): Usage {
  const all = diffUsageByGroup(before, after, () => "all").all
  if (!all) throw new Error("the process tree is empty in the after sample")
  return all
}

export function footprintByGroup(sample: Sample, groupOf: (proc: Proc) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const proc of sample.procs) {
    const group = groupOf(proc)
    result[group] = (result[group] ?? 0) + proc.footprint
  }
  return result
}

export function footprintTotal(sample: Sample): number {
  return sample.procs.reduce((sum, proc) => sum + proc.footprint, 0)
}

export const ELECTRON_GROUPS = ["main", "renderer", "gpu", "network", "other"] as const
export type ElectronGroup = (typeof ELECTRON_GROUPS)[number]

/**
 * Electron's GPU and network processes both run the plain "Helper" executable, so the name alone cannot tell them
 * apart; `type` is the Chromium process type from the command line (see TreeTracker.refreshTypes). The name is only
 * the fallback for renderers, and proc_name truncates at 32 characters ("...(Rendere").
 */
export function electronGroupOf(name: string | null, isRoot: boolean, type: string | null): ElectronGroup {
  if (isRoot) return "main"
  if (type !== null) {
    if (type === "renderer") return "renderer"
    if (type === "gpu-process") return "gpu"
    if (type.startsWith("utility:network")) return "network"
    return "other"
  }
  if (name !== null && /Helper \(Render/.test(name)) return "renderer"
  return "other"
}

export function groupFunction(
  app: AppId, rootPid: number, types: Record<string, string>,
): (proc: Proc) => string {
  if (app === "electron") {
    return (proc) => electronGroupOf(proc.name, proc.pid === rootPid, proc.pid in types ? types[proc.pid] : null)
  }
  return () => "all"
}

export function startupMs(launch: LaunchResult): { windowVisibleMs: number | null; contentReadyMs: number | null } {
  return {
    windowVisibleMs: launch.windowVisibleNs === null ? null : (launch.windowVisibleNs - launch.t0Ns) / NS_PER_MS,
    contentReadyMs: launch.contentReadyNs === null ? null : (launch.contentReadyNs - launch.t0Ns) / NS_PER_MS,
  }
}

export function framesBetween(frames: Frame[], fromNs: number, toNs: number): Frame[] {
  return frames.filter((frame) => !frame.first && frame.tNs >= fromNs && frame.tNs <= toNs)
}

export function idleFrameCount(frames: Frame[], beforeNs: number, afterNs: number): number {
  return framesBetween(frames, beforeNs, afterNs).length
}

export type MotionMetrics = {
  frames: number
  spanMs: number
  fps: number
  intervalsMs: number[]
  longFrames: number
  longFrameThresholdMs: number
  firstInputLatencyMs: number | null
}

/**
 * Scroll and hover: frames presented between the first and last input. `region` is the pane the input moves;
 * the first-input latency is the first frame after the first input in which it changed.
 */
export function motionMetrics(frames: Frame[], inputs: Input[], refreshHz: number, region: string): MotionMetrics {
  if (inputs.length < 2) throw new Error("motion metrics need at least two inputs")
  const firstNs = inputs[0].tNs
  const lastNs = inputs[inputs.length - 1].tNs
  const inWindow = framesBetween(frames, firstNs, lastNs)
  const intervalsMs: number[] = []
  for (let index = 1; index < inWindow.length; index++) {
    intervalsMs.push((inWindow[index].tNs - inWindow[index - 1].tNs) / NS_PER_MS)
  }
  const longFrameThresholdMs = (1.5 * 1000) / refreshHz
  const spanMs = (lastNs - firstNs) / NS_PER_MS
  const firstChange = frames.find((frame) => !frame.first && frame.tNs > firstNs && frame.changed.includes(region))
  return {
    frames: inWindow.length,
    spanMs,
    fps: inWindow.length / (spanMs / 1000),
    intervalsMs,
    longFrames: intervalsMs.filter((interval) => interval > longFrameThresholdMs).length,
    longFrameThresholdMs,
    firstInputLatencyMs: firstChange ? (firstChange.tNs - firstNs) / NS_PER_MS : null,
  }
}

/**
 * One latency per keyDown: the first frame after it in which any of `regions` changed, counting only frames
 * before the next keyDown. The last key has no successor, so it is cut off after the median spacing of the others
 * (otherwise a later caret blink would be taken for an echo). null = no visible change.
 */
export function keyLatencies(frames: Frame[], inputs: Input[], regions: string[]): (number | null)[] {
  const downs = inputs.filter((input) => input.kind === "keyDown")
  const gaps: number[] = []
  for (let index = 1; index < downs.length; index++) gaps.push(downs[index].tNs - downs[index - 1].tNs)
  const lastCutoffNs = gaps.length > 0 ? percentile(gaps, 50) : Number.POSITIVE_INFINITY
  return downs.map((down, index) => {
    const untilNs = index + 1 < downs.length ? downs[index + 1].tNs : down.tNs + lastCutoffNs
    const hit = frames.find(
      (frame) => !frame.first && frame.tNs > down.tNs && frame.tNs < untilNs
        && frame.changed.some((region) => regions.includes(region)),
    )
    return hit ? (hit.tNs - down.tNs) / NS_PER_MS : null
  })
}

export function frameValidity(window: WindowStatus | null): { valid: boolean; reasons: string[] } {
  if (window === null) return { valid: false, reasons: ["window status unavailable"] }
  const reasons: string[] = []
  if (!window.appActive) reasons.push("app was not the active application (appActive=false)")
  if (!window.onScreen) reasons.push("window was not on screen")
  if (window.coveredFraction > 0) {
    const owners = window.coveredBy.map((blocker) => blocker.owner ?? `pid ${blocker.pid}`)
    reasons.push(
      `window ${(window.coveredFraction * 100).toFixed(1)}% covered by ${[...new Set(owners)].join(", ")}`,
    )
  }
  return { valid: reasons.length === 0, reasons }
}

export type PhaseAnalysis = {
  usage: Usage
  groups: Record<string, Usage>
  /** idle only */
  footprint?: number
  groupFootprint?: Record<string, number>
  idleFrames?: number | null
  /** scroll, hover */
  motion?: MotionMetrics | null
  /** type */
  echoMs?: (number | null)[] | null
  resultMs?: (number | null)[] | null
  /** navigate */
  detailMs?: (number | null)[] | null
}

export type SessionAnalysis = {
  app: AppId
  round: number
  frameValidity: { valid: boolean; reasons: string[] }
  phases: Partial<Record<PhaseName, PhaseAnalysis>>
  workloadFootprint: number | null
  workloadGroupFootprint: Record<string, number> | null
}

function analyzePhase(
  name: PhaseName, data: PhaseOutput, groupOf: (proc: Proc) => string, refreshHz: number,
): PhaseAnalysis {
  const analysis: PhaseAnalysis = {
    usage: diffUsage(data.rusageBefore, data.rusageAfter),
    groups: diffUsageByGroup(data.rusageBefore, data.rusageAfter, groupOf),
  }
  const frames = data.frames
  switch (name) {
    case "idle":
      analysis.footprint = footprintTotal(data.rusageAfter)
      analysis.groupFootprint = footprintByGroup(data.rusageAfter, groupOf)
      analysis.idleFrames = frames ? idleFrameCount(frames, data.rusageBefore.tNs, data.rusageAfter.tNs) : null
      break
    case "scroll":
    case "hover":
      analysis.motion = frames ? motionMetrics(frames, data.inputs, refreshHz, "list") : null
      break
    case "type":
      analysis.echoMs = frames ? keyLatencies(frames, data.inputs, ["search"]) : null
      analysis.resultMs = frames ? keyLatencies(frames, data.inputs, ["list", "count"]) : null
      break
    case "navigate":
      analysis.detailMs = frames ? keyLatencies(frames, data.inputs, ["detail"]) : null
      break
  }
  return analysis
}

export function analyzeSession(record: SessionRecord, refreshHz: number): SessionAnalysis {
  const rootPid = record.launch ? record.launch.pid : -1
  const groupOf = groupFunction(record.app, rootPid, record.processTypes)
  const phases: Partial<Record<PhaseName, PhaseAnalysis>> = {}
  for (const name of Object.keys(record.phases) as PhaseName[]) {
    const phase = record.phases[name]
    if (phase.status === "ok") phases[name] = analyzePhase(name, phase.data, groupOf, refreshHz)
  }
  return {
    app: record.app,
    round: record.round,
    frameValidity: frameValidity(record.window),
    phases,
    workloadFootprint: record.finalSample ? footprintTotal(record.finalSample) : null,
    workloadGroupFootprint: record.finalSample ? footprintByGroup(record.finalSample, groupOf) : null,
  }
}

export type LaunchAnalysis = {
  app: AppId
  index: number
  discarded: boolean
  windowVisibleMs: number | null
  contentReadyMs: number | null
  footprint: number | null
  contentReadyReason: string | null
}

export type LaunchSource = {
  app: AppId
  index: number
  discarded: boolean
  launch: LaunchResult | null
  sample: Sample | null
}

export function analyzeLaunch(record: LaunchSource): LaunchAnalysis | null {
  if (!record.launch) return null
  const startup = startupMs(record.launch)
  return {
    app: record.app,
    index: record.index,
    discarded: record.discarded,
    windowVisibleMs: startup.windowVisibleMs,
    contentReadyMs: startup.contentReadyMs,
    footprint: record.sample ? footprintTotal(record.sample) : null,
    contentReadyReason: record.launch.captureError ?? null,
  }
}
