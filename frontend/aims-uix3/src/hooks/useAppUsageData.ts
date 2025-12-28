/**
 * useAppUsageData - 사용량 데이터 관리 훅
 * App.tsx에서 분리됨 - 저장소 및 AI 사용량 데이터 패칭
 */
import { useState, useEffect, useCallback } from 'react'
import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import { getMyAIUsage, type AIUsageData } from '@/services/aiUsageService'
import { errorReporter } from '@/shared/lib/errorReporter'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5분

export interface UseAppUsageDataReturn {
  storageInfo: StorageInfo | null
  aiUsage: AIUsageData | null
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * 사용량 데이터 관리 훅
 * - 마운트 시 초기 데이터 로드
 * - 5분 간격 자동 갱신
 * - 수동 갱신 함수 제공
 */
export function useAppUsageData(): UseAppUsageDataReturn {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [aiUsage, setAIUsage] = useState<AIUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUsageData = useCallback(async () => {
    try {
      console.log('[useAppUsageData] 사용량 데이터 로드 시작')
      setLoading(true)
      const [storageResult, aiResult] = await Promise.all([
        getMyStorageInfo(),
        getMyAIUsage()
      ])
      console.log('[useAppUsageData] 사용량 데이터 로드 완료:', { tier: storageResult.tier, tierName: storageResult.tierName })
      setStorageInfo(storageResult)
      setAIUsage(aiResult)
    } catch (error) {
      console.error('[useAppUsageData] 사용량 데이터 로드 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'useAppUsageData' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsageData()

    // 5분마다 갱신
    const intervalId = setInterval(fetchUsageData, REFRESH_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [fetchUsageData])

  return {
    storageInfo,
    aiUsage,
    loading,
    refresh: fetchUsageData,
  }
}

export default useAppUsageData
