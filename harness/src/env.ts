import { existsSync, lstatSync, readdirSync } from "node:fs"
import { cpus, loadavg } from "node:os"
import { join } from "node:path"
import { REPO_ROOT } from "./helper"
import { appSpec } from "./apps"
import { readStamp } from "./stamp"
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
  const build = readStamp(app, path)
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
    build,
  }
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

/** Machine fields that are unavailable are recorded as null plus a warning; the app versions come from the bundle stamps and are required. */
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

  // Not in attempt(): an unstamped bundle must stop the run, not become a warning.
  const apps: Env["apps"] = {}
  for (const app of inputs.args.apps) apps[app] = await appInfo(app)

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
    bun: Bun.version,
    apps,
    warnings,
  }
}
