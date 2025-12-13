/**
 * AIMS UIX-3 AI Usage Service
 * @since 2025-12-13
 * @version 1.0.0
 *
 * AI 토큰 사용량 조회 서비스
 * 사용자 계정 설정에서 AI 사용량 확인에 사용
 */

import { api } from '@/shared/lib/api'

/**
 * AI 사용량 데이터 타입
 */
export interface AIUsageData {
  period_days: number
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
  estimated_cost_usd: number
  request_count: number
  by_source: {
    rag_api?: number
    n8n_docsummary?: number
    [key: string]: number | undefined
  }
  formatted?: {
    total_tokens: string
    estimated_cost: string
  }
}

/**
 * 일별 사용량 데이터 타입
 */
export interface DailyUsagePoint {
  date: string
  total_tokens: number
  estimated_cost_usd: number
  request_count: number
}

/**
 * AI 사용량 API 응답 타입
 */
interface AIUsageResponse {
  success: boolean
  data: AIUsageData
}

/**
 * 일별 사용량 API 응답 타입
 */
interface DailyUsageResponse {
  success: boolean
  data: DailyUsagePoint[]
}

/**
 * 현재 사용자의 AI 토큰 사용량 조회
 * @param days 조회 기간 (일), 기본값 30
 */
export async function getMyAIUsage(days: number = 30): Promise<AIUsageData> {
  const response = await api.get<AIUsageResponse>(`/api/users/me/ai-usage?days=${days}`)

  if (!response.success) {
    throw new Error('AI 사용량 조회 실패')
  }

  return response.data
}

/**
 * 현재 사용자의 일별 AI 토큰 사용량 조회 (그래프용)
 * @param days 조회 기간 (일), 기본값 30
 */
export async function getMyDailyUsage(days: number = 30): Promise<DailyUsagePoint[]> {
  const response = await api.get<DailyUsageResponse>(`/api/users/me/ai-usage/daily?days=${days}`)

  if (!response.success) {
    throw new Error('일별 AI 사용량 조회 실패')
  }

  return response.data
}

/**
 * 토큰 수 포맷팅 (K, M 단위)
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

/**
 * 비용 포맷팅 (USD)
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(6)}`
  }
  return `$${costUsd.toFixed(4)}`
}
