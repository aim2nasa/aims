import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    // .js 파일에서 JSX 사용 허용
    include: "**/*.{jsx,js}",
  })],
  
  // 서버 설정
  server: {
    port: 3006,
    host: true,
    open: false
  },
  
  // 빌드 설정
  build: {
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/icons'],
          utils: ['axios', 'dayjs']
        }
      }
    }
  },
  
  // 개발 서버 프록시 (필요시)
  // server: {
  //   proxy: {
  //     '/api': 'http://localhost:5000'
  //   }
  // },
  
  // 경로 별칭 설정
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@utils': path.resolve(__dirname, './src/utils')
    }
  },
  
  // CSS 설정
  css: {
    postcss: './postcss.config.js'
  },
  
  // 환경변수 접두사
  envPrefix: 'VITE_',
  
  // 최적화 설정
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'antd',
      '@ant-design/icons',
      'axios',
      'dayjs'
    ]
  }
})