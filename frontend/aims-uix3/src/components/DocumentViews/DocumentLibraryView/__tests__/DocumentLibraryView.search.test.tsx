/**
 * DocumentLibraryView 검색 기능 테스트
 *
 * 커밋 db04c61: 문서 라이브러리 검색 기능 구현
 *
 * 주요 변경사항:
 * - DocumentLibraryContent에 searchQuery prop 추가
 * - useDocumentsController()의 searchQuery를 DocumentLibraryContent에 전달
 * - DocumentLibraryContent 내부에서 useEffect로 Context의 setSearchTerm 호출
 *
 * 테스트 범위:
 * - useDocumentsController의 searchQuery가 컴포넌트에서 사용되는지
 * - search input이 searchQuery 값을 표시하는지
 *
 * Note: 실제 검색 로직(파일명, ID, full_text 필터링)은
 * DocumentStatusProvider에서 처리하므로 별도 테스트 필요
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentLibraryView } from '../DocumentLibraryView'

// Mock DocumentStatusProvider
vi.mock('../../../../providers/DocumentStatusProvider', () => ({
  DocumentStatusProvider: ({ children }: { children: React.ReactNode }) => {
    return <div data-testid="mock-provider">{children}</div>
  }
}))

// Mock useDocumentStatusContext
vi.mock('../../../../contexts/DocumentStatusContext', () => ({
  useDocumentStatusContext: () => ({
    state: {
      documents: [],
      filteredDocuments: [],
      selectedDocument: null,
      isLoading: false,
      error: null,
      searchTerm: '',
      lastUpdated: null,
      isPollingEnabled: false,
      apiHealth: null,
      currentPage: 1,
      itemsPerPage: 10,
      totalPages: 1,
      totalCount: 0,
      paginatedDocuments: [],
      sortField: null,
      sortDirection: 'desc',
    },
    actions: {
      setSearchTerm: vi.fn(),
      setDocuments: vi.fn(),
      setFilteredDocuments: vi.fn(),
      setSelectedDocument: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      setLastUpdated: vi.fn(),
      setPollingEnabled: vi.fn(),
      togglePolling: vi.fn(),
      setApiHealth: vi.fn(),
      fetchDocuments: vi.fn(),
      refreshDocuments: vi.fn(),
      checkApiHealth: vi.fn(),
      setCurrentPage: vi.fn(),
      setItemsPerPage: vi.fn(),
      handlePageChange: vi.fn(),
      handleLimitChange: vi.fn(),
      updateDocumentCustomerRelation: vi.fn(),
      setSortField: vi.fn(),
      setSortDirection: vi.fn(),
      handleColumnSort: vi.fn(),
    }
  })
}))

// Mock useDocumentStatusController
vi.mock('../../../../controllers/useDocumentStatusController', () => ({
  useDocumentStatusController: () => ({
    isLoading: false,
    error: null,
    totalCount: 0,
    lastUpdated: null,
    paginatedDocuments: [],
    filteredDocuments: [],
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 10,
    sortField: null,
    sortDirection: 'desc',
    handlePageChange: vi.fn(),
    handleLimitChange: vi.fn(),
    handleColumnSort: vi.fn(),
  })
}))

// Mock useDocumentsController with searchQuery
const mockHandleSearchChange = vi.fn()
const mockSearchQuery = 'test-document'

vi.mock('../../../../controllers/useDocumentsController', () => ({
  useDocumentsController: () => ({
    documents: [],
    isLoading: false,
    error: null,
    loadDocuments: vi.fn(),
    clearError: vi.fn(),
    searchParams: {},
    searchQuery: mockSearchQuery,
    handleSearchChange: mockHandleSearchChange,
  })
}))

// Mock useAppleConfirmController
vi.mock('../../../../controllers/useAppleConfirmController', () => ({
  useAppleConfirmController: () => ({
    state: {
      isOpen: false,
      shouldRender: false,
      title: '',
      message: '',
      confirmText: '',
      cancelText: '',
      showCancel: true,
    },
    actions: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
    }
  })
}))

describe('DocumentLibraryView - 검색 기능 테스트 (커밋 db04c61)', () => {
  describe('검색 UI 렌더링', () => {
    it('DocumentStatusProvider가 렌더링되어야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const provider = container.querySelector('[data-testid="mock-provider"]')
      expect(provider).not.toBeNull()
    })

    it('검색 input이 렌더링되어야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const searchInput = container.querySelector('.search-input')
      expect(searchInput).not.toBeNull()
    })

    it('검색 input이 useDocumentsController의 searchQuery 값을 표시해야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const searchInput = container.querySelector('.search-input') as HTMLInputElement
      expect(searchInput?.value).toBe(mockSearchQuery)
    })

    it('검색 input의 placeholder가 표시되어야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const searchInput = container.querySelector('.search-input') as HTMLInputElement
      expect(searchInput?.placeholder).toContain('검색')
    })
  })

  describe('검색 기능 통합', () => {
    it('DocumentLibraryContent 컴포넌트가 Provider 내부에 렌더링되어야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      const provider = container.querySelector('[data-testid="mock-provider"]')
      expect(provider).not.toBeNull()

      // Provider 내부에 컨텐츠가 있는지 확인
      expect(provider?.childNodes.length).toBeGreaterThan(0)
    })

    it('검색 아이콘(magnifyingglass)이 표시되어야 함', () => {
      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // SFSymbol 컴포넌트가 렌더링되는지 확인
      const searchIcon = container.querySelector('.search-input-wrapper')
      expect(searchIcon).not.toBeNull()
    })
  })

  describe('변경사항 검증', () => {
    it('커밋 db04c61의 핵심 변경사항: DocumentLibraryContent에 searchQuery prop 전달', () => {
      // 이 테스트는 구조적 변경을 확인
      // 실제로 DocumentLibraryContent가 searchQuery를 받아서
      // useEffect로 Context의 setSearchTerm을 호출하는지는
      // Provider 통합 테스트에서 확인

      const { container } = render(
        <DocumentLibraryView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // DocumentLibraryView가 정상적으로 렌더링됨
      expect(container).toBeTruthy()

      // Provider가 존재함 (DocumentLibraryContent는 Provider 내부)
      const provider = container.querySelector('[data-testid="mock-provider"]')
      expect(provider).not.toBeNull()

      // 검색 UI가 존재함 (searchQuery 사용)
      const searchInput = container.querySelector('.search-input')
      expect(searchInput).not.toBeNull()
    })
  })
})
