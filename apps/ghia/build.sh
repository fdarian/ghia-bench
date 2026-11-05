#!/usr/bin/env bash
# Builds the Mailbox Ghia app into <repo>/dist/Mailbox-Ghia.app
set -euo pipefail

cd "$(dirname "$0")"
repo_root="$(cd ../.. && pwd)"

[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"
[ -f "$repo_root/vendor/ghia/packages/native/gpuix-native.darwin-arm64.node" ] \
  || { echo "vendor/ghia is not built: run scripts/setup-ghia.sh" >&2; exit 1; }

bun install --frozen-lockfile
NODE_ENV=production bun build.ts
