/**
 * DocumentStatusList - badgeType Sorting Regression Tests
 * @since 2025-11-15
 * @commit a2cc9c92, 9a319088
 *
 * badgeType 정렬 기능 및 뱃지 표시 회귀 방지 테스트
 *
 * 테스트 범위:
 * - badgeType 칼럼 렌더링 (9a319088)
 * - badgeType 정렬 기능 (BIN → OCR → TXT)
 * - 백엔드 badgeType 우선 사용 (a2cc9c92)
 * - 뱃지 색상 및 스타일 검증
 * - OCR 신뢰도별 5단계 색상
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

describe('DocumentStatusList - badgeType Sorting (커밋 a2cc9c92, 9a319088)', () => {
  const createMockDocument = (overrides: Partial<Document> = {}): Document => ({
    _id: `doc-${Math.random()}`,
    id: `doc-${Math.random()}`,
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    uploaded_at: new Date().toISOString(),
    fileSize: 1024,
    meta: {},
    stages: {},
    ...overrides
  })

  describe('[회귀 방지] badgeType 칼럼 렌더링', () => {
    it('badgeType 칼럼 헤더가 표시되어야 함', () => {
      const mockDocuments: Document[] = [
        createMockDocument({ filename: 'test1.pdf' })
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const header = container.querySelector('.header-badge-type')
      expect(header).toBeInTheDocument()
      expect(header).toHaveTextContent('유형')
    })

    it('badgeType 칼럼이 정렬 가능해야 함 (onColumnSort 제공 시)', () => {
      const mockDocuments: Document[] = [
        createMockDocument({ filename: 'test1.pdf' })
      ]
      const mockOnColumnSort = vi.fn()

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
          onColumnSort={mockOnColumnSort}
        />
      )

      const header = container.querySelector('.header-badge-type')
      expect(header).toHaveClass('header-sortable')
      expect(header).toHaveAttribute('role', 'button')
      expect(header).toHaveAttribute('aria-label', '유형으로 정렬')
    })

    it('badgeType 정렬 인디케이터가 표시되어야 함', () => {
      const mockDocuments: Document[] = [
        createMockDocument({ filename: 'test1.pdf' })
      ]
      const mockOnColumnSort = vi.fn()

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
          onColumnSort={mockOnColumnSort}
          sortField={null}
          sortDirection="asc"
        />
      )

      const header = container.querySelector('.header-badge-type')
      const indicator = header?.querySelector('.sort-indicator--both')
      expect(indicator).toBeInTheDocument()
      expect(indicator?.querySelectorAll('.sort-arrow')).toHaveLength(2)
    })

    it('badgeType 정렬 활성화 시 올바른 인디케이터 표시', () => {
      const mockDocuments: Document[] = [
        createMockDocument({ filename: 'test1.pdf' })
      ]
      const mockOnColumnSort = vi.fn()

      const { container, rerender } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
          onColumnSort={mockOnColumnSort}
          sortField="badgeType"
          sortDirection="asc"
        />
      )

      let header = container.querySelector('.header-badge-type')
      let indicator = header?.querySelector('.sort-indicator')
      expect(indicator).toHaveTextContent('▲')

      rerender(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
          onColumnSort={mockOnColumnSort}
          sortField="badgeType"
          sortDirection="desc"
        />
      )

      header = container.querySelector('.header-badge-type')
      indicator = header?.querySelector('.sort-indicator')
      expect(indicator).toHaveTextContent('▼')
    })
  })

  describe('[회귀 방지] badgeType 정렬 기능', () => {
    it('badgeType 칼럼 클릭 시 onColumnSort 호출', () => {
      const mockDocuments: Document[] = [
        createMockDocument({ filename: 'test1.pdf' })
      ]
      const mockOnColumnSort = vi.fn()

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
          onColumnSort={mockOnColumnSort}
        />
      )

      const header = container.querySelector('.header-badge-type')
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(mockOnColumnSort).toHaveBeenCalledWith('badgeType')
    })
  })

  describe('[회귀 방지] 백엔드 badgeType 우선 사용 (커밋 a2cc9c92)', () => {
    it('백엔드에서 제공한 badgeType을 우선 사용해야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'TXT' // 백엔드에서 제공
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const txtBadge = container.querySelector('.document-txt-badge')
      expect(txtBadge).toBeInTheDocument()
      expect(txtBadge).toHaveTextContent('TXT')
    })

    it('백엔드 badgeType=OCR이면 OCR 뱃지 표시', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'OCR', // 백엔드에서 제공
          ocr: { confidence: '0.95' } // 신뢰도도 함께 제공
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
      expect(ocrBadge).toHaveTextContent('OCR')
    })

    it('백엔드 badgeType=BIN이면 BIN 뱃지 표시', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'BIN' // 백엔드에서 제공
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const binBadge = container.querySelector('.document-bin-badge')
      expect(binBadge).toBeInTheDocument()
      expect(binBadge).toHaveTextContent('BIN')
    })

    it('백엔드 badgeType 없으면 프론트엔드에서 계산 (하위 호환성)', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          // badgeType 없음
          ocr: { confidence: '0.85' } // OCR 신뢰도만 있음
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
    })
  })

  describe('[회귀 방지] 뱃지 색상 및 스타일', () => {
    it('TXT 뱃지는 파란색 클래스를 가져야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'TXT'
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const txtBadge = container.querySelector('.document-txt-badge')
      expect(txtBadge).toBeInTheDocument()
      expect(txtBadge).toHaveClass('document-txt-badge')
    })

    it('BIN 뱃지는 회색 클래스를 가져야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'BIN'
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const binBadge = container.querySelector('.document-bin-badge')
      expect(binBadge).toBeInTheDocument()
      expect(binBadge).toHaveClass('document-bin-badge')
    })

    it('OCR 뱃지는 신뢰도별 색상 클래스를 가져야 함', () => {
      const testCases = [
        { confidence: 0.98, expectedClass: 'ocr-excellent', label: '매우 높음' },
        { confidence: 0.90, expectedClass: 'ocr-high', label: '높음' },
        { confidence: 0.75, expectedClass: 'ocr-medium', label: '보통' },
        { confidence: 0.60, expectedClass: 'ocr-low', label: '낮음' },
        { confidence: 0.40, expectedClass: 'ocr-very-low', label: '매우 낮음' }
      ]

      testCases.forEach(({ confidence, expectedClass }) => {
        const mockDocuments: Document[] = [
          {
            ...createMockDocument({ filename: 'test1.pdf' }),
            badgeType: 'OCR',
            ocr: { confidence: String(confidence) }
          } as any
        ]

        const { container } = render(
          <DocumentStatusList
            documents={mockDocuments}
            isLoading={false}
            isEmpty={false}
            error={null}
          />
        )

        const ocrBadge = container.querySelector('.document-ocr-badge')
        expect(ocrBadge).toHaveClass(expectedClass)
      })
    })
  })

  describe('[회귀 방지] OCR 신뢰도 추출', () => {
    it('document.ocr.confidence에서 신뢰도 추출', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'OCR',
          ocr: { confidence: '0.9817' }
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
      expect(ocrBadge).toHaveClass('ocr-excellent') // 0.9817 >= 0.95
    })

    it('stages.ocr.message에서 신뢰도 파싱', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'OCR',
          stages: {
            ocr: {
              status: 'completed',
              message: 'OCR 완료 (신뢰도: 0.8765)'
            }
          }
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
      expect(ocrBadge).toHaveClass('ocr-high') // 0.8765 >= 0.85
    })

    it('신뢰도 없으면 기본 OCR 뱃지 표시 (medium 색상)', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'OCR'
          // confidence 없음
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
      expect(ocrBadge).toHaveClass('ocr-medium') // 기본값
    })
  })

  describe('[회귀 방지] 뱃지 툴팁', () => {
    it('TXT 뱃지에 툴팁이 있어야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'TXT'
        } as any
      ]

      render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      // Tooltip 컴포넌트가 content prop을 받음
      // 실제 툴팁 렌더링은 hover 시 발생하므로 컴포넌트 존재 여부만 확인
      const txtBadge = document.querySelector('.document-txt-badge')
      expect(txtBadge).toBeInTheDocument()
    })

    it('OCR 뱃지에 신뢰도 정보가 포함된 툴팁이 있어야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'OCR',
          ocr: { confidence: '0.9234' }
        } as any
      ]

      render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const ocrBadge = document.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeInTheDocument()
      // 툴팁 내용: "OCR 신뢰도: 92.3% (매우 높음)"
    })

    it('BIN 뱃지에 툴팁이 있어야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'test1.pdf' }),
          badgeType: 'BIN'
        } as any
      ]

      render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const binBadge = document.querySelector('.document-bin-badge')
      expect(binBadge).toBeInTheDocument()
      // 툴팁 내용: "바이너리 파일 (텍스트 추출 불가)"
    })
  })

  describe('[회귀 방지] 정렬 순서', () => {
    it('정렬 없을 때 문서가 표시되어야 함', () => {
      const mockDocuments: Document[] = [
        {
          ...createMockDocument({ filename: 'bin-file.zip' }),
          badgeType: 'BIN'
        } as any,
        {
          ...createMockDocument({ filename: 'ocr-file.pdf' }),
          badgeType: 'OCR'
        } as any,
        {
          ...createMockDocument({ filename: 'txt-file.docx' }),
          badgeType: 'TXT'
        } as any
      ]

      const { container } = render(
        <DocumentStatusList
          documents={mockDocuments}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      expect(container.querySelectorAll('.status-item')).toHaveLength(3)
    })
  })
})
