/**
 * useAliasGeneration Hook
 * @since 2026-03-14
 *
 * AI 별칭 단건 순차 생성 + 실시간 진행률 관리
 * DocumentExplorerView, DocumentLibraryView 공통 사용
 */

import { useState, useCallback, useRef } from 'react'
import { api } from '@/shared/lib/api'

/** 단건 API 응답 타입 */
interface SingleDisplayNameResult {
  document_id: string
  status: 'completed' | 'skipped' | 'failed'
  display_name: string | null
  reason: string | null
}

/** 진행 상태 */
export interface AliasProgress {
  /** 현재 처리 중인 인덱스 (0-based) */
  current: number
  /** 총 건수 */
  total: number
  /** 현재 생성된 별칭명 (completed 시) */
  currentDisplayName: string | null
  /** 완료 건수 */
  completed: number
  /** 스킵 건수 */
  skipped: number
  /** 실패 건수 */
  failed: number
  /** 진행 중 여부 */
  isRunning: boolean
  /** 취소됨 여부 */
  isCancelled: boolean
}

/** 최종 결과 요약 */
export interface AliasGenerationSummary {
  completed: number
  skipped: number
  failed: number
  cancelled: boolean
}

const INITIAL_PROGRESS: AliasProgress = {
  current: 0,
  total: 0,
  currentDisplayName: null,
  completed: 0,
  skipped: 0,
  failed: 0,
  isRunning: false,
  isCancelled: false,
}

export function useAliasGeneration() {
  const [progress, setProgress] = useState<AliasProgress>(INITIAL_PROGRESS)
  const cancelledRef = useRef(false)

  /**
   * 별칭 생성 실행 — 선택된 문서 ID를 건별 순차 호출
   * @returns 최종 결과 요약
   */
  const generate = useCallback(async (
    documentIds: string[],
    forceRegenerate: boolean,
  ): Promise<AliasGenerationSummary> => {
    if (documentIds.length === 0) {
      return { completed: 0, skipped: 0, failed: 0, cancelled: false }
    }

    cancelledRef.current = false
    const total = documentIds.length
    let completed = 0
    let skipped = 0
    let failed = 0
    // 프론트에서 누적하는 기존 별칭 목록 (중복 방지)
    const existingAliases: string[] = []

    setProgress({
      current: 0,
      total,
      currentDisplayName: null,
      completed: 0,
      skipped: 0,
      failed: 0,
      isRunning: true,
      isCancelled: false,
    })

    for (let i = 0; i < total; i++) {
      // 취소 체크
      if (cancelledRef.current) {
        // 나머지 문서는 스킵 처리하지 않고 중단
        setProgress(prev => ({ ...prev, isRunning: false, isCancelled: true }))
        return { completed, skipped, failed, cancelled: true }
      }

      const docId = documentIds[i]

      setProgress(prev => ({
        ...prev,
        current: i,
        currentDisplayName: null,
      }))

      try {
        const result = await api.post<SingleDisplayNameResult>('/api/generate-display-name', {
          document_id: docId,
          force_regenerate: forceRegenerate,
          existing_aliases: existingAliases,
        })

        if (result.status === 'completed') {
          completed++
          if (result.display_name) {
            existingAliases.push(result.display_name)
          }
          setProgress(prev => ({
            ...prev,
            current: i,
            currentDisplayName: result.display_name,
            completed,
          }))
        } else if (result.status === 'skipped') {
          skipped++
          setProgress(prev => ({
            ...prev,
            current: i,
            currentDisplayName: result.display_name,
            skipped,
          }))
        } else {
          failed++
          // credit_exceeded 시 나머지 중단
          if (result.reason === 'credit_exceeded') {
            failed += (total - i - 1)
            setProgress(prev => ({
              ...prev,
              current: i,
              currentDisplayName: null,
              failed,
              isRunning: false,
            }))
            return { completed, skipped, failed, cancelled: false }
          }
          setProgress(prev => ({
            ...prev,
            current: i,
            currentDisplayName: null,
            failed,
          }))
        }
      } catch {
        failed++
        setProgress(prev => ({
          ...prev,
          current: i,
          currentDisplayName: null,
          failed,
        }))
      }
    }

    setProgress(prev => ({
      ...prev,
      current: total - 1,
      isRunning: false,
    }))

    return { completed, skipped, failed, cancelled: false }
  }, [])

  /** 진행 중 취소 */
  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  /** 상태 초기화 */
  const reset = useCallback(() => {
    cancelledRef.current = false
    setProgress(INITIAL_PROGRESS)
  }, [])

  return {
    progress,
    generate,
    cancel,
    reset,
  }
}
