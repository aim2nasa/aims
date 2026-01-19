/**
 * ArFileRow
 * @description AR 파일 행 컴포넌트 (파일명, 발행일)
 */

import React from 'react'
import type { ArFileInfo } from '../../types/arBatchTypes'
import { formatIssueDate } from '../../utils/arGroupingUtils'

export interface ArFileRowProps {
  /** 파일 정보 */
  file: ArFileInfo
  /** 포함/제외 토글 */
  onToggleIncluded: () => void
  /** 비활성화 */
  disabled?: boolean
}

export const ArFileRow: React.FC<ArFileRowProps> = ({
  file,
  onToggleIncluded,
  disabled = false,
}) => {
  const { metadata, duplicateStatus, included } = file
  const isHashDuplicate = duplicateStatus.isHashDuplicate
  const isIssueDateDuplicate = duplicateStatus.isIssueDateDuplicate
  const hasDuplicate = isHashDuplicate || isIssueDateDuplicate

  // 파일명에서 확장자 분리
  const fileName = file.file.name
  const lastDot = fileName.lastIndexOf('.')
  const nameWithoutExt = lastDot > 0 ? fileName.substring(0, lastDot) : fileName
  const ext = lastDot > 0 ? fileName.substring(lastDot) : ''

  return (
    <div
      className={`ar-file-row ${!included ? 'ar-file-row--excluded' : ''} ${hasDuplicate ? 'ar-file-row--duplicate' : ''}`}
    >
      {/* 체크박스 (중복 파일이 아닌 경우만 토글 가능) */}
      <label className="ar-file-row__checkbox">
        <input
          type="checkbox"
          checked={included && !isHashDuplicate}
          onChange={onToggleIncluded}
          disabled={disabled || isHashDuplicate}
        />
        <span className="ar-file-row__checkmark" />
      </label>

      {/* 파일명 */}
      <div className="ar-file-row__name" title={fileName}>
        <span className="ar-file-row__name-text">{nameWithoutExt}</span>
        <span className="ar-file-row__name-ext">{ext}</span>
      </div>

      {/* 발행일 */}
      <div className="ar-file-row__date">
        {metadata.issue_date ? formatIssueDate(metadata.issue_date) : '-'}
      </div>

      {/* 상태 표시 */}
      <div className="ar-file-row__status">
        {isHashDuplicate && (
          <span className="ar-file-row__badge ar-file-row__badge--hash-dup" title="동일한 파일이 이미 등록됨">
            중복
          </span>
        )}
        {isIssueDateDuplicate && !isHashDuplicate && (
          <span className="ar-file-row__badge ar-file-row__badge--date-dup" title="같은 발행일의 AR이 이미 있음">
            발행일 중복
          </span>
        )}
        {!hasDuplicate && included && (
          <span className="ar-file-row__badge ar-file-row__badge--ok">
            ✓
          </span>
        )}
      </div>
    </div>
  )
}

export default ArFileRow
