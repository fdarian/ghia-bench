export type AppId = "electron" | "ghia" | "gpui"
export const APP_IDS: AppId[] = ["electron", "ghia", "gpui"]

export const APP_LABELS: Record<AppId, string> = { electron: "Electron", ghia: "Ghia", gpui: "GPUI" }

export type PhaseName = "idle" | "scroll" | "hover" | "type" | "navigate"
export const PHASE_NAMES: PhaseName[] = ["idle", "scroll", "hover", "type", "navigate"]
export const INPUT_PHASES: PhaseName[] = ["scroll", "hover", "type", "navigate"]

/** Times are mach nanoseconds since boot; they stay below 2^53 for ~104 days of uptime, so plain numbers are exact. */
export type Proc = {
  pid: number
  ppid: number | null
  name: string | null
  userNs: number
  sysNs: number
  instructions: number
  cycles: number
  energyNj: number | null
  idleWakeups: number
  interruptWakeups: number
  footprint: number
  resident: number
}

export type Sample = { tNs: number; procs: Proc[] }

export type Probe = {
  screenCapture: boolean
  postEvent: boolean
  axTrusted: boolean
  mainDisplay: { id: number; widthPt: number; heightPt: number; scale: number; refreshHz: number }
  osVersion: string
  cpu: string
  memBytes: number
}

export type Rect = { x: number; y: number; w: number; h: number }

export type LaunchResult = {
  pid: number
  t0Ns: number
  windowVisibleNs: number | null
  windowFrame: Rect | null
  windowFrameAtVisible: Rect | null
  contentReadyNs: number | null
  captureError?: string
}

export type WindowStatus = {
  frame: Rect
  titlebarHeight: number
  onScreen: boolean
  frontmost: boolean
  appActive: boolean
  coveredFraction: number
  coveredBy: { pid: number; owner: string | null; frame: Rect }[]
}

export type Frame = { tNs: number; changed: string[]; first?: boolean }

export type Input = { tNs: number; kind: string; key?: string; dy?: number; x?: number; y?: number }

export type PhaseOutput = {
  name: PhaseName
  windowFrame: Rect
  titlebarHeight: number
  rusageBefore: Sample
  rusageAfter: Sample
  rusageAfterTail: Sample
  inputs: Input[]
  frames: Frame[] | null
  captureError?: string
}

export type PhaseRecord =
  | { status: "ok"; data: PhaseOutput; helperStderr?: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string }

export type QuitResult = {
  sigtermExitMs: number | null
  sigkilled: { pid: number; name: string | null }[]
}

export type StepError = { step: string; error: string }

export type LaunchRecord = {
  type: "launch"
  app: AppId
  index: number
  discarded: boolean
  startedAt: string
  loadBefore: number[]
  loadAfter: number[]
  launch: LaunchResult | null
  sample: Sample | null
  quit: QuitResult | null
  errors: StepError[]
}

export type SessionRecord = {
  type: "session"
  app: AppId
  round: number
  startedAt: string
  loadBefore: number[]
  loadAfter: number[]
  launch: LaunchResult | null
  window: WindowStatus | null
  phases: Record<PhaseName, PhaseRecord>
  finalSample: Sample | null
  /** pid -> Chromium process type from the command line (`renderer`, `gpu-process`, `utility:<sub-type>`, `browser`). Electron only. */
  processTypes: Record<string, string>
  quit: QuitResult | null
  errors: StepError[]
}

export type RunRecord = LaunchRecord | SessionRecord

export type AppInfo = {
  path: string
  bundleKb: number
  executable: string
  executableBytes: number
  largeExecutables: { path: string; bytes: number }[]
}

export type Env = {
  startedAt: string
  args: { apps: AppId[]; rounds: number; launches: number; capture: string; out: string }
  capture: { enabled: boolean; reason: string }
  input: { enabled: boolean; reason: string }
  probe: Probe
  macos: string
  chip: string
  memBytes: number
  display: Probe["mainDisplay"]
  loadAverage: number[]
  cpuCores: number
  ghia: { sha: string | null; zedSha: string | null }
  electron: { electron: string; chromium: string } | null
  bun: string
  rustc: string | null
  apps: Partial<Record<AppId, AppInfo>>
  warnings: string[]
}
