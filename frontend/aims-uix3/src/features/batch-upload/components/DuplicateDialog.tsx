/**
 * DuplicateDialog Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 중복 파일 처리 다이얼로그
 * - 덮어쓰기/건너뛰기/둘 다 유지 옵션
 * - 일괄 적용 체크박스
 */

import { useState, useEffect, useRef } from 'react'
import './DuplicateDialog.css'

/**
 * 중복 처리 옵션
 * - skip: 이미 동일한 파일이 존재하므로 업로드 건너뛰기
 *
 * Note: hash 기반 중복 검사이므로 덮어쓰기/둘다유지는 무의미함
 * (동일한 내용의 파일을 교체하거나 복제하는 것은 낭비)
 */
export type DuplicateAction = 'skip'

/**
 * 중복 파일 정보
 */
export interface DuplicateFile {
  fileName: string
  folderName: string
  customerName: string
  existingFileDate?: string
  newFileSize: number
  existingFileSize?: number
}

interface DuplicateDialogProps {
  file: DuplicateFile
  onAction: (action: DuplicateAction, applyToAll: boolean) => void
  onCancel: () => void
  remainingCount?: number
}

export default function DuplicateDialog({
  file,
  onAction,
  onCancel,
  remainingCount = 0,
}: DuplicateDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false)
  const AUTO_SKIP_SECONDS = 10
  const [countdown, setCountdown] = useState(AUTO_SKIP_SECONDS)
  const countdownRef = useRef(AUTO_SKIP_SECONDS)

  useEffect(() => {
    const timer = setInterval(() => {
      countdownRef.current -= 1
      setCountdown(countdownRef.current)
      if (countdownRef.current <= 0) {
        clearInterval(timer)
        onAction('skip', true)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [onAction])

  const handleAction = (action: DuplicateAction) => {
    onAction(action, applyToAll)
  }

  // 파일 크기 포맷
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="duplicate-dialog-overlay">
      <div className="duplicate-dialog">
        {/* 헤더 */}
        <div className="duplicate-dialog-header">
          <h2 className="duplicate-dialog-title">중복 파일 발견</h2>
        </div>

        {/* 파일 정보 */}
        <div className="duplicate-dialog-content">
          <p className="duplicate-dialog-message">
            <strong>{file.customerName}</strong> 고객에게 동일한 이름의 파일이 이미 존재합니다.
          </p>

          <div className="duplicate-dialog-file-info">
            <div className="duplicate-file-card">
              <span className="duplicate-file-label">업로드할 파일</span>
              <span className="duplicate-file-name">{file.fileName}</span>
              <span className="duplicate-file-meta">{formatSize(file.newFileSize)}</span>
            </div>

            {file.existingFileSize !== undefined && (
              <div className="duplicate-file-card existing">
                <span className="duplicate-file-label">기존 파일</span>
                <span className="duplicate-file-name">{file.fileName}</span>
                <span className="duplicate-file-meta">
                  {formatSize(file.existingFileSize)}
                  {file.existingFileDate && ` · ${file.existingFileDate}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 일괄 적용 체크박스 */}
        <label className="duplicate-dialog-apply-all">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          <span>다음 중복 파일도 같은 방식으로 처리 (묻지 않음)</span>
        </label>

        {/* 버튼 */}
        <div className="duplicate-dialog-actions">
          <button
            className="duplicate-dialog-btn secondary"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="duplicate-dialog-btn primary"
            onClick={() => handleAction('skip')}
          >
            건너뛰기 ({countdown}초)
          </button>
        </div>
      </div>
    </div>
  )
}
