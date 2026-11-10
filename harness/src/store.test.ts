import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appInfos, STAMPS } from "./fixtures/stamps"
import { versionKey, type Machine, type VersionKey } from "./keys"
import { ensureVersion, latestClean, latestComparison, listRuns, mergeRuns, quality } from "./store"
import type { AppId, Env, PhaseName, PhaseRecord, SessionRecord } from "./types"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "store-test-"))
  dirs.push(dir)
  return dir
}

const MACHINE: Machine = { chip: "chip", macos: "1", display: "1512x982@2x 120Hz", scrollBars: "WhenScrolling", capture: true }

function env(app: AppId, startedAt: string, rounds = 2): Env {
  return {
    startedAt,
    args: { apps: [app], rounds, launches: 0, capture: "auto", out: "x" },
    capture: { enabled: true, reason: "test" },
    input: { enabled: true, reason: "test" },
    probe: { screenCapture: true, postEvent: true, axTrusted: true, mainDisplay: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 }, osVersion: "1", cpu: "chip", memBytes: 2 ** 34 },
    macos: "1", scrollBars: "WhenScrolling", chip: "chip", memBytes: 2 ** 34, display: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 },
    loadAverage: [1, 1, 1], cpuCores: 10, bun: "1", apps: appInfos([app]), warnings: [],
  }
}

function session(app: AppId, round: number, load = 2, appActive = true): SessionRecord {
  const ok = { status: "ok", data: {} } as unknown as PhaseRecord
  const phases = Object.fromEntries((["idle", "scroll", "hover", "type", "navigate"] as PhaseName[]).map((name) => [name, ok])) as Record<PhaseName, PhaseRecord>
  return {
    type: "session", app, round, startedAt: "", loadBefore: [load, 1, 1], loadAfter: [load, 1, 1],
    launch: { pid: 1, t0Ns: 0, windowVisibleNs: 1, windowFrame: null, windowFrameAtVisible: null, contentReadyNs: null },
    window: { frame: { x: 0, y: 0, w: 1, h: 1 }, titlebarHeight: 0, onScreen: true, frontmost: appActive, appActive, coveredFraction: 0, coveredBy: [] },
    phases, finalSample: null, processTypes: {}, quit: null, errors: [],
  }
}

function store(dir: string, version: VersionKey, runId: string, startedAt: string, records: SessionRecord[], rounds = 2): void {
  const run = join(ensureVersion(dir, version), runId)
  mkdirSync(run)
  writeFileSync(join(run, "env.json"), JSON.stringify(env(version.app, startedAt, rounds)))
  writeFileSync(join(run, "runs.jsonl"), records.map((record) => JSON.stringify(record) + "\n").join(""))
}

const electron = versionKey(STAMPS.electron, "tree", "m", MACHINE)
const gpui = versionKey(STAMPS.gpui, "tree", "m", MACHINE)

describe("store", () => {
  test("a run is clean only when complete, quiet and focused", () => {
    expect(quality(env("electron", "t"), [session("electron", 0), session("electron", 1)]).clean).toBe(true)
    expect(quality(env("electron", "t"), [session("electron", 0)]).reasons).toEqual(["stopped early (1 of 2 sessions)"])
    expect(quality(env("electron", "t"), [session("electron", 0, 12), session("electron", 1, 12)]).reasons).toEqual(["median load 12.0"])
    expect(quality(env("electron", "t"), [session("electron", 0, 2, false), session("electron", 1, 2, false)]).reasons).toEqual(["2 sessions lost window focus"])
  })

  test("re-use picks the newest clean run of exactly this key, and never an unreusable version", () => {
    const dir = root()
    store(dir, electron, "20260101T000000Z", "2026-01-01T00:00:00Z", [session("electron", 0), session("electron", 1)])
    store(dir, electron, "20260102T000000Z", "2026-01-02T00:00:00Z", [session("electron", 0)])
    expect(latestClean(dir, electron)?.runId).toBe("20260101T000000Z")
    store(dir, electron, "20260103T000000Z", "2026-01-03T00:00:00Z", [session("electron", 0), session("electron", 1)])
    expect(latestClean(dir, electron)?.runId).toBe("20260103T000000Z")
    expect(latestClean(dir, versionKey(STAMPS.electron, "other tree", "m", MACHINE))).toBeNull()
    expect(latestClean(dir, versionKey(STAMPS.electron, null, "m", MACHINE))).toBeNull()
    expect(listRuns(dir, "electron").map((run) => run.runId)).toEqual(["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"])
  })

  test("the comparison takes each app's newest clean run and records where each came from", () => {
    const dir = root()
    store(dir, electron, "20260101T000000Z", "2026-01-01T00:00:00Z", [session("electron", 0), session("electron", 1)])
    store(dir, gpui, "20260105T000000Z", "2026-01-05T00:00:00Z", [session("gpui", 0, 3), session("gpui", 1, 3)])
    const runs = latestComparison(dir)
    expect(runs.map((run) => `${run.app} ${run.runId}`)).toEqual(["electron 20260101T000000Z", "gpui 20260105T000000Z"])
    const merged = mergeRuns(runs)
    expect(merged.env.args.apps).toEqual(["electron", "gpui"])
    expect(merged.records).toHaveLength(4)
    expect(merged.env.sources?.electron).toMatchObject({ version: "45.2.2", runId: "20260101T000000Z", load: 2 })
    expect(merged.env.sources?.gpui?.load).toBe(3)
  })
})
