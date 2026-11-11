import { renameSync, writeFileSync } from "node:fs"

export const STATUS_PATH = "/tmp/ghia-bench-status.json"

export type ProgressStage = "startup" | "session"
export type ProgressState = "running" | "done" | "stopped"

/** What the on-screen panel (harness/status) reads. `index` and `count` are 1-based: launch 3 of 10, round 2 of 5. */
export type ProgressStatus = {
  state: ProgressState
  stage: ProgressStage
  app: string | null
  index: number
  count: number
  phase: string | null
  done: number
  total: number
  startedAt: number
  /** Epoch ms: the estimate while running, the moment it ended otherwise. */
  finishAt: number
  error?: string
}

export const STARTUP_UNIT_DEFAULT_MS = 4_000
export const SESSION_UNIT_DEFAULT_MS = 40_000
export const SESSION_UNIT_NO_INPUT_DEFAULT_MS = 17_000

export type UnitTally = { count: number; totalMs: number }

function averageMs(tally: UnitTally, defaultMs: number): number {
  return tally.count === 0 ? defaultMs : tally.totalMs / tally.count
}

/** Units not finished yet, the one in progress included, at the average observed duration of their kind. */
export function estimateRemainingMs(input: {
  startupLeft: number
  sessionLeft: number
  startup: UnitTally
  session: UnitTally
  startupDefaultMs: number
  sessionDefaultMs: number
}): number {
  return input.startupLeft * averageMs(input.startup, input.startupDefaultMs)
    + input.sessionLeft * averageMs(input.session, input.sessionDefaultMs)
}

/** Write to a temp file and rename it over the target, so the panel never reads half a file. */
export function writeAtomically(path: string, text: string): void {
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, text)
  renameSync(temp, path)
}

export type ProgressOptions = {
  path: string
  /** Startup launches in all: measured apps x launches. */
  startupUnits: number
  /** Sessions in all: measured apps x rounds. */
  sessionUnits: number
  /** Launches per app, and rounds per app. */
  launches: number
  rounds: number
  /** Whether the input phases run: sessions are much shorter without them. */
  inputEnabled: boolean
  now: () => number
  write: (path: string, text: string) => void
}

type Unit = { stage: ProgressStage; app: string; index: number; phase: string | null; startedAt: number }

export class ProgressFeed {
  private readonly options: ProgressOptions
  private readonly startedAt: number
  private readonly tallies: Record<ProgressStage, UnitTally> = {
    startup: { count: 0, totalMs: 0 },
    session: { count: 0, totalMs: 0 },
  }
  private state: ProgressState = "running"
  private stage: ProgressStage
  private unit: Unit | null = null
  private last: { stage: ProgressStage; app: string; index: number; phase: string | null } | null = null
  private error: string | undefined
  private endedAt: number | null = null

  constructor(options: ProgressOptions) {
    this.options = options
    this.startedAt = options.now()
    this.stage = options.startupUnits > 0 ? "startup" : "session"
  }

  begin(): void {
    this.publish()
  }

  /** `index` is 0-based, as in the run loops. */
  unitStart(stage: ProgressStage, app: string, index: number): void {
    this.requireRunning("unitStart")
    if (this.unit) throw new Error(`unitStart(${stage} ${app}) while ${this.unit.stage} ${this.unit.app} is still running`)
    this.stage = stage
    this.unit = { stage, app, index, phase: null, startedAt: this.options.now() }
    this.publish()
  }

  phaseStart(phase: string): void {
    if (!this.unit) throw new Error(`phaseStart(${phase}) outside a unit`)
    this.unit.phase = phase
    this.publish()
  }

  unitEnd(): void {
    const unit = this.unit
    if (!unit) throw new Error("unitEnd outside a unit")
    const tally = this.tallies[unit.stage]
    tally.count += 1
    tally.totalMs += this.options.now() - unit.startedAt
    this.last = { stage: unit.stage, app: unit.app, index: unit.index, phase: unit.phase }
    this.unit = null
    this.publish()
  }

  finish(): void {
    this.requireRunning("finish")
    if (this.unit) throw new Error(`finish while ${this.unit.stage} ${this.unit.app} is still running`)
    this.end("done", undefined)
  }

  /** Does nothing once the feed has ended, so a signal arriving after `finish` does not turn Done into Stopped. */
  stop(error: string): void {
    if (this.state !== "running") return
    this.end("stopped", error)
  }

  status(): ProgressStatus {
    const now = this.options.now()
    const shown = this.unit ?? this.last
    const startupDone = this.tallies.startup.count
    const sessionDone = this.tallies.session.count
    const status: ProgressStatus = {
      state: this.state,
      stage: this.stage,
      app: shown ? shown.app : null,
      index: shown ? shown.index + 1 : 0,
      count: this.stage === "startup" ? this.options.launches : this.options.rounds,
      phase: shown ? shown.phase : null,
      done: startupDone + sessionDone,
      total: this.options.startupUnits + this.options.sessionUnits,
      startedAt: this.startedAt,
      finishAt: this.endedAt ?? now + estimateRemainingMs({
        startupLeft: this.options.startupUnits - startupDone,
        sessionLeft: this.options.sessionUnits - sessionDone,
        startup: this.tallies.startup,
        session: this.tallies.session,
        startupDefaultMs: STARTUP_UNIT_DEFAULT_MS,
        sessionDefaultMs: this.options.inputEnabled ? SESSION_UNIT_DEFAULT_MS : SESSION_UNIT_NO_INPUT_DEFAULT_MS,
      }),
    }
    if (this.error !== undefined) status.error = this.error
    return status
  }

  private end(state: "done" | "stopped", error: string | undefined): void {
    this.state = state
    this.error = error
    this.endedAt = this.options.now()
    this.publish()
  }

  private requireRunning(call: string): void {
    if (this.state !== "running") throw new Error(`${call} after the feed ended (${this.state})`)
  }

  private publish(): void {
    this.options.write(this.options.path, JSON.stringify(this.status()))
  }
}
