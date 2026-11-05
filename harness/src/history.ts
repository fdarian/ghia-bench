import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { exec } from "./env"
import { REPO_ROOT } from "./helper"
import {
  CHARTS, lineChartSvg, orderEntries, parseTarget, renderReadme, snapshotLabel,
  type HistoryEntry, type TargetSpec,
} from "./history-model"
import { readEnv, readRuns, summaryMetrics } from "./report"
import { runBench, type CaptureMode } from "./run"
import type { AppId, RunRecord } from "./types"

export const HISTORY_DIR = join(REPO_ROOT, "history", "ghia")
const GHIA_SRC = process.env.GHIA_SRC || null
const LOCKED_ENV = "GHIA_BENCH_LOCKED"

export type RecordOptions = { target: string; rounds: number; launches: number; capture: CaptureMode }

/** GHIA_HEAVY wraps heavy steps when set and executable, as in scripts/setup-ghia.sh; there is no default. */
function heavyScript(): string | null {
  const path = process.env.GHIA_HEAVY
  return path && existsSync(path) ? path : null
}

async function runLogged(command: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<{ exitCode: number; tail: string }> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  let tail = ""
  const pump = async (stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) => {
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk)
      sink.write(text)
      tail = (tail + text).slice(-2000)
    }
  }
  const [, , exitCode] = await Promise.all([pump(child.stdout, process.stdout), pump(child.stderr, process.stderr), child.exited])
  return { exitCode, tail: tail.trim() }
}

function git(args: string[], cwd = REPO_ROOT): Promise<string> {
  return exec(["git", "-C", cwd, ...args])
}

type Resolved = {
  spec: TargetSpec
  label: string
  ghiaVersion: string
  gitSha: string | null
  zedSha: string | null
  commitDate: string | null
  source: string
  /** Where build.sh puts the bundle. */
  bundle: string
  buildCommand: string[]
}

async function resolveTarget(text: string): Promise<Resolved> {
  const spec = parseTarget(text)
  if (spec.kind === "npm") {
    const label = spec.version
    return {
      spec, label, ghiaVersion: spec.version, gitSha: null, zedSha: null, commitDate: null,
      source: `npm @ghia/solid ${spec.version} + @ghia/native ${spec.version} (prebuilt addon, installed in an isolated copy)`,
      bundle: join(REPO_ROOT, "dist", "history", `Mailbox-Ghia-${label}.app`),
      buildCommand: [join(REPO_ROOT, "apps", "ghia", "build.sh"), `npm:${spec.version}`],
    }
  }
  const ghiaRepo = GHIA_SRC ?? join(REPO_ROOT, "vendor", "ghia")
  if (!existsSync(join(ghiaRepo, ".git"))) throw new Error(`no Ghia git checkout at ${ghiaRepo}: set GHIA_SRC to one containing ${spec.rev}`)
  const sha = await git(["rev-parse", "--verify", `${spec.rev}^{commit}`], ghiaRepo)
  const zedSha = process.env.ZED_REV || await git(["rev-parse", `${sha}:zed`], ghiaRepo)
  const label = snapshotLabel(sha)
  const manifest = JSON.parse(await git(["show", `${sha}:packages/solid/package.json`], ghiaRepo)) as { version: string }
  return {
    spec, label, ghiaVersion: manifest.version, gitSha: sha, zedSha,
    commitDate: await git(["show", "-s", "--format=%cI", sha], ghiaRepo),
    source: `git ${sha} (zed ${zedSha}), built from source by scripts/setup-ghia.sh`,
    bundle: join(REPO_ROOT, "dist", "history", `Mailbox-Ghia-${label}.app`),
    buildCommand: [join(REPO_ROOT, "apps", "ghia", "build.sh"), "vendor", label],
  }
}

function failedEntry(target: Resolved, stage: "build" | "run", reason: string, benchSha: string, benchDirty: boolean): HistoryEntry {
  return {
    schema: 1, label: target.label, kind: target.spec.kind, status: "failed", failure: { stage, reason },
    ghiaVersion: target.ghiaVersion, gitSha: target.gitSha, zedSha: target.zedSha, commitDate: target.commitDate,
    recordedAt: new Date().toISOString(), benchSha, benchDirty,
    machine: null, load: null, capture: null, run: null, versions: null, metrics: {},
  }
}

function writeEntry(entry: HistoryEntry): void {
  mkdirSync(HISTORY_DIR, { recursive: true })
  // Number arrays stay on one line so a metric is one line of the file.
  const text = JSON.stringify(entry, null, 2).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`)
  writeFileSync(join(HISTORY_DIR, `${entry.label}.json`), text + "\n")
}

function stepFailures(records: RunRecord[]): string {
  const reasons = new Set<string>()
  for (const record of records) {
    if (record.app !== "ghia") continue
    for (const error of record.errors) reasons.add(`${error.step}: ${error.error}`)
  }
  return [...reasons].slice(0, 3).join(" | ") || "no Ghia launch produced a window"
}

/** Steps outside the lock: setup-ghia.sh takes the lock itself for the addon build, and the lock does not nest. */
async function prepare(target: Resolved): Promise<void> {
  if (target.spec.kind !== "git") return
  const result = await runLogged([join(REPO_ROOT, "scripts", "setup-ghia.sh")], {
    env: { GHIA_REV: target.gitSha!, ZED_REV: target.zedSha!, ...(GHIA_SRC ? { GHIA_SRC } : {}) },
  })
  if (result.exitCode !== 0) throw new Error(`scripts/setup-ghia.sh exited ${result.exitCode}: ${result.tail}`)
}

async function measure(target: Resolved, options: RecordOptions): Promise<void> {
  const benchSha = await git(["rev-parse", "HEAD"])
  const benchDirty = (await git(["status", "--porcelain", "--untracked-files=no", "--", "harness", "apps/ghia", "apps/electron", "data"])) !== ""

  if (target.spec.kind === "git") {
    const head = await git(["rev-parse", "HEAD"], join(REPO_ROOT, "vendor", "ghia"))
    if (head !== target.gitSha) throw new Error(`vendor/ghia is at ${head}, not ${target.gitSha}`)
  }
  const build = await runLogged(target.buildCommand)
  if (build.exitCode !== 0) {
    const entry = failedEntry(target, "build", `${target.buildCommand.slice(1).join(" ")} exited ${build.exitCode}: ${build.tail}`, benchSha, benchDirty)
    writeEntry(entry)
    console.error(`build failed; recorded as failed in history/ghia/${target.label}.json`)
    return
  }
  if (!existsSync(target.bundle)) throw new Error(`build.sh succeeded but ${target.bundle} is missing`)

  const out = resolve(REPO_ROOT, "results", `history-${target.label}-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  await runBench({
    apps: ["electron", "ghia"],
    rounds: options.rounds,
    launches: options.launches,
    capture: options.capture,
    allowMissingPermissions: false,
    out,
    bundles: { ghia: target.bundle },
    ghiaSource: target.source,
  })

  const env = readEnv(out)
  const records = readRuns(out)
  const metrics: HistoryEntry["metrics"] = {}
  for (const metric of summaryMetrics(env, records)) {
    for (const app of ["ghia", "electron"] as const) {
      const cell = metric.cells[app as AppId]
      if (!cell || cell.numbers.length === 0) continue
      const numbers = cell.numbers.map((value) => Math.round(value * 1000) / 1000)
      metrics[app] = { ...metrics[app], [metric.key]: numbers }
    }
  }
  const ghiaMetrics = metrics.ghia ?? {}
  if (!("startup.windowVisibleMs" in ghiaMetrics) && !("idle.instructionsM" in ghiaMetrics)) {
    writeEntry(failedEntry(target, "run", stepFailures(records), benchSha, benchDirty))
    copyFileSync(join(out, "report.md"), join(HISTORY_DIR, `${target.label}.report.md`))
    console.error(`${target.label} produced no Ghia measurements; recorded as failed`)
    return
  }
  if (!env.electron) throw new Error("env.json has no Electron version; the reference app did not run")

  const last = records[records.length - 1]
  const entry: HistoryEntry = {
    schema: 1,
    label: target.label,
    kind: target.spec.kind,
    status: "ok",
    ghiaVersion: target.ghiaVersion,
    gitSha: target.gitSha,
    zedSha: target.zedSha,
    commitDate: target.commitDate,
    recordedAt: env.startedAt,
    benchSha,
    benchDirty,
    machine: { chip: env.chip, macos: env.macos, displayHz: env.display.refreshHz, scrollBars: env.scrollBars, memGiB: Math.round(env.memBytes / 2 ** 30) },
    load: { before: env.loadAverage, after: last.loadAfter },
    capture: { requested: options.capture, enabled: env.capture.enabled, reason: env.capture.reason },
    run: { rounds: options.rounds, launches: options.launches },
    versions: { electron: env.electron.electron, chromium: env.electron.chromium, bun: env.bun },
    metrics,
  }
  writeEntry(entry)
  copyFileSync(join(out, "report.md"), join(HISTORY_DIR, `${target.label}.report.md`))
  console.log(`recorded history/ghia/${target.label}.json (raw results in ${out})`)
}

/** Resolves the target, prepares the checkout, then runs the rest under the machine-wide lock. */
export async function recordHistory(options: RecordOptions, argv: string[]): Promise<void> {
  const target = await resolveTarget(options.target)
  if (process.env[LOCKED_ENV] === "1") {
    await measure(target, options)
    return
  }
  await prepare(target)
  const heavy = heavyScript()
  if (!heavy) {
    await measure(target, options)
    return
  }
  console.log(`waiting for the machine-wide lock (${heavy})`)
  // The child owns the app under test and handles Ctrl-C itself.
  process.on("SIGINT", () => {})
  const child = Bun.spawn([heavy, process.execPath, join(import.meta.dir, "bench.ts"), ...argv], {
    env: { ...process.env, [LOCKED_ENV]: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`locked record of ${target.label} exited ${exitCode}`)
}

export function readEntries(): HistoryEntry[] {
  if (!existsSync(HISTORY_DIR)) return []
  return readdirSync(HISTORY_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(HISTORY_DIR, name), "utf8")) as HistoryEntry)
}

export function writeHistoryReport(): void {
  const entries = orderEntries(readEntries())
  mkdirSync(HISTORY_DIR, { recursive: true })
  writeFileSync(join(HISTORY_DIR, "README.md"), renderReadme(entries))
  const recorded = entries.filter((entry) => entry.status === "ok")
  for (const chart of CHARTS) writeFileSync(join(HISTORY_DIR, chart.file), lineChartSvg(chart, recorded))
  console.log(`wrote ${HISTORY_DIR}/README.md and ${CHARTS.length} charts from ${recorded.length} recorded and ${entries.length - recorded.length} failed entries`)
}
