/**
 * Results are stored per app and per version, not per run:
 *
 *   results/<app>/<version>-<key>/version.json        what the key is made of (VersionKey)
 *   results/<app>/<version>-<key>/<run id>/env.json   the run's environment, with only this app's bundle
 *   results/<app>/<version>-<key>/<run id>/runs.jsonl this app's launch and session records
 *
 * A bench sitting that measures several apps writes one run folder under each of them, with the same run id.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { percentile } from "./analysis"
import { versionDirName, type VersionKey } from "./keys"
import { readEnv, readRuns } from "./report"
import type { AppId, Env, RunRecord, SessionRecord } from "./types"
import { APP_IDS } from "./types"

export const VERSION_FILE = "version.json"

export type StoredRun = {
  app: AppId
  version: VersionKey
  /** results/<app>/<version dir> */
  versionDir: string
  runId: string
  dir: string
  env: Env
}

export function versionPath(root: string, version: VersionKey): string {
  return join(root, version.app, versionDirName(version))
}

/** Creates results/<app>/<version>/ with its version.json if it is new; returns the folder. */
export function ensureVersion(root: string, version: VersionKey): string {
  const dir = versionPath(root, version)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, VERSION_FILE)
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(version, null, 2) + "\n")
  return dir
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => !name.startsWith(".") && statSync(join(dir, name)).isDirectory())
}

/** Every stored run of `app`, oldest first. */
export function listRuns(root: string, app: AppId): StoredRun[] {
  const runs: StoredRun[] = []
  for (const name of subdirs(join(root, app))) {
    const versionDir = join(root, app, name)
    const file = join(versionDir, VERSION_FILE)
    if (!existsSync(file)) continue
    const version = JSON.parse(readFileSync(file, "utf8")) as VersionKey
    for (const runId of subdirs(versionDir)) {
      const dir = join(versionDir, runId)
      if (!existsSync(join(dir, "env.json")) || !existsSync(join(dir, "runs.jsonl"))) continue
      runs.push({ app, version, versionDir, runId, dir, env: readEnv(dir) })
    }
  }
  return runs.sort((a, b) => a.env.startedAt.localeCompare(b.env.startedAt))
}

export type Quality = {
  clean: boolean
  /** Why the run is not clean; empty when it is. */
  reasons: string[]
  sessions: number
  launches: number
  /** Median 1-minute load average before each launch and session. */
  load: number | null
  focusLost: number
}

/** Mirrors the board's Noisy flag: a run that is Noisy is never re-used. */
export const NOISY_LOAD = 10

export function quality(env: Env, records: RunRecord[]): Quality {
  const sessions = records.filter((record): record is SessionRecord => record.type === "session")
  const launches = records.filter((record) => record.type === "launch")
  const loads = records.map((record) => record.loadBefore[0])
  const load = loads.length > 0 ? percentile(loads, 50) : null
  const focusLost = sessions.filter((session) => session.window !== null && !session.window.appActive).length
  const failed = sessions.filter((session) =>
    session.launch === null || Object.values(session.phases).some((phase) => phase.status !== "ok")).length
  const reasons: string[] = []
  if (!env.input.enabled) reasons.push("input phases were skipped")
  if (sessions.length < env.args.rounds) reasons.push(`stopped early (${sessions.length} of ${env.args.rounds} sessions)`)
  if (launches.length < env.args.launches) reasons.push(`stopped early (${launches.length} of ${env.args.launches} launches)`)
  if (failed > 1) reasons.push(`${failed} sessions had a failed launch or phase`)
  if (load !== null && load >= NOISY_LOAD) reasons.push(`median load ${load.toFixed(1)}`)
  if (focusLost > 1) reasons.push(`${focusLost} sessions lost window focus`)
  if (sessions.length === 0) reasons.push("no sessions")
  return { clean: reasons.length === 0, reasons, sessions: sessions.length, launches: launches.length, load, focusLost }
}

export function runQuality(run: StoredRun): Quality {
  return quality(run.env, readRuns(run.dir))
}

/** The newest clean run stored under exactly this version key, or null. */
export function latestClean(root: string, version: VersionKey): StoredRun | null {
  if (version.unreusable) return null
  const runs = listRuns(root, version.app).filter((run) => run.version.key === version.key && !run.version.unreusable)
  for (const run of runs.reverse()) if (runQuality(run).clean) return run
  return null
}

/**
 * The comparison: for each app, its newest clean run on the machine setup of the newest run overall.
 * `prefer` pins an app to a given run (the runs a sitting just measured or re-used).
 */
export function latestComparison(root: string, prefer: Partial<Record<AppId, StoredRun>> = {}): StoredRun[] {
  const all = APP_IDS.flatMap((app) => listRuns(root, app))
  if (all.length === 0) return []
  const newest = all.reduce((a, b) => (a.env.startedAt >= b.env.startedAt ? a : b))
  const machine = JSON.stringify(newest.version.machine)
  const picked: StoredRun[] = []
  for (const app of APP_IDS) {
    if (prefer[app]) {
      picked.push(prefer[app]!)
      continue
    }
    const candidates = all.filter((run) => run.app === app && JSON.stringify(run.version.machine) === machine).reverse()
    const clean = candidates.find((run) => runQuality(run).clean)
    if (clean) picked.push(clean)
  }
  return picked
}

/** One env and one record list over runs of different apps, for the report. Machine fields come from the newest run. */
export function mergeRuns(runs: StoredRun[]): { env: Env; records: RunRecord[] } {
  if (runs.length === 0) throw new Error("no stored runs to report on")
  const newest = runs.reduce((a, b) => (a.env.startedAt >= b.env.startedAt ? a : b))
  const apps = APP_IDS.filter((app) => runs.some((run) => run.app === app))
  const env: Env = {
    ...newest.env,
    args: { ...newest.env.args, apps },
    apps: Object.fromEntries(runs.map((run) => [run.app, run.env.apps[run.app]])),
    sources: Object.fromEntries(runs.map((run) => [run.app, sourceOf(run)])),
  }
  return { env, records: runs.flatMap((run) => readRuns(run.dir).filter((record) => record.app === run.app)) }
}

export type Source = { version: string; key: string; runId: string; startedAt: string; load: number | null; reused?: boolean }

export function sourceOf(run: StoredRun, reused?: boolean): Source {
  const q = runQuality(run)
  return {
    version: run.version.label, key: run.version.key, runId: run.runId, startedAt: run.env.startedAt, load: q.load,
    ...(reused === undefined ? {} : { reused }),
  }
}
