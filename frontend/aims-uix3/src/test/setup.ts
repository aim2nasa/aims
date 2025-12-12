/**
 * Vitest Test Setup
 * @description 테스트 환경 설정 파일
 */

import '@testing-library/jest-dom'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Global fetch stub - Node.js에서 상대 URL 파싱 에러 방지
// 테스트에서 fetch를 mock하지 않은 경우 기본 성공 응답 반환
// 테스트에서 vi.spyOn(global, 'fetch')로 mock하면 해당 mock이 우선됨
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }))
))

// useAppleConfirm hook mock (AppleConfirmProvider 없이도 테스트 가능)
vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({
    showAlert: vi.fn().mockResolvedValue(true),
    showConfirm: vi.fn().mockResolvedValue(true)
  }),
  AppleConfirmProvider: ({ children }: { children: ReactNode }) => children
}))

// SFSymbol 컴포넌트 글로벌 mock (CloseButton 등에서 사용)
// React.createElement를 사용 (.ts 파일에서 JSX 미지원)
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name, size, weight }: { name: string; size?: string; weight?: string }) =>
    createElement('span', { 'data-testid': 'sf-symbol', 'data-name': name, 'data-size': size, 'data-weight': weight }, name),
  SFSymbolSize: {
    CAPTION_2: 'caption-2',
    CAPTION_1: 'caption-1',
    FOOTNOTE: 'footnote',
    CALLOUT: 'callout',
    BODY: 'body',
    SUBHEADLINE: 'subheadline',
    HEADLINE: 'headline',
    TITLE_3: 'title-3',
    TITLE_2: 'title-2',
    TITLE_1: 'title-1',
    LARGE_TITLE: 'large-title',
  },
  SFSymbolWeight: {
    ULTRALIGHT: 'ultralight',
    THIN: 'thin',
    LIGHT: 'light',
    REGULAR: 'regular',
    MEDIUM: 'medium',
    SEMIBOLD: 'semibold',
    BOLD: 'bold',
    HEAVY: 'heavy',
    BLACK: 'black',
  },
  default: ({ name }: { name: string }) =>
    createElement('span', { 'data-testid': 'sf-symbol' }, name),
}))

// 각 테스트 후 자동 cleanup
afterEach(() => {
  cleanup()
})

// URL API stub (테스트 환경에서는 URL.createObjectURL이 없음)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn()
}

// navigator.clipboard stub (테스트 환경에서는 clipboard API가 없을 수 있음)
if (typeof navigator.clipboard === 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined)
    },
    writable: true,
    configurable: true
  })
}

// DOMMatrix stub (테스트 환경에서 pdfjs-dist가 필요로 함)
if (typeof DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    constructor() {
      // Mock implementation
    }
  }
}

// window.matchMedia stub (테스트 환경에서 matchMedia API가 없음)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ResizeObserver stub (테스트 환경에서 ResizeObserver API가 없음)
if (typeof ResizeObserver === 'undefined') {
  (global as any).ResizeObserver = class ResizeObserver {
    private callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      // 즉시 콜백 호출 (높이 0으로 시뮬레이션)
      this.callback([], this)
    }
    unobserve() {}
    disconnect() {}
  }
}
