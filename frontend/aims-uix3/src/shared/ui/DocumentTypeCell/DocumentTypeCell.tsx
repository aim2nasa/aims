/**
 * DocumentTypeCell - 문서 유형 표시 공통 컴포넌트
 * @since 2026-01-03
 *
 * Single Source of Truth: 문서 유형 표시 로직을 한 곳에서 관리
 * - 시스템 유형(annual_report, customer_review): 읽기 전용 라벨
 * - 일반 유형: 드롭다운으로 변경 가능
 *
 * 사용처:
 * - DocumentStatusList (전체 문서 보기)
 * - DocumentsTab (고객 상세 > 문서 탭)
 */

import React from 'react'
import type { DocumentType } from '@/services/documentTypesService'
import './DocumentTypeCell.css'

export interface DocumentTypeCellProps {
  /** 현재 문서 유형 (null/undefined면 미지정) */
  documentType: string | null | undefined
  /** Annual Report 여부 (document_type 외에 별도 플래그) */
  isAnnualReport?: boolean
  /** Customer Review 여부 (document_type 외에 별도 플래그) */
  isCustomerReview?: boolean
  /** 사용 가능한 문서 유형 목록 */
  documentTypes: DocumentType[]
  /** 유형 변경 핸들러 (없으면 읽기 전용) */
  onChange?: (newType: string) => void
  /** 변경 중 상태 */
  isUpdating?: boolean
  /** 비활성화 여부 */
  disabled?: boolean
}

/**
 * 시스템 유형 판단
 * - annual_report: 연간보고서
 * - customer_review: 고객리뷰
 */
function getSystemType(
  documentType: string | null | undefined,
  isAnnualReport?: boolean,
  isCustomerReview?: boolean
): 'annual_report' | 'customer_review' | null {
  // document_type 기준
  if (documentType === 'annual_report') return 'annual_report'
  if (documentType === 'customer_review') return 'customer_review'

  // fallback: 별도 플래그 기준
  if (isAnnualReport) return 'annual_report'
  if (isCustomerReview) return 'customer_review'

  return null
}

/**
 * 시스템 유형별 라벨
 */
const SYSTEM_TYPE_LABELS: Record<string, string> = {
  annual_report: '연간보고서',
  customer_review: '고객리뷰'
}

export const DocumentTypeCell: React.FC<DocumentTypeCellProps> = ({
  documentType,
  isAnnualReport,
  isCustomerReview,
  documentTypes,
  onChange,
  isUpdating = false,
  disabled = false
}) => {
  const systemType = getSystemType(documentType, isAnnualReport, isCustomerReview)

  // 시스템 유형: 읽기 전용 라벨
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

  // 일반 유형: 드롭다운
  return (
    <select
      className="document-type-cell document-type-cell--select"
      value={documentType || 'unspecified'}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled || isUpdating || !onChange}
      aria-label="문서 유형 선택"
    >
      <option value="unspecified">미지정</option>
      {documentTypes.map((dt) => (
        <option key={dt._id} value={dt.value}>
          {dt.label}
        </option>
      ))}
    </select>
  )
}

export default DocumentTypeCell
