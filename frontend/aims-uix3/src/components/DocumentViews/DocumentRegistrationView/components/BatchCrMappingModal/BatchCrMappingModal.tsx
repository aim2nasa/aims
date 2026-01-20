/**
 * BatchCrMappingModal
 * @description CRS 파일 일괄 매핑 확인 모달 (엑셀 스타일 테이블 UI)
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import React, { useMemo, useState } from 'react'
import { DraggableModal, Button } from '@/shared/ui'
import type {
  CrFileGroup,
  CrBatchMappingState,
  CrTableViewState,
  CrFileTableRow,
  CrTableSortField,
  CrMappingStatusFilter,
} from '../../types/crBatchTypes'
import {
  isAllRowsMapped,
  getIncludedRowsCount,
  getEffectiveMapping,
} from '../../utils/crGroupingUtils'
import { CrFileTable } from './CrFileTable'
// CSS는 AR 스타일 재사용 (Phase 2에서 공통화)
import '../BatchArMappingModal/BatchArMappingModal.css'

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
  const { isOpen, isAnalyzing, isProcessing, progress, totalFiles, completedFiles, currentFileName } = state
  const { rows, groups } = tableState
  const [showHelp, setShowHelp] = useState(false)

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
  const title = isAnalyzing
    ? 'CRS 파일 분석 중...'
    : isProcessing
    ? 'CRS 파일 등록 중...'
    : 'CRS 파일 매핑 확인'

  // Footer 버튼들
  const footer = (
    <div className="batch-ar-modal__footer">
      {isAnalyzing ? (
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

        {isAnalyzing && rows.length === 0 ? (
          <div className="batch-ar-modal__analyzing">
            <div className="batch-ar-modal__spinner" />
            <p>CRS 파일 분석 중...</p>
            {currentFileName && (
              <p className="batch-ar-modal__current-file">{currentFileName}</p>
            )}
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
    </DraggableModal>
  )
}

export default BatchCrMappingModal
