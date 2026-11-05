import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Probe, Sample } from "./types"

export const REPO_ROOT = join(import.meta.dir, "..", "..")
export const HELPER_BIN = join(REPO_ROOT, "harness", "bin", "benchhelper")

/** tNs values are mach ns since boot; anything past 2^53 would silently lose precision through JSON.parse. */
function assertSafeIntegers(value: unknown, path: string): void {
  if (typeof value === "number") {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error(`${path} exceeds 2^53: ${value}`)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeIntegers(item, `${path}[${index}]`))
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) assertSafeIntegers((value as Record<string, unknown>)[key], `${path}.${key}`)
  }
}

export type HelperResult<T> = { data: T; stderr: string }

export async function runHelper<T>(args: string[], timeoutMs: number): Promise<HelperResult<T>> {
  if (!existsSync(HELPER_BIN)) {
    throw new Error(`${HELPER_BIN} is missing; build it with harness/helper/build.sh`)
  }
  const child = Bun.spawn([HELPER_BIN, ...args], { stdout: "pipe", stderr: "pipe", timeout: timeoutMs, killSignal: "SIGKILL" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) {
    const how = child.signalCode ? `killed by ${child.signalCode} (timeout ${timeoutMs} ms?)` : `exit ${exitCode}`
    throw new Error(`benchhelper ${args.join(" ")} failed (${how}): ${stderr.trim()}`)
  }
  const data = JSON.parse(stdout) as T
  assertSafeIntegers(data, args[0])
  return { data, stderr: stderr.trim() }
}

export async function probe(): Promise<Probe> {
  return (await runHelper<Probe>(["probe"], 15_000)).data
}

export async function sample(pid: number): Promise<Sample> {
  return (await runHelper<Sample>(["sample", "--pid", String(pid)], 15_000)).data
}
