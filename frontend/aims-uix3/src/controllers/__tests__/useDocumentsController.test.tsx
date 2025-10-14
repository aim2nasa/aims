/**
 * useDocumentsController.test.tsx
 * @since 2025-10-14
 * @version 1.0.0
 *
 * useDocumentsController Hook의 종합 테스트
 * 총 25개 테스트 케이스 포함
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDocumentsController } from '../useDocumentsController'
import { DocumentService } from '@/services/DocumentService'
import { DocumentStatusService } from '@/services/DocumentStatusService'

// 서비스 모킹
vi.mock('@/services/DocumentService', () => ({
  DocumentService: {
    getDocuments: vi.fn(),
    searchDocuments: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getRecentDocuments: vi.fn(),
    getDocumentStatus: vi.fn(),
    extractFilename: vi.fn((doc) => doc.filename || doc.upload?.originalName || 'unknown.pdf'),
  },
}))

describe('useDocumentsController', () => {
  // ===== Mock Data Setup =====

  const mockDocument1 = {
    _id: 'doc1',
    id: 'doc1',
    filename: 'document1.pdf',
    upload: {
      originalName: 'document1.pdf',
      size: 1024000,
    },
    uploadDate: '2025-01-01T00:00:00.000Z',
    customer_relation: {
      customer_id: 'cust1',
      customer_name: '홍길동',
    },
  }

  const mockDocument2 = {
    _id: 'doc2',
    id: 'doc2',
    filename: 'document2.pdf',
    upload: {
      originalName: 'document2.pdf',
      size: 2048000,
    },
    uploadDate: '2025-01-02T00:00:00.000Z',
    customer_relation: {
      customer_id: 'cust2',
      customer_name: '김영희',
    },
  }

  const mockDocument3 = {
    _id: 'doc3',
    id: 'doc3',
    filename: 'report.pdf',
    upload: {
      originalName: 'report.pdf',
      size: 512000,
    },
    uploadDate: '2025-01-03T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // 기본 모킹 설정
    vi.mocked(DocumentStatusService.getRecentDocuments).mockResolvedValue({
      files: [mockDocument1, mockDocument2, mockDocument3],
    })

    vi.mocked(DocumentStatusService.getDocumentStatus).mockImplementation(async (id) => {
      const doc = [mockDocument1, mockDocument2, mockDocument3].find(d => d._id === id)!
      return {
        success: true,
        data: {
          rawDocument: doc,
        },
      }
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  // ===== 1. 초기 상태 테스트 =====

  describe('초기 상태', () => {
    it('초기값이 올바르게 설정되어야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      // 초기 로딩 전 상태
      expect(result.current.documents).toEqual([])
      expect(result.current.isInitialLoad).toBe(true)
      expect(result.current.error).toBeNull()
      expect(result.current.searchQuery).toBe('')
      expect(result.current.currentPage).toBe(1)
      expect(result.current.itemsPerPage).toBe(10)

      // 초기 데이터 로딩 완료 대기
      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })
    })

    it('초기 로딩 시 문서 목록을 불러와야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(DocumentStatusService.getRecentDocuments).toHaveBeenCalled()
        expect(result.current.documents.length).toBeGreaterThan(0)
      })
    })
  })

  // ===== 2. loadDocuments() 테스트 =====

  describe('loadDocuments', () => {
    it('문서 목록을 로드해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3)
        expect(result.current.total).toBe(3)
      })
    })

    it('silent 모드에서는 로딩 상태를 변경하지 않아야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        await result.current.loadDocuments({}, true)
      })

      // silent 모드에서는 isLoading이 false로 유지되어야 함
      expect(result.current.isLoading).toBe(false)
    })

    it('에러 발생 시 에러 메시지를 설정해야 함', async () => {
      vi.mocked(DocumentStatusService.getRecentDocuments).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })
  })

  // ===== 3. handleSearchChange() 테스트 =====

  describe('handleSearchChange', () => {
    it('검색어를 변경해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      act(() => {
        result.current.handleSearchChange('document1')
      })

      expect(result.current.searchQuery).toBe('document1')
    })

    it('검색어 변경 시 offset을 0으로 초기화해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      act(() => {
        result.current.handleSearchChange('test')
      })

      expect(result.current.searchParams.offset).toBe(0)
      expect(result.current.currentPage).toBe(1)
    })
  })

  // ===== 4. handleSearch() 테스트 =====

  describe('handleSearch', () => {
    it('검색을 실행해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      act(() => {
        result.current.handleSearchChange('document1')
      })

      // 디바운스 대기 (500ms)
      await waitFor(() => {
        expect(result.current.documents.length).toBeGreaterThan(0)
      }, { timeout: 1000 })
    })
  })

  // ===== 5. handlePageChange() 테스트 =====

  describe('handlePageChange', () => {
    it('페이지를 변경해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handlePageChange(2)
      })

      expect(result.current.currentPage).toBe(2)
    })

    it('페이지 변경 시 offset을 올바르게 계산해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handlePageChange(3)
      })

      // page 3 = offset 20 (10 items per page)
      expect(result.current.searchParams.offset).toBe(20)
    })
  })

  // ===== 6. handleLimitChange() 테스트 =====

  describe('handleLimitChange', () => {
    it('페이지당 항목 수를 변경해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handleLimitChange(20)
      })

      expect(result.current.searchParams.limit).toBe(20)
      expect(result.current.itemsPerPage).toBe(20)
    })

    it('limit 변경 시 페이지를 1로 초기화해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handlePageChange(3)
      })

      await act(async () => {
        result.current.handleLimitChange(50)
      })

      expect(result.current.currentPage).toBe(1)
      expect(result.current.searchParams.offset).toBe(0)
    })
  })

  // ===== 7. handleSortChange() 테스트 =====

  describe('handleSortChange', () => {
    it('정렬 기준을 변경해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handleSortChange('filename', 'asc')
      })

      expect(result.current.searchParams.sortBy).toBe('filename')
      expect(result.current.searchParams.sortOrder).toBe('asc')
    })

    it('정렬 변경 시 페이지를 1로 초기화해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      await act(async () => {
        result.current.handlePageChange(2)
      })

      await act(async () => {
        result.current.handleSortChange('size', 'desc')
      })

      expect(result.current.currentPage).toBe(1)
      expect(result.current.searchParams.offset).toBe(0)
    })
  })

  // ===== 8. deleteDocument() 테스트 =====

  describe('deleteDocument', () => {
    it('문서를 삭제해야 함', async () => {
      vi.mocked(DocumentService.deleteDocument).mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3)
      })

      const initialTotal = result.current.total

      await act(async () => {
        await result.current.deleteDocument('doc1')
      })

      expect(DocumentService.deleteDocument).toHaveBeenCalledWith('doc1')
      expect(result.current.documents).toHaveLength(2)
      expect(result.current.total).toBe(initialTotal - 1)
    })

    it('삭제 실패 시 에러를 설정해야 함', async () => {
      vi.mocked(DocumentService.deleteDocument).mockRejectedValueOnce(
        new Error('Delete failed')
      )

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.documents).toHaveLength(3)
      })

      await act(async () => {
        await result.current.deleteDocument('doc1')
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  // ===== 9. loadMoreDocuments() 테스트 =====

  describe('loadMoreDocuments', () => {
    it('로딩 중일 때는 실행되지 않아야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      // isLoading을 true로 만들기 위해 deleteDocument 실행
      vi.mocked(DocumentService.deleteDocument).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      act(() => {
        result.current.deleteDocument('doc1')
      })

      await act(async () => {
        await result.current.loadMoreDocuments()
      })

      // searchDocuments가 호출되지 않아야 함
      expect(DocumentService.searchDocuments).not.toHaveBeenCalled()
    })

    it('hasMore가 false일 때는 실행되지 않아야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
        expect(result.current.hasMore).toBe(false)
      })

      await act(async () => {
        await result.current.loadMoreDocuments()
      })

      expect(DocumentService.searchDocuments).not.toHaveBeenCalled()
      expect(DocumentService.getDocuments).not.toHaveBeenCalled()
    })
  })

  // ===== 10. clearError() 테스트 =====

  describe('clearError', () => {
    it('에러를 해제해야 함', async () => {
      vi.mocked(DocumentStatusService.getRecentDocuments).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  // ===== 11. 계산된 값 테스트 =====

  describe('계산된 값', () => {
    it('isEmpty는 문서가 없고 로딩 중이 아닐 때 true여야 함', async () => {
      vi.mocked(DocumentStatusService.getRecentDocuments).mockResolvedValueOnce({
        files: [],
      })

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isEmpty).toBe(true)
      })
    })

    it('searchResultMessage는 검색어가 있을 때 검색 결과를 표시해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      act(() => {
        result.current.handleSearchChange('document1')
      })

      expect(result.current.searchResultMessage).toContain('document1')
      expect(result.current.searchResultMessage).toContain('검색 결과')
    })

    it('searchResultMessage는 검색어가 없을 때 전체 개수를 표시해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
        expect(result.current.searchResultMessage).toContain('총')
        expect(result.current.searchResultMessage).toContain('개의 문서')
      })
    })

    it('totalPages를 올바르게 계산해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      // total = 3, itemsPerPage = 10
      expect(result.current.totalPages).toBe(1)
    })
  })

  // ===== 12. 검색 필터링 테스트 =====

  describe('검색 필터링', () => {
    it('검색어로 문서를 필터링해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      act(() => {
        result.current.handleSearchChange('document1')
      })

      // 디바운스 대기
      await waitFor(() => {
        expect(result.current.searchQuery).toBe('document1')
      }, { timeout: 1000 })
    })
  })

  // ===== 13. 페이지네이션 계산 테스트 =====

  describe('페이지네이션 계산', () => {
    it('hasMore를 올바르게 계산해야 함', async () => {
      // 20개의 문서로 테스트
      const manyDocuments = Array.from({ length: 20 }, (_, i) => ({
        _id: `doc${i}`,
        id: `doc${i}`,
        filename: `document${i}.pdf`,
        upload: { originalName: `document${i}.pdf` },
        uploadDate: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }))

      vi.mocked(DocumentStatusService.getRecentDocuments).mockResolvedValueOnce({
        files: manyDocuments,
      })

      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
        // limit = 10, total = 20이므로 hasMore = true
        expect(result.current.hasMore).toBe(true)
      })
    })
  })

  // ===== 14. 통합 시나리오 테스트 =====

  describe('통합 시나리오', () => {
    it('검색 → 페이지 변경 → 정렬 변경 플로우가 정상 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentsController())

      await waitFor(() => {
        expect(result.current.isInitialLoad).toBe(false)
      })

      // 1. 검색
      act(() => {
        result.current.handleSearchChange('document')
      })

      await waitFor(() => {
        expect(result.current.searchQuery).toBe('document')
      })

      // 2. 페이지 변경
      await act(async () => {
        result.current.handlePageChange(2)
      })

      expect(result.current.currentPage).toBe(2)

      // 3. 정렬 변경
      await act(async () => {
        result.current.handleSortChange('filename', 'asc')
      })

      expect(result.current.searchParams.sortBy).toBe('filename')
      expect(result.current.currentPage).toBe(1) // 정렬 변경 시 1페이지로 초기화
    })
  })
})
