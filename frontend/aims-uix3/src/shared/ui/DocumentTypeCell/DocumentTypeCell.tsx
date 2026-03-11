/**
 * DocumentTypeCell - 문서 유형 표시 공통 컴포넌트
 * @since 2026-03-06 v2 - 드롭다운 → 읽기 전용 텍스트 + 2단 선택 모달
 *
 * Single Source of Truth: 문서 유형 표시 로직을 한 곳에서 관리
 * - 시스템 유형(annual_report, customer_review): 읽기 전용 라벨 (변경 불가)
 * - 일반 유형: 텍스트 라벨 표시, 클릭 시 DocumentTypePickerModal로 변경
 *
 * 사용처:
 * - DocumentStatusList (전체 문서 보기)
 * - DocumentsTab (고객 상세 > 문서 탭)
 */

import React, { useState, useCallback, useRef } from 'react'
import { getDocumentTypeLabel } from '@/shared/constants/documentCategories'
import { DocumentTypePickerModal } from './DocumentTypePickerModal'
import './DocumentTypeCell.css'

export interface DocumentTypeCellProps {
  /** 현재 문서 유형 (null/undefined면 미지정) */
  documentType: string | null | undefined
  /** Annual Report 여부 (document_type 외에 별도 플래그) */
  isAnnualReport?: boolean
  /** Customer Review 여부 (document_type 외에 별도 플래그) */
  isCustomerReview?: boolean
  /** 유형 변경 핸들러 (없으면 읽기 전용) */
  onChange?: (newType: string) => void
  /** 변경 중 상태 */
  isUpdating?: boolean
  /** 비활성화 여부 */
  disabled?: boolean
}

/**
 * 시스템 유형 판단
 */
function getSystemType(
  documentType: string | null | undefined,
  isAnnualReport?: boolean,
  isCustomerReview?: boolean
): 'annual_report' | 'customer_review' | null {
  if (documentType === 'annual_report') return 'annual_report'
  if (documentType === 'customer_review') return 'customer_review'
  if (isAnnualReport) return 'annual_report'
  if (isCustomerReview) return 'customer_review'
  return null
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  annual_report: '연간보고서',
  customer_review: '변액 리뷰'
}

export const DocumentTypeCell: React.FC<DocumentTypeCellProps> = ({
  documentType,
  isAnnualReport,
  isCustomerReview,
  onChange,
  isUpdating = false,
  disabled = false
}) => {
  const [pickerVisible, setPickerVisible] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const systemType = getSystemType(documentType, isAnnualReport, isCustomerReview)

  const handleClick = useCallback(() => {
    if (!systemType && onChange && !disabled && !isUpdating) {
      setPickerVisible(true)
    }
  }, [systemType, onChange, disabled, isUpdating])

  const handleSelect = useCallback((newType: string) => {
    onChange?.(newType)
  }, [onChange])

  // 시스템 유형: 읽기 전용 라벨 (클릭 불가)
  if (systemType) {
    return (
      <span
        className={`document-type-cell document-type-cell--readonly document-type-cell--${systemType}`}
        title="시스템 전용 유형 (변경 불가)"
      >
        {SYSTEM_TYPE_LABELS[systemType]}
      </span>
    )
  }

  // 일반 유형: 텍스트 라벨 + 클릭 시 모달
  const label = getDocumentTypeLabel(documentType)
  const isClickable = !!onChange && !disabled && !isUpdating

  return (
    <>
      <span
        ref={triggerRef}
        className={`document-type-cell document-type-cell--label ${isClickable ? 'document-type-cell--clickable' : ''} ${isUpdating ? 'document-type-cell--updating' : ''}`}
        onClick={handleClick}
        {...(isClickable ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } } } : {})}
        title={isClickable ? '클릭하여 문서유형 변경' : label}
      >
        {label}
      </span>
      {isClickable && (
        <DocumentTypePickerModal
          visible={pickerVisible}
          currentType={documentType}
          triggerRef={triggerRef}
          onSelect={handleSelect}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </>
  )
}

export default DocumentTypeCell
