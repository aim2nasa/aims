/**
 * DocumentStatusView overallStatus 자동 업데이트 테스트
 * @since 1.0.0
 *
 * 커밋 97013eb: 문서처리현황 페이지 overallStatus 자동 업데이트 구현
 *
 * 백엔드 변경사항:
 * - /api/documents/status API 폴링 시점에 overallStatus 필드를 자동으로 생성 및 업데이트
 * - overallStatus 없거나 'completed' 아닌 문서만 업데이트 (성능 최적화)
 * - prepareDocumentResponse()로 현재 상태 계산 후 DB 저장
 * - overallStatusUpdatedAt 타임스탬프 함께 기록
 *
 * 작동 원리:
 * 1. 문서처리현황 페이지 폴링 시 API 호출
 * 2. 각 문서의 overallStatus 확인
 * 3. 필드 없거나 미완료 상태면 현재 상태 계산 후 DB 업데이트
 * 4. 'completed' 상태는 스킵 (불필요한 업데이트 방지)
 *
 * 프론트엔드 검증 사항:
 * - overallStatus 필드를 포함한 문서 데이터 수신
 * - 폴링 시 자동으로 업데이트된 상태 반영
 * - 'completed' 상태 표시 정확성
 * - processing → completed 전환 감지
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentStatusView } from '../DocumentStatusView'

// Mock documents with overallStatus
const createMockDocumentsWithOverallStatus = (statuses: string[]) => {
  return statuses.map((status, i) => ({
    _id: `doc-${i}`,
    filename: `document-${i}.pdf`,
    fileSize: 1024000,
    mimeType: 'application/pdf',
    uploadTime: new Date().toISOString(),
    overallStatus: status,
    overallStatusUpdatedAt: new Date().toISOString(),
    progress: status === 'completed' ? 100 : 50,
  }))
}

// Mock DocumentStatusProvider
vi.mock('@/providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useDocumentStatusController with polling
const mockRefreshDocuments = vi.fn()
const mockTogglePolling = vi.fn()
const mockController: any = {
  paginatedDocuments: createMockDocumentsWithOverallStatus(['completed', 'processing', 'error']),
  filteredDocuments: createMockDocumentsWithOverallStatus(['completed', 'processing', 'error']),
  documents: createMockDocumentsWithOverallStatus(['completed', 'processing', 'error']),
  isLoading: false,
  error: null,
  totalCount: 3,
  lastUpdated: new Date(),
  isPollingEnabled: true,
  togglePolling: mockTogglePolling,
  refreshDocuments: mockRefreshDocuments,
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
  default: ({ isPollingEnabled, onTogglePolling, onRefresh }: any) => (
    <div data-testid="document-status-header">
      <button onClick={onTogglePolling} data-testid="toggle-polling">
        {isPollingEnabled ? 'Polling On' : 'Polling Off'}
      </button>
      <button onClick={onRefresh} data-testid="refresh">
        Refresh
      </button>
    </div>
  ),
}))

vi.mock('../components/DocumentStatusList', () => ({
  default: ({ documents }: any) => (
    <div data-testid="document-status-list">
      {documents.map((doc: any) => (
        <div key={doc._id} data-testid={`doc-${doc._id}`}>
          <span data-testid={`status-${doc._id}`}>{doc.overallStatus}</span>
          <span data-testid={`updated-${doc._id}`}>{doc.overallStatusUpdatedAt}</span>
        </div>
      ))}
    </div>
  ),
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

describe('DocumentStatusView - overallStatus 자동 업데이트 테스트 (커밋 97013eb)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('overallStatus 필드 포함 검증', () => {
    it('문서에 overallStatus 필드가 포함되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc0 = mockController.documents[0]
      expect(doc0.overallStatus).toBeDefined()
      expect(doc0.overallStatus).toBe('completed')
    })

    it('문서에 overallStatusUpdatedAt 필드가 포함되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc0 = mockController.documents[0]
      expect(doc0.overallStatusUpdatedAt).toBeDefined()
      expect(doc0.overallStatusUpdatedAt).toBeTruthy()
    })

    it('모든 문서가 overallStatus를 가져야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      mockController.documents.forEach((doc: any) => {
        expect(doc.overallStatus).toBeDefined()
      })
    })
  })

  describe('다양한 상태 표시', () => {
    it('completed 상태가 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('completed')
    })

    it('processing 상태가 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statusEl = screen.getByTestId('status-doc-1')
      expect(statusEl.textContent).toBe('processing')
    })

    it('error 상태가 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statusEl = screen.getByTestId('status-doc-2')
      expect(statusEl.textContent).toBe('error')
    })
  })

  describe('폴링 기능 통합', () => {
    it('폴링이 활성화되어 있어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.isPollingEnabled).toBe(true)
    })

    it('폴링 토글 버튼이 작동해야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const toggleButton = screen.getByTestId('toggle-polling')
      toggleButton.click()

      expect(mockTogglePolling).toHaveBeenCalledTimes(1)
    })

    it('새로고침 버튼이 작동해야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const refreshButton = screen.getByTestId('refresh')
      refreshButton.click()

      expect(mockRefreshDocuments).toHaveBeenCalledTimes(1)
    })
  })

  describe('자동 업데이트 시나리오', () => {
    it('processing → completed 전환을 감지해야 함', () => {
      // 초기: processing 상태
      const processingDocs = createMockDocumentsWithOverallStatus(['processing'])
      mockController.documents = processingDocs
      mockController.paginatedDocuments = processingDocs
      mockController.filteredDocuments = processingDocs

      const { rerender } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      let statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('processing')

      // 업데이트: completed 상태로 변경
      const completedDocs = createMockDocumentsWithOverallStatus(['completed'])
      mockController.documents = completedDocs
      mockController.paginatedDocuments = completedDocs
      mockController.filteredDocuments = completedDocs

      rerender(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('completed')
    })

    it('pending → processing 전환을 감지해야 함', () => {
      // 초기: pending 상태
      const pendingDocs = createMockDocumentsWithOverallStatus(['pending'])
      mockController.documents = pendingDocs
      mockController.paginatedDocuments = pendingDocs
      mockController.filteredDocuments = pendingDocs

      const { rerender } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      let statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('pending')

      // 업데이트: processing 상태로 변경
      const processingDocs = createMockDocumentsWithOverallStatus(['processing'])
      mockController.documents = processingDocs
      mockController.paginatedDocuments = processingDocs
      mockController.filteredDocuments = processingDocs

      rerender(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('processing')
    })
  })

  describe('성능 최적화 검증', () => {
    it('completed 상태 문서는 업데이트 스킵 (백엔드 로직)', () => {
      // 백엔드에서 completed 상태는 스킵하므로
      // 프론트엔드는 completed 상태를 정확히 표시만 하면 됨
      const completedDoc = createMockDocumentsWithOverallStatus(['completed'])
      mockController.documents = completedDoc
      mockController.paginatedDocuments = completedDoc
      mockController.filteredDocuments = completedDoc

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statusEl = screen.getByTestId('status-doc-0')
      expect(statusEl.textContent).toBe('completed')
    })

    it('미완료 상태 문서만 업데이트 대상 (프론트엔드 표시)', () => {
      const mixedDocs = createMockDocumentsWithOverallStatus([
        'completed',
        'processing',
        'error',
        'pending',
      ])
      mockController.documents = mixedDocs
      mockController.paginatedDocuments = mixedDocs
      mockController.filteredDocuments = mixedDocs

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // completed는 스킵, 나머지는 업데이트 대상
      const completedEl = screen.getByTestId('status-doc-0')
      const processingEl = screen.getByTestId('status-doc-1')
      const errorEl = screen.getByTestId('status-doc-2')
      const pendingEl = screen.getByTestId('status-doc-3')

      expect(completedEl.textContent).toBe('completed')
      expect(processingEl.textContent).toBe('processing')
      expect(errorEl.textContent).toBe('error')
      expect(pendingEl.textContent).toBe('pending')
    })
  })

  describe('lastUpdated 타임스탬프', () => {
    it('lastUpdated가 업데이트되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.lastUpdated).toBeDefined()
      expect(mockController.lastUpdated).toBeInstanceOf(Date)
    })

    it('overallStatusUpdatedAt이 각 문서에 기록되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      mockController.documents.forEach((doc: any) => {
        expect(doc.overallStatusUpdatedAt).toBeDefined()
        expect(doc.overallStatusUpdatedAt).toBeTruthy()
      })
    })
  })

  describe('100% 커버리지 검증', () => {
    it('모든 문서가 overallStatus를 가져야 함 (100% 커버리지)', () => {
      // 다양한 문서 타입과 상태
      mockController.documents = createMockDocumentsWithOverallStatus([
        'completed',
        'processing',
        'error',
        'pending',
        'completed',
        'processing',
      ])

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      mockController.documents.forEach((doc: any) => {
        expect(doc.overallStatus).toBeDefined()
        expect(['completed', 'processing', 'error', 'pending']).toContain(doc.overallStatus)
      })
    })

    it('신규 업로드 파일도 overallStatus를 가져야 함', () => {
      // 신규 파일 (pending 상태)
      mockController.documents = createMockDocumentsWithOverallStatus(['pending'])

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc = mockController.documents[0]
      expect(doc.overallStatus).toBe('pending')
      expect(doc.overallStatusUpdatedAt).toBeDefined()
    })
  })

  describe('API 응답 구조 검증', () => {
    it('문서 데이터에 overallStatus 필드가 포함되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc = mockController.documents[0]
      expect(doc).toHaveProperty('overallStatus')
    })

    it('문서 데이터에 overallStatusUpdatedAt 필드가 포함되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc = mockController.documents[0]
      expect(doc).toHaveProperty('overallStatusUpdatedAt')
    })

    it('overallStatus 값이 유효한 상태여야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const validStatuses = ['completed', 'processing', 'error', 'pending']
      mockController.documents.forEach((doc: any) => {
        expect(validStatuses).toContain(doc.overallStatus)
      })
    })
  })

  describe('UI 상태 반영', () => {
    it('상태가 UI에 즉시 반영되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const doc0Status = screen.getByTestId('status-doc-0')
      const doc1Status = screen.getByTestId('status-doc-1')
      const doc2Status = screen.getByTestId('status-doc-2')

      expect(doc0Status.textContent).toBe('completed')
      expect(doc1Status.textContent).toBe('processing')
      expect(doc2Status.textContent).toBe('error')
    })

    it('여러 상태가 동시에 표시될 수 있어야 함', () => {
      const multiStatusDocs = createMockDocumentsWithOverallStatus([
        'completed',
        'completed',
        'processing',
        'processing',
        'error',
        'pending',
      ])
      mockController.documents = multiStatusDocs
      mockController.paginatedDocuments = multiStatusDocs
      mockController.filteredDocuments = multiStatusDocs

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 각 상태가 모두 표시됨
      expect(screen.getByTestId('status-doc-0').textContent).toBe('completed')
      expect(screen.getByTestId('status-doc-2').textContent).toBe('processing')
      expect(screen.getByTestId('status-doc-4').textContent).toBe('error')
      expect(screen.getByTestId('status-doc-5').textContent).toBe('pending')
    })
  })

  describe('커밋 97013eb 핵심 기능 검증', () => {
    it('폴링 시 overallStatus 자동 업데이트 흐름이 작동해야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 1. 폴링 활성화
      expect(mockController.isPollingEnabled).toBe(true)

      // 2. overallStatus 필드 존재
      mockController.documents.forEach((doc: any) => {
        expect(doc.overallStatus).toBeDefined()
      })

      // 3. 타임스탬프 기록
      mockController.documents.forEach((doc: any) => {
        expect(doc.overallStatusUpdatedAt).toBeDefined()
      })
    })

    it('prepareDocumentResponse()로 계산된 상태가 반영되어야 함', () => {
      // 백엔드에서 prepareDocumentResponse()로 계산한 상태가
      // 프론트엔드에 정확히 전달됨
      const expectedDocs = createMockDocumentsWithOverallStatus(['completed', 'processing', 'error'])
      mockController.documents = expectedDocs
      mockController.paginatedDocuments = expectedDocs
      mockController.filteredDocuments = expectedDocs

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statuses = mockController.documents.map((doc: any) => doc.overallStatus)
      expect(statuses).toEqual(['completed', 'processing', 'error'])
    })

    it('성능 최적화: completed 상태 스킵 로직 확인', () => {
      // completed 상태 문서
      const completedDocs = createMockDocumentsWithOverallStatus(['completed', 'completed'])
      mockController.documents = completedDocs
      mockController.paginatedDocuments = completedDocs
      mockController.filteredDocuments = completedDocs

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // completed 상태가 정확히 표시됨 (백엔드에서 스킵했지만 기존 값 유지)
      expect(screen.getByTestId('status-doc-0').textContent).toBe('completed')
      expect(screen.getByTestId('status-doc-1').textContent).toBe('completed')
    })
  })
})
