import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
