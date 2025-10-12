/**
 * DocumentStatusList Component
 * @version 3.0.0 - 🍎 DocumentLibrary 리스트 구조 완벽 복제
 *
 * 공간 효율적인 리스트 레이아웃
 */

import React from 'react'
import { Tooltip } from '@/shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import type { Document } from '../../../../types/documentStatus'
import './DocumentStatusList.css'

export interface DocumentStatusListProps {
  documents: Document[]
  isLoading: boolean
  isEmpty: boolean
  error: string | null
  onDocumentClick?: (documentId: string) => void
  onDetailClick?: (document: Document) => void
  onSummaryClick?: (document: Document) => void
  onFullTextClick?: (document: Document) => void
  onLinkClick?: (document: Document) => void
}

export const DocumentStatusList: React.FC<DocumentStatusListProps> = ({
  documents,
  isLoading,
  isEmpty,
  error,
  onDocumentClick,
  onDetailClick,
  onSummaryClick,
  onFullTextClick,
  onLinkClick
}) => {
  // 로딩 상태
  if (isLoading && isEmpty) {
    return (
      <div className="document-status-list">
        <div className="list-loading">
          <div className="loading-spinner" aria-label="로딩 중" />
          <span>문서를 불러오는 중...</span>
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className="document-status-list">
        <div className="list-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // 빈 상태
  if (isEmpty) {
    return (
      <div className="document-status-list">
        <div className="list-empty">
          <span className="empty-icon">📄</span>
          <p className="empty-message">문서가 없습니다.</p>
        </div>
      </div>
    )
  }

  // 리스트 렌더링
  return (
    <div className="document-status-list">
      {documents.map((document, index) => {
        const status = DocumentStatusService.extractStatus(document)
        const progress = DocumentStatusService.extractProgress(document)
        const statusLabel = DocumentStatusService.getStatusLabel(status)
        const statusIcon = DocumentStatusService.getStatusIcon(status)
        const isLinked = Boolean(document.customer_relation)
        const canLink = status === 'completed' && !isLinked
        const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

        const documentId = document._id ?? document.id ?? null
        const key = documentId ?? `${DocumentStatusService.extractFilename(document)}-${index}`

        return (
          <div
            key={key}
            className="status-item"
            onClick={() => {
              if (documentId && onDocumentClick) {
                onDocumentClick(documentId)
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (documentId && onDocumentClick) {
                  onDocumentClick(documentId)
                }
              }
            }}
          >
            {/* 파일 타입 아이콘 */}
            <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, DocumentStatusService.extractFilename(document))}`}>
              <SFSymbol
                name={DocumentUtils.getFileIcon(document.mimeType, DocumentStatusService.extractFilename(document))}
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
            </div>

            {/* 파일명 */}
            <div className="status-filename">
              {DocumentStatusService.extractFilename(document)}
            </div>

            {/* 상태 아이콘 */}
            <Tooltip content={statusLabel}>
              <div className={"status-icon status-" + status}>
                {statusIcon}
              </div>
            </Tooltip>

            {/* 진행률 */}
            <div className="status-progress">
              {status === 'processing' && progress && (
                <span className="progress-text">{progress}%</span>
              )}
            </div>

            {/* 업로드 날짜 */}
            <div className="status-date">
              {DocumentStatusService.formatUploadDate(
                DocumentStatusService.extractUploadedDate(document)
              )}
            </div>

            {/* 액션 버튼 */}
            <div className="status-actions">
              <Tooltip content="상세 보기">
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDetailClick?.(document)
                  }}
                  aria-label="상세 보기"
                >
                  👁️
                </button>
              </Tooltip>
              <Tooltip content="요약 보기">
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSummaryClick?.(document)
                  }}
                  aria-label="요약 보기"
                >
                  📋
                </button>
              </Tooltip>
              <Tooltip content="전체 텍스트 보기">
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFullTextClick?.(document)
                  }}
                  aria-label="전체 텍스트 보기"
                >
                  📄
                </button>
              </Tooltip>
              <Tooltip content={linkTooltip}>
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (canLink) {
                      onLinkClick?.(document)
                    }
                  }}
                  aria-label={linkTooltip}
                  aria-disabled={!canLink}
                  data-disabled={!canLink}
                  tabIndex={canLink ? 0 : -1}
                >
                  🔗
                </button>
              </Tooltip>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DocumentStatusList
