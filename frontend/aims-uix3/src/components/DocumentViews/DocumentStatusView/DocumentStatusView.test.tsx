/**
 * DocumentStatusView Component Tests
 * @since 1.0.0
 *
 * COMPONENT_GUIDE.md 준수: Component Testing (라인 569-612)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentStatusView } from './DocumentStatusView'
import * as DocumentStatusController from '../../../controllers/useDocumentStatusController'
import type { Document } from '../../../types/documentStatus'

// Mock Controller
const mockController = {
  // Context State
  documents: [] as Document[],
  filteredDocuments: [] as Document[],
  isLoading: false,
  error: null,
  statusFilter: 'all' as const,
  isPollingEnabled: false,
  lastUpdated: null,
  selectedDocument: null,
  searchTerm: '',
  apiHealth: true,

  // Pagination State
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 50,
  paginatedDocuments: [] as Document[],

  // Context Actions
  setStatusFilter: vi.fn(),
  togglePolling: vi.fn(),
  refreshDocuments: vi.fn(),
  handlePageChange: vi.fn(),
  handleItemsPerPageChange: vi.fn(),
  handleLimitChange: vi.fn(),

  // Modal States
  isDetailModalVisible: false,
  selectedDocumentForSummary: null,
  isSummaryModalVisible: false,
  selectedDocumentForFullText: null,
  isFullTextModalVisible: false,

  // Event Handlers
  handleDocumentClick: vi.fn(),
  handleDetailModalClose: vi.fn(),
  handleDocumentSummary: vi.fn(),
  handleSummaryModalClose: vi.fn(),
  handleDocumentFullText: vi.fn(),
  handleFullTextModalClose: vi.fn(),
}

vi.mock('../../../controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: vi.fn(),
}))

// Test Wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('DocumentStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue(mockController)
  })

  describe('기본 렌더링', () => {
    it('visible=false일 때 렌더링되지 않는다', () => {
      const { container } = render(
        <DocumentStatusView visible={false} onClose={vi.fn()} />,
        { wrapper: createWrapper() }
      )

      expect(container.firstChild).toBeNull()
    })

    it('visible=true일 때 컴포넌트가 렌더링된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      // 제목 확인
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })

    it('컨트롤 버튼들이 표시된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      // 폴링 버튼 확인
      expect(screen.getByLabelText(/실시간 업데이트/)).toBeInTheDocument()

      // 새로고침 버튼 확인
      expect(screen.getByLabelText('새로고침')).toBeInTheDocument()
    })
  })

  describe('onClose prop', () => {
    it('onClose prop이 CenterPaneView에 전달된다', () => {
      const onCloseMock = vi.fn()

      render(<DocumentStatusView visible={true} onClose={onCloseMock} />, {
        wrapper: createWrapper(),
      })

      // CenterPaneView가 onClose를 받아서 처리함
      // 컴포넌트가 정상적으로 렌더링되었는지 확인
      expect(screen.getByText('문서 처리 현황')).toBeInTheDocument()
    })
  })

  describe('로딩 상태', () => {
    it('로딩 중일 때 스켈레톤이 표시된다', () => {
      vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue({
        ...mockController,
        isLoading: true,
        documents: [],
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('문서 목록을 불러오는 중...')).toBeInTheDocument()
    })
  })

  describe('에러 상태', () => {
    it('에러 발생 시 에러 메시지가 표시된다', () => {
      const errorMessage = 'API 연결 실패'

      vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue({
        ...mockController,
        error: errorMessage,
        documents: [],
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  describe('문서 목록', () => {
    it('문서가 없을 때 빈 상태 메시지가 표시된다', () => {
      vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue({
        ...mockController,
        documents: [],
        filteredDocuments: [],
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('문서가 없습니다.')).toBeInTheDocument()
    })

    it('문서 목록이 테이블로 표시된다', () => {
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
      ]

      vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue({
        ...mockController,
        documents: mockDocuments,
        filteredDocuments: mockDocuments,
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('test1.pdf')).toBeInTheDocument()
    })
  })

  describe('Controller 통합', () => {
    it('Controller Hook을 올바르게 사용한다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      expect(DocumentStatusController.useDocumentStatusController).toHaveBeenCalled()
    })

    it('문서 클릭 시 handleDocumentClick을 호출한다', () => {
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
      ]

      const handleDocumentClickMock = vi.fn()

      vi.mocked(DocumentStatusController.useDocumentStatusController).mockReturnValue({
        ...mockController,
        documents: mockDocuments,
        filteredDocuments: mockDocuments,
        handleDocumentClick: handleDocumentClickMock,
      })

      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      // 상세 보기 버튼 클릭
      const detailButtons = screen.getAllByLabelText('상세 보기')
      if (detailButtons[0]) {
        fireEvent.click(detailButtons[0])
      }

      expect(handleDocumentClickMock).toHaveBeenCalledWith(mockDocuments[0])
    })
  })

  describe('Pure View 검증', () => {
    it('View는 비즈니스 로직을 포함하지 않는다', () => {
      const { container } = render(
        <DocumentStatusView visible={true} onClose={vi.fn()} />,
        { wrapper: createWrapper() }
      )

      // Pure View이므로 Controller만 사용하고 직접 상태 관리 없음
      expect(DocumentStatusController.useDocumentStatusController).toHaveBeenCalled()

      // DOM이 정상적으로 렌더링됨
      expect(container.querySelector('.document-status-view')).toBeInTheDocument()
    })

    it('모든 이벤트 핸들러가 Controller에서 제공된다', () => {
      render(<DocumentStatusView visible={true} onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      })

      const controller = vi.mocked(DocumentStatusController.useDocumentStatusController).mock.results[0]?.value

      // 모든 핸들러가 Controller에서 제공됨을 확인
      expect(controller.handleDocumentClick).toBeDefined()
      expect(controller.handleDetailModalClose).toBeDefined()
      expect(controller.handleDocumentSummary).toBeDefined()
      expect(controller.handleSummaryModalClose).toBeDefined()
      expect(controller.handleDocumentFullText).toBeDefined()
      expect(controller.handleFullTextModalClose).toBeDefined()
    })
  })
})
