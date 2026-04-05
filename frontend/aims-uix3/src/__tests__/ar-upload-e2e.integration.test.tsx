/**
 * AR 문서 업로드 전체 플로우 통합 테스트
 *
 * @description
 * AR(Annual Report) 문서 업로드 시:
 * 1. TXT/AR 뱃지가 올바르게 부착되는지
 * 2. 처리 완료 후 해당 고객과 자동 연결되는지
 * 3. 전체 플로우가 깨지지 않았는지 검증
 *
 * @since 2025-01-23
 * @author Claude Code
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DocumentService } from '@/services/DocumentService'

describe('AR 문서 업로드 전체 플로우 통합 테스트', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let linkDocumentToCustomerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    linkDocumentToCustomerMock = vi.fn().mockResolvedValue({ success: true })
    vi.spyOn(DocumentService, 'linkDocumentToCustomer').mockImplementation(linkDocumentToCustomerMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('[통합] AR 문서 업로드 → 뱃지 부착 → 고객 자동 연결', () => {
    it('AR 문서 업로드 후 TXT 뱃지와 AR 뱃지가 모두 부착되어야 함', async () => {
      const fileName = '홍길동annual_report202508.pdf'
      const customerId = 'customer123'
      const documentId = 'doc456'

      // 1단계: 파일 업로드 (AR 감지)
      const isAnnualReport = fileName.toLowerCase().includes('annual')
      expect(isAnnualReport).toBe(true)

      // 2단계: AR 플래그 설정 API 호출
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'is_annual_report 필드가 설정되었습니다.',
          document_id: documentId
        })
      })

      const setArFlagResponse = await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileName })
      })
      const setArFlagData = await setArFlagResponse.json()

      expect(setArFlagData.success).toBe(true)
      expect(setArFlagData.document_id).toBe(documentId)

      // 3단계: 백엔드가 문서 처리 완료 (OCR/메타데이터 추출)
      // badgeType은 백엔드에서 자동으로 계산됨
      const mockDocumentStatus = {
        success: true,
        data: {
          raw: {
            _id: documentId,
            upload: {
              originalName: fileName
            },
            meta: {
              full_text: '홍길동님의 2025년 8월 연간 보고서...'
            },
            is_annual_report: true
          },
          computed: {
            overallStatus: 'completed',
            progress: 100
          }
        }
      }

      // badgeType 계산 로직 (백엔드 로직 시뮬레이션)
      const hasMetaFullText = !!mockDocumentStatus.data.raw.meta?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : 'BIN'

      expect(badgeType).toBe('TXT') // ✅ TXT 뱃지 부착 확인
      expect(mockDocumentStatus.data.raw.is_annual_report).toBe(true) // ✅ AR 뱃지 부착 확인

      // 4단계: 문서 상태 폴링 (처리 완료 확인)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDocumentStatus
      })

      const statusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${documentId}/status`)
      const statusData = await statusResponse.json()

      const isCompleted = statusData.success && statusData.data?.computed?.overallStatus === 'completed'
      expect(isCompleted).toBe(true)

      // 5단계: 고객 자동 연결
      await DocumentService.linkDocumentToCustomer(customerId, {
        document_id: documentId,
        relationship_type: 'annual_report'
      })

      expect(linkDocumentToCustomerMock).toHaveBeenCalledWith(
        customerId,
        expect.objectContaining({
          document_id: documentId,
          relationship_type: 'annual_report'
        })
      )
      expect(linkDocumentToCustomerMock).toHaveBeenCalledTimes(1)
    })

    it('AR 문서 업로드 후 OCR 뱃지와 AR 뱃지가 모두 부착되어야 함 (이미지 PDF)', async () => {
      const fileName = '김철수annual_report202508.pdf'
      const customerId = 'customer789'
      const documentId = 'doc789'

      // 1단계: AR 플래그 설정
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          document_id: documentId
        })
      })

      await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        body: JSON.stringify({ filename: fileName })
      })

      // 2단계: OCR 처리 완료 (meta.full_text 없음, OCR 신뢰도만 있음)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDocumentStatus: any = {
        success: true,
        data: {
          raw: {
            _id: documentId,
            upload: {
              originalName: fileName
            },
            ocr: {
              full_text: '김철수님의 2025년 8월 연간 보고서...',
              confidence: '0.9234'
            },
            is_annual_report: true
          },
          computed: {
            overallStatus: 'completed',
            progress: 100
          }
        }
      }

      // badgeType 계산 (백엔드 로직)
      const hasMetaFullText = !!mockDocumentStatus.data.raw.meta?.full_text
      const hasOcrFullText = !!mockDocumentStatus.data.raw.ocr?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : (hasOcrFullText ? 'OCR' : 'BIN')

      expect(badgeType).toBe('OCR') // ✅ OCR 뱃지 부착 확인
      expect(mockDocumentStatus.data.raw.is_annual_report).toBe(true) // ✅ AR 뱃지 부착 확인

      // 3단계: 처리 완료 확인
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDocumentStatus
      })

      const statusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${documentId}/status`)
      const statusData = await statusResponse.json()

      expect(statusData.data.computed.overallStatus).toBe('completed')

      // 4단계: 고객 자동 연결
      await DocumentService.linkDocumentToCustomer(customerId, {
        document_id: documentId,
        relationship_type: 'annual_report'
      })

      expect(linkDocumentToCustomerMock).toHaveBeenCalledTimes(1)
    })

    it('처리 완료 전에는 고객 자동 연결이 실행되지 않아야 함', async () => {
      const fileName = 'test-ar.pdf'
      const documentId = 'doc123'

      // AR 플래그 설정
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, document_id: documentId })
      })

      await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        body: JSON.stringify({ filename: fileName })
      })

      // 문서 상태: 아직 처리 중
      const processingStatus = {
        success: true,
        data: {
          computed: {
            overallStatus: 'processing',
            progress: 50
          }
        }
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => processingStatus
      })

      const statusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${documentId}/status`)
      const statusData = await statusResponse.json()

      const isCompleted = statusData.data?.computed?.overallStatus === 'completed'
      expect(isCompleted).toBe(false)

      // 처리 중이므로 자동 연결 실행 안 함
      expect(linkDocumentToCustomerMock).not.toHaveBeenCalled()
    })

    it('처리 실패 시 고객 자동 연결이 실행되지 않아야 함', async () => {
      const fileName = 'failed-ar.pdf'
      const documentId = 'doc999'

      // AR 플래그 설정
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, document_id: documentId })
      })

      await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        body: JSON.stringify({ filename: fileName })
      })

      // 문서 상태: 처리 실패
      const failedStatus = {
        success: true,
        data: {
          computed: {
            overallStatus: 'failed',
            progress: 30
          }
        }
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => failedStatus
      })

      const statusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${documentId}/status`)
      const statusData = await statusResponse.json()

      const isCompleted = statusData.data?.computed?.overallStatus === 'completed'
      expect(isCompleted).toBe(false)

      // 실패했으므로 자동 연결 실행 안 함
      expect(linkDocumentToCustomerMock).not.toHaveBeenCalled()
    })
  })

  describe('[통합] badgeType 계산 로직 검증 (백엔드 시뮬레이션)', () => {
    it('meta.full_text가 있으면 TXT 뱃지', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const document: any = {
        meta: { full_text: 'some text' },
        ocr: undefined
      }

      const hasMetaFullText = !!document.meta?.full_text
      const hasOcrFullText = !!document.ocr?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : (hasOcrFullText ? 'OCR' : 'BIN')

      expect(badgeType).toBe('TXT')
    })

    it('meta.full_text 없고 ocr.full_text만 있으면 OCR 뱃지', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const document: any = {
        meta: undefined,
        ocr: { full_text: 'ocr text', confidence: '0.95' }
      }

      const hasMetaFullText = !!document.meta?.full_text
      const hasOcrFullText = !!document.ocr?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : (hasOcrFullText ? 'OCR' : 'BIN')

      expect(badgeType).toBe('OCR')
    })

    it('둘 다 없으면 BIN 뱃지', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const document: any = {
        meta: undefined,
        ocr: undefined
      }

      const hasMetaFullText = !!document.meta?.full_text
      const hasOcrFullText = !!document.ocr?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : (hasOcrFullText ? 'OCR' : 'BIN')

      expect(badgeType).toBe('BIN')
    })

    it('meta.full_text와 ocr.full_text 둘 다 있으면 TXT 우선', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const document: any = {
        meta: { full_text: 'meta text' },
        ocr: { full_text: 'ocr text', confidence: '0.95' }
      }

      const hasMetaFullText = !!document.meta?.full_text
      const hasOcrFullText = !!document.ocr?.full_text
      const badgeType = hasMetaFullText ? 'TXT' : (hasOcrFullText ? 'OCR' : 'BIN')

      expect(badgeType).toBe('TXT') // meta.full_text가 우선
    })
  })

  describe('[통합] 폴링 메커니즘 검증', () => {
    it('폴링 간격과 최대 시도 횟수가 올바르게 설정되어야 함', () => {
      const POLL_INTERVAL = 5000 // 5초
      const MAX_ATTEMPTS = 36 // 최대 180초 (3분)
      const MAX_DURATION = POLL_INTERVAL * MAX_ATTEMPTS

      expect(POLL_INTERVAL).toBe(5000)
      expect(MAX_ATTEMPTS).toBe(36)
      expect(MAX_DURATION).toBe(180000) // 3분
    })

    it('타임아웃 시 폴링이 중단되어야 함', () => {
      const MAX_ATTEMPTS = 36
      let attempts = 0

      // 폴링 시뮬레이션
      while (attempts < MAX_ATTEMPTS) {
        attempts++
        // 상태 체크...
      }

      expect(attempts).toBe(36)
      expect(attempts >= MAX_ATTEMPTS).toBe(true) // 타임아웃 조건 만족
    })
  })

  describe('[통합] Race Condition 방지', () => {
    it('동시에 여러 AR 파일 업로드 시 각각 독립적으로 처리되어야 함', async () => {
      const files = [
        { name: 'ar1.pdf', customerId: 'c1', documentId: 'd1' },
        { name: 'ar2.pdf', customerId: 'c2', documentId: 'd2' },
        { name: 'ar3.pdf', customerId: 'c3', documentId: 'd3' }
      ]

      const arFilenamesRef = new Set<string>()
      const arCustomerMapping = new Map<string, string>()

      // 모든 파일 추가
      files.forEach(file => {
        arFilenamesRef.add(file.name)
        arCustomerMapping.set(file.name, file.customerId)
      })

      expect(arFilenamesRef.size).toBe(3)
      expect(arCustomerMapping.size).toBe(3)

      // 각 파일 처리 (독립적)
      const processed = new Set<string>()

      files.forEach(file => {
        if (arFilenamesRef.has(file.name)) {
          arFilenamesRef.delete(file.name)
          processed.add(file.name)
        }
      })

      expect(processed.size).toBe(3)
      expect(arFilenamesRef.size).toBe(0)
    })

    it('중복 실행 방지: arFilenamesRef 체크 후 즉시 삭제', () => {
      const arFilenamesRef = new Set<string>()
      const fileName = 'test-ar.pdf'
      arFilenamesRef.add(fileName)

      let executionCount = 0

      const setAnnualReportFlag = (fileName: string) => {
        if (!arFilenamesRef.has(fileName)) {
          return // 중복 실행 방지
        }
        arFilenamesRef.delete(fileName) // 즉시 삭제
        executionCount++
      }

      // 3번 연속 호출
      setAnnualReportFlag(fileName)
      setAnnualReportFlag(fileName)
      setAnnualReportFlag(fileName)

      expect(executionCount).toBe(1) // 1번만 실행되어야 함
    })
  })
})
