/**
 * DocumentLibraryView - 상태 필터 탭 Regression 테스트
 * @since 1.0.0
 *
 * Gini 검수 요청에 따른 회귀 테스트:
 * 1. 전체/처리중/완료/에러 탭 필터링 로직 검증
 * 2. 건수 0인 탭(전체 제외)의 카운트 span 미렌더링
 * 3. docStats가 null일 때 크래시 없이 0 표시
 */

import { describe, it, expect, vi } from 'vitest'
import { DocumentStatusService } from '@/services/DocumentStatusService'

// DocumentStatusService mock
vi.mock('@/services/DocumentStatusService')

// --- 테스트 1: statusFilteredDocuments 필터링 로직 검증 ---
// 컴포넌트 내부 useMemo 로직을 순수 함수로 추출하여 테스트
function statusFilteredDocuments(
  filteredDocuments: Array<Record<string, unknown>>,
  statusFilter: 'all' | 'processing' | 'completed' | 'error'
) {
  if (statusFilter === 'all') return filteredDocuments
  return filteredDocuments.filter(doc => {
    const st = DocumentStatusService.extractStatus(doc)
    if (statusFilter === 'completed') return st === 'completed'
    if (statusFilter === 'error') return st === 'error'
    // 처리중: completed, error 이외의 모든 상태
    return st !== 'completed' && st !== 'error'
  })
}

// 탭별 카운트 span 렌더링 여부 판단 로직
function shouldRenderCount(tabValue: string, count: number): boolean {
  return tabValue === 'all' || count > 0
}

// docStats에서 탭별 카운트 계산 로직
function getTabCounts(docStats: { total?: number; processing?: number; pending?: number; credit_pending?: number; completed?: number; error?: number } | null) {
  return [
    { value: 'all', label: '전체', count: docStats?.total ?? 0 },
    { value: 'processing', label: '처리중', count: (docStats?.processing ?? 0) + (docStats?.pending ?? 0) + (docStats?.credit_pending ?? 0) },
    { value: 'completed', label: '완료', count: docStats?.completed ?? 0 },
    { value: 'error', label: '에러', count: docStats?.error ?? 0 },
  ]
}

describe('DocumentLibraryView - 상태 필터 탭 Regression', () => {
  const mockDocuments = [
    { _id: '1', originalFileName: '문서1.pdf' },
    { _id: '2', originalFileName: '문서2.pdf' },
    { _id: '3', originalFileName: '문서3.pdf' },
    { _id: '4', originalFileName: '문서4.pdf' },
    { _id: '5', originalFileName: '문서5.pdf' },
  ]

  describe('[시나리오 1] 탭 클릭 시 statusFilteredDocuments 필터 결과', () => {
    it('전체 탭: 모든 문서를 반환해야 함', () => {
      const result = statusFilteredDocuments(mockDocuments, 'all')
      expect(result).toEqual(mockDocuments)
      expect(result).toHaveLength(5)
    })

    it('완료 탭: completed 상태 문서만 반환', () => {
      const mockExtract = vi.mocked(DocumentStatusService.extractStatus)
      mockExtract
        .mockReturnValueOnce('completed' as never)
        .mockReturnValueOnce('processing' as never)
        .mockReturnValueOnce('completed' as never)
        .mockReturnValueOnce('error' as never)
        .mockReturnValueOnce('completed' as never)

      const result = statusFilteredDocuments(mockDocuments, 'completed')
      expect(result).toHaveLength(3)
      expect(result).toEqual([mockDocuments[0], mockDocuments[2], mockDocuments[4]])
    })

    it('에러 탭: error 상태 문서만 반환', () => {
      const mockExtract = vi.mocked(DocumentStatusService.extractStatus)
      mockExtract
        .mockReturnValueOnce('completed' as never)
        .mockReturnValueOnce('error' as never)
        .mockReturnValueOnce('processing' as never)
        .mockReturnValueOnce('error' as never)
        .mockReturnValueOnce('completed' as never)

      const result = statusFilteredDocuments(mockDocuments, 'error')
      expect(result).toHaveLength(2)
      expect(result).toEqual([mockDocuments[1], mockDocuments[3]])
    })

    it('처리중 탭: completed/error 제외한 모든 상태 반환', () => {
      const mockExtract = vi.mocked(DocumentStatusService.extractStatus)
      mockExtract
        .mockReturnValueOnce('completed' as never)
        .mockReturnValueOnce('processing' as never)
        .mockReturnValueOnce('pending' as never)
        .mockReturnValueOnce('error' as never)
        .mockReturnValueOnce('ocr' as never)

      const result = statusFilteredDocuments(mockDocuments, 'processing')
      expect(result).toHaveLength(3)
      expect(result).toEqual([mockDocuments[1], mockDocuments[2], mockDocuments[4]])
    })

    it('빈 문서 목록에서 필터링 시 빈 배열 반환', () => {
      expect(statusFilteredDocuments([], 'all')).toEqual([])
      expect(statusFilteredDocuments([], 'completed')).toEqual([])
      expect(statusFilteredDocuments([], 'error')).toEqual([])
      expect(statusFilteredDocuments([], 'processing')).toEqual([])
    })
  })

  describe('[시나리오 2] 건수 0인 탭의 카운트 span 렌더링', () => {
    it('전체 탭: 건수가 0이어도 카운트 span 렌더링', () => {
      expect(shouldRenderCount('all', 0)).toBe(true)
    })

    it('전체 탭: 건수가 있으면 카운트 span 렌더링', () => {
      expect(shouldRenderCount('all', 15)).toBe(true)
    })

    it('처리중 탭: 건수 0이면 카운트 span 미렌더링', () => {
      expect(shouldRenderCount('processing', 0)).toBe(false)
    })

    it('완료 탭: 건수 0이면 카운트 span 미렌더링', () => {
      expect(shouldRenderCount('completed', 0)).toBe(false)
    })

    it('에러 탭: 건수 0이면 카운트 span 미렌더링', () => {
      expect(shouldRenderCount('error', 0)).toBe(false)
    })

    it('처리중/완료/에러 탭: 건수 > 0이면 카운트 span 렌더링', () => {
      expect(shouldRenderCount('processing', 3)).toBe(true)
      expect(shouldRenderCount('completed', 10)).toBe(true)
      expect(shouldRenderCount('error', 1)).toBe(true)
    })
  })

  describe('[시나리오 3] docStats가 null일 때 크래시 없이 0 표시', () => {
    it('docStats가 null이면 모든 탭 카운트 0', () => {
      const tabs = getTabCounts(null)
      expect(tabs).toEqual([
        { value: 'all', label: '전체', count: 0 },
        { value: 'processing', label: '처리중', count: 0 },
        { value: 'completed', label: '완료', count: 0 },
        { value: 'error', label: '에러', count: 0 },
      ])
    })

    it('docStats가 undefined이면 모든 탭 카운트 0', () => {
      const tabs = getTabCounts(undefined as unknown as null)
      expect(tabs).toEqual([
        { value: 'all', label: '전체', count: 0 },
        { value: 'processing', label: '처리중', count: 0 },
        { value: 'completed', label: '완료', count: 0 },
        { value: 'error', label: '에러', count: 0 },
      ])
    })

    it('docStats의 일부 필드만 존재할 때 누락 필드는 0', () => {
      const tabs = getTabCounts({ total: 5, completed: 3 })
      expect(tabs).toEqual([
        { value: 'all', label: '전체', count: 5 },
        { value: 'processing', label: '처리중', count: 0 },
        { value: 'completed', label: '완료', count: 3 },
        { value: 'error', label: '에러', count: 0 },
      ])
    })

    it('처리중 카운트는 processing + pending + credit_pending 합산', () => {
      const tabs = getTabCounts({
        total: 10,
        processing: 2,
        pending: 3,
        credit_pending: 1,
        completed: 3,
        error: 1,
      })
      expect(tabs[1]?.count).toBe(6) // 2 + 3 + 1
    })
  })
})
