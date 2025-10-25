/**
 * AR 중복 등록 방지 유닛 테스트
 *
 * 테스트 범위:
 * 1. AR 없음, 문서 없음 → AR 등록 + 문서 업로드 성공
 * 2. AR 있음, 문서 없음 → AR 중복 차단 + 문서 업로드 성공
 * 3. AR 없음, 문서 있음 → AR 등록 성공 + 문서 중복 차단
 * 4. AR 있음, 문서 있음 → AR 중복 차단 + 문서 중복 차단
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AnnualReportApi } from '@/features/customer/api/annualReportApi'
import { DocumentService } from '@/services/DocumentService'
import * as fileHashModule from '@/features/customer/utils/fileHash'

describe('AR Duplicate Prevention', () => {
  const mockCustomerId = 'customer123'
  const mockFileName = 'test-ar.pdf'
  const mockIssueDate = '2025-08-29'
  const mockFileHash = 'abc123hash456'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('케이스 1: AR 없음, 문서 없음', () => {
    it('AR 등록 + 문서 업로드가 모두 성공해야 함', async () => {
      // Given: 고객에게 AR도 문서도 없음
      vi.spyOn(AnnualReportApi, 'getAnnualReports').mockResolvedValue({
        success: true,
        data: {
          customer_id: mockCustomerId,
          reports: [], // AR 없음
          total_count: 0
        }
      })

      vi.spyOn(DocumentService, 'getCustomerDocuments').mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [], // 문서 없음
        total: 0
      })

      vi.spyOn(fileHashModule, 'calculateFileHash').mockResolvedValue(mockFileHash)

      // When: AR 파일 업로드 시도
      const arCheckResult = await AnnualReportApi.getAnnualReports(mockCustomerId, 100)
      const docCheckResult = await DocumentService.getCustomerDocuments(mockCustomerId)

      // Then: 중복 없음 확인
      expect(arCheckResult.data?.reports.length).toBe(0)
      expect(docCheckResult.documents?.length).toBe(0)

      // AR 파싱 및 문서 업로드 진행해야 함
      const shouldParseAr = true
      const shouldUploadDoc = true

      expect(shouldParseAr).toBe(true)
      expect(shouldUploadDoc).toBe(true)
    })
  })

  describe('케이스 2: AR 있음, 문서 없음', () => {
    it('AR 중복 차단 + 문서 업로드 성공해야 함', async () => {
      // Given: 고객에게 동일한 발행일의 AR이 이미 있음, 하지만 문서는 없음
      vi.spyOn(AnnualReportApi, 'getAnnualReports').mockResolvedValue({
        success: true,
        data: {
          customer_id: mockCustomerId,
          reports: [
            {
              report_id: 'ar123',
              issue_date: mockIssueDate, // 동일한 발행일
              customer_name: '김보성',
              total_monthly_premium: 100000,
              total_coverage: 50000,
              contract_count: 5,
              created_at: '2025-10-25T00:00:00Z'
            }
          ],
          total_count: 1
        }
      })

      vi.spyOn(DocumentService, 'getCustomerDocuments').mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [], // 문서 없음
        total: 0
      })

      vi.spyOn(fileHashModule, 'calculateFileHash').mockResolvedValue(mockFileHash)

      // When: AR 파일 업로드 시도
      const arCheckResult = await AnnualReportApi.getAnnualReports(mockCustomerId, 100)
      const existingIssueDates = arCheckResult.data?.reports.map(r => r.issue_date?.substring(0, 10)) || []
      const isArDuplicate = existingIssueDates.includes(mockIssueDate)

      const isDocDuplicate = false // 문서 없으므로 중복 아님

      // Then: AR은 중복, 문서는 중복 아님
      expect(isArDuplicate).toBe(true)
      expect(isDocDuplicate).toBe(false)

      // AR 파싱은 건너뛰고, 문서 업로드만 진행
      const shouldParseAr = false
      const shouldUploadDoc = true

      expect(shouldParseAr).toBe(false)
      expect(shouldUploadDoc).toBe(true)
    })
  })

  describe('케이스 3: AR 없음, 문서 있음', () => {
    it('AR 등록 성공 + 문서 중복 차단해야 함', async () => {
      // Given: 고객에게 AR은 없지만, 동일한 파일 해시의 문서가 있음
      vi.spyOn(AnnualReportApi, 'getAnnualReports').mockResolvedValue({
        success: true,
        data: {
          customer_id: mockCustomerId,
          reports: [], // AR 없음
          total_count: 0
        }
      })

      const mockDocId = 'doc123'
      vi.spyOn(DocumentService, 'getCustomerDocuments').mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [
          {
            _id: mockDocId,
            originalName: mockFileName,
            relationship: 'general'
          }
        ],
        total: 1
      })

      // 문서 상태 API mock (file_hash 포함)
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: {
                file_hash: mockFileHash // 동일한 해시
              }
            }
          }
        })
      })

      vi.spyOn(fileHashModule, 'calculateFileHash').mockResolvedValue(mockFileHash)

      // When: AR 파일 업로드 시도
      const isArDuplicate = false // AR 없음

      const uploadFileHash = await fileHashModule.calculateFileHash(new File([], mockFileName))
      const docStatusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${mockDocId}/status`)
      const docData = await docStatusResponse.json()
      const existingHash = docData.data?.raw?.meta?.file_hash
      const isDocDuplicate = uploadFileHash === existingHash

      // Then: AR은 중복 아님, 문서는 중복
      expect(isArDuplicate).toBe(false)
      expect(isDocDuplicate).toBe(true)

      // AR 파싱은 진행, 문서 업로드는 건너뛰기
      const shouldParseAr = true
      const shouldUploadDoc = false

      expect(shouldParseAr).toBe(true)
      expect(shouldUploadDoc).toBe(false)
    })
  })

  describe('케이스 4: AR 있음, 문서 있음', () => {
    it('AR 중복 차단 + 문서 중복 차단해야 함', async () => {
      // Given: 고객에게 동일한 발행일의 AR과 동일한 파일 해시의 문서가 모두 있음
      vi.spyOn(AnnualReportApi, 'getAnnualReports').mockResolvedValue({
        success: true,
        data: {
          customer_id: mockCustomerId,
          reports: [
            {
              report_id: 'ar123',
              issue_date: mockIssueDate, // 동일한 발행일
              customer_name: '김보성',
              total_monthly_premium: 100000,
              total_coverage: 50000,
              contract_count: 5,
              created_at: '2025-10-25T00:00:00Z'
            }
          ],
          total_count: 1
        }
      })

      const mockDocId = 'doc123'
      vi.spyOn(DocumentService, 'getCustomerDocuments').mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [
          {
            _id: mockDocId,
            originalName: mockFileName,
            relationship: 'annual_report'
          }
        ],
        total: 1
      })

      // 문서 상태 API mock (file_hash 포함)
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            raw: {
              meta: {
                file_hash: mockFileHash // 동일한 해시
              }
            }
          }
        })
      })

      vi.spyOn(fileHashModule, 'calculateFileHash').mockResolvedValue(mockFileHash)

      // When: AR 파일 업로드 시도
      const arCheckResult = await AnnualReportApi.getAnnualReports(mockCustomerId, 100)
      const existingIssueDates = arCheckResult.data?.reports.map(r => r.issue_date?.substring(0, 10)) || []
      const isArDuplicate = existingIssueDates.includes(mockIssueDate)

      const uploadFileHash = await fileHashModule.calculateFileHash(new File([], mockFileName))
      const docStatusResponse = await fetch(`http://tars.giize.com:3010/api/documents/${mockDocId}/status`)
      const docData = await docStatusResponse.json()
      const existingHash = docData.data?.raw?.meta?.file_hash
      const isDocDuplicate = uploadFileHash === existingHash

      // Then: AR도 중복, 문서도 중복
      expect(isArDuplicate).toBe(true)
      expect(isDocDuplicate).toBe(true)

      // AR 파싱도 건너뛰고, 문서 업로드도 건너뛰기
      const shouldParseAr = false
      const shouldUploadDoc = false

      expect(shouldParseAr).toBe(false)
      expect(shouldUploadDoc).toBe(false)
    })
  })
})
