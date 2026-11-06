import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { bundlePath, collectEnv, currentLoadAverage } from "./env"
import { probe, runHelper, sample } from "./helper"
import { requireOrRequestPermissions } from "./permissions"
import { quitTree, runningMailboxProcesses, sleep, TreeTracker } from "./procs"
import { writeReport } from "./report"
import type {
  AppId, Env, LaunchRecord, LaunchResult, PhaseName, PhaseOutput, PhaseRecord, Probe, QuitResult, Sample,
  SessionRecord, StepError, WindowStatus,
} from "./types"
import { INPUT_PHASES } from "./types"

export type CaptureMode = "auto" | "on" | "off"

export type RunOptions = {
  apps: AppId[]
  rounds: number
  launches: number
  capture: CaptureMode
  allowMissingPermissions: boolean
  out: string
}

const LAUNCH_TIMEOUT_MS = 40_000
const PHASE_TIMEOUT_MS = 60_000
const IDLE_SECONDS = 10

export function rotate<T>(items: T[], by: number): T[] {
  const offset = by % items.length
  return items.slice(offset).concat(items.slice(0, offset))
}

export function resolveCapture(mode: CaptureMode, probeResult: Probe): Env["capture"] {
  if (mode === "off") return { enabled: false, reason: "--capture off" }
  if (mode === "on") {
    return {
      enabled: true,
      reason: probeResult.screenCapture
        ? "--capture on"
        : "--capture on, but Screen Recording is not granted: the helper will report captureError and no frames are recorded",
    }
  }
  return probeResult.screenCapture
    ? { enabled: true, reason: "Screen Recording granted" }
    : { enabled: false, reason: "Screen Recording not granted (CGPreflightScreenCaptureAccess false)" }
}

export function resolveInput(probeResult: Probe): Env["input"] {
  return probeResult.postEvent
    ? { enabled: true, reason: probeResult.axTrusted ? "post-event and Accessibility granted" : "post-event granted (Accessibility not trusted: events may still be dropped)" }
    : { enabled: false, reason: "post-event access not granted (CGEventPostToPid would be dropped)" }
}

let active: TreeTracker | null = null

function installInterruptHandler(): void {
  const stop = (signal: string) => {
    console.error(`\n${signal}: quitting the app under test and stopping`)
    const tracker = active
    const finish = () => process.exit(130)
    if (tracker) quitTree(tracker).then(finish, finish)
    else finish()
  }
  process.on("SIGINT", () => stop("SIGINT"))
  process.on("SIGTERM", () => stop("SIGTERM"))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function step<T>(errors: StepError[], name: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch (error) {
    errors.push({ step: name, error: message(error) })
    console.error(`  ! ${name}: ${message(error)}`)
    return null
  }
}

async function launchApp(app: AppId, capture: boolean): Promise<LaunchResult> {
  const args = ["launch", "--app", bundlePath(app), ...(capture ? ["--capture"] : [])]
  return (await runHelper<LaunchResult>(args, LAUNCH_TIMEOUT_MS)).data
}

async function assertNothingRunning(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const running = await runningMailboxProcesses()
    if (running.length === 0) return
    await sleep(50)
  }
  const running = await runningMailboxProcesses()
  throw new Error(`Mailbox-* processes still running after quit (not touching them): ${running.map((entry) => entry.pid).join(", ")}`)
}

async function quit(tracker: TreeTracker, errors: StepError[]): Promise<QuitResult | null> {
  const result = await step(errors, "quit", () => quitTree(tracker))
  active = null
  await sleep(500)
  await assertNothingRunning()
  return result
}

function appendRecord(out: string, record: unknown): void {
  appendFileSync(join(out, "runs.jsonl"), JSON.stringify(record) + "\n")
}

async function startupLaunch(
  app: AppId, index: number, capture: boolean, out: string,
): Promise<void> {
  const errors: StepError[] = []
  const startedAt = new Date().toISOString()
  const loadBefore = currentLoadAverage()
  let observed: Sample | null = null
  let quitResult: QuitResult | null = null
  const launch = await step(errors, "launch", () => launchApp(app, capture))
  if (launch) {
    const tracker = new TreeTracker(launch.pid)
    active = tracker
    // The window is already stable here; the extra second lets lazily started helper processes show up in the tree.
    await sleep(1000)
    observed = await step(errors, "sample", () => sample(launch.pid))
    if (observed) tracker.observe(observed)
    quitResult = await quit(tracker, errors)
  }
  const record: LaunchRecord = {
    type: "launch", app, index, discarded: index === 0, startedAt, loadBefore, loadAfter: currentLoadAverage(),
    launch, sample: observed, quit: quitResult, errors,
  }
  appendRecord(out, record)
  const visible = launch && launch.windowVisibleNs !== null ? ((launch.windowVisibleNs - launch.t0Ns) / 1e6).toFixed(0) : "-"
  console.log(`launch ${app} #${index + 1}${record.discarded ? " (discarded)" : ""}: window visible ${visible} ms${errors.length ? `, ${errors.length} error(s)` : ""}`)
}

async function runPhase(
  tracker: TreeTracker, name: PhaseName, capture: boolean, inputEnabled: boolean, inputReason: string,
): Promise<PhaseRecord> {
  if (name !== "idle" && !inputEnabled) return { status: "skipped", reason: inputReason }
  const args = ["phase", "--pid", String(tracker.root), "--name", name]
  if (name === "idle") args.push("--seconds", String(IDLE_SECONDS))
  if (capture) args.push("--capture")
  try {
    const result = await runHelper<PhaseOutput>(args, PHASE_TIMEOUT_MS)
    tracker.observe(result.data.rusageBefore)
    tracker.observe(result.data.rusageAfter)
    tracker.observe(result.data.rusageAfterTail)
    await tracker.refreshTypes()
    const record: PhaseRecord = { status: "ok", data: result.data }
    if (result.stderr !== "") record.helperStderr = result.stderr
    return record
  } catch (error) {
    console.error(`  ! phase ${name}: ${message(error)}`)
    return { status: "error", error: message(error) }
  }
}

async function session(
  app: AppId, round: number, capture: boolean, input: Env["input"], out: string,
): Promise<void> {
  const errors: StepError[] = []
  const startedAt = new Date().toISOString()
  const loadBefore = currentLoadAverage()
  const skipped = (reason: string): PhaseRecord => ({ status: "skipped", reason })
  const phases: Record<PhaseName, PhaseRecord> = {
    idle: skipped("not reached"), scroll: skipped("not reached"), hover: skipped("not reached"),
    type: skipped("not reached"), navigate: skipped("not reached"),
  }
  let window: WindowStatus | null = null
  let finalSample: Sample | null = null
  let quitResult: QuitResult | null = null
  let processTypes: Record<string, string> = {}

  const launch = await step(errors, "launch", () => launchApp(app, capture))
  if (launch) {
    const tracker = new TreeTracker(launch.pid)
    active = tracker
    await sleep(3000)
    window = await step(errors, "window", async () =>
      (await runHelper<WindowStatus>(["window", "--pid", String(launch.pid)], 15_000)).data)
    phases.idle = await runPhase(tracker, "idle", capture, input.enabled, input.reason)
    for (const name of INPUT_PHASES) {
      phases[name] = await runPhase(tracker, name, capture, input.enabled, input.reason)
    }
    await sleep(2000)
    finalSample = await step(errors, "final sample", () => sample(launch.pid))
    if (finalSample) tracker.observe(finalSample)
    await step(errors, "process types", () => tracker.refreshTypes())
    processTypes = tracker.types
    quitResult = await quit(tracker, errors)
  }
  const record: SessionRecord = {
    type: "session", app, round, startedAt, loadBefore, loadAfter: currentLoadAverage(),
    launch, window, phases, finalSample, processTypes, quit: quitResult, errors,
  }
  appendRecord(out, record)
  const states = (Object.keys(phases) as PhaseName[]).map((name) => `${name}:${phases[name].status}`).join(" ")
  const windowText = window ? `appActive=${window.appActive} covered=${(window.coveredFraction * 100).toFixed(0)}%` : "window=?"
  console.log(`session ${app} round ${round + 1}: ${windowText}; ${states}; load ${loadBefore[0].toFixed(1)} -> ${record.loadAfter[0].toFixed(1)}`)
}

export async function runBench(options: RunOptions): Promise<void> {
  const running = await runningMailboxProcesses()
  if (running.length > 0) {
    throw new Error(
      `refusing to start: Mailbox-* processes are running (pids ${running.map((entry) => entry.pid).join(", ")}). Quit them first; the harness will not touch them.`,
    )
  }
  const probeResult = await probe()
  if (!options.allowMissingPermissions) await requireOrRequestPermissions(probeResult, options.capture !== "off")
  const capture = resolveCapture(options.capture, probeResult)
  const input = resolveInput(probeResult)
  if (existsSync(join(options.out, "runs.jsonl")) && readFileSync(join(options.out, "runs.jsonl"), "utf8").length > 0) {
    throw new Error(`${options.out}/runs.jsonl already has records; pick a new --out`)
  }
  mkdirSync(options.out, { recursive: true })
  const env = await collectEnv({
    startedAt: new Date().toISOString(),
    args: { apps: options.apps, rounds: options.rounds, launches: options.launches, capture: options.capture, out: options.out },
    probe: probeResult,
    capture,
    input,
  })
  writeFileSync(join(options.out, "env.json"), JSON.stringify(env, null, 2) + "\n")
  writeFileSync(join(options.out, "runs.jsonl"), "")

  console.log(`apps: ${options.apps.join(", ")}; ${options.launches} startup launches and ${options.rounds} sessions each; out ${options.out}`)
  console.log(`capture: ${capture.enabled ? "on" : "OFF"} (${capture.reason})`)
  console.log(`input phases: ${input.enabled ? "on" : "SKIPPED"} (${input.reason})`)
  if (env.warnings.length > 0) console.log(`env warnings: ${env.warnings.join("; ")}`)
  installInterruptHandler()

  for (let index = 0; index < options.launches; index++) {
    for (const app of rotate(options.apps, index)) await startupLaunch(app, index, capture.enabled, options.out)
  }
  for (let round = 0; round < options.rounds; round++) {
    for (const app of rotate(options.apps, round)) await session(app, round, capture.enabled, input, options.out)
  }
  writeReport(options.out)
  console.log(`report: ${join(options.out, "report.md")}`)
}

