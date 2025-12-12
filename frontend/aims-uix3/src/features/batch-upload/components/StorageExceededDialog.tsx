/**
 * StorageExceededDialog Component
 * @since 2025-12-13
 * @version 2.0.0
 *
 * 스토리지 용량 초과 경고 다이얼로그
 * - 공통 Modal 컴포넌트 사용
 * - 현재 사용량/할당량 표시
 * - 선택한 파일 크기/초과량 표시
 * - 해결책 버튼: 일부만 업로드, 기존 파일 정리, 용량 업그레이드
 */

import Modal from '@/shared/ui/Modal'
import Button from '@/shared/ui/Button'
import StorageQuotaBar from './StorageQuotaBar'
import { formatFileSize } from '../utils/fileValidation'
import './StorageExceededDialog.css'

interface StorageExceededDialogProps {
  visible: boolean
  onClose: () => void
  // 스토리지 정보
  usedBytes: number
  maxBytes: number
  tierName: string
  // 선택 파일 정보
  selectedFilesSize: number
  selectedFilesCount: number
  // 액션
  onCleanupFiles: () => void      // 전체 문서 보기로 이동
  onPartialUpload: () => void     // 일부만 업로드
  // 일부 업로드 가능 정보
  partialUploadInfo: { fileCount: number; totalSize: number } | null
}

// 버튼용 인라인 SVG 아이콘
const CheckmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
)

const UpgradeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
  </svg>
)

export default function StorageExceededDialog({
  visible,
  onClose,
  usedBytes,
  maxBytes,
  tierName,
  selectedFilesSize,
  selectedFilesCount,
  onCleanupFiles,
  onPartialUpload,
  partialUploadInfo,
}: StorageExceededDialogProps) {
  if (!visible) return null

  // 초과 용량 계산
  const remainingBytes = Math.max(maxBytes - usedBytes, 0)
  const exceededBytes = Math.max(selectedFilesSize - remainingBytes, 0)

  // Footer with action buttons
  const footer = (
    <div className="storage-exceeded-actions">
      {partialUploadInfo && (
        <Button
          variant="primary"
          size="md"
          onClick={onPartialUpload}
          className="storage-exceeded-btn-partial"
        >
          <CheckmarkIcon />
          <span>일부만 업로드</span>
        </Button>
      )}
      <Button
        variant="secondary"
        size="md"
        onClick={onCleanupFiles}
        className="storage-exceeded-btn-cleanup"
      >
        <TrashIcon />
        <span>기존 파일 정리</span>
      </Button>
      <Button
        variant="ghost"
        size="md"
        disabled
        title="추후 지원 예정"
        className="storage-exceeded-btn-upgrade"
      >
        <UpgradeIcon />
        <span>용량 업그레이드</span>
      </Button>
    </div>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="저장 공간 부족"
      size="sm"
      backdropClosable={true}
      className="storage-exceeded-modal"
      footer={footer}
      ariaLabel="저장 공간 부족 알림"
    >
      {/* 용량 정보 */}
      <div className="storage-exceeded-content">
        <div className="storage-exceeded-info">
          <div className="storage-exceeded-info-row">
            <span className="storage-exceeded-label">현재 사용량</span>
            <span className="storage-exceeded-value">
              {formatFileSize(usedBytes)} / {formatFileSize(maxBytes)}
            </span>
          </div>
          <div className="storage-exceeded-info-row">
            <span className="storage-exceeded-label">선택한 파일</span>
            <span className="storage-exceeded-value">
              {formatFileSize(selectedFilesSize)} ({selectedFilesCount}개)
            </span>
          </div>
          <div className="storage-exceeded-info-row exceeded">
            <span className="storage-exceeded-label">초과 용량</span>
            <span className="storage-exceeded-value">
              +{formatFileSize(exceededBytes)}
            </span>
          </div>
        </div>

        {/* 스토리지 바 */}
        <div className="storage-exceeded-bar">
          <StorageQuotaBar
            usedBytes={usedBytes}
            maxBytes={maxBytes}
            pendingBytes={selectedFilesSize}
            tierName={tierName}
          />
        </div>

        {/* 일부 업로드 가능 안내 */}
        {partialUploadInfo && (
          <div className="storage-exceeded-hint">
            <svg className="storage-exceeded-icon-hint" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
            </svg>
            <span>
              {partialUploadInfo.fileCount}개 파일({formatFileSize(partialUploadInfo.totalSize)})은
              업로드 가능합니다
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
