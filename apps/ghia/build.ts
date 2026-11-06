/**
 * Builds `<repo>/dist/Mailbox-Ghia.app`: one compiled Bun binary (Solid plugin, native addon
 * embedded) plus messages.json in Contents/Resources. build.sh stamps and signs it.
 *
 * With `--aot` it builds `Mailbox-GhiaAOT.app` from the same sources, compiled ahead of time to
 * machine code (a Bun with `compile.aot`); build-aot.sh stamps and signs it.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import solidPlugin from '@ghia/solid/bun-plugin'
import { nativeCjsPlugin } from './native-cjs-plugin'

process.env.NODE_ENV = 'production'

const aot = Bun.argv.includes('--aot')
const NAME = aot ? 'Mailbox-GhiaAOT' : 'Mailbox-Ghia'
const root = import.meta.dir
const repo = join(root, '../..')
const app = join(repo, 'dist', `${NAME}.app`)
const binary = join(app, 'Contents/MacOS', NAME)

rmSync(app, { recursive: true, force: true })
mkdirSync(join(app, 'Contents/MacOS'), { recursive: true })
mkdirSync(join(app, 'Contents/Resources'), { recursive: true })

const result = await Bun.build({
  entrypoints: [join(root, 'src/main.tsx')],
  compile: aot ? { outfile: binary, autoloadBunfig: false, aot: true } : { outfile: binary, autoloadBunfig: false },
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
  <key>CFBundleIdentifier</key><string>${aot ? 'dev.ghiabench.mailbox-ghiaaot' : 'dev.ghiabench.mailbox-ghia'}</string>
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
