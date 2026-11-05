#!/bin/sh
# Builds dist/Mailbox-MyGo.app at the repo root with MyGo's own bundler. Needs data/messages.json (bun data/generate.ts).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
app="$root/dist/Mailbox-MyGo.app"

[ -f "$root/data/messages.json" ] || bun "$root/data/generate.ts"

cd "$here"
# Optional machine-wide lock script that serialises heavy builds; run the build directly without it.
heavy="${GHIA_HEAVY:-$HOME/.claude/notes/plans/gpuix-heavy.sh}"
if [ -x "$heavy" ]; then
  "$heavy" go tool mygo build -skip-dmg -skip-notarize
else
  go tool mygo build -skip-dmg -skip-notarize
fi

rm -rf "$app"
mkdir -p "$root/dist"
cp -R "$here/build/darwin-arm64/Mailbox-MyGo.app" "$app"
echo "$app"
