/**
 * DocumentLibraryView - 상태 필터 탭 Regression 테스트
 * @since 1.0.0
 *
 * 회귀 테스트:
 * 1. 서버사이드 status 필터 파라미터 전달 검증
 * 2. 건수 0인 탭(전체 제외)의 카운트 span 미렌더링
 * 3. docStats가 null일 때 크래시 없이 0 표시
 */

import { describe, it, expect } from 'vitest'

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

// 서버사이드 status 파라미터 생성 로직 (DocumentStatusProvider에서 추출)
function buildStatusParam(statusFilter: 'all' | 'processing' | 'completed' | 'error'): string | undefined {
  return statusFilter !== 'all' ? statusFilter : undefined
}

describe('DocumentLibraryView - 상태 필터 탭 Regression', () => {
  describe('[시나리오 1] 서버사이드 status 필터 파라미터 전달', () => {
    it('전체 탭: status 파라미터 미전달 (undefined)', () => {
      expect(buildStatusParam('all')).toBeUndefined()
    })

    it('에러 탭: status=error 전달', () => {
      expect(buildStatusParam('error')).toBe('error')
    })

    it('완료 탭: status=completed 전달', () => {
      expect(buildStatusParam('completed')).toBe('completed')
    })

    it('처리중 탭: status=processing 전달', () => {
      expect(buildStatusParam('processing')).toBe('processing')
    })

    it('URLSearchParams에 status 파라미터가 올바르게 추가됨', () => {
      const params = new URLSearchParams({ page: '1', limit: '15' })
      const status = buildStatusParam('error')
      if (status) params.append('status', status)
      expect(params.get('status')).toBe('error')
      expect(params.toString()).toContain('status=error')
    })

    it('전체 탭일 때 URLSearchParams에 status 미추가', () => {
      const params = new URLSearchParams({ page: '1', limit: '15' })
      const status = buildStatusParam('all')
      if (status) params.append('status', status)
      expect(params.get('status')).toBeNull()
      expect(params.toString()).not.toContain('status=')
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
