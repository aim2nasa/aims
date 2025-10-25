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
import { processAnnualReportFile } from '../utils/annualReportProcessor'

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

      // When: processAnnualReportFile 함수 호출
      const result = await processAnnualReportFile(
        new File([], mockFileName),
        mockCustomerId,
        { issue_date: mockIssueDate, customer_name: '김보성' }
      )

      // Then: AR 파싱 및 문서 업로드 모두 진행
      expect(result.isDuplicateAr).toBe(false)
      expect(result.isDuplicateDoc).toBe(false)
      expect(result.shouldParseAr).toBe(true)
      expect(result.shouldUploadDoc).toBe(true)
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

      // When: processAnnualReportFile 함수 호출
      const result = await processAnnualReportFile(
        new File([], mockFileName),
        mockCustomerId,
        { issue_date: mockIssueDate, customer_name: '김보성' }
      )

      // Then: AR 중복, 문서는 중복 아님
      expect(result.isDuplicateAr).toBe(true)
      expect(result.isDuplicateDoc).toBe(false)
      expect(result.shouldParseAr).toBe(false)
      expect(result.shouldUploadDoc).toBe(true)
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

      // When: processAnnualReportFile 함수 호출
      const result = await processAnnualReportFile(
        new File([], mockFileName),
        mockCustomerId,
        { issue_date: mockIssueDate, customer_name: '김보성' }
      )

      // Then: AR은 중복 아님, 문서는 중복
      expect(result.isDuplicateAr).toBe(false)
      expect(result.isDuplicateDoc).toBe(true)
      expect(result.shouldParseAr).toBe(true)
      expect(result.shouldUploadDoc).toBe(false)
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

      // When: processAnnualReportFile 함수 호출
      const result = await processAnnualReportFile(
        new File([], mockFileName),
        mockCustomerId,
        { issue_date: mockIssueDate, customer_name: '김보성' }
      )

      // Then: AR도 중복, 문서도 중복
      expect(result.isDuplicateAr).toBe(true)
      expect(result.isDuplicateDoc).toBe(true)
      expect(result.shouldParseAr).toBe(false)
      expect(result.shouldUploadDoc).toBe(false)
    })
  })
})
