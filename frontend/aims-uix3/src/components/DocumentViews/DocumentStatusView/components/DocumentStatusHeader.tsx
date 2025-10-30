/**
 * DocumentStatusHeader Component
 * @version 3.0.0 - 🍎 완전 재설계
 *
 * 컨트롤 + 필터 한 줄 레이아웃
 * 공간 효율성 극대화
 */

import React, { useMemo, useCallback } from 'react'
import { Tooltip, Button } from '@/shared/ui'
import RefreshButton from '../../../RefreshButton/RefreshButton'
import './DocumentStatusHeader.css'

interface DocumentStatusHeaderProps {
  isPollingEnabled: boolean
  onTogglePolling: () => void
  onRefresh: () => void
  isLoading: boolean
  documentsCount: number
  lastUpdated: Date | null
  // 🍎 편집 모드 (DocumentLibrary용)
  showEditButton?: boolean
  isEditMode?: boolean
  onToggleEditMode?: () => void
  // 🍎 삭제 모드 액션 (DocumentLibrary용)
  selectedCount?: number
  onDeleteSelected?: () => void
  isDeleting?: boolean
}

export const DocumentStatusHeader: React.FC<DocumentStatusHeaderProps> = ({
  isPollingEnabled,
  onTogglePolling,
  onRefresh,
  isLoading,
  documentsCount,
  lastUpdated,
  showEditButton = false,
  isEditMode = false,
  onToggleEditMode,
  selectedCount = 0,
  onDeleteSelected,
  isDeleting = false
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

  const lastUpdatedLabel = useMemo(() => formatLastUpdated(lastUpdated), [formatLastUpdated, lastUpdated])

  return (
    <div className="document-status-header">
      {/* 메인 행 */}
      <div className="header-main-row">
        {/* 왼쪽: 편집 버튼 + 총 문서 개수 */}
        <div className="header-left">
          <div className="filter-group">
            {/* 🍎 편집 모드 아이콘 버튼 (DocumentLibrary 전용) */}
            {showEditButton && onToggleEditMode && (
              <Tooltip content={isEditMode ? '편집 완료' : '편집'}>
                <button
                  className={`edit-mode-icon-button ${isEditMode ? 'edit-mode-icon-button--active' : ''}`}
                  onClick={onToggleEditMode}
                  aria-label={isEditMode ? '편집 완료' : '편집'}
                >
                  {isEditMode ? (
                    // 완료 상태: 체크마크 아이콘
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    // 편집 상태: 연필 아이콘
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1 1-3.667 9-9z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </Tooltip>
            )}
            <span className="result-count">
              총 {documentsCount}개의 문서
            </span>
            {/* 🍎 삭제 모드일 때: 선택된 개수 + 삭제 버튼 */}
            {isEditMode && (
              <>
                <span className="selected-count-inline">
                  {selectedCount}개 선택됨
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteSelected}
                  disabled={isDeleting || selectedCount === 0}
                >
                  {isDeleting ? '삭제 중...' : '삭제'}
                </Button>
              </>
            )}
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
