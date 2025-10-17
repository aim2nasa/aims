/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: {
      // API 요청을 백엔드 서버로 프록시
      '/api': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/**', // Playwright E2E 테스트 제외
    ],
    coverage: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/tests/**', // Playwright E2E 테스트
        '**/*.config.*', // 모든 설정 파일
        '**/src/test/**', // 테스트 셋업 파일
        '**/__tests__/**', // 테스트 파일 자체
        '**/*.test.*', // 테스트 파일
        '**/*.spec.*', // 스펙 파일
      ],
    },
  },
})

