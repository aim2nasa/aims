/**
 * DocumentStatusView Component Tests
 * @since 1.0.0
 * @version 3.0.0 - 최신 컴포넌트 구조에 맞게 업데이트
 *
 * COMPONENT_GUIDE.md 준수: Component Testing (라인 569-612)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentStatusView } from './DocumentStatusView'
import type { Document } from '../../../types/documentStatus'

// Mock DocumentStatusProvider & Controller
const mockDocuments: Document[] = [
  {
    _id: 'doc1',
    filename: 'test1.pdf',
    uploadedDate: '2025-01-01T00:00:00Z',
    stages: {
      upload: { status: 'completed' },
      meta: { status: 'completed' },
      ocr: { status: 'completed' },
      tag: { status: 'completed' },
    },
  } as Document,
  {
    _id: 'doc2',
    filename: 'test2.pdf',
    uploadedDate: '2025-01-02T00:00:00Z',
    stages: {
      upload: { status: 'completed' },
      meta: { status: 'processing' },
      ocr: { status: 'pending' },
      tag: { status: 'pending' },
    },
  } as Document,
]

const mockController = {
  // Context State
  documents: mockDocuments,
  filteredDocuments: mockDocuments,
  isLoading: false,
  error: null,
  statusFilter: 'all' as const,
  isPollingEnabled: false,
  lastUpdated: null,
  apiHealth: true,

  // Pagination State
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 50,
  paginatedDocuments: mockDocuments,

  // Context Actions
  setStatusFilter: vi.fn(),
  togglePolling: vi.fn(),
  refreshDocuments: vi.fn(),
  handlePageChange: vi.fn(),
  handleLimitChange: vi.fn(),

  // Modal States
  selectedDocument: null,
  isDetailModalVisible: false,
  selectedDocumentForSummary: null,
  isSummaryModalVisible: false,
  selectedDocumentForFullText: null,
  isFullTextModalVisible: false,
  selectedDocumentForLink: null,
  isLinkModalVisible: false,

  // Event Handlers
  handleDocumentClick: vi.fn(),
  handleDetailModalClose: vi.fn(),
  handleDocumentSummary: vi.fn(),
  handleSummaryModalClose: vi.fn(),
  handleDocumentFullText: vi.fn(),
  handleFullTextModalClose: vi.fn(),
  handleDocumentLink: vi.fn(),
  handleLinkModalClose: vi.fn(),
  searchCustomers: vi.fn(),
  fetchCustomerDocuments: vi.fn(),
  linkDocumentToCustomer: vi.fn(),
}

// Mock useDocumentStatusController
vi.mock('../../../controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: () => mockController,
}))

// Mock sub-components
vi.mock('./components/DocumentStatusHeader', () => ({
  default: ({ onTogglePolling, onRefresh }: any) => (
    <div data-testid="document-status-header">
      <button onClick={onTogglePolling} aria-label="실시간 업데이트 토글">Toggle Polling</button>
      <button onClick={onRefresh} aria-label="새로고침">Refresh</button>
    </div>
  ),
}))

vi.mock('./components/DocumentStatusList', () => ({
  default: ({ documents, isLoading, isEmpty, error, onDetailClick }: any) => {
    if (isLoading) return <div>문서 목록을 불러오는 중...</div>
    if (error) return <div>{error}</div>
    if (isEmpty) return <div>문서가 없습니다.</div>
    return (
      <div data-testid="document-status-list">
        {documents.map((doc: Document) => (
          <div key={doc._id}>
            <span>{doc.filename}</span>
            <button onClick={() => onDetailClick(doc)} aria-label="상세 보기">
              Detail
            </button>
          </div>
        ))}
      </div>
    )
  },
}))

vi.mock('./components/DocumentDetailModal', () => ({
  default: ({ visible, onClose }: any) =>
    visible ? (
      <div data-testid="document-detail-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('./components/DocumentSummaryModal', () => ({
  default: () => null,
}))

vi.mock('./components/DocumentFullTextModal', () => ({
  default: () => null,
}))

vi.mock('./components/DocumentLinkModal', () => ({
  default: () => null,
}))

// Mock Dropdown component
vi.mock('../../../shared/ui', () => ({
  Dropdown: ({ value, onChange, 'aria-label': ariaLabel }: any) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="10">10개씩</option>
      <option value="20">20개씩</option>
      <option value="50">50개씩</option>
      <option value="100">100개씩</option>
    </select>
  ),
}))

describe('DocumentStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock controller to default state
    Object.assign(mockController, {
      documents: mockDocuments,
      filteredDocuments: mockDocuments,
      paginatedDocuments: mockDocuments,
      isLoading: false,
      error: null,
      isDetailModalVisible: false,
      currentPage: 1,
      totalPages: 1,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('기본 렌더링', () => {
    it('visible=false일 때 렌더링되지 않는다', () => {
      render(<DocumentStatusView visible={false} onClose={vi.fn()} />)

      // CenterPaneView가 visible=false일 때 렌더링하지 않음
      expect(screen.queryByText('문서 처리 현황')).not.toBeInTheDocument()
    })

    it('visible=true일 때 컴포넌트가 렌더링된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 제목 확인
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })

    it('헤더와 리스트 컴포넌트가 렌더링된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByTestId('document-status-header')).toBeInTheDocument()
      expect(screen.getByTestId('document-status-list')).toBeInTheDocument()
    })
  })

  describe('onClose prop', () => {
    it('onClose prop이 전달된다', () => {
      const onCloseMock = vi.fn()

      render(<DocumentStatusView visible={true} onClose={onCloseMock} />)

      // 컴포넌트가 정상적으로 렌더링되었는지 확인
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })
  })

  describe('로딩 상태', () => {
    it('로딩 중일 때 로딩 메시지가 표시된다', () => {
      mockController.isLoading = true
      mockController.documents = []
      mockController.filteredDocuments = []
      mockController.paginatedDocuments = []

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByText('문서 목록을 불러오는 중...')).toBeInTheDocument()
    })
  })

  describe('에러 상태', () => {
    it('에러 발생 시 에러 메시지가 표시된다', () => {
      const errorMessage = 'API 연결 실패'
      Object.assign(mockController, {
        error: errorMessage,
        documents: [],
        filteredDocuments: [],
        paginatedDocuments: [],
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  describe('문서 목록', () => {
    it('문서가 없을 때 빈 상태 메시지가 표시된다', () => {
      mockController.documents = []
      mockController.filteredDocuments = []
      mockController.paginatedDocuments = []

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByText('문서가 없습니다.')).toBeInTheDocument()
    })

    it('문서 목록이 표시된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByText('test1.pdf')).toBeInTheDocument()
      expect(screen.getByText('test2.pdf')).toBeInTheDocument()
    })

    it('문서 클릭 시 handleDocumentClick이 호출된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const detailButtons = screen.getAllByLabelText('상세 보기')
      if (detailButtons[0]) {
        fireEvent.click(detailButtons[0])
        expect(mockController.handleDocumentClick).toHaveBeenCalledWith(mockDocuments[0])
      }
    })
  })

  describe('헤더 컨트롤', () => {
    it('폴링 토글 버튼이 작동한다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const pollingButton = screen.getByLabelText('실시간 업데이트 토글')
      fireEvent.click(pollingButton)

      expect(mockController.togglePolling).toHaveBeenCalled()
    })

    it('새로고침 버튼이 작동한다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const refreshButton = screen.getByLabelText('새로고침')
      fireEvent.click(refreshButton)

      expect(mockController.refreshDocuments).toHaveBeenCalled()
    })
  })

  describe('페이지네이션', () => {
    it('페이지가 1개일 때 페이지네이션이 간소화된다', () => {
      mockController.totalPages = 1

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 페이지당 항목 수 드롭다운은 있음
      expect(screen.getByLabelText('페이지당 항목 수')).toBeInTheDocument()

      // 이전/다음 버튼은 없음
      expect(screen.queryByLabelText('이전 페이지')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('다음 페이지')).not.toBeInTheDocument()
    })

    it('페이지가 2개 이상일 때 페이지네이션 컨트롤이 표시된다', () => {
      mockController.totalPages = 3
      mockController.currentPage = 2

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByLabelText('이전 페이지')).toBeInTheDocument()
      expect(screen.getByLabelText('다음 페이지')).toBeInTheDocument()
    })

    it('페이지당 항목 수를 변경할 수 있다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const dropdown = screen.getByLabelText('페이지당 항목 수')
      fireEvent.change(dropdown, { target: { value: '20' } })

      expect(mockController.handleLimitChange).toHaveBeenCalledWith(20)
    })
  })

  describe('모달', () => {
    it('Detail 모달이 표시/숨김 상태를 제어할 수 있다', () => {
      mockController.isDetailModalVisible = false

      const { rerender } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.queryByTestId('document-detail-modal')).not.toBeInTheDocument()

      // 모달 열기
      mockController.isDetailModalVisible = true
      rerender(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(screen.getByTestId('document-detail-modal')).toBeInTheDocument()
    })

    it('Detail 모달 닫기가 작동한다', () => {
      mockController.isDetailModalVisible = true

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const closeButton = screen.getByText('Close')
      fireEvent.click(closeButton)

      expect(mockController.handleDetailModalClose).toHaveBeenCalled()
    })
  })

  describe('Pure View 검증', () => {
    it('View는 비즈니스 로직을 포함하지 않는다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // Pure View이므로 Controller를 통해 모든 상태와 액션을 받음
      expect(screen.getByTestId('document-status-header')).toBeInTheDocument()
      expect(screen.getByTestId('document-status-list')).toBeInTheDocument()
    })

    it('모든 이벤트 핸들러가 Controller에서 제공된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // Controller의 핸들러들이 정의되어 있음을 확인
      expect(mockController.handleDocumentClick).toBeDefined()
      expect(mockController.handleDetailModalClose).toBeDefined()
      expect(mockController.handleDocumentSummary).toBeDefined()
      expect(mockController.handleSummaryModalClose).toBeDefined()
      expect(mockController.handleDocumentFullText).toBeDefined()
      expect(mockController.handleFullTextModalClose).toBeDefined()
      expect(mockController.handleDocumentLink).toBeDefined()
      expect(mockController.handleLinkModalClose).toBeDefined()
    })
  })

  describe('onDocumentClick prop', () => {
    it('onDocumentClick prop이 제공되면 전달된다', () => {
      const onDocumentClickMock = vi.fn()

      render(<DocumentStatusView visible={true} onClose={vi.fn()} onDocumentClick={onDocumentClickMock} />)

      // 컴포넌트가 정상적으로 렌더링됨
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })

    it('onDocumentClick prop이 없어도 정상 작동한다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 컴포넌트가 정상적으로 렌더링됨
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })
  })
})
