/**
 * 🍎 TRUE APPLE STYLE PROGRESS INDICATOR
 * iOS/macOS native progress reporting
 *
 * 📋 전체 파일 목록을 보여주고 개별 진행 상황 표시
 */

import React, { useMemo } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { UploadState, UploadFile } from '../types/uploadTypes'
import { uploadHelpers } from '../services/userContextService'
import './ProgressIndicator.css'

interface ProgressIndicatorProps {
  uploadState: UploadState
  onCancel?: (() => void) | undefined
  onRetryFile?: (fileId: string) => void
  className?: string
}

/**
 * 🍎 TRUE APPLE PROGRESS INDICATOR
 *
 * 전체 파일 목록을 스크롤 가능한 형태로 표시
 * - 상단: 전체 진행률 바 + 통계
 * - 하단: 파일별 상태 및 개별 진행률
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  uploadState,
  onCancel,
  onRetryFile,
  className = ''
}) => {
  const { files } = uploadState

  // 🍎 STATS: 전체 통계
  const stats = useMemo(() => {
    if (files.length === 0) {
      return {
        totalProgress: 0,
        completedCount: 0,
        totalCount: 0,
        hasErrors: false,
        isCompleted: false,
        isUploading: false,
        errorCount: 0,
        uploadingCount: 0
      }
    }

    const totalCount = files.length
    const completedCount = files.filter(f => f.status === 'completed' || f.status === 'warning').length
    const errorCount = files.filter(f => f.status === 'error').length
    const uploadingCount = files.filter(f => f.status === 'uploading').length

    // 전체 진행률 계산
    let totalProgress = 0
    files.forEach(file => {
      if (file.status === 'completed' || file.status === 'warning') {
        totalProgress += 100
      } else if (file.status === 'uploading') {
        totalProgress += file.progress
      }
    })
    totalProgress = Math.round(totalProgress / totalCount)

    const hasErrors = errorCount > 0
    const isCompleted = completedCount + errorCount === totalCount && totalCount > 0
    const isUploading = uploadingCount > 0

    return {
      totalProgress,
      completedCount,
      totalCount,
      hasErrors,
      isCompleted,
      isUploading,
      errorCount,
      uploadingCount
    }
  }, [files])

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 상태별 아이콘 렌더링
  const renderStatusIcon = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
      case 'warning':
        return (
          <SFSymbol
            name="checkmark"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            className="progress-file__icon progress-file__icon--success"
          />
        )
      case 'error':
        return <span className="progress-file__error-icon">!</span>
      case 'uploading':
        return <span className="progress-file__spinner" />
      case 'cancelled':
        return (
          <SFSymbol
            name="xmark"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            className="progress-file__icon progress-file__icon--cancelled"
          />
        )
      default:
        return (
          <SFSymbol
            name="circle"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.LIGHT}
            className="progress-file__icon progress-file__icon--pending"
          />
        )
    }
  }

  // 업로드 중이 아니고 파일이 없으면 숨김
  if (stats.totalCount === 0) {
    return null
  }

  return (
    <div className={`progress-indicator progress-indicator--list-view ${className}`}>
      {/* 🍎 OVERALL PROGRESS: 전체 진행률 바 + 통계 */}
      <div className="progress-indicator__header">
        <div className="progress-indicator__track-container">
          <div className="progress-indicator__track">
            <div
              className="progress-indicator__fill"
              style={{ width: `${stats.totalProgress}%` }}
            />
          </div>
          <span className="progress-indicator__percent">{stats.totalProgress}%</span>
        </div>
        <div className="progress-indicator__stats">
          <span className="progress-indicator__stat">
            완료 {stats.completedCount}/{stats.totalCount}
          </span>
          {stats.errorCount > 0 && (
            <span className="progress-indicator__stat progress-indicator__stat--error">
              실패 {stats.errorCount}
            </span>
          )}
          {onCancel && stats.isUploading && (
            <button
              type="button"
              className="progress-indicator__cancel"
              onClick={onCancel}
              aria-label="전체 업로드 취소"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
              />
              <span className="progress-indicator__cancel-text">전체 취소</span>
            </button>
          )}
        </div>
      </div>

      {/* 🍎 FILE LIST: 스크롤 가능한 파일 목록 */}
      <div className="progress-indicator__file-list">
        {files.map((file) => (
          <div
            key={file.id}
            className={`progress-file progress-file--${file.status}`}
          >
            <div className="progress-file__status">
              {renderStatusIcon(file)}
            </div>
            <div className="progress-file__info">
              <span className="progress-file__name">{file.file.name}</span>
              <span className="progress-file__size">
                {formatFileSize(file.fileSize || file.file.size || 0)}
              </span>
            </div>
            {/* 업로드 중: 개별 진행률 바 */}
            {file.status === 'uploading' && (
              <div className="progress-file__progress-container">
                <div className="progress-file__progress">
                  <div
                    className="progress-file__progress-bar"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                <span className="progress-file__progress-text">{file.progress}%</span>
              </div>
            )}
            {/* 완료: 완료 텍스트 */}
            {(file.status === 'completed' || file.status === 'warning') && (
              <span className="progress-file__status-text progress-file__status-text--success">
                완료
              </span>
            )}
            {/* 에러: 에러 메시지 + 재시도 버튼 */}
            {file.status === 'error' && (
              <>
                <span className="progress-file__error">{file.error || '업로드 실패'}</span>
                {/* 바이러스 감지 에러는 재시도 불가 */}
                {onRetryFile && !file.error?.includes('바이러스 감지') && (
                  <button
                    type="button"
                    className="progress-file__retry"
                    onClick={() => onRetryFile(file.id)}
                    aria-label="재시도"
                  >
                    재시도
                  </button>
                )}
              </>
            )}
            {/* 대기: 대기 텍스트 */}
            {file.status === 'pending' && (
              <span className="progress-file__status-text progress-file__status-text--pending">
                대기
              </span>
            )}
            {/* 취소됨 */}
            {file.status === 'cancelled' && (
              <span className="progress-file__status-text progress-file__status-text--cancelled">
                취소됨
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 🍎 COMPLETION: 완료 시 표시 */}
      {stats.isCompleted && !stats.hasErrors && (
        <div className="progress-indicator__done">
          <SFSymbol
            name="checkmark.circle.fill"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>모든 파일 업로드 완료</span>
        </div>
      )}
    </div>
  )
}

/**
 * 🍎 MINIMAL PROGRESS BAR: Reusable
 */
export const SimpleProgress: React.FC<{
  progress: number
  className?: string
  color?: 'primary' | 'success' | 'warning' | 'error'
}> = ({ progress, className = '', color = 'primary' }) => {
  return (
    <div className={`simple-progress simple-progress--${color} ${className}`}>
      <div
        className="simple-progress__fill"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  )
}

export default ProgressIndicator
