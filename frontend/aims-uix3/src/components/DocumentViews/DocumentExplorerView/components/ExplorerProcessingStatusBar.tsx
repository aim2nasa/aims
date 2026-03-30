/**
 * ExplorerProcessingStatusBar
 * @description 고객별 문서함(DocumentExplorerView) 상단 — 문서 처리 현황 요약 바
 * Apple Progressive Disclosure: 처리 중인 문서가 없으면 자동 숨김
 */

import type { DocumentStatistics } from '@/types/documentStatistics'
import './ExplorerProcessingStatusBar.css'

interface ExplorerProcessingStatusBarProps {
  /** 전체 라이브러리 통계 */
  statistics: DocumentStatistics | null
  isLoading: boolean
  /** 뷰 이동 핸들러 (전체문서보기 점프용) */
  onNavigate?: (viewKey: string) => void
}

/** 숫자 포맷 (1,234 형식) */
function fmt(n: number): string {
  return n.toLocaleString()
}

export function ExplorerProcessingStatusBar({ statistics, isLoading, onNavigate }: ExplorerProcessingStatusBarProps) {
  // 스켈레톤 로딩 상태
  if (isLoading && !statistics) {
    return (
      <div className="explorer-psb explorer-psb--skeleton">
        <div className="explorer-psb__skeleton-track" />
      </div>
    )
  }

  if (!statistics || statistics.total === 0) return null

  const { total, completed, processing, error, pending, completed_with_skip } = statistics
  const creditPending = statistics.credit_pending ?? 0
  const hasActiveProcessing = processing > 0 || error > 0 || pending > 0 || creditPending > 0
  if (!hasActiveProcessing) return null

  // credit_pending은 "크레딧 부족으로 처리 보류"이므로 완료 건수에서 제외
  const allCompleted = completed + completed_with_skip
  const rawPct = total > 0 ? Math.round((allCompleted / total) * 100) : 0
  // 처리 중인 문서가 있으면 100% 표시 방지
  const completedPct = (rawPct >= 100 && hasActiveProcessing) ? 99 : rawPct
  const isActive = completedPct < 100

  return (
    <div className={`explorer-psb ${hasActiveProcessing ? 'explorer-psb--visible' : ''}`}>
      <div className="explorer-psb__content">
        <span className="explorer-psb__label">처리 현황</span>
        <span className="explorer-psb__text">
          {fmt(allCompleted)}/{fmt(total)} 완료 ({completedPct}%)
        </span>
        {processing > 0 && (
          <span
            className={`explorer-psb__processing${onNavigate ? ' explorer-psb__link' : ''}`}
            onClick={onNavigate ? () => onNavigate('documents-library') : undefined}
            role={onNavigate ? 'link' : undefined}
            tabIndex={onNavigate ? 0 : undefined}
            onKeyDown={onNavigate ? (e) => { if (e.key === 'Enter') onNavigate('documents-library') } : undefined}
          >
            {fmt(processing)} 처리중
          </span>
        )}
        {pending > 0 && (
          <span className="explorer-psb__pending">{fmt(pending)} 대기</span>
        )}
        {error > 0 && (
          <span
            className={`explorer-psb__error${onNavigate ? ' explorer-psb__link' : ''}`}
            onClick={onNavigate ? () => onNavigate('documents-library') : undefined}
            role={onNavigate ? 'link' : undefined}
            tabIndex={onNavigate ? 0 : undefined}
            onKeyDown={onNavigate ? (e) => { if (e.key === 'Enter') onNavigate('documents-library') } : undefined}
          >
            {fmt(error)} 에러
          </span>
        )}
        {creditPending > 0 && (
          <span className="explorer-psb__credit" title="크레딧 충전 후 자동 처리됩니다">
            {fmt(creditPending)} 크레딧대기
          </span>
        )}
      </div>
      <div className="explorer-psb__bar">
        <div
          className={`explorer-psb__fill ${isActive ? 'explorer-psb__fill--active' : ''}`}
          style={{ width: `${completedPct}%` }}
        />
      </div>
    </div>
  )
}
