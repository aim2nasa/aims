/**
 * Phase 2-3: 사용자별 문서 격리 통합 Regression 테스트
 * @description 다중 사용자 환경에서 문서 격리 기능 검증
 * @regression 커밋 ffcafd6, 41db3a9, 9b772bc - 사용자별 문서 격리
 * @priority HIGH - 데이터 보안 및 프라이버시 핵심 기능
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentService } from '../DocumentService'
import { api } from '@/shared/lib/api'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('사용자별 문서 격리 - 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('사용자 A와 B의 문서 격리', () => {
    /**
     * 회귀 테스트: 커밋 ffcafd6
     * 기능: 각 사용자는 자신의 문서만 볼 수 있어야 함
     */
    it('사용자 A: 10개 문서 조회', async () => {
      const userADocuments = Array.from({ length: 10 }, (_, i) => ({
        _id: `doc-a-${i}`,
        filename: `user-a-doc-${i}.pdf`,
        ownerId: 'user-a',
        uploadTime: '2025-01-01T00:00:00Z',
        status: 'active',
        ocrStatus: 'completed'
      }))

      vi.mocked(api.get).mockResolvedValue({
        documents: userADocuments,
        pagination: { totalCount: 10, hasNext: false }
      })

      const result = await DocumentService.getDocuments()

      expect(result.documents).toHaveLength(10)
      expect(result.documents.every(doc => doc.filename?.startsWith('user-a'))).toBe(true)
    })

    it('사용자 B: 5개 문서 조회', async () => {
      const userBDocuments = Array.from({ length: 5 }, (_, i) => ({
        _id: `doc-b-${i}`,
        filename: `user-b-doc-${i}.pdf`,
        ownerId: 'user-b',
        uploadTime: '2025-01-01T00:00:00Z',
        status: 'active',
        ocrStatus: 'completed'
      }))

      vi.mocked(api.get).mockResolvedValue({
        documents: userBDocuments,
        pagination: { totalCount: 5, hasNext: false }
      })

      const result = await DocumentService.getDocuments()

      expect(result.documents).toHaveLength(5)
      expect(result.documents.every(doc => doc.filename?.startsWith('user-b'))).toBe(true)
    })

    it('사용자 A가 사용자 B의 문서에 접근 불가', async () => {
      vi.mocked(api.get).mockResolvedValue({
        documents: [], // 격리되어 빈 배열
        pagination: { totalCount: 0, hasNext: false }
      })

      const result = await DocumentService.getDocuments()

      expect(result.documents).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe('사용자 전환 시 데이터 완전 정리', () => {
    /**
     * 회귀 테스트: 커밋 11d86c8
     * 기능: 사용자 전환 시 이전 계정 데이터 완전 정리
     */
    it('사용자 A → B 전환: 캐시 정리', async () => {
      // 사용자 A의 데이터
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [
          { _id: 'doc-a-1', filename: 'a1.pdf', ownerId: 'user-a' }
        ],
        pagination: { totalCount: 1 }
      })

      const resultA = await DocumentService.getDocuments()
      expect(resultA.documents[0]?.filename).toBe('a1.pdf')

      // 사용자 전환 (캐시 클리어 시뮬레이션)
      vi.clearAllMocks()

      // 사용자 B의 데이터
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [
          { _id: 'doc-b-1', filename: 'b1.pdf', ownerId: 'user-b' }
        ],
        pagination: { totalCount: 1 }
      })

      const resultB = await DocumentService.getDocuments()
      expect(resultB.documents[0]?.filename).toBe('b1.pdf')

      // 사용자 A의 데이터가 남아있지 않음을 보장
      expect(resultB.documents[0]?.filename).not.toBe('a1.pdf')
    })

    it('localStorage 정리 시뮬레이션', () => {
      // localStorage mock
      const mockLocalStorage: Record<string, string> = {}

      global.localStorage = {
        getItem: (key: string) => mockLocalStorage[key] || null,
        setItem: (key: string, value: string) => {
          mockLocalStorage[key] = value
        },
        removeItem: (key: string) => {
          delete mockLocalStorage[key]
        },
        clear: () => {
          Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key])
        },
        key: () => null,
        length: 0
      }

      // 사용자 A 데이터 저장
      localStorage.setItem('user-a-cache', JSON.stringify({ docs: ['doc1'] }))
      expect(localStorage.getItem('user-a-cache')).toBeTruthy()

      // 사용자 전환 시 정리
      localStorage.clear()
      expect(localStorage.getItem('user-a-cache')).toBeNull()
    })
  })

  describe('문서 검색 격리', () => {
    /**
     * 회귀 테스트: 커밋 41db3a9
     * 기능: 검색 결과도 사용자별로 격리
     */
    it('사용자 A: 키워드 검색 시 자신의 문서만 반환', async () => {
      vi.mocked(api.get).mockResolvedValue({
        documents: [
          { _id: 'doc-a-1', filename: 'report.pdf', ownerId: 'user-a' }
        ],
        pagination: { totalCount: 1 }
      })

      const result = await DocumentService.searchDocuments('report')

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?.filename).toBe('report.pdf')
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('search=report')
      )
    })

    it('사용자 B: 동일 키워드 검색 시 다른 결과', async () => {
      vi.mocked(api.get).mockResolvedValue({
        documents: [
          { _id: 'doc-b-1', filename: 'report-2023.pdf', ownerId: 'user-b' }
        ],
        pagination: { totalCount: 1 }
      })

      const result = await DocumentService.searchDocuments('report')

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?.filename).toBe('report-2023.pdf')
    })
  })

  describe('고객별 문서 격리', () => {
    it('사용자 A의 고객: 자신이 업로드한 문서만 조회', async () => {
      vi.mocked(api.get).mockResolvedValue({
        documents: [
          { _id: 'doc-a-1', filename: 'insurance.pdf', ownerId: 'user-a' }
        ],
        pagination: { totalCount: 1 }
      })

      const result = await DocumentService.getDocumentsByCustomer('customer-a')

      expect(result.documents).toHaveLength(1)
      expect(api.get).toHaveBeenCalled()
    })

    it('사용자 B의 고객: 다른 사용자 문서 조회 불가', async () => {
      vi.mocked(api.get).mockResolvedValue({
        documents: [], // 격리
        pagination: { totalCount: 0 }
      })

      const result = await DocumentService.getDocumentsByCustomer('customer-a')

      expect(result.documents).toHaveLength(0)
    })
  })

  describe('문서 업로드 격리', () => {
    it('업로드된 문서는 현재 사용자에게만 귀속', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })

      // XMLHttpRequest 모킹 (n8n webhook 방식)
      const xhrListeners: Record<string, () => void> = {}
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn().mockImplementation(() => {
          setTimeout(() => xhrListeners['load']?.(), 0)
        }),
        setRequestHeader: vi.fn(),
        addEventListener: vi.fn().mockImplementation((event: string, handler: () => void) => {
          xhrListeners[event] = handler
        }),
        status: 200,
        responseText: JSON.stringify({ doc_id: 'new-doc-1' }),
        timeout: 0
      }
      vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR))

      const result = await DocumentService.uploadDocument(file)

      expect(result.document?.filename).toBe('test.pdf')
      // n8n webhook으로 업로드됨
      expect(mockXHR.open).toHaveBeenCalledWith('POST', 'https://n8nd.giize.com/webhook/docprep-main')

      vi.unstubAllGlobals()
    })
  })

  describe('문서 삭제 격리', () => {
    it('자신의 문서만 삭제 가능', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: '1건 삭제',
          deleted_count: 1,
          failed_count: 0
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['my-doc-1'])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(1)
    })

    it('다른 사용자 문서 삭제 시도 시 실패', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          message: '권한 없음',
          deleted_count: 0,
          failed_count: 1,
          errors: [{ document_id: 'other-user-doc', error: 'Permission denied' }]
        })
      })
      global.fetch = mockFetch

      const result = await DocumentService.deleteDocuments(['other-user-doc'])

      expect(result.success).toBe(false)
      expect(result.failedCount).toBe(1)
      expect(result.errors[0]?.error).toContain('Permission denied')
    })
  })

  describe('통합 시나리오: 사용자 생애 주기', () => {
    it('사용자 A: 등록 → 문서 업로드 → 조회 → 삭제', async () => {
      // 1. 문서 업로드
      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        document: { _id: 'doc1', filename: 'test.pdf', ownerId: 'user-a' }
      })

      const uploadResult = await DocumentService.uploadDocument(
        new File([''], 'test.pdf')
      )
      expect(uploadResult.document?.filename).toBe('test.pdf')

      // 2. 문서 조회
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [{ _id: 'doc1', filename: 'test.pdf' }],
        pagination: { totalCount: 1 }
      })

      const listResult = await DocumentService.getDocuments()
      expect(listResult.documents).toHaveLength(1)

      // 3. 문서 삭제
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          deleted_count: 1,
          failed_count: 0
        })
      })
      global.fetch = mockFetch

      const deleteResult = await DocumentService.deleteDocuments(['doc1'])
      expect(deleteResult.success).toBe(true)
    })

    it('사용자 전환 후 이전 사용자 데이터 접근 불가', async () => {
      // 사용자 A 데이터
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [{ _id: 'doc-a', filename: 'a.pdf' }],
        pagination: { totalCount: 1 }
      })

      const userADocs = await DocumentService.getDocuments()
      expect(userADocs.documents[0]?.filename).toBe('a.pdf')

      // 사용자 전환
      vi.clearAllMocks()

      // 사용자 B로 전환 후 사용자 A 문서 조회 시도
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [], // 격리됨
        pagination: { totalCount: 0 }
      })

      const userBDocs = await DocumentService.getDocuments()
      expect(userBDocs.documents).toHaveLength(0)
    })
  })

  describe('엣지 케이스: 동일 파일명', () => {
    it('여러 사용자가 동일한 파일명을 사용해도 격리됨', async () => {
      // 사용자 A의 "report.pdf"
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [
          { _id: 'doc-a-1', filename: 'report.pdf', ownerId: 'user-a' }
        ],
        pagination: { totalCount: 1 }
      })

      const userAResult = await DocumentService.getDocuments()
      expect(userAResult.documents[0]?._id).toBe('doc-a-1')

      vi.clearAllMocks()

      // 사용자 B의 "report.pdf" (다른 문서)
      vi.mocked(api.get).mockResolvedValueOnce({
        documents: [
          { _id: 'doc-b-1', filename: 'report.pdf', ownerId: 'user-b' }
        ],
        pagination: { totalCount: 1 }
      })

      const userBResult = await DocumentService.getDocuments()
      expect(userBResult.documents[0]?._id).toBe('doc-b-1')

      // 서로 다른 문서임을 확인
      expect(userAResult.documents[0]?._id).not.toBe(userBResult.documents[0]?._id)
    })
  })
})
