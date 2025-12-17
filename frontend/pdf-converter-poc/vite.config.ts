import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pdf-converter/',
  server: {
    port: 5179,
    strictPort: true,
    proxy: {
      '/api/pdf': {
        target: 'https://aims.giize.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
