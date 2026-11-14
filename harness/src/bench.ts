import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { check } from "./check"
import { existingApps } from "./env"
import { REPO_ROOT } from "./helper"
import { DEFAULT_PUBLISHED, DEFAULT_README, publish } from "./publish"
import { readEnv, writeReport } from "./report"
import { collectEnv } from "./env"
import { probe } from "./helper"
import { harnessState, planRun, renderPlan, resolveCapture, resolveInput, runBench, writeComparison, type CaptureMode } from "./run"
import { APP_IDS, type AppId } from "./types"

const USAGE = `usage:
  bun harness/src/bench.ts check
  bun harness/src/bench.ts plan [--apps ...] [--fresh ghia,gpui|all] [--capture auto|on|off]
  bun harness/src/bench.ts run [--apps electron,ghia,ghia-aot,ghia-react,ghia-solid-stack,gpuix,gpui,swiftui,nsh,mygo] [--fresh ghia,gpui|all] [--tag name] [--rounds 5] [--launches 10] [--capture auto|on|off] [--allow-missing-permissions] [--status on|off] [--results results] [--out <dir>]
      Measures only apps with no clean stored run of their version (or in --fresh) into results/<app>/<version>-<key>/<run id>/,
      then writes results/comparison.md. --out <dir> is experiment mode: measure every app into <dir> and leave the store alone.
  bun harness/src/bench.ts report [<run dir>] [--include-invalid]   (no dir: results/comparison.md, the newest clean run of every app)
  bun harness/src/bench.ts publish <results dir> [--readme README.md]`

function positiveInt(name: string, text: string, min: number): number {
  const value = Number(text)
  if (!Number.isInteger(value) || value < min) throw new Error(`--${name} must be an integer >= ${min}, got ${text}`)
  return value
}

function parseApps(text: string | undefined): AppId[] {
  const available = existingApps()
  if (text === undefined) {
    if (available.length === 0) throw new Error("no Mailbox-*.app in dist/; run scripts/build-all.sh")
    return available
  }
  const requested = text.split(",").map((name) => name.trim())
  for (const name of requested) {
    if (!APP_IDS.includes(name as AppId)) throw new Error(`unknown app ${name}; expected ${APP_IDS.join(", ")}`)
    if (!available.includes(name as AppId)) throw new Error(`dist/ has no bundle for ${name}`)
  }
  return requested as AppId[]
}

function parseFresh(text: string | undefined, apps: AppId[]): AppId[] {
  if (text === undefined) return []
  if (text === "all") return apps
  const fresh = text.split(",").map((name) => name.trim())
  for (const name of fresh) if (!APP_IDS.includes(name as AppId)) throw new Error(`unknown app ${name} in --fresh`)
  return fresh as AppId[]
}

const RESULTS = resolve(REPO_ROOT, "results")

async function main(): Promise<void> {
  const command = Bun.argv[2]
  const rest = Bun.argv.slice(3)
  switch (command) {
    case "check":
      await check()
      return
    case "plan": {
      const parsed = parseArgs({
        args: rest,
        options: { apps: { type: "string" }, fresh: { type: "string" }, capture: { type: "string", default: "auto" }, results: { type: "string" } },
      })
      const capture = parsed.values.capture
      if (capture !== "auto" && capture !== "on" && capture !== "off") throw new Error(`--capture must be auto, on or off, got ${capture}`)
      const apps = parseApps(parsed.values.apps)
      const probeResult = await probe()
      const env = await collectEnv({
        startedAt: new Date().toISOString(),
        args: { apps, rounds: 0, launches: 0, capture, out: "" },
        probe: probeResult,
        capture: resolveCapture(capture, probeResult),
        input: resolveInput(probeResult),
      })
      const harness = await harnessState()
      const root = parsed.values.results ? resolve(parsed.values.results) : RESULTS
      console.log(renderPlan(await planRun(env, apps, root, parseFresh(parsed.values.fresh, apps), harness.measure)))
      return
    }
    case "run": {
      const parsed = parseArgs({
        args: rest,
        options: {
          apps: { type: "string" }, rounds: { type: "string", default: "5" }, launches: { type: "string", default: "10" },
          capture: { type: "string", default: "auto" }, "allow-missing-permissions": { type: "boolean", default: false },
          status: { type: "string", default: "on" },
          results: { type: "string" }, fresh: { type: "string" }, tag: { type: "string" }, out: { type: "string" },
        },
      })
      const capture = parsed.values.capture
      if (capture !== "auto" && capture !== "on" && capture !== "off") throw new Error(`--capture must be auto, on or off, got ${capture}`)
      const status = parsed.values.status
      if (status !== "on" && status !== "off") throw new Error(`--status must be on or off, got ${status}`)
      const apps = parseApps(parsed.values.apps)
      await runBench({
        apps,
        rounds: positiveInt("rounds", parsed.values.rounds!, 1),
        launches: positiveInt("launches", parsed.values.launches!, 0),
        capture: capture as CaptureMode,
        allowMissingPermissions: parsed.values["allow-missing-permissions"] ?? false,
        root: parsed.values.results ? resolve(parsed.values.results) : RESULTS,
        fresh: parseFresh(parsed.values.fresh, apps),
        tag: parsed.values.tag,
        out: parsed.values.out ? resolve(parsed.values.out) : undefined,
        status: status === "on",
      })
      return
    }
    case "report": {
      const parsed = parseArgs({ args: rest, options: { "include-invalid": { type: "boolean", default: false } }, allowPositionals: true })
      if (parsed.positionals.length === 0) {
        const path = writeComparison(RESULTS)
        if (!path) throw new Error(`no stored runs under ${RESULTS}/<app>/`)
        console.log(`wrote ${path}`)
        return
      }
      if (parsed.positionals.length !== 1) throw new Error(USAGE)
      const dir = resolve(parsed.positionals[0])
      readEnv(dir)
      writeReport(dir, { includeInvalid: parsed.values["include-invalid"] ?? false })
      console.log(`wrote ${dir}/report.md`)
      return
    }
    case "publish": {
      const parsed = parseArgs({ args: rest, options: { readme: { type: "string" } }, allowPositionals: true })
      if (parsed.positionals.length !== 1) throw new Error(USAGE)
      const resultsDir = resolve(parsed.positionals[0])
      const readmePath = parsed.values.readme ? resolve(parsed.values.readme) : DEFAULT_README
      const name = publish({ resultsDir, readmePath, publishedRoot: DEFAULT_PUBLISHED })
      console.log(`copied report.md and env.json to published/${name}/; updated the results section of ${readmePath}`)
      return
    }
    default:
      throw new Error(USAGE)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
