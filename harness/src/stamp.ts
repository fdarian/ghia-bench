import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AppId, Env } from "./types"

export const STAMP_FILE = "bench-build.json"

export type StampVersions = {
  ghia: { native: string; solid: string; sha: string; zedSha: string; dirty: boolean; source: string }
  gpuix: { solid: string; native: string; addon: string; source: string }
  gpui: { git: string; commit: string; rustc: string }
  swiftui: { swift: string; xcode: string; xcodeBuild: string; sdk: string }
  nsh: { nsh: string; commit: string; source: string }
  mygo: { go: string; mygo: string }
  electron: { electron: string; chromium: string }
}

/** What a bundle was built from, written into it by its build script and read back by the harness at run time. */
export type BuildStamp<A extends AppId = AppId> = {
  [App in A]: {
    app: App
    builtAt: string
    bench: { sha: string; dirty: boolean }
    versions: StampVersions[App]
    /** The git tree of apps/<app> as built, uncommitted files included. Absent in stamps written before 2026-11-10. */
    code?: { tree: string }
  }
}[A]

const FIELD_TYPES: { [A in AppId]: Record<keyof StampVersions[A], "string" | "boolean"> } = {
  ghia: { native: "string", solid: "string", sha: "string", zedSha: "string", dirty: "boolean", source: "string" },
  gpuix: { solid: "string", native: "string", addon: "string", source: "string" },
  gpui: { git: "string", commit: "string", rustc: "string" },
  swiftui: { swift: "string", xcode: "string", xcodeBuild: "string", sdk: "string" },
  nsh: { nsh: "string", commit: "string", source: "string" },
  mygo: { go: "string", mygo: "string" },
  electron: { electron: "string", chromium: "string" },
}

export function stampPath(bundle: string): string {
  return join(bundle, "Contents", "Resources", STAMP_FILE)
}

/** Must run before the bundle is code-signed: Resources are part of the signature. */
export function writeStamp(bundle: string, stamp: BuildStamp): void {
  writeFileSync(stampPath(bundle), JSON.stringify(stamp, null, 2) + "\n")
}

function invalid(app: AppId, bundle: string, why: string): Error {
  return new Error(`${bundle} has ${why}; rebuild ${app} with apps/${app}/build.sh`)
}

export function readStamp<A extends AppId>(app: A, bundle: string): BuildStamp<A> {
  const path = stampPath(bundle)
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    throw invalid(app, bundle, `no ${STAMP_FILE} stamp`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw invalid(app, bundle, `an unreadable ${STAMP_FILE} stamp`)
  }
  const stamp = value as Record<string, unknown> | null
  const bench = stamp?.bench as Record<string, unknown> | undefined
  const versions = stamp?.versions as Record<string, unknown> | undefined
  if (stamp === null || typeof stamp !== "object" || stamp.app !== app) throw invalid(app, bundle, `a ${STAMP_FILE} stamp that is not ${app}'s`)
  if (typeof stamp.builtAt !== "string" || typeof bench?.sha !== "string" || typeof bench.dirty !== "boolean" || versions === undefined || versions === null) {
    throw invalid(app, bundle, `an incomplete ${STAMP_FILE} stamp`)
  }
  const code = stamp.code as Record<string, unknown> | undefined
  if (code !== undefined && (code === null || typeof code.tree !== "string")) throw invalid(app, bundle, `a ${STAMP_FILE} stamp with an invalid code`)
  const fields = FIELD_TYPES[app] as Record<string, string>
  for (const name of Object.keys(fields)) {
    if (typeof versions[name] !== fields[name]) throw invalid(app, bundle, `a ${STAMP_FILE} stamp with no valid ${name}`)
  }
  return value as BuildStamp<A>
}

/** The stamp the run recorded for an app that was in it. */
export function buildOf<A extends AppId>(env: Env, app: A): BuildStamp<A> {
  const info = env.apps[app]
  if (!info) throw new Error(`env.json has no bundle info for ${app}`)
  return info.build as BuildStamp<A>
}
