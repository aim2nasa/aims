/**
 * LoginPage Phase 1 테스트 — 체크박스 + 모바일 대응
 * @description "다음에 간편 비밀번호로 빠르게 로그인" 체크박스 렌더링 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

// vi.hoisted로 Mock 함수 선언
const {
  mockNavigate,
  mockSetToken,
  mockSetUser,
  mockUpdateCurrentUser,
  mockSyncUserIdFromStorage,
  mockShowAlert
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetUser: vi.fn(),
  mockUpdateCurrentUser: vi.fn(),
  mockSyncUserIdFromStorage: vi.fn(),
  mockShowAlert: vi.fn()
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/shared/stores/authStore', () => ({
  useAuthStore: () => ({
    setToken: mockSetToken,
    setUser: mockSetUser,
    isAuthenticated: false,
    user: null,
    token: null
  })
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ updateCurrentUser: mockUpdateCurrentUser }),
  syncUserIdFromStorage: mockSyncUserIdFromStorage
}))

vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: () => ({ isDevMode: false, toggleDevMode: vi.fn() })
}))

vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({ showAlert: mockShowAlert, showConfirm: vi.fn() })
}))

vi.mock('@/entities/auth/api', () => ({
  startKakaoLogin: vi.fn(),
  startKakaoLoginSwitch: vi.fn(),
  startNaverLogin: vi.fn(),
  startNaverLoginSwitch: vi.fn(),
  startGoogleLogin: vi.fn(),
  startGoogleLoginSwitch: vi.fn()
}))

vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => createElement('span', { 'data-testid': 'sf-symbol' }, name),
  SFSymbolSize: { xSmall: 12, small: 14, medium: 17 },
  SFSymbolWeight: { regular: 400, medium: 500, semibold: 600 }
}))

vi.mock('@/components/Toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() }
}))

import LoginPage from '../LoginPage'

const renderLoginPage = () => {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage Phase 1 — 체크박스', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  // 체크박스 제거됨 — 전 사용자 PIN 강제 (Dana/Security 합의)

  describe('소셜 로그인 버튼', () => {
    it('소셜 로그인 버튼 3개가 모두 렌더링됨', () => {
      renderLoginPage()
      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
      expect(screen.getByText('네이버 로그인')).toBeInTheDocument()
      expect(screen.getByText('구글 로그인')).toBeInTheDocument()
    })

    it('다른 계정 전환 링크가 렌더링됨 (개발 환경: 카카오/네이버/구글 모두)', () => {
      renderLoginPage()
      expect(screen.getByText('다른 카카오 계정으로 로그인')).toBeInTheDocument()
      expect(screen.getByText('다른 네이버 계정')).toBeInTheDocument()
      expect(screen.getByText('다른 구글 계정')).toBeInTheDocument()
    })
  })

  describe('prod 환경 — 네이버/구글 버튼 숨김 (regression)', () => {
    beforeEach(() => {
      vi.stubEnv('PROD', true)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('prod에서는 카카오 로그인만 노출되고 네이버/구글 버튼은 DOM에서 제거됨', () => {
      renderLoginPage()
      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
      expect(screen.queryByText('네이버 로그인')).not.toBeInTheDocument()
      expect(screen.queryByText('구글 로그인')).not.toBeInTheDocument()
    })
  })
})
