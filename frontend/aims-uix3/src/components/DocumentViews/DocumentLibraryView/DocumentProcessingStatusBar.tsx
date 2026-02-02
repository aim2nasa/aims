/**
 * DocumentProcessingStatusBar
 * @description 전체 문서 보기 페이지 상단 — 문서 처리 파이프라인 + AR/CRS 파싱 종합 현황 바
 * Apple Progressive Disclosure: 처리 중인 문서가 없으면 자동 숨김
 */

import { useMemo } from 'react'
import type { DocumentStatistics, ParsingStats } from '@/types/documentStatistics'
import { Tooltip } from '@/shared/ui'
import './DocumentProcessingStatusBar.css'

interface DocumentProcessingStatusBarProps {
  statistics: DocumentStatistics | null
  isLoading: boolean
}

/** 파싱 진행률 계산 */
function getParsingPercent(stats: ParsingStats): number {
  if (stats.total === 0) return 100
  return Math.round((stats.completed / stats.total) * 100)
}

/** 숫자 포맷 (1,234 형식) */
function fmt(n: number): string {
  return n.toLocaleString()
}

/** 파싱 통계 기본값 (API 미지원 시 안전 처리) */
const EMPTY_PARSING: ParsingStats = { total: 0, completed: 0, processing: 0, pending: 0, failed: 0 }

export function DocumentProcessingStatusBar({ statistics, isLoading }: DocumentProcessingStatusBarProps) {
  // AR/CRS 파싱 통계 (API가 아직 반환하지 않는 경우 기본값 사용)
  const arParsing = statistics?.arParsing ?? EMPTY_PARSING
  const crsParsing = statistics?.crsParsing ?? EMPTY_PARSING

  // 표시 여부 결정: 처리중/에러/대기 문서가 있거나, AR/CRS 파싱이 진행 중일 때만 표시
  const isVisible = useMemo(() => {
    if (!statistics) return false
    if (statistics.total === 0) return false

    const hasActiveProcessing = statistics.processing > 0 || statistics.error > 0 || statistics.pending > 0
    const hasActiveArParsing = arParsing.total > 0 &&
      (arParsing.processing > 0 || arParsing.pending > 0 || arParsing.failed > 0)
    const hasActiveCrsParsing = crsParsing.total > 0 &&
      (crsParsing.processing > 0 || crsParsing.pending > 0 || crsParsing.failed > 0)

    return hasActiveProcessing || hasActiveArParsing || hasActiveCrsParsing
  }, [statistics, arParsing, crsParsing])

  // 스켈레톤 로딩 상태
  if (isLoading && !statistics) {
    return (
      <div className="processing-status-bar processing-status-bar--skeleton">
        <div className="psb-skeleton-track" />
      </div>
    )
  }

  if (!statistics || statistics.total === 0) return null

  const { total, completed, processing, error, pending, completed_with_skip } = statistics
  const allCompleted = completed + completed_with_skip

  // 세그먼트 비율 계산
  const completedPct = total > 0 ? (allCompleted / total) * 100 : 0
  const processingPct = total > 0 ? (processing / total) * 100 : 0
  const errorPct = total > 0 ? (error / total) * 100 : 0
  const pendingPct = total > 0 ? (pending / total) * 100 : 0

  const hasAr = arParsing.total > 0
  const hasCrs = crsParsing.total > 0
  const arPercent = getParsingPercent(arParsing)
  const crsPercent = getParsingPercent(crsParsing)

  return (
    <div className={`processing-status-bar ${isVisible ? 'processing-status-bar--visible' : ''}`}>
      {/* 좌측: 파이프라인 상태 세그먼트 바 */}
      <div className="psb-pipeline">
        <div className="psb-pipeline-bar">
          {completedPct > 0 && (
            <Tooltip content={`완료 ${fmt(allCompleted)}건`}>
              <div
                className="psb-segment psb-segment--completed"
                style={{ width: `${completedPct}%` }}
              />
            </Tooltip>
          )}
          {processingPct > 0 && (
            <Tooltip content={`처리중 ${fmt(processing)}건`}>
              <div
                className="psb-segment psb-segment--processing"
                style={{ width: `${processingPct}%` }}
              />
            </Tooltip>
          )}
          {errorPct > 0 && (
            <Tooltip content={`에러 ${fmt(error)}건`}>
              <div
                className="psb-segment psb-segment--error"
                style={{ width: `${errorPct}%` }}
              />
            </Tooltip>
          )}
          {pendingPct > 0 && (
            <Tooltip content={`대기 ${fmt(pending)}건`}>
              <div
                className="psb-segment psb-segment--pending"
                style={{ width: `${pendingPct}%` }}
              />
            </Tooltip>
          )}
        </div>

        {/* 카운터 라벨 */}
        <div className="psb-labels">
          <span className="psb-label psb-label--completed">
            <span className="psb-dot psb-dot--completed" />
            {fmt(allCompleted)} 완료
          </span>
          {processing > 0 && (
            <span className="psb-label psb-label--processing">
              <span className="psb-dot psb-dot--processing" />
              {fmt(processing)} 처리중
            </span>
          )}
          {error > 0 && (
            <span className="psb-label psb-label--error">
              <span className="psb-dot psb-dot--error" />
              {fmt(error)} 에러
            </span>
          )}
          {pending > 0 && (
            <span className="psb-label psb-label--pending">
              <span className="psb-dot psb-dot--pending" />
              {fmt(pending)} 대기
            </span>
          )}
        </div>
      </div>

      {/* 우측: AR/CRS 파싱 현황 */}
      {(hasAr || hasCrs) && (
        <div className="psb-parsing">
          {hasAr && (
            <div className="psb-parsing-group">
              <div className="psb-parsing-header">
                <span className="psb-parsing-badge psb-parsing-badge--ar">AR</span>
                <span className="psb-parsing-text">
                  {fmt(arParsing.completed)}/{fmt(arParsing.total)} 파싱완료
                </span>
                {arParsing.failed > 0 && (
                  <span className="psb-parsing-failed">{arParsing.failed} 실패</span>
                )}
              </div>
              <div className="psb-parsing-bar">
                <div
                  className={`psb-parsing-fill ${arPercent < 100 ? 'psb-parsing-fill--active' : ''}`}
                  style={{ width: `${arPercent}%` }}
                />
              </div>
            </div>
          )}
          {hasCrs && (
            <div className="psb-parsing-group">
              <div className="psb-parsing-header">
                <span className="psb-parsing-badge psb-parsing-badge--crs">CRS</span>
                <span className="psb-parsing-text">
                  {fmt(crsParsing.completed)}/{fmt(crsParsing.total)} 파싱완료
                </span>
                {crsParsing.failed > 0 && (
                  <span className="psb-parsing-failed">{crsParsing.failed} 실패</span>
                )}
              </div>
              <div className="psb-parsing-bar">
                <div
                  className={`psb-parsing-fill ${crsPercent < 100 ? 'psb-parsing-fill--active' : ''}`}
                  style={{ width: `${crsPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
