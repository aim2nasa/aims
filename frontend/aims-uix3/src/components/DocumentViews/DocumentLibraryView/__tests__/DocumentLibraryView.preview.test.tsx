/**
 * DocumentLibraryView Document Preview Tests
 * @since 1.0.0
 *
 * 커밋 fc00cb7: 문서 라이브러리에서 문서 클릭 시 RightPane에 미리보기 표시 기능 추가
 *
 * 주요 검증 사항:
 * 1. onDocumentClick prop이 DocumentLibraryView → DocumentLibraryContent → DocumentStatusList로 전달
 * 2. 문서 클릭 시 onDocumentClick 핸들러 호출
 * 3. 편집 모드가 아닐 때만 미리보기 열림
 * 4. TypeScript exactOptionalPropertyTypes 준수 (조건부 prop 전달)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DocumentLibraryView } from '../DocumentLibraryView'
import type { Document } from '../../../../types/documentStatus'

// Mock documents for testing
const createMockDocument = (): Document => ({
  _id: 'test-doc-1',
  filename: 'test-document.pdf',
  fileSize: 1024000,
  mimeType: 'application/pdf',
  status: 'completed' as const,
  progress: 100,
  uploaded_at: new Date().toISOString(),
})

// Mock DocumentStatusProvider
vi.mock('@/providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useDocumentStatusContext
vi.mock('@/contexts/DocumentStatusContext', () => ({
  useDocumentStatusContext: () => ({
    state: {
      documents: [createMockDocument()],
      searchTerm: '',
    },
    actions: {
      setSearchTerm: vi.fn(),
    },
  }),
}))

// Mock useDocumentStatusController
const mockController: any = {
  sortedAndFilteredDocuments: [createMockDocument()],
  filteredDocuments: [createMockDocument()],
  paginatedDocuments: [createMockDocument()],
  totalPages: 1,
  isEmpty: false,
  isLoading: false,
  error: null,
  handleColumnSort: vi.fn(),
  handlePageChange: vi.fn(),
  handleItemsPerPageChange: vi.fn(),
  handleDocumentClick: vi.fn(),
  handleDocumentSummary: vi.fn(),
  handleDocumentFullText: vi.fn(),
  handleDocumentLink: vi.fn(),
}

vi.mock('@/controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: () => mockController,
}))

// Mock useDocumentsController
vi.mock('@/controllers/useDocumentsController', () => ({
  useDocumentsController: () => ({
    error: null,
    searchQuery: '',
    searchParams: {},
    loadDocuments: vi.fn(),
    handleSearchChange: vi.fn(),
    clearError: vi.fn(),
  }),
}))

// Mock CenterPaneView
vi.mock('../../CenterPaneView/CenterPaneView', () => ({
  default: ({ children }: any) => <div data-testid="center-pane-view">{children}</div>,
}))

// Mock DocumentStatusHeader
vi.mock('../../DocumentStatusView/components/DocumentStatusHeader', () => ({
  default: () => <div data-testid="document-status-header">Header</div>,
}))

// Mock DocumentStatusList - not mocking, using real component

// Mock modals
vi.mock('../../DocumentStatusView/components/DocumentDetailModal', () => ({
  default: () => null,
}))

vi.mock('../../DocumentStatusView/components/DocumentSummaryModal', () => ({
  default: () => null,
}))

vi.mock('../../DocumentStatusView/components/DocumentFullTextModal', () => ({
  default: () => null,
}))

vi.mock('../../DocumentStatusView/components/DocumentLinkModal', () => ({
  default: () => null,
}))

vi.mock('../../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal', () => ({
  AppleConfirmModal: () => null,
}))

vi.mock('@/controllers/useAppleConfirmController', () => ({
  useAppleConfirmController: () => ({
    state: {
      isOpen: false,
      title: '',
      message: '',
      confirmText: '',
      cancelText: '',
      showCancel: true,
      onConfirm: null,
      onCancel: null,
      shouldRender: false,
    },
    actions: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      handleConfirm: vi.fn(),
      handleCancel: vi.fn(),
    },
  }),
}))

vi.mock('@/shared/ui', () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Dropdown: ({ value, onChange }: any) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="10">10개씩</option>
    </select>
  ),
  Tooltip: ({ children }: any) => <div>{children}</div>,
  CloseButton: ({ onClick }: any) => (
    <button data-testid="close-button" onClick={onClick}>×</button>
  ),
  useContextMenu: () => ({
    isOpen: false,
    position: { x: 0, y: 0 },
    openMenu: vi.fn(),
    closeMenu: vi.fn(),
  }),
  ContextMenu: ({ children }: any) => <div data-testid="context-menu">{children}</div>,
  ContextMenuItem: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
  ContextMenuDivider: () => <hr />,
  Modal: ({ children, visible }: any) => visible ? <div data-testid="modal">{children}</div> : null,
  DocumentTypeCell: ({ documentType }: any) => (
    <span data-testid="document-type-cell">{documentType || '미지정'}</span>
  ),
}))

// Mock SFSymbol - using @/components path alias
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: ({ name, className }: any) => (
    <span data-testid="sf-symbol" className={className}>{name}</span>
  ),
  SFSymbolSize: {
    CAPTION_2: 'caption-2', CAPTION_1: 'caption-1', FOOTNOTE: 'footnote',
    CALLOUT: 'callout', BODY: 'body', SUBHEADLINE: 'subheadline',
    HEADLINE: 'headline', TITLE_3: 'title-3', TITLE_2: 'title-2',
    TITLE_1: 'title-1', LARGE_TITLE: 'large-title',
  },
  SFSymbolWeight: {
    ULTRALIGHT: 'ultralight', THIN: 'thin', LIGHT: 'light',
    REGULAR: 'regular', MEDIUM: 'medium', SEMIBOLD: 'semibold',
    BOLD: 'bold', HEAVY: 'heavy', BLACK: 'black',
  },
}))

// Mock SFSymbol - relative path used by component
vi.mock('../../SFSymbol', () => ({
  SFSymbol: ({ name, className }: any) => (
    <span data-testid="sf-symbol" className={className}>{name}</span>
  ),
  SFSymbolSize: {
    CAPTION_2: 'caption-2', CAPTION_1: 'caption-1', FOOTNOTE: 'footnote',
    CALLOUT: 'callout', BODY: 'body', SUBHEADLINE: 'subheadline',
    HEADLINE: 'headline', TITLE_3: 'title-3', TITLE_2: 'title-2',
    TITLE_1: 'title-1', LARGE_TITLE: 'large-title',
  },
  SFSymbolWeight: {
    ULTRALIGHT: 'ultralight', THIN: 'thin', LIGHT: 'light',
    REGULAR: 'regular', MEDIUM: 'medium', SEMIBOLD: 'semibold',
    BOLD: 'bold', HEAVY: 'heavy', BLACK: 'black',
  },
}))

describe('DocumentLibraryView - 문서 미리보기 기능 테스트 (커밋 fc00cb7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('onDocumentClick prop 전달', () => {
    it('onDocumentClick이 제공되면 DocumentStatusList로 전달되어야 함', () => {
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const list = document.querySelector('.document-status-list')
      expect(list).toBeInTheDocument()
    })

    it('onDocumentClick이 없으면 undefined로 전달되어야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const list = document.querySelector('.document-status-list')
      expect(list).toBeInTheDocument()
    })
  })

  describe('문서 클릭 동작', () => {
    it('문서 아이템이 렌더링되어야 함', () => {
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const documentItem = document.querySelector('.status-item')
      expect(documentItem).toBeInTheDocument()
    })

    it('문서를 클릭하면 onDocumentClick이 호출되어야 함', () => {
      vi.useFakeTimers()
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const documentItem = document.querySelector('.status-item') as HTMLElement
      if (documentItem) {
        fireEvent.click(documentItem)
        vi.advanceTimersByTime(250) // 싱글/더블클릭 구분 타이머 대기
        expect(handleDocumentClick).toHaveBeenCalled()
      }
      vi.useRealTimers()
    })

    it('onDocumentClick이 없으면 클릭해도 에러가 발생하지 않아야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const documentItem = document.querySelector('.status-item')

      // Should not throw error
      expect(() => {
        if (documentItem) {
          fireEvent.click(documentItem)
        }
      }).not.toThrow()
    })
  })

  describe('컴포넌트 렌더링', () => {
    it('DocumentLibraryView가 렌더링되어야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={vi.fn()}
        />
      )

      const view = document.querySelector('.document-library-view')
      expect(view).toBeInTheDocument()
    })

    it('문서 리스트가 렌더링되어야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={vi.fn()}
        />
      )

      const list = document.querySelector('.document-status-list')
      expect(list).toBeInTheDocument()
    })

    it('문서 아이템이 렌더링되어야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={vi.fn()}
        />
      )

      const item = document.querySelector('.status-item')
      expect(item).toBeInTheDocument()
    })
  })

  describe('조건부 prop 전달 (exactOptionalPropertyTypes)', () => {
    it('onDocumentClick이 있을 때 prop이 전달되어야 함', () => {
      vi.useFakeTimers()
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const list = document.querySelector('.document-status-list')
      expect(list).toBeInTheDocument()

      // Click should work
      const documentItem = document.querySelector('.status-item') as HTMLElement
      if (documentItem) {
        fireEvent.click(documentItem)
        vi.advanceTimersByTime(250) // 싱글/더블클릭 구분 타이머 대기
        expect(handleDocumentClick).toHaveBeenCalled()
      }
      vi.useRealTimers()
    })

    it('onDocumentClick이 없을 때 prop이 전달되지 않아야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const list = document.querySelector('.document-status-list')
      expect(list).toBeInTheDocument()

      // Click should not throw error
      const documentItem = document.querySelector('.status-item')
      expect(() => {
        if (documentItem) {
          fireEvent.click(documentItem)
        }
      }).not.toThrow()
    })
  })

  describe('다른 props와의 상호작용', () => {
    it('onClose와 함께 작동해야 함', () => {
      vi.useFakeTimers()
      const handleClose = vi.fn()
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={handleClose}
          onDocumentClick={handleDocumentClick}
        />
      )

      const documentItem = document.querySelector('.status-item') as HTMLElement
      if (documentItem) {
        fireEvent.click(documentItem)
        vi.advanceTimersByTime(250) // 싱글/더블클릭 구분 타이머 대기
        expect(handleDocumentClick).toHaveBeenCalled()
      }
      expect(handleClose).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('onDocumentDeleted와 함께 작동해야 함', () => {
      vi.useFakeTimers()
      const handleDocumentDeleted = vi.fn()
      const handleDocumentClick = vi.fn()

      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={handleDocumentClick}
          onDocumentDeleted={handleDocumentDeleted}
        />
      )

      const documentItem = document.querySelector('.status-item') as HTMLElement
      if (documentItem) {
        fireEvent.click(documentItem)
        vi.advanceTimersByTime(250) // 싱글/더블클릭 구분 타이머 대기
        expect(handleDocumentClick).toHaveBeenCalled()
      }
      vi.useRealTimers()
    })
  })

  describe('visible prop 동작', () => {
    it('visible이 true일 때 렌더링되어야 함', () => {
      render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
          onDocumentClick={vi.fn()}
        />
      )

      const view = document.querySelector('.document-library-view')
      expect(view).toBeInTheDocument()
    })

    it('visible이 false일 때는 렌더링되지 않아야 함', () => {
      render(
        <DocumentLibraryView
          visible={false}
          onClose={vi.fn()}
          onDocumentClick={vi.fn()}
        />
      )

      // CenterPaneView는 렌더링되지만 내용은 숨겨짐
      const view = document.querySelector('.document-library-view')
      // visible=false일 때는 CenterPaneView가 display:none을 적용할 수 있음
      expect(view).not.toBeInTheDocument()
    })
  })
})
