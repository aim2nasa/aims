/**
 * DocumentExplorerToolbar
 * @description 문서 탐색기 툴바 - 분류 기준 선택, 검색, 펼치기/접기
 */

import React, { useCallback, useRef } from 'react'
import { Dropdown, type DropdownOption } from '@/shared/ui/Dropdown'
import Button from '@/shared/ui/Button'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { DocumentGroupBy } from './types/documentExplorer'
import { GROUP_BY_LABELS } from './types/documentExplorer'

export interface DocumentExplorerToolbarProps {
  groupBy: DocumentGroupBy
  onGroupByChange: (groupBy: DocumentGroupBy) => void
  searchTerm: string
  onSearchChange: (term: string) => void
  isAllExpanded: boolean
  onToggleExpandAll: () => void
  onRefresh: () => void
  totalDocuments: number
  groupCount: number
  isLoading?: boolean
  /** 기타 분류 최소 기준 (태그별 분류 시) */
  minTagCount: number
  onMinTagCountChange: (value: number) => void
}

const GROUP_BY_OPTIONS: DropdownOption[] = [
  { value: 'customer', label: '고객별' },
  { value: 'badgeType', label: '문서유형별' },
  { value: 'tag', label: '태그별' },
  { value: 'date', label: '날짜별' },
]

export const DocumentExplorerToolbar: React.FC<DocumentExplorerToolbarProps> = ({
  groupBy,
  onGroupByChange,
  searchTerm,
  onSearchChange,
  isAllExpanded,
  onToggleExpandAll,
  onRefresh,
  totalDocuments,
  groupCount,
  isLoading = false,
  minTagCount,
  onMinTagCountChange,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleGroupByChange = useCallback(
    (value: string) => {
      onGroupByChange(value as DocumentGroupBy)
    },
    [onGroupByChange]
  )

  const handleSearchClear = useCallback(() => {
    onSearchChange('')
    searchInputRef.current?.focus()
  }, [onSearchChange])

  return (
    <div className="doc-explorer-toolbar">
      {/* 분류 기준 드롭다운 */}
      <div className="doc-explorer-toolbar__group">
        <span className="doc-explorer-toolbar__label">분류:</span>
        <Dropdown
          options={GROUP_BY_OPTIONS}
          value={groupBy}
          onChange={handleGroupByChange}
        />
      </div>

      {/* 기타 분류 기준 (태그별 분류 시에만 표시) */}
      {groupBy === 'tag' && (
        <div className="doc-explorer-toolbar__min-count" title={`${minTagCount}건 이하 태그는 기타로 분류`}>
          <button
            type="button"
            className="doc-explorer-toolbar__stepper-btn"
            onClick={() => minTagCount > 1 && onMinTagCountChange(minTagCount - 1)}
            disabled={minTagCount <= 1}
          >
            −
          </button>
          <span className="doc-explorer-toolbar__stepper-value">{minTagCount}</span>
          <button
            type="button"
            className="doc-explorer-toolbar__stepper-btn"
            onClick={() => minTagCount < 99 && onMinTagCountChange(minTagCount + 1)}
            disabled={minTagCount >= 99}
          >
            +
          </button>
        </div>
      )}

      {/* 검색 입력 */}
      <div className="doc-explorer-toolbar__search">
        <SFSymbol
          name="magnifyingglass"
          size={SFSymbolSize.CAPTION_1}
          weight={SFSymbolWeight.REGULAR}
          className="doc-explorer-toolbar__search-icon"
        />
        <input
          ref={searchInputRef}
          type="text"
          className="doc-explorer-toolbar__search-input"
          placeholder="문서 검색..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            className="doc-explorer-toolbar__search-clear"
            onClick={handleSearchClear}
            aria-label="검색어 지우기"
          >
            <SFSymbol
              name="xmark.circle.fill"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.REGULAR}
            />
          </button>
        )}
      </div>

      {/* 액션 버튼들 */}
      <div className="doc-explorer-toolbar__actions">
        <Button
          variant="ghost"
          onClick={onToggleExpandAll}
          title={isAllExpanded ? '모두 접기' : '모두 펼치기'}
        >
          <SFSymbol
            name={isAllExpanded ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>{isAllExpanded ? '접기' : '펼치기'}</span>
        </Button>

        <Button
          variant="ghost"
          onClick={onRefresh}
          disabled={isLoading}
          title="새로고침"
        >
          <SFSymbol
            name="arrow.clockwise"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            className={isLoading ? 'spinning' : ''}
          />
        </Button>
      </div>

      {/* 통계 */}
      <div className="doc-explorer-toolbar__stats">
        <span className="doc-explorer-toolbar__stat">
          {GROUP_BY_LABELS[groupBy]} {groupCount}개
        </span>
        <span className="doc-explorer-toolbar__stat-separator">·</span>
        <span className="doc-explorer-toolbar__stat">
          문서 {totalDocuments}개
        </span>
      </div>
    </div>
  )
}
