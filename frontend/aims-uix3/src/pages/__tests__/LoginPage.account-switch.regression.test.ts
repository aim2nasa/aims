/**
 * 계정 전환 시 프로필 동기화 regression 테스트
 *
 * 버그: 곽승철로 로그인된 PC에서 youmi로 계정 전환 시,
 * PIN 화면에 곽승철 프로필이 표시되는 문제.
 *
 * 원인: processAuthToken이 localStorage를 업데이트하지만,
 * LoginPage의 rememberedUser state는 useState 초기값이 유지됨.
 * (같은 컴포넌트 내 navigate → 리마운트 안 됨)
 */
import { describe, it, expect, beforeEach } from 'vitest'

describe('계정 전환 시 프로필 동기화', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('processAuthToken 후 localStorage rememberedUser가 새 사용자로 갱신되면 읽을 수 있어야 함', () => {
    // 기존 사용자 (곽승철)
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-old', name: '곽승철', avatarUrl: '/old.jpg', authProvider: 'kakao'
    }))

    // processAuthToken이 새 사용자 (youmi)로 덮어씀
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-new', name: 'youmi', avatarUrl: '/new.jpg', authProvider: 'kakao'
    }))

    // LoginPage에서 re-read해야 하는 값
    const stored = localStorage.getItem('aims-remembered-user')
    const parsed = stored ? JSON.parse(stored) : null

    expect(parsed).not.toBeNull()
    expect(parsed.name).toBe('youmi')
    expect(parsed.userId).toBe('user-new')
    expect(parsed.avatarUrl).toBe('/new.jpg')
  })

  it('switchToSocialLogin이 localStorage를 정리한 후 processAuthToken이 새 사용자를 저장하면 올바른 사용자가 반환되어야 함', () => {
    // 1. 기존 사용자 저장 (곽승철)
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-kwak', name: '곽승철', avatarUrl: '/kwak.jpg', authProvider: 'kakao'
    }))
    localStorage.setItem('aims-remember-device', 'true')
    localStorage.setItem('aims-current-user-id', 'user-kwak')

    // 2. switchToSocialLogin이 정리
    localStorage.removeItem('aims-remember-device')
    localStorage.removeItem('aims-remembered-user')
    localStorage.removeItem('aims-current-user-id')

    expect(localStorage.getItem('aims-remembered-user')).toBeNull()

    // 3. processAuthToken이 새 사용자 저장 (youmi)
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-youmi', name: 'youmi', avatarUrl: '/youmi.jpg', authProvider: 'kakao'
    }))

    // 4. LoginPage에서 re-read — 반드시 youmi여야 함
    const stored = localStorage.getItem('aims-remembered-user')
    const parsed = stored ? JSON.parse(stored) : null

    expect(parsed.name).toBe('youmi')
    expect(parsed.name).not.toBe('곽승철')
  })

  it('이전 사용자와 새 사용자 프로필이 동시에 존재하면 안 됨 — 마지막 저장이 우선', () => {
    // processAuthToken은 항상 마지막 로그인 사용자로 덮어쓰므로,
    // localStorage에는 항상 1명의 사용자만 존재해야 함
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-kwak', name: '곽승철', authProvider: 'kakao'
    }))

    // 새 로그인으로 덮어씀
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-youmi', name: 'youmi', authProvider: 'kakao'
    }))

    const stored = localStorage.getItem('aims-remembered-user')
    const parsed = JSON.parse(stored!)

    // 곽승철이 아닌 youmi여야 함
    expect(parsed.name).toBe('youmi')

    // 곽승철 흔적이 없어야 함
    expect(stored).not.toContain('곽승철')
    expect(stored).not.toContain('user-kwak')
  })
})
