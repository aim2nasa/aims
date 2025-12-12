/**
 * StorageExceededDialog Component
 * @since 2025-12-13
 * @version 1.0.0
 *
 * 스토리지 용량 초과 경고 다이얼로그
 * - 현재 사용량/할당량 표시
 * - 선택한 파일 크기/초과량 표시
 * - 해결책 버튼: 일부만 업로드, 기존 파일 정리, 용량 업그레이드
 */

import StorageQuotaBar from './StorageQuotaBar'
import { formatFileSize } from '../utils/fileValidation'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
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

  return (
    <div className="storage-exceeded-overlay">
      <div className="storage-exceeded-dialog">
        {/* 헤더 */}
        <div className="storage-exceeded-header">
          <div className="storage-exceeded-title">
            <svg className="storage-exceeded-icon-warning" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L1 21h22L12 2zm0 3.83L19.53 19H4.47L12 5.83zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
            </svg>
            <h2>저장 공간 부족</h2>
          </div>
          <button
            className="storage-exceeded-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <SFSymbol
              name="xmark"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </button>
        </div>

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
              <span className="storage-exceeded-value exceeded">
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
              <svg className="storage-exceeded-icon-hint" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
              </svg>
              <span>
                {partialUploadInfo.fileCount}개 파일({formatFileSize(partialUploadInfo.totalSize)})은
                업로드 가능합니다
              </span>
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="storage-exceeded-actions">
          <button
            className="storage-exceeded-btn secondary"
            onClick={onCleanupFiles}
          >
            <SFSymbol
              name="trash"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>기존 파일 정리</span>
          </button>
          <button
            className="storage-exceeded-btn secondary disabled"
            disabled
            title="추후 지원 예정"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
            </svg>
            <span>용량 업그레이드</span>
          </button>
          {partialUploadInfo && (
            <button
              className="storage-exceeded-btn primary"
              onClick={onPartialUpload}
            >
              <SFSymbol
                name="checkmark"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.SEMIBOLD}
              />
              <span>일부만 업로드</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
