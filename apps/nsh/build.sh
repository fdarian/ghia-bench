#!/bin/sh
# Builds dist/Mailbox-NSH.app at the repo root with the nsh CLI (brew install longbridge/tap/nsh). Needs data/messages.json (bun data/generate.ts).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
app="$root/dist/Mailbox-NSH.app"

[ -f "$root/data/messages.json" ] || { echo "data/messages.json is missing: run bun data/generate.ts" >&2; exit 1; }

cd "$here"
rm -rf .nsh/out
nsh check .
nsh package . --target macos --out .nsh/out

rm -rf "$app"
mkdir -p "$root/dist"
mv ".nsh/out/Mailbox-NSH.app" "$app"
mv "$app/Contents/MacOS/MailboxNSH" "$app/Contents/MacOS/Mailbox-NSH"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Mailbox-NSH" "$app/Contents/Info.plist"
# The app reads it with fetch("asset:/messages.json"), which resolves to Resources/nsh/assets/.
mkdir -p "$app/Contents/Resources/nsh/assets"
cp "$root/data/messages.json" "$app/Contents/Resources/nsh/assets/messages.json"
bun "$root/harness/src/build-stamp.ts" nsh "$app"
codesign --force --sign - "$app"
echo "$app"
