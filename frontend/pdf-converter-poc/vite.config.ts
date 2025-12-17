import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    strictPort: true,
    proxy: {
      '/api/convert': {
        target: 'https://aims.giize.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => '/api/pdf/convert'
      }
    }
  }
})
