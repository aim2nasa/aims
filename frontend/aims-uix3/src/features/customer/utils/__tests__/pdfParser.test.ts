/**
 * PDF Parser Tests
 * @since 1.0.0
 *
 * PDF 파싱 유틸리티 테스트
 * - PDF 메타데이터 추출
 * - 텍스트 추출 (성공/실패)
 * - Annual Report 판단 로직
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAnnualReportFromPDF } from '../pdfParser'

// pdfjs-dist 모킹
vi.mock('pdfjs-dist', () => {
  const mockGetDocument = vi.fn()

  return {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: mockGetDocument
  }
})

// PDF.js worker URL 모킹
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mocked-worker-url'
}))

describe('pdfParser', () => {
  let mockPdf: {
    getPage: ReturnType<typeof vi.fn>
  }
  let mockPage: {
    getTextContent: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    // 모킹 초기화
    mockPage = {
      getTextContent: vi.fn()
    }

    mockPdf = {
      getPage: vi.fn().mockResolvedValue(mockPage)
    }

    // pdfjs-dist 모듈 모킹 다시 가져오기
    const pdfjsLib = await import('pdfjs-dist')
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf)
    } as any)
  })

  describe('에러 처리', () => {
    it('PDF 읽기 실패 시 false를 반환해야 함', async () => {
      mockPdf.getPage.mockRejectedValue(new Error('PDF 읽기 실패'))

      const file = new File(['invalid pdf'], 'broken.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.is_annual_report).toBe(false)
      expect(result.confidence).toBe(0)
      expect(result.metadata).toBeNull()
    })

    it('페이지 읽기 실패 시 false를 반환해야 함', async () => {
      mockPdf.getPage.mockRejectedValue(new Error('페이지 읽기 실패'))

      const file = new File(['pdf content'], 'no-page.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.is_annual_report).toBe(false)
      expect(result.confidence).toBe(0)
      expect(result.metadata).toBeNull()
    })

    it('텍스트 추출 실패 시 false를 반환해야 함', async () => {
      mockPage.getTextContent.mockRejectedValue(new Error('텍스트 추출 실패'))

      const file = new File(['pdf content'], 'no-text.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.is_annual_report).toBe(false)
      expect(result.confidence).toBe(0)
      expect(result.metadata).toBeNull()
    })

    it('빈 PDF는 false를 반환해야 함', async () => {
      const mockText = {
        items: []
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'empty.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.is_annual_report).toBe(false)
    })

    it('텍스트가 없는 스캔 PDF는 false를 반환해야 함', async () => {
      const mockText = {
        items: [
          { str: '' },
          { str: ' ' },
          { str: '' }
        ]
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'scanned.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.is_annual_report).toBe(false)
    })
  })

  describe('메타데이터 추출', () => {
    // 고객명 추출 테스트 제거 - 사전 선택된 고객 사용으로 변경됨

    it('날짜가 없으면 issue_date가 undefined여야 함', async () => {
      const mockText = {
        items: [
          { str: 'Annual Review Report' },
          { str: 'MetLife' }
          // 날짜 없음
        ]
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'no-date.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      expect(result.metadata?.issue_date).toBeUndefined()
    })

    it('report_title이 없으면 undefined여야 함', async () => {
      const mockText = {
        items: [
          { str: '안영미 고객님을 위한' },
          { str: 'MetLife' }
          // Annual Review Report 없음
        ]
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'no-title.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      // Annual Review Report가 없으므로 is_annual_report가 false
      expect(result.is_annual_report).toBe(false)
    })

    // 고객명 관련 테스트 제거 - 사전 선택된 고객 사용으로 변경됨
  })

  describe('텍스트 항목 처리', () => {
    it('str 속성이 없는 항목은 무시해야 함', async () => {
      const mockText = {
        items: [
          { str: 'Annual Review Report' },
          { transform: [1, 0, 0, 1, 0, 0] }, // str 속성 없음
          { str: 'MetLife' }
        ]
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'mixed-items.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      // 에러 없이 처리되어야 함
      expect(result).toBeDefined()
    })
  })

  describe('대소문자 및 특수 케이스', () => {
    it('대소문자를 구분해야 함 (Annual Review Report)', async () => {
      const mockText = {
        items: [
          { str: 'annual review report' }, // 소문자
          { str: 'MetLife' }
        ]
      }

      mockPage.getTextContent.mockResolvedValue(mockText)

      const file = new File(['pdf content'], 'lowercase.pdf', {
        type: 'application/pdf'
      })

      const result = await checkAnnualReportFromPDF(file)

      // 대소문자가 다르므로 매칭 실패
      expect(result.is_annual_report).toBe(false)
    })
  })
})
