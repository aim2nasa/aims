/**
 * DocumentProcessingStatusBar
 * @description 전체 문서 보기 페이지 상단 — 현재 업로드 + 전체 라이브러리 2분할 현황 바
 * Apple Progressive Disclosure: 처리 중인 문서가 없으면 자동 숨김
 */

import { useMemo, useEffect, useRef } from 'react'
import type { DocumentStatistics, ParsingStats } from '@/types/documentStatistics'
import { clearBatchId, getBatchId } from '@/hooks/useBatchId'
import './DocumentProcessingStatusBar.css'

interface DocumentProcessingStatusBarProps {
  /** 전체 라이브러리 통계 */
  statistics: DocumentStatistics | null
  /** 현재 업로드 배치 통계 (batchId 기반) */
  batchStatistics?: DocumentStatistics | null
  isLoading: boolean
}

/** 파싱 진행률 계산 (credit_pending도 "완료"로 간주) */
function getParsingPercent(stats: ParsingStats): number {
  if (stats.total === 0) return 100
  // 🔴 credit_pending 문서도 "파싱 완료"로 간주하여 진행률 100% 달성 가능
  const effectiveCompleted = stats.completed + (stats.credit_pending ?? 0)
  return Math.round((effectiveCompleted / stats.total) * 100)
}

/** 파싱 완료 수 계산 (credit_pending 포함) */
function getParsingCompleted(stats: ParsingStats): number {
  return stats.completed + (stats.credit_pending ?? 0)
}

/** 숫자 포맷 (1,234 형식) */
function fmt(n: number): string {
  return n.toLocaleString()
}

/** 파싱 통계 기본값 (API 미지원 시 안전 처리) */
const EMPTY_PARSING: ParsingStats = { total: 0, completed: 0, processing: 0, pending: 0, failed: 0 }

export function DocumentProcessingStatusBar({ statistics, batchStatistics, isLoading }: DocumentProcessingStatusBarProps) {
  // AR/CRS 파싱 통계 (전체 라이브러리)
  const arParsing = statistics?.arParsing ?? EMPTY_PARSING
  const crsParsing = statistics?.crsParsing ?? EMPTY_PARSING

  // 현재 배치 통계
  const batchArParsing = batchStatistics?.arParsing ?? EMPTY_PARSING
  const batchCrsParsing = batchStatistics?.crsParsing ?? EMPTY_PARSING

  // 현재 배치가 있고, 진행 중인지 확인
  const hasBatch = batchStatistics && batchStatistics.total > 0
  const batchTotal = batchStatistics?.total ?? 0
  // 🔴 credit_pending은 "완료"가 아님! 진행률에서 제외
  const batchCompleted = (batchStatistics?.completed ?? 0) +
                         (batchStatistics?.completed_with_skip ?? 0)
  const batchProcessing = batchStatistics?.processing ?? 0
  const batchPending = batchStatistics?.pending ?? 0
  const batchError = batchStatistics?.error ?? 0
  const batchCreditPending = batchStatistics?.credit_pending ?? 0
  const batchPct = batchTotal > 0 ? Math.round((batchCompleted / batchTotal) * 100) : 0
  // 🔴 credit_pending이 있어도 "활성" 상태 (아직 처리 안 됨)
  const batchIsActive = batchPct < 100 || batchCreditPending > 0

  // 🔴 배치 완료 시 자동 정리 (2초 딜레이 후)
  // 조건: 100% 완료 + 진행 중/대기 중 없음 + credit_pending 없음
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldCleanup = hasBatch &&
                        batchPct === 100 &&
                        batchProcessing === 0 &&
                        batchPending === 0 &&
                        batchCreditPending === 0

  useEffect(() => {
    if (shouldCleanup) {
      // 이미 타이머가 있으면 무시
      if (cleanupTimerRef.current) return

      const currentBatchId = getBatchId()
      cleanupTimerRef.current = setTimeout(() => {
        // 새 업로드가 시작되지 않았는지 확인
        if (getBatchId() === currentBatchId) {
          clearBatchId()
        }
        cleanupTimerRef.current = null
      }, 2000)
    }

    return () => {
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
    }
  }, [shouldCleanup])

  // 표시 여부 결정
  const isVisible = useMemo(() => {
    if (!statistics) return false
    if (statistics.total === 0) return false

    // 현재 배치가 진행 중이면 표시
    if (hasBatch && (batchProcessing > 0 || batchPending > 0 || batchCreditPending > 0)) {
      return true
    }

    // 전체 라이브러리에 처리 중인 문서가 있으면 표시
    const creditPending = statistics.credit_pending ?? 0
    const hasActiveProcessing = statistics.processing > 0 || statistics.error > 0 || statistics.pending > 0 || creditPending > 0
    const hasActiveArParsing = arParsing.total > 0 &&
      (arParsing.processing > 0 || arParsing.pending > 0 || arParsing.failed > 0 || (arParsing.credit_pending ?? 0) > 0)
    const hasActiveCrsParsing = crsParsing.total > 0 &&
      (crsParsing.processing > 0 || crsParsing.pending > 0 || crsParsing.failed > 0 || (crsParsing.credit_pending ?? 0) > 0)

    return hasActiveProcessing || hasActiveArParsing || hasActiveCrsParsing
  }, [statistics, hasBatch, batchProcessing, batchPending, batchCreditPending, arParsing, crsParsing])

  // 스켈레톤 로딩 상태
  if (isLoading && !statistics) {
    return (
      <div className="processing-status-bar processing-status-bar--skeleton">
        <div className="psb-skeleton-track" />
      </div>
    )
  }

  if (!statistics || statistics.total === 0) return null

  // 전체 라이브러리 요약
  const hasAr = arParsing.total > 0
  const hasCrs = crsParsing.total > 0

  return (
    <div className={`processing-status-bar ${isVisible ? 'processing-status-bar--visible' : ''}`}>
      {/* 좌측: 현재 업로드 진행률 */}
      {hasBatch && (
        <div className="psb-batch">
          <div className="psb-batch-header">
            <span className="psb-batch-label">📤 이번 업로드</span>
            <span className="psb-batch-text">
              {fmt(batchCompleted)}/{fmt(batchTotal)} 완료 ({batchPct}%)
            </span>
            {batchProcessing > 0 && (
              <span className="psb-pipeline-processing">{fmt(batchProcessing)} 처리중</span>
            )}
            {batchPending > 0 && (
              <span className="psb-pipeline-pending">{fmt(batchPending)} 대기</span>
            )}
            {batchError > 0 && (
              <span className="psb-pipeline-error">{fmt(batchError)} 에러</span>
            )}
            {batchCreditPending > 0 && (
              <span className="psb-pipeline-credit" title="크레딧 충전 후 자동 처리됩니다">
                ⏸ {fmt(batchCreditPending)} 크레딧대기
              </span>
            )}
          </div>
          <div className="psb-pipeline-bar">
            <div
              className={`psb-pipeline-fill ${batchIsActive ? 'psb-pipeline-fill--active' : ''}`}
              style={{ width: `${batchPct}%` }}
            />
          </div>
        </div>
      )}

      {/* 중앙 구분선 (배치가 있을 때만) */}
      {hasBatch && (hasAr || hasCrs) && (
        <div className="psb-divider" />
      )}

      {/* 우측: 전체 라이브러리 요약 */}
      {(hasAr || hasCrs) && (
        <div className="psb-library">
          <span className="psb-library-label">📚 전체</span>
          {hasAr && (
            <div className="psb-library-stat">
              <span className="psb-parsing-badge psb-parsing-badge--ar">AR</span>
              <span className="psb-library-text">
                {fmt(getParsingCompleted(arParsing))}/{fmt(arParsing.total)}
                {getParsingPercent(arParsing) < 100 && ` (${getParsingPercent(arParsing)}%)`}
              </span>
              {(arParsing.credit_pending ?? 0) > 0 && (
                <span className="psb-parsing-credit" title="크레딧 충전 후 자동 파싱됩니다">
                  ⏸ {arParsing.credit_pending}
                </span>
              )}
            </div>
          )}
          {hasCrs && (
            <div className="psb-library-stat">
              <span className="psb-parsing-badge psb-parsing-badge--crs">CRS</span>
              <span className="psb-library-text">
                {fmt(getParsingCompleted(crsParsing))}/{fmt(crsParsing.total)}
                {getParsingPercent(crsParsing) < 100 && ` (${getParsingPercent(crsParsing)}%)`}
              </span>
              {(crsParsing.credit_pending ?? 0) > 0 && (
                <span className="psb-parsing-credit" title="크레딧 충전 후 자동 파싱됩니다">
                  ⏸ {crsParsing.credit_pending}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 배치 없고 전체 라이브러리도 표시할 내용 없으면 기존 진행률 표시 */}
      {!hasBatch && !hasAr && !hasCrs && (() => {
        const { total, completed, processing, error, pending, completed_with_skip } = statistics
        const creditPending = statistics.credit_pending ?? 0
        const allCompleted = completed + completed_with_skip + creditPending
        const completedPct = total > 0 ? Math.round((allCompleted / total) * 100) : 0
        const isActive = completedPct < 100

        return (
          <div className="psb-pipeline">
            <div className="psb-pipeline-header">
              <span className="psb-pipeline-text">
                {fmt(allCompleted)}/{fmt(total)} 처리완료 ({completedPct}%)
              </span>
              {processing > 0 && (
                <span className="psb-pipeline-processing">{fmt(processing)} 처리중</span>
              )}
              {pending > 0 && (
                <span className="psb-pipeline-pending">{fmt(pending)} 대기</span>
              )}
              {error > 0 && (
                <span className="psb-pipeline-error">{fmt(error)} 에러</span>
              )}
              {creditPending > 0 && (
                <span className="psb-pipeline-credit" title="크레딧 충전 후 자동 처리됩니다">
                  ⏸ {fmt(creditPending)} 크레딧 대기
                </span>
              )}
            </div>
            <div className="psb-pipeline-bar">
              <div
                className={`psb-pipeline-fill ${isActive ? 'psb-pipeline-fill--active' : ''}`}
                style={{ width: `${completedPct}%` }}
              />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
