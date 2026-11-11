#!/usr/bin/env bash
# Builds dist/Mailbox-GhiaAOT.app: the same app and sources as build.sh, compiled ahead of time by a
# Bun with `bun build --compile --aot` ($BUN_AOT, default the canary in ~/.bun-canary). Everything
# else (install, stamp, signing) runs with the Bun on PATH.
#
# --aot type checks the whole program, and with `link:` the Ghia packages' built dist/*.js count as
# program files: under their tsconfig.json's `verbatimModuleSyntax` they fail with TS1287 (341
# errors). The build needs that line removed from vendor/ghia/packages/{native,solid}/tsconfig.json.
set -euo pipefail

cd "$(dirname "$0")"
repo_root="$(cd ../.. && pwd)"
export BUN_AOT="${BUN_AOT:-$HOME/.bun-canary/bin/bun}"

[ -x "$BUN_AOT" ] || { echo "no Bun with AOT at $BUN_AOT: set BUN_AOT" >&2; exit 1; }
[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"

[ -f "$repo_root/vendor/ghia/packages/native/gpuix-native.darwin-arm64.node" ] \
  || { echo "vendor/ghia is not built: run scripts/setup-ghia.sh" >&2; exit 1; }
bun install --frozen-lockfile
app="$repo_root/dist/Mailbox-GhiaAOT.app"
start=$SECONDS
NODE_ENV=production "$BUN_AOT" build.ts --aot
echo "build.ts --aot: $((SECONDS - start)) s"
bun "$repo_root/harness/src/build-stamp.ts" ghia-aot "$app"
codesign --force --sign - "$app"
echo "$app"
