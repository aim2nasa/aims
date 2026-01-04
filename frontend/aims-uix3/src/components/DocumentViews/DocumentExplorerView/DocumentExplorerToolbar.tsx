/**
 * DocumentExplorerToolbar
 * @description 문서 탐색기 툴바 - 분류 기준 선택, 검색, 펼치기/접기, 빠른 필터
 */

import React, { useCallback, useRef, useState, useMemo } from 'react'
import { Dropdown, type DropdownOption } from '@/shared/ui/Dropdown'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, QuickFilterType } from './types/documentExplorer'
import { GROUP_BY_LABELS, SORT_BY_LABELS, QUICK_FILTER_LABELS } from './types/documentExplorer'

// 빠른 필터 툴팁 설명
const QUICK_FILTER_TOOLTIPS: Record<QuickFilterType, string> = {
  none: '',
  today: '오늘 등록된 문서만 표시',
  thisWeek: '이번 주 등록된 문서만 표시',
}

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
  /** 정렬 기준 */
  sortBy: DocumentSortBy
  sortDirection: SortDirection
  onSortByChange: (sortBy: DocumentSortBy) => void
  /** 빠른 필터 */
  quickFilter: QuickFilterType
  onQuickFilterChange: (filter: QuickFilterType) => void
  /** 고객 필터 */
  customerFilter: string | null
  onCustomerFilterClear: () => void
  /** 날짜 점프 */
  onJumpToDate: (date: Date) => boolean
  getAvailableDates: () => Date[]
  /** 날짜 필터 */
  dateFilter: Date | null
  onDateFilterClear: () => void
}

const GROUP_BY_OPTIONS: DropdownOption[] = [
  { value: 'customer', label: '고객별' },
  { value: 'badgeType', label: '문서유형별' },
  { value: 'tag', label: '태그별' },
  { value: 'date', label: '날짜별' },
]

const SORT_OPTIONS: DocumentSortBy[] = ['name', 'customer', 'date', 'badgeType']

// 빠른 필터 칩 옵션 (전체 제외)
const QUICK_FILTER_OPTIONS: QuickFilterType[] = ['today', 'thisWeek']

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
  sortBy,
  sortDirection,
  onSortByChange,
  quickFilter,
  onQuickFilterChange,
  customerFilter,
  onCustomerFilterClear,
  onJumpToDate,
  getAvailableDates,
  dateFilter,
  onDateFilterClear,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const dateButtonRef = useRef<HTMLButtonElement>(null)

  // 문서가 있는 날짜 Set (빠른 조회용)
  const availableDatesSet = useMemo(() => {
    const dates = getAvailableDates()
    const set = new Set<string>()
    dates.forEach((date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      set.add(key)
    })
    return set
  }, [getAvailableDates])

  // 현재 보고 있는 달력의 년월 (단일 상태로 원자적 업데이트)
  const [calendarDate, setCalendarDate] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  }))

  const calendarYear = calendarDate.year
  const calendarMonth = calendarDate.month

  // 날짜 선택 핸들러
  const handleDateSelect = useCallback(
    (year: number, month: number, day: number) => {
      const date = new Date(year, month, day)
      const success = onJumpToDate(date)
      if (success) {
        setShowDatePicker(false)
      }
    },
    [onJumpToDate]
  )

  // 이전/다음 달 이동 (단일 상태로 원자적 업데이트)
  const goToPrevMonth = useCallback(() => {
    setCalendarDate((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 }
      }
      return { ...prev, month: prev.month - 1 }
    })
  }, [])

  const goToNextMonth = useCallback(() => {
    setCalendarDate((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 }
      }
      return { ...prev, month: prev.month + 1 }
    })
  }, [])

  // 오늘로 이동
  const goToToday = useCallback(() => {
    const today = new Date()
    setCalendarDate({ year: today.getFullYear(), month: today.getMonth() })
  }, [])

  // 달력 데이터 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1)
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
    const startDayOfWeek = firstDay.getDay() // 0 = 일요일

    const days: Array<{ day: number; hasDocuments: boolean; isToday: boolean } | null> = []

    // 이전 달의 빈 칸
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // 현재 달의 날짜들
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        day,
        hasDocuments: availableDatesSet.has(dateStr),
        isToday: dateStr === todayStr,
      })
    }

    return days
  }, [calendarYear, calendarMonth, availableDatesSet])

  // 월 이름
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

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
        <Dropdown
          options={GROUP_BY_OPTIONS}
          value={groupBy}
          onChange={handleGroupByChange}
        />
      </div>

      {/* 기타 분류 기준 (태그별 분류 시에만 표시) */}
      {groupBy === 'tag' && (
        <Tooltip content={`${minTagCount}건 이하 태그는 기타로 분류`} placement="bottom">
          <div className="doc-explorer-toolbar__min-count">
            <button
              type="button"
              className="doc-explorer-toolbar__stepper-btn"
              onClick={() => minTagCount > 1 && onMinTagCountChange(minTagCount - 1)}
              disabled={minTagCount <= 1}
              aria-label="기타 분류 기준 감소"
            >
              −
            </button>
            <span className="doc-explorer-toolbar__stepper-value">{minTagCount}</span>
            <button
              type="button"
              className="doc-explorer-toolbar__stepper-btn"
              onClick={() => minTagCount < 99 && onMinTagCountChange(minTagCount + 1)}
              disabled={minTagCount >= 99}
              aria-label="기타 분류 기준 증가"
            >
              +
            </button>
          </div>
        </Tooltip>
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
          placeholder="검색..."
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

      {/* 빠른 필터 칩 */}
      <div className="doc-explorer-toolbar__quick-filters">
        {QUICK_FILTER_OPTIONS.map((filter) => (
          <Tooltip key={filter} content={QUICK_FILTER_TOOLTIPS[filter]} placement="bottom">
            <button
              type="button"
              className={`doc-explorer-toolbar__filter-chip ${quickFilter === filter ? 'doc-explorer-toolbar__filter-chip--active' : ''}`}
              onClick={() => onQuickFilterChange(quickFilter === filter ? 'none' : filter)}
            >
              {QUICK_FILTER_LABELS[filter]}
            </button>
          </Tooltip>
        ))}

        {/* 날짜 점프 버튼 */}
        <div className="doc-explorer-toolbar__date-jump">
          <Tooltip content="날짜로 이동" placement="bottom">
            <button
              ref={dateButtonRef}
              type="button"
              className={`doc-explorer-toolbar__date-btn ${showDatePicker ? 'doc-explorer-toolbar__date-btn--active' : ''}`}
              onClick={() => setShowDatePicker(!showDatePicker)}
              disabled={availableDatesSet.size === 0}
              aria-label="날짜로 이동"
            >
              <SFSymbol
                name="calendar"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>

          {/* 달력 팝오버 */}
          {showDatePicker && (
            <>
              <div
                className="doc-explorer-toolbar__date-backdrop"
                onClick={() => setShowDatePicker(false)}
              />
              <div
                ref={datePickerRef}
                className="doc-explorer-toolbar__calendar"
              >
                {/* 달력 헤더 */}
                <div className="doc-explorer-toolbar__calendar-header">
                  <button
                    type="button"
                    className="doc-explorer-toolbar__calendar-nav"
                    onClick={goToPrevMonth}
                    aria-label="이전 달"
                  >
                    ‹
                  </button>
                  <Tooltip content="오늘로 이동" placement="bottom">
                    <button
                      type="button"
                      className="doc-explorer-toolbar__calendar-title"
                      onClick={goToToday}
                      aria-label="오늘로 이동"
                    >
                      {calendarYear}년 {monthNames[calendarMonth]}
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className="doc-explorer-toolbar__calendar-nav"
                    onClick={goToNextMonth}
                    aria-label="다음 달"
                  >
                    ›
                  </button>
                </div>

                {/* 요일 헤더 */}
                <div className="doc-explorer-toolbar__calendar-weekdays">
                  {dayNames.map((day, i) => (
                    <div
                      key={day}
                      className={`doc-explorer-toolbar__calendar-weekday ${i === 0 ? 'doc-explorer-toolbar__calendar-weekday--sunday' : ''}`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="doc-explorer-toolbar__calendar-grid">
                  {calendarDays.map((dayInfo, index) => (
                    <div key={index} className="doc-explorer-toolbar__calendar-cell">
                      {dayInfo && (
                        <button
                          type="button"
                          className={`doc-explorer-toolbar__calendar-day ${dayInfo.hasDocuments ? 'doc-explorer-toolbar__calendar-day--has-docs' : ''} ${dayInfo.isToday ? 'doc-explorer-toolbar__calendar-day--today' : ''}`}
                          onClick={() => dayInfo.hasDocuments && handleDateSelect(calendarYear, calendarMonth, dayInfo.day)}
                          disabled={!dayInfo.hasDocuments}
                        >
                          {dayInfo.day}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 범례 */}
                <div className="doc-explorer-toolbar__calendar-legend">
                  <span className="doc-explorer-toolbar__calendar-legend-item">
                    <span className="doc-explorer-toolbar__calendar-legend-dot" />
                    문서 있음
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 고객 필터 표시 (활성화 시) */}
      {customerFilter && (
        <div className="doc-explorer-toolbar__customer-filter">
          <span className="doc-explorer-toolbar__customer-filter-label">
            <SFSymbol
              name="person.fill"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative
            />
            {customerFilter}
          </span>
          <Tooltip content="필터 해제" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__customer-filter-clear"
              onClick={onCustomerFilterClear}
              aria-label="고객 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}

      {/* 날짜 필터 표시 (활성화 시) */}
      {dateFilter && (
        <div className="doc-explorer-toolbar__date-filter">
          <span className="doc-explorer-toolbar__date-filter-label">
            <SFSymbol
              name="calendar"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative
            />
            {dateFilter.getFullYear()}.{String(dateFilter.getMonth() + 1).padStart(2, '0')}.{String(dateFilter.getDate()).padStart(2, '0')}
          </span>
          <Tooltip content="날짜 필터 해제" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__date-filter-clear"
              onClick={onDateFilterClear}
              aria-label="날짜 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}

      {/* 액션 버튼들 */}
      <div className="doc-explorer-toolbar__actions">
        <Tooltip content={isAllExpanded ? '모두 접기' : '모두 펼치기'} placement="bottom">
          <button
            type="button"
            className="doc-explorer-toolbar__expand-btn"
            onClick={onToggleExpandAll}
            aria-label={isAllExpanded ? '모두 접기' : '모두 펼치기'}
          >
            {isAllExpanded ? (
              /* 접기: 트리가 접힌 모양 (평평한 리스트) */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              /* 펼치기: 트리가 펼쳐진 모양 (들여쓰기 리스트) */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M6 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </Tooltip>
      </div>

      {/* 정렬 기준 */}
      <div className="doc-explorer-toolbar__sort">
        <div className="doc-explorer-toolbar__sort-buttons">
          {SORT_OPTIONS.map((option) => (
            <Tooltip key={option} content={`${SORT_BY_LABELS[option]}순 정렬`} placement="bottom">
              <button
                type="button"
                className={`doc-explorer-toolbar__sort-btn ${sortBy === option ? 'doc-explorer-toolbar__sort-btn--active' : ''}`}
                onClick={() => onSortByChange(option)}
                aria-label={`${SORT_BY_LABELS[option]}순 정렬`}
              >
                {SORT_BY_LABELS[option]}
                {sortBy === option && (
                  <SFSymbol
                    name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
                    size={SFSymbolSize.CAPTION_2}
                    weight={SFSymbolWeight.MEDIUM}
                    className="doc-explorer-toolbar__sort-icon"
                    decorative
                  />
                )}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* 통계 */}
      <div className="doc-explorer-toolbar__stats">
        <span className="doc-explorer-toolbar__stat">
          {GROUP_BY_LABELS[groupBy]} {groupCount}
        </span>
        <span className="doc-explorer-toolbar__stat-separator">·</span>
        <span className="doc-explorer-toolbar__stat">
          문서 {totalDocuments}
        </span>
      </div>
    </div>
  )
}
