/**
 * UploadProgress Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 업로드 진행률 표시 컴포넌트
 */

import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import type { BatchUploadProgress, FolderUploadState } from '../hooks/useBatchUpload'
import { formatFileSize } from '../utils/fileValidation'
import './UploadProgress.css'

interface UploadProgressProps {
  progress: BatchUploadProgress
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onViewDocuments?: () => void
}

export default function UploadProgress({
  progress,
  onPause,
  onResume,
  onCancel,
  onViewDocuments,
}: UploadProgressProps) {
  const { state, totalFiles, completedFiles, failedFiles, overallProgress, folders, currentFile, files } =
    progress

  const isUploading = state === 'uploading'

  // 실패한 파일 목록 (실시간 표시용)
  const failedFilesList = files.filter((f) => f.status === 'failed')
  const isPaused = state === 'paused'
  const isCompleted = state === 'completed'
  const isCancelled = state === 'cancelled'

  // 검증 중인 파일 (바이러스 검사 / 중복 검사)
  const checkingFiles = files.filter((f) => f.status === 'checking')
  const isChecking = checkingFiles.length > 0

  // 경과 시간 계산
  const getElapsedTime = (): string => {
    if (!progress.startedAt) return '-'

    const endTime = progress.completedAt || new Date()
    const elapsed = Math.floor((endTime.getTime() - progress.startedAt.getTime()) / 1000)

    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60

    if (minutes > 0) {
      return `${minutes}분 ${seconds}초`
    }
    return `${seconds}초`
  }

  // 상태 아이콘
  const getStatusIcon = (status: FolderUploadState['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="upload-status-icon completed">
            <SFSymbol
              name="checkmark-circle-fill"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
        )
      case 'failed':
        return (
          <span className="upload-status-icon failed">
            <SFSymbol
              name="xmark-circle-fill"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
        )
      case 'partial':
        return (
          <span className="upload-status-icon partial">
            <SFSymbol
              name="exclamationmark-circle-fill"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
        )
      case 'uploading':
        return (
          <span className="upload-status-icon uploading">
            <SFSymbol
              name="arrow-up-circle-fill"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
        )
      default:
        return (
          <span className="upload-status-icon pending">
            <SFSymbol
              name="circle"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
        )
    }
  }

  return (
    <div className="upload-progress">
      {/* 전체 진행률 */}
      <div className="upload-progress-header">
        <div className="upload-progress-title">
          {isCompleted && '업로드 완료'}
          {isCancelled && '업로드 취소됨'}
          {isPaused && !isChecking && '일시 정지'}
          {isPaused && isChecking && '중복 파일 확인 중...'}
          {isUploading && isChecking && '파일 검증 중...'}
          {isUploading && !isChecking && '업로드 중...'}
          {state === 'idle' && '대기 중'}
        </div>

        <div className="upload-progress-controls">
          {isUploading && onPause && (
            <button className="upload-control-btn" onClick={onPause} title="일시 정지">
              <SFSymbol
                name="pause-fill"
                size={SFSymbolSize.BODY}
                weight={SFSymbolWeight.MEDIUM}
              />
            </button>
          )}
          {isPaused && onResume && (
            <button className="upload-control-btn" onClick={onResume} title="재개">
              <SFSymbol
                name="play-fill"
                size={SFSymbolSize.BODY}
                weight={SFSymbolWeight.MEDIUM}
              />
            </button>
          )}
          {(isUploading || isPaused) && onCancel && (
            <button className="upload-control-btn danger" onClick={onCancel} title="취소">
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.BODY}
                weight={SFSymbolWeight.MEDIUM}
              />
            </button>
          )}
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="upload-progress-bar-container">
        <div
          className={`upload-progress-bar ${isCompleted ? 'completed' : ''} ${isCancelled ? 'cancelled' : ''}`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* 통계 */}
      <div className="upload-progress-stats">
        <div className="upload-stat">
          <span className="upload-stat-label">진행률</span>
          <span className="upload-stat-value">{overallProgress}%</span>
        </div>
        <div className="upload-stat">
          <span className="upload-stat-label">완료</span>
          <span className="upload-stat-value success">
            {completedFiles}/{totalFiles}
          </span>
        </div>
        {failedFiles > 0 && (
          <div className="upload-stat">
            <span className="upload-stat-label">실패</span>
            <span className="upload-stat-value error">{failedFiles}</span>
          </div>
        )}
        <div className="upload-stat">
          <span className="upload-stat-label">경과</span>
          <span className="upload-stat-value">{getElapsedTime()}</span>
        </div>
      </div>

      {/* 현재 파일 */}
      {(currentFile || isChecking) && (isUploading || isPaused) && (
        <div className="upload-current-file">
          <span className="upload-current-file-label">
            {isChecking ? '검증 중:' : '현재 파일:'}
          </span>
          <span className="upload-current-file-name">
            {isChecking && checkingFiles[0] ? checkingFiles[0].fileName : currentFile}
          </span>
        </div>
      )}

      {/* 실시간 실패 파일 목록 (업로드 중에도 표시) */}
      {failedFilesList.length > 0 && (
        <div className="upload-failed-files">
          <div className="upload-failed-files-header">
            <SFSymbol
              name="exclamationmark-triangle-fill"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>실패한 파일 ({failedFilesList.length})</span>
          </div>
          <div className="upload-failed-files-list">
            {failedFilesList.map((file) => (
              <div key={file.fileId} className="upload-failed-file-item">
                <span className="upload-failed-file-name">{file.fileName}</span>
                {file.error && (
                  <span className="upload-failed-file-error">{file.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 폴더별 상태 */}
      <div className="upload-folders-list">
        <div className="upload-folders-header">
          <span>폴더</span>
          <span>진행 상황</span>
        </div>
        {folders.map((folder) => (
          <div key={folder.folderName} className={`upload-folder-item ${folder.status}`}>
            <div className="upload-folder-info">
              {getStatusIcon(folder.status)}
              <span className="upload-folder-name">{folder.folderName}</span>
              <span className="upload-folder-customer">→ {folder.customerName}</span>
            </div>
            <div className="upload-folder-progress">
              {folder.completedFiles}/{folder.totalFiles}
              {folder.failedFiles > 0 && (
                <span className="upload-folder-failed">({folder.failedFiles} 실패)</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 처리 상태 보기 버튼 */}
      {onViewDocuments && (
        <div className="upload-view-documents">
          <button type="button" className="upload-view-documents-btn" onClick={onViewDocuments}>
            <SFSymbol
              name="books-vertical"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.MEDIUM}
              style={{ color: 'var(--color-purple-500, #8e44ad)' }}
            />
            <span>처리 상태 보기</span>
          </button>
        </div>
      )}
    </div>
  )
}
