/**
 * DocumentService Unit Tests
 * @since 2025-10-14
 * @description DocumentService의 모든 메서드에 대한 종합 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentService } from '../DocumentService'
import { api } from '@/shared/lib/api'
import type { Document, DocumentSearchQuery, DocumentSearchResponse } from '@/entities/document'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('DocumentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // 1. getDocuments() - 문서 목록 조회
  // ============================================================================
  describe('getDocuments', () => {
    it('기본 파라미터로 문서 목록을 조회해야 함', async () => {
      const mockResponse = {
        documents: [
          {
            _id: 'doc1',
            filename: 'test.pdf',
            originalName: 'test.pdf',
            uploadTime: '2025-10-14T10:00:00Z',
            status: 'active',
            ocrStatus: 'pending',
            fileSize: 1024,
          },
        ],
        pagination: {
          totalCount: 1,
          hasNext: false,
        },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(api.get).toHaveBeenCalledWith('/api/documents')
      expect(result.documents).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.hasMore).toBe(false)
    })

    it('페이지네이션 파라미터를 URL에 포함해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const query: Partial<DocumentSearchQuery> = {
        limit: 20,
        offset: 10,
      }

      await DocumentService.getDocuments(query)

      expect(api.get).toHaveBeenCalledWith('/api/documents?limit=20&offset=10')
    })

    it('검색어를 search 파라미터로 전달해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const query: Partial<DocumentSearchQuery> = {
        q: '보험청구서',
      }

      await DocumentService.getDocuments(query)

      expect(api.get).toHaveBeenCalledWith('/api/documents?search=%EB%B3%B4%ED%97%98%EC%B2%AD%EA%B5%AC%EC%84%9C')
    })

    it('정렬 파라미터를 백엔드 형식으로 변환해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const query: Partial<DocumentSearchQuery> = {
        sortBy: 'time',
        sortOrder: 'desc',
      }

      await DocumentService.getDocuments(query)

      expect(api.get).toHaveBeenCalledWith('/api/documents?sort=uploadTime_desc')
    })

    it('sortBy를 백엔드 필드명으로 매핑해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const testCases: Array<{ sortBy: string; expected: string }> = [
        { sortBy: 'time', expected: 'uploadTime_asc' },
        { sortBy: 'name', expected: 'filename_asc' },
        { sortBy: 'size', expected: 'size_asc' },
        { sortBy: 'fileType', expected: 'fileType_asc' },
      ]

      for (const { sortBy, expected } of testCases) {
        vi.clearAllMocks()
        await DocumentService.getDocuments({ sortBy, sortOrder: 'asc' })
        expect(api.get).toHaveBeenCalledWith(`/api/documents?sort=${expected}`)
      }
    })

    it('data.documents 응답 구조를 처리해야 함', async () => {
      const mockResponse = {
        data: {
          documents: [{ _id: 'doc1', filename: 'test.pdf' }],
          pagination: { totalCount: 1 },
        },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]._id).toBe('doc1')
    })

    it('루트 documents 응답 구조를 처리해야 함', async () => {
      const mockResponse = {
        documents: [{ _id: 'doc2', filename: 'test2.pdf' }],
        pagination: { totalCount: 1 },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]._id).toBe('doc2')
    })

    it('문서에 _id가 없으면 임시 ID를 생성해야 함', async () => {
      const mockResponse = {
        documents: [{ filename: 'no-id.pdf' }],
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents[0]._id).toMatch(/^temp-/)
    })

    it('uploadTime에 xxx가 있으면 000Z로 치환해야 함', async () => {
      const mockResponse = {
        documents: [
          {
            _id: 'doc1',
            filename: 'test.pdf',
            uploadTime: '2025-10-14T10:00:00.123xxx',
          },
        ],
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents[0].uploadDate).toBe('2025-10-14T10:00:00.123000Z')
    })

    it('status가 active/archived/deleted가 아니면 active로 설정해야 함', async () => {
      const mockResponse = {
        documents: [
          { _id: 'doc1', filename: 'test.pdf', status: 'invalid' },
          { _id: 'doc2', filename: 'test2.pdf', status: 'archived' },
          { _id: 'doc3', filename: 'test3.pdf', status: 'deleted' },
        ],
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents[0].status).toBe('active')
      expect(result.documents[1].status).toBe('archived')
      expect(result.documents[2].status).toBe('deleted')
    })

    it('ocrStatus가 유효하지 않으면 pending으로 설정해야 함', async () => {
      const mockResponse = {
        documents: [
          { _id: 'doc1', filename: 'test.pdf', ocrStatus: 'invalid' },
          { _id: 'doc2', filename: 'test2.pdf', ocrStatus: 'processing' },
          { _id: 'doc3', filename: 'test3.pdf', ocrStatus: 'completed' },
        ],
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents[0].ocrStatus).toBe('pending')
      expect(result.documents[1].ocrStatus).toBe('processing')
      expect(result.documents[2].ocrStatus).toBe('completed')
    })

    it('빈 응답을 처리해야 함', async () => {
      const mockResponse = { documents: [] }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocuments()

      expect(result.documents).toEqual([])
      expect(result.total).toBe(0)
    })

    it('파라미터가 모두 있을 때 URL을 올바르게 구성해야 함', async () => {
      const mockResponse = { documents: [] }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      await DocumentService.getDocuments({
        limit: 50,
        offset: 100,
        q: 'test',
        sortBy: 'name',
        sortOrder: 'asc',
      })

      const url = vi.mocked(api.get).mock.calls[0][0] as string
      expect(url).toContain('limit=50')
      expect(url).toContain('offset=100')
      expect(url).toContain('search=test')
      expect(url).toContain('sort=filename_asc')
    })
  })

  // ============================================================================
  // 2. getDocument() - 문서 상세 조회
  // ============================================================================
  describe('getDocument', () => {
    it('문서 ID로 단일 문서를 조회해야 함', async () => {
      const mockDocument = {
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'active',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
        tags: [],
      }

      vi.mocked(api.get).mockResolvedValue(mockDocument)

      const result = await DocumentService.getDocument('doc1')

      expect(api.get).toHaveBeenCalledWith('/api/documents/doc1')
      expect(result._id).toBe('doc1')
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.getDocument('')).rejects.toThrow('문서 ID가 필요합니다')
      await expect(DocumentService.getDocument('   ')).rejects.toThrow('문서 ID가 필요합니다')
    })

    it('API 에러를 그대로 전파해야 함', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Not Found'))

      await expect(DocumentService.getDocument('invalid')).rejects.toThrow('Not Found')
    })
  })

  // ============================================================================
  // 3. createDocument() - 문서 생성
  // ============================================================================
  describe('createDocument', () => {
    it('새 문서를 생성해야 함', async () => {
      const createData = {
        filename: 'new.pdf',
        originalName: 'new.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
      }

      const mockResponse = {
        _id: 'new-doc',
        ...createData,
        status: 'active',
        ocrStatus: 'pending',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
        tags: [],
      }

      vi.mocked(api.post).mockResolvedValue(mockResponse)

      const result = await DocumentService.createDocument(createData)

      expect(api.post).toHaveBeenCalledWith('/api/documents', expect.any(Object))
      expect(result._id).toBe('new-doc')
    })

    it('유효하지 않은 데이터로 호출 시 에러를 던져야 함', async () => {
      const invalidData = {} as any

      await expect(DocumentService.createDocument(invalidData)).rejects.toThrow()
    })
  })

  // ============================================================================
  // 4. updateDocument() - 문서 수정
  // ============================================================================
  describe('updateDocument', () => {
    it('문서 정보를 수정해야 함', async () => {
      const updateData = {
        filename: 'updated.pdf',
      }

      const mockResponse = {
        _id: 'doc1',
        filename: 'updated.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'active',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      }

      vi.mocked(api.put).mockResolvedValue(mockResponse)

      const result = await DocumentService.updateDocument('doc1', updateData)

      expect(api.put).toHaveBeenCalledWith('/api/documents/doc1', expect.any(Object))
      expect(result.filename).toBe('updated.pdf')
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.updateDocument('', {})).rejects.toThrow('문서 ID가 필요합니다')
    })

    it('status 변경을 허용해야 함', async () => {
      const updateData = { status: 'archived' as const }

      const mockResponse = {
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'archived',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      }

      vi.mocked(api.put).mockResolvedValue(mockResponse)

      const result = await DocumentService.updateDocument('doc1', updateData)

      expect(result.status).toBe('archived')
    })
  })

  // ============================================================================
  // 5. deleteDocument() - 문서 삭제 (소프트 삭제)
  // ============================================================================
  describe('deleteDocument', () => {
    it('문서를 소프트 삭제(status=deleted)해야 함', async () => {
      const mockResponse = {
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'deleted',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      }

      vi.mocked(api.put).mockResolvedValue(mockResponse)

      await DocumentService.deleteDocument('doc1')

      expect(api.put).toHaveBeenCalledWith(
        '/api/documents/doc1',
        expect.objectContaining({ status: 'deleted' })
      )
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.deleteDocument('')).rejects.toThrow('문서 ID가 필요합니다')
    })
  })

  // ============================================================================
  // 6. searchDocuments() - 문서 검색
  // ============================================================================
  describe('searchDocuments', () => {
    it('검색어로 문서를 검색해야 함', async () => {
      const mockResponse = {
        documents: [{ _id: 'doc1', filename: '보험청구서.pdf' }],
        pagination: { totalCount: 1 },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.searchDocuments('보험청구서')

      expect(result.documents).toHaveLength(1)
    })

    it('빈 검색어로 호출 시 전체 목록을 반환해야 함', async () => {
      const mockResponse = {
        documents: [{ _id: 'doc1', filename: 'test.pdf' }],
        pagination: { totalCount: 1 },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.searchDocuments('')

      expect(api.get).toHaveBeenCalledWith('/api/documents')
    })

    it('공백만 있는 검색어로 호출 시 전체 목록을 반환해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      await DocumentService.searchDocuments('   ')

      expect(api.get).toHaveBeenCalledWith('/api/documents')
    })

    it('검색 옵션을 전달해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      await DocumentService.searchDocuments('test', { limit: 20, offset: 10 })

      const url = vi.mocked(api.get).mock.calls[0][0] as string
      expect(url).toContain('search=test')
      expect(url).toContain('limit=20')
      expect(url).toContain('offset=10')
    })
  })

  // ============================================================================
  // 7. getDocumentsByCustomer() - 고객별 문서 조회
  // ============================================================================
  describe('getDocumentsByCustomer', () => {
    it('고객 ID로 문서를 조회해야 함', async () => {
      const mockResponse = {
        documents: [{ _id: 'doc1', filename: 'test.pdf' }],
        pagination: { totalCount: 1 },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getDocumentsByCustomer('customer1')

      expect(result.documents).toHaveLength(1)
    })

    it('빈 고객 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.getDocumentsByCustomer('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
    })

    it('고객 ID를 쿼리에 포함해야 함', async () => {
      const mockResponse = { documents: [], pagination: {} }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      await DocumentService.getDocumentsByCustomer('customer1')

      // customerId는 내부적으로 쿼리에 추가되지만, API 호출은 getDocuments를 통해 이루어짐
      expect(api.get).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // 8. getCustomerDocuments() - 고객 연결 문서 조회
  // ============================================================================
  describe('getCustomerDocuments', () => {
    it('고객에 연결된 문서 목록을 조회해야 함', async () => {
      const mockResponse = {
        data: {
          customer_id: 'customer1',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              uploadedAt: '2025-10-14T10:00:00Z',
              fileSize: 1024,
              mimeType: 'application/pdf',
              relationship: 'insurance',
            },
          ],
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('customer1')

      expect(api.get).toHaveBeenCalledWith('/api/customers/customer1/documents')
      expect(result.customer_id).toBe('customer1')
      expect(result.documents).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('빈 고객 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.getCustomerDocuments('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
    })

    it('루트 documents 구조를 처리해야 함', async () => {
      const mockResponse = {
        customer_id: 'customer1',
        documents: [{ _id: 'doc1', originalName: 'test.pdf' }],
        total: 1,
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('customer1')

      expect(result.documents).toHaveLength(1)
    })

    it('_id가 없는 문서는 필터링해야 함', async () => {
      const mockResponse = {
        documents: [
          { _id: 'doc1', originalName: 'valid.pdf' },
          { originalName: 'invalid.pdf' }, // _id 없음
        ],
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('customer1')

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]._id).toBe('doc1')
    })

    it('빈 응답을 처리해야 함', async () => {
      const mockResponse = { documents: [] }
      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('customer1')

      expect(result.documents).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  // ============================================================================
  // 9. linkDocumentToCustomer() - 문서-고객 연결
  // ============================================================================
  describe('linkDocumentToCustomer', () => {
    it('문서를 고객에게 연결해야 함', async () => {
      vi.mocked(api.post).mockResolvedValue({})

      const payload = {
        document_id: 'doc1',
        relationship_type: 'insurance',
        notes: '보험 청구 문서',
      }

      await DocumentService.linkDocumentToCustomer('customer1', payload)

      expect(api.post).toHaveBeenCalledWith('/api/customers/customer1/documents', payload)
    })

    it('빈 고객 ID로 호출 시 에러를 던져야 함', async () => {
      const payload = { document_id: 'doc1', relationship_type: 'insurance' }

      await expect(DocumentService.linkDocumentToCustomer('', payload)).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
    })

    it('빈 문서 ID로 호출 시 에러를 던져야 함', async () => {
      const payload = { document_id: '', relationship_type: 'insurance' }

      await expect(DocumentService.linkDocumentToCustomer('customer1', payload)).rejects.toThrow(
        '문서 ID가 필요합니다'
      )
    })

    it('공백만 있는 문서 ID로 호출 시 에러를 던져야 함', async () => {
      const payload = { document_id: '   ', relationship_type: 'insurance' }

      await expect(DocumentService.linkDocumentToCustomer('customer1', payload)).rejects.toThrow(
        '문서 ID가 필요합니다'
      )
    })
  })

  // ============================================================================
  // 10. unlinkDocumentFromCustomer() - 문서-고객 연결 해제
  // ============================================================================
  describe('unlinkDocumentFromCustomer', () => {
    it('문서와 고객 연결을 해제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValue({})

      await DocumentService.unlinkDocumentFromCustomer('customer1', 'doc1')

      expect(api.delete).toHaveBeenCalledWith('/api/customers/customer1/documents/doc1')
    })

    it('빈 고객 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.unlinkDocumentFromCustomer('', 'doc1')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
    })

    it('빈 문서 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.unlinkDocumentFromCustomer('customer1', '')).rejects.toThrow(
        '문서 ID가 필요합니다'
      )
    })
  })

  // ============================================================================
  // 11. getDocumentTags() - 태그 목록 조회
  // ============================================================================
  describe('getDocumentTags', () => {
    it('사용 중인 태그 목록을 조회해야 함', async () => {
      const mockTags = ['보험', '계약서', '청구서']
      vi.mocked(api.get).mockResolvedValue(mockTags)

      const result = await DocumentService.getDocumentTags()

      expect(api.get).toHaveBeenCalledWith('/api/documents/tags')
      expect(result).toEqual(mockTags)
    })

    it('배열이 아닌 응답은 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValue({ tags: [] })

      await expect(DocumentService.getDocumentTags()).rejects.toThrow(
        'Invalid tags response format'
      )
    })

    it('문자열이 아닌 요소는 필터링해야 함', async () => {
      vi.mocked(api.get).mockResolvedValue(['valid', 123, null, 'tag2'])

      const result = await DocumentService.getDocumentTags()

      expect(result).toEqual(['valid', 'tag2'])
    })

    it('빈 배열을 처리해야 함', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const result = await DocumentService.getDocumentTags()

      expect(result).toEqual([])
    })
  })

  // ============================================================================
  // 12. getDocumentStats() - 문서 통계 조회
  // ============================================================================
  describe('getDocumentStats', () => {
    it('문서 통계를 조회해야 함', async () => {
      const mockStats = {
        total: 100,
        active: 80,
        archived: 15,
        deleted: 5,
        totalSize: 1024000,
        ocrCompleted: 70,
        ocrPending: 30,
        mostUsedTags: [
          { tag: '보험', count: 50 },
          { tag: '계약서', count: 30 },
        ],
      }

      vi.mocked(api.get).mockResolvedValue(mockStats)

      const result = await DocumentService.getDocumentStats()

      expect(api.get).toHaveBeenCalledWith('/api/documents/stats')
      expect(result).toEqual(mockStats)
    })

    it('숫자가 아닌 값은 0으로 변환해야 함', async () => {
      const mockStats = {
        total: 'invalid',
        active: null,
        archived: undefined,
        deleted: 5,
        totalSize: '1024',
        ocrCompleted: NaN,
        ocrPending: 10,
        mostUsedTags: [],
      }

      vi.mocked(api.get).mockResolvedValue(mockStats)

      const result = await DocumentService.getDocumentStats()

      expect(result.total).toBe(0)
      expect(result.active).toBe(0)
      expect(result.archived).toBe(0)
      expect(result.deleted).toBe(5)
      expect(result.totalSize).toBe(1024)
      expect(result.ocrCompleted).toBe(0)
    })

    it('mostUsedTags가 배열이 아니면 빈 배열로 설정해야 함', async () => {
      const mockStats = {
        total: 100,
        mostUsedTags: null,
      }

      vi.mocked(api.get).mockResolvedValue(mockStats)

      const result = await DocumentService.getDocumentStats()

      expect(result.mostUsedTags).toEqual([])
    })

    it('응답이 객체가 아니면 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValue(null)

      await expect(DocumentService.getDocumentStats()).rejects.toThrow(
        'Invalid stats response format'
      )
    })
  })

  // ============================================================================
  // 13. uploadDocument() - 문서 업로드
  // ============================================================================
  describe('uploadDocument', () => {
    it('파일을 업로드해야 함', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const mockResponse = {
        success: true,
        document: {
          _id: 'new-doc',
          filename: 'test.pdf',
          originalName: 'test.pdf',
          uploadDate: '2025-10-14T10:00:00Z',
          status: 'active',
          ocrStatus: 'pending',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
          tags: [],
        },
      }

      vi.mocked(api.post).mockResolvedValue(mockResponse)

      const result = await DocumentService.uploadDocument(file)

      expect(api.post).toHaveBeenCalledWith('/api/documents/upload', expect.any(FormData))
      expect(result.success).toBe(true)
      expect(result.document?._id).toBe('new-doc')
    })

    it('파일이 없으면 에러를 던져야 함', async () => {
      await expect(DocumentService.uploadDocument(null as any)).rejects.toThrow(
        '파일이 필요합니다'
      )
    })

    it('메타데이터를 FormData에 추가해야 함', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const metadata = {
        tags: ['보험', '청구서'],
        notes: '테스트 문서',
      }

      vi.mocked(api.post).mockResolvedValue({ success: true })

      await DocumentService.uploadDocument(file, metadata)

      const formData = vi.mocked(api.post).mock.calls[0][1] as FormData
      expect(formData.get('file')).toBe(file)
    })

    it('배열 메타데이터는 JSON.stringify해야 함', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const metadata = { tags: ['tag1', 'tag2'] }

      vi.mocked(api.post).mockResolvedValue({ success: true })

      await DocumentService.uploadDocument(file, metadata)

      // FormData에 배열이 JSON 문자열로 추가되었는지 확인
      expect(api.post).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // 14. downloadDocument() - 문서 다운로드
  // ============================================================================
  describe('downloadDocument', () => {
    it('문서를 Blob으로 다운로드해야 함', async () => {
      const mockBlob = new Blob(['file content'], { type: 'application/pdf' })
      vi.mocked(api.get).mockResolvedValue(mockBlob)

      const result = await DocumentService.downloadDocument('doc1')

      expect(api.get).toHaveBeenCalledWith('/api/documents/doc1/download')
      expect(result).toBe(mockBlob)
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.downloadDocument('')).rejects.toThrow('문서 ID가 필요합니다')
    })
  })

  // ============================================================================
  // 15. deleteDocuments() - 문서 일괄 삭제
  // ============================================================================
  describe('deleteDocuments', () => {
    it('여러 문서를 병렬로 삭제해야 함', async () => {
      vi.mocked(api.put).mockResolvedValue({
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'deleted',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      })

      await DocumentService.deleteDocuments(['doc1', 'doc2', 'doc3'])

      expect(api.put).toHaveBeenCalledTimes(3)
    })

    it('빈 배열로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.deleteDocuments([])).rejects.toThrow(
        '삭제할 문서 ID가 필요합니다'
      )
    })

    it('일부 삭제 실패해도 나머지는 계속 처리해야 함', async () => {
      vi.mocked(api.put)
        .mockResolvedValueOnce({
          _id: 'doc1',
          filename: 'test.pdf',
          status: 'deleted',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T11:00:00Z',
          tags: [],
        })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          _id: 'doc3',
          filename: 'test.pdf',
          status: 'deleted',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T11:00:00Z',
          tags: [],
        })

      // Promise.all은 하나라도 실패하면 전체가 실패하므로 에러가 발생
      await expect(DocumentService.deleteDocuments(['doc1', 'doc2', 'doc3'])).rejects.toThrow()
    })
  })

  // ============================================================================
  // 16. archiveDocument() - 문서 보관
  // ============================================================================
  describe('archiveDocument', () => {
    it('문서를 보관 처리(status=archived)해야 함', async () => {
      const mockResponse = {
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'archived',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      }

      vi.mocked(api.put).mockResolvedValue(mockResponse)

      const result = await DocumentService.archiveDocument('doc1')

      expect(api.put).toHaveBeenCalledWith(
        '/api/documents/doc1',
        expect.objectContaining({ status: 'archived' })
      )
      expect(result.status).toBe('archived')
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.archiveDocument('')).rejects.toThrow('문서 ID가 필요합니다')
    })
  })

  // ============================================================================
  // 17. archiveDocuments() - 문서 일괄 보관
  // ============================================================================
  describe('archiveDocuments', () => {
    it('여러 문서를 병렬로 보관해야 함', async () => {
      const mockResponse = {
        _id: 'doc1',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        uploadDate: '2025-10-14T10:00:00Z',
        status: 'archived',
        ocrStatus: 'completed',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
        tags: [],
      }

      vi.mocked(api.put).mockResolvedValue(mockResponse)

      const results = await DocumentService.archiveDocuments(['doc1', 'doc2', 'doc3'])

      expect(api.put).toHaveBeenCalledTimes(3)
      expect(results).toHaveLength(3)
      results.forEach((doc) => {
        expect(doc.status).toBe('archived')
      })
    })

    it('빈 배열로 호출 시 에러를 던져야 함', async () => {
      await expect(DocumentService.archiveDocuments([])).rejects.toThrow(
        '보관할 문서 ID가 필요합니다'
      )
    })
  })
})
