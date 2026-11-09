#!/usr/bin/env bash
# Builds dist/Mailbox-GPUIX.app against the npm @gpuix/* packages pinned in package.json.
set -euo pipefail

cd "$(dirname "$0")"
repo_root="$(cd ../.. && pwd)"

[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"

bun install --frozen-lockfile
app="$repo_root/dist/Mailbox-GPUIX.app"
NODE_ENV=production bun build.ts
bun "$repo_root/harness/src/build-stamp.ts" gpuix "$app"
codesign --force --sign - "$app"
echo "$app"
