import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { check } from "./check"
import { existingApps } from "./env"
import { REPO_ROOT } from "./helper"
import { DEFAULT_PUBLISHED, DEFAULT_README, publish } from "./publish"
import { readEnv, writeReport } from "./report"
import { runBench, type CaptureMode } from "./run"
import { APP_IDS, type AppId } from "./types"

const USAGE = `usage:
  bun harness/src/bench.ts check
  bun harness/src/bench.ts run [--apps electron,ghia,gpui,swiftui,nsh,mygo] [--rounds 5] [--launches 10] [--capture auto|on|off] [--allow-missing-permissions] [--out results/<ISO>]
  bun harness/src/bench.ts report <results dir> [--include-invalid]
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

async function main(): Promise<void> {
  const command = Bun.argv[2]
  const rest = Bun.argv.slice(3)
  switch (command) {
    case "check":
      await check()
      return
    case "run": {
      const parsed = parseArgs({
        args: rest,
        options: {
          apps: { type: "string" }, rounds: { type: "string", default: "5" }, launches: { type: "string", default: "10" },
          capture: { type: "string", default: "auto" }, "allow-missing-permissions": { type: "boolean", default: false }, out: { type: "string" },
        },
      })
      const capture = parsed.values.capture
      if (capture !== "auto" && capture !== "on" && capture !== "off") throw new Error(`--capture must be auto, on or off, got ${capture}`)
      const out = parsed.values.out
        ? resolve(parsed.values.out)
        : resolve(REPO_ROOT, "results", new Date().toISOString().replace(/[:.]/g, "-"))
      await runBench({
        apps: parseApps(parsed.values.apps),
        rounds: positiveInt("rounds", parsed.values.rounds!, 1),
        launches: positiveInt("launches", parsed.values.launches!, 0),
        capture: capture as CaptureMode,
        allowMissingPermissions: parsed.values["allow-missing-permissions"] ?? false,
        out,
      })
      return
    }
    case "report": {
      const parsed = parseArgs({ args: rest, options: { "include-invalid": { type: "boolean", default: false } }, allowPositionals: true })
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
