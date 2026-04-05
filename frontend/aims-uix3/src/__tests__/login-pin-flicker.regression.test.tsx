/**
 * Regression 테스트: 카카오 로그인 첫 클릭 무반응 (PIN 모드 깜빡임) 버그
 * @description OAuth 콜백 후 /login?mode=pin 전환 시 rememberedUser와 pinSetupStep
 *   비동기 로드 지연으로 소셜 로그인 버튼이 순간 표시되는 버그 수정 검증
 * @regression
 *   - 2026-03-15: rememberedUser useState 동기 초기화 + PIN 로딩 가드 추가
 *   - 2026-03-15: CustomerProvider getCustomers 쿼리 enabled: isAuthenticated 조건 추가
 * @priority HIGH - 로그인 UX 핵심 플로우
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

// --- Mocks ---

const { mockNavigate, mockSetToken, mockSetUser, mockShowAlert } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetUser: vi.fn(),
  mockShowAlert: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockAuthStore = {
  setToken: mockSetToken,
  setUser: mockSetUser,
  logout: vi.fn(),
  isAuthenticated: false,
  user: null,
  token: null as string | null,
}
vi.mock('@/shared/stores/authStore', () => ({
  useAuthStore: Object.assign(() => mockAuthStore, {
    getState: () => mockAuthStore,
  }),
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ updateCurrentUser: vi.fn() }),
  syncUserIdFromStorage: vi.fn(),
}))

vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: () => ({ isDevMode: false, toggleDevMode: vi.fn() }),
}))

vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({ showAlert: mockShowAlert, showConfirm: vi.fn() }),
}))

vi.mock('@/entities/auth/api', () => ({
  startKakaoLogin: vi.fn(),
  startKakaoLoginSwitch: vi.fn(),
  startNaverLogin: vi.fn(),
  startNaverLoginSwitch: vi.fn(),
  startGoogleLogin: vi.fn(),
  startGoogleLoginSwitch: vi.fn(),
  verifyPin: vi.fn(),
  setPin: vi.fn(),
  getPinStatus: vi.fn().mockResolvedValue({ success: true, hasPin: true, locked: false }),
}))

vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => createElement('span', { 'data-testid': 'sf-symbol' }, name),
  SFSymbolSize: { xSmall: 12, small: 14, medium: 17 },
  SFSymbolWeight: { regular: 400, medium: 500, semibold: 600 },
}))

vi.mock('@/components/Toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import LoginPage from '../pages/LoginPage'

const REMEMBERED_USER = {
  userId: 'user123',
  name: '테스트유저',
  avatarUrl: null,
  authProvider: 'kakao',
}

const renderLoginPage = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  )

// --- Tests ---

describe('[Regression] 카카오 로그인 첫 클릭 무반응 — PIN 모드 깜빡임 방지 (2026-03-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mockAuthStore.token = null
    mockAuthStore.isAuthenticated = false
  })

  describe('핵심 버그: 소셜 로그인 버튼이 PIN 모드에서 순간 노출되면 안 됨', () => {
    it('rememberedUser + authToken 있을 때, 첫 렌더부터 소셜 로그인 버튼 미노출', () => {
      // 시나리오: OAuth 완료 후 /login?mode=pin 진입 (토큰 + 기억된 사용자 존재)
      mockAuthStore.token = 'mock.jwt.token'
      localStorage.setItem('aims-remembered-user', JSON.stringify(REMEMBERED_USER))

      renderLoginPage('/login?mode=pin')

      // 첫 렌더 시점에서 소셜 로그인 버튼이 보이면 안 됨 (로딩 가드 또는 PIN UI)
      expect(screen.queryByText('카카오 로그인')).not.toBeInTheDocument()
      expect(screen.queryByText('네이버 로그인')).not.toBeInTheDocument()
      expect(screen.queryByText('구글 로그인')).not.toBeInTheDocument()
    })

    it('rememberedUser + authToken 있을 때, PIN UI가 최종 표시됨', async () => {
      mockAuthStore.token = 'mock.jwt.token'
      localStorage.setItem('aims-remembered-user', JSON.stringify(REMEMBERED_USER))

      renderLoginPage('/login?mode=pin')

      await waitFor(() => {
        expect(screen.getByText('간편 비밀번호를 입력하세요')).toBeInTheDocument()
        expect(screen.getByText('테스트유저 님')).toBeInTheDocument()
      })
    })

    it('rememberedUser 있지만 authToken 없을 때 (세션 만료), PIN UI 즉시 표시', async () => {
      // 시나리오: 재방문 시 JWT 만료, rememberedUser만 남아있음
      mockAuthStore.token = null
      localStorage.setItem('aims-remembered-user', JSON.stringify(REMEMBERED_USER))

      renderLoginPage('/login?mode=pin')

      // 소셜 로그인 노출 없이 바로 PIN
      expect(screen.queryByText('카카오 로그인')).not.toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('간편 비밀번호를 입력하세요')).toBeInTheDocument()
      })
    })
  })

  describe('엣지 케이스: rememberedUser 없는 경우 정상 폴백', () => {
    it('rememberedUser 없으면 PIN 모드에서도 소셜 로그인 표시 (신규 사용자)', () => {
      // localStorage에 aims-remembered-user 없음
      renderLoginPage('/login?mode=pin')

      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
      expect(screen.getByText('네이버 로그인')).toBeInTheDocument()
    })

    it('일반 모드 (/login)는 항상 소셜 로그인 표시', () => {
      localStorage.setItem('aims-remembered-user', JSON.stringify(REMEMBERED_USER))

      renderLoginPage('/login')

      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
    })
  })

  describe('rememberedUser 동기 초기화 검증', () => {
    it('localStorage의 rememberedUser가 useState 초기값으로 동기 로드됨 (useEffect 의존 아님)', () => {
      mockAuthStore.token = 'mock.jwt.token'
      localStorage.setItem('aims-remembered-user', JSON.stringify(REMEMBERED_USER))

      renderLoginPage('/login?mode=pin')

      // 첫 렌더에서 이미 사용자 이름 또는 로딩이 표시 (소셜 로그인 아님)
      const hasSocialButtons = screen.queryByText('카카오 로그인')
      const hasUserName = screen.queryByText('테스트유저 님')
      const hasLoading = screen.queryByText('로딩 중...')

      // 소셜 로그인 표시 안 됨
      expect(hasSocialButtons).not.toBeInTheDocument()
      // 로딩 또는 PIN UI 중 하나는 표시
      expect(hasUserName || hasLoading).toBeTruthy()
    })

    it('localStorage에 잘못된 JSON이 있어도 크래시하지 않음', () => {
      localStorage.setItem('aims-remembered-user', '{invalid json}')

      // 에러 없이 렌더링 (소셜 로그인 폴백)
      expect(() => renderLoginPage('/login?mode=pin')).not.toThrow()
      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
    })
  })
})
