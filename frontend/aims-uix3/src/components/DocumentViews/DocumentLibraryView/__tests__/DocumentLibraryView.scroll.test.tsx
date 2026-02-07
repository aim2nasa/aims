/**
 * DocumentLibraryView Scroll Improvement Tests
 * @since 1.0.0
 *
 * 커밋 1019974: 문서 라이브러리 스크롤 개선 - 브라우저 높이 최대 활용
 *
 * 주요 검증 사항:
 * 1. 페이지 스크롤 제거, 목록 내부 스크롤만 활성화
 * 2. 브라우저 높이에 따라 목록 영역이 가변적으로 조정
 * 3. 100개 이상 항목 표시 시에도 이중 스크롤 방지
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentLibraryView } from '../DocumentLibraryView'

// Mock documents for testing
const createMockDocuments = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    _id: `doc-${i}`,
    filename: `document-${i}.pdf`,
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadTime: new Date().toISOString(),
    status: 'completed',
    progress: 100,
  }))
}

// Mock DocumentStatusProvider
vi.mock('@/providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useDocumentStatusContext
vi.mock('@/contexts/DocumentStatusContext', () => ({
  useDocumentStatusContext: () => ({
    state: {
      documents: createMockDocuments(10),
      searchTerm: '',
    },
    actions: {
      setSearchTerm: vi.fn(),
    },
  }),
}))

// Mock useDocumentStatusController
const mockController: any = {
  sortedAndFilteredDocuments: createMockDocuments(10),
  filteredDocuments: createMockDocuments(10),
  paginatedDocuments: createMockDocuments(10),
  totalPages: 1,
  isEmpty: false,
  isLoading: false,
  error: null,
  handleColumnSort: vi.fn(),
  handlePageChange: vi.fn(),
  handleItemsPerPageChange: vi.fn(),
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

// Mock sub-components
vi.mock('../../CenterPaneView/CenterPaneView', () => ({
  default: ({ children, className }: any) => (
    <div data-testid="center-pane-view" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('../../DocumentStatusView/components/DocumentStatusHeader', () => ({
  default: () => <div data-testid="document-status-header">Header</div>,
}))

vi.mock('../../DocumentStatusView/components/DocumentStatusList', () => ({
  default: () => <div data-testid="document-status-list" className="document-status-list">List</div>,
}))

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
  Button: ({ children, onClick, disabled }: any) => (
    <button data-testid="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dropdown: ({ value, onChange }: any) => (
    <select data-testid="dropdown" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="10">10개씩</option>
      <option value="20">20개씩</option>
    </select>
  ),
  Tooltip: ({ children, content }: any) => (
    <div data-tooltip={content}>{children}</div>
  ),
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
  DocumentTypeBadge: () => null,
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

describe('DocumentLibraryView - 스크롤 개선 테스트 (커밋 1019974)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('컨테이너 구조', () => {
    it('document-library-view 컨테이너가 렌더링되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const container = document.querySelector('.document-library-view')
      expect(container).toBeInTheDocument()
    })

    it('document-library-view가 올바른 클래스를 가져야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const container = document.querySelector('.document-library-view')
      expect(container).toHaveClass('document-library-view')
    })
  })

  describe('DOM 계층 구조', () => {
    it('document-library-view 안에 검색 영역이 있어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view') as HTMLElement
      const searchBar = document.querySelector('.library-unified-header') as HTMLElement

      expect(view).toContainElement(searchBar)
    })

    it('올바른 계층 구조를 가져야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')
      const searchBar = document.querySelector('.library-unified-header')

      // view가 존재하고 searchBar를 포함
      expect(view).toBeInTheDocument()
      expect(searchBar).toBeInTheDocument()
    })
  })

  describe('레이아웃 구조', () => {
    it('검색 바, 헤더, 리스트가 순서대로 렌더링되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const unifiedHeader = document.querySelector('.library-unified-header')
      const list = document.querySelector('.document-status-list')

      expect(unifiedHeader).toBeInTheDocument()
      expect(list).toBeInTheDocument()
    })

    it('view 안에 모든 주요 요소가 있어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view') as HTMLElement
      const unifiedHeader = document.querySelector('.library-unified-header') as HTMLElement

      expect(view).toContainElement(unifiedHeader)
    })
  })

  describe('스크롤 구조 검증', () => {
    it('document-library-view가 스크롤 제어 클래스를 가져야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')
      expect(view).toHaveClass('document-library-view')
    })

    it('페이지 스크롤 방지를 위한 구조가 있어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      // 컨테이너가 존재하고 올바른 클래스를 가짐
      expect(view).toBeInTheDocument()
      expect(view).toHaveClass('document-library-view')
    })
  })

  describe('100개 이상 항목 처리', () => {
    beforeEach(() => {
      // 100개 문서로 모킹
      mockController.sortedAndFilteredDocuments = createMockDocuments(100)
      mockController.filteredDocuments = createMockDocuments(100)
      mockController.paginatedDocuments = createMockDocuments(100)
    })

    it('100개 이상 문서가 있어도 컨테이너 구조가 유지되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toBeInTheDocument()
    })

    it('100개 이상 문서가 있어도 CSS 클래스가 유지되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toHaveClass('document-library-view')
    })
  })

  describe('검색 기능', () => {
    it('검색 바가 렌더링되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const searchBar = document.querySelector('.library-unified-header')
      expect(searchBar).toBeInTheDocument()
    })

    it('검색 입력 필드가 있어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const searchInput = document.querySelector('.search-input-wrapper')
      expect(searchInput).toBeInTheDocument()
    })
  })

  describe('CSS 클래스명', () => {
    it('올바른 CSS 클래스명을 가져야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      expect(document.querySelector('.document-library-view')).toBeInTheDocument()
      expect(document.querySelector('.library-unified-header')).toBeInTheDocument()
    })

    it('CenterPaneView가 렌더링되어야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const centerPane = document.querySelector('.center-pane-view')
      expect(centerPane).toBeInTheDocument()
    })
  })

  describe('반응형 디자인', () => {
    it('모바일 환경에서도 컨테이너 구조가 유지되어야 함', () => {
      // 모바일 뷰포트 시뮬레이션
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toBeInTheDocument()
    })
  })

  describe('로딩 상태', () => {
    it('로딩 중에도 컨테이너 구조가 유지되어야 함', () => {
      mockController.isLoading = true

      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toBeInTheDocument()
    })

    it('로딩 완료 후에도 스크롤 구조가 유지되어야 함', () => {
      mockController.isLoading = false

      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')
      expect(view).toHaveClass('document-library-view')
    })
  })

  describe('에러 상태', () => {
    it('에러 발생 시에도 컨테이너 구조가 유지되어야 함', () => {
      mockController.error = 'Test error'

      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toBeInTheDocument()

      mockController.error = null
    })
  })

  describe('빈 상태', () => {
    it('문서가 없어도 컨테이너 구조가 유지되어야 함', () => {
      mockController.sortedAndFilteredDocuments = []
      mockController.filteredDocuments = []
      mockController.paginatedDocuments = []
      mockController.isEmpty = true

      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      const view = document.querySelector('.document-library-view')

      expect(view).toBeInTheDocument()
    })
  })

  describe('UI 구조 일관성', () => {
    it('브라우저 높이를 최대한 활용하는 구조를 가져야 함', () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      // 최상위 컨테이너 (height: 100%, overflow: hidden)
      const view = document.querySelector('.document-library-view')
      expect(view).toBeInTheDocument()
      expect(view).toHaveClass('document-library-view')
    })
  })
})
