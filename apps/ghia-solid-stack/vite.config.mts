import { defineConfig } from 'vite'
import { ghia } from 'ghia'
import { solid } from '@ghia/solid/vite'
import stylex from '@stylexjs/unplugin'

export default defineConfig({
  plugins: [
    ghia({
      entry: 'src/main.tsx',
      compile: { outfile: '../../dist/Mailbox-GhiaSolidStack.app/Contents/MacOS/Mailbox-GhiaSolidStack' },
    }),
    stylex.vite({ useCSSLayers: true }),
    solid(),
  ],
})
