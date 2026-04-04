/**
 * BatchCrMappingModal
 * @description CRS 파일 일괄 매핑 확인 모달 (엑셀 스타일 테이블 UI)
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { DraggableModal, Button } from '@/shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type {
  CrFileGroup,
  CrBatchMappingState,
  CrTableViewState,
  CrFileTableRow,
  CrTableSortField,
  CrMappingStatusFilter,
} from '../../types/crBatchTypes'
import type { BatchRegistrationSummary } from '../../types/batchTypes'
import {
  isAllRowsMapped,
  getIncludedRowsCount,
  getEffectiveMapping,
} from '../../utils/crGroupingUtils'
import { CrFileTable } from './CrFileTable'
// CSS는 AR 스타일 재사용 (Phase 2에서 공통화)
import '../BatchArMappingModal/BatchArMappingModal.layout.css'
import '../BatchArMappingModal/BatchArMappingModal.content.css'
import '../BatchArMappingModal/BatchArMappingModal.results.css'

// ============================================
// 등록 결과 요약 컴포넌트 (CRS)
// ============================================

function formatElapsedTime(startedAt: number, completedAt: number): string {
  const elapsed = Math.floor((completedAt - startedAt) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  if (minutes > 0) return `${minutes}분 ${seconds}초`
  return `${seconds}초`
}

interface CrRegistrationSummaryProps {
  result: BatchRegistrationSummary
  originalTotalFiles: number
  crDetectedFiles: number
  excludedFiles: Array<{ fileName: string; status: string; error?: string }>
  showSkipped: boolean
  showFailed: boolean
  showExcluded: boolean
  onToggleSkipped: () => void
  onToggleFailed: () => void
  onToggleExcluded: () => void
}

const CrRegistrationSummary: React.FC<CrRegistrationSummaryProps> = ({
  result,
  originalTotalFiles,
  crDetectedFiles,
  excludedFiles,
  showSkipped,
  showFailed,
  showExcluded,
  onToggleSkipped,
  onToggleFailed,
  onToggleExcluded,
}) => {
  const hasErrors = result.errorCount > 0
  const isFullSuccess = result.errorCount === 0 && result.skippedCount === 0
  const totalCustomers = result.newCustomerCount + result.existingCustomerCount

  const statusIcon = hasErrors ? 'exclamationmark-circle-fill' : 'checkmark-circle-fill'
  const statusClass = hasErrors ? 'warning' : 'success'
  const statusTitle = hasErrors
    ? 'CRS 일괄 등록 완료 (일부 실패)'
    : isFullSuccess
    ? 'CRS 일괄 등록 완료'
    : 'CRS 일괄 등록 완료'

  const description = `${originalTotalFiles}개 파일 중 ${result.successCount}개 등록 완료`

  return (
    <div className="batch-ar-modal__result">
      <div className={`batch-ar-modal__result-icon ${statusClass}`}>
        <SFSymbol name={statusIcon} size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />
      </div>

      <h2 className="batch-ar-modal__result-title">{statusTitle}</h2>
      <p className="batch-ar-modal__result-description">{description}</p>

      <div className="batch-ar-modal__result-stats">
        <div className="batch-ar-modal__result-stat">
          <span className="batch-ar-modal__result-stat-value">{originalTotalFiles}개</span>
          <span className="batch-ar-modal__result-stat-label">업로드</span>
        </div>
        <div className="batch-ar-modal__result-stat">
          <span className="batch-ar-modal__result-stat-value">{crDetectedFiles}개</span>
          <span className="batch-ar-modal__result-stat-label">CRS 감지</span>
        </div>
        <div className="batch-ar-modal__result-stat">
          <span className="batch-ar-modal__result-stat-value success">{result.successCount}개</span>
          <span className="batch-ar-modal__result-stat-label">등록</span>
        </div>
        {result.skippedCount > 0 && (
          <div className="batch-ar-modal__result-stat">
            <span className="batch-ar-modal__result-stat-value skipped">{result.skippedCount}개</span>
            <span className="batch-ar-modal__result-stat-label">건너뜀</span>
          </div>
        )}
        {result.errorCount > 0 && (
          <div className="batch-ar-modal__result-stat">
            <span className="batch-ar-modal__result-stat-value error">{result.errorCount}개</span>
            <span className="batch-ar-modal__result-stat-label">실패</span>
          </div>
        )}
      </div>

      <div className="batch-ar-modal__result-stats">
        {result.newCustomerCount > 0 && (
          <div className="batch-ar-modal__result-stat">
            <span className="batch-ar-modal__result-stat-value">{result.newCustomerCount}명</span>
            <span className="batch-ar-modal__result-stat-label">신규 고객</span>
          </div>
        )}
        {result.existingCustomerCount > 0 && (
          <div className="batch-ar-modal__result-stat">
            <span className="batch-ar-modal__result-stat-value">{result.existingCustomerCount}명</span>
            <span className="batch-ar-modal__result-stat-label">기존 고객</span>
          </div>
        )}
        {totalCustomers > 0 && (
          <div className="batch-ar-modal__result-stat">
            <span className="batch-ar-modal__result-stat-value">{totalCustomers}명</span>
            <span className="batch-ar-modal__result-stat-label">총 고객</span>
          </div>
        )}
        <div className="batch-ar-modal__result-stat">
          <span className="batch-ar-modal__result-stat-value">{formatElapsedTime(result.startedAt, result.completedAt)}</span>
          <span className="batch-ar-modal__result-stat-label">소요 시간</span>
        </div>
      </div>

      {result.skippedFiles.length > 0 && (
        <div className="batch-ar-modal__result-detail">
          <button type="button" className="batch-ar-modal__result-detail-toggle" onClick={onToggleSkipped}>
            <span className="batch-ar-modal__result-detail-label skipped">건너뛴 파일 ({result.skippedFiles.length}개)</span>
            <span className="batch-ar-modal__result-detail-arrow">{showSkipped ? '\u25BE' : '\u25B8'}</span>
          </button>
          {showSkipped && (
            <div className="batch-ar-modal__result-detail-list">
              {result.skippedFiles.map((f, idx) => (
                <div key={idx} className="batch-ar-modal__result-detail-item">
                  <span className="batch-ar-modal__result-detail-name" title={f.fileName}>{f.fileName}</span>
                  <span className="batch-ar-modal__result-detail-reason">{f.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result.failedFiles.length > 0 && (
        <div className="batch-ar-modal__result-detail">
          <button type="button" className="batch-ar-modal__result-detail-toggle" onClick={onToggleFailed}>
            <span className="batch-ar-modal__result-detail-label error">실패 파일 ({result.failedFiles.length}개)</span>
            <span className="batch-ar-modal__result-detail-arrow">{showFailed ? '\u25BE' : '\u25B8'}</span>
          </button>
          {showFailed && (
            <div className="batch-ar-modal__result-detail-list">
              {result.failedFiles.map((f, idx) => (
                <div key={idx} className="batch-ar-modal__result-detail-item error">
                  <span className="batch-ar-modal__result-detail-name" title={f.fileName}>{f.fileName}</span>
                  <span className="batch-ar-modal__result-detail-reason">{f.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {excludedFiles.length > 0 && (
        <div className="batch-ar-modal__result-detail">
          <button type="button" className="batch-ar-modal__result-detail-toggle" onClick={onToggleExcluded}>
            <span className="batch-ar-modal__result-detail-label muted">제외된 파일 ({excludedFiles.length}개)</span>
            <span className="batch-ar-modal__result-detail-arrow">{showExcluded ? '\u25BE' : '\u25B8'}</span>
          </button>
          {showExcluded && (
            <div className="batch-ar-modal__result-detail-list">
              {excludedFiles.map((f, idx) => (
                <div key={idx} className="batch-ar-modal__result-detail-item">
                  <span className="batch-ar-modal__result-detail-name" title={f.fileName}>{f.fileName}</span>
                  <span className="batch-ar-modal__result-detail-reason">{f.status === 'failed' ? 'CRS 분석 실패' : 'CRS 아님'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// 메인 모달 컴포넌트
// ============================================

export interface BatchCrMappingModalProps {
  /** 일괄 매핑 상태 */
  state: CrBatchMappingState
  /** 테이블 뷰 상태 */
  tableState: CrTableViewState
  /** 모달 닫기 */
  onClose: () => void
  /** 테이블 행 고객 매핑 업데이트 */
  onUpdateRowMapping: (fileId: string, customerId: string | null, customerName?: string) => void
  /** 테이블 행 새 고객 이름 업데이트 */
  onUpdateRowNewCustomer: (fileId: string, newCustomerName: string) => void
  /** 테이블 행 선택 토글 */
  onToggleRow: (fileId: string) => void
  /** 모든 테이블 행 선택/해제 */
  onSelectAllRows: (selected: boolean) => void
  /** 특정 행들 선택/해제 (토글이 아닌 직접 설정) */
  onSetRowsSelection: (fileIds: string[], selected: boolean) => void
  /** 선택된 행들에 고객 일괄 할당 */
  onBulkAssignCustomer: (fileIds: string[], customerId: string, customerName: string) => void
  /** 선택된 행들에 새 고객 이름 일괄 할당 */
  onBulkAssignNewCustomer: (fileIds: string[], newCustomerName: string) => void
  /** 테이블 행 포함/제외 토글 */
  onToggleFileIncluded: (fileId: string) => void
  /** 테이블 정렬 설정 */
  onSetSort: (field: CrTableSortField | null, direction: 'asc' | 'desc') => void
  /** 테이블 페이지 변경 */
  onSetPage: (page: number) => void
  /** 페이지당 항목 수 변경 */
  onSetItemsPerPage: (count: number) => void
  /** 테이블 검색어 설정 */
  onSetSearchQuery: (query: string) => void
  /** 테이블 필터 설정 */
  onSetFilter: (filter: CrMappingStatusFilter) => void
  /** 등록 시작 (현재 테이블 행 전달) */
  onRegister: (rows: CrFileTableRow[]) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: (fileId: string, defaultName: string) => void
}

export const BatchCrMappingModal: React.FC<BatchCrMappingModalProps> = ({
  state,
  tableState,
  onClose,
  onUpdateRowMapping,
  onUpdateRowNewCustomer,
  onToggleRow,
  onSelectAllRows,
  onSetRowsSelection,
  onBulkAssignCustomer,
  onBulkAssignNewCustomer,
  onToggleFileIncluded,
  onSetSort,
  onSetPage,
  onSetItemsPerPage,
  onSetSearchQuery,
  onSetFilter,
  onRegister,
  onOpenNewCustomerModal,
}) => {
  const { isOpen, isAnalyzing, isProcessing, progress, totalFiles, originalTotalFiles, completedFiles, currentFileName, analyzingFiles, registrationResult } = state
  const { rows, groups } = tableState
  const [showHelp, setShowHelp] = useState(false)
  const [showExcluded, setShowExcluded] = useState(true)
  const [showSkipped, setShowSkipped] = useState(true)
  const [showFailed, setShowFailed] = useState(true)

  // 파일 목록 아이템 refs (자동 스크롤용)
  const fileItemRefs = useRef<(HTMLDivElement | null)[]>([])

  // 현재 분석 중인 파일의 인덱스 찾기
  const currentAnalyzingIndex = useMemo(() => {
    return analyzingFiles?.findIndex(f => f.status === 'analyzing') ?? -1
  }, [analyzingFiles])

  // 분석 중인 파일로 자동 스크롤
  useEffect(() => {
    if (currentAnalyzingIndex >= 0 && fileItemRefs.current[currentAnalyzingIndex]) {
      fileItemRefs.current[currentAnalyzingIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentAnalyzingIndex])

  // 분석 제외 파일 목록 (CRS 아님 + 분석 실패)
  const excludedFiles = useMemo(() => {
    if (!analyzingFiles || isAnalyzing) return []
    return analyzingFiles.filter(f => f.status === 'non_ar' || f.status === 'failed')
  }, [analyzingFiles, isAnalyzing])

  // 통계 계산
  const stats = useMemo(() => {
    const includedFiles = getIncludedRowsCount(rows)
    const allMapped = isAllRowsMapped(rows, groups)
    const unmappedCount = rows.filter(row => {
      if (!row.fileInfo.included) return false
      const mapping = getEffectiveMapping(row, groups)
      return !mapping.customerId && !mapping.newCustomerName
    }).length
    const duplicateCount = rows.filter(row => row.fileInfo.duplicateStatus.isHashDuplicate).length

    return {
      totalFiles: rows.length,
      includedFiles,
      allMapped,
      unmappedCount,
      duplicateCount,
    }
  }, [rows, groups])

  // 모달 제목
  const title = registrationResult
    ? 'CRS 일괄 등록 완료'
    : isAnalyzing
    ? 'CRS 파일 분석 중...'
    : isProcessing
    ? 'CRS 파일 등록 중...'
    : 'CRS 파일 매핑 확인'

  // Footer 버튼들
  const footer = (
    <div className="batch-ar-modal__footer">
      {registrationResult ? (
        <Button variant="primary" onClick={onClose}>
          확인
        </Button>
      ) : isAnalyzing ? (
        <div className="batch-ar-modal__progress">
          <div className="batch-ar-modal__progress-bar">
            <div
              className="batch-ar-modal__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="batch-ar-modal__progress-text">
            {currentFileName ? `분석 중: ${currentFileName}` : `${progress}%`}
          </span>
        </div>
      ) : isProcessing ? (
        <div className="batch-ar-modal__progress">
          <div className="batch-ar-modal__progress-bar">
            <div
              className="batch-ar-modal__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="batch-ar-modal__progress-text">
            {completedFiles}/{totalFiles} 완료
            {currentFileName && ` - ${currentFileName}`}
          </span>
        </div>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => onRegister(rows)}
            disabled={!stats.allMapped || stats.includedFiles === 0}
          >
            {stats.includedFiles > 0
              ? `${stats.includedFiles}개 파일 등록`
              : '등록할 파일 없음'}
          </Button>
        </>
      )}
    </div>
  )

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title={title}
      footer={footer}
      backdropClosable={false}
      escapeToClose={!isAnalyzing && !isProcessing}
      className="batch-ar-mapping-modal"
      initialWidth={1000}
      initialHeight={700}
      minWidth={800}
      minHeight={450}
      storageKey="batch-cr-mapping-modal"
      transparent={true}
    >
      {registrationResult ? (
        <CrRegistrationSummary
          result={registrationResult}
          originalTotalFiles={originalTotalFiles}
          crDetectedFiles={rows.length}
          excludedFiles={excludedFiles}
          showSkipped={showSkipped}
          showFailed={showFailed}
          showExcluded={showExcluded}
          onToggleSkipped={() => setShowSkipped(!showSkipped)}
          onToggleFailed={() => setShowFailed(!showFailed)}
          onToggleExcluded={() => setShowExcluded(!showExcluded)}
        />
      ) : (
      <div
        className="batch-ar-modal__content batch-ar-modal__content--table"
        style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden', gap: '8px' }}
      >
        {/* 사용자 안내 문구 */}
        {!isAnalyzing && !isProcessing && (
          <div className="batch-ar-modal__guide">
            <div className="batch-ar-modal__guide-summary">
              <span><span className="batch-ar-modal__guide-highlight">미매핑</span> 파일은 고객을 직접 선택해주세요.</span>
              <button
                type="button"
                className="batch-ar-modal__guide-help"
                onClick={() => setShowHelp(!showHelp)}
                aria-expanded={showHelp ? 'true' : 'false'}
              >
                {showHelp ? '접기' : '?'}
              </button>
            </div>
            {showHelp && (
              <div className="batch-ar-modal__guide-detail">
                <p>* CRS 계약자명과 일치하는 고객이 1명이면 자동 추천됩니다.</p>
                <p>* 동명이인이 있으면 미매핑 처리되어 직접 선택이 필요합니다.</p>
                <p>* 일치하는 고객이 없으면 계약자명으로 새 고객이 자동 등록됩니다.</p>
              </div>
            )}
          </div>
        )}

        {/* 파일 수 요약 (업로드 수 ≠ CRS 감지 수일 때) */}
        {!isAnalyzing && !isProcessing && excludedFiles.length > 0 && (
          <div className="batch-ar-modal__file-summary">
            <span className="batch-ar-modal__file-summary-text">
              총 {originalTotalFiles}개 파일 중 {rows.length}개 CRS 파일 감지
            </span>
            <button
              type="button"
              className="batch-ar-modal__file-summary-toggle"
              onClick={() => setShowExcluded(!showExcluded)}
            >
              <span className="batch-ar-modal__file-summary-excluded">
                {excludedFiles.length}개 제외
              </span>
              <span className="batch-ar-modal__file-summary-arrow">
                {showExcluded ? '\u25BE' : '\u25B8'}
              </span>
            </button>
            {showExcluded && (
              <div className="batch-ar-modal__excluded-list">
                {excludedFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className={`batch-ar-modal__excluded-item batch-ar-modal__excluded-item--${f.status}`}
                  >
                    <span className="batch-ar-modal__excluded-status">
                      {f.status === 'failed' ? '\u2717' : '\u2212'}
                    </span>
                    <span className="batch-ar-modal__excluded-name" title={f.fileName}>
                      {f.fileName}
                    </span>
                    <span className="batch-ar-modal__excluded-reason">
                      {f.status === 'failed' ? 'CRS 분석 실패' : 'CRS 아님'}
                    </span>
                    {f.status === 'failed' && f.error && (
                      <span className="batch-ar-modal__excluded-error" title={f.error}>
                        {f.error.length > 40 ? f.error.substring(0, 40) + '...' : f.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isAnalyzing && rows.length === 0 ? (
          <div className="batch-ar-modal__analyzing-container">
            {/* 상단 진행 상황 헤더 */}
            <div className="batch-ar-modal__analyzing-header">
              <div className="batch-ar-modal__analyzing-spinner" />
              <div className="batch-ar-modal__analyzing-info">
                <span className="batch-ar-modal__analyzing-title">CRS 파일 분석 중...</span>
                <span className="batch-ar-modal__analyzing-count">
                  {(() => {
                    const completed = analyzingFiles?.filter(f => f.status === 'completed' || f.status === 'non_ar' || f.status === 'failed').length || 0
                    const percent = totalFiles > 0 ? Math.round((completed / totalFiles) * 100) : 0
                    return `${completed} / ${totalFiles} 완료 (${percent}%)`
                  })()}
                </span>
              </div>
            </div>

            {/* 파일 목록 */}
            <div className="batch-ar-modal__file-list">
              {analyzingFiles?.map((file, index) => (
                <div
                  key={index}
                  ref={(el) => { fileItemRefs.current[index] = el }}
                  className={`batch-ar-modal__file-item batch-ar-modal__file-item--${file.status}`}
                >
                  <span className="batch-ar-modal__file-status-icon">
                    {file.status === 'pending' && '○'}
                    {file.status === 'analyzing' && <span className="batch-ar-modal__file-spinner" />}
                    {file.status === 'completed' && '✓'}
                    {file.status === 'non_ar' && '−'}
                    {file.status === 'failed' && '✗'}
                  </span>
                  <span className="batch-ar-modal__file-name" title={file.fileName}>
                    {file.fileName}
                  </span>
                  <span className="batch-ar-modal__file-status-text">
                    {file.status === 'pending' && '대기'}
                    {file.status === 'analyzing' && '분석 중'}
                    {file.status === 'completed' && 'CRS 감지'}
                    {file.status === 'non_ar' && 'CRS 아님'}
                    {file.status === 'failed' && '실패'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <CrFileTable
            rows={rows}
            groups={groups}
            sortField={tableState.sortField}
            sortDirection={tableState.sortDirection}
            searchQuery={tableState.searchQuery}
            mappingStatusFilter={tableState.mappingStatusFilter}
            currentPage={tableState.currentPage}
            itemsPerPage={tableState.itemsPerPage}
            disabled={isProcessing}
            onToggleRowSelection={onToggleRow}
            onSelectAllRows={(fileIds, selected) => {
              onSetRowsSelection(fileIds, selected)
            }}
            onUpdateRowMapping={onUpdateRowMapping}
            onUpdateRowNewCustomer={onUpdateRowNewCustomer}
            onToggleRowIncluded={onToggleFileIncluded}
            onSortChange={onSetSort}
            onSearchChange={onSetSearchQuery}
            onFilterChange={onSetFilter}
            onPageChange={onSetPage}
            onItemsPerPageChange={onSetItemsPerPage}
            onBulkAssignCustomer={onBulkAssignCustomer}
            onBulkAssignNewCustomer={onBulkAssignNewCustomer}
            onOpenNewCustomerModal={onOpenNewCustomerModal}
          />
        )}

        {/* 선택 필요 안내 */}
        {!isAnalyzing && !isProcessing && stats.unmappedCount > 0 && (
          <div className="batch-ar-modal__warning">
            {stats.unmappedCount}개 파일의 고객 매핑이 필요합니다
          </div>
        )}
      </div>
      )}
    </DraggableModal>
  )
}

