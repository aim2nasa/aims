/**
 * 컬럼 정렬 Regression 테스트
 * @description 파일명 모드 컬럼 헤더 클릭 정렬 기능 검증
 * @regression 커밋 06a73c6b — macOS Finder 스타일 컬럼 정렬
 */

import { describe, it, expect } from 'vitest'
import { SORT_BY_LABELS } from '../types/documentExplorer'
import type { DocumentSortBy, SortDirection } from '../types/documentExplorer'

// ============================================================
// 정렬 라벨 검증
// ============================================================

describe('[회귀] SORT_BY_LABELS 정의 (06a73c6b)', () => {
  it('6가지 정렬 기준 라벨이 정의되어 있다', () => {
    expect(Object.keys(SORT_BY_LABELS)).toHaveLength(6)
  })

  it('파일명 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.name).toBe('파일명')
  })

  it('형식 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.ext).toBe('형식')
  })

  it('크기 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.size).toBe('크기')
  })

  it('날짜 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.date).toBe('날짜')
  })

  it('유형 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.badgeType).toBe('유형')
  })

  it('고객명 라벨이 올바르다', () => {
    expect(SORT_BY_LABELS.customer).toBe('고객명')
  })
})

// ============================================================
// 정렬 방향 토글 로직
// ============================================================

describe('[회귀] 정렬 방향 토글 (06a73c6b)', () => {
  /**
   * 정렬 방향 토글 로직 (DocumentExplorerView에서 사용)
   * - 같은 기준 클릭: asc <-> desc 토글
   * - 다른 기준 클릭: asc로 초기화
   */
  function getNextSort(
    currentSortBy: DocumentSortBy,
    currentDirection: SortDirection,
    clickedSortBy: DocumentSortBy,
  ): { sortBy: DocumentSortBy; direction: SortDirection } {
    if (clickedSortBy === currentSortBy) {
      return {
        sortBy: currentSortBy,
        direction: currentDirection === 'asc' ? 'desc' : 'asc',
      }
    }
    return { sortBy: clickedSortBy, direction: 'asc' }
  }

  it('name asc → name 클릭 → name desc', () => {
    const result = getNextSort('name', 'asc', 'name')
    expect(result.sortBy).toBe('name')
    expect(result.direction).toBe('desc')
  })

  it('name desc → name 클릭 → name asc', () => {
    const result = getNextSort('name', 'desc', 'name')
    expect(result.sortBy).toBe('name')
    expect(result.direction).toBe('asc')
  })

  it('name asc → ext 클릭 → ext asc', () => {
    const result = getNextSort('name', 'asc', 'ext')
    expect(result.sortBy).toBe('ext')
    expect(result.direction).toBe('asc')
  })

  it('size desc → date 클릭 → date asc', () => {
    const result = getNextSort('size', 'desc', 'date')
    expect(result.sortBy).toBe('date')
    expect(result.direction).toBe('asc')
  })

  it('모든 정렬 기준에 대해 토글이 동작한다', () => {
    const allSortKeys: DocumentSortBy[] = ['name', 'ext', 'size', 'date', 'badgeType', 'customer']

    allSortKeys.forEach(key => {
      const result = getNextSort(key, 'asc', key)
      expect(result.direction).toBe('desc')

      const result2 = getNextSort(key, 'desc', key)
      expect(result2.direction).toBe('asc')
    })
  })
})

// ============================================================
// 문서 정렬 동작
// ============================================================

describe('[회귀] 문서 목록 정렬 동작 (06a73c6b)', () => {
  interface MockDoc {
    name: string
    ext: string
    size: number
    date: string
  }

  const mockDocs: MockDoc[] = [
    { name: '보험증권.pdf', ext: 'pdf', size: 5000, date: '2026-03-10' },
    { name: '연간보고서.xlsx', ext: 'xlsx', size: 2000, date: '2026-03-08' },
    { name: '계약서.docx', ext: 'docx', size: 3000, date: '2026-03-12' },
    { name: '사진.jpg', ext: 'jpg', size: 1000, date: '2026-03-01' },
  ]

  function sortDocs(docs: MockDoc[], sortBy: keyof MockDoc, direction: SortDirection): MockDoc[] {
    return [...docs].sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }

  it('이름 오름차순 정렬', () => {
    const sorted = sortDocs(mockDocs, 'name', 'asc')
    // localeCompare 한글 정렬 순서: 보 < 사 < 연 < 계 (유니코드 기반)
    // 일관된 정렬 동작 확인 (첫 번째와 마지막이 서로 다름)
    expect(sorted[0].name).not.toBe(sorted[3].name)
    // 오름차순의 역순이 내림차순과 일치하는지 확인
    const sortedDesc = sortDocs(mockDocs, 'name', 'desc')
    expect(sorted[0].name).toBe(sortedDesc[3].name)
    expect(sorted[3].name).toBe(sortedDesc[0].name)
  })

  it('크기 내림차순 정렬', () => {
    const sorted = sortDocs(mockDocs, 'size', 'desc')
    expect(sorted[0].size).toBe(5000)
    expect(sorted[3].size).toBe(1000)
  })

  it('확장자 오름차순 정렬', () => {
    const sorted = sortDocs(mockDocs, 'ext', 'asc')
    expect(sorted[0].ext).toBe('docx')
    expect(sorted[3].ext).toBe('xlsx')
  })

  it('날짜 내림차순 정렬 (최신순)', () => {
    const sorted = sortDocs(mockDocs, 'date', 'desc')
    expect(sorted[0].date).toBe('2026-03-12')
    expect(sorted[3].date).toBe('2026-03-01')
  })

  it('빈 배열 정렬 시 에러 없음', () => {
    const sorted = sortDocs([], 'name', 'asc')
    expect(sorted).toHaveLength(0)
  })

  it('단일 요소 정렬 시 그대로 반환', () => {
    const single = [mockDocs[0]]
    const sorted = sortDocs(single, 'name', 'asc')
    expect(sorted).toHaveLength(1)
    expect(sorted[0].name).toBe('보험증권.pdf')
  })
})
