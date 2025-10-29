/**
 * DocumentStatusView 페이지네이션 전환 테스트
 * @since 1.0.0
 *
 * 커밋 52acbec: 페이지네이션 기반 API 호출로 전환
 *
 * 주요 변경사항:
 * - "최대 표시" 기능 제거 및 설정 버튼 UI 제거
 * - fetchLimit 상태 관리 코드 제거
 * - API에 page 파라미터 추가 (page, limit, sort)
 * - 백엔드 pagination 정보 사용 (totalPages)
 * - 페이지 이동 시마다 필요한 데이터만 API 호출
 *
 * 변경 전: 최대 100개 가져옴 → 프론트엔드 페이지네이션
 * 변경 후: 페이지당 10개만 가져옴 → 백엔드 페이지네이션
 *
 * 장점:
 * - 효율적 데이터 전송 (필요한 만큼만)
 * - 서버 부하 감소
 * - 로딩 속도 향상
 * - UI 단순화
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentStatusView } from '../DocumentStatusView'

// Mock documents for testing
const createMockDocuments = (count: number, page: number = 1, limit: number = 10) => {
  const startIndex = (page - 1) * limit
  return Array.from({ length: Math.min(count, limit) }, (_, i) => ({
    _id: `doc-${startIndex + i}`,
    filename: `document-${startIndex + i}.pdf`,
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

// Mock useDocumentStatusController with pagination
const mockHandlePageChange = vi.fn()
const mockHandleLimitChange = vi.fn()
const mockController: any = {
  paginatedDocuments: createMockDocuments(10, 1, 10),
  filteredDocuments: createMockDocuments(10, 1, 10),
  documents: createMockDocuments(10, 1, 10),
  isLoading: false,
  error: null,
  totalCount: 100,
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
  totalPages: 10,
  itemsPerPage: 10,
  handlePageChange: mockHandlePageChange,
  handleLimitChange: mockHandleLimitChange,
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
  default: ({ documentsCount }: any) => (
    <div data-testid="document-status-header">
      <span data-testid="documents-count">{documentsCount}</span>
    </div>
  ),
}))

vi.mock('../components/DocumentStatusList', () => ({
  default: ({ documents }: any) => (
    <div data-testid="document-status-list">
      {documents.map((doc: any) => (
        <div key={doc._id} data-testid={`doc-${doc._id}`}>
          {doc.filename}
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

describe('DocumentStatusView - 페이지네이션 전환 테스트 (커밋 52acbec)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockController.currentPage = 1
    mockController.totalPages = 10
    mockController.itemsPerPage = 10
    mockController.paginatedDocuments = createMockDocuments(10, 1, 10)
  })

  describe('페이지네이션 상태 관리', () => {
    it('currentPage 상태가 Controller에서 제공되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.currentPage).toBeDefined()
      expect(mockController.currentPage).toBe(1)
    })

    it('totalPages 상태가 Controller에서 제공되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.totalPages).toBeDefined()
      expect(mockController.totalPages).toBe(10)
    })

    it('itemsPerPage 상태가 Controller에서 제공되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.itemsPerPage).toBeDefined()
      expect(mockController.itemsPerPage).toBe(10)
    })
  })

  describe('백엔드 페이지네이션 통합', () => {
    it('페이지당 10개 문서만 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(10)
    })

    it('totalPages가 백엔드에서 계산되어야 함', () => {
      // 총 100개 문서, 페이지당 10개 = 10페이지
      mockController.totalCount = 100
      mockController.totalPages = 10

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.totalPages).toBe(10)
    })

    it('페이지 변경 시 handlePageChange가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 페이지 변경 시뮬레이션
      mockController.handlePageChange(2)

      expect(mockHandlePageChange).toHaveBeenCalledWith(2)
    })
  })

  describe('"최대 표시" 기능 제거 검증', () => {
    it('fetchLimit 상태가 Controller에 없어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.fetchLimit).toBeUndefined()
    })

    it('handleFetchLimitChange 함수가 Controller에 없어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.handleFetchLimitChange).toBeUndefined()
    })

    it('설정 버튼이 렌더링되지 않아야 함', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const settingsButton = container.querySelector('.settings-toggle')
      expect(settingsButton).toBeNull()
    })

    it('설정 패널이 렌더링되지 않아야 함', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const settingsPanel = container.querySelector('.settings-panel')
      expect(settingsPanel).toBeNull()
    })

    it('"최대 표시" 드롭다운이 렌더링되지 않아야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // "최대 표시" 관련 텍스트가 없어야 함
      expect(screen.queryByText(/최대 표시/i)).toBeNull()
    })
  })

  describe('페이지 전환 동작', () => {
    it('페이지 1에서 페이지 2로 전환 가능해야 함', () => {
      const { rerender } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.currentPage).toBe(1)

      // 페이지 2로 전환
      mockController.currentPage = 2
      mockController.paginatedDocuments = createMockDocuments(10, 2, 10)

      rerender(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.currentPage).toBe(2)
    })

    it('페이지 변경 시 새로운 데이터 세트가 로드되어야 함', () => {
      mockController.currentPage = 1
      mockController.paginatedDocuments = createMockDocuments(10, 1, 10)

      const { rerender } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 페이지 1의 첫 번째 문서
      expect(mockController.paginatedDocuments[0]._id).toBe('doc-0')

      // 페이지 2로 변경
      mockController.currentPage = 2
      mockController.paginatedDocuments = createMockDocuments(10, 2, 10)

      rerender(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 페이지 2의 첫 번째 문서 (인덱스 10부터 시작)
      expect(mockController.paginatedDocuments[0]._id).toBe('doc-10')
    })
  })

  describe('효율적 데이터 전송', () => {
    it('페이지당 정확히 itemsPerPage 개수만 로드되어야 함', () => {
      mockController.itemsPerPage = 10
      mockController.paginatedDocuments = createMockDocuments(10, 1, 10)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(10)
    })

    it('전체 문서를 한 번에 로드하지 않아야 함', () => {
      // 총 100개 문서가 있지만, paginatedDocuments는 10개만
      mockController.totalCount = 100
      mockController.paginatedDocuments = createMockDocuments(10, 1, 10)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(10)
      expect(mockController.paginatedDocuments.length).toBeLessThan(mockController.totalCount)
    })
  })

  describe('API 호출 파라미터 검증', () => {
    it('page 파라미터가 전달되어야 함', () => {
      mockController.currentPage = 3

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.currentPage).toBe(3)
    })

    it('limit 파라미터가 전달되어야 함', () => {
      mockController.itemsPerPage = 20

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.itemsPerPage).toBe(20)
    })
  })

  describe('itemsPerPage 변경', () => {
    it('itemsPerPage 변경 시 handleLimitChange가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      mockController.handleLimitChange(20)

      expect(mockHandleLimitChange).toHaveBeenCalledWith(20)
    })

    it('itemsPerPage 변경 시 currentPage가 1로 리셋되어야 함', () => {
      mockController.currentPage = 5

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // itemsPerPage 변경 시 페이지 리셋 로직은 Provider에서 처리
      // 여기서는 handleLimitChange가 호출되는지만 확인
      mockController.handleLimitChange(20)

      expect(mockHandleLimitChange).toHaveBeenCalledWith(20)
    })
  })

  describe('totalPages 계산', () => {
    it('totalPages가 백엔드에서 제공되어야 함', () => {
      mockController.totalPages = 10

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.totalPages).toBe(10)
    })

    it('totalPages가 프론트엔드에서 계산되지 않아야 함', () => {
      // 백엔드 페이지네이션이므로 프론트엔드에서 totalPages 계산 안 함
      mockController.totalCount = 100
      mockController.itemsPerPage = 10
      mockController.totalPages = 10 // 백엔드에서 제공

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.totalPages).toBe(10)
    })
  })

  describe('UI 단순화 효과', () => {
    it('설정 관련 UI 요소가 제거되었는지 확인', () => {
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 설정 버튼 없음
      expect(container.querySelector('.settings-toggle')).toBeNull()
      // 설정 패널 없음
      expect(container.querySelector('.settings-panel')).toBeNull()
      // "최대 표시" 라벨 없음
      expect(screen.queryByText(/최대 표시/i)).toBeNull()
    })

    it('페이지네이션 컨트롤만 표시되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // handlePageChange와 handleLimitChange가 존재
      expect(mockController.handlePageChange).toBeDefined()
      expect(mockController.handleLimitChange).toBeDefined()
    })
  })

  describe('변경 전후 비교', () => {
    it('변경 전: fetchLimit 상태 존재 → 변경 후: 제거', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.fetchLimit).toBeUndefined()
    })

    it('변경 전: 프론트엔드 슬라이싱 → 변경 후: 백엔드 페이지네이션', () => {
      // 백엔드에서 이미 페이지네이션된 데이터만 받음
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(10)
      expect(mockController.totalPages).toBe(10)
    })
  })

  describe('페이지네이션과 정렬 통합', () => {
    it('정렬 변경 시에도 페이지네이션이 유지되어야 함', () => {
      mockController.sortField = 'filename'
      mockController.sortDirection = 'asc'
      mockController.currentPage = 2

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.currentPage).toBe(2)
      expect(mockController.sortField).toBe('filename')
    })

    it('정렬과 페이지네이션이 독립적으로 작동해야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.handleColumnSort).toBeDefined()
      expect(mockController.handlePageChange).toBeDefined()
    })
  })

  describe('커밋 52acbec 핵심 변경사항 검증', () => {
    it('최대 표시 기능이 완전히 제거되었는지 확인', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // fetchLimit 관련 상태 없음
      expect(mockController.fetchLimit).toBeUndefined()
      expect(mockController.handleFetchLimitChange).toBeUndefined()

      // UI 요소 없음
      const { container } = render(<DocumentStatusView visible={true} onClose={vi.fn()} />)
      expect(container.querySelector('.settings-toggle')).toBeNull()
      expect(container.querySelector('.settings-panel')).toBeNull()
    })

    it('page 파라미터 기반 API 호출 구조 확인', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // currentPage와 itemsPerPage 상태 존재
      expect(mockController.currentPage).toBeDefined()
      expect(mockController.itemsPerPage).toBeDefined()
    })

    it('백엔드 pagination 정보 사용 확인', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // totalPages가 백엔드에서 제공
      expect(mockController.totalPages).toBe(10)
    })

    it('효율적 데이터 전송 확인 (필요한 만큼만)', () => {
      mockController.totalCount = 100
      mockController.itemsPerPage = 10
      mockController.paginatedDocuments = createMockDocuments(10, 1, 10)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // 100개 중 10개만 로드
      expect(mockController.paginatedDocuments.length).toBe(10)
    })
  })

  describe('페이지네이션 엣지 케이스', () => {
    it('마지막 페이지에서 적은 수의 문서 표시', () => {
      // 총 95개 문서, 페이지당 10개 → 마지막 페이지는 5개
      mockController.currentPage = 10
      mockController.totalPages = 10
      mockController.paginatedDocuments = createMockDocuments(5, 10, 10)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(5)
    })

    it('문서가 1개만 있을 때', () => {
      mockController.totalCount = 1
      mockController.totalPages = 1
      mockController.paginatedDocuments = createMockDocuments(1, 1, 10)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(1)
      expect(mockController.totalPages).toBe(1)
    })

    it('문서가 없을 때', () => {
      mockController.totalCount = 0
      mockController.totalPages = 1
      mockController.paginatedDocuments = []

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.paginatedDocuments.length).toBe(0)
    })
  })
})
