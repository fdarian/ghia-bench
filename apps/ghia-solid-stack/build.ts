/**
 * Packages the executable `ghia build` compiled into `<repo>/dist/Mailbox-GhiaSolidStack.app`: messages.json
 * and the StyleX stylesheet in Contents/Resources, and the Info.plist. build.sh runs `ghia build`
 * first, then stamps and signs.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const NAME = 'Mailbox-GhiaSolidStack'
const root = import.meta.dir
const repo = join(root, '../..')
const app = join(repo, 'dist', `${NAME}.app`)
const binary = join(app, 'Contents/MacOS', NAME)

if (!existsSync(binary)) throw new Error('ghia build did not write the executable')
mkdirSync(join(app, 'Contents/Resources'), { recursive: true })

cpSync(join(repo, 'data/messages.json'), join(app, 'Contents/Resources/messages.json'))
cpSync(join(root, 'dist/assets/stylex.css'), join(app, 'Contents/Resources/stylex.css'))

writeFileSync(
  join(app, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${NAME}</string>
  <key>CFBundleIdentifier</key><string>dev.ghiabench.mailbox-ghiasolidstack</string>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>Mailbox</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
`,
)
