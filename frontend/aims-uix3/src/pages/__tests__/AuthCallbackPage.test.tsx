/**
 * AuthCallbackPage 컴포넌트 테스트
 * @description OAuth 콜백 처리, 토큰 파싱, Store 동기화 테스트
 * @regression
 *   - 무한루프 버그 방지 (commit bee0edff)
 *   - 카카오/네이버/구글 인증 에러 처리
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// vi.hoisted로 Mock 함수 선언 (hoisting 문제 해결)
const {
  mockNavigate,
  mockSetToken,
  mockSetUser,
  mockSetLoading,
  mockUpdateCurrentUser,
  mockSyncUserIdFromStorage,
  mockGetCurrentUser
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetUser: vi.fn(),
  mockSetLoading: vi.fn(),
  mockUpdateCurrentUser: vi.fn(),
  mockSyncUserIdFromStorage: vi.fn(),
  mockGetCurrentUser: vi.fn()
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
    setLoading: mockSetLoading
  })
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    updateCurrentUser: mockUpdateCurrentUser
  }),
  syncUserIdFromStorage: mockSyncUserIdFromStorage
}))

vi.mock('@/entities/auth/api', () => ({
  getCurrentUser: mockGetCurrentUser
}))

// 컴포넌트 import (Mock 정의 후)
import AuthCallbackPage from '../AuthCallbackPage'

// 테스트 유틸리티
const renderWithRouter = (initialEntries: string[]) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/" element={<div data-testid="main-page">Main Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('정상 흐름', () => {
    const mockUser = {
      _id: 'user123',
      name: '홍길동',
      email: 'hong@example.com',
      role: 'agent',
      avatarUrl: 'https://example.com/avatar.jpg'
    }

    beforeEach(() => {
      mockGetCurrentUser.mockResolvedValue(mockUser)
    })

    it('URL에서 토큰을 추출하여 저장해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith('test-jwt-token')
      })
    })

    it('getCurrentUser API를 호출해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalledWith('test-jwt-token')
      })
    })

    it('authStore.setUser를 호출해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(mockUser)
      })
    })

    it('userStore.updateCurrentUser를 호출해야 함 (Store 동기화)', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockUpdateCurrentUser).toHaveBeenCalledWith({
          id: mockUser._id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
          avatarUrl: mockUser.avatarUrl
        })
      })
    })

    it('localStorage에 aims-current-user-id를 저장해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(localStorage.getItem('aims-current-user-id')).toBe('user123')
      })
    })

    it('syncUserIdFromStorage를 호출해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockSyncUserIdFromStorage).toHaveBeenCalled()
      })
    })

    it('메인 페이지로 리다이렉트해야 함', async () => {
      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })
    })
  })

  describe('에러 처리 - OAuth 실패', () => {
    it('kakao_auth_failed 에러를 처리해야 함', async () => {
      renderWithRouter(['/auth/callback?error=kakao_auth_failed'])

      await waitFor(() => {
        expect(screen.getByText('카카오 로그인에 실패했습니다')).toBeInTheDocument()
      })
    })

    it('naver_auth_failed 에러를 처리해야 함', async () => {
      renderWithRouter(['/auth/callback?error=naver_auth_failed'])

      await waitFor(() => {
        expect(screen.getByText('네이버 로그인에 실패했습니다')).toBeInTheDocument()
      })
    })

    it('google_auth_failed 에러를 처리해야 함', async () => {
      renderWithRouter(['/auth/callback?error=google_auth_failed'])

      await waitFor(() => {
        expect(screen.getByText('구글 로그인에 실패했습니다')).toBeInTheDocument()
      })
    })

    it('일반 에러를 처리해야 함', async () => {
      renderWithRouter(['/auth/callback?error=unknown_error'])

      await waitFor(() => {
        expect(screen.getByText('인증에 실패했습니다')).toBeInTheDocument()
      })
    })
  })

  describe('에러 후 리다이렉트', () => {
    it('에러 발생 시 3초 후 /login으로 리다이렉트해야 함', async () => {
      vi.useFakeTimers()

      renderWithRouter(['/auth/callback?error=kakao_auth_failed'])

      // 에러 메시지가 표시되어야 함
      expect(screen.getByText('카카오 로그인에 실패했습니다')).toBeInTheDocument()

      // 3초 경과 및 타이머 실행
      await vi.runAllTimersAsync()

      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })

      vi.useRealTimers()
    })
  })

  describe('에러 처리 - 토큰 없음', () => {
    it('토큰이 없으면 에러를 표시해야 함', async () => {
      renderWithRouter(['/auth/callback'])

      await waitFor(() => {
        expect(screen.getByText('토큰을 받지 못했습니다')).toBeInTheDocument()
      })
    })
  })

  describe('에러 처리 - API 실패', () => {
    it('API 호출 실패 시 에러를 표시해야 함', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('API 오류'))

      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(screen.getByText('API 오류')).toBeInTheDocument()
      })
    })
  })

  describe('로딩 상태', () => {
    it('처리 시작 시 setLoading(true)를 호출해야 함', () => {
      mockGetCurrentUser.mockImplementation(() => new Promise(() => {})) // 무한 대기

      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      expect(mockSetLoading).toHaveBeenCalledWith(true)
    })

    it('처리 완료 시 setLoading(false)를 호출해야 함', async () => {
      mockGetCurrentUser.mockResolvedValue({
        _id: 'user123',
        name: '테스트',
        email: 'test@test.com',
        role: 'agent'
      })

      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      await waitFor(() => {
        expect(mockSetLoading).toHaveBeenCalledWith(false)
      })
    })

    it('로딩 중 로딩 스피너가 표시되어야 함', () => {
      mockGetCurrentUser.mockImplementation(() => new Promise(() => {})) // 무한 대기

      renderWithRouter(['/auth/callback?token=test-jwt-token'])

      expect(screen.getByText('로그인 처리 중...')).toBeInTheDocument()
    })
  })
})
