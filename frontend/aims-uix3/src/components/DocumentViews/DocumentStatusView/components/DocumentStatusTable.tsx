/**
 * DocumentStatusTable Component
 * @description 문서 처리 현황 테이블 컴포넌트
 * @since 1.0.0
 *
 * 🍎 Apple Design Principles:
 * - Clarity: 명확한 정보 계층 구조
 * - Deference: 테이블이 콘텐츠를 방해하지 않음
 * - Depth: 자연스러운 시각적 계층
 */

import React, { useMemo, useState } from 'react'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import type { Document } from '../../../../types/documentStatus'
import { Dropdown, type DropdownOption } from '@/shared/ui'
import './DocumentStatusTable.css'

interface DocumentStatusTableProps {
  /** 표시할 문서 목록 */
  documents: Document[]
  /** 로딩 상태 */
  isLoading: boolean
  /** 문서 상세 보기 핸들러 */
  onDocumentClick?: (document: Document) => void
  /** 문서 요약 보기 핸들러 */
  onSummaryClick?: (document: Document) => void
  /** 문서 전체 텍스트 보기 핸들러 */
  onFullTextClick?: (document: Document) => void
}

// 페이지당 항목 수 옵션 정의
const ITEMS_PER_PAGE_OPTIONS: DropdownOption[] = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
]

/**
 * DocumentStatusTable React 컴포넌트
 *
 * 문서 목록을 테이블 형태로 표시
 * 페이지네이션 포함
 *
 * @example
 * ```tsx
 * <DocumentStatusTable
 *   documents={filteredDocuments}
 *   isLoading={false}
 *   onDocumentClick={handleDocumentClick}
 * />
 * ```
 */
export const DocumentStatusTable: React.FC<DocumentStatusTableProps> = ({
  documents,
  isLoading,
  onDocumentClick,
  onSummaryClick,
  onFullTextClick
}) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 페이지네이션 계산
  const { paginatedDocuments, totalPages } = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    const paginated = documents.slice(start, end)
    const total = Math.ceil(documents.length / pageSize)

    return {
      paginatedDocuments: paginated,
      totalPages: total,
    }
  }, [documents, currentPage, pageSize])

  // 페이지 변경 핸들러
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // 페이지 크기 변경 핸들러
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value))
    setCurrentPage(1) // 페이지 크기 변경 시 첫 페이지로
  }

  // 상태별 아이콘
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓'
      case 'processing':
        return '⟳'
      case 'pending':
        return '⏱'
      case 'error':
        return '⚠'
      default:
        return '○'
    }
  }

  // 상태별 클래스
  const getStatusClass = (status: string) => {
    return `status-${status}`
  }

  // 날짜 포맷팅
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'

    const date = new Date(dateString)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="document-status-table-container">
      {/* 테이블 */}
      <div className="table-wrapper">
        <table className="document-status-table">
          <thead>
            <tr>
              <th className="col-filename">문서명</th>
              <th className="col-status">상태</th>
              <th className="col-progress">진행률</th>
              <th className="col-upload-date">업로드일</th>
              <th className="col-actions">작업</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && documents.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-loading">
                  <div className="loading-spinner" />
                  <span>문서 목록을 불러오는 중...</span>
                </td>
              </tr>
            ) : paginatedDocuments.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-empty">
                  문서가 없습니다.
                </td>
              </tr>
            ) : (
              paginatedDocuments.map((doc) => {
                const filename = DocumentStatusService.extractFilename(doc)
                const status = DocumentStatusService.extractStatus(doc)
                const progress = DocumentStatusService.extractProgress(doc)
                const uploadedDate = DocumentStatusService.extractUploadedDate(doc)
                const docId = doc._id || doc.id

                const isCompleted = status === 'completed'

                return (
                  <tr
                    key={docId}
                    className="table-row"
                  >
                    <td className="col-filename">
                      <div className="filename-cell">
                        <span className="filename-icon">📄</span>
                        <span className="filename-text" title={filename}>
                          {filename}
                        </span>
                      </div>
                    </td>
                    <td className="col-status">
                      <div className={`status-badge ${getStatusClass(status)}`}>
                        <span className="status-icon">{getStatusIcon(status)}</span>
                        <span className="status-text">
                          {status === 'completed' && '완료'}
                          {status === 'processing' && '처리중'}
                          {status === 'pending' && '대기'}
                          {status === 'error' && '오류'}
                        </span>
                      </div>
                    </td>
                    <td className="col-progress">
                      <div className="progress-cell">
                        <div className="progress-bar-wrapper">
                          <div
                            className={`progress-bar-fill ${getStatusClass(status)}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="progress-text">{progress}%</span>
                      </div>
                    </td>
                    <td className="col-upload-date">
                      <span className="date-text">{formatDate(uploadedDate)}</span>
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        <button
                          className="action-button action-button-detail"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDocumentClick?.(doc)
                          }}
                          aria-label="상세 보기"
                          title="상세 보기"
                        >
                          👁️
                        </button>
                        <button
                          className="action-button action-button-summary"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCompleted) onSummaryClick?.(doc)
                          }}
                          disabled={!isCompleted}
                          aria-label="요약 보기"
                          title={isCompleted ? '요약 보기' : '완료된 문서만 가능'}
                        >
                          📝
                        </button>
                        <button
                          className="action-button action-button-fulltext"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCompleted) onFullTextClick?.(doc)
                          }}
                          disabled={!isCompleted}
                          aria-label="전체 텍스트 보기"
                          title={isCompleted ? '전체 텍스트 보기' : '완료된 문서만 가능'}
                        >
                          📄
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 🍎 페이지네이션 - iOS Style (DocumentLibraryView와 동일) */}
      {documents.length > 0 && (
        <div className="table-pagination">
          {/* 🍎 페이지당 항목 수 선택 */}
          <div className="pagination-limit">
            <Dropdown
              value={String(pageSize)}
              options={ITEMS_PER_PAGE_OPTIONS}
              onChange={(value) => handlePageSizeChange({ target: { value } } as React.ChangeEvent<HTMLSelectElement>)}
              aria-label="페이지당 항목 수"
              width={100}
            />
          </div>

          {/* 🍎 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="pagination-button pagination-button--prev"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
              >
                <span className="pagination-arrow">‹</span>
              </button>

              <div className="pagination-info">
                <span className="pagination-current">{currentPage}</span>
                <span className="pagination-separator">/</span>
                <span className="pagination-total">{totalPages}</span>
              </div>

              <button
                className="pagination-button pagination-button--next"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="다음 페이지"
              >
                <span className="pagination-arrow">›</span>
              </button>
            </div>
          )}

          {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
          {totalPages <= 1 && <div className="pagination-spacer"></div>}
        </div>
      )}
    </div>
  )
}

export default DocumentStatusTable
