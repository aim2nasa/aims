import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5182,
    proxy: {
      '/api': {
        target: 'http://100.110.215.65:3010',
        changeOrigin: true,
        headers: {
          'x-api-key': process.env.VITE_API_KEY || ''
        }
      }
    }
  }
})
