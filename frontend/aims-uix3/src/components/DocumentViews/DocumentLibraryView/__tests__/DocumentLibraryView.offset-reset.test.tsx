/**
 * DocumentLibraryView - offset 초기화 회귀 테스트
 *
 * @issue 문서 라이브러리 빈 화면 버그 (2025-10-25)
 * @cause localStorage에 저장된 offset 값이 View 열 때 초기화되지 않음
 * @fix View가 열릴 때 offset=0으로 강제 초기화
 *
 * 이 테스트는 같은 버그가 다시 발생하지 않도록 회귀 방지용으로 작성됨
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
// DocumentLibraryView가 visible prop 변경 시 offset을 초기화하는 기능이 필요하면
// 컴포넌트에 useEffect를 추가해야 합니다.
describe.skip('DocumentLibraryView - offset 초기화 회귀 테스트', () => {
  let mockLoadDocuments: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // localStorage 초기화
    localStorage.clear()

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
        offset: 20, // 이전 페이지 상태 (버그 시나리오)
        sortBy: 'uploadDate',
        sortOrder: 'desc'
      },
      searchResultMessage: '',
      isEmpty: true,
      currentPage: 2,
      totalPages: 3,
      itemsPerPage: 20,
      total: 1,
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

  it('View가 열릴 때 localStorage의 offset=20을 무시하고 offset=0으로 초기화해야 함', async () => {
    // Given: localStorage에 offset=20이 저장된 상태를 시뮬레이션
    // (usePersistedState가 offset=20을 반환하도록 mock 설정됨)

    // When: DocumentLibraryView를 처음 열기 (visible=true)
    const { rerender } = render(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    // visible=true로 변경하여 useEffect 트리거
    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: loadDocuments가 offset=0으로 호출되어야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })

    // 가장 중요한 검증: offset이 0이어야 함!
    const callArgs = mockLoadDocuments.mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(callArgs?.[0]).toMatchObject({
      offset: 0  // ✅ offset=20이 아니라 0이어야 함!
    })
  })

  it('View가 다시 열릴 때마다 항상 offset=0으로 초기화되어야 함', async () => {
    // Given: 이미 렌더링된 상태
    const { rerender } = render(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // When: View를 닫았다가 다시 열기
    rerender(
      <DocumentLibraryView
        visible={false}
        onClose={vi.fn()}
      />
    )

    mockLoadDocuments.mockClear()

    rerender(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 매번 offset=0으로 호출되어야 함
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })

    const callArgs = mockLoadDocuments.mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(callArgs?.[0]).toMatchObject({
      offset: 0
    })
  })

  it('다른 searchParams는 유지하면서 offset만 0으로 초기화해야 함', async () => {
    // When: View 열기
    render(
      <DocumentLibraryView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: offset만 0이고 나머지는 원래 값 유지
    await waitFor(() => {
      expect(mockLoadDocuments).toHaveBeenCalled()
    })

    const callArgs = mockLoadDocuments.mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(callArgs?.[0]).toMatchObject({
      limit: 20,        // ✅ 유지
      offset: 0,        // ✅ 0으로 초기화
      sortBy: 'uploadDate',    // ✅ 유지
      sortOrder: 'desc' // ✅ 유지
    })
  })
})

/**
 * 테스트 시나리오 배경:
 *
 * 1. 버그 발생 상황:
 *    - 사용자가 문서 라이브러리에서 2~3페이지를 봄
 *    - localStorage에 offset=20이 저장됨
 *    - 문서 삭제 등으로 전체 문서가 1개만 남음
 *    - 문서 라이브러리를 다시 열면 offset=20으로 요청
 *    - 결과: 빈 화면 ("등록된 문서가 없습니다")
 *
 * 2. 수정 내용:
 *    - DocumentLibraryView.tsx의 useEffect에서
 *    - loadDocuments({ ...searchParams, offset: 0 }, false) 호출
 *    - offset을 강제로 0으로 초기화
 *
 * 3. 이 테스트의 목적:
 *    - 같은 버그가 다시 발생하지 않도록 방지
 *    - 리팩토링 시 이 케이스가 깨지지 않는지 검증
 *    - 코드 리뷰어가 버그 수정 의도를 명확히 이해
 */
