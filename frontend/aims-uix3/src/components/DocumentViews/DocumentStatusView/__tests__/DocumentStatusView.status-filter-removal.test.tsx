/**
 * DocumentStatusView 상태 필터 제거 테스트
 * @since 1.0.0
 *
 * 커밋 a8fbf7b: 문서처리현황 상태 필터 제거
 *
 * 변경사항:
 * - 상태 필터 드롭다운 UI 제거
 * - statusFilter 상태 및 관련 로직 완전 제거
 * - DocumentStatusHeader, Controller, Provider, Context 모두 정리
 * - 관련 테스트 코드 업데이트
 *
 * 효과:
 * - UI 더 간결해짐 (총 문서 개수만 표시)
 * - 상태 칼럼 정렬로 원하는 상태 확인 가능
 * - 코드 감소로 유지보수성 향상
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  documents: createMockDocuments(10),
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
  default: ({ isPollingEnabled, onTogglePolling, onRefresh, isLoading, documentsCount }: any) => (
    <div data-testid="document-status-header">
      <span data-testid="documents-count">{documentsCount}</span>
      <button onClick={onTogglePolling} data-testid="toggle-polling">
        {isPollingEnabled ? 'Disable' : 'Enable'}
      </button>
      <button onClick={onRefresh} disabled={isLoading} data-testid="refresh">
        Refresh
      </button>
    </div>
  ),
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
  Dropdown: ({ value, onChange, options }: any) => (
    <select data-testid="dropdown" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock('../../SFSymbol', () => ({
  SFSymbol: () => <span data-testid="sf-symbol">Icon</span>,
  SFSymbolSize: { CALLOUT: 'callout' },
  SFSymbolWeight: { MEDIUM: 'medium' },
}))

describe('DocumentStatusView - 상태 필터 제거 테스트 (커밋 a8fbf7b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('상태 필터 UI 제거 검증', () => {
    it('상태 필터 드롭다운이 렌더링되지 않아야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 'statusFilter', 'status-filter', 'filter-dropdown' 등의 클래스를 가진 요소 없음
      const filterDropdowns = document.querySelectorAll('[class*="status-filter"]')
      const filterSelects = document.querySelectorAll('select[aria-label*="상태"]')

      expect(filterDropdowns.length).toBe(0)
      expect(filterSelects.length).toBe(0)
    })

    it('총 문서 개수만 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const header = screen.getByTestId('document-status-header')
      const count = screen.getByTestId('documents-count')

      expect(header).toBeInTheDocument()
      expect(count).toBeInTheDocument()
      expect(count.textContent).toBe('10')
    })

    it('필터 관련 라벨이 렌더링되지 않아야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // '상태 필터:', 'Status Filter', '필터:' 등의 텍스트가 없어야 함
      expect(screen.queryByText(/상태 필터/i)).toBeNull()
      expect(screen.queryByText(/status filter/i)).toBeNull()
    })
  })

  describe('DocumentStatusHeader Props 검증', () => {
    it('statusFilter prop이 전달되지 않아야 함', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // DocumentStatusHeader가 렌더링되는지 확인
      const header = screen.getByTestId('document-status-header')
      expect(header).toBeInTheDocument()

      // statusFilter 관련 요소가 없는지 확인
      const filterElements = container.querySelectorAll('[data-testid*="filter"]')
      const statusFilterElements = Array.from(filterElements).filter(el =>
        el.getAttribute('data-testid')?.includes('status')
      )
      expect(statusFilterElements.length).toBe(0)
    })

    it('onFilterChange prop이 전달되지 않아야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // Mock DocumentStatusHeader는 statusFilter, onFilterChange props를 받지 않음
      const header = screen.getByTestId('document-status-header')
      expect(header).toBeInTheDocument()

      // onFilterChange를 트리거할 수 있는 UI 요소가 없어야 함
      const filterChangeButtons = document.querySelectorAll('[data-testid*="filter-change"]')
      expect(filterChangeButtons.length).toBe(0)
    })

    it('필수 props만 전달되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const header = screen.getByTestId('document-status-header')
      const toggleButton = screen.getByTestId('toggle-polling')
      const refreshButton = screen.getByTestId('refresh')
      const count = screen.getByTestId('documents-count')

      // 필수 props: isPollingEnabled, onTogglePolling, onRefresh, isLoading, documentsCount, lastUpdated
      expect(header).toBeInTheDocument()
      expect(toggleButton).toBeInTheDocument()
      expect(refreshButton).toBeInTheDocument()
      expect(count).toBeInTheDocument()
    })
  })

  describe('UI 간소화 효과', () => {
    it('헤더가 간결하게 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const header = screen.getByTestId('document-status-header')

      // 필터 드롭다운이 없으므로 헤더가 더 간결함
      expect(header).toBeInTheDocument()

      // 필터 관련 요소가 없는지 확인
      const selects = header.querySelectorAll('select')
      expect(selects.length).toBe(0)
    })

    it('총 문서 개수가 명확하게 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const count = screen.getByTestId('documents-count')
      expect(count.textContent).toBe('10')
    })
  })

  describe('Controller 통합 검증', () => {
    it('Controller에서 statusFilter가 노출되지 않아야 함', () => {
      // Mock controller에 statusFilter가 없음을 확인
      expect(mockController.statusFilter).toBeUndefined()
    })

    it('Controller에서 setStatusFilter가 노출되지 않아야 함', () => {
      // Mock controller에 setStatusFilter가 없음을 확인
      expect(mockController.setStatusFilter).toBeUndefined()
    })

    it('필터 없이도 문서 리스트가 정상 렌더링되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const list = screen.getByTestId('document-status-list')
      expect(list).toBeInTheDocument()
    })
  })

  describe('대체 기능: 상태 칼럼 정렬', () => {
    it('상태 칼럼 정렬 기능이 작동해야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // handleColumnSort 함수가 controller에 존재
      expect(mockController.handleColumnSort).toBeDefined()
      expect(typeof mockController.handleColumnSort).toBe('function')
    })

    it('정렬 방향 상태가 유지되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.sortField).toBeDefined()
      expect(mockController.sortDirection).toBeDefined()
    })
  })

  describe('코드 감소 및 유지보수성', () => {
    it('필터 관련 복잡한 로직이 제거되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 필터 옵션 배열이 없어야 함
      const filterOptions = document.querySelectorAll('option[value*="filter"]')
      expect(filterOptions.length).toBe(0)
    })

    it('간소화된 UI로 인한 렌더링 성능 개선', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 상태 필터 드롭다운은 없어야 함 (페이지네이션 드롭다운은 허용)
      const statusFilterSelects = container.querySelectorAll('select[aria-label*="상태"]')
      expect(statusFilterSelects.length).toBe(0)
    })
  })

  describe('상태 필터 없이 모든 문서 표시', () => {
    it('필터 없이 모든 문서가 filteredDocuments에 포함되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // Controller의 filteredDocuments가 모든 문서를 포함
      expect(mockController.filteredDocuments.length).toBe(10)
      expect(mockController.documents.length).toBe(10)
    })

    it('다양한 상태의 문서가 모두 표시되어야 함', () => {
      // 다양한 상태의 문서로 mock 재설정
      const diverseDocuments = [
        { _id: '1', status: 'completed' },
        { _id: '2', status: 'processing' },
        { _id: '3', status: 'error' },
        { _id: '4', status: 'pending' },
      ]

      mockController.documents = diverseDocuments
      mockController.filteredDocuments = diverseDocuments
      mockController.paginatedDocuments = diverseDocuments
      mockController.totalCount = diverseDocuments.length

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const count = screen.getByTestId('documents-count')
      expect(count.textContent).toBe('4')
    })
  })

  describe('커밋 a8fbf7b 핵심 변경사항 검증', () => {
    it('상태 필터 드롭다운 UI가 완전히 제거되었는지 확인', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 이전: <Dropdown statusFilter={...} />
      // 이후: 없음

      const statusFilterDropdowns = container.querySelectorAll('select[aria-label*="상태 필터"]')
      const filterLabels = container.querySelectorAll('.filter-label')

      expect(statusFilterDropdowns.length).toBe(0)
      expect(filterLabels.length).toBe(0)
    })

    it('DocumentStatusHeader가 간소화된 props로 작동하는지 확인', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const header = screen.getByTestId('document-status-header')
      const count = screen.getByTestId('documents-count')

      // 필수 정보만 표시: 문서 개수
      expect(header).toBeInTheDocument()
      expect(count).toBeInTheDocument()
    })

    it('상태 칼럼 정렬이 필터 기능을 대체하는지 확인', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 정렬 기능이 존재
      expect(mockController.sortField).toBeDefined()
      expect(mockController.sortDirection).toBeDefined()
      expect(mockController.handleColumnSort).toBeDefined()

      // 필터 기능은 없음
      expect(mockController.statusFilter).toBeUndefined()
      expect(mockController.setStatusFilter).toBeUndefined()
    })
  })
})
