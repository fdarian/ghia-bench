import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { REPO_ROOT } from "./helper"
import { buildOf, type BuildStamp } from "./stamp"
import { readEnv, readRuns, summaryMetrics, type SummaryMetric } from "./report"
import { APP_IDS, APP_LABELS, type AppId, type Env } from "./types"

export const RESULTS_START = "<!-- results:start -->"
export const RESULTS_END = "<!-- results:end -->"
const NOT_MEASURED = "–"

function required<T>(label: string, value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error(`env.json has no ${label}; the run's environment is incomplete, so it can't be published`)
  return value
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

const SCROLL_BARS: Record<string, string> = {
  Automatic: "automatic",
  WhenScrolling: "when scrolling",
  Always: "always",
  unset: "automatic (unset)",
}

function ghiaVersion(stamp: BuildStamp<"ghia">): string {
  const v = stamp.versions
  return `${v.sha.slice(0, 7)}${v.dirty ? "+dirty" : ""} (zed ${v.zedSha.slice(0, 7)})`
}

export function runDate(env: Env): string {
  return env.startedAt.slice(0, 10)
}

export function runLabel(env: Env): "full" | "no-capture" {
  return env.capture.enabled ? "full" : "no-capture"
}

export function publishedName(env: Env): string {
  return `${runDate(env)}-${runLabel(env)}`
}

/** The one-line machine, load and versions summary. */
export function environmentLine(env: Env): string {
  const apps = env.args.apps
  const scrollBars = required("scrollBars", env.scrollBars)
  const machine = [
    env.chip,
    `${(env.memBytes / 2 ** 30).toFixed(0)} GiB RAM`,
    `macOS ${env.macos}`,
    `${env.display.widthPt} x ${env.display.heightPt} pt display at ${env.display.refreshHz} Hz`,
    `scroll bars: ${SCROLL_BARS[scrollBars] ?? scrollBars}`,
    `load average ${env.loadAverage.map((value) => value.toFixed(2)).join(" / ")}`,
  ]
  const versions: string[] = []
  if (apps.includes("ghia")) versions.push(`Ghia ${ghiaVersion(buildOf(env, "ghia"))}`)
  if (apps.includes("gpuix")) versions.push(`GPUIX ${buildOf(env, "gpuix").versions.solid} (npm)`)
  if (apps.includes("gpui")) versions.push(`gpui ${buildOf(env, "gpui").versions.commit.slice(0, 7)}`)
  if (apps.includes("electron")) {
    const electron = buildOf(env, "electron").versions
    versions.push(`Electron ${electron.electron} (Chromium ${electron.chromium})`)
  }
  if (apps.includes("mygo")) versions.push(`MyGo ${buildOf(env, "mygo").versions.mygo}`)
  if (apps.includes("swiftui")) {
    const swift = buildOf(env, "swiftui").versions
    versions.push(`Swift ${swift.swift}`, `Xcode ${swift.xcode}`)
  }
  if (apps.includes("nsh")) {
    const nsh = buildOf(env, "nsh").versions
    versions.push(`NSH ${nsh.nsh} (${nsh.commit}, ${nsh.source})`)
  }
  versions.push(`Bun ${env.bun}`)
  return `${runDate(env)}. ${machine.join(", ")}. ${versions.join(", ")}.`
}

function captureInputLine(env: Env): string {
  return `Frame capture: ${env.capture.enabled ? "on" : "off"} (${env.capture.reason}). Input: ${env.input.enabled ? "on" : "off"} (${env.input.reason}).`
}

function hasData(metric: SummaryMetric, apps: AppId[]): boolean {
  return apps.some((app) => cellText(metric, app) !== NOT_MEASURED)
}

function cellText(metric: SummaryMetric, app: AppId): string {
  const cell = metric.cells[app]
  if (!cell) throw new Error(`summary row ${metric.key} has no cell for ${app}`)
  return cell.text
}

function appsOf(metrics: SummaryMetric[]): AppId[] {
  if (metrics.length === 0) throw new Error("the run has no summary rows")
  return APP_IDS.filter((app) => app in metrics[0].cells)
}

/** The summary table of report.md without the rows that have no data for any app, and the sections left empty by that. */
export function renderResultsTable(metrics: SummaryMetric[]): string {
  const apps = appsOf(metrics)
  const lines = [`| Metric | ${apps.map((app) => APP_LABELS[app]).join(" | ")} |`, `| --- | ${apps.map(() => "---:").join(" | ")} |`]
  let section: string | null = null
  for (const row of metrics) {
    if (!hasData(row, apps)) continue
    if (row.section !== section) {
      section = row.section
      lines.push(`| **${section}** | ${apps.map(() => "").join(" | ")} |`)
    }
    lines.push(`| ${escapeCell(row.label)} | ${apps.map((app) => escapeCell(cellText(row, app))).join(" | ")} |`)
  }
  return lines.join("\n")
}

/** Names what the table leaves out (rows with no data for any app) and why; null when nothing was left out. */
export function missingRowsSentence(env: Env, metrics: SummaryMetric[]): string | null {
  const apps = appsOf(metrics)
  const labels = [...new Set(metrics.filter((row) => !hasData(row, apps)).map((row) => row.label.replace(/ \(.*/, "")))]
  if (labels.length === 0) return null
  const left = `Left out because they have no data in this run: ${labels.join(", ")}.`
  if (env.capture.enabled) return `${left} See the full report.`
  return `${left} They need Screen Recording to capture frames of the app window; this run had capture off (${env.capture.reason}). See the full report.`
}

export function buildResultsSection(env: Env, metrics: SummaryMetric[], reportLink: string): string {
  const parts = [
    RESULTS_START,
    environmentLine(env),
    captureInputLine(env),
    renderResultsTable(metrics),
  ]
  const missing = missingRowsSentence(env, metrics)
  if (missing) parts.push(missing)
  parts.push(
    `The per-process breakdown and the validity notes are in [${reportLink}](./${reportLink}).`,
    RESULTS_END,
  )
  return parts.join("\n\n")
}

/** Replaces the marked section, or inserts `## Results` with the markers before the first other `##` heading (at the end when there is none). */
export function applyResultsSection(readme: string, section: string): string {
  const start = readme.indexOf(RESULTS_START)
  const end = readme.indexOf(RESULTS_END)
  if (start !== -1 || end !== -1) {
    if (start === -1 || end === -1 || end < start) throw new Error(`README has an unpaired ${RESULTS_START} / ${RESULTS_END} marker`)
    return readme.slice(0, start) + section + readme.slice(end + RESULTS_END.length)
  }
  const block = `## Results\n\n${section}\n`
  const heading = /^## /m.exec(readme)
  if (!heading) return `${readme.replace(/\n*$/, "\n")}\n${block}`
  return `${readme.slice(0, heading.index)}${block}\n${readme.slice(heading.index)}`
}

/** Copies report.md and env.json (not runs.jsonl) to <publishedRoot>/<date>-<label>/ and returns the directory name. */
export function copyRun(resultsDir: string, publishedRoot: string, env: Env): string {
  const report = join(resultsDir, "report.md")
  if (!existsSync(report)) throw new Error(`${report} does not exist; run \`bench.ts report ${resultsDir}\` first`)
  if (readFileSync(report, "utf8").includes("INCLUDES sessions")) {
    throw new Error("report.md was generated with --include-invalid; publish a report of the valid sessions only")
  }
  const name = publishedName(env)
  const target = join(publishedRoot, name)
  mkdirSync(target, { recursive: true })
  copyFileSync(report, join(target, "report.md"))
  copyFileSync(join(resultsDir, "env.json"), join(target, "env.json"))
  return name
}

export function publish(options: { resultsDir: string; readmePath: string; publishedRoot: string }): string {
  const env = readEnv(options.resultsDir)
  const metrics = summaryMetrics(env, readRuns(options.resultsDir))
  const name = copyRun(options.resultsDir, options.publishedRoot, env)
  const link = `published/${name}/report.md`
  const readme = readFileSync(options.readmePath, "utf8")
  writeFileSync(options.readmePath, applyResultsSection(readme, buildResultsSection(env, metrics, link)))
  return name
}

export const DEFAULT_README = join(REPO_ROOT, "README.md")
export const DEFAULT_PUBLISHED = join(REPO_ROOT, "published")
