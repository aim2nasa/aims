/**
 * DocumentStatusProvider Customer Sorting Tests
 * @since 1.0.0
 *
 * 커밋 45a019e: "연결된 고객" 칼럼 정렬 기능 추가
 *
 * 주요 검증 사항:
 * 1. sortField 타입에 'customer'가 포함됨
 * 2. handleColumnSort가 'customer' 파라미터를 받음
 * 3. customer_asc/customer_desc 정렬 파라미터가 백엔드로 전달됨
 * 4. 정렬 변경 시 fetchDocuments가 재호출됨
 * 5. 정렬 방향 토글이 정상 작동함
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { DocumentStatusProvider } from '../DocumentStatusProvider'
import { useDocumentStatusContext } from '../../contexts/DocumentStatusContext'
import * as DocumentStatusService from '../../services/DocumentStatusService'

// Mock DocumentStatusService
vi.mock('../../services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getRecentDocuments: vi.fn(),
    checkHealth: vi.fn(),
    extractFilename: vi.fn((doc: any) => doc.filename || doc.originalName || ''),
  },
}))

// Mock API response
const createMockApiResponse = () => ({
  data: {
    documents: [
      {
        _id: 'doc-1',
        originalName: '김보성보유계약현황.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        customer_relation: {
          customer_id: 'customer-1',
          customer_name: '김보성',
          relationship_type: 'policy_holder',
          assigned_by: 'tester',
          assigned_at: new Date().toISOString(),
        },
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-2',
        originalName: '신상철계약서.pdf',
        fileSize: 2048000,
        mimeType: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        customer_relation: {
          customer_id: 'customer-2',
          customer_name: '신상철',
          relationship_type: 'policy_holder',
          assigned_by: 'tester',
          assigned_at: new Date().toISOString(),
        },
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
    ],
    total: 2,
    pagination: {
      totalPages: 1,
      totalCount: 2,
      currentPage: 1,
      itemsPerPage: 15,
      page: 1,
      limit: 15,
      total: 2,
    },
  },
})

describe('DocumentStatusProvider - 고객 칼럼 정렬 테스트 (커밋 45a019e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockResolvedValue(
      createMockApiResponse()
    )
    vi.mocked(DocumentStatusService.DocumentStatusService.checkHealth).mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Unit Tests - sortField 타입', () => {
    it('sortField 초기값이 uploadDate이고 sortDirection이 desc여야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(result.current.state.sortField).toBe('uploadDate')
      expect(result.current.state.sortDirection).toBe('desc')
    })

    it('sortField를 "customer"로 설정할 수 있어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      act(() => {
        result.current.actions.setSortField('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
      })
    })

    it('sortDirection을 "desc"로 설정할 수 있어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      act(() => {
        result.current.actions.setSortDirection('desc')
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('desc')
      })
    })
  })

  describe('Unit Tests - handleColumnSort', () => {
    it('handleColumnSort("customer")를 호출하면 sortField가 "customer"로 설정되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
        expect(result.current.state.sortDirection).toBe('asc')
      })
    })

    it('같은 필드를 다시 클릭하면 정렬 방향이 토글되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // First click: set to asc
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
        expect(result.current.state.sortDirection).toBe('asc')
      })

      // Second click: toggle to desc
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
        expect(result.current.state.sortDirection).toBe('desc')
      })
    })

    it('다른 필드로 변경하면 sortDirection이 "asc"로 리셋되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Set customer to desc
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('desc')
      })

      // Change to filename
      act(() => {
        result.current.actions.handleColumnSort('filename')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('filename')
        expect(result.current.state.sortDirection).toBe('asc')
      })
    })

    it('정렬 변경 시 currentPage가 1로 리셋되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Set to page 2
      act(() => {
        result.current.actions.setCurrentPage(2)
      })

      await waitFor(() => {
        expect(result.current.state.currentPage).toBe(2)
      })

      // Change sort
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.currentPage).toBe(1)
      })
    })
  })

  describe('Unit Tests - 정렬 파라미터 생성', () => {
    it('customer_asc 정렬 파라미터가 백엔드로 전달되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Clear previous calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1, // page
          15, // limit
          'customer_asc', // sort
          undefined, // searchQuery
          undefined, // customerLink
          undefined  // fileScope
        )
      })
    })

    it('customer_desc 정렬 파라미터가 백엔드로 전달되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Set to desc
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('desc')
      })

      // Clear previous calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // Trigger refetch
      await act(async () => {
        await result.current.actions.refreshDocuments()
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'customer_desc',
          undefined, // search
          undefined, // customerLink
          undefined  // fileScope
        )
      })
    })
  })

  describe('Regression Tests - 정렬 기능 회귀 방지 (커밋 45a019e)', () => {
    it('[회귀 방지] sortField 타입에 "customer"가 포함되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // TypeScript should allow these - test type safety
      act(() => {
        result.current.actions.setSortField('customer')
      })
      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
      })

      act(() => {
        result.current.actions.setSortField('filename')
      })
      await waitFor(() => {
        expect(result.current.state.sortField).toBe('filename')
      })

      act(() => {
        result.current.actions.setSortField('status')
      })
      await waitFor(() => {
        expect(result.current.state.sortField).toBe('status')
      })

      act(() => {
        result.current.actions.setSortField(null)
      })
      await waitFor(() => {
        expect(result.current.state.sortField).toBeNull()
      })

      // Should not throw
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })
      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
      })
    })

    it('[회귀 방지] 정렬 변경이 fetchDocuments를 트리거해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      }, { timeout: 10000 })

      const initialCallCount = vi.mocked(
        DocumentStatusService.DocumentStatusService.getRecentDocuments
      ).mock.calls.length

      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(
          vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mock.calls.length
        ).toBeGreaterThan(initialCallCount)
      })
    })

    it('[회귀 방지] 검색어와 정렬이 함께 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Set search term
      act(() => {
        result.current.actions.setSearchTerm('김보성')
      })

      // Set sort
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'customer_asc',
          '김보성', // search
          undefined, // customerLink
          undefined  // fileScope
        )
      })
    })

    it('[회귀 방지] 페이지네이션과 정렬이 함께 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Set pagination
      act(() => {
        result.current.actions.setItemsPerPage(20)
        result.current.actions.setCurrentPage(2)
      })

      // Set sort
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        // currentPage should be reset to 1 when sort changes
        expect(result.current.state.currentPage).toBe(1)
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1, // page reset to 1
          20, // limit preserved
          'customer_asc',
          undefined, // search
          undefined, // customerLink
          undefined  // fileScope
        )
      })
    })

    it('[회귀 방지] 정렬 파라미터가 올바른 형식으로 전달되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Test all sort parameters
      const sortTests = [
        { field: 'filename' as const, param: 'filename_asc' },
        { field: 'status' as const, param: 'status_asc' },
        { field: 'uploadDate' as const, param: 'uploadDate_asc' },
        { field: 'fileSize' as const, param: 'fileSize_asc' },
        { field: 'mimeType' as const, param: 'mimeType_asc' },
        { field: 'customer' as const, param: 'customer_asc' },
      ]

      for (const test of sortTests) {
        vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

        act(() => {
          result.current.actions.handleColumnSort(test.field)
        })

        await waitFor(() => {
          expect(
            DocumentStatusService.DocumentStatusService.getRecentDocuments
          ).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            test.param,
            undefined, // search
            undefined, // customerLink
            undefined  // fileScope
          )
        })
      }
    })
  })

  describe('Integration Tests - 전체 시나리오', () => {
    it('정렬 → 페이지 변경 → 정렬 방향 변경 전체 플로우가 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Step 1: Set sort to customer asc
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
        expect(result.current.state.sortDirection).toBe('asc')
        expect(result.current.state.currentPage).toBe(1)
      })

      // Step 2: Change page
      act(() => {
        result.current.actions.setCurrentPage(2)
      })

      await waitFor(() => {
        expect(result.current.state.currentPage).toBe(2)
      })

      // Step 3: Toggle sort direction
      act(() => {
        result.current.actions.handleColumnSort('customer')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('customer')
        expect(result.current.state.sortDirection).toBe('desc')
        expect(result.current.state.currentPage).toBe(1) // Reset to page 1
      })
    })
  })
})
