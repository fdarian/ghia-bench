import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs"
import { cpus, loadavg } from "node:os"
import { join } from "node:path"
import { REPO_ROOT } from "./helper"
import { appSpec } from "./apps"
import type { AppId, AppInfo, Env, Probe } from "./types"
import { APP_IDS } from "./types"

export function bundlePath(app: AppId): string {
  return join(REPO_ROOT, "dist", appSpec(app).bundle)
}

export function existingApps(): AppId[] {
  return APP_IDS.filter((app) => existsSync(bundlePath(app)))
}

export async function exec(
  command: string[], options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited ${exitCode}: ${stderr.trim()}`)
  return stdout.trim()
}

export function currentLoadAverage(): number[] {
  return loadavg()
}

function walkFiles(dir: string, visit: (path: string, bytes: number, mode: number) => void): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) walkFiles(path, visit)
    else if (stat.isFile()) visit(path, stat.size, stat.mode)
  }
}

export async function appInfo(app: AppId): Promise<AppInfo> {
  const path = bundlePath(app)
  const executableName = await exec(["plutil", "-extract", "CFBundleExecutable", "raw", "-o", "-", join(path, "Contents", "Info.plist")])
  const executable = join(path, "Contents", "MacOS", executableName)
  const du = await exec(["du", "-sk", path])
  const bundleKb = Number(du.split(/\s+/)[0])
  if (!Number.isFinite(bundleKb)) throw new Error(`unparseable du output: ${du}`)
  const large: { path: string; bytes: number }[] = []
  walkFiles(path, (file, bytes, mode) => {
    const isCode = (mode & 0o111) !== 0 || file.endsWith(".node") || file.endsWith(".dylib")
    if (isCode && bytes >= 1_000_000) large.push({ path: file.slice(path.length + 1), bytes })
  })
  large.sort((a, b) => b.bytes - a.bytes)
  return {
    path,
    bundleKb,
    executable: executableName,
    executableBytes: lstatSync(executable).size,
    largeExecutables: large.slice(0, 8),
  }
}

async function electronVersions(): Promise<{ electron: string; chromium: string }> {
  const executable = join(bundlePath("electron"), "Contents", "MacOS", appSpec("electron").bundle.replace(".app", ""))
  const out = await exec([executable, "-e", "console.log(JSON.stringify(process.versions))"], {
    env: { ELECTRON_RUN_AS_NODE: "1" },
  })
  const versions = JSON.parse(out) as Record<string, string>
  return { electron: versions.electron, chromium: versions.chrome }
}

/** `go` directive and the egoist/mygo requirement of apps/mygo/go.mod. */
export function mygoModule(goMod: string): { goVersion: string | null; module: string | null } {
  const goVersion = /^go\s+(\S+)/m.exec(goMod)
  const module = /^\s*(?:require\s+)?(github\.com\/egoist\/mygo\S*)\s+(\S+)/m.exec(goMod)
  return { goVersion: goVersion ? goVersion[1] : null, module: module ? `${module[1]} ${module[2]}` : null }
}

export type EnvInputs = {
  startedAt: string
  args: Env["args"]
  probe: Probe
  capture: Env["capture"]
  input: Env["input"]
}

/** `defaults read` exits 1 when the key is absent, which macOS treats as Automatic. */
async function showScrollBars(): Promise<string> {
  const child = Bun.spawn(["defaults", "read", "-g", "AppleShowScrollBars"], { stdout: "pipe", stderr: "pipe" })
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
  return exitCode === 0 ? stdout.trim() : "unset"
}

/** Anything unavailable is recorded as null plus a warning; a benchmark run shouldn't die on a missing version string. */
export async function collectEnv(inputs: EnvInputs): Promise<Env> {
  const warnings: string[] = []
  async function attempt<T>(label: string, work: () => Promise<T>): Promise<T | null> {
    try {
      return await work()
    } catch (error) {
      warnings.push(`${label}: ${(error as Error).message}`)
      return null
    }
  }

  const productVersion = await attempt("sw_vers", () => exec(["sw_vers", "-productVersion"]))
  const buildVersion = await attempt("sw_vers", () => exec(["sw_vers", "-buildVersion"]))
  const scrollBars = await attempt("AppleShowScrollBars", showScrollBars)
  const ghiaDir = join(REPO_ROOT, "vendor", "ghia")
  const ghiaSha = await attempt("vendor/ghia SHA", () => exec(["git", "-C", ghiaDir, "rev-parse", "HEAD"]))
  const zedSha = await attempt("vendor/ghia/zed SHA", () => exec(["git", "-C", join(ghiaDir, "zed"), "rev-parse", "HEAD"]))
  const electron = inputs.args.apps.includes("electron") ? await attempt("Electron version", electronVersions) : null
  const rustc = await attempt("rustc --version", () => exec(["rustc", "--version"], { cwd: join(REPO_ROOT, "apps", "gpui") }))

  const mygo = inputs.args.apps.includes("mygo")
    ? await attempt("apps/mygo/go.mod", async () => mygoModule(readFileSync(join(REPO_ROOT, "apps", "mygo", "go.mod"), "utf8")))
    : null
  const swift = inputs.args.apps.includes("swiftui")
    ? {
      swift: await attempt("swift --version", async () => (await exec(["swift", "--version"])).split("\n")[0]),
      xcode: await attempt("xcodebuild -version", async () => (await exec(["xcodebuild", "-version"])).split("\n").join(", ")),
    }
    : null

  const apps: Env["apps"] = {}
  for (const app of inputs.args.apps) {
    const info = await attempt(`${app} bundle info`, () => appInfo(app))
    if (info) apps[app] = info
  }

  return {
    startedAt: inputs.startedAt,
    args: inputs.args,
    capture: inputs.capture,
    input: inputs.input,
    probe: inputs.probe,
    macos: productVersion && buildVersion ? `${productVersion} (${buildVersion})` : inputs.probe.osVersion,
    scrollBars,
    chip: inputs.probe.cpu,
    memBytes: inputs.probe.memBytes,
    display: inputs.probe.mainDisplay,
    loadAverage: currentLoadAverage(),
    cpuCores: cpus().length,
    ghia: { sha: ghiaSha, zedSha },
    electron,
    bun: Bun.version,
    rustc,
    mygo,
    swift,
    apps,
    warnings,
  }
}
