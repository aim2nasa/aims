/**
 * Phase 1-2: 고객 문서 프리뷰 API 엣지 케이스 Regression 테스트
 * @description 고객 문서 프리뷰 API 응답 파싱의 다양한 엣지 케이스 검증
 * @regression 커밋 f5394d9, 1033114 - fix: 고객 문서 미리보기 API 호출 방식 수정
 * @priority HIGH - 사용자가 자주 사용하는 기능의 안정성
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentService } from '../DocumentService'
import * as apiModule from '@/shared/lib/api'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const api = apiModule.api

describe('DocumentService - 고객 문서 프리뷰 엣지 케이스', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCustomerDocuments - API 응답 구조 변화 대응', () => {
    it('정상 케이스: data.documents 경로의 배열', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              uploadedAt: '2025-01-01T00:00:00Z',
              fileSize: 1024,
              mimeType: 'application/pdf'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.customer_id).toBe('cust123')
      expect(result.documents).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.documents[0]?._id).toBe('doc1')
    })

    it('엣지 케이스: 최상위 documents 경로 (data 없음)', async () => {
      const mockResponse = {
        customer_id: 'cust123',
        documents: [
          {
            _id: 'doc1',
            originalName: 'test.pdf'
          }
        ],
        total: 1
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.customer_id).toBe('cust123')
      expect(result.documents).toHaveLength(1)
    })

    it('엣지 케이스: fileUrl이 null인 문서', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              fileUrl: null  // null 값
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // fileUrl이 없어도 문서는 포함되어야 함
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?._id).toBe('doc1')
      // fileUrl 필드는 정의되지 않음 (null이 아님)
      expect(result.documents[0]).not.toHaveProperty('fileUrl')
    })

    it('엣지 케이스: uploadedAt이 Invalid Date를 생성하는 값', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              uploadedAt: 'invalid-date-string'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // Invalid Date여도 문서는 포함되어야 함
      expect(result.documents).toHaveLength(1)
      // uploadedAt 값은 그대로 전달 (유효성 검사는 UI 계층에서)
      expect(result.documents[0]?.uploadedAt).toBe('invalid-date-string')
    })

    it('엣지 케이스: uploadedAt이 없고 linkedAt만 있는 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              linkedAt: '2025-01-02T00:00:00Z'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // linkedAt이 uploadedAt의 fallback으로 사용됨
      expect(result.documents[0]?.uploadedAt).toBe('2025-01-02T00:00:00Z')
    })

    it('엣지 케이스: originalName이 없고 filename만 있는 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              filename: 'fallback-name.pdf'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // filename이 originalName의 fallback으로 사용됨
      expect(result.documents[0]?.originalName).toBe('fallback-name.pdf')
    })

    it('엣지 케이스: documents가 빈 배열', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [],
          total: 0
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.documents).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('엣지 케이스: documents가 배열이 아닌 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: null,  // 배열이 아님
          total: 0
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // null이면 빈 배열로 처리
      expect(result.documents).toHaveLength(0)
    })

    it('엣지 케이스: total 필드가 없는 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            { _id: 'doc1', originalName: 'test.pdf' }
          ]
          // total 필드 없음
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // total이 없으면 documents.length를 사용
      expect(result.total).toBe(1)
    })

    it('엣지 케이스: 문서 객체에 _id가 없는 경우 (id 사용)', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              id: 'doc1',  // _id 대신 id
              originalName: 'test.pdf'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // id를 _id의 fallback으로 사용
      expect(result.documents[0]?._id).toBe('doc1')
    })

    it('엣지 케이스: _id와 id 모두 없는 문서는 제외', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'valid.pdf'
            },
            {
              // _id도 id도 없음
              originalName: 'invalid.pdf'
            },
            {
              _id: 'doc2',
              originalName: 'valid2.pdf'
            }
          ],
          total: 3
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // ID 없는 문서는 필터링
      expect(result.documents).toHaveLength(2)
      expect(result.documents[0]?._id).toBe('doc1')
      expect(result.documents[1]?._id).toBe('doc2')
    })

    it('엣지 케이스: 모든 문서 객체가 배열이 아닌 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            'invalid1',  // 객체가 아님
            null,
            { _id: 'doc1', originalName: 'valid.pdf' },
            undefined,
            123  // 숫자
          ],
          total: 5
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // 유효한 객체만 필터링
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?._id).toBe('doc1')
    })
  })

  describe('getCustomerDocuments - 입력 검증', () => {
    it('빈 문자열 customerId는 에러 발생', async () => {
      await expect(
        DocumentService.getCustomerDocuments('')
      ).rejects.toThrow('고객 ID가 필요합니다')
    })

    it('공백만 있는 customerId는 에러 발생', async () => {
      await expect(
        DocumentService.getCustomerDocuments('   ')
      ).rejects.toThrow('고객 ID가 필요합니다')
    })
  })

  describe('getCustomerDocuments - 선택적 필드 처리', () => {
    it('모든 선택적 필드가 있는 경우', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              originalName: 'test.pdf',
              uploadedAt: '2025-01-01T00:00:00Z',
              fileSize: 2048,
              mimeType: 'application/pdf',
              relationship: '보험증권',
              notes: '중요 문서',
              linkedAt: '2025-01-02T00:00:00Z',
              status: 'active',
              progress: 100
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      const doc = result.documents[0]
      expect(doc).toBeDefined()
      expect(doc?.originalName).toBe('test.pdf')
      expect(doc?.uploadedAt).toBe('2025-01-01T00:00:00Z')
      expect(doc?.fileSize).toBe(2048)
      expect(doc?.mimeType).toBe('application/pdf')
      expect(doc?.relationship).toBe('보험증권')
      expect(doc?.notes).toBe('중요 문서')
      expect(doc?.linkedAt).toBe('2025-01-02T00:00:00Z')
      expect(doc?.status).toBe('active')
      expect(doc?.progress).toBe(100)
    })

    it('최소 필드만 있는 경우 (_id만)', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1'
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      const doc = result.documents[0]
      expect(doc).toBeDefined()
      expect(doc?._id).toBe('doc1')
      // 선택적 필드는 없음
      expect(doc?.originalName).toBeUndefined()
      expect(doc?.uploadedAt).toBeUndefined()
      expect(doc?.fileSize).toBeUndefined()
    })

    it('fileSize가 문자열인 경우 숫자로 변환', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              fileSize: '2048'  // 문자열
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.documents[0]?.fileSize).toBe(2048)
      expect(typeof result.documents[0]?.fileSize).toBe('number')
    })

    it('fileSize가 유효하지 않은 값인 경우 필드 제외', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              fileSize: 'invalid'  // 숫자 변환 불가
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // 유효하지 않은 fileSize는 포함하지 않음
      expect(result.documents[0]?.fileSize).toBeUndefined()
    })

    it('progress가 문자열인 경우 숫자로 변환', async () => {
      const mockResponse = {
        data: {
          customer_id: 'cust123',
          documents: [
            {
              _id: 'doc1',
              progress: '75'  // 문자열
            }
          ],
          total: 1
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.documents[0]?.progress).toBe(75)
      expect(typeof result.documents[0]?.progress).toBe('number')
    })
  })

  describe('getCustomerDocuments - customer_id 유추', () => {
    it('data.customer_id가 있으면 우선 사용', async () => {
      const mockResponse = {
        customer_id: 'root-level-id',
        data: {
          customer_id: 'data-level-id',
          documents: [],
          total: 0
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // data.customer_id 우선
      expect(result.customer_id).toBe('data-level-id')
    })

    it('data.customer_id가 없으면 최상위 customer_id 사용', async () => {
      const mockResponse = {
        customer_id: 'root-level-id',
        data: {
          documents: [],
          total: 0
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      expect(result.customer_id).toBe('root-level-id')
    })

    it('응답에 customer_id가 전혀 없으면 요청 ID 사용', async () => {
      const mockResponse = {
        data: {
          documents: [],
          total: 0
        }
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await DocumentService.getCustomerDocuments('cust123')

      // 요청 시 사용한 ID를 fallback으로 사용
      expect(result.customer_id).toBe('cust123')
    })
  })
})
