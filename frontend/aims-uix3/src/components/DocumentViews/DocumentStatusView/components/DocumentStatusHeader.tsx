/**
 * DocumentStatusHeader Component
 * @version 3.0.0 - 🍎 완전 재설계
 *
 * 컨트롤 + 필터 한 줄 레이아웃
 * 공간 효율성 극대화
 */

import React, { useMemo, useCallback } from 'react'
import { Dropdown, Tooltip, type DropdownOption } from '@/shared/ui'
import RefreshButton from '../../../RefreshButton/RefreshButton'
import './DocumentStatusHeader.css'

interface DocumentStatusHeaderProps {
  isPollingEnabled: boolean
  onTogglePolling: () => void
  onRefresh: () => void
  isLoading: boolean
  statusFilter: 'all' | 'completed' | 'processing' | 'error' | 'pending'
  onFilterChange: (filter: 'all' | 'completed' | 'processing' | 'error' | 'pending') => void
  documentsCount: number
  filteredCount: number
  lastUpdated: Date | null
}

const FILTER_OPTIONS: DropdownOption[] = [
  { value: 'all', label: '전체' },
  { value: 'completed', label: '완료' },
  { value: 'processing', label: '처리중' },
  { value: 'error', label: '오류' },
  { value: 'pending', label: '대기' },
]

export const DocumentStatusHeader: React.FC<DocumentStatusHeaderProps> = ({
  isPollingEnabled,
  onTogglePolling,
  onRefresh,
  isLoading,
  statusFilter,
  onFilterChange,
  documentsCount,
  filteredCount,
  lastUpdated
}) => {

  /**
   * 마지막 업데이트 시간 포맷팅
   * "YYYY.MM.DD HH:MM:SS" 형식으로 표시
   */
  const formatLastUpdated = useCallback((date: Date | null): string => {
    if (!date) return ''

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
  }, [])

  const handleFilterChange = useCallback(
    (value: string) => {
      onFilterChange(value as DocumentStatusHeaderProps['statusFilter'])
    },
    [onFilterChange]
  )

  const lastUpdatedLabel = useMemo(() => formatLastUpdated(lastUpdated), [formatLastUpdated, lastUpdated])

  return (
    <div className="document-status-header">
      {/* 메인 행 */}
      <div className="header-main-row">
        {/* 왼쪽: 필터 드롭다운 + 결과 카운트 */}
        <div className="header-left">
          <div className="filter-group">
            <span className="filter-label">상태 필터:</span>
            <Dropdown
              value={statusFilter}
              options={FILTER_OPTIONS}
              onChange={handleFilterChange}
              aria-label="상태 필터"
              width={100}
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">결과:</span>
            <span className="result-count">
              {statusFilter === 'all' ? documentsCount : filteredCount}개
            </span>
          </div>
        </div>

        {/* 중앙: 여백 */}
        <div className="header-spacer" />

        {/* 오른쪽: Last Updated + 폴링 토글 + 새로고침 */}
        <div className="header-right">
          {lastUpdated && (
            <span className="last-updated">
              최근 업데이트: {lastUpdatedLabel}
            </span>
          )}

          <Tooltip content={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}>
            <button
              className={"polling-toggle " + (isPollingEnabled ? 'polling-active' : 'polling-inactive')}
              onClick={onTogglePolling}
              aria-label={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}
            >
              <span className={"polling-dot " + (isPollingEnabled ? 'dot-active' : 'dot-inactive')}>●</span>
            </button>
          </Tooltip>

          <RefreshButton
            onClick={async () => {
              await onRefresh();
            }}
            loading={isLoading}
            tooltip="문서 현황 새로고침"
            size="small"
          />
        </div>
      </div>
    </div>
  )
}

export default DocumentStatusHeader
