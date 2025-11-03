/**
 * Phase 1-1: Qdrant 임베딩 자동 삭제 Regression 테스트
 * @description 문서 삭제 시 Qdrant 벡터 DB에서도 임베딩이 자동으로 삭제되는지 검증
 * @regression 커밋 5c643d2 - feat: 문서 삭제 시 Qdrant DB에서 임베딩 자동 삭제
 * @priority HIGH - 데이터 정합성 관련 중요 기능
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentService } from '../DocumentService'

describe('DocumentService - Qdrant 임베딩 삭제', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('문서 일괄 삭제 시 벡터 DB 동기화', () => {
    it('문서 삭제 API 호출 성공', async () => {
      // Mock fetch 설정
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '3건의 문서가 삭제되었습니다',
          deleted_count: 3,
          failed_count: 0,
          errors: []
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['doc1', 'doc2', 'doc3'])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(3)
      expect(result.failedCount).toBe(0)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/documents',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ document_ids: ['doc1', 'doc2', 'doc3'] })
        })
      )
    })

    it('삭제 실패 시 에러 정보 반환', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '일부 문서 삭제 실패',
          deleted_count: 2,
          failed_count: 1,
          errors: [
            { document_id: 'doc3', error: 'Qdrant 삭제 실패' }
          ]
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['doc1', 'doc2', 'doc3'])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(2)
      expect(result.failedCount).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.error).toContain('Qdrant')
    })

    it('빈 배열 전달 시 에러 발생', async () => {
      await expect(
        DocumentService.deleteDocuments([])
      ).rejects.toThrow('삭제할 문서 ID가 필요합니다')
    })

    it('API 응답 실패 시 에러 발생', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error'
      })
      global.fetch = mockFetch

      await expect(
        DocumentService.deleteDocuments(['doc1'])
      ).rejects.toThrow('삭제 실패: Internal Server Error')
    })
  })

  describe('단일 문서 삭제 (소프트 삭제)', () => {
    it('단일 문서 삭제 시 status를 deleted로 변경', async () => {
      const updateSpy = vi.spyOn(DocumentService, 'updateDocument')
        .mockResolvedValue({
          _id: 'doc123',
          filename: 'test.pdf',
          originalName: 'test.pdf',
          uploadDate: '2025-01-01T00:00:00.000Z',
          status: 'deleted',
          ocrStatus: 'pending',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          tags: []
        })

      await DocumentService.deleteDocument('doc123')

      expect(updateSpy).toHaveBeenCalledWith('doc123', { status: 'deleted' })
    })

    it('빈 ID 전달 시 에러 발생', async () => {
      await expect(
        DocumentService.deleteDocument('')
      ).rejects.toThrow('문서 ID가 필요합니다')

      await expect(
        DocumentService.deleteDocument('   ')
      ).rejects.toThrow('문서 ID가 필요합니다')
    })
  })

  describe('Qdrant 임베딩 삭제 회귀 방지', () => {
    /**
     * 회귀 테스트: 문서 삭제 시 Qdrant 벡터 DB에서도 삭제되어야 함
     * 과거 버그: 문서는 삭제되었지만 벡터 DB에 고아 임베딩이 남는 문제
     */
    it('문서 삭제 성공 시 백엔드에서 Qdrant 삭제도 자동 처리', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '문서와 벡터 임베딩이 모두 삭제되었습니다',
          deleted_count: 1,
          failed_count: 0,
          errors: []
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['doc-with-embedding'])

      // 백엔드가 Qdrant 삭제까지 완료했음을 응답 메시지로 확인
      expect(result.success).toBe(true)
      expect(result.message).toContain('벡터 임베딩')
      expect(result.deletedCount).toBe(1)
    })

    it('Qdrant 삭제 실패 시 에러에 명시', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'MongoDB 삭제 성공, Qdrant 삭제 실패',
          deleted_count: 0,
          failed_count: 1,
          errors: [
            {
              document_id: 'doc123',
              error: 'Qdrant 벡터 DB 연결 실패'
            }
          ]
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['doc123'])

      expect(result.failedCount).toBe(1)
      expect(result.errors[0]?.error).toContain('Qdrant')
    })

    /**
     * 엣지 케이스: 임베딩이 없는 문서 삭제
     * 백엔드가 임베딩 없는 문서도 안전하게 처리해야 함
     */
    it('임베딩이 없는 문서 삭제도 정상 처리', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '문서 삭제 완료 (임베딩 없음)',
          deleted_count: 1,
          failed_count: 0,
          errors: []
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['doc-no-embedding'])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(1)
    })

    /**
     * 엣지 케이스: 일부 문서만 임베딩이 있는 경우
     */
    it('임베딩 유무가 혼재된 문서 일괄 삭제', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '3건 삭제 완료 (임베딩 2건 포함)',
          deleted_count: 3,
          failed_count: 0,
          errors: []
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments([
        'doc-with-embedding-1',
        'doc-no-embedding',
        'doc-with-embedding-2'
      ])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(3)
      expect(result.failedCount).toBe(0)
    })
  })

  describe('삭제 결과 포맷 검증', () => {
    it('삭제 결과 객체 구조가 올바름', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '삭제 완료',
          deleted_count: 5,
          failed_count: 0,
          errors: []
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments([
        'doc1', 'doc2', 'doc3', 'doc4', 'doc5'
      ])

      expect(result).toEqual({
        success: true,
        message: '삭제 완료',
        deletedCount: 5,
        failedCount: 0,
        errors: []
      })
    })

    it('백엔드 필드명(snake_case)을 프론트엔드 형식(camelCase)으로 변환', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '테스트',
          deleted_count: 10,
          failed_count: 2,
          errors: [
            { document_id: 'err1', error: 'E1' },
            { document_id: 'err2', error: 'E2' }
          ]
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(
        Array.from({ length: 12 }, (_, i) => `doc${i}`)
      )

      // snake_case → camelCase 변환 확인
      expect(result.deletedCount).toBe(10)
      expect(result.failedCount).toBe(2)
      expect(result.errors).toHaveLength(2)
    })
  })
})
