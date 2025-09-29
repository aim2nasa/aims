/**
 * 🍎 TRUE APPLE STYLE PROGRESS INDICATOR
 * iOS/macOS native progress reporting
 */

import React, { useMemo } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { UploadState } from '../types/uploadTypes'
import { uploadHelpers } from '../services/userContextService'
import './ProgressIndicator.css'

interface ProgressIndicatorProps {
  uploadState: UploadState
  onCancel?: (() => void) | undefined
  className?: string
}

/**
 * 🍎 TRUE APPLE PROGRESS INDICATOR
 *
 * Ultra-minimal progress reporting
 * - Minimal progress bar
 * - Essential status only
 * - Progressive disclosure
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  uploadState,
  onCancel,
  className = ''
}) => {
  // 🍎 MINIMAL STATS: Only essentials
  const stats = useMemo(() => {
    const { files } = uploadState

    if (files.length === 0) {
      return {
        totalProgress: 0,
        completedCount: 0,
        totalCount: 0,
        currentFile: null,
        hasErrors: false,
        isCompleted: false,
        isUploading: false,
        errorCount: 0
      }
    }

    const totalCount = files.length
    const completedCount = files.filter(f => f.status === 'completed').length
    const errorCount = files.filter(f => f.status === 'error').length
    const uploadingFiles = files.filter(f => f.status === 'uploading')

    // 전체 진행률 계산
    let totalProgress = 0
    files.forEach(file => {
      if (file.status === 'completed') {
        totalProgress += 100
      } else if (file.status === 'uploading') {
        totalProgress += file.progress
      }
    })
    totalProgress = Math.round(totalProgress / totalCount)

    const currentFile = uploadingFiles.length > 0 ? uploadingFiles[0] : null
    const hasErrors = errorCount > 0
    const isCompleted = completedCount === totalCount && totalCount > 0
    const isUploading = uploadingFiles.length > 0

    return {
      totalProgress,
      completedCount,
      totalCount,
      currentFile,
      hasErrors,
      isCompleted,
      isUploading,
      errorCount
    }
  }, [uploadState.files])

  // 업로드 중이 아니고 파일이 없으면 숨김
  if (!stats.isUploading && stats.totalCount === 0) {
    return null
  }

  return (
    <div className={`progress-indicator ${className}`}>
      {/* 🍎 CURRENT FILE INFO: Show what's uploading */}
      {stats.isUploading && stats.currentFile && (
        <div className="progress-indicator__current">
          <div className="progress-indicator__file-info">
            <SFSymbol
              name="arrow.up.circle"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.LIGHT}
              decorative={true}
            />
            <span className="progress-indicator__filename">
              {stats.currentFile.file.name}
            </span>
            <span className="progress-indicator__size">
              {uploadHelpers.formatFileSize(stats.currentFile.fileSize || stats.currentFile.file.size || 0)}
            </span>
          </div>
          <div className="progress-indicator__progress-text">
            {stats.currentFile.progress}%
          </div>
        </div>
      )}

      {/* 🍎 OVERALL PROGRESS: Total progress bar */}
      {stats.isUploading && (
        <div className="progress-indicator__overall">
          <div className="progress-indicator__track">
            <div
              className="progress-indicator__fill"
              style={{ width: `${stats.totalProgress}%` }}
            />
          </div>
          <div className="progress-indicator__stats">
            <span>{stats.completedCount}/{stats.totalCount} files</span>
            {onCancel && (
              <button
                type="button"
                className="progress-indicator__cancel"
                onClick={onCancel}
                aria-label="Cancel upload"
              >
                <SFSymbol
                  name="xmark"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 🍎 COMPLETION: Barely visible */}
      {stats.isCompleted && !stats.hasErrors && (
        <div className="progress-indicator__done">
          <SFSymbol
            name="checkmark"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.ULTRALIGHT}
          />
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