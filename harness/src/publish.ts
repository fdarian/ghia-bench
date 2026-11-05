import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { REPO_ROOT } from "./helper"
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

/** `gpui` is recorded by newer harness versions as a string or `{ source, commit }`; older env.json files have none. */
function gpuiVersion(env: Env): string | null {
  const gpui = (env as unknown as { gpui?: string | { source?: string | null; commit?: string | null } | null }).gpui
  if (gpui === undefined || gpui === null) return null
  if (typeof gpui === "string") return gpui
  const parts = [gpui.source, gpui.commit ? gpui.commit.slice(0, 7) : null].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(" @ ") : null
}

function ghiaVersion(env: Env): string {
  if (env.ghiaSource) return env.ghiaSource
  const sha = required("ghia.sha", env.ghia.sha).slice(0, 7)
  return env.ghia.zedSha ? `${sha} (zed ${env.ghia.zedSha.slice(0, 7)})` : sha
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
  if (apps.includes("ghia")) versions.push(`Ghia ${ghiaVersion(env)}`)
  const gpui = apps.includes("gpui") ? gpuiVersion(env) : null
  if (gpui) versions.push(`gpui ${gpui}`)
  if (apps.includes("electron")) {
    const electron = required("electron versions", env.electron)
    versions.push(`Electron ${electron.electron} (Chromium ${electron.chromium})`)
  }
  if (apps.includes("mygo")) {
    const mygo = required("mygo module", required("mygo", env.mygo).module)
    versions.push(`MyGo ${mygo.replace(/^\S+\s+/, "")}`)
  }
  if (apps.includes("swiftui")) {
    const swift = required("swift", env.swift)
    versions.push(`Swift ${/version (\S+)/.exec(required("swift version", swift.swift))?.[1] ?? swift.swift}`)
    versions.push(/^Xcode [\d.]+/.exec(required("xcode version", swift.xcode))?.[0] ?? swift.xcode!)
  }
  versions.push(`Bun ${env.bun}`)
  return `${runDate(env)}. ${machine.join(", ")}. ${versions.join(", ")}.`
}

function captureInputLine(env: Env): string {
  return `Frame capture: ${env.capture.enabled ? "on" : "off"} (${env.capture.reason}). Input: ${env.input.enabled ? "on" : "off"} (${env.input.reason}).`
}

type TableSection = { heading: string; rows: SummaryMetric[]; measured: boolean }

function sectionsOf(metrics: SummaryMetric[], apps: AppId[]): TableSection[] {
  const sections: TableSection[] = []
  for (const metric of metrics) {
    let section = sections[sections.length - 1]
    if (!section || section.heading !== metric.section) {
      section = { heading: metric.section, rows: [], measured: false }
      sections.push(section)
    }
    section.rows.push(metric)
  }
  for (const section of sections) {
    section.measured = section.rows.some((row) => apps.some((app) => cellText(row, app) !== NOT_MEASURED))
  }
  return sections
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

/** The summary table of report.md: every row of every measured section; a section with no data keeps its heading, marked, like the report does. */
export function renderResultsTable(metrics: SummaryMetric[]): string {
  const apps = appsOf(metrics)
  const lines = [`| Metric | ${apps.map((app) => APP_LABELS[app]).join(" | ")} |`, `| --- | ${apps.map(() => "---:").join(" | ")} |`]
  for (const section of sectionsOf(metrics, apps)) {
    lines.push(`| **${section.heading}**${section.measured ? "" : " (not measured)"} | ${apps.map(() => "").join(" | ")} |`)
    if (!section.measured) continue
    for (const row of section.rows) lines.push(`| ${escapeCell(row.label)} | ${apps.map((app) => escapeCell(cellText(row, app))).join(" | ")} |`)
  }
  return lines.join("\n")
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** Which rows have no numbers and why; only a run without frame capture has any. */
export function missingRowsSentence(env: Env, metrics: SummaryMetric[]): string | null {
  if (env.capture.enabled) return null
  const apps = appsOf(metrics)
  const sections = sectionsOf(metrics, apps)
  const skipped = sections.filter((section) => !section.measured).map((section) => section.heading)
  const dashed = sections
    .filter((section) => section.measured)
    .map((section) => ({ heading: section.heading, rows: section.rows.filter((row) => apps.every((app) => cellText(row, app) === NOT_MEASURED)) }))
    .filter((section) => section.rows.length > 0)
  const parts: string[] = []
  if (dashed.length > 0) {
    const count = dashed.reduce((total, section) => total + section.rows.length, 0)
    parts.push(`${plural(count, "row")} without data (shown as "${NOT_MEASURED}") in ${dashed.map((section) => section.heading.replace(/ \(.*/, "")).join(", ")}`)
  }
  if (skipped.length > 0) parts.push(`${plural(skipped.length, "section")} not measured (${skipped.map((heading) => heading.replace(/ \(.*/, "")).join(", ")})`)
  if (parts.length === 0) return null
  return `Frame capture was off (${env.capture.reason}), so ${parts.join(" and ")}: they come from the frames of the app window, which need Screen Recording.`
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
    "Ghia over time: [history/ghia/README.md](./history/ghia/README.md).",
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
