import type { BuildStamp } from "../stamp"
import type { AppId, AppInfo } from "../types"

export const STAMPS: { [A in AppId]: BuildStamp<A> } = {
  electron: {
    app: "electron", builtAt: "2026-11-06T01:00:00.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: { electron: "45.2.2", chromium: "156.0.8078.80" },
  },
  ghia: {
    app: "ghia", builtAt: "2026-11-06T01:01:00.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: {
      native: "0.11.1", solid: "0.11.1", sha: "8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15", zedSha: "451f7ec4d15f7d7444a1f347d5b916e2a7989bab",
      dirty: false, source: "https://github.com/fdarian/ghia.git", bun: "1.4.4+38afee6c8",
    },
  },
  "ghia-aot": {
    app: "ghia-aot", builtAt: "2026-11-06T01:01:30.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: {
      native: "0.11.1", solid: "0.11.1", sha: "8fcd806f5969c5eafc00ee1114ef7b66d8a2ca15", zedSha: "451f7ec4d15f7d7444a1f347d5b916e2a7989bab",
      dirty: false, source: "https://github.com/fdarian/ghia.git", bun: "1.4.4-canary.1+b1305ddc7", aot: true,
    },
  },
  gpui: {
    app: "gpui", builtAt: "2026-11-06T01:02:00.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: { git: "https://github.com/zed-industries/zed", commit: "654efae441bc8eb117d0042bb28cd7cf3570bdc9", rustc: "rustc 1.97.1 (abcdef 2026-09-01)" },
  },
  swiftui: {
    app: "swiftui", builtAt: "2026-11-06T01:03:00.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: { swift: "6.4.2", xcode: "27.2", xcodeBuild: "27B52", sdk: "27.0" },
  },
  mygo: {
    app: "mygo", builtAt: "2026-11-06T01:04:00.000Z", bench: { sha: "aaaaaaa1111111111111111111111111111111aa", dirty: false },
    versions: { go: "1.27.3", mygo: "v0.7.5-0.20261105040656-977ea57e0baf" },
  },
}

export function appInfo(app: AppId): AppInfo {
  return { path: `dist/${app}.app`, bundleKb: 1024, executable: app, executableBytes: 1024, largeExecutables: [], build: STAMPS[app] }
}

export function appInfos(apps: AppId[]): Partial<Record<AppId, AppInfo>> {
  return Object.fromEntries(apps.map((app) => [app, appInfo(app)]))
}
