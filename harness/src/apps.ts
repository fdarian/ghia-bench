/** The one list of implementations under test; the order is the column order in the report. */
export const APPS = [
  { id: "electron", buildScript: "apps/electron/build.sh", label: "Electron", bundle: "Mailbox-Electron.app", multiProcess: true, chromium: true },
  { id: "ghia", buildScript: "apps/ghia/build.sh", label: "Ghia", bundle: "Mailbox-Ghia.app", multiProcess: false, chromium: false },
  { id: "ghia-aot", buildScript: "apps/ghia/build-aot.sh", label: "Ghia (bun AOT)", bundle: "Mailbox-GhiaAOT.app", multiProcess: false, chromium: false },
  { id: "gpui", buildScript: "apps/gpui/build.sh", label: "GPUI", bundle: "Mailbox-GPUI.app", multiProcess: false, chromium: false },
  { id: "swiftui", buildScript: "apps/swiftui/build.sh", label: "SwiftUI", bundle: "Mailbox-SwiftUI.app", multiProcess: false, chromium: false },
  { id: "mygo", buildScript: "apps/mygo/build.sh", label: "MyGo", bundle: "Mailbox-MyGo.app", multiProcess: false, chromium: false },
] as const

export type AppId = (typeof APPS)[number]["id"]
export type AppSpec = (typeof APPS)[number]

export const APP_IDS: AppId[] = APPS.map((app) => app.id)

export function appSpec(id: AppId): AppSpec {
  const spec = APPS.find((app) => app.id === id)
  if (!spec) throw new Error(`unknown app ${id}`)
  return spec
}

export const APP_LABELS = Object.fromEntries(APPS.map((app) => [app.id, app.label])) as Record<AppId, string>
