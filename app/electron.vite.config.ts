import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: { resolve: { alias: { '@shared': shared } } },
  preload: { resolve: { alias: { '@shared': shared } } },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': shared, '@assets': resolve(__dirname, '../assets/ui') } },
    server: { fs: { allow: [resolve(__dirname, '..')] } }
  }
})
