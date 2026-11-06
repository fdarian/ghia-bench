#!/bin/sh
# Builds dist/Mailbox-GPUI.app at the repo root. Needs data/messages.json (bun data/generate.ts).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
app="$root/dist/Mailbox-GPUI.app"

cd "$here"
# Optional wrapper command ($GHIA_HEAVY, e.g. a lock script) that serialises heavy builds; run cargo directly without it.
heavy="${GHIA_HEAVY:-}"
if [ -n "$heavy" ] && [ -x "$heavy" ]; then
  "$heavy" cargo build --release
else
  cargo build --release
fi

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$here/target/release/Mailbox-GPUI" "$app/Contents/MacOS/Mailbox-GPUI"
cp "$root/data/messages.json" "$app/Contents/Resources/messages.json"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>Mailbox-GPUI</string>
  <key>CFBundleIdentifier</key><string>dev.ghia.bench.mailbox-gpui</string>
  <key>CFBundleName</key><string>Mailbox-GPUI</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
bun "$root/harness/src/build-stamp.ts" gpui "$app"
codesign --force --sign - "$app"
echo "$app"
