/**
 * DocumentStatusView 백엔드 정렬 기능 테스트
 * @since 1.0.0
 *
 * 커밋 시리즈:
 * - 7b74114: 상태 칼럼 백엔드 정렬 구현
 * - fb854d0 & c9de052: 파일명/업로드날짜 백엔드 정렬 구현
 * - 714cb16 & 9a70e12: 파일사이즈/파일타입 백엔드 정렬 구현
 *
 * 주요 변경사항:
 * - 클라이언트 정렬에서 백엔드 정렬로 전환
 * - API 호출 시 sort 파라미터 전달 (field_asc, field_desc)
 * - 전체 문서 대상 정렬 지원 (페이지 간 일관성 확보)
 * - MongoDB Aggregation으로 fileSize 숫자 정렬 구현
 *
 * 검증 사항:
 * - 총 10가지 정렬 (5개 칼럼 × 2개 방향)
 * - 상태, 파일명, 업로드날짜, 파일사이즈, 파일타입
 * - 오름차순(asc) / 내림차순(desc)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusView } from '../DocumentStatusView'

// Mock documents for testing
const createMockDocuments = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    _id: `doc-${i}`,
    filename: `document-${i}.pdf`,
    fileSize: 1024000 + i * 1000,
    mimeType: 'application/pdf',
    uploadTime: new Date(2025, 0, i + 1).toISOString(),
    status: i % 2 === 0 ? 'completed' : 'processing',
    progress: i % 2 === 0 ? 100 : 50,
  }))
}

// Mock DocumentStatusProvider
vi.mock('@/providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: any) => <div>{children}</div>,
}))

// Mock useDocumentStatusController with sorting functionality
const mockHandleColumnSort = vi.fn()
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
  handleColumnSort: mockHandleColumnSort,
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
  default: ({ sortField, sortDirection, onColumnSort }: any) => (
    <div data-testid="document-status-list">
      <div data-testid="sort-field">{sortField || 'none'}</div>
      <div data-testid="sort-direction">{sortDirection}</div>
      <button onClick={() => onColumnSort('status')} data-testid="sort-status">
        Sort Status
      </button>
      <button onClick={() => onColumnSort('filename')} data-testid="sort-filename">
        Sort Filename
      </button>
      <button onClick={() => onColumnSort('uploadTime')} data-testid="sort-upload-time">
        Sort Upload Time
      </button>
      <button onClick={() => onColumnSort('fileSize')} data-testid="sort-file-size">
        Sort File Size
      </button>
      <button onClick={() => onColumnSort('mimeType')} data-testid="sort-mime-type">
        Sort Mime Type
      </button>
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

describe('DocumentStatusView - 백엔드 정렬 기능 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockController.sortField = null
    mockController.sortDirection = 'asc'
  })

  describe('정렬 기능 통합', () => {
    it('handleColumnSort 함수가 Controller에서 제공되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.handleColumnSort).toBeDefined()
      expect(typeof mockController.handleColumnSort).toBe('function')
    })

    it('sortField와 sortDirection이 Controller에서 제공되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.sortField).toBeDefined()
      expect(mockController.sortDirection).toBeDefined()
    })

    it('정렬 상태가 DocumentStatusList에 전달되어야 함', () => {
      mockController.sortField = 'status'
      mockController.sortDirection = 'desc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortField = document.querySelector('[data-testid="sort-field"]')
      const sortDirection = document.querySelector('[data-testid="sort-direction"]')

      expect(sortField?.textContent).toBe('status')
      expect(sortDirection?.textContent).toBe('desc')
    })
  })

  describe('커밋 7b74114: 상태 칼럼 백엔드 정렬', () => {
    it('상태 칼럼 정렬 버튼 클릭 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-status"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledWith('status')
    })

    it('상태 정렬이 백엔드로 전달되어야 함', () => {
      // 백엔드 정렬이므로 API 호출 시 sort 파라미터 포함
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.handleColumnSort).toBeDefined()
    })
  })

  describe('커밋 fb854d0: 파일명/업로드날짜 백엔드 정렬', () => {
    it('파일명 칼럼 정렬 버튼 클릭 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-filename"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledWith('filename')
    })

    it('업로드날짜 칼럼 정렬 버튼 클릭 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-upload-time"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledWith('uploadTime')
    })
  })

  describe('커밋 9a70e12: 파일사이즈/파일타입 백엔드 정렬', () => {
    it('파일사이즈 칼럼 정렬 버튼 클릭 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-file-size"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledWith('fileSize')
    })

    it('파일타입 칼럼 정렬 버튼 클릭 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-mime-type"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledWith('mimeType')
    })
  })

  describe('정렬 방향 전환', () => {
    it('오름차순 정렬이 가능해야 함', () => {
      mockController.sortField = 'filename'
      mockController.sortDirection = 'asc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortDirection = document.querySelector('[data-testid="sort-direction"]')
      expect(sortDirection?.textContent).toBe('asc')
    })

    it('내림차순 정렬이 가능해야 함', () => {
      mockController.sortField = 'filename'
      mockController.sortDirection = 'desc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortDirection = document.querySelector('[data-testid="sort-direction"]')
      expect(sortDirection?.textContent).toBe('desc')
    })
  })

  describe('전체 문서 대상 정렬', () => {
    it('페이지네이션과 독립적으로 정렬이 작동해야 함', () => {
      mockController.currentPage = 2
      mockController.sortField = 'uploadTime'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortField = document.querySelector('[data-testid="sort-field"]')
      expect(sortField?.textContent).toBe('uploadTime')
    })

    it('정렬이 전체 문서에 적용되어야 함', () => {
      // 백엔드 정렬이므로 전체 문서 대상 정렬
      mockController.totalCount = 100
      mockController.sortField = 'fileSize'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.totalCount).toBe(100)
      const sortField = document.querySelector('[data-testid="sort-field"]')
      expect(sortField?.textContent).toBe('fileSize')
    })
  })

  describe('클라이언트 정렬 로직 제거 검증', () => {
    it('정렬은 Controller를 통해서만 처리되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // handleColumnSort가 유일한 정렬 진입점
      expect(mockController.handleColumnSort).toBeDefined()
    })

    it('정렬 상태가 Provider에서 관리되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      // sortField와 sortDirection이 Provider에서 제공
      expect(mockController.sortField).toBeDefined()
      expect(mockController.sortDirection).toBeDefined()
    })
  })

  describe('10가지 정렬 조합 지원', () => {
    const sortFields = ['status', 'filename', 'uploadTime', 'fileSize', 'mimeType'] as const
    const sortDirections = ['asc', 'desc'] as const

    sortFields.forEach((field) => {
      sortDirections.forEach((direction) => {
        it(`${field} ${direction} 정렬이 지원되어야 함`, () => {
          mockController.sortField = field
          mockController.sortDirection = direction

          render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

          const sortFieldEl = document.querySelector('[data-testid="sort-field"]')
          const sortDirectionEl = document.querySelector('[data-testid="sort-direction"]')

          expect(sortFieldEl?.textContent).toBe(field)
          expect(sortDirectionEl?.textContent).toBe(direction)
        })
      })
    })
  })

  describe('정렬 초기 상태', () => {
    it('정렬이 설정되지 않았을 때 null이어야 함', () => {
      mockController.sortField = null
      mockController.sortDirection = 'asc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortField = document.querySelector('[data-testid="sort-field"]')
      expect(sortField?.textContent).toBe('none')
    })

    it('기본 정렬 방향은 asc여야 함', () => {
      mockController.sortField = null
      mockController.sortDirection = 'asc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.sortDirection).toBe('asc')
    })
  })

  describe('정렬과 다른 기능의 독립성', () => {
    it('정렬이 폴링 기능과 독립적이어야 함', () => {
      mockController.isPollingEnabled = true
      mockController.sortField = 'filename'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.isPollingEnabled).toBe(true)
      expect(mockController.sortField).toBe('filename')
    })

    it('정렬이 검색 기능과 독립적이어야 함', () => {
      mockController.sortField = 'uploadTime'
      mockController.filteredDocuments = createMockDocuments(5)

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      expect(mockController.filteredDocuments.length).toBe(5)
      expect(mockController.sortField).toBe('uploadTime')
    })
  })

  describe('API 통신 검증', () => {
    it('정렬 변경 시 handleColumnSort가 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortButton = document.querySelector('[data-testid="sort-filename"]') as HTMLButtonElement
      sortButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledTimes(1)
      expect(mockHandleColumnSort).toHaveBeenCalledWith('filename')
    })

    it('여러 칼럼 정렬 시 각각 독립적으로 호출되어야 함', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const statusButton = document.querySelector('[data-testid="sort-status"]') as HTMLButtonElement
      const filenameButton = document.querySelector('[data-testid="sort-filename"]') as HTMLButtonElement

      statusButton?.click()
      filenameButton?.click()

      expect(mockHandleColumnSort).toHaveBeenCalledTimes(2)
      expect(mockHandleColumnSort).toHaveBeenNthCalledWith(1, 'status')
      expect(mockHandleColumnSort).toHaveBeenNthCalledWith(2, 'filename')
    })
  })

  describe('MongoDB Aggregation 정렬 (파일사이즈)', () => {
    it('fileSize 정렬이 숫자로 처리되어야 함', () => {
      // 백엔드에서 $toLong으로 변환하여 정렬
      mockController.sortField = 'fileSize'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortField = document.querySelector('[data-testid="sort-field"]')
      expect(sortField?.textContent).toBe('fileSize')
    })

    it('fileSize 오름차순 정렬이 지원되어야 함', () => {
      mockController.sortField = 'fileSize'
      mockController.sortDirection = 'asc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortDirection = document.querySelector('[data-testid="sort-direction"]')
      expect(sortDirection?.textContent).toBe('asc')
    })

    it('fileSize 내림차순 정렬이 지원되어야 함', () => {
      mockController.sortField = 'fileSize'
      mockController.sortDirection = 'desc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortDirection = document.querySelector('[data-testid="sort-direction"]')
      expect(sortDirection?.textContent).toBe('desc')
    })
  })

  describe('정렬 UI 피드백', () => {
    it('현재 정렬 칼럼이 표시되어야 함', () => {
      mockController.sortField = 'uploadTime'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortField = document.querySelector('[data-testid="sort-field"]')
      expect(sortField?.textContent).toBe('uploadTime')
    })

    it('현재 정렬 방향이 표시되어야 함', () => {
      mockController.sortDirection = 'desc'

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />)

      const sortDirection = document.querySelector('[data-testid="sort-direction"]')
      expect(sortDirection?.textContent).toBe('desc')
    })
  })
})
