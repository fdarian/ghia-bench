#!/usr/bin/env bash
# Builds the Mailbox Electron app into <repo>/dist/Mailbox-Electron.app
set -euo pipefail

cd "$(dirname "$0")"
repo_root="$(cd ../.. && pwd)"
dist="$repo_root/dist"
stage="$(pwd)/.stage"

[ -f "$repo_root/data/messages.json" ] || bun "$repo_root/data/generate.ts"

pnpm install --frozen-lockfile
pnpm exec vite build --config vite.main.config.ts --mode production
pnpm exec vite build --config vite.renderer.config.ts --mode production

# The packaged app contains only the built output; everything it needs is bundled.
rm -rf "$stage"
mkdir -p "$stage"
cp -R out/main out/renderer "$stage/"
cat > "$stage/package.json" <<JSON
{ "name": "mailbox-electron", "productName": "Mailbox-Electron", "version": "1.0.0", "type": "module", "main": "main/main.js" }
JSON

rm -rf "$dist/Mailbox-Electron.app" "$dist/Mailbox-Electron-darwin-arm64"
mkdir -p "$dist"
pnpm exec electron-packager "$stage" Mailbox-Electron \
  --platform=darwin --arch=arm64 --asar --overwrite --out="$dist" \
  --app-bundle-id=dev.ghiabench.mailbox-electron --no-prune
mv "$dist/Mailbox-Electron-darwin-arm64/Mailbox-Electron.app" "$dist/Mailbox-Electron.app"
rm -rf "$dist/Mailbox-Electron-darwin-arm64"
rm -rf "$stage"

# The stamp goes into Resources, which the signature covers: sign again after it.
bun "$repo_root/harness/src/build-stamp.ts" electron "$dist/Mailbox-Electron.app"
codesign --force --deep --sign - "$dist/Mailbox-Electron.app"
