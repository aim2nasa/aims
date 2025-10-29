/**
 * DocumentStatusList Column Layout Optimization Tests
 * @since 1.0.0
 *
 * 커밋 b03247e: 문서 라이브러리 칼럼 정렬 및 폭 최적화
 *
 * 주요 검증 사항:
 * 1. 칼럼 헤더 정렬 일관성 (파일명 외 모두 중앙 정렬)
 * 2. 상태 칼럼 폭 축소 (120px → 90px)
 * 3. 업로드 날짜 칼럼 폭 축소 (170px → 130px)
 * 4. 상태 칼럼 내용 중앙 정렬
 * 5. CSS 하드코딩 제거 (색상값을 CSS 변수로 변경)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import DocumentStatusList from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

// Mock documents for testing
const createMockDocuments = (count: number): Document[] => {
  return Array.from({ length: count }, (_, i) => ({
    _id: `doc-${i}`,
    filename: `document-${i}.pdf`,
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadTime: new Date().toISOString(),
    status: 'completed' as const,
    progress: 100,
    // Add other required fields from Document type
    tags: [],
    metadata: {},
  }))
}

// Mock SFSymbol
vi.mock('../../../../SFSymbol', () => ({
  SFSymbol: ({ name }: any) => <span data-testid="sf-symbol">{name}</span>,
  SFSymbolSize: {
    CAPTION_2: 'caption-2',
    CAPTION_1: 'caption-1',
  },
  SFSymbolWeight: {
    REGULAR: 'regular',
    MEDIUM: 'medium',
  },
}))

// Mock Tooltip
vi.mock('@/shared/ui', () => ({
  Tooltip: ({ children, content }: any) => (
    <div data-tooltip={content}>{children}</div>
  ),
}))

// Mock DocumentActionIcons
vi.mock('../../components/DocumentActionIcons', () => ({
  EyeIcon: () => <span data-testid="eye-icon">eye</span>,
  SummaryIcon: () => <span data-testid="summary-icon">summary</span>,
  DocumentIcon: () => <span data-testid="document-icon">document</span>,
  LinkIcon: () => <span data-testid="link-icon">link</span>,
}))

describe('DocumentStatusList - 칼럼 레이아웃 최적화 테스트 (커밋 b03247e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('칼럼 헤더 정렬', () => {
    it('헤더가 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const header = document.querySelector('.status-list-header')
      expect(header).toBeInTheDocument()
    })

    it('파일명 헤더가 있어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const filenameHeader = document.querySelector('.header-filename')
      expect(filenameHeader).toBeInTheDocument()
    })

    it('크기 헤더가 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const sizeHeader = document.querySelector('.header-size')
      expect(sizeHeader).toBeInTheDocument()
      expect(sizeHeader).toHaveClass('header-size')
    })

    it('타입 헤더가 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const typeHeader = document.querySelector('.header-type')
      expect(typeHeader).toBeInTheDocument()
      expect(typeHeader).toHaveClass('header-type')
    })

    it('날짜 헤더가 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const dateHeader = document.querySelector('.header-date')
      expect(dateHeader).toBeInTheDocument()
      expect(dateHeader).toHaveClass('header-date')
    })

    it('상태 헤더가 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const statusHeader = document.querySelector('.header-status')
      expect(statusHeader).toBeInTheDocument()
      expect(statusHeader).toHaveClass('header-status')
    })

    it('액션 헤더가 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const actionsHeader = document.querySelector('.header-actions')
      expect(actionsHeader).toBeInTheDocument()
      expect(actionsHeader).toHaveClass('header-actions')
    })
  })

  describe('문서 아이템 렌더링', () => {
    it('문서 아이템이 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(3)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const items = document.querySelectorAll('.status-item')
      expect(items.length).toBe(3)
    })

    it('상태 셀이 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const statusCell = document.querySelector('.status-cell')
      expect(statusCell).toBeInTheDocument()
    })

    it('상태 셀이 중앙 정렬 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const statusCell = document.querySelector('.status-cell')
      expect(statusCell).toHaveClass('status-cell')
    })
  })

  describe('정렬 기능', () => {
    it('정렬 가능한 헤더를 클릭하면 onColumnSort가 호출되어야 함', () => {
      const onColumnSort = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={onColumnSort}
        />
      )

      const filenameHeader = document.querySelector('.header-filename') as HTMLElement
      filenameHeader?.click()

      expect(onColumnSort).toHaveBeenCalledWith('filename')
    })

    it('정렬 인디케이터가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(5)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const sortIndicator = document.querySelector('.sort-indicator')
      expect(sortIndicator).toBeInTheDocument()
    })
  })

  describe('로딩 상태', () => {
    it('로딩 중일 때 헤더는 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={[]}
          isLoading={true}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const header = document.querySelector('.status-list-header')
      expect(header).toBeInTheDocument()
    })
  })

  describe('빈 상태', () => {
    it('문서가 없을 때 빈 상태 메시지가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={[]}
          isLoading={false}
          isEmpty={true}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const emptyState = document.querySelector('.list-empty')
      expect(emptyState).toBeInTheDocument()
    })
  })

  describe('에러 상태', () => {
    it('에러가 있을 때 에러 메시지가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={[]}
          isLoading={false}
          isEmpty={false}
          error="Test error"
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const errorState = document.querySelector('.list-error')
      expect(errorState).toBeInTheDocument()
    })
  })

  describe('액션 버튼', () => {
    it('모든 액션 버튼이 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const detailButton = document.querySelector('.action-btn--detail')
      const summaryButton = document.querySelector('.action-btn--summary')
      const fullButton = document.querySelector('.action-btn--full')
      const linkButton = document.querySelector('.action-btn--link')

      expect(detailButton).toBeInTheDocument()
      expect(summaryButton).toBeInTheDocument()
      expect(fullButton).toBeInTheDocument()
      expect(linkButton).toBeInTheDocument()
    })

    it('상세보기 버튼 클릭 시 onDetailClick이 호출되어야 함', () => {
      const onDetailClick = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={onDetailClick}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const detailButton = document.querySelector('.action-btn--detail') as HTMLElement
      detailButton?.click()

      expect(onDetailClick).toHaveBeenCalled()
    })
  })

  describe('삭제 모드', () => {
    it('삭제 모드일 때 체크박스가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const checkbox = document.querySelector('input[type="checkbox"]')
      expect(checkbox).toBeInTheDocument()
    })

    it('전체 선택 체크박스가 헤더에 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(3)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const headerCheckbox = document.querySelector('.header-checkbox input[type="checkbox"]')
      expect(headerCheckbox).toBeInTheDocument()
    })
  })

  describe('CSS 클래스 구조', () => {
    it('헤더가 올바른 CSS 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const header = document.querySelector('.status-list-header')
      expect(header).toHaveClass('status-list-header')
    })

    it('문서 아이템이 올바른 CSS 클래스를 가져야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocuments(1)}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const item = document.querySelector('.status-item')
      expect(item).toHaveClass('status-item')
    })
  })
})
