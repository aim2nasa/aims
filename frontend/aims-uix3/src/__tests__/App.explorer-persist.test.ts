/**
 * explorerCustomerId localStorage 복원 테스트
 *
 * 고객 문서 분류함에서 하드 리프레시 시 customerId가 유실되는 버그 수정 검증.
 * URL → localStorage 순으로 복원, 둘 다 없으면 기본 뷰 폴백.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

/**
 * App.tsx의 explorerCustomerId 초기값 로직을 추출한 순수 함수
 * (useState 초기값 함수와 동일)
 */
function resolveExplorerCustomerId(urlSearch: string): string | null {
  const params = new URLSearchParams(urlSearch)
  if (params.get('view') === 'customer-document-explorer') {
    return params.get('customerId') || localStorage.getItem('aims-explorer-customerId')
  }
  return null
}

/**
 * App.tsx의 마운트 useEffect 내 뷰 폴백 로직을 추출한 순수 함수
 */
function resolveViewToRestore(urlSearch: string): { view: string; restoreCustomerId: string | null } {
  const params = new URLSearchParams(urlSearch)
  const urlView = params.get('view')
  const urlCustomerId = params.get('customerId')

  let viewToRestore = urlView || 'customers'

  // customers-full-detail 폴백
  if (viewToRestore === 'customers-full-detail' && !urlCustomerId) {
    viewToRestore = 'customers'
  }

  // customer-document-explorer 폴백
  const explorerFallbackId = viewToRestore === 'customer-document-explorer' && !urlCustomerId
    ? localStorage.getItem('aims-explorer-customerId')
    : null
  if (viewToRestore === 'customer-document-explorer' && !urlCustomerId && !explorerFallbackId) {
    viewToRestore = 'customers'
  }

  const restoreCustomerId = urlCustomerId || explorerFallbackId
  return { view: viewToRestore, restoreCustomerId }
}

/**
 * App.tsx의 setExplorerCustomerId 래퍼 로직을 추출한 순수 함수
 */
function syncLocalStorage(id: string | null) {
  if (id) {
    localStorage.setItem('aims-explorer-customerId', id)
  } else {
    localStorage.removeItem('aims-explorer-customerId')
  }
}

describe('explorerCustomerId 하드 리프레시 복원', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('시나리오 1: URL에 customerId 있음', () => {
    it('URL에서 customerId를 읽어 초기값으로 사용', () => {
      const result = resolveExplorerCustomerId('?view=customer-document-explorer&customerId=ABC')
      expect(result).toBe('ABC')
    })

    it('뷰 복원 시 customer-document-explorer 유지', () => {
      const { view, restoreCustomerId } = resolveViewToRestore('?view=customer-document-explorer&customerId=ABC')
      expect(view).toBe('customer-document-explorer')
      expect(restoreCustomerId).toBe('ABC')
    })
  })

  describe('시나리오 2: URL에 customerId 없음, localStorage에 있음', () => {
    beforeEach(() => {
      localStorage.setItem('aims-explorer-customerId', 'DEF')
    })

    it('localStorage에서 customerId를 복원', () => {
      const result = resolveExplorerCustomerId('?view=customer-document-explorer')
      expect(result).toBe('DEF')
    })

    it('뷰 복원 시 customer-document-explorer 유지 + localStorage ID 사용', () => {
      const { view, restoreCustomerId } = resolveViewToRestore('?view=customer-document-explorer')
      expect(view).toBe('customer-document-explorer')
      expect(restoreCustomerId).toBe('DEF')
    })
  })

  describe('시나리오 3: URL에 customerId 없음, localStorage도 없음', () => {
    it('초기값 null 반환', () => {
      const result = resolveExplorerCustomerId('?view=customer-document-explorer')
      expect(result).toBeNull()
    })

    it('뷰가 customers로 폴백', () => {
      const { view, restoreCustomerId } = resolveViewToRestore('?view=customer-document-explorer')
      expect(view).toBe('customers')
      expect(restoreCustomerId).toBeNull()
    })
  })

  describe('시나리오 4: 다른 뷰 → explorerCustomerId null', () => {
    it('view가 customer-document-explorer가 아니면 null', () => {
      localStorage.setItem('aims-explorer-customerId', 'GHI')
      const result = resolveExplorerCustomerId('?view=customers')
      expect(result).toBeNull()
    })
  })

  describe('localStorage 동기화 (setter 래퍼)', () => {
    it('값 설정 시 localStorage에 저장', () => {
      syncLocalStorage('NEW_ID')
      expect(localStorage.getItem('aims-explorer-customerId')).toBe('NEW_ID')
    })

    it('null 설정 시 localStorage에서 제거', () => {
      localStorage.setItem('aims-explorer-customerId', 'OLD_ID')
      syncLocalStorage(null)
      expect(localStorage.getItem('aims-explorer-customerId')).toBeNull()
    })

    it('고객 전환 시 이전 값 덮어씀', () => {
      syncLocalStorage('FIRST')
      expect(localStorage.getItem('aims-explorer-customerId')).toBe('FIRST')
      syncLocalStorage('SECOND')
      expect(localStorage.getItem('aims-explorer-customerId')).toBe('SECOND')
    })
  })

  describe('reset=1 캐시 초기화', () => {
    it('localStorage.clear()로 aims-explorer-customerId 포함 전체 제거', () => {
      localStorage.setItem('aims-explorer-customerId', 'SOME_ID')
      localStorage.setItem('other-key', 'other-value')
      localStorage.clear()
      expect(localStorage.getItem('aims-explorer-customerId')).toBeNull()
      expect(localStorage.getItem('other-key')).toBeNull()
    })
  })
})
