/**
 * DocumentStatusHeader Component
 * @version 3.0.0 - 🍎 완전 재설계
 *
 * 컨트롤 + 필터 한 줄 레이아웃
 * 공간 효율성 극대화
 */

import React from 'react'
import { Dropdown, Tooltip, type DropdownOption } from '@/shared/ui'
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
  // 🍎 Progressive Disclosure: 클릭 피드백 상태
  const [isRefreshClicked, setIsRefreshClicked] = React.useState(false)

  /**
   * 새로고침 버튼 클릭 핸들러
   * 클릭 피드백을 표시한 후 원래 상태로 복원
   */
  const handleRefreshClick = () => {
    setIsRefreshClicked(true)
    onRefresh()

    // 600ms 후 원래 아이콘으로 복원
    setTimeout(() => {
      setIsRefreshClicked(false)
    }, 600)
  }

  /**
   * 마지막 업데이트 시간 포맷팅
   * "오늘 HH:MM:SS" 형식으로 표시
   */
  const formatLastUpdated = (date: Date | null): string => {
    if (!date) return ''

    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    if (isToday) {
      return `오늘 ${hours}:${minutes}:${seconds}`
    } else {
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${month}.${day}. ${hours}:${minutes}:${seconds}`
    }
  }

  return (
    <div className="document-status-header">
      {/* 왼쪽: 필터 드롭다운 + 결과 카운트 */}
      <div className="header-left">
        <Dropdown
          value={statusFilter}
          options={FILTER_OPTIONS}
          onChange={(value) => onFilterChange(value as any)}
          aria-label="상태 필터"
          width={100}
        />
        <span className="result-count">
          {statusFilter === 'all' ? documentsCount : filteredCount}개
        </span>
      </div>

      {/* 중앙: 여백 */}
      <div className="header-spacer" />

      {/* 오른쪽: Last Updated + 폴링 토글 + 새로고침 */}
      <div className="header-right">
        {lastUpdated && (
          <span className="last-updated">
            최근 업데이트: {formatLastUpdated(lastUpdated)}
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

        <Tooltip content="새로고침">
          <button
            className="refresh-button"
            onClick={handleRefreshClick}
            disabled={isLoading}
            aria-label="새로고침"
          >
            <span className={"refresh-icon " + (isLoading ? 'icon-spinning' : isRefreshClicked ? 'icon-clicked' : '')}>
              {isRefreshClicked ? '✓' : '↻'}
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export default DocumentStatusHeader
