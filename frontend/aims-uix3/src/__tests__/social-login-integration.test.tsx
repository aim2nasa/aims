/**
 * 소셜 로그인 통합 테스트
 * @description 카카오/네이버/구글 전체 로그인 흐름 통합 테스트
 * @regression
 *   - 로그인 후 Store 동기화 확인
 *   - 에러 처리 흐름 확인
 *   - 계정 전환 기능 확인
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createElement } from 'react'

// vi.hoisted로 Mock 함수 선언 (hoisting 문제 해결)
const {
  mockNavigate,
  mockSetToken,
  mockSetUser,
  mockSetLoading,
  mockLogout,
  mockUpdateCurrentUser,
  mockSyncUserIdFromStorage,
  mockGetCurrentUser,
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
  mockSetLoading: vi.fn(),
  mockLogout: vi.fn(),
  mockUpdateCurrentUser: vi.fn(),
  mockSyncUserIdFromStorage: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockStartKakaoLogin: vi.fn(),
  mockStartKakaoLoginSwitch: vi.fn(),
  mockStartNaverLogin: vi.fn(),
  mockStartNaverLoginSwitch: vi.fn(),
  mockStartGoogleLogin: vi.fn(),
  mockStartGoogleLoginSwitch: vi.fn(),
  mockShowAlert: vi.fn()
}))

let mockHref = ''

// Mock 설정
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
    setLoading: mockSetLoading,
    logout: mockLogout,
    isAuthenticated: false,
    user: null,
    token: null
  })
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    updateCurrentUser: mockUpdateCurrentUser,
    currentUser: null,
    userId: null
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
  getCurrentUser: mockGetCurrentUser,
  processAuthToken: vi.fn(async (token: string, deps: Record<string, (...args: unknown[]) => unknown>) => {
    deps.setToken(token);
    const user = await mockGetCurrentUser(token);
    deps.setUser(user);
    deps.updateCurrentUser({ id: user._id, name: user.name || '', email: user.email || '', role: user.role, avatarUrl: user.avatarUrl || undefined });
    localStorage.setItem('aims-current-user-id', user._id);
    deps.syncUserIdFromStorage();
    deps.navigate('/', { replace: true });
    return user;
  }),
  startKakaoLogin: mockStartKakaoLogin,
  startKakaoLoginSwitch: mockStartKakaoLoginSwitch,
  startNaverLogin: mockStartNaverLogin,
  startNaverLoginSwitch: mockStartNaverLoginSwitch,
  startGoogleLogin: mockStartGoogleLogin,
  startGoogleLoginSwitch: mockStartGoogleLoginSwitch
}))

// SFSymbol Mock
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => createElement('span', { 'data-testid': 'sf-symbol' }, name),
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

import LoginPage from '../pages/LoginPage'
import AuthCallbackPage from '../pages/AuthCallbackPage'

// localStorage Mock
let localStorageMock: Record<string, string> = {}

describe('소셜 로그인 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHref = ''
    localStorageMock = {}

    // Mock implementations for social login functions
    mockStartKakaoLogin.mockImplementation(() => { mockHref = '/api/auth/kakao' })
    mockStartKakaoLoginSwitch.mockImplementation(() => { mockHref = '/api/auth/kakao/switch' })
    mockStartNaverLogin.mockImplementation(() => { mockHref = '/api/auth/naver' })
    mockStartNaverLoginSwitch.mockImplementation(() => { mockHref = '/api/auth/naver/switch' })
    mockStartGoogleLogin.mockImplementation(() => { mockHref = '/api/auth/google' })
    mockStartGoogleLoginSwitch.mockImplementation(() => { mockHref = '/api/auth/google/switch' })

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] || null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key] }),
      clear: vi.fn(() => { localStorageMock = {} }),
      length: 0,
      key: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const renderApp = (initialPath: string) => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<div data-testid="main-page">Main Page</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  describe('카카오 로그인 전체 흐름', () => {
    const mockKakaoUser = {
      _id: 'kakao_123456',
      name: '카카오사용자',
      email: 'kakao@test.com',
      role: 'agent',
      avatarUrl: 'https://k.kakaocdn.net/avatar.jpg',
      authProvider: 'kakao',
      profileCompleted: true
    }

    it('1. 카카오 로그인 버튼 클릭 시 OAuth 시작', async () => {
      renderApp('/login')

      const kakaoButton = screen.getByText('카카오 로그인')
      fireEvent.click(kakaoButton)

      expect(mockStartKakaoLogin).toHaveBeenCalled()
      expect(mockHref).toContain('/api/auth/kakao')
    })

    it('2. 콜백 처리 → 토큰 저장', async () => {
      mockGetCurrentUser.mockResolvedValue(mockKakaoUser)

      renderApp('/auth/callback?token=kakao-jwt-token')

      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith('kakao-jwt-token')
      })
    })

    it('3. 사용자 정보 조회 → Store 동기화', async () => {
      mockGetCurrentUser.mockResolvedValue(mockKakaoUser)

      renderApp('/auth/callback?token=kakao-jwt-token')

      await waitFor(() => {
        // authStore 동기화
        expect(mockSetUser).toHaveBeenCalledWith(mockKakaoUser)

        // userStore 동기화
        expect(mockUpdateCurrentUser).toHaveBeenCalledWith({
          id: mockKakaoUser._id,
          name: mockKakaoUser.name,
          email: mockKakaoUser.email,
          role: mockKakaoUser.role,
          avatarUrl: mockKakaoUser.avatarUrl
        })
      })
    })

    it('4. localStorage에 사용자 ID 저장', async () => {
      mockGetCurrentUser.mockResolvedValue(mockKakaoUser)

      renderApp('/auth/callback?token=kakao-jwt-token')

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('aims-current-user-id', mockKakaoUser._id)
      })
    })

    it('5. 메인 페이지로 리다이렉트', async () => {
      mockGetCurrentUser.mockResolvedValue(mockKakaoUser)

      renderApp('/auth/callback?token=kakao-jwt-token')

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })
    })
  })

  describe('네이버 로그인 전체 흐름', () => {
    const mockNaverUser = {
      _id: 'naver_789012',
      name: '네이버사용자',
      email: 'naver@test.com',
      role: 'agent',
      avatarUrl: 'https://ssl.pstatic.net/avatar.jpg',
      authProvider: 'naver',
      profileCompleted: true
    }

    it('1. 개발 환경에서 네이버 로그인 버튼이 활성 상태임', async () => {
      renderApp('/login')

      const naverButton = screen.getByText('네이버 로그인').closest('button')
      expect(naverButton).not.toBeDisabled()

      fireEvent.click(screen.getByText('네이버 로그인'))
      expect(mockStartNaverLogin).toHaveBeenCalled()
    })

    it('2. 네이버 콜백 처리 → Store 동기화', async () => {
      mockGetCurrentUser.mockResolvedValue(mockNaverUser)

      renderApp('/auth/callback?token=naver-jwt-token')

      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith('naver-jwt-token')
        expect(mockSetUser).toHaveBeenCalledWith(mockNaverUser)
        expect(mockUpdateCurrentUser).toHaveBeenCalled()
      })
    })

    it('3. 네이버 인증 실패 시 에러 처리', async () => {
      vi.useFakeTimers()

      renderApp('/auth/callback?error=naver_auth_failed')

      expect(screen.getByText('네이버 로그인에 실패했습니다')).toBeInTheDocument()

      // 3초 후 /login으로 리다이렉트
      await vi.runAllTimersAsync()

      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })

      vi.useRealTimers()
    })
  })

  describe('구글 로그인 전체 흐름', () => {
    const mockGoogleUser = {
      _id: 'google_345678',
      name: '구글사용자',
      email: 'google@test.com',
      role: 'agent',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar.jpg',
      authProvider: 'google',
      profileCompleted: true
    }

    it('1. 개발 환경에서 구글 로그인 버튼이 활성 상태임', async () => {
      renderApp('/login')

      const googleButton = screen.getByText('구글 로그인').closest('button')
      expect(googleButton).not.toBeDisabled()

      fireEvent.click(screen.getByText('구글 로그인'))
      expect(mockStartGoogleLogin).toHaveBeenCalled()
    })

    it('2. 콜백 처리 → 토큰 저장', async () => {
      mockGetCurrentUser.mockResolvedValue(mockGoogleUser)

      renderApp('/auth/callback?token=google-jwt-token')

      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith('google-jwt-token')
      })
    })

    it('3. 사용자 정보 조회 → Store 동기화', async () => {
      mockGetCurrentUser.mockResolvedValue(mockGoogleUser)

      renderApp('/auth/callback?token=google-jwt-token')

      await waitFor(() => {
        // authStore 동기화
        expect(mockSetUser).toHaveBeenCalledWith(mockGoogleUser)

        // userStore 동기화
        expect(mockUpdateCurrentUser).toHaveBeenCalledWith({
          id: mockGoogleUser._id,
          name: mockGoogleUser.name,
          email: mockGoogleUser.email,
          role: mockGoogleUser.role,
          avatarUrl: mockGoogleUser.avatarUrl
        })
      })
    })

    it('4. localStorage에 사용자 ID 저장', async () => {
      mockGetCurrentUser.mockResolvedValue(mockGoogleUser)

      renderApp('/auth/callback?token=google-jwt-token')

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('aims-current-user-id', mockGoogleUser._id)
      })
    })

    it('5. 메인 페이지로 리다이렉트', async () => {
      mockGetCurrentUser.mockResolvedValue(mockGoogleUser)

      renderApp('/auth/callback?token=google-jwt-token')

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })
    })

    it('6. 구글 인증 실패 시 에러 처리', async () => {
      vi.useFakeTimers()

      renderApp('/auth/callback?error=google_auth_failed')

      expect(screen.getByText('구글 로그인에 실패했습니다')).toBeInTheDocument()

      // 3초 후 /login으로 리다이렉트
      await vi.runAllTimersAsync()

      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })

      vi.useRealTimers()
    })
  })

  describe('계정 전환', () => {
    it('"다른 카카오 계정으로 로그인" 클릭 시 switch 엔드포인트 사용', async () => {
      renderApp('/login')

      const switchButton = screen.getByText('다른 카카오 계정으로 로그인')
      fireEvent.click(switchButton)

      expect(mockStartKakaoLoginSwitch).toHaveBeenCalled()
      expect(mockHref).toContain('/api/auth/kakao/switch')
    })

    it('개발 환경에서는 "다른 네이버 계정", "다른 구글 계정" 옵션이 표시됨', () => {
      renderApp('/login')

      expect(screen.getByText('다른 네이버 계정')).toBeInTheDocument()
      expect(screen.getByText('다른 구글 계정')).toBeInTheDocument()
    })
  })

  describe('에러 복구', () => {
    it('API 호출 실패 시 에러 메시지 표시', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('네트워크 오류'))

      renderApp('/auth/callback?token=test-token')

      await waitFor(() => {
        expect(screen.getByText('네트워크 오류')).toBeInTheDocument()
      })
    })

    it('토큰 없이 콜백 페이지 접근 시 에러 표시', async () => {
      renderApp('/auth/callback')

      await waitFor(() => {
        expect(screen.getByText('토큰을 받지 못했습니다')).toBeInTheDocument()
      })
    })

    it('에러 후 3초 대기 후 로그인 페이지로 복귀', async () => {
      vi.useFakeTimers()

      renderApp('/auth/callback?error=kakao_auth_failed')

      // 에러 메시지 확인
      expect(screen.getByText('카카오 로그인에 실패했습니다')).toBeInTheDocument()

      // 3초 경과
      await vi.runAllTimersAsync()

      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })

      vi.useRealTimers()
    })
  })

  describe('레거시 시스템 호환성', () => {
    it('로그인 성공 시 syncUserIdFromStorage 호출', async () => {
      mockGetCurrentUser.mockResolvedValue({
        _id: 'user123',
        name: '테스트',
        email: 'test@test.com',
        role: 'agent',
        avatarUrl: null
      })

      renderApp('/auth/callback?token=test-token')

      await waitFor(() => {
        expect(mockSyncUserIdFromStorage).toHaveBeenCalled()
      })
    })

    it('aims-current-user-id가 localStorage에 저장됨', async () => {
      const userId = 'legacy-user-123'
      mockGetCurrentUser.mockResolvedValue({
        _id: userId,
        name: '테스트',
        email: 'test@test.com',
        role: 'agent',
        avatarUrl: null
      })

      renderApp('/auth/callback?token=test-token')

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('aims-current-user-id', userId)
      })
    })
  })

  describe('로딩 상태 관리', () => {
    it('처리 시작 시 setLoading(true) 호출', () => {
      mockGetCurrentUser.mockImplementation(() => new Promise(() => {})) // 무한 대기

      renderApp('/auth/callback?token=test-token')

      expect(mockSetLoading).toHaveBeenCalledWith(true)
    })

    it('처리 완료 시 setLoading(false) 호출', async () => {
      mockGetCurrentUser.mockResolvedValue({
        _id: 'user123',
        name: '테스트',
        email: 'test@test.com',
        role: 'agent',
        avatarUrl: null
      })

      renderApp('/auth/callback?token=test-token')

      await waitFor(() => {
        expect(mockSetLoading).toHaveBeenCalledWith(false)
      })
    })

    it('에러 발생 시에도 setLoading(false) 호출', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('API 오류'))

      renderApp('/auth/callback?token=test-token')

      await waitFor(() => {
        expect(mockSetLoading).toHaveBeenCalledWith(false)
      })
    })
  })
})
