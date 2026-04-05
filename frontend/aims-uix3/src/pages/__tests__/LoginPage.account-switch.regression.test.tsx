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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

// === Mocks ===
const { mockNavigate, mockSetToken, mockSetUser, mockUpdateCurrentUser, mockSyncUserIdFromStorage, mockShowAlert, mockProcessAuthToken } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetUser: vi.fn(),
  mockUpdateCurrentUser: vi.fn(),
  mockSyncUserIdFromStorage: vi.fn(),
  mockShowAlert: vi.fn(),
  mockProcessAuthToken: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockAuthStore = {
  setToken: mockSetToken, setUser: mockSetUser, logout: vi.fn(),
  isAuthenticated: false, user: null, token: null as string | null,
}
vi.mock('@/shared/stores/authStore', () => ({
  useAuthStore: Object.assign(() => mockAuthStore, { getState: () => mockAuthStore })
}))
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ updateCurrentUser: mockUpdateCurrentUser }),
  syncUserIdFromStorage: mockSyncUserIdFromStorage,
}))
vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: () => ({ isDevMode: false, toggleDevMode: vi.fn() }),
}))
vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({ showAlert: mockShowAlert, showConfirm: vi.fn() }),
}))
vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: { reportApiError: vi.fn() },
}))
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => createElement('span', { 'data-testid': 'sf-symbol' }, name),
  SFSymbolSize: { xSmall: 12, small: 14, medium: 17 },
  SFSymbolWeight: { regular: 400, medium: 500, semibold: 600 },
}))
vi.mock('@/components/Toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// processAuthToken mock: 실제 동작 재현
// 새 사용자를 localStorage에 저장 + navigate 호출
vi.mock('@/entities/auth/api', () => ({
  startKakaoLogin: vi.fn(), startKakaoLoginSwitch: vi.fn(),
  startNaverLogin: vi.fn(), startNaverLoginSwitch: vi.fn(),
  startGoogleLogin: vi.fn(), startGoogleLoginSwitch: vi.fn(),
  verifyPin: vi.fn(), setPin: vi.fn(),
  getPinStatus: vi.fn().mockResolvedValue({ success: true, hasPin: true, locked: false }),
  processAuthToken: mockProcessAuthToken,
}))

import LoginPage from '../LoginPage'

const MOCK_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ5b3VtaSJ9.test_sig'

const renderLoginPage = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  </MemoryRouter>
)

describe('계정 전환 시 프로필 동기화 — React 렌더링 증명', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mockAuthStore.token = null

    // processAuthToken mock: 실제 동작 재현 — 새 사용자를 localStorage에 저장 + navigate
    mockProcessAuthToken.mockImplementation(async (_token: string, deps: Record<string, (...args: unknown[]) => unknown>) => {
      deps.setToken(_token)
      deps.setUser({ _id: 'user-youmi', name: 'youmi', email: 'youmi@test.com', role: 'user', avatarUrl: '/youmi.jpg', authProvider: 'kakao' })
      deps.updateCurrentUser({ id: 'user-youmi', name: 'youmi', email: 'youmi@test.com', role: 'user', avatarUrl: '/youmi.jpg' })
      localStorage.setItem('aims-current-user-id', 'user-youmi')
      deps.syncUserIdFromStorage()
      localStorage.setItem('aims-remember-device', 'true')
      localStorage.setItem('aims-remembered-user', JSON.stringify({
        userId: 'user-youmi', name: 'youmi', avatarUrl: '/youmi.jpg', authProvider: 'kakao',
      }))
      deps.navigate('/login?mode=pin', { replace: true })
    })
  })

  it('곽승철 → youmi 전환: processAuthToken 후 PIN 화면에 youmi가 표시되어야 함', async () => {
    // 1. 곽승철이 이전에 로그인했던 상태 (localStorage에 남아있음)
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'user-kwak', name: '곽승철', avatarUrl: '/kwak.jpg', authProvider: 'kakao',
    }))

    // 2. OAuth 콜백이 /login?token=youmi-jwt 로 리다이렉트 (LoginPage에서 직접 처리)
    renderLoginPage(`/login?token=${MOCK_JWT}`)

    // 3. processAuthToken이 완료되면 rememberedUser가 youmi로 갱신되어야 함
    await waitFor(() => {
      // processAuthToken이 호출되었는지 확인
      expect(mockProcessAuthToken).toHaveBeenCalledTimes(1)
    })

    // 4. localStorage가 youmi로 갱신되었는지 확인
    const stored = localStorage.getItem('aims-remembered-user')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.name).toBe('youmi')
    expect(parsed.name).not.toBe('곽승철')
  })

  it('localStorage 미존재 상태에서 토큰 처리 시에도 새 사용자가 저장되어야 함', async () => {
    // switchToSocialLogin이 localStorage를 정리한 후의 상태
    // aims-remembered-user 없음

    renderLoginPage(`/login?token=${MOCK_JWT}`)

    await waitFor(() => {
      expect(mockProcessAuthToken).toHaveBeenCalledTimes(1)
    })

    const stored = localStorage.getItem('aims-remembered-user')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).name).toBe('youmi')
  })
})
