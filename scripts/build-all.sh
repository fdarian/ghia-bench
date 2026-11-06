#!/usr/bin/env bash
# Everything needed before a run, from a fresh clone: the pinned Ghia build, the message data, the
# measurement helper and the six packaged apps in dist/.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

"$root/scripts/setup-ghia.sh"

[ -f data/messages.json ] || bun data/generate.ts

# The harness has no dependencies to install: it uses Bun and Node built-ins only.
"$root/harness/helper/build.sh"

"$root/apps/electron/build.sh"
"$root/apps/ghia/build.sh"
"$root/apps/gpuix/build.sh"
"$root/apps/gpui/build.sh"
"$root/apps/swiftui/build.sh"
"$root/apps/nsh/build.sh"
"$root/apps/mygo/build.sh"

echo
echo "dist/ bundle sizes:"
du -sh dist/Mailbox-Electron.app dist/Mailbox-Ghia.app dist/Mailbox-GPUIX.app dist/Mailbox-GPUI.app dist/Mailbox-SwiftUI.app dist/Mailbox-NSH.app dist/Mailbox-MyGo.app
