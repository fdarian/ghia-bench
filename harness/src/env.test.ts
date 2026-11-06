import { describe, expect, test } from "bun:test"
import { rotate } from "./run"

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
