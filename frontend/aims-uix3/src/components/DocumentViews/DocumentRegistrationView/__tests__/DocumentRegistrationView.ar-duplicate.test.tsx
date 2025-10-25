/**
 * AR 문서 등록 유닛 테스트
 *
 * 테스트 범위:
 * 1. 문서 없음 → 문서 업로드 성공 (AR은 항상 등록)
 * 2. 문서 있음 → 문서 중복 차단 (AR은 항상 등록)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DocumentService } from '@/services/DocumentService'
import * as fileHashModule from '@/features/customer/utils/fileHash'
import { processAnnualReportFile } from '../utils/annualReportProcessor'

describe('AR Document Registration', () => {
  const mockCustomerId = 'customer123'
  const mockFileName = 'test-ar.pdf'
  const mockFileHash = 'abc123hash456'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('케이스 1: 문서 없음', () => {
    it('문서 업로드가 성공해야 함', async () => {
      // Given: 고객에게 문서 없음
      vi.spyOn(DocumentService, 'getCustomerDocuments').mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [], // 문서 없음
        total: 0
      })

      vi.spyOn(fileHashModule, 'calculateFileHash').mockResolvedValue(mockFileHash)

      // When: processAnnualReportFile 함수 호출
      const result = await processAnnualReportFile(
        new File([], mockFileName),
        mockCustomerId
      )

      // Then: 문서 업로드 진행
      expect(result.isDuplicateDoc).toBe(false)
      expect(result.shouldUploadDoc).toBe(true)
    })
  })

  describe('케이스 2: 문서 있음', () => {
    it('문서 중복 차단해야 함', async () => {
      // Given: 고객에게 동일한 파일 해시의 문서가 있음
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
        mockCustomerId
      )

      // Then: 문서는 중복
      expect(result.isDuplicateDoc).toBe(true)
      expect(result.shouldUploadDoc).toBe(false)
    })
  })
})
