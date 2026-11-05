import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/main/main.ts',
    outDir: 'out/main',
    emptyOutDir: true,
    target: 'node24',
  },
})
