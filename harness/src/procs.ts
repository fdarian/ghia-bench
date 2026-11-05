import { basename } from "node:path"
import type { QuitResult, Sample } from "./types"

export type ProcessEntry = { pid: number; command: string }

async function psList(): Promise<ProcessEntry[]> {
  const child = Bun.spawn(["ps", "-axo", "pid=,comm="], { stdout: "pipe", stderr: "pipe" })
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
  if (exitCode !== 0) throw new Error(`ps failed with exit ${exitCode}`)
  return stdout.split("\n").filter((line) => line.trim() !== "").map((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!match) throw new Error(`unparseable ps line: ${line}`)
    return { pid: Number(match[1]), command: match[2] }
  })
}

/** Any process whose executable is named Mailbox-*: the three apps and Electron's helpers. */
export async function runningMailboxProcesses(): Promise<ProcessEntry[]> {
  return (await psList()).filter((entry) => basename(entry.command).startsWith("Mailbox-"))
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true
    throw error
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
export { sleep }

/** The pids ever seen in a launched app's tree, with the name they had, so a late SIGKILL can't hit a reused pid. */
export class TreeTracker {
  readonly root: number
  private readonly names = new Map<number, string | null>()

  constructor(root: number) {
    this.root = root
    this.names.set(root, null)
  }

  observe(sample: Sample): void {
    for (const proc of sample.procs) this.names.set(proc.pid, proc.name)
  }

  get pids(): number[] {
    return [...this.names.keys()]
  }

  name(pid: number): string | null {
    return this.names.get(pid) ?? null
  }
}

async function currentName(pid: number): Promise<string | null> {
  const child = Bun.spawn(["ps", "-p", String(pid), "-o", "comm="], { stdout: "pipe", stderr: "ignore" })
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited])
  const command = stdout.trim()
  return command === "" ? null : basename(command)
}

/**
 * SIGTERM the root, give the tree up to `graceMs` to exit, then SIGKILL tracked pids that are still alive and
 * still carry the name they were sampled with. Nothing outside the tracked tree is ever signalled.
 */
export async function quitTree(tracker: TreeTracker, graceMs = 3000): Promise<QuitResult> {
  const startedAt = performance.now()
  if (isAlive(tracker.root)) process.kill(tracker.root, "SIGTERM")
  let sigtermExitMs: number | null = null
  while (performance.now() - startedAt < graceMs) {
    if (sigtermExitMs === null && !isAlive(tracker.root)) sigtermExitMs = performance.now() - startedAt
    if (tracker.pids.every((pid) => !isAlive(pid))) break
    await sleep(25)
  }
  const sigkilled: QuitResult["sigkilled"] = []
  for (const pid of tracker.pids) {
    if (!isAlive(pid)) continue
    const sampledName = tracker.name(pid)
    const nowName = await currentName(pid)
    if (nowName === null) continue
    // Every tracked process is a Mailbox-* executable; children must also match the name they were sampled with.
    const sameProcess = nowName.startsWith("Mailbox-")
      && (pid === tracker.root || (sampledName !== null && nowName.startsWith(sampledName)))
    if (!sameProcess) continue
    process.kill(pid, "SIGKILL")
    sigkilled.push({ pid, name: nowName })
  }
  if (sigkilled.length > 0) {
    const killedAt = performance.now()
    while (performance.now() - killedAt < 2000 && sigkilled.some((entry) => isAlive(entry.pid))) await sleep(25)
  }
  return { sigtermExitMs, sigkilled }
}
