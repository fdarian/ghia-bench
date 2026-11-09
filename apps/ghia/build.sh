#!/usr/bin/env bash
# Builds dist/Mailbox-Ghia.app against vendor/ghia (link:); scripts/setup-ghia.sh builds that first.
set -euo pipefail

cd "$(dirname "$0")"
repo_root="$(cd ../.. && pwd)"

[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"

[ -f "$repo_root/vendor/ghia/packages/native/gpuix-native.darwin-arm64.node" ] \
  || { echo "vendor/ghia is not built: run scripts/setup-ghia.sh" >&2; exit 1; }
bun install --frozen-lockfile
app="$repo_root/dist/Mailbox-Ghia.app"
rm -rf "$app"
NODE_ENV=production bun run ghia build
bun build.ts
bun "$repo_root/harness/src/build-stamp.ts" ghia "$app"
codesign --force --sign - "$app"
echo "$app"
