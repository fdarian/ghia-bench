import { expect, test } from "bun:test"
import { missingPermissions, missingPermissionsMessage } from "./permissions"

const none = { screenCapture: false, postEvent: false, axTrusted: false }

test("all three are missing when nothing is granted", () => {
  expect(missingPermissions(none, true)).toEqual(["Screen Recording", "Post-event access", "Accessibility"])
})

test("Screen Recording is not required when capture is off", () => {
  expect(missingPermissions(none, false)).toEqual(["Post-event access", "Accessibility"])
})

test("nothing is missing when everything is granted", () => {
  expect(missingPermissions({ screenCapture: true, postEvent: true, axTrusted: true }, true)).toEqual([])
})

test("the message names the missing permission, the terminal and the restart", () => {
  const message = missingPermissionsMessage(["Screen Recording"])
  expect(message).toContain("Screen Recording")
  expect(message).toContain("terminal app")
  expect(message).toContain("quit")
})
