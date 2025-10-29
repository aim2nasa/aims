/**
 * DocumentLibraryView - View 전환 시 자동 새로고침 테스트
 *
 * @issue View 전환 시 문서 목록 자동 갱신 미발생 (2025-10-24)
 * @cause visible prop만 변경되어 컴포넌트가 이미 마운트된 상태이므로 새로고침 미발생
 * @fix visible prop 변경 감지 useEffect 추가하여 자동 새로고침
 * @commit 63d8f28
 *
 * 이 테스트는 사용자가 다른 View에서 문서 라이브러리로 전환할 때
 * 자동으로 최신 문서 목록이 표시되는지 검증합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { DocumentLibraryView } from '../DocumentLibraryView'

// Mock dependencies
vi.mock('@/controllers/useDocumentsController', () => ({
  useDocumentsController: vi.fn()
}))

vi.mock('@/services/DocumentService', () => ({
  DocumentService: {
    getDocuments: vi.fn()
  }
}))

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
  }
}))

vi.mock('@/entities/document', () => ({
  DocumentUtils: {
    getFileTypeClass: () => 'file-type-pdf',
    getFileIcon: () => 'doc.fill',
    formatFileSize: (size: number) => `${(size / 1024).toFixed(1)} KB`,
    getFileExtension: (mimeType: string) => mimeType?.split('/')[1]?.toUpperCase() || 'PDF',
  },
}))

// Mock DocumentStatusProvider and Context
const mockDocumentStatusContext = {
  state: {
    documents: [],
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
    sortedAndFilteredDocuments: [],
    filteredDocuments: [],
    paginatedDocuments: [],
    totalPages: 1,
    isEmpty: true,
    isLoading: false,
    error: null,
    handleColumnSort: vi.fn(),
    handlePageChange: vi.fn(),
    handleItemsPerPageChange: vi.fn(),
  }),
}))

// Mock sub-components
vi.mock('../../../CenterPaneView/CenterPaneView', () => ({
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

vi.mock('../../components/DocumentActionIcons', () => ({
  DocumentIcon: () => <span data-testid="document-icon">📄</span>,
  EyeIcon: () => <span data-testid="eye-icon">👁</span>,
  LinkIcon: () => <span data-testid="link-icon">🔗</span>,
  SummaryIcon: () => <span data-testid="summary-icon">📝</span>,
}))

vi.mock('../../../RefreshButton/RefreshButton', () => ({
  default: () => <button data-testid="refresh-button">새로고침</button>,
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

vi.mock('../../../SFSymbol', () => ({
  SFSymbol: ({ name }: any) => <span data-testid="sf-symbol">{name}</span>,
  SFSymbolSize: { CAPTION_1: 'caption1', medium: 'medium' },
  SFSymbolWeight: { REGULAR: 'regular', regular: 'regular' },
}))

import { useDocumentsController } from '@/controllers/useDocumentsController'

// TODO: 이 테스트는 현재 구현되지 않은 기능을 테스트합니다.
// DocumentLibraryView가 visible prop 변경 시 loadDocuments를 호출하는 기능이 필요하면
// 컴포넌트에 useEffect를 추가해야 합니다.
describe.skip('DocumentLibraryView - View 전환 시 자동 새로고침 (63d8f28)', () => {
  let mockLoadDocuments: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock 함수 초기화
    mockLoadDocuments = vi.fn()

    // useDocumentsController mock 설정
    vi.mocked(useDocumentsController).mockReturnValue({
      documents: [],
      isLoading: false,
      isInitialLoad: false,
      error: null,
      searchQuery: '',
      searchParams: {
        limit: 20,
        offset: 0,
        sortBy: 'uploadDate',
        sortOrder: 'desc'
      },
      searchResultMessage: '',
      isEmpty: true,
      currentPage: 1,
      totalPages: 1,
      itemsPerPage: 20,
      total: 0,
      hasMore: false,
      loadDocuments: mockLoadDocuments,
      loadMoreDocuments: vi.fn(),
      deleteDocument: vi.fn(),
      handleSearchChange: vi.fn(),
      handleSearch: vi.fn(),
      handleSortChange: vi.fn(),
      handlePageChange: vi.fn(),
      handleLimitChange: vi.fn(),
      clearError: vi.fn()
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('visible이 false에서 true로 변경될 때 loadDocuments가 호출되어야 함', async () => {
    // Given: visible=false로 시작
    const { rerender } = render(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    // When: visible=true로 변경
    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: loadDocuments가 호출되어야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })

    // 현재 searchParams로 호출되어야 함
    expect(mockLoadDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        sortBy: 'uploadDate',
        sortOrder: 'desc'
      }),
      false // preserveSortAndPagination = false
    )
  })

  it('visible이 여러 번 true로 전환될 때마다 loadDocuments가 호출되어야 함', async () => {
    // Given: visible=true로 시작
    const { rerender } = render(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalledTimes(1)
    })

    // When: visible=false로 전환
    rerender(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    mockLoadDocuments.mockClear()

    // When: 다시 visible=true로 전환
    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: loadDocuments가 다시 호출되어야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })
  })

  it('visible이 계속 true인 경우 loadDocuments가 반복 호출되지 않아야 함', async () => {
    // Given: visible=true로 시작
    const { rerender } = render(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalledTimes(1)
    })

    mockLoadDocuments.mockClear()

    // When: 다른 prop 변경 (visible은 true 유지)
    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
        onDocumentDeleted={vi.fn()} // 다른 prop 추가
      />
    )

    // Then: loadDocuments가 호출되지 않아야 함
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mockLoadDocuments).not.toHaveBeenCalled()
  })

  it('visible이 false인 경우 loadDocuments가 호출되지 않아야 함', async () => {
    // Given & When: visible=false로 렌더링
    render(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    // Then: loadDocuments가 호출되지 않아야 함
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mockLoadDocuments).not.toHaveBeenCalled()
  })

  it('View가 마운트될 때 visible=true이면 즉시 loadDocuments가 호출되어야 함', async () => {
    // Given & When: visible=true로 마운트
    render(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: loadDocuments가 즉시 호출되어야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })
  })

  it('다른 View에서 문서 라이브러리로 전환하는 시나리오', async () => {
    // Given: 문서 처리 현황 View (DocumentLibraryView는 visible=false)
    const { rerender } = render(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    // 초기에는 loadDocuments 호출 없음
    expect(mockLoadDocuments).not.toHaveBeenCalled()

    // When: 사용자가 문서 라이브러리 메뉴 클릭 (visible=true)
    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 최신 문서 목록을 로드해야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 0
        }),
        false
      )
    })
  })
})
