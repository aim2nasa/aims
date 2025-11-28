/**
 * DocumentStatusService - Search Parameter Unit Tests
 * @since 1.0.0
 *
 * 검색 파라미터 전달 기능에 대한 단위 테스트
 * commit db7dc3c: 전체 라이브러리 검색 기능 추가
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentStatusService } from '../DocumentStatusService'

describe('DocumentStatusService - Search Parameter', () => {
  beforeEach(() => {
    // fetch mock 초기화
    global.fetch = vi.fn()
  })

  describe('getRecentDocuments - search parameter', () => {
    it('search 파라미터가 있으면 API에 전달되어야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '보험청구서')

      // Then
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=%EB%B3%B4%ED%97%98%EC%B2%AD%EA%B5%AC%EC%84%9C'), // URL encoded
        expect.any(Object)
      )
    })

    it('search 파라미터가 없으면 API에 전달되지 않아야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10)

      // Then
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callUrl).not.toContain('search=')
    })

    it('search 파라미터가 빈 문자열이면 API에 전달되지 않아야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '')

      // Then
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callUrl).not.toContain('search=')
    })

    it('search 파라미터에 공백만 있으면 trim 후 전달되지 않아야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '   ')

      // Then
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callUrl).not.toContain('search=')
    })

    it('search 파라미터 앞뒤 공백은 trim되어야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '  보험청구서  ')

      // Then
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=%EB%B3%B4%ED%97%98%EC%B2%AD%EA%B5%AC%EC%84%9C'), // trim된 값
        expect.any(Object)
      )

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callUrl).not.toContain('%20') // 공백이 포함되지 않아야 함
    })

    it('page, limit, sort, search가 모두 올바르게 전달되어야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 25,
          pagination: { page: 2, totalPages: 3, totalCount: 25, limit: 10, total: 25 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(2, 10, 'filename_asc', '보험')

      // Then
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callUrl).toContain('page=2')
      expect(callUrl).toContain('limit=10')
      expect(callUrl).toContain('sort=filename_asc')
      expect(callUrl).toContain('search=')
    })

    it('검색 결과가 있으면 올바르게 반환되어야 함', async () => {
      // Given
      const mockDocuments = [
        { _id: '1', originalName: '보험청구서.pdf' },
        { _id: '2', originalName: '보험약관.pdf' }
      ]

      const mockResponse = {
        success: true,
        data: {
          documents: mockDocuments,
          total: 2,
          pagination: { page: 1, totalPages: 1, totalCount: 2, limit: 10, total: 2 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      const result = await DocumentStatusService.getRecentDocuments(1, 10, undefined, '보험')

      // Then
      expect(result.documents).toEqual(mockDocuments)
      expect(result.pagination!.totalCount).toBe(2)
    })
  })

  describe('API 호출 구조 검증', () => {
    it('JWT Authorization 헤더가 포함되어야 함', async () => {
      // Given - JWT 토큰을 auth-storage에 설정
      const mockToken = 'test-jwt-token'
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { token: mockToken }
      }))

      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '검색어')

      // Then
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`
          })
        })
      )
    })

    it('Content-Type 헤더가 application/json이어야 함', async () => {
      // Given
      const mockResponse = {
        success: true,
        data: {
          documents: [],
          total: 0,
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      }

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '검색어')

      // Then
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })
  })
})
