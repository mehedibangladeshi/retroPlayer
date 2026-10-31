import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: { resolve: { alias: { '@shared': shared } } },
  preload: {
    resolve: { alias: { '@shared': shared } },
    // Sandboxed renderers only load CommonJS preloads.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
  },
  renderer: {
    plugins: [
      react(),
      {
        // Dev only: React refresh preamble is inline and HMR uses a websocket.
        name: 'dev-csp',
        apply: 'serve',
        transformIndexHtml: (html) =>
          html.replace(
            /(<meta http-equiv="Content-Security-Policy" content=")[^"]*"/,
            `$1default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*"`
          )
      }
    ],
    resolve: { alias: { '@shared': shared, '@assets': resolve(__dirname, '../assets/ui') } },
    server: { fs: { allow: [resolve(__dirname, '..')] } }
  }
})
