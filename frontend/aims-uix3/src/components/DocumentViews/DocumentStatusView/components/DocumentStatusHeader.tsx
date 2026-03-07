/**
 * DocumentStatusHeader Component
 * @version 3.0.0 - 🍎 완전 재설계
 *
 * 컨트롤 + 필터 한 줄 레이아웃
 * 공간 효율성 극대화
 */

import React from 'react'
import { Tooltip, Button } from '@/shared/ui'
import './DocumentStatusHeader.css'

interface DocumentStatusHeaderProps {
  documentsCount: number
  // 🍎 편집 모드 (DocumentLibrary용)
  showEditButton?: boolean
  isEditMode?: boolean
  onToggleEditMode?: () => void
  // 🍎 삭제 모드 액션 (DocumentLibrary용)
  selectedCount?: number
  onDeleteSelected?: () => void
  isDeleting?: boolean
  // 🍎 총 문서 개수 표시 여부 (DocumentLibrary에서는 별도 영역에 표시)
  showDocumentsCount?: boolean
}

export const DocumentStatusHeader: React.FC<DocumentStatusHeaderProps> = ({
  documentsCount,
  showEditButton = false,
  isEditMode = false,
  onToggleEditMode,
  selectedCount = 0,
  onDeleteSelected,
  isDeleting = false,
  showDocumentsCount = true
}) => {

  return (
    <div className="document-status-header">
      {/* 메인 행 */}
      <div className="header-main-row">
        {/* 왼쪽: 편집 버튼 + 총 문서 개수 (선택적) */}
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
            {/* 🍎 총 문서 개수 (showDocumentsCount가 true일 때만 표시) */}
            {showDocumentsCount && (
              <span className="result-count">
                총 {documentsCount}개의 문서
              </span>
            )}
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
      </div>
    </div>
  )
}

export default DocumentStatusHeader
