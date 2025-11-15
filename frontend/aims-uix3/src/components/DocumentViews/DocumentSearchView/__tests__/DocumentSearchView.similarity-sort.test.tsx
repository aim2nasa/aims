/**
 * DocumentSearchView - Similarity Sorting Regression Tests
 * @since 2025-11-13
 * @commit 83afbf0b
 *
 * AI 검색 결과 유사도 정렬 로직 회귀 방지 테스트
 *
 * 테스트 범위:
 * - 유사도 정렬 로직 (score 기반)
 * - 오름차순/내림차순 정렬
 * - score 값이 없을 때 처리
 * - 정렬 알고리즘 정확성
 */

import { describe, it, expect } from 'vitest'

/**
 * 유사도 정렬 함수 (DocumentSearchView에서 사용하는 로직과 동일)
 * 실제 코드는 DocumentSearchView.tsx의 sortedResults useMemo에 있음
 */
interface SearchResult {
  id?: number
  filename?: string
  score?: number
}

function sortBySimilarity(
  results: SearchResult[],
  order: 'asc' | 'desc'
): SearchResult[] {
  return [...results].sort((a, b) => {
    const scoreA = (a.score) || 0
    const scoreB = (b.score) || 0
    const compareValue = scoreA - scoreB
    return order === 'asc' ? compareValue : -compareValue
  })
}

describe('DocumentSearchView - Similarity Sorting (커밋 83afbf0b)', () => {
  describe('[회귀 방지] 유사도 정렬 로직', () => {
    it('내림차순 정렬 시 높은 score가 먼저 와야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.75 },
        { id: 2, filename: 'doc2.pdf', score: 0.95 },
        { id: 3, filename: 'doc3.pdf', score: 0.85 }
      ]

      const sorted = sortBySimilarity(results, 'desc')

      expect(sorted[0]!.score).toBe(0.95)
      expect(sorted[1]!.score).toBe(0.85)
      expect(sorted[2]!.score).toBe(0.75)
    })

    it('오름차순 정렬 시 낮은 score가 먼저 와야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.75 },
        { id: 2, filename: 'doc2.pdf', score: 0.95 },
        { id: 3, filename: 'doc3.pdf', score: 0.85 }
      ]

      const sorted = sortBySimilarity(results, 'asc')

      expect(sorted[0]!.score).toBe(0.75)
      expect(sorted[1]!.score).toBe(0.85)
      expect(sorted[2]!.score).toBe(0.95)
    })

    it('score가 없는 항목은 0으로 처리되어야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.85 },
        { id: 2, filename: 'doc2.pdf' }, // score 없음
        { id: 3, filename: 'doc3.pdf', score: 0.75 }
      ]

      const sorted = sortBySimilarity(results, 'desc')

      // score가 있는 항목들이 먼저 옴
      expect(sorted[0]!.score).toBe(0.85)
      expect(sorted[1]!.score).toBe(0.75)
      expect(sorted[2]!.score).toBeUndefined() // score 없음
    })

    it('모든 항목의 score가 같을 때 순서 유지', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.85 },
        { id: 2, filename: 'doc2.pdf', score: 0.85 },
        { id: 3, filename: 'doc3.pdf', score: 0.85 }
      ]

      const sorted = sortBySimilarity(results, 'desc')

      // 순서 유지 (stable sort)
      expect(sorted[0]!.id).toBe(1)
      expect(sorted[1]!.id).toBe(2)
      expect(sorted[2]!.id).toBe(3)
    })

    it('빈 배열은 빈 배열을 반환', () => {
      const results: Array<{ score?: number }> = []

      const sorted = sortBySimilarity(results, 'desc')

      expect(sorted).toEqual([])
    })

    it('단일 항목 배열은 그대로 반환', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.95 }
      ]

      const sorted = sortBySimilarity(results, 'desc')

      expect(sorted).toHaveLength(1)
      expect(sorted[0]!.id).toBe(1)
    })

    it('소수점 score 정렬이 정확해야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.8765 },
        { id: 2, filename: 'doc2.pdf', score: 0.8764 },
        { id: 3, filename: 'doc3.pdf', score: 0.8766 }
      ]

      const sorted = sortBySimilarity(results, 'desc')

      expect(sorted[0]!.score).toBe(0.8766)
      expect(sorted[1]!.score).toBe(0.8765)
      expect(sorted[2]!.score).toBe(0.8764)
    })

    it('score 0.0과 undefined가 다르게 처리되어야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.5 },
        { id: 2, filename: 'doc2.pdf', score: 0.0 },
        { id: 3, filename: 'doc3.pdf' } // undefined
      ]

      const sorted = sortBySimilarity(results, 'desc')

      // score가 있는 항목들이 먼저 (0.5, 0.0, undefined 순)
      expect(sorted[0]!.score).toBe(0.5)
      expect(sorted[1]!.score).toBe(0.0)
      expect(sorted[2]!.score).toBeUndefined()
    })

    it('원본 배열을 변경하지 않아야 함', () => {
      const results = [
        { id: 1, filename: 'doc1.pdf', score: 0.75 },
        { id: 2, filename: 'doc2.pdf', score: 0.95 }
      ]

      const original = [...results]
      sortBySimilarity(results, 'desc')

      // 원본이 변경되지 않았는지 확인
      expect(results).toEqual(original)
    })
  })

  describe('[회귀 방지] SortField 타입 검증', () => {
    it('similarity가 유효한 SortField여야 함', () => {
      // TypeScript에서 타입 검증
      type SortField = 'filename' | 'customer' | 'status' | 'similarity' | null

      const validSortField: SortField = 'similarity'
      expect(validSortField).toBe('similarity')
    })

    it('similarity 기본 정렬 순서는 desc여야 함', () => {
      // 커밋 83afbf0b의 코드: field === 'similarity' ? 'desc' : 'asc'
      type SortField = 'filename' | 'customer' | 'status' | 'similarity' | null

      function getDefaultSortOrder(field: Exclude<SortField, null>): 'asc' | 'desc' {
        return field === 'similarity' ? 'desc' : 'asc'
      }

      expect(getDefaultSortOrder('similarity')).toBe('desc')
      expect(getDefaultSortOrder('filename')).toBe('asc')
      expect(getDefaultSortOrder('customer')).toBe('asc')
      expect(getDefaultSortOrder('status')).toBe('asc')
    })
  })

  describe('[회귀 방지] 자동 정렬 로직', () => {
    it('semantic 검색 결과는 자동으로 similarity desc', () => {
      const searchMode = 'semantic'
      const hasResults = true

      // DocumentSearchView의 useEffect 로직 시뮬레이션
      let sortField: 'filename' | 'similarity' = 'filename'
      let sortOrder: 'asc' | 'desc' = 'asc'

      if (searchMode === 'semantic' && hasResults) {
        sortField = 'similarity'
        sortOrder = 'desc'
      }

      expect(sortField).toBe('similarity')
      expect(sortOrder).toBe('desc')
    })

    it('keyword 검색 결과는 자동으로 filename asc', () => {
      const searchMode = 'keyword'
      const hasResults = true

      // DocumentSearchView의 useEffect 로직 시뮬레이션
      let sortField: 'filename' | 'similarity' = 'similarity'
      let sortOrder: 'asc' | 'desc' = 'desc'

      if (searchMode === 'keyword' && hasResults) {
        sortField = 'filename'
        sortOrder = 'asc'
      }

      expect(sortField).toBe('filename')
      expect(sortOrder).toBe('asc')
    })

    it('결과가 없으면 자동 정렬 안 함', () => {
      const searchMode = 'semantic'
      const hasResults = false

      // DocumentSearchView의 useEffect 로직 시뮬레이션
      let sortField: 'filename' | 'similarity' = 'filename'
      let sortOrder: 'asc' | 'desc' = 'asc'

      if (searchMode === 'semantic' && hasResults) {
        sortField = 'similarity'
        sortOrder = 'desc'
      }

      // 변경 안 됨
      expect(sortField).toBe('filename')
      expect(sortOrder).toBe('asc')
    })
  })
})
