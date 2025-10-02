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
  filteredCount
}) => {
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

      {/* 오른쪽: 폴링 토글 + 새로고침 */}
      <div className="header-right">
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
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="새로고침"
          >
            <span className={"refresh-icon " + (isLoading ? 'icon-spinning' : '')}>↻</span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export default DocumentStatusHeader
