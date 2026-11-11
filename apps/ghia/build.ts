/**
 * Packages the executable `ghia build` compiled into `<repo>/dist/Mailbox-Ghia.app`: messages.json
 * in Contents/Resources and the Info.plist. build.sh runs `ghia build` first, then stamps and signs.
 *
 * With `--aot` it builds `Mailbox-GhiaAOT.app` from the same sources instead, compiled ahead of time
 * to machine code (a Bun with `compile.aot`). `ghia build` cannot pass that option, so this runs
 * ghia's `build()` without its compile step and compiles `dist/main.js` itself, with the options
 * `ghia build` uses (bytecode, minify). build-aot.sh runs it, then stamps and signs.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nativeCjsPlugin } from './native-cjs-plugin'

const aot = Bun.argv.includes('--aot')
const NAME = aot ? 'Mailbox-GhiaAOT' : 'Mailbox-Ghia'
const root = import.meta.dir
const repo = join(root, '../..')
const app = join(repo, 'dist', `${NAME}.app`)
const binary = join(app, 'Contents/MacOS', NAME)

if (aot) {
  process.env.NODE_ENV = 'production'
  const { build } = await import('ghia')
  rmSync(app, { recursive: true, force: true })
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true })

  await build({ root, compile: false })

  const result = await Bun.build({
    entrypoints: [join(root, 'dist/main.js')],
    compile: { outfile: binary, autoloadBunfig: false, aot: true },
    plugins: [nativeCjsPlugin],
    format: 'esm',
    bytecode: true,
    minify: true,
  })
  for (const log of result.logs) console.log(log)
  if (!result.success) throw new Error('Bun.build failed')
} else if (!existsSync(binary)) {
  throw new Error('ghia build did not write the executable')
}
mkdirSync(join(app, 'Contents/Resources'), { recursive: true })

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
