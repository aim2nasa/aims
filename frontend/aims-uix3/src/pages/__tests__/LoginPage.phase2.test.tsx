/**
 * LoginPage Phase 2 테스트 — PIN 입력/설정 UI
 * @description PIN 모드 렌더링, PinInput dot 상태, 흔들림 애니메이션 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

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

const renderLoginPage = (path = '/login') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage Phase 2 — PIN 모드', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('PIN 입력 모드 (?mode=pin)', () => {
    beforeEach(() => {
      // PIN 모드에 필요한 기억된 사용자 정보 설정
      localStorage.setItem('aims-remembered-user', JSON.stringify({
        userId: 'user123',
        name: '김소라',
        authProvider: 'kakao'
      }))
    })

    it('?mode=pin으로 접속 시 PIN 입력 화면이 표시됨', () => {
      renderLoginPage('/login?mode=pin')
      expect(screen.getByText('간편 비밀번호를 입력하세요')).toBeInTheDocument()
    })

    it('기억된 사용자 이름이 표시됨', () => {
      renderLoginPage('/login?mode=pin')
      expect(screen.getByText('김소라 님')).toBeInTheDocument()
    })

    it('PIN dot 4개가 표시됨', () => {
      renderLoginPage('/login?mode=pin')
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots).toHaveLength(4)
    })

    it('초기 상태에서 모든 dot이 비어있음', () => {
      renderLoginPage('/login?mode=pin')
      const dots = screen.getAllByTestId('pin-dot')
      dots.forEach(dot => {
        expect(dot).not.toHaveClass('pin-dot--filled')
      })
    })

    it('"다른 계정으로 로그인" 링크가 표시됨', () => {
      renderLoginPage('/login?mode=pin')
      expect(screen.getByText('다른 계정으로 로그인')).toBeInTheDocument()
    })

    it('"비밀번호를 잊으셨나요?" 링크가 표시됨', () => {
      renderLoginPage('/login?mode=pin')
      expect(screen.getByText('비밀번호를 잊으셨나요?')).toBeInTheDocument()
    })

    it('"다른 계정으로 로그인" 클릭 시 소셜 로그인 화면으로 전환', () => {
      renderLoginPage('/login?mode=pin')
      fireEvent.click(screen.getByText('다른 계정으로 로그인'))
      // 소셜 로그인 버튼이 표시되어야 함
      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
    })

    it('숨겨진 input이 존재하고 numeric inputMode를 가짐', () => {
      renderLoginPage('/login?mode=pin')
      const hiddenInput = document.querySelector('input[inputmode="numeric"]')
      expect(hiddenInput).not.toBeNull()
    })
  })

  describe('PIN 입력 동작', () => {
    beforeEach(() => {
      localStorage.setItem('aims-remembered-user', JSON.stringify({
        userId: 'user123',
        name: '김소라',
        authProvider: 'kakao'
      }))
    })

    it('숫자 입력 시 dot이 채워짐', () => {
      renderLoginPage('/login?mode=pin')
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '12' } })
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots[0]).toHaveClass('pin-dot--filled')
      expect(dots[1]).toHaveClass('pin-dot--filled')
      expect(dots[2]).not.toHaveClass('pin-dot--filled')
    })
  })

  describe('일반 모드 유지', () => {
    it('?mode=pin 없으면 기존 소셜 로그인 화면 유지', () => {
      renderLoginPage('/login')
      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
      expect(screen.getByText('네이버 로그인')).toBeInTheDocument()
      expect(screen.getByText('구글 로그인')).toBeInTheDocument()
    })
  })
})
