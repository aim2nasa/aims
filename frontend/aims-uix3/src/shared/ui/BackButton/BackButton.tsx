/**
 * BackButton Component
 * @since 2026-03-22
 * @version 1.0.0
 *
 * Apple HIG Back 버튼 패턴 — 모든 뷰의 "돌아가기" 버튼 공통 컴포넌트
 * - chevron.left 아이콘 + 텍스트 (40-60대 사용자 대상: 텍스트 항상 표시)
 * - 테두리 없음, 투명 배경, 호버 시 opacity + scale
 * - CLAUDE.md 준수: 아이콘 max 17px, CSS 변수만 사용
 */

import React from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import { Tooltip } from '../Tooltip'
import './BackButton.css'

export interface BackButtonProps {
  /** 버튼 텍스트 (기본: "돌아가기") */
  label?: string
  /** 클릭 핸들러 */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** 툴팁 내용 (없으면 툴팁 미표시) */
  tooltipContent?: string
  /** 접근성 라벨 (기본: label 값) */
  ariaLabel?: string
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * BackButton 공통 컴포넌트
 *
 * @example
 * ```tsx
 * // 기본 사용
 * <BackButton onClick={() => window.history.back()} />
 *
 * // 커스텀 라벨
 * <BackButton label="목록" onClick={onCollapse} />
 *
 * // 툴팁 포함
 * <BackButton onClick={() => window.history.back()} tooltipContent="이전 페이지로 돌아가기" />
 * ```
 */
export const BackButton: React.FC<BackButtonProps> = ({
  label = '돌아가기',
  onClick,
  tooltipContent,
  ariaLabel,
  className = '',
}) => {
  const button = (
    <button
      className={`back-button ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel || label}
      type="button"
    >
      <SFSymbol
        name="chevron.left"
        size={SFSymbolSize.CAPTION_2}
        weight={SFSymbolWeight.SEMIBOLD}
        decorative={true}
      />
      <span className="back-button__label">{label}</span>
    </button>
  )

  if (tooltipContent) {
    return (
      <Tooltip content={tooltipContent} placement="bottom">
        {button}
      </Tooltip>
    )
  }

  return button
}

export default BackButton
