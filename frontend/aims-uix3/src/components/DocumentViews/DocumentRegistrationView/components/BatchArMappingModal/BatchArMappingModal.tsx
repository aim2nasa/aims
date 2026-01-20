/**
 * BatchArMappingModal
 * @description AR 파일 일괄 매핑 확인 모달 (엑셀 스타일 테이블 UI)
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import React, { useMemo } from 'react'
import { DraggableModal, Button } from '@/shared/ui'
import type {
  ArFileGroup,
  BatchMappingState,
  ArTableViewState,
  ArFileTableRow,
  ArTableSortField,
  ArMappingStatusFilter,
} from '../../types/arBatchTypes'
// Customer type은 ArFileTable 내부에서 직접 사용
import {
  isAllRowsMapped,
  getIncludedRowsCount,
  getEffectiveMapping,
} from '../../utils/arGroupingUtils'
import { ArFileTable } from './ArFileTable'
import './BatchArMappingModal.css'

export interface BatchArMappingModalProps {
  /** 일괄 매핑 상태 */
  state: BatchMappingState
  /** 테이블 뷰 상태 */
  tableState: ArTableViewState
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
  onSetSort: (field: ArTableSortField | null, direction: 'asc' | 'desc') => void
  /** 테이블 페이지 변경 */
  onSetPage: (page: number) => void
  /** 페이지당 항목 수 변경 */
  onSetItemsPerPage: (count: number) => void
  /** 테이블 검색어 설정 */
  onSetSearchQuery: (query: string) => void
  /** 테이블 필터 설정 */
  onSetFilter: (filter: ArMappingStatusFilter) => void
  /** 등록 시작 (현재 테이블 행 전달) */
  onRegister: (rows: ArFileTableRow[]) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: (fileId: string, defaultName: string) => void
  /** 고객 검색 모달 열기 */
  onOpenCustomerSearchModal: (fileId: string) => void
}

export const BatchArMappingModal: React.FC<BatchArMappingModalProps> = ({
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
  onOpenCustomerSearchModal,
}) => {
  const { isOpen, isAnalyzing, isProcessing, progress, totalFiles, completedFiles, currentFileName } = state
  const { rows, groups } = tableState

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
    ? 'AR 파일 분석 중...'
    : isProcessing
    ? 'AR 파일 등록 중...'
    : 'AR 파일 매핑 확인'

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
      initialWidth={900}
      initialHeight={700}
      minWidth={700}
      minHeight={450}
      storageKey="batch-ar-mapping-modal"
      transparent={true}
    >
      <div
        className="batch-ar-modal__content batch-ar-modal__content--table"
        style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden', gap: '8px' }}
      >
        {isAnalyzing && rows.length === 0 ? (
          <div className="batch-ar-modal__analyzing">
            <div className="batch-ar-modal__spinner" />
            <p>AR 파일 분석 중...</p>
            {currentFileName && (
              <p className="batch-ar-modal__current-file">{currentFileName}</p>
            )}
          </div>
        ) : (
          <ArFileTable
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
              // 토글이 아닌 직접 선택/해제 설정
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
            onOpenCustomerSearchModal={onOpenCustomerSearchModal}
          />
        )}

        {/* 선택 필요 안내 */}
        {!isAnalyzing && !isProcessing && stats.unmappedCount > 0 && (
          <div className="batch-ar-modal__warning">
            ⚠️ {stats.unmappedCount}개 파일의 고객 매핑이 필요합니다
          </div>
        )}
      </div>
    </DraggableModal>
  )
}

export default BatchArMappingModal
