/**
 * User Service Unit Tests
 * @since 2025-11-21
 *
 * 테스트 범위:
 * 1. getCurrentUser - phone/department/position 필드 파싱
 * 2. updateUser - phone/department/position 필드 전송 및 응답 파싱
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock api module before imports
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn()
  }
}))

import { getCurrentUser, updateUser } from '../userService'
import { api } from '@/shared/lib/api'

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getCurrentUser', () => {
    it('should return user with all profile fields including phone, department, position', async () => {
      const mockResponse = {
        success: true,
        user: {
          _id: 'user123',
          name: '홍길동',
          email: 'hong@example.com',
          phone: '010-1234-5678',
          department: '강남지점',
          position: '팀장',
          avatarUrl: 'https://example.com/avatar.jpg',
          role: 'agent',
          authProvider: 'kakao',
          profileCompleted: true
        }
      }

      mockApi.get.mockResolvedValueOnce(mockResponse)

      const user = await getCurrentUser()

      expect(mockApi.get).toHaveBeenCalledWith('/api/auth/me')
      expect(user).toEqual({
        id: 'user123',
        name: '홍길동',
        email: 'hong@example.com',
        phone: '010-1234-5678',
        department: '강남지점',
        position: '팀장',
        avatarUrl: 'https://example.com/avatar.jpg',
        role: 'agent',
        authProvider: 'kakao',
        profileCompleted: true
      })
    })

    it('should handle user without optional fields (phone, department, position)', async () => {
      const mockResponse = {
        success: true,
        user: {
          _id: 'user456',
          name: '김철수',
          email: 'kim@example.com',
          phone: null,
          department: null,
          position: null,
          avatarUrl: null,
          role: 'agent',
          authProvider: 'kakao',
          profileCompleted: false
        }
      }

      mockApi.get.mockResolvedValueOnce(mockResponse)

      const user = await getCurrentUser()

      expect(user).toEqual({
        id: 'user456',
        name: '김철수',
        email: 'kim@example.com',
        role: 'agent',
        authProvider: 'kakao',
        profileCompleted: false
      })
      // Optional fields should not be present if null
      expect(user.phone).toBeUndefined()
      expect(user.department).toBeUndefined()
      expect(user.position).toBeUndefined()
      expect(user.avatarUrl).toBeUndefined()
    })

    it('should throw error when API returns success: false', async () => {
      mockApi.get.mockResolvedValueOnce({
        success: false,
        message: 'Unauthorized'
      })

      await expect(getCurrentUser()).rejects.toThrow('사용자 정보 조회 실패')
    })
  })

  describe('updateUser', () => {
    it('should send phone, department, position in update request', async () => {
      const mockResponse = {
        success: true,
        user: {
          _id: 'user123',
          name: '홍길동',
          email: 'hong@example.com',
          phone: '010-9999-8888',
          department: '서초지점',
          position: '지점장',
          avatarUrl: null,
          role: 'agent',
          authProvider: 'kakao',
          profileCompleted: true
        }
      }

      mockApi.put.mockResolvedValueOnce(mockResponse)

      const updates = {
        name: '홍길동',
        phone: '010-9999-8888',
        department: '서초지점',
        position: '지점장'
      }

      const user = await updateUser('user123', updates)

      expect(mockApi.put).toHaveBeenCalledWith('/api/auth/profile', {
        name: '홍길동',
        phone: '010-9999-8888',
        department: '서초지점',
        position: '지점장'
      })
      expect(user.phone).toBe('010-9999-8888')
      expect(user.department).toBe('서초지점')
      expect(user.position).toBe('지점장')
    })

    it('should handle partial updates (only phone)', async () => {
      const mockResponse = {
        success: true,
        user: {
          _id: 'user123',
          name: '홍길동',
          email: 'hong@example.com',
          phone: '010-1111-2222',
          department: null,
          position: null,
          avatarUrl: null,
          role: 'agent',
          authProvider: 'kakao',
          profileCompleted: true
        }
      }

      mockApi.put.mockResolvedValueOnce(mockResponse)

      const user = await updateUser('user123', { phone: '010-1111-2222' })

      expect(mockApi.put).toHaveBeenCalledWith('/api/auth/profile', {
        phone: '010-1111-2222'
      })
      expect(user.phone).toBe('010-1111-2222')
    })

    it('should return current user when no updates provided', async () => {
      const mockResponse = {
        success: true,
        user: {
          _id: 'user123',
          name: '홍길동',
          email: 'hong@example.com',
          phone: null,
          department: null,
          position: null,
          avatarUrl: null,
          role: 'agent',
          authProvider: 'kakao',
          profileCompleted: true
        }
      }

      mockApi.get.mockResolvedValueOnce(mockResponse)

      await updateUser('user123', {})

      // Should call getCurrentUser, not PUT
      expect(mockApi.put).not.toHaveBeenCalled()
      expect(mockApi.get).toHaveBeenCalledWith('/api/auth/me')
    })

    it('should throw error when update fails', async () => {
      mockApi.put.mockResolvedValueOnce({
        success: false,
        message: 'Update failed'
      })

      await expect(
        updateUser('user123', { name: '새이름' })
      ).rejects.toThrow('프로필 업데이트 실패')
    })
  })
})
