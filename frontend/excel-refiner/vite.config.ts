import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5180,
    proxy: {
      '/api/insurance-products': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true
      }
    }
  }
})
