import { describe, expect, test } from "bun:test"
import {
  estimateRemainingMs, ProgressFeed, SESSION_UNIT_DEFAULT_MS, SESSION_UNIT_NO_INPUT_DEFAULT_MS, STARTUP_UNIT_DEFAULT_MS,
  type ProgressOptions, type ProgressStatus,
} from "./progress"

const empty = { count: 0, totalMs: 0 }

describe("estimateRemainingMs", () => {
  test("uses the defaults before any unit of a kind has finished", () => {
    const remaining = estimateRemainingMs({
      startupLeft: 3, sessionLeft: 2, startup: empty, session: empty, startupDefaultMs: 4_000, sessionDefaultMs: 40_000,
    })
    expect(remaining).toBe(3 * 4_000 + 2 * 40_000)
  })

  test("uses the observed average per kind once a unit has finished", () => {
    const remaining = estimateRemainingMs({
      startupLeft: 2, sessionLeft: 3,
      startup: { count: 2, totalMs: 12_000 }, session: { count: 1, totalMs: 50_000 },
      startupDefaultMs: 4_000, sessionDefaultMs: 40_000,
    })
    expect(remaining).toBe(2 * 6_000 + 3 * 50_000)
  })

  test("mixes observed and default kinds", () => {
    const remaining = estimateRemainingMs({
      startupLeft: 0, sessionLeft: 4, startup: { count: 5, totalMs: 1 }, session: empty, startupDefaultMs: 4_000, sessionDefaultMs: 17_000,
    })
    expect(remaining).toBe(4 * 17_000)
  })
})

type Harness = { feed: ProgressFeed; writes: ProgressStatus[]; paths: string[]; advance: (ms: number) => void }

function harness(overrides: Partial<ProgressOptions> = {}): Harness {
  let clock = 1_000_000
  const writes: ProgressStatus[] = []
  const paths: string[] = []
  const feed = new ProgressFeed({
    path: "/tmp/status.json", pid: 4242, startupUnits: 4, sessionUnits: 2, launches: 2, rounds: 1, inputEnabled: true,
    now: () => clock,
    write: (path, text) => { paths.push(path); writes.push(JSON.parse(text)) },
    ...overrides,
  })
  return { feed, writes, paths, advance: (ms) => { clock += ms } }
}

describe("ProgressFeed", () => {
  test("begin writes a running status with the defaults ETA", () => {
    const { feed, writes, paths } = harness()
    feed.begin()
    expect(paths).toEqual(["/tmp/status.json"])
    expect(writes[0]).toEqual({
      state: "running", stage: "startup", app: null, index: 0, count: 2, phase: null, done: 0, total: 6,
      startedAt: 1_000_000, pid: 4242, finishAt: 1_000_000 + 4 * STARTUP_UNIT_DEFAULT_MS + 2 * SESSION_UNIT_DEFAULT_MS,
    })
  })

  test("the session default is shorter when input phases are disabled", () => {
    const { feed, writes } = harness({ inputEnabled: false })
    feed.begin()
    expect(writes[0].finishAt).toBe(1_000_000 + 4 * STARTUP_UNIT_DEFAULT_MS + 2 * SESSION_UNIT_NO_INPUT_DEFAULT_MS)
  })

  test("writes on unit start, phase start and unit end, once each", () => {
    const { feed, writes } = harness()
    feed.unitStart("startup", "ghia", 2)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ stage: "startup", app: "ghia", index: 3, count: 2, phase: null, done: 0 })
    feed.unitEnd()
    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ done: 1 })
    feed.unitStart("session", "gpuix", 1)
    feed.phaseStart("scroll")
    expect(writes).toHaveLength(4)
    expect(writes[3]).toMatchObject({ stage: "session", app: "gpuix", index: 2, count: 1, phase: "scroll" })
  })

  test("the ETA switches to the observed averages after a unit finishes", () => {
    const { feed, writes, advance } = harness()
    feed.unitStart("startup", "ghia", 0)
    advance(6_000)
    feed.unitEnd()
    const now = 1_000_000 + 6_000
    expect(writes[1].finishAt).toBe(now + 3 * 6_000 + 2 * SESSION_UNIT_DEFAULT_MS)
    feed.unitStart("session", "ghia", 0)
    advance(50_000)
    feed.unitEnd()
    expect(writes[3].finishAt).toBe(now + 50_000 + 3 * 6_000 + 1 * 50_000)
  })

  test("finish writes done with finishAt at the end time", () => {
    const { feed, writes, advance } = harness({ startupUnits: 1, sessionUnits: 0, launches: 1 })
    feed.unitStart("startup", "ghia", 0)
    advance(3_000)
    feed.unitEnd()
    advance(500)
    feed.finish()
    expect(writes[writes.length - 1]).toMatchObject({ state: "done", done: 1, total: 1, finishAt: 1_003_500 })
    expect(writes[writes.length - 1].error).toBeUndefined()
  })

  test("stop writes stopped with the error, mid-unit", () => {
    const { feed, writes } = harness()
    feed.unitStart("session", "gpui", 0)
    feed.stop("SIGINT")
    expect(writes[writes.length - 1]).toMatchObject({ state: "stopped", error: "SIGINT", app: "gpui" })
  })

  test("stop after the feed ended writes nothing", () => {
    const { feed, writes } = harness({ startupUnits: 0, sessionUnits: 0 })
    feed.finish()
    const count = writes.length
    feed.stop("SIGTERM")
    expect(writes).toHaveLength(count)
    expect(writes[count - 1].state).toBe("done")
  })

  test("a session-only run starts in the session stage", () => {
    const { feed, writes } = harness({ startupUnits: 0, launches: 0 })
    feed.begin()
    expect(writes[0]).toMatchObject({ stage: "session", count: 1 })
  })

  test("rejects calls out of order", () => {
    const { feed } = harness()
    expect(() => feed.unitEnd()).toThrow()
    expect(() => feed.phaseStart("idle")).toThrow()
    feed.unitStart("startup", "ghia", 0)
    expect(() => feed.unitStart("startup", "gpui", 0)).toThrow()
    expect(() => feed.finish()).toThrow()
    feed.stop("x")
    expect(() => feed.unitStart("startup", "gpui", 0)).toThrow()
  })
})
