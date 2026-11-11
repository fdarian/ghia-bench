/**
 * What a stored result depends on, as one key per app version. Two measurements share a key only when the bundle was built
 * from the same upstream versions and the same app code, measured by the same harness code, on the same machine setup.
 * A run re-uses the stored result of an unchanged key instead of measuring the app again.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec } from "./env"
import type { BuildStamp } from "./stamp"
import type { AppId, Env } from "./types"

/** The code the numbers depend on besides the app itself: the measuring helper, process sampling and the message data. */
export const MEASURE_PATHS = [
  "harness/helper/Package.swift",
  "harness/helper/Sources",
  "harness/src/procs.ts",
  "harness/src/helper.ts",
  "data/generate.ts",
] as const

/**
 * Bump this when run.ts changes how a session or startup launch is driven (waits, idle seconds, phase order, what is sampled):
 * every stored result then stops being re-used. run.ts is not hashed, because most of its edits (app lists, folders, the
 * re-use plan itself) don't change a number.
 */
export const SESSION_REVISION = 1

/** ghia-aot is the Ghia app's code built another way, so both read apps/ghia. */
export function appCodePath(app: AppId): string {
  return app === "ghia-aot" ? "apps/ghia" : `apps/${app}`
}

/**
 * Git object ids of `paths`: at `rev` when given, else of the working tree as it is now, uncommitted and untracked
 * (not ignored) files included. A clean working tree gives the same ids as HEAD. A missing path is "absent".
 */
export async function pathIds(repo: string, paths: readonly string[], rev?: string): Promise<Record<string, string>> {
  let tree = rev
  let scratch: string | null = null
  try {
    if (tree === undefined) {
      scratch = mkdtempSync(join(tmpdir(), "bench-key-"))
      const env = { GIT_INDEX_FILE: join(scratch, "index") }
      await exec(["git", "-C", repo, "read-tree", "HEAD"], { env })
      // `git add` rejects a pathspec that matches nothing: pass only paths on disk or in HEAD (a deleted tracked path).
      const known: string[] = []
      for (const path of paths) {
        if (existsSync(join(repo, path))) known.push(path)
        else if (await exec(["git", "-C", repo, "rev-parse", "--verify", "-q", `HEAD:${path}`]).then(() => true, () => false)) known.push(path)
      }
      if (known.length > 0) await exec(["git", "-C", repo, "add", "-A", "--", ...known], { env })
      tree = await exec(["git", "-C", repo, "write-tree"], { env })
    }
    const ids: Record<string, string> = {}
    for (const path of paths) {
      try {
        ids[path] = await exec(["git", "-C", repo, "rev-parse", `${tree}:${path}`])
      } catch {
        ids[path] = "absent"
      }
    }
    return ids
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/** One hash over the measurement code (MEASURE_PATHS) at `rev`, or in the working tree. */
export async function measureHash(repo: string, rev?: string): Promise<string> {
  const ids = await pathIds(repo, MEASURE_PATHS, rev)
  const lines = MEASURE_PATHS.map((path) => `${path} ${ids[path]}`)
  return sha256([...lines, `session revision ${SESSION_REVISION}`].join("\n")).slice(0, 16)
}

/** The git tree id of apps/<app> at `rev`, or in the working tree. */
export async function appCodeTree(repo: string, app: AppId, rev?: string): Promise<string> {
  return (await pathIds(repo, [appCodePath(app)], rev))[appCodePath(app)]
}

/** The machine setup that changes what an app does: two results compare only on the same one. */
export type Machine = { chip: string; macos: string; display: string; scrollBars: string | null; capture: boolean }

export function machineOf(env: Pick<Env, "chip" | "macos" | "display" | "scrollBars" | "capture">): Machine {
  const d = env.display
  return {
    chip: env.chip,
    macos: env.macos,
    display: `${d.widthPt}x${d.heightPt}@${d.scale}x ${d.refreshHz}Hz`,
    scrollBars: env.scrollBars,
    capture: env.capture.enabled,
  }
}

/** A key part that can't be known (a dirty build, an unstamped bundle) makes the version unique and never re-used. */
export type VersionKey = {
  app: AppId
  /** Short human name of the upstream version, e.g. "45.2.2" or "4ea39d9c". */
  label: string
  versions: Record<string, unknown>
  /** The git tree of apps/<app> the bundle was built from; null when that is unknown (built from a dirty tree before stamps had it). */
  code: string | null
  measure: string | null
  machine: Machine
  /** Why this version can't be re-used, or null when it can. */
  unreusable: string | null
  /** 12 hex chars over everything above except label. */
  key: string
}

/** The upstream versions that matter, with what is only bookkeeping (dirty flags, source urls) dropped. */
export function upstreamOf(stamp: BuildStamp): { label: string; versions: Record<string, unknown> } {
  switch (stamp.app) {
    case "ghia": {
      const v = stamp.versions
      return { label: v.sha.slice(0, 8), versions: { native: v.native, solid: v.solid, sha: v.sha, zedSha: v.zedSha, bun: v.bun } }
    }
    case "ghia-aot": {
      const v = stamp.versions
      return { label: v.sha.slice(0, 8), versions: { native: v.native, solid: v.solid, sha: v.sha, zedSha: v.zedSha, bun: v.bun, aot: v.aot } }
    }
    case "gpuix": {
      const v = stamp.versions
      return { label: v.solid, versions: { solid: v.solid, native: v.native, addon: v.addon } }
    }
    case "gpui": {
      const v = stamp.versions
      return { label: v.commit.slice(0, 8), versions: { commit: v.commit, rustc: v.rustc } }
    }
    case "swiftui": {
      const v = stamp.versions
      return { label: `swift${v.swift}`, versions: { swift: v.swift, xcodeBuild: v.xcodeBuild, sdk: v.sdk } }
    }
    case "nsh": {
      const v = stamp.versions
      return { label: v.nsh, versions: { nsh: v.nsh, commit: v.commit } }
    }
    case "mygo": {
      const v = stamp.versions
      const pseudo = /-([0-9a-f]{12})$/.exec(v.mygo)
      return { label: pseudo ? pseudo[1].slice(0, 8) : v.mygo, versions: { go: v.go, mygo: v.mygo } }
    }
    case "electron": {
      const v = stamp.versions
      return { label: v.electron, versions: { electron: v.electron, chromium: v.chromium } }
    }
  }
}

/** Which reason, if any, makes a stamped build impossible to identify by its code. */
function dirtyReason(stamp: BuildStamp): string | null {
  if ((stamp.app === "ghia" || stamp.app === "ghia-aot") && stamp.versions.dirty) return "the Ghia tree had uncommitted changes when it was built"
  return null
}

/**
 * The app code tree a bundle was built from: the stamp's own `code` when the build recorded it, else the tree of apps/<app> at
 * the stamp's bench commit when that build was clean, else null.
 */
export async function stampCode(repo: string, stamp: BuildStamp): Promise<string | null> {
  if (stamp.code) return stamp.code.tree
  if (stamp.bench.dirty) return null
  return appCodeTree(repo, stamp.app, stamp.bench.sha)
}

export function versionKey(stamp: BuildStamp, code: string | null, measure: string | null, machine: Machine): VersionKey {
  const { label, versions } = upstreamOf(stamp)
  const reasons = [
    dirtyReason(stamp),
    code === null ? "the app code it was built from is unknown (bench tree was dirty and the stamp predates code hashes)" : null,
    measure === null ? "the harness code it was measured with is unknown" : null,
  ].filter((reason): reason is string => reason !== null)
  const unreusable = reasons.length > 0 ? reasons.join("; ") : null
  const material = JSON.stringify({ app: stamp.app, versions, code, measure, machine })
  // Unreusable builds of the same upstream version still share a folder, so their runs read as one version's history,
  // under a key that no reusable build can produce.
  const key = sha256(unreusable ? `${material} unreusable` : material).slice(0, 12)
  const shown = dirtyReason(stamp) ? `${label}-dirty` : label
  return { app: stamp.app, label: shown, versions, code, measure, machine, unreusable, key }
}

/** The folder name of a version under results/<app>/. */
export function versionDirName(version: VersionKey): string {
  const label = version.label.replace(/[^A-Za-z0-9._-]/g, "_")
  return `${label}-${version.key}`
}
