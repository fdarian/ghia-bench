#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bundle=../../bin/TestApp.app
rm -rf "$bundle"
mkdir -p "$bundle/Contents/MacOS" ../../bin
swiftc -O main.swift -o "$bundle/Contents/MacOS/testapp"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>testapp</string>
<key>CFBundleIdentifier</key><string>dev.ghia-bench.testapp</string>
<key>CFBundleName</key><string>TestApp</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$bundle" >/dev/null
echo "built $bundle"
