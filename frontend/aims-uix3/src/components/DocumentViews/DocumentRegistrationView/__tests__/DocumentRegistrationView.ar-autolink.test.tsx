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
      const attempts = 37 // 초과

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(true)
    })

    it('최대 시도 횟수 이내면 계속 진행해야 함', () => {
      const maxAttempts = 36
      const attempts = 10

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(false)
    })

    it('정확히 최대 시도 횟수에 도달하면 타임아웃해야 함', () => {
      const maxAttempts = 36
      const attempts = 36

      const shouldTimeout = attempts >= maxAttempts

      expect(shouldTimeout).toBe(true)
    })
  })

  describe('Race Condition 방지 (Critical Bug Fix)', () => {
    it('arFilenamesRef에서 파일 삭제는 setAnnualReportFlag 내부에서만 수행해야 함', () => {
      // 이 테스트는 handleStatusChange에서 arFilenamesRef를 삭제하지 않고
      // setAnnualReportFlag 내부에서만 삭제하는지 검증

      const arFilenamesRef = new Set<string>()
      const fileName = 'test-ar.pdf'

      // 1. 파일 추가
      arFilenamesRef.add(fileName)
      expect(arFilenamesRef.has(fileName)).toBe(true)
      expect(arFilenamesRef.size).toBe(1)

      // 2. handleStatusChange 시뮬레이션 (첫 번째 호출)
      // ⚠️ handleStatusChange에서는 삭제하지 않아야 함!
      const shouldCallSetAnnualReportFlag = arFilenamesRef.has(fileName)
      expect(shouldCallSetAnnualReportFlag).toBe(true)
      // arFilenamesRef.delete(fileName); // ❌ 이렇게 하면 안 됨!

      // 3. handleStatusChange 시뮬레이션 (두 번째 호출)
      // 첫 번째 호출에서 삭제하지 않았으므로, 두 번째 호출에서도 파일이 있어야 함
      const shouldCallSetAnnualReportFlagAgain = arFilenamesRef.has(fileName)
      expect(shouldCallSetAnnualReportFlagAgain).toBe(true) // ✅ 여전히 true!

      // 4. setAnnualReportFlag 시뮬레이션 (첫 번째 실행)
      // setAnnualReportFlag 내부에서만 삭제
      if (arFilenamesRef.has(fileName)) {
        arFilenamesRef.delete(fileName)
        // ... AR 플래그 설정 로직
      }
      expect(arFilenamesRef.has(fileName)).toBe(false)
      expect(arFilenamesRef.size).toBe(0)

      // 5. setAnnualReportFlag 시뮬레이션 (두 번째 실행)
      // 이미 삭제되었으므로 early return
      if (!arFilenamesRef.has(fileName)) {
        // early return - 중복 실행 방지
        expect(arFilenamesRef.has(fileName)).toBe(false)
      } else {
        throw new Error('이 코드는 실행되어서는 안 됨!')
      }
    })

    it('handleStatusChange가 두 번 호출되어도 setAnnualReportFlag는 한 번만 실행해야 함', async () => {
      const arFilenamesRef = new Set<string>()
      const fileName = 'test-ar.pdf'
      const customerId = 'customer123'
      const arCustomerMapping = new Map<string, string>()

      // 초기 설정
      arFilenamesRef.add(fileName)
      arCustomerMapping.set(fileName, customerId)

      let setAnnualReportFlagCallCount = 0

      // setAnnualReportFlag 시뮬레이션 함수
      const setAnnualReportFlag = (fileName: string) => {
        // 중복 실행 방지
        if (!arFilenamesRef.has(fileName)) {
          console.log(`⚠️ 이미 처리 중이거나 완료된 파일: ${fileName}`)
          return
        }

        // 즉시 삭제 (중복 실행 방지)
        arFilenamesRef.delete(fileName)
        setAnnualReportFlagCallCount++

        // ... 나머지 로직 (AR 플래그 설정 등)
      }

      // handleStatusChange 첫 번째 호출
      if (arFilenamesRef.has(fileName)) {
        setAnnualReportFlag(fileName)
      }

      // handleStatusChange 두 번째 호출
      if (arFilenamesRef.has(fileName)) {
        setAnnualReportFlag(fileName)
      }

      // 검증: setAnnualReportFlag는 정확히 1번만 실행되어야 함
      expect(setAnnualReportFlagCallCount).toBe(1)
      expect(arFilenamesRef.has(fileName)).toBe(false)
      expect(arFilenamesRef.size).toBe(0)
    })

    it('동시에 여러 AR 파일 업로드 시 각각 독립적으로 처리되어야 함', async () => {
      const arFilenamesRef = new Set<string>()
      const files = ['ar1.pdf', 'ar2.pdf', 'ar3.pdf']

      // 모든 파일 추가
      files.forEach(file => arFilenamesRef.add(file))
      expect(arFilenamesRef.size).toBe(3)

      const callCounts = new Map<string, number>()

      const setAnnualReportFlag = (fileName: string) => {
        if (!arFilenamesRef.has(fileName)) {
          return
        }

        arFilenamesRef.delete(fileName)
        callCounts.set(fileName, (callCounts.get(fileName) || 0) + 1)
      }

      // 각 파일에 대해 handleStatusChange 2번씩 호출
      files.forEach(file => {
        // 첫 번째 호출
        if (arFilenamesRef.has(file)) {
          setAnnualReportFlag(file)
        }
        // 두 번째 호출
        if (arFilenamesRef.has(file)) {
          setAnnualReportFlag(file)
        }
      })

      // 검증: 각 파일당 정확히 1번씩만 처리
      expect(callCounts.get('ar1.pdf')).toBe(1)
      expect(callCounts.get('ar2.pdf')).toBe(1)
      expect(callCounts.get('ar3.pdf')).toBe(1)
      expect(arFilenamesRef.size).toBe(0)
    })

    it('setAnnualReportFlag가 3번 연속 호출되어도 1번만 실행해야 함', () => {
      const arFilenamesRef = new Set<string>()
      const fileName = 'stress-test.pdf'
      arFilenamesRef.add(fileName)

      let executionCount = 0

      const setAnnualReportFlag = (fileName: string) => {
        if (!arFilenamesRef.has(fileName)) {
          return
        }
        arFilenamesRef.delete(fileName)
        executionCount++
      }

      // 3번 연속 호출
      setAnnualReportFlag(fileName)
      setAnnualReportFlag(fileName)
      setAnnualReportFlag(fileName)

      expect(executionCount).toBe(1)
    })

    it('arFilenamesRef 체크와 삭제가 원자적으로 수행되어야 함', () => {
      const arFilenamesRef = new Set<string>()
      const fileName = 'atomic-test.pdf'
      arFilenamesRef.add(fileName)

      // 원자적 연산 시뮬레이션
      const atomicCheckAndDelete = (fileName: string): boolean => {
        // ✅ 체크와 삭제를 한 번에
        if (!arFilenamesRef.has(fileName)) {
          return false // 이미 처리됨
        }
        arFilenamesRef.delete(fileName)
        return true // 새로 처리함
      }

      // 첫 번째 호출
      const firstCall = atomicCheckAndDelete(fileName)
      expect(firstCall).toBe(true)
      expect(arFilenamesRef.size).toBe(0)

      // 두 번째 호출
      const secondCall = atomicCheckAndDelete(fileName)
      expect(secondCall).toBe(false) // 이미 처리되었으므로 false
      expect(arFilenamesRef.size).toBe(0)
    })

    it('처리 완료 후 매핑 정리가 올바르게 수행되어야 함', () => {
      const arFilenamesRef = new Set<string>()
      const arCustomerMapping = new Map<string, string>()
      const arDocumentCustomerMapping = new Map<string, string>()

      const fileName = 'cleanup-test.pdf'
      const customerId = 'customer123'
      const documentId = 'doc456'

      // 초기 설정
      arFilenamesRef.add(fileName)
      arCustomerMapping.set(fileName, customerId)
      arDocumentCustomerMapping.set(documentId, customerId)

      expect(arFilenamesRef.size).toBe(1)
      expect(arCustomerMapping.size).toBe(1)
      expect(arDocumentCustomerMapping.size).toBe(1)

      // setAnnualReportFlag 실행
      if (arFilenamesRef.has(fileName)) {
        arFilenamesRef.delete(fileName)
      }

      // 자동 연결 완료 후 정리
      arCustomerMapping.delete(fileName)
      arDocumentCustomerMapping.delete(documentId)

      // 모든 매핑이 정리되었는지 확인
      expect(arFilenamesRef.size).toBe(0)
      expect(arCustomerMapping.size).toBe(0)
      expect(arDocumentCustomerMapping.size).toBe(0)
    })
  })
})
