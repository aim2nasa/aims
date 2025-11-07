/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),  // React Fast Refresh 기본 활성화
    tsconfigPaths()
  ],
  server: {
    proxy: {
      // API 요청을 백엔드 서버로 프록시
      '/api': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true
      }
    },
    // HMR 설정: 에러 오버레이 완전 비활성화
    hmr: {
      overlay: false
    },
    // 파일 감시 최적화
    watch: {
      // CSS 파일 감시 제외 - Vite CSS HMR이 Windows에서 크래시 유발
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/*.css'  // CSS 파일 완전히 무시
      ],
      // 폴링 비활성화 (Windows 네이티브 환경)
      usePolling: false
    },
    // 개발 서버 안정성 설정
    strictPort: false,
    cors: true
  },
  // CSS 설정: HMR 비활성화, 전체 새로고침 사용
  css: {
    devSourcemap: false,
    // CSS 변경 시 전체 페이지 새로고침
    modules: {
      localsConvention: 'camelCase'
    }
  },
  // 빌드 최적화
  build: {
    cssCodeSplit: false,
    // 청크 크기 경고 임계값 상향 (빌드 안정성)
    chunkSizeWarningLimit: 1000
  },
  // 최적화 설정
  optimizeDeps: {
    // 사전 번들링에서 제외할 패키지
    exclude: []
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

