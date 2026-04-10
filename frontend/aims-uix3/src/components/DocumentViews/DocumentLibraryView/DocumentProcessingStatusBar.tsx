/**
 * DocumentProcessingStatusBar
 * @description 전체 문서 보기 페이지 상단 — 현재 업로드 + 전체 라이브러리 2분할 현황 바
 * Apple Progressive Disclosure: 처리 중인 문서가 없으면 자동 숨김
 */

import { useMemo, useEffect, useRef, useState } from 'react'
import type { DocumentStatistics, ParsingStats } from '@/types/documentStatistics'
import { clearBatchId, getBatchId, getLastBatchSetTime, getBatchExpectedTotal } from '@/hooks/useBatchId'
import './DocumentProcessingStatusBar.css'

/** 🔴 #53: 현재 처리 중인 파일 정보 (1건) */
export interface CurrentProcessingFile {
  id: string
  displayName: string
  progressMessage: string
  progress: number
}

interface DocumentProcessingStatusBarProps {
  /** 전체 라이브러리 통계 */
  statistics: DocumentStatistics | null
  /** 현재 업로드 배치 통계 (batchId 기반) */
  batchStatistics?: DocumentStatistics | null
  isLoading: boolean
  /** 전체 라이브러리 통계(AR/CRS) 숨김 — 업로드 완료 화면 등 배치 진행률만 필요한 경우 */
  hideLibraryStats?: boolean
  /** 🔴 #53: 현재 처리 중인 파일 후보 목록 (processing 상태 + progressMessage 보유) */
  processingCandidates?: CurrentProcessingFile[]
}

/** 🔴 #53: 파일명 말줄임 (30자 초과 시 앞 27자 + …) */
function truncateFilename(name: string, maxLen: number = 30): string {
  if (!name) return ''
  if (name.length <= maxLen) return name
  return name.slice(0, maxLen - 1) + '…'
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

export function DocumentProcessingStatusBar({ statistics, batchStatistics, isLoading, hideLibraryStats, processingCandidates }: DocumentProcessingStatusBarProps) {
  // 🔴 #53: 현재 표시 중인 처리 파일 (2초마다 후보 중 1건 교체)
  const [currentFile, setCurrentFile] = useState<CurrentProcessingFile | null>(null)
  const candidatesRef = useRef<CurrentProcessingFile[]>([])
  candidatesRef.current = processingCandidates ?? []

  // 후보 변경 시 currentFile 동기화 (interval 재등록 방지를 위해 별도 effect)
  // 부모 polling(3초)으로 processingCandidates 배열 reference가 자주 바뀌므로,
  // 이 effect만 candidates에 의존시키고 interval은 mount 시 1회만 등록한다.
  useEffect(() => {
    if (!processingCandidates || processingCandidates.length === 0) {
      setCurrentFile(null)
      return
    }
    setCurrentFile((prev) => {
      if (prev) {
        const same = processingCandidates.find((c) => c.id === prev.id)
        if (same) return same
      }
      return processingCandidates[0] ?? null
    })
  }, [processingCandidates])

  // 2초마다 후보 순환 — mount 시 1회만 등록 (polling re-render에 영향받지 않음)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const list = candidatesRef.current
      if (!list || list.length === 0) {
        return
      }
      setCurrentFile((prev) => {
        if (!prev) return list[0] ?? null
        const idx = list.findIndex((c) => c.id === prev.id)
        // 현재 파일이 후보에서 사라졌거나 마지막이면 맨 앞으로
        const next = (idx < 0 || idx >= list.length - 1) ? 0 : idx + 1
        return list[next] ?? null
      })
    }, 2000)

    return () => clearInterval(intervalId)
  }, [])

  // AR/CRS 파싱 통계 (전체 라이브러리)
  const arParsing = statistics?.arParsing ?? EMPTY_PARSING
  const crsParsing = statistics?.crsParsing ?? EMPTY_PARSING

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
  const batchTotalRef = useRef(batchTotal)
  batchTotalRef.current = batchTotal
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
      const snapshotTotal = batchTotal
      const snapshotTime = Date.now()

      // 🔴 Guard 4: 서버 total이 업로드 예정 수(expectedTotal)에 미달 → cleanup 지연
      // 프론트엔드에서 아직 전송 중인 파일이 있을 수 있음 (조기 cleanup 방지)
      // expectedTotal에 도달했으면 기존 2초 후 cleanup, 미달이면 15초 후 강제 cleanup
      const expTotal = getBatchExpectedTotal()
      const allFilesArrived = expTotal === 0 || batchTotal >= expTotal
      const cleanupDelay = allFilesArrived ? 2000 : 15000

      cleanupTimerRef.current = setTimeout(() => {
        // 새 업로드가 시작되지 않았는지 확인:
        // 1) batchId 변경, 2) 배치 크기 증가, 3) 타이머 시작 후 setBatchId 호출됨
        if (getBatchId() === currentBatchId &&
            batchTotalRef.current <= snapshotTotal &&
            getLastBatchSetTime() <= snapshotTime) {
          clearBatchId()
        }
        cleanupTimerRef.current = null
      }, cleanupDelay)
    }

    return () => {
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
    }
  }, [shouldCleanup, batchTotal])

  // 표시 여부 결정
  const isVisible = useMemo(() => {
    if (!statistics) return false
    if (statistics.total === 0) return false

    // 현재 배치가 활성(미완료) 상태면 표시
    // batchIsActive = batchPct < 100 || batchCreditPending > 0
    // (processing/pending이 0이더라도 error 등으로 미완료 상태일 수 있음)
    if (hasBatch && batchIsActive) {
      return true
    }

    // hideLibraryStats: 배치만 표시하는 모드 — 배치 완료 시 숨김
    if (hideLibraryStats) return false

    // 전체 라이브러리에 처리 중인 문서가 있으면 표시
    const creditPending = statistics.credit_pending ?? 0
    const hasActiveProcessing = statistics.processing > 0 || statistics.error > 0 || statistics.pending > 0 || creditPending > 0
    const hasActiveArParsing = arParsing.total > 0 &&
      (arParsing.processing > 0 || arParsing.pending > 0 || arParsing.failed > 0 || (arParsing.credit_pending ?? 0) > 0)
    const hasActiveCrsParsing = crsParsing.total > 0 &&
      (crsParsing.processing > 0 || crsParsing.pending > 0 || crsParsing.failed > 0 || (crsParsing.credit_pending ?? 0) > 0)

    return hasActiveProcessing || hasActiveArParsing || hasActiveCrsParsing
  }, [statistics, hasBatch, batchIsActive, arParsing, crsParsing, hideLibraryStats])

  // 스켈레톤 로딩 상태
  if (isLoading && !statistics) {
    return (
      <div className="processing-status-bar processing-status-bar--skeleton">
        <div className="psb-skeleton-track" />
      </div>
    )
  }

  if (!statistics || statistics.total === 0) return null
  if (!isVisible) return null

  // 전체 라이브러리 요약 (hideLibraryStats 시 숨김)
  const hasAr = !hideLibraryStats && arParsing.total > 0
  const hasCrs = !hideLibraryStats && crsParsing.total > 0

  // 🔴 #53: 현재 처리 파일 표시 여부 (progressMessage 있는 경우만)
  const showCurrentFile = Boolean(currentFile && currentFile.progressMessage && currentFile.progressMessage.trim().length > 0)

  return (
    <div className={`processing-status-bar ${isVisible ? 'processing-status-bar--visible' : ''} ${showCurrentFile ? 'processing-status-bar--with-current-file' : ''}`}>
     <div className="psb-main-row">
      {/* 좌측: 현재 업로드 진행률 */}
      {hasBatch && (
        <div className="psb-batch">
          <div className="psb-batch-header">
            <span className="psb-batch-label">📋 문서 처리</span>
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

      {/* 🔴 처리 중인 문서가 있으면 파이프라인 진행률 항상 표시 (배치 없을 때) */}
      {!hasBatch && !hideLibraryStats && (() => {
        const { total, completed, processing, error, pending, completed_with_skip } = statistics
        const creditPending = statistics.credit_pending ?? 0
        const hasActiveProcessing = processing > 0 || error > 0 || pending > 0 || creditPending > 0
        if (!hasActiveProcessing) return null

        // credit_pending은 "크레딧 부족으로 처리 보류"이므로 완료 건수에서 제외
        const allCompleted = completed + completed_with_skip
        const rawPct = total > 0 ? Math.round((allCompleted / total) * 100) : 0
        // 🔴 처리 중인 문서가 있으면 100% 표시 방지 (반올림으로 100%가 되는 케이스)
        const completedPct = (rawPct >= 100 && hasActiveProcessing) ? 99 : rawPct
        const isActive = completedPct < 100

        return (
          <>
            {(hasAr || hasCrs) && <div className="psb-divider" />}
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
          </>
        )
      })()}
     </div>

      {/* 🔴 #53: 현재 처리 중인 파일 1건 표시 (2초마다 교체) */}
      {showCurrentFile && currentFile && (
        <div className="psb-current-file" key={currentFile.id} aria-live="polite">
          <span className="psb-current-file-spinner" aria-hidden="true">⟳</span>
          <span className="psb-current-file-name" title={currentFile.displayName}>
            {truncateFilename(currentFile.displayName)}
          </span>
          <span className="psb-current-file-sep">—</span>
          <span className="psb-current-file-message">{currentFile.progressMessage}</span>
          <span className="psb-current-file-progress">({currentFile.progress}%)</span>
        </div>
      )}
    </div>
  )
}
