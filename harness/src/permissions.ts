import { runHelper } from "./helper"
import type { Probe } from "./types"

export type Permission = "Screen Recording" | "Post-event access" | "Accessibility"
export type PermissionState = Pick<Probe, "screenCapture" | "postEvent" | "axTrusted">

export function missingPermissions(state: PermissionState, captureRequired: boolean): Permission[] {
  const missing: Permission[] = []
  if (captureRequired && !state.screenCapture) missing.push("Screen Recording")
  if (!state.postEvent) missing.push("Post-event access")
  if (!state.axTrusted) missing.push("Accessibility")
  return missing
}

export function missingPermissionsMessage(missing: Permission[]): string {
  const panes = [...new Set(missing.map((name) => (name === "Screen Recording" ? "Screen Recording" : "Accessibility")))]
  return [
    `Missing permissions: ${missing.join(", ")}.`,
    `Grant them to the terminal app running this (System Settings > Privacy & Security > ${panes.join(" / ")}).`,
    "macOS only applies a grant to a freshly started process: quit the terminal app completely and reopen it, then rerun.",
  ].join("\n")
}

/** Triggers the macOS dialogs, then throws with the instructions if anything is still missing. */
export async function requireOrRequestPermissions(state: PermissionState, captureRequired: boolean): Promise<void> {
  if (missingPermissions(state, captureRequired).length === 0) return
  const after = (await runHelper<PermissionState>(["request"], 120_000)).data
  const stillMissing = missingPermissions(after, captureRequired)
  if (stillMissing.length === 0) {
    throw new Error("Permissions were granted just now, but they only take effect in a new process: quit the terminal app completely and reopen it, then rerun.")
  }
  throw new Error(missingPermissionsMessage(stillMissing))
}
