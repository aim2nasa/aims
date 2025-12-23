/**
 * 최근 검색어 관리 유틸리티
 * @since 1.0.0
 * @modified 2025-12-10 - 계정별 데이터 격리 적용 (userId 기반 동적 키)
 */

import { errorReporter } from '@/shared/lib/errorReporter'

const STORAGE_KEY_PREFIX = 'aims_recent_search_queries'
const MAX_RECENT_QUERIES = 10

export interface RecentSearchQuery {
  query: string
  timestamp: number
}

/**
 * 현재 사용자 ID 기반 storage key 생성
 * 개발자 모드 계정 전환 지원
 */
function getStorageKey(): string {
  const userId = localStorage.getItem('aims-current-user-id')
  if (userId) {
    return `${STORAGE_KEY_PREFIX}_${userId}`
  }
  return STORAGE_KEY_PREFIX
}

/**
 * 최근 검색어 목록 가져오기
 */
export function getRecentSearchQueries(): RecentSearchQuery[] {
  try {
    const stored = localStorage.getItem(getStorageKey())
    if (!stored) return []

    const queries = JSON.parse(stored) as RecentSearchQuery[]
    // 타임스탬프 기준 내림차순 정렬 (최신순)
    return queries.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to load recent search queries:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentSearchQueries.getRecentSearchQueries' })
    return []
  }
}

/**
 * 최근 검색어에 추가
 */
export function addRecentSearchQuery(query: string): void {
  try {
    // 빈 문자열은 저장하지 않음
    if (!query || query.trim() === '') return

    const trimmedQuery = query.trim()
    const recentQueries = getRecentSearchQueries()

    // 중복 제거 (같은 검색어가 있으면 제거)
    const filtered = recentQueries.filter(q => q.query !== trimmedQuery)

    // 새 검색어를 맨 앞에 추가
    const updated: RecentSearchQuery[] = [
      {
        query: trimmedQuery,
        timestamp: Date.now()
      },
      ...filtered
    ]

    // 최대 10개까지만 유지
    const trimmed = updated.slice(0, MAX_RECENT_QUERIES)

    localStorage.setItem(getStorageKey(), JSON.stringify(trimmed))
    console.log('[addRecentSearchQuery] 저장됨:', trimmed)
  } catch (error) {
    console.error('Failed to save recent search query:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentSearchQueries.addRecentSearchQuery' })
  }
}

/**
 * 최근 검색어 목록 초기화
 */
export function clearRecentSearchQueries(): void {
  try {
    localStorage.removeItem(getStorageKey())
  } catch (error) {
    console.error('Failed to clear recent search queries:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentSearchQueries.clearRecentSearchQueries' })
  }
}
