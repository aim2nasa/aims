/**
 * BatchArMappingModal
 * @description AR 파일 일괄 매핑 확인 모달
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import React, { useMemo } from 'react'
import { Modal, Button } from '@/shared/ui'
import type { ArFileGroup, BatchMappingState } from '../../types/arBatchTypes'
import {
  isAllGroupsSelected,
  getTotalIncludedFilesCount,
} from '../../utils/arGroupingUtils'
import { ArFileGroupCard } from './ArFileGroupCard'
import './BatchArMappingModal.css'

export interface BatchArMappingModalProps {
  /** 일괄 매핑 상태 */
  state: BatchMappingState
  /** 모달 닫기 */
  onClose: () => void
  /** 그룹 고객 선택 */
  onSelectCustomer: (groupId: string, customerId: string | null, customerName?: string) => void
  /** 그룹 새 고객 이름 설정 */
  onSetNewCustomerName: (groupId: string, name: string) => void
  /** 그룹 펼침/접힘 토글 */
  onToggleGroup: (groupId: string) => void
  /** 파일 포함/제외 토글 */
  onToggleFile: (groupId: string, fileId: string) => void
  /** 등록 시작 (현재 groups 전달) */
  onRegister: (groups: ArFileGroup[]) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: (groupId: string, defaultName: string) => void
  /** 고객 검색 모달 열기 */
  onOpenCustomerSearchModal: (groupId: string) => void
}

export const BatchArMappingModal: React.FC<BatchArMappingModalProps> = ({
  state,
  onClose,
  onSelectCustomer,
  onSetNewCustomerName,
  onToggleGroup,
  onToggleFile,
  onRegister,
  onOpenNewCustomerModal,
  onOpenCustomerSearchModal,
}) => {
  const { groups, isOpen, isAnalyzing, isProcessing, progress, totalFiles, completedFiles, currentFileName } = state


  // 통계 계산
  const stats = useMemo(() => {
    const autoCount = groups.filter(g => g.matchStatus === 'auto').length
    const needsSelectionCount = groups.filter(g => g.matchStatus === 'needs_selection').length
    const noMatchCount = groups.filter(g => g.matchStatus === 'no_match').length
    const includedFiles = getTotalIncludedFilesCount(groups)
    const allSelected = isAllGroupsSelected(groups)
    const unselectedCount = groups.filter(g => {
      if (g.matchStatus === 'auto') return false
      if (g.selectedCustomerId) return false
      if (g.matchStatus === 'no_match' && g.newCustomerName) return false
      return true
    }).length

    return {
      autoCount,
      needsSelectionCount,
      noMatchCount,
      totalGroups: groups.length,
      includedFiles,
      allSelected,
      unselectedCount,
    }
  }, [groups])

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
            onClick={() => onRegister(groups)}
            disabled={!stats.allSelected || stats.includedFiles === 0}
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
    <Modal
      visible={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={footer}
      backdropClosable={false}
      escapeToClose={!isAnalyzing && !isProcessing}
      className="batch-ar-mapping-modal"
    >
      <div className="batch-ar-modal__content">
        {/* 분석 결과 요약 */}
        {!isAnalyzing && groups.length > 0 && (
          <div className="batch-ar-modal__summary">
            <span className="batch-ar-modal__summary-icon">📊</span>
            <span className="batch-ar-modal__summary-text">
              분석 결과: {totalFiles}개 파일 → {stats.totalGroups}개 그룹
            </span>
            {stats.autoCount > 0 && (
              <span className="batch-ar-modal__badge batch-ar-modal__badge--auto">
                ✅ 자동 {stats.autoCount}
              </span>
            )}
            {stats.needsSelectionCount > 0 && (
              <span className="batch-ar-modal__badge batch-ar-modal__badge--selection">
                ⚠️ 선택 {stats.needsSelectionCount}
              </span>
            )}
            {stats.noMatchCount > 0 && (
              <span className="batch-ar-modal__badge batch-ar-modal__badge--new">
                🆕 새 고객 {stats.noMatchCount}
              </span>
            )}
          </div>
        )}

        {/* 그룹 목록 */}
        <div className="batch-ar-modal__groups">
          {isAnalyzing && groups.length === 0 ? (
            <div className="batch-ar-modal__analyzing">
              <div className="batch-ar-modal__spinner" />
              <p>AR 파일 분석 중...</p>
              {currentFileName && (
                <p className="batch-ar-modal__current-file">{currentFileName}</p>
              )}
            </div>
          ) : (
            groups.map(group => (
              <ArFileGroupCard
                key={group.groupId}
                group={group}
                onSelectCustomer={onSelectCustomer}
                onSetNewCustomerName={onSetNewCustomerName}
                onToggleGroup={onToggleGroup}
                onToggleFile={onToggleFile}
                onOpenNewCustomerModal={onOpenNewCustomerModal}
                onOpenCustomerSearchModal={onOpenCustomerSearchModal}
                disabled={isProcessing}
              />
            ))
          )}
        </div>

        {/* 선택 필요 안내 */}
        {!isAnalyzing && !isProcessing && stats.unselectedCount > 0 && (
          <div className="batch-ar-modal__warning">
            ⚠️ {stats.unselectedCount}개 그룹의 고객 선택이 필요합니다
          </div>
        )}
      </div>
    </Modal>
  )
}

export default BatchArMappingModal
