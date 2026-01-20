/**
 * ArFileGroupCard
 * @description AR 파일 그룹 카드 컴포넌트 (고객명별 그룹)
 */

import React from 'react'
import type { ArFileGroup } from '../../types/arBatchTypes'
import {
  getGroupStatusIcon,
  getIncludedFilesCount,
} from '../../utils/arGroupingUtils'
import { ArFileRow } from './ArFileRow'
import { CustomerDropdown } from './CustomerDropdown'

export interface ArFileGroupCardProps {
  /** 그룹 데이터 */
  group: ArFileGroup
  /** 고객 선택 */
  onSelectCustomer: (groupId: string, customerId: string | null, customerName?: string) => void
  /** 새 고객 이름 설정 */
  onSetNewCustomerName: (groupId: string, name: string) => void
  /** 그룹 펼침/접힘 토글 */
  onToggleGroup: (groupId: string) => void
  /** 파일 포함/제외 토글 */
  onToggleFile: (groupId: string, fileId: string) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: (groupId: string, defaultName: string) => void
  /** 비활성화 */
  disabled?: boolean
}

export const ArFileGroupCard: React.FC<ArFileGroupCardProps> = ({
  group,
  onSelectCustomer,
  onSetNewCustomerName,
  onToggleGroup,
  onToggleFile,
  onOpenNewCustomerModal,
  disabled = false,
}) => {
  const {
    groupId,
    customerNameFromAr,
    files,
    matchingCustomers,
    matchStatus,
    selectedCustomerId,
    selectedCustomerName,
    newCustomerName,
    isExpanded,
  } = group

  const includedCount = getIncludedFilesCount(group)
  const isSelected = selectedCustomerId !== null || (matchStatus === 'no_match' && !!newCustomerName)
  const statusIcon = getGroupStatusIcon(matchStatus, isSelected)

  // 드롭다운 표시 값 결정
  const dropdownValue = selectedCustomerId
    ? selectedCustomerName || matchingCustomers.find(c => c._id === selectedCustomerId)?.personal_info?.name || '선택됨'
    : matchStatus === 'no_match' && newCustomerName
    ? `새 고객: ${newCustomerName}`
    : matchStatus === 'no_match'
    ? '새 고객 등록'
    : '선택하세요'

  const handleToggleExpand = () => {
    if (!disabled) {
      onToggleGroup(groupId)
    }
  }

  return (
    <div className={`ar-group-card ${isExpanded ? 'ar-group-card--expanded' : ''}`}>
      {/* 그룹 헤더 */}
      <div className="ar-group-card__header">
        <button
          type="button"
          className="ar-group-card__toggle"
          onClick={handleToggleExpand}
          disabled={disabled}
          aria-expanded={isExpanded}
        >
          <span className="ar-group-card__chevron">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="ar-group-card__status-icon">{statusIcon}</span>
          <span className="ar-group-card__customer-name">
            {customerNameFromAr === '__UNKNOWN__' ? '(알 수 없음)' : customerNameFromAr}
          </span>
          <span className="ar-group-card__file-count">
            ({includedCount}/{files.length}개 파일)
          </span>
        </button>

        <div className="ar-group-card__selector">
          <CustomerDropdown
            groupId={groupId}
            value={dropdownValue}
            matchingCustomers={matchingCustomers}
            matchStatus={matchStatus}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={onSelectCustomer}
            onOpenNewCustomerModal={() => onOpenNewCustomerModal(groupId, customerNameFromAr)}
            disabled={disabled}
          />
          {isSelected && (
            <span className="ar-group-card__check">✓</span>
          )}
        </div>
      </div>

      {/* 파일 목록 */}
      {isExpanded && (
        <div className="ar-group-card__files">
          {files.map(file => (
            <ArFileRow
              key={file.fileId}
              file={file}
              onToggleIncluded={() => onToggleFile(groupId, file.fileId)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ArFileGroupCard
