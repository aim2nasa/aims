/**
 * DocumentLibraryView Component Tests
 * @since 1.0.0
 *
 * 고객 연결 버튼 활성화/비활성화 로직 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DocumentLibraryView } from './DocumentLibraryView'

// Mock Documents
const mockDocumentWithoutCustomer = {
  _id: 'doc1',
  filename: '테스트문서_연결안됨.pdf',
  fileSize: 1024000,
  mimeType: 'application/pdf',
  uploadTime: '2025-01-15T10:00:00Z',
  status: 'completed',
  progress: 100,
  customer_relation: null, // 고객과 연결되지 않음
}

const mockDocumentWithCustomer = {
  _id: 'doc2',
  filename: '김보성보유계약현황202508.pdf',
  fileSize: 358734,
  mimeType: 'application/pdf',
  uploadTime: '2025-01-15T09:00:00Z',
  status: 'completed',
  progress: 100,
  customer_relation: {
    customer_id: '68f1fbbe211d4c4da5848dcc',
    relationship_type: 'general',
    assigned_by: null,
    assigned_at: '2025-10-19T07:46:37.919Z',
    notes: '',
  },
}

const mockDocumentProcessing = {
  _id: 'doc3',
  filename: '처리중문서.pdf',
  fileSize: 512000,
  mimeType: 'application/pdf',
  uploadTime: '2025-01-15T11:00:00Z',
  status: 'processing',
  progress: 50,
  customer_relation: null,
}

// Mock useDocumentsController
const mockController = {
  documents: [mockDocumentWithoutCustomer, mockDocumentWithCustomer, mockDocumentProcessing],
  isLoading: false,
  isInitialLoad: false,
  error: null,
  total: 3,
  hasMore: false,
  searchQuery: '',
  searchParams: { limit: 10, offset: 0 },
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 10,
  loadDocuments: vi.fn(),
  loadMoreDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  handleSearchChange: vi.fn(),
  handleSearch: vi.fn(),
  handleSortChange: vi.fn(),
  handlePageChange: vi.fn(),
  handleLimitChange: vi.fn(),
  clearError: vi.fn(),
  isEmpty: false,
  searchResultMessage: '총 3개의 문서',
}

vi.mock('@/controllers/useDocumentsController', () => ({
  useDocumentsController: () => mockController,
}))

// Mock DocumentStatusProvider and Context
const mockDocumentStatusContext = {
  state: {
    documents: [mockDocumentWithoutCustomer, mockDocumentWithCustomer, mockDocumentProcessing],
    isLoading: false,
    error: null,
    searchTerm: '',
    sortField: null,
    sortDirection: 'asc' as const,
    currentPage: 1,
    itemsPerPage: 10,
    selectedDocument: null,
    detailModalOpen: false,
    summaryModalOpen: false,
    fullTextModalOpen: false,
    linkModalOpen: false,
    isPollingEnabled: true,
    pollingInterval: 3000,
  },
  actions: {
    setDocuments: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    setSearchTerm: vi.fn(),
    setSortField: vi.fn(),
    setSortDirection: vi.fn(),
    setCurrentPage: vi.fn(),
    setItemsPerPage: vi.fn(),
    openDetailModal: vi.fn(),
    closeDetailModal: vi.fn(),
    openSummaryModal: vi.fn(),
    closeSummaryModal: vi.fn(),
    openFullTextModal: vi.fn(),
    closeFullTextModal: vi.fn(),
    openLinkModal: vi.fn(),
    closeLinkModal: vi.fn(),
    togglePolling: vi.fn(),
  },
}

vi.mock('@/contexts/DocumentStatusContext', () => ({
  useDocumentStatusContext: () => mockDocumentStatusContext,
}))

vi.mock('@/providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: () => ({
    sortedAndFilteredDocuments: [mockDocumentWithoutCustomer, mockDocumentWithCustomer, mockDocumentProcessing],
    filteredDocuments: [mockDocumentWithoutCustomer, mockDocumentWithCustomer, mockDocumentProcessing],
    paginatedDocuments: [mockDocumentWithoutCustomer, mockDocumentWithCustomer, mockDocumentProcessing],
    totalPages: 1,
    isEmpty: false,
    isLoading: false,
    error: null,
    handleColumnSort: vi.fn(),
    handlePageChange: vi.fn(),
    handleItemsPerPageChange: vi.fn(),
  }),
}))

// Mock DocumentStatusService
vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractStatus: (document: any) => document.status || 'pending',
    extractFilename: (document: any) => document.filename || 'unknown.pdf',
    extractFileSize: (document: any) => document.fileSize || 0,
    extractUploadedDate: (document: any) => document.uploadTime || new Date().toISOString(),
    extractProgress: (document: any) => document.progress || 0,
    getStatusLabel: (status: string) => status === 'completed' ? '완료' : '처리 중',
    getStatusIcon: (status: string) => status === 'completed' ? '✓' : '⋯',
    formatUploadDate: (date: string) => new Date(date).toLocaleDateString('ko-KR'),
  },
}))

// Mock DocumentUtils
vi.mock('@/entities/document', () => ({
  DocumentUtils: {
    getFileTypeClass: () => 'file-type-pdf',
    getFileIcon: () => 'doc.fill',
    formatFileSize: (size: number) => `${(size / 1024).toFixed(1)} KB`,
    getFileExtension: (mimeType: string) => mimeType?.split('/')[1]?.toUpperCase() || 'PDF',
  },
}))

// Mock sub-components and utilities
vi.mock('../../CenterPaneView/CenterPaneView', () => ({
  default: ({ children }: any) => <div data-testid="center-pane-view">{children}</div>,
}))

vi.mock('@/shared/ui', () => ({
  Dropdown: ({ value, onChange }: any) => (
    <select data-testid="dropdown" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="option1">Option 1</option>
    </select>
  ),
  Tooltip: ({ children, content }: any) => (
    <div data-testid="tooltip" title={content}>
      {children}
    </div>
  ),
  Button: ({ children, onClick }: any) => (
    <button data-testid="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('../components/DocumentActionIcons', () => ({
  DocumentIcon: () => <span data-testid="document-icon">📄</span>,
  EyeIcon: () => <span data-testid="eye-icon">👁</span>,
  LinkIcon: () => <span data-testid="link-icon">🔗</span>,
  SummaryIcon: () => <span data-testid="summary-icon">📝</span>,
}))

vi.mock('../../RefreshButton/RefreshButton', () => ({
  default: () => <button data-testid="refresh-button">새로고침</button>,
}))

vi.mock('../DocumentStatusView/components/DocumentDetailModal', () => ({
  default: () => null,
}))

vi.mock('../DocumentStatusView/components/DocumentSummaryModal', () => ({
  default: () => null,
}))

vi.mock('../DocumentStatusView/components/DocumentFullTextModal', () => ({
  default: () => null,
}))

vi.mock('../DocumentStatusView/components/DocumentLinkModal', () => ({
  default: () => null,
}))

vi.mock('../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal', () => ({
  AppleConfirmModal: () => null,
}))

vi.mock('@/controllers/useAppleConfirmController', () => ({
  useAppleConfirmController: () => ({
    isOpen: false,
    message: '',
    confirmText: '',
    cancelText: '',
    onConfirmAction: null,
    showConfirm: vi.fn(),
    handleConfirm: vi.fn(),
    handleCancel: vi.fn(),
  }),
}))

vi.mock('../../SFSymbol', () => ({
  SFSymbol: ({ name }: any) => <span data-testid="sf-symbol">{name}</span>,
  SFSymbolSize: { medium: 'medium' },
  SFSymbolWeight: { regular: 'regular' },
}))

describe('DocumentLibraryView - 고객 연결 버튼 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('고객과 연결되지 않은 문서', () => {
    it('status가 completed이고 customer_relation이 null이면 링크 버튼이 활성화되어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      // 문서 리스트가 렌더링될 때까지 대기
      await waitFor(() => {
        expect(screen.getByText('테스트문서_연결안됨.pdf')).toBeInTheDocument()
      })

      // 링크 버튼 찾기 (첫 번째 "고객에게 연결" 버튼)
      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const firstLinkButton = linkButtons[0]!

      // 버튼이 활성화 상태인지 확인
      expect(firstLinkButton).not.toHaveAttribute('data-disabled', 'true')
      expect(firstLinkButton).toHaveAttribute('aria-disabled', 'false')
      expect(firstLinkButton).toHaveAttribute('tabIndex', '0')
    })

    it('링크 버튼의 툴팁이 "고객에게 연결"이어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('테스트문서_연결안됨.pdf')).toBeInTheDocument()
      })

      // 링크 버튼의 aria-label 확인
      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const firstLinkButton = linkButtons[0]!

      // aria-label이 "고객에게 연결"인지 확인
      expect(firstLinkButton).toHaveAttribute('aria-label', '고객에게 연결')
    })

    it('링크 버튼을 클릭하면 handleLinkClick이 호출되어야 함', async () => {
      const onDocumentClick = vi.fn()
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} onDocumentClick={onDocumentClick} />)

      await waitFor(() => {
        expect(screen.getByText('테스트문서_연결안됨.pdf')).toBeInTheDocument()
      })

      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const firstLinkButton = linkButtons[0]!

      // 버튼이 클릭 가능한지 확인 (data-disabled가 false)
      expect(firstLinkButton.getAttribute('data-disabled')).toBe('false')
    })
  })

  describe('고객과 연결된 문서', () => {
    it('customer_relation이 존재하면 링크 버튼이 비활성화되어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('김보성보유계약현황202508.pdf')).toBeInTheDocument()
      })

      // "이미 고객과 연결됨" 버튼 찾기
      const linkButton = screen.getByLabelText('이미 고객과 연결됨')

      // 버튼이 비활성화 상태인지 확인
      expect(linkButton).toHaveAttribute('data-disabled', 'true')
      expect(linkButton).toHaveAttribute('aria-disabled', 'true')
      expect(linkButton).toHaveAttribute('tabIndex', '-1')
    })

    it('링크 버튼의 툴팁이 "이미 고객과 연결됨"이어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('김보성보유계약현황202508.pdf')).toBeInTheDocument()
      })

      // 링크 버튼의 aria-label 확인
      const linkButton = screen.getByLabelText('이미 고객과 연결됨')

      // aria-label이 "이미 고객과 연결됨"인지 확인
      expect(linkButton).toHaveAttribute('aria-label', '이미 고객과 연결됨')
    })

    it('링크 버튼을 클릭해도 handleLinkClick이 호출되지 않아야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('김보성보유계약현황202508.pdf')).toBeInTheDocument()
      })

      const linkButton = screen.getByLabelText('이미 고객과 연결됨')

      // 버튼이 클릭 불가능한지 확인 (data-disabled가 true)
      expect(linkButton.getAttribute('data-disabled')).toBe('true')
    })
  })

  describe('처리 중인 문서', () => {
    it('status가 processing이면 customer_relation과 무관하게 링크 버튼이 비활성화되어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('처리중문서.pdf')).toBeInTheDocument()
      })

      // "고객에게 연결" 버튼 중 두 번째 (처리중문서.pdf에 해당)
      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const processingDocButton = linkButtons[1]! // 첫 번째는 테스트문서, 두 번째가 처리중문서

      // 버튼이 비활성화 상태인지 확인 (status가 processing이므로)
      expect(processingDocButton).toHaveAttribute('data-disabled', 'true')
      expect(processingDocButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('처리 중인 문서의 링크 버튼 툴팁은 "고객에게 연결"이어야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('처리중문서.pdf')).toBeInTheDocument()
      })

      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const processingDocButton = linkButtons[1]!

      // customer_relation이 null이므로 aria-label은 "고객에게 연결"
      expect(processingDocButton).toHaveAttribute('aria-label', '고객에게 연결')
    })
  })

  describe('canLink 로직 검증', () => {
    it('status=completed, customer_relation=null → canLink=true', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('테스트문서_연결안됨.pdf')).toBeInTheDocument()
      })

      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const firstLinkButton = linkButtons[0]!

      expect(firstLinkButton.getAttribute('data-disabled')).toBe('false')
    })

    it('status=completed, customer_relation=존재 → canLink=false', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('김보성보유계약현황202508.pdf')).toBeInTheDocument()
      })

      const linkButton = screen.getByLabelText('이미 고객과 연결됨')

      expect(linkButton.getAttribute('data-disabled')).toBe('true')
    })

    it('status=processing, customer_relation=null → canLink=false', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('처리중문서.pdf')).toBeInTheDocument()
      })

      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const processingDocButton = linkButtons[1]!

      expect(processingDocButton.getAttribute('data-disabled')).toBe('true')
    })
  })

  describe('CSS 클래스 및 스타일 검증', () => {
    it('비활성화된 버튼은 data-disabled="true" 속성을 가져야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('김보성보유계약현황202508.pdf')).toBeInTheDocument()
      })

      const linkButton = screen.getByLabelText('이미 고객과 연결됨')

      // data-disabled 속성 확인 (CSS에서 [data-disabled="true"]로 스타일 적용)
      expect(linkButton).toHaveAttribute('data-disabled', 'true')
    })

    it('활성화된 버튼은 data-disabled="false" 속성을 가져야 함', async () => {
      render(<DocumentLibraryView visible={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('테스트문서_연결안됨.pdf')).toBeInTheDocument()
      })

      const linkButtons = screen.getAllByLabelText('고객에게 연결')
      const firstLinkButton = linkButtons[0]!

      // data-disabled 속성 확인
      expect(firstLinkButton).toHaveAttribute('data-disabled', 'false')
    })
  })
})
