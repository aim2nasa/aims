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
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../../components/DocumentActionIcons'
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
  // 🍎 Sort props
  sortField?: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | null
  sortDirection?: 'asc' | 'desc'
  onColumnSort?: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType') => void
  // 🍎 Delete mode props
  isDeleteMode?: boolean
  selectedDocumentIds?: Set<string>
  onSelectAll?: (checked: boolean) => void
  onSelectDocument?: (documentId: string, event: React.MouseEvent) => void
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
  onLinkClick,
  sortField,
  sortDirection,
  onColumnSort,
  isDeleteMode = false,
  selectedDocumentIds = new Set(),
  onSelectAll,
  onSelectDocument
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
    <div className={`document-status-list ${isDeleteMode ? 'document-status-list--delete-mode' : ''}`}>
      {/* 🍎 칼럼 헤더 - 스티키 포지셔닝으로 항상 보임 */}
      <div className="status-list-header">
        {/* 🍎 삭제 모드: 전체 선택 체크박스 */}
        {isDeleteMode && (
          <div className="header-checkbox">
            <input
              type="checkbox"
              checked={documents.length > 0 && documents.every(doc => selectedDocumentIds.has(doc._id ?? doc.id ?? ''))}
              onChange={(e) => onSelectAll?.(e.target.checked)}
              aria-label="전체 선택"
              className="document-select-all-checkbox"
            />
          </div>
        )}
        <div className="header-icon"></div>
        <div
          className={`header-filename ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('filename')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '파일명으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
            <path d="M9 1v3h3" stroke="#f5f6f7" strokeWidth="0.8" fill="none"/>
          </svg>
          <span>파일명</span>
          {sortField === 'filename' && (
            <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`header-size ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('fileSize')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '크기로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M8 2v6l4 2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
          <span>크기</span>
          {sortField === 'fileSize' && (
            <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`header-type ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('mimeType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '타입으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
          </svg>
          <span>타입</span>
          {sortField === 'mimeType' && (
            <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`header-date ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('uploadDate')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '업로드 날짜로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M2 6h12M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>업로드 날짜</span>
          {sortField === 'uploadDate' && (
            <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`header-status ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('status')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '상태로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M5 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>상태</span>
          {sortField === 'status' && (
            <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div className="header-actions">
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
          </svg>
          <span>액션</span>
        </div>
      </div>

      {documents.map((document, index) => {
        const status = DocumentStatusService.extractStatus(document)
        const progress = DocumentStatusService.extractProgress(document)
        const statusLabel = DocumentStatusService.getStatusLabel(status)
        const statusIcon = DocumentStatusService.getStatusIcon(status)
        const isLinked = Boolean(document.customer_relation)
        const isAnnualReport = document.is_annual_report === true
        // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
        const canLink = status === 'completed' && !isLinked && !isAnnualReport
        const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

        const documentId = document._id ?? document.id ?? null
        const key = documentId ?? `${DocumentStatusService.extractFilename(document)}-${index}`

        const isSelected = documentId ? selectedDocumentIds.has(documentId) : false

        return (
          <div
            key={key}
            className={`status-item ${isSelected ? 'status-item--selected' : ''}`}
            onClick={() => {
              if (documentId && onDocumentClick && !isDeleteMode) {
                onDocumentClick(documentId)
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (documentId && onDocumentClick && !isDeleteMode) {
                  onDocumentClick(documentId)
                }
              }
            }}
          >
            {/* 🍎 삭제 모드: 개별 선택 체크박스 */}
            {isDeleteMode && (
              <div
                className="document-checkbox-wrapper"
                onClick={(e) => {
                  if (documentId) {
                    onSelectDocument?.(documentId, e)
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  aria-label={`${DocumentStatusService.extractFilename(document)} 선택`}
                  className="document-checkbox"
                />
              </div>
            )}

            {/* 파일 타입 아이콘 */}
            <div className="document-icon-wrapper">
              <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, DocumentStatusService.extractFilename(document))}`}>
                <SFSymbol
                  name={DocumentUtils.getFileIcon(document.mimeType, DocumentStatusService.extractFilename(document))}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </div>
              {/* 🍎 AR BADGE: Annual Report 표시 */}
              {document.is_annual_report && (
                <Tooltip content="Annual Report">
                  <div className="document-ar-badge">
                    AR
                  </div>
                </Tooltip>
              )}
            </div>

            {/* 파일명 */}
            <div className="status-filename">
              {DocumentStatusService.extractFilename(document)}
            </div>

            {/* 크기 */}
            <span className="document-size">
              {DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(document))}
            </span>

            {/* 타입 */}
            <span className="document-type">
              {document.mimeType ? DocumentUtils.getFileExtension(document.mimeType) : '-'}
            </span>

            {/* 업로드 날짜 */}
            <div className="status-date">
              {DocumentStatusService.formatUploadDate(
                DocumentStatusService.extractUploadedDate(document)
              )}
            </div>

            {/* 상태 (아이콘 + 텍스트) */}
            <div className="status-cell">
              <Tooltip content={statusLabel}>
                <div className={"status-icon status-" + status}>
                  {statusIcon}
                </div>
              </Tooltip>
              <div className="status-text">
                {status === 'processing' && progress ? (
                  <span className="progress-text">{progress}%</span>
                ) : (
                  <span className="status-label">{statusLabel}</span>
                )}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="status-actions">
              <Tooltip content="상세 보기">
                <button
                  className="action-btn action-btn--detail"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDetailClick?.(document)
                  }}
                  aria-label="상세 보기"
                >
                  <EyeIcon />
                </button>
              </Tooltip>
              <Tooltip content="요약 보기">
                <button
                  className="action-btn action-btn--summary"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSummaryClick?.(document)
                  }}
                  aria-label="요약 보기"
                >
                  <SummaryIcon />
                </button>
              </Tooltip>
              <Tooltip content="전체 텍스트 보기">
                <button
                  className="action-btn action-btn--full"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFullTextClick?.(document)
                  }}
                  aria-label="전체 텍스트 보기"
                >
                  <DocumentIcon />
                </button>
              </Tooltip>
              <Tooltip content={linkTooltip}>
                <button
                  className="action-btn action-btn--link"
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
                  <LinkIcon />
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
