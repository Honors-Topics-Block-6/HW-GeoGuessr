import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  optimizeDeps: {
    include: ['canvas-confetti'],
  },
  build: {
    commonjsOptions: {
      include: [/canvas-confetti/, /node_modules/],
    },
  },
})
