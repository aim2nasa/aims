/**
 * BulkDeleteOverlay Component
 * @since 2026-04-10
 *
 * 대량 삭제 진행률 오버레이 (#52-3)
 * 삭제 진행 중 UI 잠금 + 진행률 표시 + 이탈 방지
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DeleteProgress } from '@/hooks/useDocumentActions'
import './BulkDeleteOverlay.css'

interface BulkDeleteOverlayProps {
  /** 삭제 진행 상태 (null이면 숨김) */
  progress: DeleteProgress | null
}

export const BulkDeleteOverlay: React.FC<BulkDeleteOverlayProps> = ({ progress }) => {
  // beforeunload 이탈 방지
  useEffect(() => {
    if (!progress) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [progress])

  if (!progress) return null

  const { completed, total } = progress
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return createPortal(
    <div className="bulk-delete-overlay">
      <div className="bulk-delete-overlay__card">
        <div className="bulk-delete-overlay__header">
          <span className="bulk-delete-overlay__title">삭제 중...</span>
          <span className="bulk-delete-overlay__counter">{completed} / {total}</span>
        </div>

        <div className="bulk-delete-overlay__bar-track">
          <div
            className="bulk-delete-overlay__bar-fill"
            style={{ ['--delete-progress-pct' as string]: `${percent}%` }}
          />
        </div>

        <div className="bulk-delete-overlay__message">
          삭제가 완료될 때까지 잠시 기다려주세요
        </div>
      </div>
    </div>,
    document.body
  )
}
