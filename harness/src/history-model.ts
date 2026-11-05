import { num } from "./report"

export type Machine = { chip: string; macos: string; displayHz: number; scrollBars: string | null; memGiB: number }

export type HistoryEntry = {
  schema: 1
  /** npm version ("0.11.1") or main snapshot ("main-8fcd806"). */
  label: string
  kind: "npm" | "git"
  status: "ok" | "failed"
  failure?: { stage: "build" | "run"; reason: string }
  ghiaVersion: string
  gitSha: string | null
  zedSha: string | null
  /** Committer date of gitSha; orders the main snapshots. */
  commitDate: string | null
  recordedAt: string
  benchSha: string
  /** Uncommitted changes under harness/, apps/ghia, apps/electron or data/ when the record ran. */
  benchDirty: boolean
  machine: Machine | null
  load: { before: number[]; after: number[] } | null
  capture: { requested: string; enabled: boolean; reason: string } | null
  run: { rounds: number; launches: number } | null
  versions: { electron: string | null; chromium: string | null; bun: string } | null
  /** app -> metric key -> the numbers behind the report.md cell: [median], or [p50, p95(, p99)], or [count, total]. */
  metrics: Partial<Record<"ghia" | "electron", Record<string, number[]>>>
}

export type TargetSpec = { kind: "npm"; version: string } | { kind: "git"; rev: string }

export function parseTarget(text: string): TargetSpec {
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(text)) return { kind: "npm", version: text }
  if (/^[0-9a-f]{7,40}$/i.test(text)) return { kind: "git", rev: text.toLowerCase() }
  throw new Error(`expected an npm version (0.11.1) or a git revision (hex sha), got ${text}`)
}

export function snapshotLabel(sha: string): string {
  return `main-${sha.slice(0, 7)}`
}

/** Semver precedence: numeric core, then a release outranks any prerelease, then dot-separated identifiers. */
export function compareSemver(a: string, b: string): number {
  const split = (text: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(text)
    if (!match) throw new Error(`not a semver version: ${text}`)
    return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] === undefined ? null : match[4].split(".") }
  }
  const left = split(a)
  const right = split(b)
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) return left.core[index] < right.core[index] ? -1 : 1
  }
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    const l = left.pre[index]
    const r = right.pre[index]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (l === r) continue
    const lNumeric = /^\d+$/.test(l)
    const rNumeric = /^\d+$/.test(r)
    if (lNumeric && rNumeric) return Number(l) < Number(r) ? -1 : 1
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1
    return l < r ? -1 : 1
  }
  return 0
}

/** Releases in semver order, then main snapshots by commit date (recording date when the commit date is unknown). */
export function orderEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const releases = entries.filter((entry) => entry.kind === "npm").sort((a, b) => compareSemver(a.label, b.label))
  const snapshots = entries
    .filter((entry) => entry.kind === "git")
    .sort((a, b) => (a.commitDate ?? a.recordedAt).localeCompare(b.commitDate ?? b.recordedAt))
  return [...releases, ...snapshots]
}

export function deltaPercent(previous: number | undefined, current: number | undefined): number | null {
  if (previous === undefined || current === undefined || previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function formatDelta(percent: number): string {
  if (Math.abs(percent) < 0.05) return "0.0%"
  return `${percent > 0 ? "+" : "-"}${Math.abs(percent).toFixed(1)}%`
}

export function metricValue(entry: HistoryEntry, app: "ghia" | "electron", key: string, index = 0): number | undefined {
  const numbers = entry.metrics[app]?.[key]
  return numbers === undefined ? undefined : numbers[index]
}

export type MetricGroup = "headline" | "stable" | "sensitive" | "capture"
export type MetricSpec = { key: string; label: string; group: MetricGroup; index?: number }

const PHASES = ["idle", "navigate", "type", "scroll", "hover"] as const

export const METRICS: MetricSpec[] = [
  ...PHASES.map((phase): MetricSpec => ({ key: `${phase}.instructionsM`, label: `Instructions, ${phase} (millions)`, group: "headline" })),
  { key: "startup.footprintMiB", label: "Memory at launch + 1 s (MiB)", group: "headline" },
  { key: "idle.footprintMiB", label: "Memory after idle (MiB)", group: "headline" },
  { key: "workload.footprintMiB", label: "Memory after workload (MiB)", group: "headline" },
  { key: "startup.windowVisibleMs", label: "Startup: window visible (ms)", group: "stable" },
  { key: "size.bundleMiB", label: "App bundle (MiB)", group: "stable" },
  { key: "size.executableMiB", label: "Main executable (MiB)", group: "stable" },
  ...PHASES.map((phase): MetricSpec => ({ key: `${phase}.wakeupsPerSec`, label: `Wakeups, ${phase} (per s)`, group: "stable" })),
  ...PHASES.map((phase): MetricSpec => ({ key: `${phase}.cpuPct`, label: `CPU, ${phase} (% of one core)`, group: "sensitive" })),
  ...PHASES.map((phase): MetricSpec => ({ key: `${phase}.energyMj`, label: `Energy, ${phase} (mJ)`, group: "sensitive" })),
  { key: "scroll.fps", label: "Scroll frame rate (fps, higher is better)", group: "capture" },
  { key: "hover.fps", label: "Hover frame rate (fps, higher is better)", group: "capture" },
  { key: "scroll.firstInputLatencyMs", label: "Scroll first-input latency (ms)", group: "capture" },
  { key: "type.echoMs", label: "Type echo latency p50 (ms)", group: "capture", index: 0 },
  { key: "type.resultMs", label: "Type result latency p50 (ms)", group: "capture", index: 0 },
  { key: "navigate.detailMs", label: "Navigate detail latency p50 (ms)", group: "capture", index: 0 },
]

function cell(value: number | undefined, delta: number | null): string {
  if (value === undefined) return "–"
  return delta === null ? num(value) : `${num(value)} (${formatDelta(delta)})`
}

/** One value-plus-delta row for an app; the delta is against the previous column that has a value. */
export function metricRow(entries: HistoryEntry[], app: "ghia" | "electron", spec: MetricSpec): string[] {
  const cells: string[] = []
  let previous: number | undefined
  for (const entry of entries) {
    const value = metricValue(entry, app, spec.key, spec.index ?? 0)
    cells.push(cell(value, deltaPercent(previous, value)))
    if (value !== undefined) previous = value
  }
  return cells
}

export function metricsTable(entries: HistoryEntry[], specs: MetricSpec[]): string | null {
  const present = specs.filter((spec) => entries.some((entry) => metricValue(entry, "ghia", spec.key, spec.index ?? 0) !== undefined))
  if (present.length === 0) return null
  const lines = [
    `| Metric | App | ${entries.map((entry) => entry.label).join(" | ")} |`,
    `| --- | --- | ${entries.map(() => "---:").join(" | ")} |`,
  ]
  for (const spec of present) {
    lines.push(`| ${spec.label} | Ghia | ${metricRow(entries, "ghia", spec).join(" | ")} |`)
    lines.push(`| | Electron (reference) | ${metricRow(entries, "electron", spec).join(" | ")} |`)
  }
  return lines.join("\n")
}

/** A line for each entry whose machine (chip, macOS, display Hz, scroll bars) differs from the previous entry's. */
export function machineNotes(entries: HistoryEntry[]): string[] {
  const notes: string[] = []
  for (let index = 1; index < entries.length; index++) {
    const before = entries[index - 1].machine
    const after = entries[index].machine
    if (!before || !after) continue
    const differences = [
      before.chip !== after.chip ? `chip ${before.chip} -> ${after.chip}` : null,
      before.macos !== after.macos ? `macOS ${before.macos} -> ${after.macos}` : null,
      before.displayHz !== after.displayHz ? `display ${before.displayHz} Hz -> ${after.displayHz} Hz` : null,
      before.scrollBars !== after.scrollBars ? `scroll bars ${before.scrollBars} -> ${after.scrollBars}` : null,
    ].filter((difference): difference is string => difference !== null)
    if (differences.length > 0) {
      notes.push(`${entries[index].label} was recorded on a different machine setup than ${entries[index - 1].label} (${differences.join("; ")}): do not compare the two across this boundary except through the Electron reference.`)
    }
  }
  return notes
}

/** Capture on or off changes which metrics exist, so a mix is worth saying. */
export function captureNotes(entries: HistoryEntry[]): string[] {
  const on = entries.filter((entry) => entry.capture?.enabled)
  const off = entries.filter((entry) => entry.capture && !entry.capture.enabled)
  if (on.length === 0 || off.length === 0) return []
  return [`Frame capture was on for ${on.map((entry) => entry.label).join(", ")} and off for ${off.map((entry) => entry.label).join(", ")}; frame rate and latency rows only have values for the former.`]
}

export type ChartSpec = { file: string; title: string; key: string; unit: string }

export const CHARTS: ChartSpec[] = [
  { file: "idle-instructions.svg", title: "Idle instructions", key: "idle.instructionsM", unit: "M" },
  { file: "navigate-instructions.svg", title: "Navigate instructions", key: "navigate.instructionsM", unit: "M" },
  { file: "type-instructions.svg", title: "Type instructions", key: "type.instructionsM", unit: "M" },
  { file: "scroll-instructions.svg", title: "Scroll instructions", key: "scroll.instructionsM", unit: "M" },
  { file: "memory-after-workload.svg", title: "Memory after workload", key: "workload.footprintMiB", unit: "MiB" },
  { file: "startup-window-visible.svg", title: "Startup: window visible", key: "startup.windowVisibleMs", unit: "ms" },
]

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** A line chart of one Ghia value per entry, y axis from 0; entries without a value leave a gap. */
export function lineChartSvg(spec: ChartSpec, entries: HistoryEntry[]): string {
  const width = 440
  const height = 190
  const left = 56
  const right = 16
  const top = 34
  const bottom = 36
  const values = entries.map((entry) => metricValue(entry, "ghia", spec.key))
  const present = values.filter((value): value is number => value !== undefined)
  const max = present.length === 0 ? 1 : Math.max(...present) * 1.35
  const inset = 36
  const x = (index: number) => (entries.length === 1 ? (left + width - right) / 2 : left + inset + ((width - left - right - 2 * inset) * index) / (entries.length - 1))
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max)
  const gray = "#888"
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="11">`,
    `<title>${escapeXml(`${spec.title} (${spec.unit}), Ghia by version`)}</title>`,
    `<text x="${left}" y="18" font-size="13" font-weight="600" fill="${gray}">${escapeXml(spec.title)} (${escapeXml(spec.unit)}, lower is better)</text>`,
    `<line x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}" stroke="${gray}" stroke-opacity="0.5"/>`,
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${y(0)}" stroke="${gray}" stroke-opacity="0.5"/>`,
    `<text x="${left - 6}" y="${y(0) + 4}" text-anchor="end" fill="${gray}">0</text>`,
    `<text x="${left - 6}" y="${top + 4}" text-anchor="end" fill="${gray}">${escapeXml(num(max))}</text>`,
  ]
  const segments: string[][] = []
  let current: string[] = []
  values.forEach((value, index) => {
    if (value === undefined) {
      if (current.length > 0) segments.push(current)
      current = []
    } else {
      current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
    }
  })
  if (current.length > 0) segments.push(current)
  for (const segment of segments) {
    if (segment.length > 1) parts.push(`<polyline points="${segment.join(" ")}" fill="none" stroke="#2563eb" stroke-width="2"/>`)
  }
  values.forEach((value, index) => {
    parts.push(`<text x="${x(index).toFixed(1)}" y="${height - 12}" text-anchor="middle" fill="${gray}">${escapeXml(entries[index].label)}</text>`)
    if (value === undefined) return
    parts.push(`<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.5" fill="#2563eb"/>`)
    parts.push(`<text x="${x(index).toFixed(1)}" y="${(y(value) - 8).toFixed(1)}" text-anchor="middle" fill="${gray}">${escapeXml(num(value))}</text>`)
  })
  parts.push("</svg>")
  return parts.join("\n") + "\n"
}

function entryRow(entry: HistoryEntry): string[] {
  const link = (extension: string, text: string) => `[${text}](${entry.label}.${extension})`
  return [
    entry.label,
    entry.kind === "npm" ? "npm" : "source",
    entry.gitSha ? entry.gitSha.slice(0, 7) : "–",
    entry.recordedAt.slice(0, 10),
    `${entry.benchSha.slice(0, 7)}${entry.benchDirty ? " (dirty)" : ""}`,
    entry.capture ? (entry.capture.enabled ? "on" : "off") : "–",
    entry.load ? `${entry.load.before[0].toFixed(1)} / ${entry.load.after[0].toFixed(1)}` : "–",
    `${link("report.md", "report")}, ${link("json", "json")}`,
  ]
}

function simpleTable(header: string[], rows: string[][]): string {
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n")
}

const HOW_TO_RECORD = `Record a version with the machine quiet (see the main README, "Running"), from a foreground terminal, in one session with the other versions you want to compare:

\`\`\`
bun harness/src/bench.ts history record 0.11.1            # a published npm version
bun harness/src/bench.ts history record <git sha>         # a snapshot of fdarian/ghia, built from source
bun harness/src/bench.ts history report                   # regenerate this README and the charts
\`\`\`

- \`record\` builds that Ghia into \`dist/history/Mailbox-Ghia-<label>.app\` with the current \`apps/ghia/src\` (npm versions install \`@ghia/solid\` and \`@ghia/native\` at exactly that version in a temp copy; a git sha goes through \`scripts/setup-ghia.sh\`, which leaves \`vendor/ghia\` at that revision), then runs the usual benchmark of Ghia and the pinned Electron app back to back and writes \`history/ghia/<label>.json\` and \`<label>.report.md\`.
- It takes \`--rounds\` and \`--launches\` (defaults 5 and 10, as for \`run\`) and \`--capture auto|on|off\`. Without Screen Recording use \`--capture off\`; the frame rate and latency rows then stay empty.
- The app never changes per version. If a version cannot build or run it, the entry says so with the reason and the history starts where the app works.
- With \`GHIA_HEAVY\` set to an executable lock script, the build and the measurement run under it, so no other heavy step shares the machine with a record. A git sha also needs \`GHIA_SRC\` (a Ghia checkout containing it) unless \`vendor/ghia\` already has it.
- The raw \`results/\` directory stays gitignored; commit \`history/\`.`

export function renderReadme(entries: HistoryEntry[]): string {
  const ordered = orderEntries(entries)
  const recorded = ordered.filter((entry) => entry.status === "ok")
  const failed = ordered.filter((entry) => entry.status === "failed")
  const sections = [
    "# Ghia benchmark history",
    "The Mailbox app (`apps/ghia/src`, identical for every column) built against each Ghia version and measured with the same harness, so improvements in Ghia show up over time. Releases are the published `@ghia/solid` + `@ghia/native` as users install them; `main-<sha>` columns are snapshots of fdarian/ghia built from source. Columns run in semver order, then main snapshots by commit date. Generated by `bun harness/src/bench.ts history report`; do not edit by hand.",
    "Each cell is the median over the sessions of that record, with the change against the previous column in parentheses (lower is better unless a row says otherwise). Every record also benchmarks the pinned Electron app back to back with Ghia: the Electron row is the machine-drift reference. Where Electron moved between columns, the machine state moved too, and Ghia's change is only meaningful relative to it.",
  ]
  if (recorded.length === 0) {
    sections.push("No version has been recorded yet.")
  } else {
    sections.push("## Headline: instructions and memory", "Retired instructions and memory footprint are the stable measures across sessions.")
    sections.push(metricsTable(recorded, METRICS.filter((spec) => spec.group === "headline")) ?? "No data.")
    sections.push("## Charts", CHARTS.map((chart) => `![${chart.title}](${chart.file})`).join("\n"))
    sections.push("## Startup, size and wakeups")
    sections.push(metricsTable(recorded, METRICS.filter((spec) => spec.group === "stable")) ?? "No data.")
    sections.push(
      "## Machine-state sensitive: CPU and energy",
      "CPU % and energy swing with the machine's state (frequency, thermals, background load) from one session to the next. Compare them only inside one session, i.e. against the Electron row of the same column.",
    )
    sections.push(metricsTable(recorded, METRICS.filter((spec) => spec.group === "sensitive")) ?? "No data.")
    const capture = metricsTable(recorded, METRICS.filter((spec) => spec.group === "capture"))
    sections.push("## Frame rate and latency", capture ?? "No entry has frame or latency data (every record ran with `--capture off`, which needs no Screen Recording permission).")
    const notes = [...machineNotes(recorded), ...captureNotes(recorded)]
    sections.push("## Notes", notes.length > 0 ? notes.map((note) => `- ${note}`).join("\n") : "Every entry was recorded on the same machine setup (chip, macOS, display refresh rate, scroll bar setting) with the same capture mode.")
    sections.push(
      "## Entries",
      simpleTable(["Label", "Source", "Ghia sha", "Recorded", "Bench sha", "Capture", "Load 1 min before / after", "Files"], recorded.map(entryRow)),
    )
  }
  if (failed.length > 0) {
    sections.push(
      "## Versions that could not be recorded",
      simpleTable(["Label", "Stage", "Reason"], failed.map((entry) => {
        if (!entry.failure) throw new Error(`${entry.label} is failed but has no failure record`)
        return [entry.label, entry.failure.stage, entry.failure.reason.replace(/\|/g, "\\|").replace(/\n/g, " ")]
      })),
    )
  }
  sections.push("## Recording a new version", HOW_TO_RECORD)
  return sections.join("\n\n") + "\n"
}
