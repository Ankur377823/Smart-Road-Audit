import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/audits': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/roads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/locations': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/segments': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/checklist': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/reports': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
