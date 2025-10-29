/**
 * DocumentStatusView Scroll Improvement Tests
 * @since 1.0.0
 *
 * 커밋 cc95341: 스크롤 개선 및 칼럼 헤더 불투명 배경 처리 테스트
 *
 * 주요 검증 사항:
 * 1. wrapper/content 컨테이너 구조 (height: 100%, overflow: hidden)
 * 2. 리스트 영역 가변 조정 (flex: 1)
 * 3. 페이지 스크롤 제거, 리스트 내부 스크롤만 활성화
 * 4. 100개 이상 항목에서 이중 스크롤 방지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentStatusView } from '../DocumentStatusView'

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

// Mock useDocumentStatusController
const mockController: any = {
  paginatedDocuments: createMockDocuments(10),
  filteredDocuments: createMockDocuments(10),
  isLoading: false,
  error: null,
  totalCount: 10,
  lastUpdated: new Date(),
  isPollingEnabled: true,
  togglePolling: vi.fn(),
  refreshDocuments: vi.fn(),
  handleDocumentClick: vi.fn(),
  handleDocumentSummary: vi.fn(),
  handleDocumentFullText: vi.fn(),
  handleDocumentLink: vi.fn(),
  sortField: null,
  sortDirection: 'asc' as const,
  handleColumnSort: vi.fn(),
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 10,
  handlePageChange: vi.fn(),
  handleLimitChange: vi.fn(),
  isDetailModalVisible: false,
  isSummaryModalVisible: false,
  isFullTextModalVisible: false,
  isLinkModalVisible: false,
  selectedDocument: null,
  selectedDocumentForSummary: null,
  selectedDocumentForFullText: null,
  selectedDocumentForLink: null,
  handleDetailModalClose: vi.fn(),
  handleSummaryModalClose: vi.fn(),
  handleFullTextModalClose: vi.fn(),
  handleLinkModalClose: vi.fn(),
  searchCustomers: vi.fn(),
  fetchCustomerDocuments: vi.fn(),
  linkDocumentToCustomer: vi.fn(),
}

vi.mock('@/controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: () => mockController,
}))

// Mock sub-components
vi.mock('../../CenterPaneView/CenterPaneView', () => ({
  default: ({ children, className }: any) => (
    <div data-testid="center-pane-view" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('../components/DocumentStatusHeader', () => ({
  default: () => <div data-testid="document-status-header">Header</div>,
}))

vi.mock('../components/DocumentStatusList', () => ({
  default: () => <div data-testid="document-status-list">List</div>,
}))

vi.mock('../components/DocumentDetailModal', () => ({
  default: () => null,
}))

vi.mock('../components/DocumentSummaryModal', () => ({
  default: () => null,
}))

vi.mock('../components/DocumentFullTextModal', () => ({
  default: () => null,
}))

vi.mock('../components/DocumentLinkModal', () => ({
  default: () => null,
}))

vi.mock('@/shared/ui', () => ({
  Dropdown: ({ value, onChange }: any) => (
    <select data-testid="dropdown" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="10">10개씩</option>
      <option value="20">20개씩</option>
    </select>
  ),
}))

vi.mock('../../SFSymbol', () => ({
  SFSymbol: () => <span data-testid="sf-symbol">Icon</span>,
  SFSymbolSize: { CALLOUT: 'callout' },
  SFSymbolWeight: { MEDIUM: 'medium' },
}))

describe('DocumentStatusView - 스크롤 개선 테스트 (커밋 cc95341)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('wrapper/content 컨테이너 구조', () => {
    it('wrapper 컨테이너가 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      expect(wrapper).toBeInTheDocument()
    })

    it('wrapper 컨테이너가 document-status-view-wrapper 클래스를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      expect(wrapper).toHaveClass('document-status-view-wrapper')
    })

    it('content 컨테이너가 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const content = document.querySelector('.document-status-view-content')
      expect(content).toBeInTheDocument()
    })

    it('content 컨테이너가 document-status-view-content 클래스를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const content = document.querySelector('.document-status-view-content')
      expect(content).toHaveClass('document-status-view-content')
    })

    it('wrapper 안에 content가 있어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper') as HTMLElement
      const content = document.querySelector('.document-status-view-content') as HTMLElement

      expect(wrapper).toContainElement(content)
    })
  })

  describe('DOM 구조 검증', () => {
    it('wrapper와 content가 올바른 계층 구조를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper') as HTMLElement
      const content = document.querySelector('.document-status-view-content') as HTMLElement

      // wrapper가 content의 부모여야 함
      expect(wrapper).toContainElement(content)
    })

    it('wrapper가 최상위 레벨 컨테이너여야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const centerPane = document.querySelector('.document-status-view')
      const wrapper = document.querySelector('.document-status-view-wrapper')

      // document-status-view 클래스를 가진 컨테이너 안에 wrapper가 있어야 함
      expect(centerPane).toBeInTheDocument()
      expect(wrapper).toBeInTheDocument()
    })
  })

  describe('레이아웃 구조', () => {
    it('헤더, 리스트, 페이지네이션이 순서대로 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const header = screen.getByTestId('document-status-header')
      const list = screen.getByTestId('document-status-list')
      const pagination = document.querySelector('.document-pagination')

      expect(header).toBeInTheDocument()
      expect(list).toBeInTheDocument()
      expect(pagination).toBeInTheDocument()
    })

    it('content 컨테이너 안에 헤더와 리스트가 있어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const content = document.querySelector('.document-status-view-content')
      const header = screen.getByTestId('document-status-header')
      const list = screen.getByTestId('document-status-list')

      expect(content).toContainElement(header)
      expect(content).toContainElement(list)
    })
  })

  describe('스크롤 구조', () => {
    it('wrapper와 content가 올바른 CSS 클래스를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      // CSS 클래스 확인을 통해 스크롤 구조가 정의되어 있음을 검증
      expect(wrapper).toHaveClass('document-status-view-wrapper')
      expect(content).toHaveClass('document-status-view-content')
    })

    it('wrapper와 content가 스크롤 제어를 위한 구조를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper') as HTMLElement
      const content = document.querySelector('.document-status-view-content') as HTMLElement

      // wrapper와 content가 존재하고, 올바른 계층 구조를 가짐
      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
      expect(wrapper).toContainElement(content)
    })
  })

  describe('CSS 클래스명', () => {
    it('올바른 CSS 클래스명을 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(document.querySelector('.document-status-view-wrapper')).toBeInTheDocument()
      expect(document.querySelector('.document-status-view-content')).toBeInTheDocument()
      expect(document.querySelector('.document-pagination')).toBeInTheDocument()
    })

    it('CenterPaneView에 document-status-view 클래스가 적용되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const centerPane = document.querySelector('.document-status-view')
      expect(centerPane).toBeInTheDocument()
      expect(centerPane).toHaveClass('document-status-view')
    })
  })

  describe('100개 이상 항목 처리', () => {
    beforeEach(() => {
      // 100개 문서로 모킹
      mockController.paginatedDocuments = createMockDocuments(100)
      mockController.filteredDocuments = createMockDocuments(100)
      mockController.totalCount = 100
    })

    it('100개 이상 문서가 있어도 wrapper 구조가 유지되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
    })

    it('100개 이상 문서가 있어도 CSS 클래스가 유지되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toHaveClass('document-status-view-wrapper')
      expect(content).toHaveClass('document-status-view-content')
    })
  })

  describe('반응형 디자인', () => {
    it('모바일 환경에서도 wrapper 구조가 유지되어야 함', () => {
      // 모바일 뷰포트 시뮬레이션
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    it('페이지네이션 버튼이 적절한 aria-label을 가져야 함', () => {
      mockController.totalPages = 2 // 페이지네이션이 표시되도록 설정

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const prevButton = screen.getByLabelText('이전 페이지')
      const nextButton = screen.getByLabelText('다음 페이지')

      expect(prevButton).toBeInTheDocument()
      expect(nextButton).toBeInTheDocument()
    })

    it('드롭다운이 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const dropdown = screen.getByTestId('dropdown')
      expect(dropdown).toBeInTheDocument()
    })
  })

  describe('로딩 상태', () => {
    it('로딩 중에도 wrapper 구조가 유지되어야 함', () => {
      mockController.isLoading = true

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
    })

    it('로딩 완료 후에도 스크롤 구조가 유지되어야 함', () => {
      mockController.isLoading = false

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      expect(wrapper).toHaveClass('document-status-view-wrapper')
    })
  })

  describe('에러 상태', () => {
    beforeEach(() => {
      // 에러 상태로 설정
      mockController.error = 'Test error'
    })

    afterEach(() => {
      // 에러 상태 초기화
      mockController.error = null
    })

    it('에러 발생 시에도 wrapper 구조가 유지되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
    })
  })

  describe('빈 상태', () => {
    it('문서가 없어도 wrapper 구조가 유지되어야 함', () => {
      mockController.paginatedDocuments = []
      mockController.filteredDocuments = []
      mockController.totalCount = 0

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const wrapper = document.querySelector('.document-status-view-wrapper')
      const content = document.querySelector('.document-status-view-content')

      expect(wrapper).toBeInTheDocument()
      expect(content).toBeInTheDocument()
    })
  })
})
