import { defineConfig } from 'vite'
import { ghia } from 'ghia'
import { react } from '@ghia/react/vite'
import babel from '@rolldown/plugin-babel'
import stylex from '@stylexjs/unplugin'

export default defineConfig({
  plugins: [
    ghia({
      entry: 'src/main.tsx',
      compile: { outfile: '../../dist/Mailbox-GhiaReact.app/Contents/MacOS/Mailbox-GhiaReact' },
    }),
    react(),
    // `reactCompilerPreset` only applies to consumer 'client' environments; Ghia's is 'server'.
    babel({
      include: /\/src\/.*\.tsx$/,
      plugins: ['babel-plugin-react-compiler'],
    }),
    stylex.vite({ useCSSLayers: true }),
  ],
})
