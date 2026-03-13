/**
 * AliasProgressOverlay Component
 * @since 2026-03-14
 *
 * AI 별칭 생성 진행률 오버레이
 * 문서 목록 영역 위에 반투명 오버레이 + 중앙 프로그레스 표시
 */

import React from 'react'
import type { AliasProgress } from '@/hooks/useAliasGeneration'
import './AliasProgressOverlay.css'

interface AliasProgressOverlayProps {
  /** 진행 상태 */
  progress: AliasProgress
  /** 취소 버튼 클릭 핸들러 */
  onCancel: () => void
}

export const AliasProgressOverlay: React.FC<AliasProgressOverlayProps> = ({
  progress,
  onCancel,
}) => {
  if (!progress.isRunning) return null

  const { current, total, currentDisplayName, completed, skipped, failed } = progress
  // 화면에 표시할 진행 번호 (1-based)
  const displayCurrent = current + 1
  const percent = total > 0 ? Math.round((displayCurrent / total) * 100) : 0

  return (
    <div className="alias-progress-overlay">
      <div className="alias-progress-overlay__card">
        {/* 제목 */}
        <div className="alias-progress-overlay__header">
          <span className="alias-progress-overlay__title">AI 별칭 생성 중</span>
          <span className="alias-progress-overlay__counter">{displayCurrent} / {total}</span>
        </div>

        {/* 프로그레스 바 */}
        <div className="alias-progress-overlay__bar-track">
          <div
            className="alias-progress-overlay__bar-fill"
            style={{ ['--alias-progress-pct' as string]: `${percent}%` }}
          />
        </div>

        {/* 현재 생성된 별칭명 */}
        <div className="alias-progress-overlay__current-name">
          {currentDisplayName || '\u00A0'}
        </div>

        {/* 실시간 카운트 */}
        <div className="alias-progress-overlay__stats">
          {completed > 0 && (
            <span className="alias-progress-overlay__stat alias-progress-overlay__stat--completed">
              {completed}건 완료
            </span>
          )}
          {skipped > 0 && (
            <span className="alias-progress-overlay__stat alias-progress-overlay__stat--skipped">
              {skipped}건 건너뜀
            </span>
          )}
          {failed > 0 && (
            <span className="alias-progress-overlay__stat alias-progress-overlay__stat--failed">
              {failed}건 실패
            </span>
          )}
        </div>

        {/* 취소 버튼 */}
        <button
          type="button"
          className="alias-progress-overlay__cancel"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
    </div>
  )
}
