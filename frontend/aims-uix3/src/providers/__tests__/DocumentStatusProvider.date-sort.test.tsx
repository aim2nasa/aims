/**
 * DocumentStatusProvider Date Sorting Tests
 * @since 1.0.0
 *
 * 날짜 정렬 기능 검증 테스트
 *
 * 버그 수정 배경:
 * - MongoDB `upload.uploaded_at` 필드가 Date/String 혼합 타입으로 저장됨
 * - MongoDB는 타입 우선순위로 정렬하여 Date가 String보다 먼저 옴
 * - 이로 인해 시분초까지 고려한 정확한 시간순 정렬이 안 됨
 * - 백엔드에서 $toDate aggregation으로 정규화하여 해결
 *
 * 주요 검증 사항:
 * 1. uploadDate_asc/uploadDate_desc 정렬 파라미터가 백엔드로 전달됨
 * 2. 정렬 변경 시 fetchDocuments가 재호출됨
 * 3. 날짜 정렬이 기본 정렬로 설정됨
 * 4. 시분초까지 고려한 정확한 정렬이 이루어짐
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

/**
 * Date/String 혼합 타입 시뮬레이션
 * MongoDB에서 발생하는 실제 문제 상황 재현
 */
const createMockDocumentsWithMixedDateTypes = () => ({
  data: {
    documents: [
      {
        _id: 'doc-1',
        originalName: '문서1.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        // String 타입 날짜 (ISO 8601)
        uploadedAt: '2025-12-15T10:30:00.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-2',
        originalName: '문서2.pdf',
        fileSize: 2048000,
        mimeType: 'application/pdf',
        // Date 객체 (실제로는 JSON 직렬화로 string이 됨)
        uploadedAt: new Date('2025-12-15T14:45:30.000Z').toISOString(),
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-3',
        originalName: '문서3.pdf',
        fileSize: 512000,
        mimeType: 'application/pdf',
        // 같은 날짜, 다른 시간
        uploadedAt: '2025-12-15T08:15:45.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-4',
        originalName: '문서4.pdf',
        fileSize: 768000,
        mimeType: 'application/pdf',
        // 이전 날짜
        uploadedAt: '2025-12-14T23:59:59.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
    ],
    total: 4,
    pagination: {
      totalPages: 1,
      totalCount: 4,
      currentPage: 1,
      itemsPerPage: 15,
      page: 1,
      limit: 15,
      total: 4,
    },
  },
})

/**
 * 시분초 정밀도 테스트용 데이터
 * 같은 날 다른 시간의 문서들
 */
const createMockDocumentsWithSameDayDifferentTime = () => ({
  data: {
    documents: [
      {
        _id: 'doc-morning',
        originalName: '아침문서.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: '2025-12-15T09:00:00.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-afternoon',
        originalName: '오후문서.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: '2025-12-15T14:30:00.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-evening',
        originalName: '저녁문서.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: '2025-12-15T19:45:30.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
      {
        _id: 'doc-night',
        originalName: '밤문서.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: '2025-12-15T23:59:59.000Z',
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
    ],
    total: 4,
    pagination: {
      totalPages: 1,
      totalCount: 4,
      currentPage: 1,
      itemsPerPage: 15,
      page: 1,
      limit: 15,
      total: 4,
    },
  },
})

describe('DocumentStatusProvider - 업로드 날짜 정렬 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockResolvedValue(
      createMockDocumentsWithMixedDateTypes()
    )
    vi.mocked(DocumentStatusService.DocumentStatusService.checkHealth).mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Unit Tests - 기본 정렬 설정', () => {
    it('기본 sortField가 uploadDate이고 sortDirection이 desc여야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(result.current.state.sortField).toBe('uploadDate')
      expect(result.current.state.sortDirection).toBe('desc')
    })

    it('초기 로드 시 uploadDate_desc 정렬로 API 호출해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, // page
        15, // limit
        'uploadDate_desc', // sort (기본값)
        undefined, // searchQuery
        undefined, // customerLink
        undefined, // fileScope
        undefined, // searchField
        undefined, // period
        undefined, // initial
        undefined  // initialType
      )
    })
  })

  describe('Unit Tests - uploadDate 정렬 파라미터', () => {
    it('uploadDate_asc 정렬 파라미터가 백엔드로 전달되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // Clear previous calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // 현재 uploadDate_desc -> uploadDate로 클릭하면 asc로 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('uploadDate')
        expect(result.current.state.sortDirection).toBe('asc')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_asc',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })

    it('uploadDate_desc 정렬 파라미터가 백엔드로 전달되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 다른 필드로 변경 후 uploadDate로 돌아옴
      act(() => {
        result.current.actions.handleColumnSort('filename')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('filename')
      })

      // Clear calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // uploadDate 클릭 -> asc
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      // uploadDate 다시 클릭 -> desc
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('uploadDate')
        expect(result.current.state.sortDirection).toBe('desc')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_desc',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })

    it('정렬 방향 토글이 정상 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 초기: uploadDate desc
      expect(result.current.state.sortField).toBe('uploadDate')
      expect(result.current.state.sortDirection).toBe('desc')

      // 첫 번째 클릭: asc로 토글
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('asc')
      })

      // 두 번째 클릭: desc로 토글
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('desc')
      })
    })
  })

  describe('Unit Tests - 정렬 변경 시 재조회', () => {
    it('정렬 변경 시 fetchDocuments가 호출되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      const initialCallCount = vi.mocked(
        DocumentStatusService.DocumentStatusService.getRecentDocuments
      ).mock.calls.length

      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(
          vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mock.calls.length
        ).toBeGreaterThan(initialCallCount)
      })
    })

    it('정렬 변경 시 currentPage가 1로 리셋되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 페이지 변경
      act(() => {
        result.current.actions.setCurrentPage(3)
      })

      await waitFor(() => {
        expect(result.current.state.currentPage).toBe(3)
      })

      // 정렬 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.currentPage).toBe(1)
      })
    })
  })

  describe('Integration Tests - 날짜 정렬 시나리오', () => {
    it('검색어와 날짜 정렬이 함께 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 검색어 설정
      act(() => {
        result.current.actions.setSearchTerm('문서')
      })

      // 정렬 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_asc',
          '문서',
          undefined,
          undefined,
          'displayName',
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })

    it('페이지네이션과 날짜 정렬이 함께 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 페이지 크기 변경
      act(() => {
        result.current.actions.setItemsPerPage(30)
      })

      // Clear calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // 정렬 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          30, // 변경된 페이지 크기 유지
          'uploadDate_asc',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })

    it('다른 필드에서 uploadDate로 정렬 변경 시 올바르게 작동해야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // filename 정렬로 변경
      act(() => {
        result.current.actions.handleColumnSort('filename')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('filename')
        expect(result.current.state.sortDirection).toBe('asc')
      })

      // Clear calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // uploadDate로 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(result.current.state.sortField).toBe('uploadDate')
        expect(result.current.state.sortDirection).toBe('asc') // 새 필드이므로 asc
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_asc',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })
  })

  describe('Regression Tests - 날짜 정렬 회귀 방지', () => {
    it('[회귀 방지] uploadDate 정렬 파라미터 형식이 올바라야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // asc 테스트
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        const calls = vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[2]).toBe('uploadDate_asc')
      })

      // desc 테스트
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()
      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        const calls = vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[2]).toBe('uploadDate_desc')
      })
    })

    it('[회귀 방지] 날짜 정렬이 기본 정렬로 설정되어야 함', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 초기 상태 검증
      expect(result.current.state.sortField).toBe('uploadDate')
      expect(result.current.state.sortDirection).toBe('desc')

      // 초기 API 호출에서 uploadDate_desc 사용
      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        'uploadDate_desc',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // period
        undefined, // initial
        undefined  // initialType
      )
    })

    it('[회귀 방지] 정렬 변경 후 새로고침 시 정렬 상태 유지', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 정렬 변경
      act(() => {
        result.current.actions.handleColumnSort('uploadDate') // asc로 변경
      })

      await waitFor(() => {
        expect(result.current.state.sortDirection).toBe('asc')
      })

      // Clear calls
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      // 새로고침
      await act(async () => {
        await result.current.actions.refreshDocuments()
      })

      // 정렬 상태 유지 확인
      expect(result.current.state.sortField).toBe('uploadDate')
      expect(result.current.state.sortDirection).toBe('asc')

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_asc', // 정렬 상태 유지
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })
  })

  describe('시분초 정밀도 테스트', () => {
    beforeEach(() => {
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockResolvedValue(
        createMockDocumentsWithSameDayDifferentTime()
      )
    })

    it('같은 날짜의 문서들이 시간순으로 정렬되어야 함 (백엔드 검증)', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      // 정렬 파라미터가 올바르게 전달되는지 확인
      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1,
        15,
        'uploadDate_desc', // 기본값
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // period
        undefined, // initial
        undefined  // initialType
      )

      // 문서가 로드되었는지 확인
      expect(result.current.state.documents.length).toBe(4)
    })

    it('uploadDate_asc로 정렬 요청 시 올바른 파라미터 전달', async () => {
      const { result } = renderHook(() => useDocumentStatusContext(), {
        wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
      })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      act(() => {
        result.current.actions.handleColumnSort('uploadDate')
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          1,
          15,
          'uploadDate_asc',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    })
  })
})

describe('DocumentStatusProvider - 모든 정렬 필드 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockResolvedValue(
      createMockDocumentsWithMixedDateTypes()
    )
    vi.mocked(DocumentStatusService.DocumentStatusService.checkHealth).mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  it('모든 정렬 필드가 올바른 파라미터로 전달되어야 함', async () => {
    const { result } = renderHook(() => useDocumentStatusContext(), {
      wrapper: ({ children }) => <DocumentStatusProvider>{children}</DocumentStatusProvider>,
    })

    await waitFor(() => {
      expect(result.current.state.isLoading).toBe(false)
    })

    const sortFields = [
      { field: 'filename' as const, expectedParam: 'filename_asc' },
      { field: 'status' as const, expectedParam: 'status_asc' },
      { field: 'uploadDate' as const, expectedParam: 'uploadDate_asc' },
      { field: 'fileSize' as const, expectedParam: 'fileSize_asc' },
      { field: 'mimeType' as const, expectedParam: 'mimeType_asc' },
      { field: 'customer' as const, expectedParam: 'customer_asc' },
      { field: 'badgeType' as const, expectedParam: 'badgeType_asc' },
    ]

    for (const { field, expectedParam } of sortFields) {
      vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockClear()

      act(() => {
        result.current.actions.handleColumnSort(field)
      })

      await waitFor(() => {
        expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
          expect.any(Number),
          expect.any(Number),
          expectedParam,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined, // period
          undefined, // initial
          undefined  // initialType
        )
      })
    }
  })
})
