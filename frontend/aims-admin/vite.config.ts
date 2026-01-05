import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5178,
    host: true,
    proxy: {
      // Shadow Monitor API (document_pipeline FastAPI - 포트 8100)
      '/shadow': {
        target: 'http://100.110.215.65:8100',
        secure: false,
        changeOrigin: true,
      },
    },
  },
})
