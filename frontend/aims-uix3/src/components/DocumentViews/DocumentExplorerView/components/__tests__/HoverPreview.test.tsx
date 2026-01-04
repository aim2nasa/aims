/**
 * HoverPreview 컴포넌트 테스트
 * xlsx 파일 등 썸네일이 없는 파일의 호버 프리뷰 검증
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { HoverPreview } from '../HoverPreview'
import type { Document } from '@/types/documentStatus'

// DocumentStatusService 모킹
vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractFilename: vi.fn((doc: Document) => {
      // upload.originalName 우선
      if (typeof doc.upload === 'object' && doc.upload?.originalName) {
        return doc.upload.originalName
      }
      // JSON 문자열인 경우 파싱
      if (typeof doc.upload === 'string') {
        try {
          const parsed = JSON.parse(doc.upload)
          if (parsed.originalName) return parsed.originalName
        } catch {
          // 파싱 실패 시 무시
        }
      }
      return doc.filename || doc.originalName || 'Unknown File'
    }),
  },
}))

describe('HoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('xlsx 파일 (썸네일 없음)', () => {
    const xlsxDocument: Document = {
      _id: 'doc-xlsx-001',
      upload: {
        originalName: '김보성 종신제안.xlsx',
        destPath: '/data/files/uploads/김보성_종신제안.xlsx',
      },
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: '김보성 종신제안.xlsx',
    }

    it('xlsx 파일에서 파일명을 올바르게 추출해야 함', async () => {
      const { DocumentStatusService } = await import('@/services/DocumentStatusService')
      const filename = DocumentStatusService.extractFilename(xlsxDocument)
      expect(filename).toBe('김보성 종신제안.xlsx')
    })

    it('xlsx 확장자를 올바르게 추출해야 함', () => {
      const getFileExtension = (filename: string): string => {
        const parts = filename.split('.')
        if (parts.length < 2) return ''
        return parts[parts.length - 1].toLowerCase()
      }

      expect(getFileExtension('김보성 종신제안.xlsx')).toBe('xlsx')
      expect(getFileExtension('test.XLSX')).toBe('xlsx')
      expect(getFileExtension('파일.xls')).toBe('xls')
    })

    it('xlsx 파일 아이콘이 올바르게 매핑되어야 함', () => {
      const FILE_TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
        xlsx: { icon: '📊', color: '#217346', label: 'Excel' },
        xls: { icon: '📊', color: '#217346', label: 'Excel' },
      }

      const ext = 'xlsx'
      const icon = FILE_TYPE_ICONS[ext]

      expect(icon).toBeDefined()
      expect(icon.icon).toBe('📊')
      expect(icon.color).toBe('#217346')
      expect(icon.label).toBe('Excel')
    })

    it('xlsx 파일 호버 시 파일 타입 아이콘이 렌더링되어야 함', async () => {
      vi.useRealTimers() // 렌더링 테스트는 실제 타이머 사용

      render(
        <HoverPreview
          document={xlsxDocument}
          position={{ x: 100, y: 100 }}
        />
      )

      // 호버 딜레이 대기 (300ms + 여유)
      await new Promise(resolve => setTimeout(resolve, 400))

      // 파일 타입 아이콘 클래스가 있는지 확인
      const fileIconElement = document.querySelector('.hover-preview__file-icon')
      expect(fileIconElement).toBeInTheDocument()

      // Excel 라벨이 표시되는지 확인
      expect(screen.getByText('Excel')).toBeInTheDocument()

      // 파일명이 표시되는지 확인
      expect(screen.getByText('김보성 종신제안.xlsx')).toBeInTheDocument()
    }, 10000)
  })

  describe('PDF 파일 (썸네일 있음)', () => {
    const pdfDocument: Document = {
      _id: 'doc-pdf-001',
      upload: {
        originalName: 'test.pdf',
        destPath: '/data/files/uploads/test.pdf',
      },
      mimeType: 'application/pdf',
      filename: 'test.pdf',
    }

    it('PDF 파일에서 썸네일 경로를 올바르게 추출해야 함', () => {
      const getThumbnailPath = (doc: Document): string | null => {
        const upload = doc.upload
        if (!upload || typeof upload === 'string') return null

        const destPath = upload.destPath
        const mimeType = doc.mimeType || ''

        if (mimeType.includes('pdf') && destPath) {
          return destPath.replace(/^\/data\/files\//, '')
        }

        return null
      }

      const path = getThumbnailPath(pdfDocument)
      expect(path).toBe('uploads/test.pdf')
    })
  })

  describe('다양한 파일 타입 지원', () => {
    const fileTypes = [
      { ext: 'xlsx', label: 'Excel', color: '#217346' },
      { ext: 'xls', label: 'Excel', color: '#217346' },
      { ext: 'docx', label: 'Word', color: '#2B579A' },
      { ext: 'doc', label: 'Word', color: '#2B579A' },
      { ext: 'pptx', label: 'PowerPoint', color: '#D24726' },
      { ext: 'hwp', label: '한글', color: '#0085CA' },
      { ext: 'txt', label: 'Text', color: '#666666' },
      { ext: 'csv', label: 'CSV', color: '#217346' },
      { ext: 'zip', label: 'ZIP', color: '#FFB900' },
    ]

    const FILE_TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
      xlsx: { icon: '📊', color: '#217346', label: 'Excel' },
      xls: { icon: '📊', color: '#217346', label: 'Excel' },
      docx: { icon: '📄', color: '#2B579A', label: 'Word' },
      doc: { icon: '📄', color: '#2B579A', label: 'Word' },
      pptx: { icon: '📽️', color: '#D24726', label: 'PowerPoint' },
      ppt: { icon: '📽️', color: '#D24726', label: 'PowerPoint' },
      hwp: { icon: '📝', color: '#0085CA', label: '한글' },
      hwpx: { icon: '📝', color: '#0085CA', label: '한글' },
      txt: { icon: '📃', color: '#666666', label: 'Text' },
      csv: { icon: '📋', color: '#217346', label: 'CSV' },
      zip: { icon: '🗜️', color: '#FFB900', label: 'ZIP' },
      rar: { icon: '🗜️', color: '#FFB900', label: 'RAR' },
    }

    fileTypes.forEach(({ ext, label, color }) => {
      it(`${ext} 파일 타입이 올바르게 매핑되어야 함`, () => {
        const icon = FILE_TYPE_ICONS[ext]
        expect(icon).toBeDefined()
        expect(icon.label).toBe(label)
        expect(icon.color).toBe(color)
      })
    })
  })
})
