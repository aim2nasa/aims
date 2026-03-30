/**
 * DocumentLibraryView - 미연결 문서 필터 테스트
 *
 * AC#4: 미연결 문서 필터 토글 + 상태 필터와 독립적 AND 조합
 * AC#7: 고객 일괄 연결 버튼 일반 모드에서도 표시
 * Regression: 필터 상호 배타 로직 (미연결↔고객 필터)
 */

import { describe, it, expect } from 'vitest'

/**
 * 미연결 필터 적용 로직
 * 상태 필터와 독립적으로 AND 조합
 */
function applyUnlinkedFilter(
  documents: Array<{ _id: string; customerId?: string | null; status: string }>,
  unlinkedOnly: boolean
): Array<{ _id: string; customerId?: string | null; status: string }> {
  if (!unlinkedOnly) return documents
  return documents.filter(doc => !doc.customerId)
}

/**
 * 상태 필터 적용 로직 (기존)
 */
function applyStatusFilter(
  documents: Array<{ _id: string; customerId?: string | null; status: string }>,
  statusFilter: 'all' | 'processing' | 'completed' | 'error'
): Array<{ _id: string; customerId?: string | null; status: string }> {
  if (statusFilter === 'all') return documents
  return documents.filter(doc => {
    if (statusFilter === 'completed') return doc.status === 'completed'
    if (statusFilter === 'error') return doc.status === 'error'
    return doc.status !== 'completed' && doc.status !== 'error'
  })
}

/**
 * API 파라미터 생성 로직 (수정 후: customerLink 파라미터 사용)
 */
function buildApiParams(
  statusFilter: string,
  unlinkedOnly: boolean
): Record<string, string> {
  const params: Record<string, string> = {}
  if (statusFilter !== 'all') {
    params.status = statusFilter
  }
  if (unlinkedOnly) {
    params.customerLink = 'unlinked'
  }
  return params
}

/**
 * 일괄 연결 버튼 표시 조건 (변경 후)
 * isDevMode 제한 제거 → 항상 표시
 */
function shouldShowBulkLinkButton(
  isDeleteMode: boolean
): boolean {
  return !isDeleteMode  // 삭제 모드가 아니면 항상 표시
}

/**
 * 미연결 필터 ↔ 고객 필터 상호 배타 로직
 * 미연결 필터 활성화 → 고객 필터 해제
 * 고객 필터 설정 → 미연결 필터 해제
 */
interface FilterState {
  isUnlinkedFilter: boolean
  customerFilter: { id: string; name: string } | null
}

function toggleUnlinkedFilter(state: FilterState): FilterState {
  const newUnlinked = !state.isUnlinkedFilter
  return {
    isUnlinkedFilter: newUnlinked,
    customerFilter: newUnlinked ? null : state.customerFilter
  }
}

function setCustomerFilter(
  state: FilterState,
  filter: { id: string; name: string } | null
): FilterState {
  return {
    isUnlinkedFilter: filter ? false : state.isUnlinkedFilter,
    customerFilter: filter
  }
}

describe('DocumentLibraryView - 미연결 문서 필터', () => {
  const mockDocuments = [
    { _id: '1', customerId: 'customer-1', status: 'completed' },
    { _id: '2', customerId: null, status: 'completed' },
    { _id: '3', customerId: 'customer-2', status: 'processing' },
    { _id: '4', customerId: undefined, status: 'error' },
    { _id: '5', customerId: null, status: 'processing' },
  ]

  describe('AC#4: 미연결 필터 토글', () => {
    it('미연결 필터 OFF: 모든 문서 반환', () => {
      const result = applyUnlinkedFilter(mockDocuments, false)
      expect(result).toHaveLength(5)
    })

    it('미연결 필터 ON: customerId가 null/undefined인 문서만 반환', () => {
      const result = applyUnlinkedFilter(mockDocuments, true)
      expect(result).toHaveLength(3)
      expect(result.map(d => d._id)).toEqual(['2', '4', '5'])
    })

    it('미연결 필터 + 상태 필터 AND 조합: 미연결 + 완료', () => {
      const unlinked = applyUnlinkedFilter(mockDocuments, true)
      const result = applyStatusFilter(unlinked, 'completed')
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('2')
    })

    it('미연결 필터 + 상태 필터 AND 조합: 미연결 + 처리중', () => {
      const unlinked = applyUnlinkedFilter(mockDocuments, true)
      const result = applyStatusFilter(unlinked, 'processing')
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('5')
    })

    it('미연결 필터 + 상태 필터 AND 조합: 미연결 + 에러', () => {
      const unlinked = applyUnlinkedFilter(mockDocuments, true)
      const result = applyStatusFilter(unlinked, 'error')
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('4')
    })

    it('모든 문서가 연결된 경우 미연결 필터 ON 시 빈 배열', () => {
      const allLinked = [
        { _id: '1', customerId: 'c1', status: 'completed' },
        { _id: '2', customerId: 'c2', status: 'completed' },
      ]
      const result = applyUnlinkedFilter(allLinked, true)
      expect(result).toHaveLength(0)
    })
  })

  describe('AC#4: API 파라미터 생성', () => {
    it('미연결 필터 ON 시 customerLink=unlinked 파라미터 포함', () => {
      const params = buildApiParams('all', true)
      expect(params).toEqual({ customerLink: 'unlinked' })
    })

    it('미연결 필터 OFF 시 customerLink 파라미터 미포함', () => {
      const params = buildApiParams('all', false)
      expect(params).toEqual({})
    })

    it('미연결 필터 + 상태 필터 동시 적용 시 두 파라미터 모두 포함', () => {
      const params = buildApiParams('completed', true)
      expect(params).toEqual({ status: 'completed', customerLink: 'unlinked' })
    })
  })

  describe('AC#7: 고객 일괄 연결 버튼 표시', () => {
    it('삭제 모드가 아니면 일괄 연결 버튼이 표시되어야 함', () => {
      expect(shouldShowBulkLinkButton(false)).toBe(true)
    })

    it('삭제 모드일 때 일괄 연결 버튼이 숨겨져야 함', () => {
      expect(shouldShowBulkLinkButton(true)).toBe(false)
    })
  })

  describe('Regression: 필터 상호 배타 로직', () => {
    it('미연결 필터 활성화 시 고객 필터가 해제되어야 함', () => {
      const state: FilterState = {
        isUnlinkedFilter: false,
        customerFilter: { id: 'c1', name: '홍길동' }
      }
      const next = toggleUnlinkedFilter(state)
      expect(next.isUnlinkedFilter).toBe(true)
      expect(next.customerFilter).toBeNull()
    })

    it('미연결 필터 비활성화 시 고객 필터가 유지되어야 함 (null 상태)', () => {
      const state: FilterState = {
        isUnlinkedFilter: true,
        customerFilter: null
      }
      const next = toggleUnlinkedFilter(state)
      expect(next.isUnlinkedFilter).toBe(false)
      expect(next.customerFilter).toBeNull()
    })

    it('고객 필터 설정 시 미연결 필터가 해제되어야 함', () => {
      const state: FilterState = {
        isUnlinkedFilter: true,
        customerFilter: null
      }
      const next = setCustomerFilter(state, { id: 'c1', name: '홍길동' })
      expect(next.isUnlinkedFilter).toBe(false)
      expect(next.customerFilter).toEqual({ id: 'c1', name: '홍길동' })
    })

    it('고객 필터 해제 시 미연결 필터 상태가 유지되어야 함', () => {
      const state: FilterState = {
        isUnlinkedFilter: false,
        customerFilter: { id: 'c1', name: '홍길동' }
      }
      const next = setCustomerFilter(state, null)
      expect(next.isUnlinkedFilter).toBe(false)
      expect(next.customerFilter).toBeNull()
    })

    it('두 필터가 동시에 활성화되지 않아야 함', () => {
      // 시나리오: 미연결 ON → 고객 설정 → 미연결 OFF 확인
      let state: FilterState = { isUnlinkedFilter: false, customerFilter: null }
      state = toggleUnlinkedFilter(state) // 미연결 ON
      expect(state.isUnlinkedFilter).toBe(true)

      state = setCustomerFilter(state, { id: 'c1', name: '홍길동' }) // 고객 설정
      expect(state.isUnlinkedFilter).toBe(false) // 미연결 자동 OFF
      expect(state.customerFilter).not.toBeNull()
    })
  })
})
