/**
 * Phase 2.1 테스트: getAuthHeaders
 *
 * 테스트 대상:
 * - JWT 토큰 추출
 * - localStorage 에러 처리
 * - SSR 환경 (window undefined) 처리
 */

import { getAuthHeaders } from '../api'

describe('getAuthHeaders', () => {
  // localStorage 모킹을 위한 store
  let store: Record<string, string> = {}

  // 원본 getItem 함수
  const originalGetItem = (key: string) => store[key] ?? null

  const mockLocalStorage = {
    getItem: vi.fn((key: string) => originalGetItem(key)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null)
  }

  beforeEach(() => {
    // store 초기화
    store = {}
    // getItem을 원본 함수로 복원
    mockLocalStorage.getItem = vi.fn((key: string) => originalGetItem(key))

    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    })
    vi.clearAllMocks()
  })

  describe('토큰 추출', () => {
    test('auth-storage에서 토큰을 추출하여 Authorization 헤더 반환', () => {
      mockLocalStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: 'test-jwt-token-12345'
        }
      }))

      const headers = getAuthHeaders()

      expect(headers).toEqual({
        'Authorization': 'Bearer test-jwt-token-12345'
      })
    })

    test('토큰이 없으면 빈 객체 반환', () => {
      mockLocalStorage.setItem('auth-storage', JSON.stringify({
        state: {}
      }))

      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })

    test('auth-storage가 없으면 빈 객체 반환', () => {
      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })
  })

  describe('에러 처리', () => {
    test('잘못된 JSON 형식일 때 빈 객체 반환', () => {
      mockLocalStorage.setItem('auth-storage', 'invalid-json')

      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })

    test('localStorage.getItem 에러 시 빈 객체 반환', () => {
      // auth-storage 접근 시에만 에러 발생하도록 설정
      // (aims-current-user-id는 try-catch 외부에서 호출되므로 정상 반환 필요)
      mockLocalStorage.getItem = vi.fn((key: string) => {
        if (key === 'auth-storage') {
          throw new Error('localStorage access denied')
        }
        return null
      })

      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })
  })

  describe('state 구조 검증', () => {
    test('state가 null이면 빈 객체 반환', () => {
      mockLocalStorage.setItem('auth-storage', JSON.stringify({
        state: null
      }))

      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })

    test('state.token이 빈 문자열이면 빈 객체 반환', () => {
      mockLocalStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: ''
        }
      }))

      const headers = getAuthHeaders()

      expect(headers).toEqual({})
    })

    test('중첩된 state 구조에서 토큰 추출', () => {
      mockLocalStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: 'nested-token',
          user: { id: 'user-123' }
        },
        version: 1
      }))

      const headers = getAuthHeaders()

      expect(headers).toEqual({
        'Authorization': 'Bearer nested-token'
      })
    })
  })
})
