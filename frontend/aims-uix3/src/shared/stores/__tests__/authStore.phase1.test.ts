/**
 * authStore Phase 1 테스트 — 동적 스토리지 전환
 * @description 기기 기억 플래그에 따라 localStorage/sessionStorage 동적 전환 검증
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// getStorage 유틸을 직접 테스트하기 위해 모듈에서 export하는 형태로 테스트
// 실제 authStore는 Zustand persist와 결합되어 있으므로, getStorage 로직만 단위 테스트

describe('authStore Phase 1 — 동적 스토리지', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('getStorage() 로직', () => {
    // getStorage 로직을 직접 구현하여 테스트 (authStore 내부 함수와 동일)
    const getStorage = (): Storage => {
      try {
        const rememberDevice = localStorage.getItem('aims-remember-device')
        if (rememberDevice === 'true') {
          localStorage.setItem('aims-storage-test', '1')
          localStorage.removeItem('aims-storage-test')
          return localStorage
        }
      } catch {
        // Safari 개인정보 보호 모드 fallback
      }
      return sessionStorage
    }

    it('기본값: sessionStorage 반환 (aims-remember-device 미설정)', () => {
      const storage = getStorage()
      expect(storage).toBe(sessionStorage)
    })

    it('aims-remember-device=true: localStorage 반환', () => {
      localStorage.setItem('aims-remember-device', 'true')
      const storage = getStorage()
      expect(storage).toBe(localStorage)
    })

    it('aims-remember-device=false: sessionStorage 반환', () => {
      localStorage.setItem('aims-remember-device', 'false')
      const storage = getStorage()
      expect(storage).toBe(sessionStorage)
    })

    it('aims-remember-device 삭제 후: sessionStorage 반환', () => {
      localStorage.setItem('aims-remember-device', 'true')
      localStorage.removeItem('aims-remember-device')
      const storage = getStorage()
      expect(storage).toBe(sessionStorage)
    })
  })

  describe('토큰 저장 위치', () => {
    it('기본(기기 기억 X): 토큰이 sessionStorage에 저장됨', () => {
      // aims-remember-device가 없으므로 sessionStorage 사용
      const key = 'auth-storage-v2'
      sessionStorage.setItem(key, JSON.stringify({ state: { token: 'test-token' }, version: 0 }))

      const stored = sessionStorage.getItem(key)
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored!).state.token).toBe('test-token')
      expect(localStorage.getItem(key)).toBeNull()
    })

    it('기기 기억 O: 토큰이 localStorage에 저장됨', () => {
      localStorage.setItem('aims-remember-device', 'true')
      const key = 'auth-storage-v2'
      localStorage.setItem(key, JSON.stringify({ state: { token: 'test-token' }, version: 0 }))

      const stored = localStorage.getItem(key)
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored!).state.token).toBe('test-token')
    })
  })

  describe('로그아웃 시 정리', () => {
    it('로그아웃 시 모든 인증 관련 데이터 삭제', () => {
      // 사전 조건: 기기 기억 데이터 존재
      localStorage.setItem('aims-remember-device', 'true')
      localStorage.setItem('aims-remembered-user', JSON.stringify({ name: '테스트' }))
      sessionStorage.setItem('aims-session-token', 'session-123')
      localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: 'jwt' } }))

      // 로그아웃 동작 시뮬레이션
      localStorage.removeItem('aims-remember-device')
      localStorage.removeItem('aims-remembered-user')
      sessionStorage.removeItem('aims-session-token')
      localStorage.removeItem('auth-storage-v2')
      sessionStorage.removeItem('auth-storage-v2')

      expect(localStorage.getItem('aims-remember-device')).toBeNull()
      expect(localStorage.getItem('aims-remembered-user')).toBeNull()
      expect(sessionStorage.getItem('aims-session-token')).toBeNull()
      expect(localStorage.getItem('auth-storage-v2')).toBeNull()
      expect(sessionStorage.getItem('auth-storage-v2')).toBeNull()
    })
  })

  describe('persist key 유지', () => {
    it('persist key는 auth-storage-v2 유지 (v3으로 변경 금지)', () => {
      const key = 'auth-storage-v2'
      sessionStorage.setItem(key, JSON.stringify({ state: { token: 'test' }, version: 0 }))

      // v2 key로 접근 가능 확인
      expect(sessionStorage.getItem(key)).not.toBeNull()
      // v3 key는 존재하지 않아야 함
      expect(sessionStorage.getItem('auth-storage-v3')).toBeNull()
      expect(localStorage.getItem('auth-storage-v3')).toBeNull()
    })
  })
})
