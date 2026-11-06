#!/bin/sh
# Builds dist/Mailbox-SwiftUI.app at the repo root. Needs data/messages.json (bun data/generate.ts).
# CONFIG=debug builds a debug app (with the debug-only state/snapshot dump) into apps/swiftui/debug-app instead.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
config="${CONFIG:-release}"
if [ "$config" = release ]; then
  app="$root/dist/Mailbox-SwiftUI.app"
else
  app="$here/debug-app/Mailbox-SwiftUI.app"
fi

cd "$here"
swift build -c "$config"
bin="$(swift build -c "$config" --show-bin-path)/Mailbox-SwiftUI"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/Mailbox-SwiftUI"
cp "$root/data/messages.json" "$app/Contents/Resources/messages.json"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>Mailbox-SwiftUI</string>
  <key>CFBundleIdentifier</key><string>dev.ghia.bench.mailbox-swiftui</string>
  <key>CFBundleName</key><string>Mailbox-SwiftUI</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST
bun "$root/harness/src/build-stamp.ts" swiftui "$app"
codesign --force --sign - "$app"
echo "$app"
