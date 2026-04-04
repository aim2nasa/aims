import React from 'react'
import Tooltip from '@/shared/ui/Tooltip'
import './FilenameModeToggle.css'

/** 파일명 표시 모드 토글 Props */
export interface FilenameModeToggleProps {
  /** 현재 파일명 표시 모드 */
  filenameMode: 'display' | 'original'
  /** 모드 변경 콜백 (부모에서 상태 관리) */
  onModeChange: (mode: 'display' | 'original') => void
}

/** 별칭/원본 파일명 표시 모드 전환 Pill Badge 버튼 */
export const FilenameModeToggle: React.FC<FilenameModeToggleProps> = ({
  filenameMode,
  onModeChange,
}) => {
  const isAlias = filenameMode === 'display'
  const tooltipText = isAlias
    ? 'AI가 지어준 별칭으로 표시 중 · 클릭하면 원본 파일명으로 전환'
    : '원본 파일명 표시 중 · 클릭하면 AI가 지어준 별칭으로 전환'
  const nextMode = isAlias ? 'original' : 'display'

  return (
    <Tooltip content={tooltipText}>
      <button
        type="button"
        className={`fnm-toggle ${isAlias ? 'fnm-toggle--alias' : 'fnm-toggle--original'}`}
        onClick={(e) => {
          e.stopPropagation()
          onModeChange(nextMode)
        }}
        aria-label={tooltipText}
      >
        {isAlias ? '별칭' : '원본'}
      </button>
    </Tooltip>
  )
}

