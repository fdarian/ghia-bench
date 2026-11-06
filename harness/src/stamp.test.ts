import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { STAMPS } from "./fixtures/stamps"
import { readStamp, stampPath, writeStamp } from "./stamp"
import { APP_IDS } from "./types"

const dirs: string[] = []
function bundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamp-test-"))
  dirs.push(dir)
  mkdirSync(join(dir, "Contents", "Resources"), { recursive: true })
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("stamp", () => {
  test("what a build script writes is what the harness reads, for every app", () => {
    for (const app of APP_IDS) {
      const dir = bundle()
      writeStamp(dir, STAMPS[app])
      expect(readStamp(app, dir)).toEqual(STAMPS[app])
    }
  })

  test("a bundle with no stamp is an error that says which app to rebuild", () => {
    expect(() => readStamp("gpui", bundle())).toThrow(/no bench-build\.json stamp; rebuild gpui with apps\/gpui\/build\.sh/)
  })

  test("an unreadable stamp is an error", () => {
    const dir = bundle()
    writeFileSync(stampPath(dir), "{ not json")
    expect(() => readStamp("mygo", dir)).toThrow(/unreadable.*rebuild mygo/)
  })

  test("a stamp of another app, or missing a field, is an error", () => {
    const dir = bundle()
    writeStamp(dir, STAMPS.gpui)
    expect(() => readStamp("swiftui", dir)).toThrow(/not swiftui's.*rebuild swiftui/)
    writeFileSync(stampPath(dir), JSON.stringify({ ...STAMPS.gpui, versions: { git: "g", commit: "c" } }))
    expect(() => readStamp("gpui", dir)).toThrow(/no valid rustc/)
    writeFileSync(stampPath(dir), JSON.stringify({ ...STAMPS.ghia, versions: { ...STAMPS.ghia.versions, dirty: "no" } }))
    expect(() => readStamp("ghia", dir)).toThrow(/no valid dirty/)
    writeFileSync(stampPath(dir), JSON.stringify({ app: "ghia" }))
    expect(() => readStamp("ghia", dir)).toThrow(/incomplete/)
  })
})
