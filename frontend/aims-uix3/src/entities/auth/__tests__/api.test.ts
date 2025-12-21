/**
 * Auth API 테스트
 * @description 카카오/네이버/구글 소셜 로그인 API 함수 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

// axios Mock
vi.mock('axios')
const mockedAxios = vi.mocked(axios)

// window.location Mock
const originalLocation = window.location

describe('Auth API', () => {
  let mockHref: string = ''

  beforeEach(() => {
    vi.clearAllMocks()
    mockHref = ''

    // window.location.href Mock
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost:5177',
        href: '',
        get href() { return mockHref },
        set href(value: string) { mockHref = value }
      },
      writable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true
    })
  })

  // 동적 import로 Mock 적용 후 모듈 로드
  const loadAuthApi = async () => {
    // 모듈 캐시 초기화
    vi.resetModules()
    return await import('../api')
  }

  describe('소셜 로그인 URL 생성', () => {
    describe('카카오 로그인', () => {
      it('startKakaoLogin - 올바른 URL로 리다이렉트해야 함', async () => {
        const { startKakaoLogin } = await loadAuthApi()

        startKakaoLogin()

        expect(mockHref).toContain('/api/auth/kakao')
        expect(mockHref).toContain('redirect=')
        expect(mockHref).toContain(encodeURIComponent('http://localhost:5177'))
      })

      it('startKakaoLoginSwitch - switch 엔드포인트를 사용해야 함', async () => {
        const { startKakaoLoginSwitch } = await loadAuthApi()

        startKakaoLoginSwitch()

        expect(mockHref).toContain('/api/auth/kakao/switch')
        expect(mockHref).toContain('redirect=')
      })
    })

    describe('네이버 로그인', () => {
      it('startNaverLogin - 올바른 URL로 리다이렉트해야 함', async () => {
        const { startNaverLogin } = await loadAuthApi()

        startNaverLogin()

        expect(mockHref).toContain('/api/auth/naver')
        expect(mockHref).toContain('redirect=')
        expect(mockHref).toContain(encodeURIComponent('http://localhost:5177'))
      })

      it('startNaverLoginSwitch - switch 엔드포인트를 사용해야 함', async () => {
        const { startNaverLoginSwitch } = await loadAuthApi()

        startNaverLoginSwitch()

        expect(mockHref).toContain('/api/auth/naver/switch')
        expect(mockHref).toContain('redirect=')
      })
    })

    describe('구글 로그인', () => {
      it('startGoogleLogin - 올바른 URL로 리다이렉트해야 함', async () => {
        const { startGoogleLogin } = await loadAuthApi()

        startGoogleLogin()

        expect(mockHref).toContain('/api/auth/google')
        expect(mockHref).toContain('redirect=')
        expect(mockHref).toContain(encodeURIComponent('http://localhost:5177'))
      })

      it('startGoogleLoginSwitch - switch 엔드포인트를 사용해야 함', async () => {
        const { startGoogleLoginSwitch } = await loadAuthApi()

        startGoogleLoginSwitch()

        expect(mockHref).toContain('/api/auth/google/switch')
        expect(mockHref).toContain('redirect=')
      })
    })
  })

  describe('getCurrentUser', () => {
    it('올바른 헤더로 /api/auth/me를 호출해야 함', async () => {
      const mockUser = {
        _id: 'user123',
        name: '홍길동',
        email: 'hong@example.com',
        role: 'agent',
        avatarUrl: null
      }

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          user: mockUser
        }
      })

      const { getCurrentUser } = await loadAuthApi()
      const token = 'test-jwt-token'

      await getCurrentUser(token)

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/me'),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      )
    })

    it('사용자 정보를 반환해야 함', async () => {
      const mockUser = {
        _id: 'user123',
        name: '홍길동',
        email: 'hong@example.com',
        role: 'agent',
        avatarUrl: null,
        profileCompleted: true
      }

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          user: mockUser
        }
      })

      const { getCurrentUser } = await loadAuthApi()
      const result = await getCurrentUser('test-token')

      expect(result).toEqual(mockUser)
      expect(result._id).toBe('user123')
      expect(result.name).toBe('홍길동')
    })

    it('실패 응답 시 에러를 던져야 함', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: false,
          message: '인증 실패'
        }
      })

      const { getCurrentUser } = await loadAuthApi()

      await expect(getCurrentUser('invalid-token')).rejects.toThrow('사용자 정보를 가져올 수 없습니다')
    })
  })

  describe('updateProfile', () => {
    it('올바른 헤더와 데이터로 PUT 요청해야 함', async () => {
      const mockUser = {
        _id: 'user123',
        name: '홍길동 (수정)',
        email: 'hong2@example.com',
        role: 'agent',
        avatarUrl: null
      }

      mockedAxios.put.mockResolvedValueOnce({
        data: {
          success: true,
          user: mockUser
        }
      })

      const { updateProfile } = await loadAuthApi()
      const token = 'test-jwt-token'
      const updateData = { name: '홍길동 (수정)', email: 'hong2@example.com' }

      await updateProfile(token, updateData)

      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/profile'),
        updateData,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      )
    })

    it('업데이트된 사용자 정보를 반환해야 함', async () => {
      const updatedUser = {
        _id: 'user123',
        name: '김철수',
        email: 'kim@example.com',
        role: 'agent',
        avatarUrl: 'https://example.com/new-avatar.jpg',
        profileCompleted: true
      }

      mockedAxios.put.mockResolvedValueOnce({
        data: {
          success: true,
          user: updatedUser
        }
      })

      const { updateProfile } = await loadAuthApi()
      const result = await updateProfile('test-token', { name: '김철수' })

      expect(result.name).toBe('김철수')
      expect(result.profileCompleted).toBe(true)
    })

    it('실패 응답 시 에러를 던져야 함', async () => {
      mockedAxios.put.mockResolvedValueOnce({
        data: {
          success: false,
          message: '업데이트 실패'
        }
      })

      const { updateProfile } = await loadAuthApi()

      await expect(updateProfile('token', { name: 'test' })).rejects.toThrow('프로필 업데이트에 실패했습니다')
    })
  })

  describe('refreshToken', () => {
    it('올바른 헤더로 POST 요청해야 함', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'new-jwt-token'
        }
      })

      const { refreshToken } = await loadAuthApi()
      const oldToken = 'old-jwt-token'

      await refreshToken(oldToken)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh'),
        {},
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${oldToken}`
          }
        })
      )
    })

    it('새 토큰을 반환해야 함', async () => {
      const newToken = 'refreshed-jwt-token'

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: newToken
        }
      })

      const { refreshToken } = await loadAuthApi()
      const result = await refreshToken('old-token')

      expect(result).toBe(newToken)
    })

    it('실패 응답 시 에러를 던져야 함', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: false,
          message: '토큰 만료'
        }
      })

      const { refreshToken } = await loadAuthApi()

      await expect(refreshToken('expired-token')).rejects.toThrow('토큰 갱신에 실패했습니다')
    })
  })

  describe('logout', () => {
    it('POST /api/auth/logout을 호출해야 함', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true }
      })

      const { logout } = await loadAuthApi()

      await logout()

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/logout')
      )
    })
  })

  describe('deleteAccount', () => {
    it('DELETE /api/auth/account을 호출해야 함', async () => {
      mockedAxios.delete.mockResolvedValueOnce({
        data: { success: true }
      })

      const { deleteAccount } = await loadAuthApi()
      const token = 'test-token'

      await deleteAccount(token)

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/account'),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      )
    })
  })
})
