/**
 * Builds `<repo>/dist/Mailbox-Ghia.app`: one compiled Bun binary (Solid plugin, native addon
 * embedded) plus messages.json in Contents/Resources.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import solidPlugin from '@ghia/solid/bun-plugin'
import { nativeCjsPlugin } from './native-cjs-plugin'

process.env.NODE_ENV = 'production'

// The executable keeps one name whatever the bundle is called, so every build is the same program.
const NAME = 'Mailbox-Ghia'
const root = import.meta.dir
// build.sh runs this from an isolated copy when the Ghia packages come from npm.
const repo = process.env.BENCH_ROOT ?? join(root, '../..')
const app = process.env.GHIA_APP_OUT ?? join(repo, 'dist', `${NAME}.app`)
const binary = join(app, 'Contents/MacOS', NAME)

rmSync(app, { recursive: true, force: true })
mkdirSync(join(app, 'Contents/MacOS'), { recursive: true })
mkdirSync(join(app, 'Contents/Resources'), { recursive: true })

const result = await Bun.build({
  entrypoints: [join(root, 'src/main.tsx')],
  compile: { outfile: binary, autoloadBunfig: false },
  plugins: [solidPlugin, nativeCjsPlugin],
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
})
for (const log of result.logs) console.log(log)
if (!result.success) throw new Error('Bun.build failed')

cpSync(join(repo, 'data/messages.json'), join(app, 'Contents/Resources/messages.json'))

writeFileSync(
  join(app, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${NAME}</string>
  <key>CFBundleIdentifier</key><string>dev.ghiabench.mailbox-ghia</string>
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

const sign = Bun.spawnSync(['codesign', '--force', '--sign', '-', app], { stderr: 'inherit' })
if (sign.exitCode !== 0) throw new Error('codesign failed')
