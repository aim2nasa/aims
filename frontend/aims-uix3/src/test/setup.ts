/**
 * Vitest Test Setup
 * @description 테스트 환경 설정 파일
 */

import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
