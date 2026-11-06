import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { BunPlugin } from 'bun'

/**
 * `@gpuix/native`'s ESM entry loads the `.node` addon through `createRequire(import.meta.url)`,
 * which the bundler does not follow, so a compiled binary would fail with "Cannot find native
 * binding". Its CJS entry uses a plain `require`, which embeds the addon.
 */
export const nativeCjsPlugin: BunPlugin = {
  name: 'gpuix-native-cjs',
  setup(build) {
    const directory = realpathSync(join(import.meta.dir, 'node_modules/@gpuix/native'))
    const entry = join(directory, 'index.cjs')
    build.onResolve({ filter: /^@gpuix\/native$/ }, () => ({ path: entry }))
  },
}
