/**
 * InitialFilterBar
 * @description 문서 탐색기 초성 필터 바 - 한글/영문/숫자 초성으로 고객 필터링
 */

import React from 'react'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { InitialType } from './types/documentExplorer'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from './types/documentExplorer'

export interface InitialFilterBarProps {
  /** 초성 필터 타입 */
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
  /** 선택된 초성 */
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  /** 초성별 고객 카운트 (호버 시 표시) */
  initialCustomerCounts: Map<string, number>
}

/**
 * 초성 필터 바 컴포넌트
 */
export const InitialFilterBar: React.FC<InitialFilterBarProps> = ({
  initialType,
  onInitialTypeChange,
  selectedInitial,
  onSelectedInitialChange,
  initialCustomerCounts,
}) => {
  // 현재 초성 타입에 따른 초성 목록
  const initials = initialType === 'korean'
    ? KOREAN_INITIALS
    : initialType === 'alphabet'
      ? ALPHABET_INITIALS
      : NUMBER_INITIALS

  // 초성 타입 순환 (한글 → 영문 → 숫자 → 한글)
  const handleTypeToggle = () => {
    const nextType = initialType === 'korean' ? 'alphabet' : initialType === 'alphabet' ? 'number' : 'korean'
    onInitialTypeChange(nextType)
  }

  // 타입 레이블
  const typeLabel = initialType === 'korean' ? '한글' : initialType === 'alphabet' ? '영문' : '숫자'
  const typeShortLabel = initialType === 'korean' ? 'ㄱㄴ' : initialType === 'alphabet' ? 'AB' : '12'

  return (
    <div className="initial-filter-bar">
      {/* 초성 타입 토글 */}
      <div className="initial-filter-bar__type-section">
        <Tooltip content={`${typeLabel} 초성 (클릭하여 전환)`} placement="bottom">
          <button
            type="button"
            className="initial-filter-bar__type-toggle"
            onClick={handleTypeToggle}
            aria-label="초성 타입 전환"
          >
            <svg
              className="initial-filter-bar__globe-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="initial-filter-bar__type-label">{typeShortLabel}</span>
          </button>
        </Tooltip>
      </div>

      {/* 초성 버튼들 */}
      <div className="initial-filter-bar__initials">
        {initials.map((initial) => {
          const count = initialCustomerCounts.get(initial) || 0
          const hasCustomers = count > 0
          const isActive = selectedInitial === initial

          return (
            <Tooltip
              key={initial}
              content={hasCustomers ? `${initial}: ${count}명` : `${initial}: 해당 고객 없음`}
              placement="bottom"
            >
              <button
                type="button"
                className={`initial-filter-bar__initial ${isActive ? 'initial-filter-bar__initial--active' : ''} ${!hasCustomers ? 'initial-filter-bar__initial--empty' : ''}`}
                onClick={() => onSelectedInitialChange(isActive ? null : initial)}
                disabled={!hasCustomers}
                aria-label={`${initial}로 시작하는 고객`}
                aria-pressed={isActive}
              >
                {initial}
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* 선택된 초성 표시 및 해제 */}
      {selectedInitial && (
        <div className="initial-filter-bar__selected">
          <span className="initial-filter-bar__selected-label">
            선택: <strong>{selectedInitial}</strong>
          </span>
          <Tooltip content="초성 필터 해제" placement="bottom">
            <button
              type="button"
              className="initial-filter-bar__clear"
              onClick={() => onSelectedInitialChange(null)}
              aria-label="초성 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
