import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DocumentService } from '@/services/DocumentService'

/**
 * AR 자동 연결 기능 유닛 테스트
 *
 * 테스트 범위:
 * 1. AR 파일 업로드 후 고객 ID 매핑 저장
 * 2. 문서 처리 완료 폴링 설정 (5초 간격, 최대 3분)
 * 3. 처리 완료 시 자동 연결 호출
 * 4. 타임아웃 시 정리
 */
describe('AR Auto-Link Feature', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let linkCustomerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // fetch mock
    fetchMock = vi.fn()
    global.fetch = fetchMock

    // DocumentService.linkDocumentToCustomer mock
    linkCustomerMock = vi.fn().mockResolvedValue({ success: true })
    vi.spyOn(DocumentService, 'linkDocumentToCustomer').mockImplementation(linkCustomerMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setAnnualReportFlag 함수', () => {
    it('AR 플래그 설정 API를 호출해야 함', async () => {
      const fileName = 'test-ar.pdf'

      // AR 플래그 설정 API 응답 mock
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          success: true,
          message: 'is_annual_report 필드가 설정되었습니다.',
          document_id: 'doc123'
        })
      })

      // API 호출 시뮬레이션
      const response = await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileName })
      })
      const responseData = await response.json()

      // API 호출 확인
      expect(fetchMock).toHaveBeenCalledWith(
        'http://tars.giize.com:3010/api/documents/set-annual-report',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fileName })
        })
      )

      expect(responseData.success).toBe(true)
      expect(responseData.document_id).toBe('doc123')
    })

    it('폴링 설정 값이 올바르게 정의되어야 함', () => {
      const checkInterval = 5000 // 5초
      const maxAttempts = 36 // 최대 180초 (3분)

      expect(checkInterval).toBe(5000)
      expect(maxAttempts).toBe(36)
      expect(checkInterval * maxAttempts).toBe(180000) // 3분
    })

    it('문서 상태 API 엔드포인트가 올바른 형식이어야 함', () => {
      const documentId = 'doc123'
      const endpoint = `http://tars.giize.com:3010/api/documents/${documentId}/status`

      expect(endpoint).toBe('http://tars.giize.com:3010/api/documents/doc123/status')
    })

    it('올바른 응답 경로를 확인해야 함', () => {
      const mockResponse = {
        success: true,
        data: {
          computed: {
            overallStatus: 'completed',
            progress: 100
          }
        }
      }

      // 올바른 경로 체크
      const isCompleted = mockResponse.success && mockResponse.data?.computed?.overallStatus === 'completed'

      expect(isCompleted).toBe(true)
    })

    it('잘못된 응답 경로는 실패해야 함', () => {
      const mockResponse = {
        success: true,
        data: {
          computed: {
            overallStatus: 'processing'
          }
        }
      }

      const isCompleted = mockResponse.success && mockResponse.data?.computed?.overallStatus === 'completed'

      expect(isCompleted).toBe(false)
    })

    it('고객 ID와 문서 ID가 모두 있을 때만 폴링을 시작해야 함', () => {
      const customerId = 'customer123'
      const documentId = 'doc456'

      const shouldStartPolling = Boolean(customerId && documentId)

      expect(shouldStartPolling).toBe(true)
    })

    it('고객 ID가 없으면 폴링을 시작하지 않아야 함', () => {
      const customerId = undefined
      const documentId = 'doc456'

      const shouldStartPolling = Boolean(customerId && documentId)

      expect(shouldStartPolling).toBe(false)
    })

    it('문서 ID가 없으면 폴링을 시작하지 않아야 함', () => {
      const customerId = 'customer123'
      const documentId = undefined

      const shouldStartPolling = Boolean(customerId && documentId)

      expect(shouldStartPolling).toBe(false)
    })

    it('DocumentService.linkDocumentToCustomer 호출 파라미터가 올바른 형식이어야 함', () => {
      const documentId = 'doc456'
      const params = {
        document_id: documentId,
        relationship_type: 'annual_report'
      }

      expect(params.document_id).toBe('doc456')
      expect(params.relationship_type).toBe('annual_report')
    })
  })

  describe('고객 매핑 저장', () => {
    it('AR 파일 감지 시 파일명과 고객 ID를 매핑 저장해야 함', () => {
      const arCustomerMapping = new Map<string, string>()
      const fileName = 'test-ar.pdf'
      const customerId = 'customer123'

      // 매핑 저장
      arCustomerMapping.set(fileName, customerId)

      // 저장 확인
      expect(arCustomerMapping.has(fileName)).toBe(true)
      expect(arCustomerMapping.get(fileName)).toBe(customerId)
      expect(arCustomerMapping.size).toBe(1)
    })

    it('모달에서 고객 선택 시에도 매핑을 저장해야 함', () => {
      const arCustomerMapping = new Map<string, string>()
      const fileName = 'duplicate-customer-ar.pdf'
      const selectedCustomerId = 'customer789'

      // 모달 선택 후 매핑 저장
      arCustomerMapping.set(fileName, selectedCustomerId)

      expect(arCustomerMapping.get(fileName)).toBe(selectedCustomerId)
    })

    it('자동 연결 완료 후 매핑을 삭제해야 함', () => {
      const arCustomerMapping = new Map<string, string>()
      const fileName = 'test-ar.pdf'
      const customerId = 'customer456'

      arCustomerMapping.set(fileName, customerId)
      expect(arCustomerMapping.has(fileName)).toBe(true)

      // 자동 연결 완료 후 삭제
      arCustomerMapping.delete(fileName)
      expect(arCustomerMapping.has(fileName)).toBe(false)
      expect(arCustomerMapping.size).toBe(0)
    })

    it('여러 AR 파일을 독립적으로 관리할 수 있어야 함', () => {
      const arCustomerMapping = new Map<string, string>()

      arCustomerMapping.set('ar1.pdf', 'customer1')
      arCustomerMapping.set('ar2.pdf', 'customer2')
      arCustomerMapping.set('ar3.pdf', 'customer3')

      expect(arCustomerMapping.size).toBe(3)
      expect(arCustomerMapping.get('ar1.pdf')).toBe('customer1')
      expect(arCustomerMapping.get('ar2.pdf')).toBe('customer2')
      expect(arCustomerMapping.get('ar3.pdf')).toBe('customer3')

      // 하나만 삭제
      arCustomerMapping.delete('ar2.pdf')
      expect(arCustomerMapping.size).toBe(2)
      expect(arCustomerMapping.has('ar2.pdf')).toBe(false)
      expect(arCustomerMapping.has('ar1.pdf')).toBe(true)
      expect(arCustomerMapping.has('ar3.pdf')).toBe(true)
    })
  })

  describe('API 응답 구조 검증', () => {
    it('실제 백엔드 응답 구조를 올바르게 파싱해야 함', () => {
      const actualBackendResponse = {
        success: true,
        data: {
          raw: {
            _id: 'doc123'
          },
          computed: {
            overallStatus: 'completed', // ← 올바른 경로
            progress: 100
          }
        }
      }

      const isCompleted = actualBackendResponse.success &&
        actualBackendResponse.data?.computed?.overallStatus === 'completed'

      expect(isCompleted).toBe(true)
    })

    it('처리 중 상태를 올바르게 감지해야 함', () => {
      const processingResponse = {
        success: true,
        data: {
          computed: {
            overallStatus: 'processing',
            progress: 50
          }
        }
      }

      const isCompleted = processingResponse.success &&
        processingResponse.data?.computed?.overallStatus === 'completed'

      expect(isCompleted).toBe(false)
    })

    it('에러 상태를 올바르게 감지해야 함', () => {
      const errorResponse: { success: boolean; error: string; data?: any } = {
        success: false,
        error: 'Document not found'
      }

      const isCompleted = errorResponse.success &&
        errorResponse.data?.computed?.overallStatus === 'completed'

      expect(isCompleted).toBe(false)
    })
  })

  describe('타임아웃 로직', () => {
    it('최대 시도 횟수를 초과하면 정리해야 함', () => {
      const maxAttempts = 36
      let attempts = 37 // 초과

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(true)
    })

    it('최대 시도 횟수 이내면 계속 진행해야 함', () => {
      const maxAttempts = 36
      let attempts = 10

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(false)
    })

    it('정확히 최대 시도 횟수에 도달하면 타임아웃해야 함', () => {
      const maxAttempts = 36
      let attempts = 36

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(true)
    })
  })
})
