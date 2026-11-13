import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applyResultsSection, buildResultsSection, copyRun, environmentLine, missingRowsSentence, publishedName, renderResultsTable,
  RESULTS_END, RESULTS_START,
} from "./publish"
import { appInfos, STAMPS } from "./fixtures/stamps"
import type { SummaryMetric } from "./report"
import type { Env } from "./types"

const env: Env = {
  startedAt: "2026-11-05T11:48:15.347Z",
  args: { apps: ["electron", "ghia", "gpui", "swiftui", "mygo"], rounds: 5, launches: 10, capture: "off", out: "x" },
  capture: { enabled: false, reason: "--capture off" },
  input: { enabled: true, reason: "post-event and Accessibility granted" },
  probe: { screenCapture: false, postEvent: true, axTrusted: true, mainDisplay: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 }, osVersion: "27.0.1", cpu: "Apple M1 Pro", memBytes: 2 ** 34 },
  macos: "27.0.1 (26A434)", scrollBars: "WhenScrolling", chip: "Apple M1 Pro", memBytes: 2 ** 34,
  display: { id: 1, widthPt: 1512, heightPt: 982, scale: 2, refreshHz: 120 },
  loadAverage: [4.556640625, 5.55517578125, 5.28857421875], cpuCores: 10,
  bun: "1.4.4", apps: appInfos(["electron", "ghia", "gpui", "swiftui", "mygo"]), warnings: [],
}

function metric(key: string, section: string, label: string, texts: [string, string]): SummaryMetric {
  return {
    key, section, label,
    cells: { electron: { text: texts[0], numbers: [] }, ghia: { text: texts[1], numbers: [] } },
  }
}

const metrics: SummaryMetric[] = [
  metric("startup.windowVisibleMs", "Startup", "Window visible (ms)", ["523 [458–706]", "541 [454–660]"]),
  metric("startup.contentReadyMs", "Startup", "Content ready (ms)", ["–", "–"]),
  metric("scroll.fps", "Scroll (3 s down)", "App frame rate (fps)", ["–", "–"]),
  metric("scroll.appFrames", "Scroll (3 s down)", "App frames | changed", ["–", "–"]),
]

describe("environmentLine", () => {
  test("date, machine, load and the versions of the apps in the run", () => {
    const line = environmentLine(env)
    expect(line).toBe(
      "2026-11-05. Apple M1 Pro, 16 GiB RAM, macOS 27.0.1 (26A434), 1512 x 982 pt display at 120 Hz, scroll bars: when scrolling, load average 4.56 / 5.56 / 5.29. "
      + "Ghia 8fcd806 (zed 451f7ec, Bun 1.4.4+38afee6c8), gpui 654efae, Electron 45.2.2 (Chromium 156.0.8078.80), MyGo v0.7.5-0.20261105040656-977ea57e0baf, Swift 6.4.2, Xcode 27.2, Bun 1.4.4.",
    )
  })

  test("versions of apps that were not in the run do not appear", () => {
    const line = environmentLine({ ...env, args: { ...env.args, apps: ["ghia", "gpui"] } })
    expect(line).toContain("gpui 654efae")
    expect(line).not.toContain("Electron")
    expect(line).not.toContain("Swift")
  })

  test("Ghia (bun AOT) appears with the Bun that compiled it and AOT", () => {
    const line = environmentLine({ ...env, args: { ...env.args, apps: ["ghia", "ghia-aot"] }, apps: appInfos(["ghia", "ghia-aot"]) })
    expect(line).toContain("Ghia 8fcd806 (zed 451f7ec, Bun 1.4.4+38afee6c8), Ghia AOT 8fcd806 (zed 451f7ec, Bun 1.4.4-canary.1+b1305ddc7, AOT), Bun")
  })

  test("Ghia (React) appears with its Ghia, React, Base UI, StyleX and compiler versions when it is in the run", () => {
    const line = environmentLine({ ...env, args: { ...env.args, apps: ["ghia", "ghia-react"] }, apps: appInfos(["ghia", "ghia-react"]) })
    expect(line).toContain("Ghia React 8fcd806 (zed 451f7ec, Bun 1.4.4+38afee6c8) (@ghia/react 0.11.1, React 19.2.0, Base UI 1.0.0, StyleX 0.15.0, React Compiler 19.1.0-rc.3), Bun")
  })

  test("GPUIX appears with its @gpuix/solid version when it is in the run", () => {
    const line = environmentLine({ ...env, args: { ...env.args, apps: ["ghia", "gpuix"] }, apps: appInfos(["ghia", "gpuix"]) })
    expect(line).toContain("Ghia 8fcd806 (zed 451f7ec, Bun 1.4.4+38afee6c8), GPUIX 0.11.0 (npm), Bun")
  })

  test("NSH appears with its version, commit and source when it is in the run", () => {
    const line = environmentLine({ ...env, args: { ...env.args, apps: ["ghia", "nsh"] }, apps: appInfos(["ghia", "nsh"]) })
    expect(line).toContain("Ghia 8fcd806 (zed 451f7ec, Bun 1.4.4+38afee6c8), NSH 0.4.0 (e626a8d, homebrew), Bun")
  })

  test("a dirty Ghia tree is marked", () => {
    const ghia = { ...env.apps.ghia!, build: { ...STAMPS.ghia, versions: { ...STAMPS.ghia.versions, dirty: true } } }
    expect(environmentLine({ ...env, apps: { ...env.apps, ghia } })).toContain("Ghia 8fcd806+dirty (zed 451f7ec, Bun 1.4.4+38afee6c8),")
  })

  test("an app in the run with no recorded bundle is an error, not a blank", () => {
    expect(() => environmentLine({ ...env, apps: {} })).toThrow("ghia")
  })
})

describe("renderResultsTable", () => {
  test("header, alignment, section rows and the data rows with pipes escaped", () => {
    expect(renderResultsTable([
      metric("w", "Startup", "Window visible (ms)", ["523 [458–706]", "541 [454–660]"]),
      metric("a", "Startup", "App frames | changed", ["1", "2"]),
    ])).toBe([
      "| Metric | Electron | Ghia |",
      "| --- | ---: | ---: |",
      "| **Startup** |  |  |",
      "| Window visible (ms) | 523 [458–706] | 541 [454–660] |",
      "| App frames \\| changed | 1 | 2 |",
    ].join("\n"))
  })

  test("drops rows where every app is a dash and sections left with no rows", () => {
    const table = renderResultsTable(metrics)
    expect(table).toContain("| Window visible (ms) |")
    expect(table).not.toContain("Content ready")
    expect(table).not.toContain("Scroll")
    expect(table).not.toContain("App frame rate")
  })

  test("keeps a row that has data for only some apps, dash included", () => {
    const table = renderResultsTable([metric("k", "S", "L", ["7", "–"])])
    expect(table).toContain("| L | 7 | – |")
  })

  test("columns are the apps in the rows, in app order", () => {
    const row: SummaryMetric = { key: "k", section: "S", label: "L", cells: { mygo: { text: "1", numbers: [] }, electron: { text: "2", numbers: [] } } }
    expect(renderResultsTable([row]).split("\n")[0]).toBe("| Metric | Electron | MyGo |")
  })
})

describe("missingRowsSentence", () => {
  test("names the rows left out, without units, once each, and the reason", () => {
    expect(missingRowsSentence(env, metrics)).toBe(
      "Left out because they have no data in this run: Content ready, App frame rate, App frames | changed. "
      + "They need Screen Recording to capture frames of the app window; this run had capture off (--capture off). See the full report.",
    )
  })

  test("with capture on it does not blame capture", () => {
    const sentence = missingRowsSentence({ ...env, capture: { enabled: true, reason: "on" } }, metrics)!
    expect(sentence).not.toContain("Screen Recording")
    expect(sentence).toContain("Content ready")
  })

  test("none when every row has data", () => {
    expect(missingRowsSentence(env, [metric("k", "S", "L", ["1", "2"])])).toBeNull()
  })
})

describe("buildResultsSection", () => {
  const section = buildResultsSection(env, metrics, "published/2026-11-05-no-capture/report.md")

  test("is wrapped in the markers and links the report", () => {
    expect(section.startsWith(RESULTS_START)).toBe(true)
    expect(section.endsWith(RESULTS_END)).toBe(true)
    expect(section).toContain("[published/2026-11-05-no-capture/report.md](./published/2026-11-05-no-capture/report.md)")
    expect(section).toContain("Frame capture: off (--capture off). Input: on (post-event and Accessibility granted).")
  })
})

describe("applyResultsSection", () => {
  const section = `${RESULTS_START}\nnew\n${RESULTS_END}`

  test("inserts ## Results before the first other ## heading, after the intro", () => {
    const readme = "# title\n\nintro one.\n\nintro two.\n\n## Fairness\n\ntext\n\n## Setup\n"
    expect(applyResultsSection(readme, section)).toBe(
      `# title\n\nintro one.\n\nintro two.\n\n## Results\n\n${section}\n\n## Fairness\n\ntext\n\n## Setup\n`,
    )
  })

  test("appends the section when the README has no ## heading", () => {
    expect(applyResultsSection("# title\n\nintro", section)).toBe(`# title\n\nintro\n\n## Results\n\n${section}\n`)
  })

  test("replaces what is between existing markers and leaves the rest alone", () => {
    const readme = `# t\n\n## Results\n\nbefore\n\n${RESULTS_START}\nold\nold\n${RESULTS_END}\n\nafter\n\n## Next\n`
    expect(applyResultsSection(readme, section)).toBe(`# t\n\n## Results\n\nbefore\n\n${section}\n\nafter\n\n## Next\n`)
  })

  test("is idempotent", () => {
    const once = applyResultsSection("# t\n\nintro\n\n## A\n", section)
    expect(applyResultsSection(once, section)).toBe(once)
    const other = `${RESULTS_START}\nother\n${RESULTS_END}`
    expect(applyResultsSection(applyResultsSection(once, other), section)).toBe(once)
  })

  test("a lone or reversed marker is an error rather than a guess", () => {
    expect(() => applyResultsSection(`a\n${RESULTS_START}\nb`, section)).toThrow("unpaired")
    expect(() => applyResultsSection(`${RESULTS_END}\n${RESULTS_START}`, section)).toThrow("unpaired")
  })
})

describe("copyRun", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  function fixture(report: string): { results: string; published: string } {
    const root = mkdtempSync(join(tmpdir(), "publish-test-"))
    dirs.push(root)
    const results = join(root, "results")
    Bun.spawnSync(["mkdir", results])
    writeFileSync(join(results, "report.md"), report)
    writeFileSync(join(results, "env.json"), JSON.stringify(env))
    writeFileSync(join(results, "runs.jsonl"), "{}\n")
    return { results, published: join(root, "published") }
  }

  test("copies report.md and env.json, not runs.jsonl, into <date>-<label>, again on a re-run", () => {
    const { results, published } = fixture("# report\n")
    expect(copyRun(results, published, env)).toBe("2026-11-05-no-capture")
    expect(copyRun(results, published, env)).toBe("2026-11-05-no-capture")
    const target = join(published, "2026-11-05-no-capture")
    expect(readFileSync(join(target, "report.md"), "utf8")).toBe("# report\n")
    expect(existsSync(join(target, "env.json"))).toBe(true)
    expect(existsSync(join(target, "runs.jsonl"))).toBe(false)
  })

  test("label is full when capture was on", () => {
    expect(publishedName({ ...env, capture: { enabled: true, reason: "on" } })).toBe("2026-11-05-full")
  })

  test("refuses a report that includes invalid sessions", () => {
    const { results, published } = fixture("This report INCLUDES sessions whose frame")
    expect(() => copyRun(results, published, env)).toThrow("--include-invalid")
  })
})
