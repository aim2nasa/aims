/**
 * AliasAIButton — 별칭AI ↔ 완료 토글 버튼
 * ㅈ(전체 문서 보기)와 ㄱ(고객별 문서함)에서 동일하게 사용
 */
import React from 'react'
import { Button } from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'

export interface AliasAIButtonProps {
  /** 현재 별칭 모드 활성 여부 */
  active: boolean
  /** 클릭 핸들러 */
  onClick: () => void
  /** 비활성화 */
  disabled?: boolean
  /** Tooltip placement */
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right'
}

export const AliasAIButton: React.FC<AliasAIButtonProps> = ({
  active,
  onClick,
  disabled = false,
  tooltipPlacement = 'bottom',
}) => {
  return (
    <Tooltip
      content={active
        ? '선택된 문서의 별칭을 생성하고 종료합니다'
        : 'AI가 문서 내용을 분석하여 알아보기 쉬운 별칭을 자동 생성합니다'}
      placement={tooltipPlacement}
    >
      <Button
        variant="ghost"
        size="sm"
        className={`alias-ai-button ${active ? 'alias-ai-button--active' : ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={active ? '별칭 생성 완료' : '별칭 생성'}
      >
        <SFSymbol
          name={active ? 'checkmark' : 'sparkles'}
          size={SFSymbolSize.CAPTION_2}
          weight={SFSymbolWeight.MEDIUM}
          decorative
        />
        {active ? '완료' : '별칭AI'}
      </Button>
    </Tooltip>
  )
}
