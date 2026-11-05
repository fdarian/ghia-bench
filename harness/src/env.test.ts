import { describe, expect, test } from "bun:test"
import { mygoModule } from "./env"
import { rotate } from "./run"

describe("mygoModule", () => {
  test("reads the go directive and the egoist/mygo requirement in block or single-line form", () => {
    const block = "module mailbox\n\ngo 1.24.2\n\nrequire (\n\tgithub.com/egoist/mygo v0.3.1\n\tgolang.org/x/sys v0.1.0\n)\n"
    expect(mygoModule(block)).toEqual({ goVersion: "1.24.2", module: "github.com/egoist/mygo v0.3.1" })
    expect(mygoModule("module m\ngo 1.22\nrequire github.com/egoist/mygo v0.0.0-2026\n")).toEqual({
      goVersion: "1.22", module: "github.com/egoist/mygo v0.0.0-2026",
    })
  })
  test("missing pieces are null, not invented", () => {
    expect(mygoModule("module m\n")).toEqual({ goVersion: null, module: null })
  })
})

describe("rotate", () => {
  test("every app leads once for 1 to 5 apps", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const apps = ["a", "b", "c", "d", "e"].slice(0, count)
      const leaders = apps.map((_, round) => rotate(apps, round)[0])
      expect(leaders).toEqual(apps)
      expect(rotate(apps, count)).toEqual(apps)
    }
  })
})
