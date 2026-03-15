/**
 * LoginPage 토큰 처리 및 소셜 로그인 버튼 테스트
 * @description URL 토큰 처리, 소셜 로그인 버튼 렌더링 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

// 🔒 보안 테스트용: 유효한 JWT 형식의 mock 토큰
// JWT 형식: header.payload.signature (Base64URL 인코딩)
const MOCK_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0In0.test_signature';

// vi.hoisted로 Mock 함수 선언 (hoisting 문제 해결)
const {
  mockNavigate,
  mockSetToken,
  mockSetUser,
  mockUpdateCurrentUser,
  mockSyncUserIdFromStorage,
  mockStartKakaoLogin,
  mockStartKakaoLoginSwitch,
  mockStartNaverLogin,
  mockStartNaverLoginSwitch,
  mockStartGoogleLogin,
  mockStartGoogleLoginSwitch,
  mockShowAlert
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetUser: vi.fn(),
  mockUpdateCurrentUser: vi.fn(),
  mockSyncUserIdFromStorage: vi.fn(),
  mockStartKakaoLogin: vi.fn(),
  mockStartKakaoLoginSwitch: vi.fn(),
  mockStartNaverLogin: vi.fn(),
  mockStartNaverLoginSwitch: vi.fn(),
  mockStartGoogleLogin: vi.fn(),
  mockStartGoogleLoginSwitch: vi.fn(),
  mockShowAlert: vi.fn()
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
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
  useUserStore: () => ({
    updateCurrentUser: mockUpdateCurrentUser
  }),
  syncUserIdFromStorage: mockSyncUserIdFromStorage
}))

vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: () => ({
    isDevMode: false,
    toggleDevMode: vi.fn()
  })
}))

vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({
    showAlert: mockShowAlert,
    showConfirm: vi.fn()
  })
}))

vi.mock('@/entities/auth/api', () => ({
  startKakaoLogin: mockStartKakaoLogin,
  startKakaoLoginSwitch: mockStartKakaoLoginSwitch,
  startNaverLogin: mockStartNaverLogin,
  startNaverLoginSwitch: mockStartNaverLoginSwitch,
  startGoogleLogin: mockStartGoogleLogin,
  startGoogleLoginSwitch: mockStartGoogleLoginSwitch,
  processAuthToken: vi.fn(async (token: string, deps: Record<string, Function>) => {
    deps.setToken(token);
    const API_BASE_URL = '';
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.success && data.user) {
      deps.setUser(data.user);
      deps.updateCurrentUser({ id: data.user._id, name: data.user.name, email: data.user.email, role: data.user.role });
      localStorage.setItem('aims-current-user-id', data.user._id);
      deps.syncUserIdFromStorage();
    }
    deps.navigate('/', { replace: true });
  }),
}))

// SFSymbol Mock
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => createElement('span', { 'data-testid': 'sf-symbol', 'data-name': name }, name),
  SFSymbolSize: { xSmall: 12, small: 14, medium: 17 },
  SFSymbolWeight: { regular: 400, medium: 500, semibold: 600 }
}))

// Toast Mock
vi.mock('@/components/Toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

import LoginPage from '../LoginPage'

const renderWithRouter = (initialEntries: string[] = ['/login']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="main-page">Main Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

// Mock fetch globally
const mockFetch = vi.fn()

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    global.fetch = mockFetch
  })

  describe('소셜 로그인 버튼 렌더링', () => {
    it('카카오 로그인 버튼이 렌더링되어야 함', () => {
      renderWithRouter()

      expect(screen.getByText('카카오 로그인')).toBeInTheDocument()
    })

    it('네이버 로그인 버튼이 렌더링되어야 함', () => {
      renderWithRouter()

      expect(screen.getByText('네이버 로그인')).toBeInTheDocument()
    })

    it('구글 로그인 버튼이 렌더링되어야 함', () => {
      renderWithRouter()

      expect(screen.getByText('구글 로그인')).toBeInTheDocument()
    })

    it('"다른 카카오 계정으로 로그인" 옵션이 존재해야 함', () => {
      renderWithRouter()

      expect(screen.getByText('다른 카카오 계정으로 로그인')).toBeInTheDocument()
    })

    it('개발 환경에서 네이버/구글 버튼이 활성 상태임', () => {
      renderWithRouter()

      const naverButton = screen.getByText('네이버 로그인').closest('button')
      const googleButton = screen.getByText('구글 로그인').closest('button')

      expect(naverButton).not.toBeDisabled()
      expect(googleButton).not.toBeDisabled()
    })

    it('개발 환경에서 "다른 네이버 계정", "다른 구글 계정" 옵션이 표시됨', () => {
      renderWithRouter()

      expect(screen.getByText('다른 네이버 계정')).toBeInTheDocument()
      expect(screen.getByText('다른 구글 계정')).toBeInTheDocument()
    })
  })

  describe('URL 토큰 처리', () => {
    const mockUser = {
      _id: 'user123',
      name: '홍길동',
      email: 'hong@example.com',
      role: 'agent',
      avatarUrl: null,
      authProvider: 'kakao',
      profileCompleted: true
    }

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, user: mockUser })
      })
    })

    it('URL에 토큰이 있으면 setToken을 호출해야 함', async () => {
      renderWithRouter([`/login?token=${MOCK_JWT_TOKEN}`])

      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith(MOCK_JWT_TOKEN)
      })
    })

    it('토큰 처리 후 /api/auth/me를 호출해야 함', async () => {
      renderWithRouter([`/login?token=${MOCK_JWT_TOKEN}`])

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/me'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: `Bearer ${MOCK_JWT_TOKEN}`
            })
          })
        )
      })
    })

    it('processAuthToken이 호출되어야 함 (토큰 처리 + 리다이렉트)', async () => {
      const { processAuthToken } = await import('@/entities/auth/api')
      renderWithRouter([`/login?token=${MOCK_JWT_TOKEN}`])

      await waitFor(() => {
        expect(processAuthToken).toHaveBeenCalledWith(
          MOCK_JWT_TOKEN,
          expect.objectContaining({
            setToken: mockSetToken,
            setUser: mockSetUser,
          })
        )
      })
    })
  })

  describe('에러 처리', () => {
    it('API 호출 실패 시 에러 alert를 표시해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      renderWithRouter(['/login?token=invalid-token'])

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({
          title: '로그인 실패',
          iconType: 'error'
        }))
      })
    })
  })

  describe('로그인 버튼 클릭', () => {
    it('카카오 로그인 버튼 클릭 시 startKakaoLogin 호출', () => {
      renderWithRouter()

      const kakaoButton = screen.getByText('카카오 로그인')
      fireEvent.click(kakaoButton)

      expect(mockStartKakaoLogin).toHaveBeenCalled()
    })

    it('네이버 로그인 버튼 클릭 시 startNaverLogin 호출 (개발 환경)', () => {
      renderWithRouter()

      const naverButton = screen.getByText('네이버 로그인')
      fireEvent.click(naverButton)

      expect(mockStartNaverLogin).toHaveBeenCalled()
    })

    it('구글 로그인 버튼 클릭 시 startGoogleLogin 호출 (개발 환경)', () => {
      renderWithRouter()

      const googleButton = screen.getByText('구글 로그인')
      fireEvent.click(googleButton)

      expect(mockStartGoogleLogin).toHaveBeenCalled()
    })

    it('"다른 카카오 계정으로 로그인" 클릭 시 startKakaoLoginSwitch 호출', () => {
      renderWithRouter()

      const switchButton = screen.getByText('다른 카카오 계정으로 로그인')
      fireEvent.click(switchButton)

      expect(mockStartKakaoLoginSwitch).toHaveBeenCalled()
    })
  })
})
