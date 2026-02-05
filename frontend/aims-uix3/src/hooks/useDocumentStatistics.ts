/**
 * Document Statistics Hook
 * @description 문서 처리 현황 통계를 조회하고 SSE로 실시간 갱신하는 훅
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DocumentStatistics } from '@/types/documentStatistics'
import { getAuthHeaders } from '@/shared/lib/api'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useSSESubscription } from '@/shared/hooks/useSSESubscription'

const API_BASE_URL = import.meta.env['VITE_API_URL'] || ''

// 모듈 레벨 캐시: 네비게이션 시 빈 화면 방지
let statisticsCache: DocumentStatistics | null = null

interface UseDocumentStatisticsOptions {
  enabled?: boolean
  /** 업로드 묶음 ID (현재 세션 필터) */
  batchId?: string | null
}

export function useDocumentStatistics(options: UseDocumentStatisticsOptions | boolean = true) {
  // 하위 호환성: boolean만 전달된 경우
  const normalizedOptions: UseDocumentStatisticsOptions =
    typeof options === 'boolean' ? { enabled: options } : options
  const { enabled = true, batchId = null } = normalizedOptions

  // 🔴 enabled=false면 캐시 사용 안 함 (null 반환해야 함)
  // 🔴 batchId가 있으면 캐시 사용 안 함 (배치별 통계는 독립적)
  const useCache = enabled && !batchId
  const [statistics, setStatistics] = useState<DocumentStatistics | null>(
    enabled === false ? null : (useCache ? statisticsCache : null)
  )
  const [isLoading, setIsLoading] = useState<boolean>(
    enabled === false ? false : (useCache ? statisticsCache === null : true)
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const fetchStatistics = useCallback(async (silent: boolean = false) => {
    try {
      // batchId가 있으면 쿼리 파라미터로 추가
      const url = batchId
        ? `${API_BASE_URL}/api/documents/statistics?batchId=${encodeURIComponent(batchId)}`
        : `${API_BASE_URL}/api/documents/statistics`

      const response = await fetch(url, {
        headers: {
          ...getAuthHeaders()
        }
      })

      if (!response.ok) {
        throw new Error(`Statistics API error: ${response.status}`)
      }

      const json = await response.json()

      if (json.success && json.data && mountedRef.current) {
        const data = json.data as DocumentStatistics
        // batchId가 없을 때만 전역 캐시에 저장
        if (!batchId) {
          statisticsCache = data
        }
        setStatistics(data)
        setIsLoading(false)
      }
    } catch (error) {
      if (mountedRef.current) {
        setIsLoading(false)
      }
      if (!silent) {
        errorReporter.reportApiError(error as Error, {
          component: 'useDocumentStatistics'
        })
      }
    }
  }, [batchId])

  // SSE 이벤트 수신 시 디바운스 후 통계 재조회
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchStatistics()
    }, 500)
  }, [fetchStatistics])

  // SSE 구독: 문서 상태 변경 시 통계 갱신
  useSSESubscription({
    streamKey: 'documents:status-list',
    endpoint: '/api/documents/status-list/stream',
    enabled,
    onEvent: useCallback((eventType: string) => {
      if (eventType === 'document-list-change' || eventType === 'document-progress') {
        debouncedRefresh()
      }
    }, [debouncedRefresh]),
    onConnect: useCallback(() => {
      // 연결/재연결 시 최신 통계 조회
      fetchStatistics()
    }, [fetchStatistics])
  })

  // 초기 로드
  useEffect(() => {
    mountedRef.current = true
    if (enabled) {
      fetchStatistics()
    }
    return () => {
      mountedRef.current = false
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [enabled, fetchStatistics])

  // Freshness Guardian: 처리 중 문서가 있을 때만 30초 주기로 통계 검증
  // SSE 상태와 무관하게 동작 — SSE zombie, 연결 끊김 등 모든 실패 모드를 커버
  const freshnessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasActiveProcessing = statistics
    ? (statistics.processing > 0 || statistics.pending > 0)
    : false

  useEffect(() => {
    if (hasActiveProcessing && enabled) {
      freshnessIntervalRef.current = setInterval(() => {
        fetchStatistics(true)
      }, 30000)
    }
    return () => {
      if (freshnessIntervalRef.current) {
        clearInterval(freshnessIntervalRef.current)
        freshnessIntervalRef.current = null
      }
    }
  }, [hasActiveProcessing, enabled, fetchStatistics])

  return { statistics, isLoading, refresh: fetchStatistics }
}
