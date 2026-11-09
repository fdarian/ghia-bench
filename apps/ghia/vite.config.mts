import { defineConfig } from 'vite'
import { ghia } from 'ghia'
import { solid } from '@ghia/solid/vite'

export default defineConfig({
  plugins: [
    ghia({
      entry: 'src/main.tsx',
      compile: { outfile: '../../dist/Mailbox-Ghia.app/Contents/MacOS/Mailbox-Ghia' },
    }),
    solid(),
  ],
})
