/**
 * Build scripts call this on a finished bundle, before they code-sign it:
 *   bun harness/src/build-stamp.ts <app> <bundle.app>
 * It records what the bundle was built from in Contents/Resources/bench-build.json.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { appSpec } from "./apps"
import { exec } from "./env"
import { REPO_ROOT } from "./helper"
import { readStamp, writeStamp, type BuildStamp, type StampVersions } from "./stamp"
import { APP_IDS, type AppId } from "./types"

const GHIA_DIR = join(REPO_ROOT, "vendor", "ghia")

// Files setup-ghia.sh's own native build rewrites, which must not make the Ghia tree look edited.
// The two tsconfig.json files are type-check settings that bun compile --aot needs changed in the
// linked Ghia tree (see build-aot.sh); they change nothing that ships.
const GHIA_BUILD_OUTPUTS = new Set([
  ".setup-ghia-built", "packages/native/index.js", "packages/native/index.cjs",
  "packages/native/tsconfig.json", "packages/solid/tsconfig.json",
])

/** The git source and resolved commit of the `gpui` package in apps/gpui/Cargo.lock. */
export function gpuiSource(cargoLock: string): { git: string; commit: string } {
  const entry = cargoLock.split("[[package]]").find((block) => /^\s*name = "gpui"$/m.test(block))
  if (!entry) throw new Error("no gpui package in Cargo.lock")
  const source = /^source = "git\+([^?#"]+)(?:\?[^#"]*)?#([0-9a-f]{40})"$/m.exec(entry)
  if (!source) throw new Error("gpui in Cargo.lock is not a git dependency with a resolved commit")
  return { git: source[1], commit: source[2] }
}

/** The egoist/mygo requirement of apps/mygo/go.mod, in block or single-line form. */
export function mygoVersion(goMod: string): string {
  const requirement = /^\s*(?:require\s+)?github\.com\/egoist\/mygo\S*\s+(\S+)/m.exec(goMod)
  if (!requirement) throw new Error("go.mod has no github.com/egoist/mygo requirement")
  return requirement[1]
}

/** The version in `swift --version`'s first line, e.g. "Apple Swift version 6.4.2 (...)". */
export function swiftVersion(output: string): string {
  const match = /Swift version (\S+)/.exec(output)
  if (!match) throw new Error(`unparseable swift --version output: ${output}`)
  return match[1]
}

/** Version and commit of `nsh --version`, e.g. "nsh 0.4.0 (e626a8d)". */
export function nshVersion(output: string): { nsh: string; commit: string } {
  const match = /^nsh (\S+) \(([0-9a-f]+)\)$/.exec(output)
  if (!match) throw new Error(`unparseable nsh --version output: ${output}`)
  return { nsh: match[1], commit: match[2] }
}

/** Version and build of `xcodebuild -version`, e.g. "Xcode 27.2\nBuild version 27B52". */
export function xcodeVersion(output: string): { xcode: string; xcodeBuild: string } {
  const match = /^Xcode (\S+)\s+Build version (\S+)/.exec(output)
  if (!match) throw new Error(`unparseable xcodebuild -version output: ${output}`)
  return { xcode: match[1], xcodeBuild: match[2] }
}

export function goVersion(output: string): string {
  const match = /^go version go(\S+)/.exec(output)
  if (!match) throw new Error(`unparseable go version output: ${output}`)
  return match[1]
}

/** The paths `git status --porcelain` lists that are not in `ignore`. */
export function changedPaths(porcelain: string, ignore: Set<string>): string[] {
  return porcelain.split("\n")
    .map((line) => line.trim().replace(/^\S+\s+/, ""))
    .filter((path) => path !== "" && !ignore.has(path))
}

async function gitState(dir: string, ignore: Set<string> = new Set()): Promise<{ sha: string; dirty: boolean }> {
  const sha = await exec(["git", "-C", dir, "rev-parse", "HEAD"])
  const status = await exec(["git", "-C", dir, "status", "--porcelain"])
  return { sha, dirty: changedPaths(status, ignore).length > 0 }
}

function packageVersion(path: string): string {
  const version = (JSON.parse(readFileSync(path, "utf8")) as { version?: unknown }).version
  if (typeof version !== "string") throw new Error(`${path} has no version`)
  return version
}

/** `bun --revision` of the Bun that built the bundle: the one running this script, or $BUN_AOT's compiler. */
async function bunRevision(bun: string): Promise<string> {
  return exec([bun, "--revision"])
}

async function ghiaVersions(bun: string): Promise<StampVersions["ghia"]> {
  const ghia = await gitState(GHIA_DIR, GHIA_BUILD_OUTPUTS)
  const modules = join(REPO_ROOT, "apps", "ghia", "node_modules", "@ghia")
  return {
    native: packageVersion(join(modules, "native", "package.json")),
    solid: packageVersion(join(modules, "solid", "package.json")),
    sha: ghia.sha,
    zedSha: (await gitState(join(GHIA_DIR, "zed"))).sha,
    dirty: ghia.dirty,
    source: await exec(["git", "-C", GHIA_DIR, "remote", "get-url", "origin"]),
    bun: await bunRevision(bun),
  }
}

async function ghiaAotVersions(): Promise<StampVersions["ghia-aot"]> {
  const compiler = process.env.BUN_AOT
  if (!compiler) throw new Error("BUN_AOT is not set; apps/ghia/build-aot.sh sets it to the Bun that compiled the bundle")
  return { ...(await ghiaVersions(compiler)), aot: true }
}

async function gpuixVersions(): Promise<StampVersions["gpuix"]> {
  const modules = join(REPO_ROOT, "apps", "gpuix", "node_modules", "@gpuix")
  return {
    solid: packageVersion(join(modules, "solid", "package.json")),
    native: packageVersion(join(modules, "native", "package.json")),
    addon: packageVersion(join(modules, "native-darwin-arm64", "package.json")),
    source: "npm",
  }
}

async function gpuiVersions(): Promise<StampVersions["gpui"]> {
  const dir = join(REPO_ROOT, "apps", "gpui")
  return {
    ...gpuiSource(readFileSync(join(dir, "Cargo.lock"), "utf8")),
    rustc: await exec(["rustc", "--version"], { cwd: dir }),
  }
}

async function swiftuiVersions(): Promise<StampVersions["swiftui"]> {
  return {
    swift: swiftVersion(await exec(["swift", "--version"])),
    ...xcodeVersion(await exec(["xcodebuild", "-version"])),
    sdk: await exec(["xcrun", "--sdk", "macosx", "--show-sdk-version"]),
  }
}

async function nshVersions(): Promise<StampVersions["nsh"]> {
  return { ...nshVersion(await exec(["nsh", "--version"])), source: "homebrew" }
}

async function mygoVersions(): Promise<StampVersions["mygo"]> {
  const dir = join(REPO_ROOT, "apps", "mygo")
  return {
    go: goVersion(await exec(["go", "version"], { cwd: dir })),
    mygo: mygoVersion(readFileSync(join(dir, "go.mod"), "utf8")),
  }
}

/** The packaged executable runs as plain Node, which reports the Electron and Chromium it embeds. */
async function electronVersions(bundle: string): Promise<StampVersions["electron"]> {
  const executable = join(bundle, "Contents", "MacOS", appSpec("electron").bundle.replace(".app", ""))
  const out = await exec([executable, "-e", "console.log(JSON.stringify(process.versions))"], { env: { ELECTRON_RUN_AS_NODE: "1" } })
  const versions = JSON.parse(out) as Record<string, string>
  if (!versions.electron || !versions.chrome) throw new Error(`${executable} did not report electron and chrome versions`)
  return { electron: versions.electron, chromium: versions.chrome }
}

export async function stampBundle(app: AppId, bundle: string): Promise<BuildStamp> {
  const common = { builtAt: new Date().toISOString(), bench: await gitState(REPO_ROOT) }
  switch (app) {
    case "ghia": return { app, ...common, versions: await ghiaVersions(process.execPath) }
    case "ghia-aot": return { app, ...common, versions: await ghiaAotVersions() }
    case "gpuix": return { app, ...common, versions: await gpuixVersions() }
    case "gpui": return { app, ...common, versions: await gpuiVersions() }
    case "swiftui": return { app, ...common, versions: await swiftuiVersions() }
    case "nsh": return { app, ...common, versions: await nshVersions() }
    case "mygo": return { app, ...common, versions: await mygoVersions() }
    case "electron": return { app, ...common, versions: await electronVersions(bundle) }
  }
}

if (import.meta.main) {
  const app = Bun.argv[2] as AppId
  const bundle = Bun.argv[3]
  if (!APP_IDS.includes(app) || !bundle || Bun.argv.length !== 4) {
    console.error(`usage: bun harness/src/build-stamp.ts <${APP_IDS.join("|")}> <bundle.app>`)
    process.exit(2)
  }
  try {
    writeStamp(bundle, await stampBundle(app, bundle))
    readStamp(app, bundle)
  } catch (error) {
    console.error(`build-stamp ${app}: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
