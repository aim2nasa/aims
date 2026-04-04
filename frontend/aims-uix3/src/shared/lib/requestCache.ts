/**
 * API 요청 캐싱 유틸리티
 * @since 2025-12-29
 *
 * 동일한 요청이 동시에 여러 번 발생할 때 중복 호출을 방지
 * - 진행 중인 요청이 있으면 해당 Promise 재사용
 * - TTL 기반 결과 캐싱으로 불필요한 재요청 방지
 */

interface CacheEntry<T> {
  promise: Promise<T>
  timestamp: number
  resolved: boolean
  result?: T
}

const cache = new Map<string, CacheEntry<unknown>>()

/**
 * 캐시된 요청 실행
 * @param key 캐시 키 (예: 'documents-list', 'folder-contents-123')
 * @param fetcher 실제 API 호출 함수
 * @param ttl 캐시 유효 시간 (ms, 기본: 5000 = 5초)
 */
export async function cachedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 5000
): Promise<T> {
  const now = Date.now()
  const existing = cache.get(key) as CacheEntry<T> | undefined

  // 1. 캐시된 결과가 있고 TTL 내이면 재사용
  if (existing?.resolved && existing.result !== undefined && (now - existing.timestamp) < ttl) {
    console.log(`[RequestCache] 캐시 히트: ${key}`)
    return existing.result
  }

  // 2. 진행 중인 요청이 있으면 해당 Promise 재사용
  if (existing && !existing.resolved) {
    console.log(`[RequestCache] 진행 중인 요청 재사용: ${key}`)
    return existing.promise
  }

  // 3. 새 요청 시작
  console.log(`[RequestCache] 새 요청 시작: ${key}`)
  const promise = fetcher().then(result => {
    const entry = cache.get(key) as CacheEntry<T> | undefined
    if (entry) {
      entry.resolved = true
      entry.result = result
    }
    return result
  }).catch(error => {
    // 에러 시 캐시에서 제거 (재시도 가능하도록)
    cache.delete(key)
    throw error
  })

  cache.set(key, {
    promise,
    timestamp: now,
    resolved: false
  })

  return promise
}

