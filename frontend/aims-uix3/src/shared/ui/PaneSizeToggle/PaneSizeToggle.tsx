/**
 * PaneSizeToggle Component
 * @since 2026-03-30
 *
 * RightPane 크기를 대/중/소 3단계로 전환하는 Apple 스타일 세그먼트 컨트롤
 * centerWidth 프리셋: 50%(대), 65%(중), 80%(소)
 */

import React from 'react'
import './PaneSizeToggle.css'

/** 프리셋 크기 정의 */
export const PANE_SIZE_PRESETS = {
  large: 50,   // 대: RightPane이 가장 넓음
  medium: 65,  // 중
  small: 80,   // 소: RightPane이 가장 좁음
} as const

export type PaneSizeKey = keyof typeof PANE_SIZE_PRESETS

interface PaneSizeToggleProps {
  /** 현재 centerWidth 퍼센트 값 */
  currentCenterWidth: number
  /** centerWidth 변경 핸들러 */
  onSizeChange: (centerWidth: number) => void
}

/** 현재 centerWidth가 프리셋과 일치하는지 판단 (±0.5 허용) */
function getActivePreset(centerWidth: number): PaneSizeKey | null {
  for (const [key, value] of Object.entries(PANE_SIZE_PRESETS)) {
    if (Math.abs(centerWidth - value) < 0.5) {
      return key as PaneSizeKey
    }
  }
  return null
}

const SIZE_LABELS: { key: PaneSizeKey; label: string }[] = [
  { key: 'large', label: '대' },
  { key: 'medium', label: '중' },
  { key: 'small', label: '소' },
]

export const PaneSizeToggle: React.FC<PaneSizeToggleProps> = ({
  currentCenterWidth,
  onSizeChange,
}) => {
  const activePreset = getActivePreset(currentCenterWidth)

  return (
    <div className="pane-size-toggle" role="group" aria-label="패널 크기 조절">
      {SIZE_LABELS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`pane-size-toggle__btn ${activePreset === key ? 'pane-size-toggle__btn--active' : ''}`}
          onClick={() => onSizeChange(PANE_SIZE_PRESETS[key])}
          aria-pressed={activePreset === key}
          aria-label={`패널 크기 ${label}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default PaneSizeToggle
