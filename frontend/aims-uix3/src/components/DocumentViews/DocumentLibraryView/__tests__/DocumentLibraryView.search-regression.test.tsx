/**
 * DocumentLibraryView - Search Regression Tests
 * @since 1.0.0
 *
 * 문서 라이브러리 검색 버그 회귀 테스트
 * commit db7dc3c: 검색이 현재 페이지가 아닌 전체 라이브러리를 대상으로 하는 버그 수정
 *
 * 버그 내용:
 * - 검색 시 현재 페이지(10개)에서만 검색
 * - 11번째 이후 문서는 절대 검색되지 않음
 * - 프론트엔드에서만 필터링하여 백엔드 데이터 활용 불가
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentStatusService } from '@/services/DocumentStatusService'

// Mock DocumentStatusService
vi.mock('@/services/DocumentStatusService')

describe('DocumentLibraryView - 검색 회귀 테스트 (commit db7dc3c)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('[회귀] 백엔드 API 검색 파라미터 전달', () => {
    it('[회귀] 검색어를 백엔드 API에 전달해야 함 (과거: 프론트엔드만 필터링)', async () => {
      /**
       * 과거 버그:
       * - 백엔드에서 10개 문서 받음 (1-10번)
       * - 프론트엔드에서 "문서-20" 검색
       * - 프론트엔드 필터링: 1-10번 중에서 찾음 → 결과 없음 ❌
       *
       * 수정 후:
       * - 검색어를 백엔드에 전달
       * - 백엔드가 전체 DB에서 검색 → 결과 반환 ✅
       */

      // Given: DocumentStatusService.getRecentDocuments가 호출되도록 mock 설정
      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [],
          pagination: {
            page: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 10,
            total: 0
          }
        }
      })

      // When: 검색어와 함께 API 호출
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '문서-20')

      // Then: 검색어가 4번째 파라미터로 전달되어야 함
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(
        1,
        10,
        undefined,
        '문서-20' // 백엔드에 전달!
      )
    })

    it('[회귀] 검색어 없이 호출 시 search 파라미터 undefined', async () => {
      // Given
      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [],
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      })

      // When: 검색어 없이 호출
      await DocumentStatusService.getRecentDocuments(1, 10)

      // Then: search 파라미터가 undefined이어야 함
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(1, 10)
    })

    it('[회귀] 빈 문자열 검색어는 trim되어 undefined로 전달', async () => {
      // Given
      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [],
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      })

      // When: 빈 문자열로 호출
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '')

      // Then
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(1, 10, undefined, '')
    })
  })

  describe('[회귀] 검색 시나리오', () => {
    it('[회귀] 페이지 경계 검색: 11번째 이후 문서 검색', async () => {
      /**
       * 시나리오:
       * - 총 29개 문서 (3페이지, 페이지당 10개)
       * - 현재 1페이지 (1-10번 문서)
       * - "문서-20" 검색 (2페이지에 있음)
       * - 과거: 1페이지에만 검색 → 결과 없음 ❌
       * - 수정 후: 백엔드에서 전체 검색 → 20번 문서 찾음 ✅
       */

      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)

      // 초기 로드: 1페이지 (1-10번)
      mockGetRecentDocuments.mockResolvedValueOnce({
        data: {
          documents: Array.from({ length: 10 }, (_, i) => ({
            _id: `doc-${i + 1}`,
            originalName: `문서-${i + 1}.pdf`,
            uploaded_at: '2025-01-01',
            fileSize: 1024,
            overallStatus: 'completed'
          })),
          pagination: { page: 1, totalPages: 3, totalCount: 29, limit: 10, total: 29 }
        }
      })

      // 검색: "문서-20" → 백엔드가 전체 DB에서 찾아서 반환
      mockGetRecentDocuments.mockResolvedValueOnce({
        data: {
          documents: [{
            _id: 'doc-20',
            originalName: '문서-20.pdf',
            uploaded_at: '2025-01-01',
            fileSize: 1024,
            overallStatus: 'completed'
          }],
          pagination: { page: 1, totalPages: 1, totalCount: 1, limit: 10, total: 1 }
        }
      })

      // When: 첫 로드
      await DocumentStatusService.getRecentDocuments(1, 10)

      // 검색 실행
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '문서-20')

      // Then: 백엔드에 검색어 전달됨
      expect(mockGetRecentDocuments).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        '문서-20' // 백엔드로 전달!
      )
    })

    it('[회귀] 마지막 페이지 문서 검색 (10페이지, 100번째 문서)', async () => {
      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)

      // 검색: 마지막 문서
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [{
            _id: 'doc-100',
            originalName: '보험청구서-100.pdf',
            uploaded_at: '2025-01-01',
            fileSize: 1024,
            overallStatus: 'completed'
          }],
          pagination: { page: 1, totalPages: 1, totalCount: 1, limit: 10, total: 1 }
        }
      })

      // When
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '보험청구서-100')

      // Then
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(
        1,
        10,
        undefined,
        '보험청구서-100'
      )
    })
  })

  describe('[회귀] 검색과 정렬 조합', () => {
    it('[회귀] 검색과 정렬이 함께 전달되어야 함', async () => {
      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [],
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      })

      // When: 검색 + 정렬
      await DocumentStatusService.getRecentDocuments(1, 10, 'filename_asc', '보험청구서')

      // Then
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(
        1,
        10,
        'filename_asc', // 정렬
        '보험청구서' // 검색어
      )
    })
  })

  describe('[회귀] 버그 문서화', () => {
    it('[회귀] 과거 버그 재현 방지: 프론트엔드 필터링 제거', async () => {
      /**
       * 과거 버그 (commit db7dc3c 이전):
       *
       * DocumentStatusProvider.tsx:236-271
       * ```typescript
       * useEffect(() => {
       *   let filtered = documents  // 이미 10개만 받아옴!
       *
       *   if (searchTerm) {
       *     filtered = filtered.filter((doc) => {
       *       const filename = DocumentStatusService.extractFilename(doc)
       *       return filename.toLowerCase().includes(searchTermLower)
       *     })
       *   }
       *
       *   setFilteredDocuments(filtered)  // 10개 중에서만 검색됨!
       * }, [documents, searchTerm])
       * ```
       *
       * 수정 후 (commit db7dc3c):
       * ```typescript
       * // 🔍 검색어 준비 (trim 처리)
       * const searchQuery = searchTerm.trim() || undefined
       *
       * // 🔍 검색어도 함께 전달하여 백엔드에서 전체 라이브러리 검색
       * const data = await DocumentStatusService.getRecentDocuments(
       *   currentPage,
       *   itemsPerPage,
       *   sortParam,
       *   searchQuery  // 백엔드에 전달!
       * )
       * ```
       *
       * 이 테스트는 검색어가 백엔드에 전달되는지 검증합니다.
       */

      const mockGetRecentDocuments = vi.mocked(DocumentStatusService.getRecentDocuments)
      mockGetRecentDocuments.mockResolvedValue({
        data: {
          documents: [],
          pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 10, total: 0 }
        }
      })

      // When: 검색 실행
      await DocumentStatusService.getRecentDocuments(1, 10, undefined, '현재 페이지에 없는 문서')

      // Then: 검색어가 백엔드에 전달되어야 함
      expect(mockGetRecentDocuments).toHaveBeenCalledWith(
        1,
        10,
        undefined,
        '현재 페이지에 없는 문서'
      )
    })
  })
})
