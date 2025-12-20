/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import cssReloadPlugin from './vite-plugins/css-reload-plugin.js'
import path from 'path'
import { execSync } from 'child_process'

// Git hash 가져오기 (빌드 시점에 실행)
const getGitHash = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  // 빌드 시점에 환경변수 정의
  define: {
    __GIT_HASH__: JSON.stringify(getGitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),  // React Fast Refresh 기본 활성화
    tsconfigPaths(),
    cssReloadPlugin()  // CSS 변경 시 전체 리로드 강제 (Windows 안정성)
  ],
  // vi.mock에서 @/ 경로 별칭 해석을 위한 resolve 설정
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 개발 서버 포트 고정 (카카오 OAuth 콜백 URL과 일치해야 함)
    port: 5177,
    strictPort: true,  // 포트 사용 중이면 에러 (다른 포트로 변경 금지)
    proxy: {
      // SSE 스트리밍 엔드포인트 - 별도 설정 필요
      '^/api/.*/stream$': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true,
        // SSE 스트리밍을 위한 설정
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        }
      },
      // AI 채팅 SSE 엔드포인트
      '/api/chat': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true,
        configure: (proxy) => {
          // SSE 스트리밍을 위한 버퍼링 비활성화
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
            proxyReq.setHeader('Cache-Control', 'no-cache');
          });
        }
      },
      // API 요청을 백엔드 서버로 프록시
      '/api': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true
      }
    },
    // HMR 설정 최적화
    hmr: {
      overlay: true,
      // WebSocket 연결 안정화
      protocol: 'ws',
      timeout: 30000
    },
    // 파일 감시 최적화 (CSS 감시 활성화)
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.vscode/**'
        // CSS 파일 감시 활성화 - HMR 즉시 반영
      ],
      // Windows에서 안정적인 파일 감시
      usePolling: false
    },
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
    chunkSizeWarningLimit: 1000,
    // 명시적 hash 기반 캐시 무효화 (브라우저 캐싱 방지)
    rollupOptions: {
      output: {
        // 진입점 파일명에 hash 추가 (예: index-BEty5ehk.js)
        entryFileNames: 'assets/[name]-[hash].js',
        // 청크 파일명에 hash 추가 (예: DocumentSearchView-QnFOKP7v.js)
        chunkFileNames: 'assets/[name]-[hash].js',
        // 정적 에셋에 hash 추가 (예: style-DpVtKAcz.css)
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
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

