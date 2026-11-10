import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec } from "./env"
import { STAMPS } from "./fixtures/stamps"
import { appCodeTree, machineOf, measureHash, versionDirName, versionKey, type Machine } from "./keys"
import type { Env } from "./types"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "keys-test-"))
  dirs.push(dir)
  const git = (...args: string[]) => exec(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args])
  await git("init", "-q")
  mkdirSync(join(dir, "apps", "electron"), { recursive: true })
  mkdirSync(join(dir, "data"), { recursive: true })
  writeFileSync(join(dir, "apps", "electron", "main.ts"), "one\n")
  writeFileSync(join(dir, "apps", "electron", ".gitignore"), "out/\n")
  writeFileSync(join(dir, "data", "generate.ts"), "seed\n")
  await git("add", "-A")
  await git("commit", "-q", "-m", "c1")
  return dir
}

const MACHINE: Machine = { chip: "M1 Pro", macos: "27.0.1 (26A434)", display: "1920x1080@1x 75Hz", scrollBars: "WhenScrolling", capture: false }

describe("keys", () => {
  test("a clean working tree has the committed tree; edits, new files and lockfile changes move it, ignored files do not", async () => {
    const dir = await repo()
    const committed = await appCodeTree(dir, "electron", "HEAD")
    expect(await appCodeTree(dir, "electron")).toBe(committed)
    mkdirSync(join(dir, "apps", "electron", "out"))
    writeFileSync(join(dir, "apps", "electron", "out", "bundle.js"), "built\n")
    expect(await appCodeTree(dir, "electron")).toBe(committed)
    writeFileSync(join(dir, "apps", "electron", "pnpm-lock.yaml"), "lock\n")
    const withLock = await appCodeTree(dir, "electron")
    expect(withLock).not.toBe(committed)
    writeFileSync(join(dir, "apps", "electron", "main.ts"), "two\n")
    expect(await appCodeTree(dir, "electron")).not.toBe(withLock)
  })

  test("the measurement hash follows data/generate.ts and is the same at HEAD and in a clean tree", async () => {
    const dir = await repo()
    const before = await measureHash(dir)
    expect(await measureHash(dir, "HEAD")).toBe(before)
    writeFileSync(join(dir, "data", "generate.ts"), "seed 2\n")
    expect(await measureHash(dir)).not.toBe(before)
  })

  test("the same versions, code, measurement and machine give the same key; any one of them changes it", () => {
    const base = versionKey(STAMPS.electron, "tree1", "m1", MACHINE)
    expect(base.unreusable).toBeNull()
    expect(base.label).toBe("45.2.2")
    expect(versionKey({ ...STAMPS.electron, builtAt: "later", bench: { sha: "other", dirty: true } }, "tree1", "m1", MACHINE).key).toBe(base.key)
    expect(versionKey(STAMPS.electron, "tree2", "m1", MACHINE).key).not.toBe(base.key)
    expect(versionKey(STAMPS.electron, "tree1", "m2", MACHINE).key).not.toBe(base.key)
    expect(versionKey(STAMPS.electron, "tree1", "m1", { ...MACHINE, display: "1512x982@2x 120Hz" }).key).not.toBe(base.key)
    const newer = { ...STAMPS.electron, versions: { ...STAMPS.electron.versions, electron: "46.0.0" } }
    expect(versionKey(newer, "tree1", "m1", MACHINE).key).not.toBe(base.key)
    expect(versionDirName(base)).toBe(`45.2.2-${base.key}`)
  })

  test("a dirty Ghia build or an unknown app tree is stored but never re-usable", () => {
    const dirty = { ...STAMPS.ghia, versions: { ...STAMPS.ghia.versions, dirty: true } }
    const version = versionKey(dirty, "tree", "m", MACHINE)
    expect(version.unreusable).toMatch(/uncommitted/)
    expect(version.label).toMatch(/-dirty$/)
    expect(version.key).not.toBe(versionKey(STAMPS.ghia, "tree", "m", MACHINE).key)
    expect(versionKey(STAMPS.gpui, null, "m", MACHINE).unreusable).toMatch(/app code/)
  })

  test("the machine part is the chip, macOS, display, scroll bars and capture", () => {
    const env = {
      chip: "M1 Pro", macos: "27.0.1 (26A434)", scrollBars: "WhenScrolling", capture: { enabled: false, reason: "" },
      display: { id: 2, widthPt: 1920, heightPt: 1080, scale: 1, refreshHz: 75 },
    } as Pick<Env, "chip" | "macos" | "display" | "scrollBars" | "capture">
    expect(machineOf(env)).toEqual(MACHINE)
  })
})
