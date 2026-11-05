import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'

const messagesPath = fileURLToPath(new URL('../../data/messages.json', import.meta.url))

function bundleMessages(): Plugin {
  return {
    name: 'bundle-messages',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'messages.json', source: readFileSync(messagesPath) })
    },
  }
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [solid(), bundleMessages()],
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
  },
})
