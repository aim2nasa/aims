/**
 * 🍎 TRUE APPLE STYLE FILE LIST
 * iOS/macOS native table view minimalism
 */

import React, { useMemo, useState, useCallback } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { UploadFile, UploadStatus } from '../types/uploadTypes'
import { uploadHelpers } from '../services/userContextService'
import { formatTime } from '@/shared/lib/timeUtils'
import './FileList.css'

interface FileListProps {
  files: UploadFile[]
  onRetryFile?: (fileId: string) => void
  onClearAll?: () => void
  readonly?: boolean
  className?: string
}

/**
 * 🍎 COMPREHENSIVE FILE ICONS: iOS-style system icons
 */
const getFileIcon = (file: File): string => {
  const mimeType = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase() || ''

  // 🍎 PDF: Dedicated PDF icon
  if (mimeType.includes('pdf') || extension === 'pdf') {
    return 'doc.richtext'
  }

  // 🍎 IMAGES: Photo gallery icon
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension)) {
    return 'photo'
  }

  // 🍎 VIDEOS: Video camera icon
  if (mimeType.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'].includes(extension)) {
    return 'video'
  }

  // 🍎 AUDIO: Music note icon
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(extension)) {
    return 'music.note'
  }

  // 🍎 ARCHIVES: Folder icon
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'dmg', 'iso'].includes(extension)) {
    return 'archivebox'
  }

  // 🍎 OFFICE DOCUMENTS: Specific icons
  if (['doc', 'docx', 'hwp'].includes(extension) || mimeType.includes('msword')) {
    return 'doc.plaintext'
  }

  if (['xls', 'xlsx'].includes(extension) || mimeType.includes('sheet')) {
    return 'tablecells'
  }

  if (['ppt', 'pptx'].includes(extension) || mimeType.includes('presentation')) {
    return 'play.rectangle'
  }

  // 🍎 CODE FILES: Terminal icon
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart'].includes(extension)) {
    return 'chevron.left.forwardslash.chevron.right'
  }

  // 🍎 TEXT FILES: Document icon
  if (mimeType.includes('text') || ['txt', 'md', 'rtf', 'log', 'csv'].includes(extension)) {
    return 'doc.plaintext'
  }

  // 🍎 EXECUTABLE: Gear icon
  if (['exe', 'msi', 'deb', 'rpm', 'pkg', 'dmg', 'app'].includes(extension)) {
    return 'gearshape'
  }

  // 🍎 DEFAULT: Generic document
  return 'doc'
}

/**
 * 🍎 FILE TYPE CSS CLASS: Apple-style color categorization
 */
const getFileTypeClass = (file: File): string => {
  const mimeType = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase() || ''

  // 🍎 PDF: Red theme
  if (mimeType.includes('pdf') || extension === 'pdf') {
    return 'file-icon--pdf'
  }

  // 🍎 IMAGES: Blue theme
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension)) {
    return 'file-icon--image'
  }

  // 🍎 VIDEOS: Purple theme
  if (mimeType.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'].includes(extension)) {
    return 'file-icon--video'
  }

  // 🍎 AUDIO: Pink theme
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(extension)) {
    return 'file-icon--audio'
  }

  // 🍎 ARCHIVES: Orange theme
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'dmg', 'iso'].includes(extension)) {
    return 'file-icon--archive'
  }

  // 🍎 WORD DOCUMENTS: Blue theme
  if (['doc', 'docx', 'hwp'].includes(extension) || mimeType.includes('msword')) {
    return 'file-icon--word'
  }

  // 🍎 EXCEL DOCUMENTS: Green theme
  if (['xls', 'xlsx'].includes(extension) || mimeType.includes('sheet')) {
    return 'file-icon--excel'
  }

  // 🍎 POWERPOINT DOCUMENTS: Orange theme
  if (['ppt', 'pptx'].includes(extension) || mimeType.includes('presentation')) {
    return 'file-icon--powerpoint'
  }

  // 🍎 CODE FILES: Indigo theme
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart'].includes(extension)) {
    return 'file-icon--code'
  }

  // 🍎 TEXT FILES: Gray theme
  if (mimeType.includes('text') || ['txt', 'md', 'rtf', 'log', 'csv'].includes(extension)) {
    return 'file-icon--text'
  }

  // 🍎 EXECUTABLE: Dark theme
  if (['exe', 'msi', 'deb', 'rpm', 'pkg', 'dmg', 'app'].includes(extension)) {
    return 'file-icon--executable'
  }

  // 🍎 DEFAULT: Neutral theme
  return 'file-icon--default'
}


/**
 * 🍎 TRUE APPLE FILE LIST COMPONENT
 */
export const FileList: React.FC<FileListProps> = ({
  files,
  onRetryFile,
  onClearAll,
  readonly = false,
  className = ''
}) => {
  // 🍎 FILTER STATE: Apple-style filtering
  const [filterStatus, setFilterStatus] = useState<'all' | UploadStatus>('all')

  // 🍎 MINIMAL STATS
  const stats = useMemo(() => {
    const total = files.length
    const completed = files.filter(f => f.status === 'completed').length
    const error = files.filter(f => f.status === 'error').length
    const uploading = files.filter(f => f.status === 'uploading').length
    const cancelled = files.filter(f => f.status === 'cancelled').length
    const skipped = files.filter(f => f.status === 'skipped').length

    return { total, completed, error, uploading, cancelled, skipped }
  }, [files])

  // 🍎 FILTERED FILES: Smart filtering with Apple UX
  const filteredFiles = useMemo(() => {
    if (filterStatus === 'all') return files
    return files.filter(file => file.status === filterStatus)
  }, [files, filterStatus])

  // 🍎 FILTER HANDLERS: Apple-style interaction
  const handleFilterToggle = useCallback((status: UploadStatus) => {
    setFilterStatus(current => current === status ? 'all' : status)
  }, [])

  const handleShowAll = useCallback(() => {
    setFilterStatus('all')
  }, [])

  if (files.length === 0) {
    return null
  }

  return (
    <div className={`file-list ${className}`}>
      {/* 🍎 MINIMAL HEADER: Only when needed */}
      <div className="file-list__header">
        <div className="file-list__header-left">
          <div className="file-list__title-compact">
            {stats.total} {stats.total === 1 ? 'file' : 'files'}
            {stats.total > 1 && (stats.completed > 0 || stats.uploading > 0 || stats.error > 0 || stats.skipped > 0) && (
              <>
                {' • '}{stats.completed} 완료
                {stats.uploading > 0 && ` • ${stats.uploading} 업로드 중`}
                {stats.error > 0 && ` • ${stats.error} 오류`}
                {stats.cancelled > 0 && ` • ${stats.cancelled} 취소`}
                {stats.skipped > 0 && ` • ${stats.skipped} 건너뜀`}
              </>
            )}
          </div>

          {/* 🍎 SUBTLE STATS: Ultra-minimal badges */}
          {(stats.completed > 0 || stats.uploading > 0 || stats.error > 0 || stats.cancelled > 0 || stats.skipped > 0) && (
            <div className="file-list__stats">
              {stats.completed > 0 && (
                <button
                  type="button"
                  className={`file-list__stat file-list__stat--completed file-list__stat--clickable ${
                    filterStatus === 'completed' ? 'file-list__stat--active' : ''
                  }`}
                  onClick={() => handleFilterToggle('completed')}
                  aria-label={filterStatus === 'completed' ? '모든 파일 보기' : '완료된 파일만 보기'}
                >
                  <SFSymbol
                    name="checkmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.completed}
                </button>
              )}
              {stats.uploading > 0 && (
                <span className="file-list__stat file-list__stat--uploading">
                  <SFSymbol
                    name="ellipsis"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.uploading}
                </span>
              )}
              {stats.error > 0 && (
                <button
                  type="button"
                  className={`file-list__stat file-list__stat--error file-list__stat--clickable ${
                    filterStatus === 'error' ? 'file-list__stat--active' : ''
                  }`}
                  onClick={() => handleFilterToggle('error')}
                  aria-label={filterStatus === 'error' ? '모든 파일 보기' : '오류 파일만 보기'}
                >
                  <SFSymbol
                    name="exclamationmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.error}
                </button>
              )}
              {stats.cancelled > 0 && (
                <button
                  type="button"
                  className={`file-list__stat file-list__stat--cancelled file-list__stat--clickable ${
                    filterStatus === 'cancelled' ? 'file-list__stat--active' : ''
                  }`}
                  onClick={() => handleFilterToggle('cancelled')}
                  aria-label={filterStatus === 'cancelled' ? '모든 파일 보기' : '취소된 파일만 보기'}
                >
                  <SFSymbol
                    name="xmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.cancelled}
                </button>
              )}
              {stats.skipped > 0 && (
                <button
                  type="button"
                  className={`file-list__stat file-list__stat--skipped file-list__stat--clickable ${
                    filterStatus === 'skipped' ? 'file-list__stat--active' : ''
                  }`}
                  onClick={() => handleFilterToggle('skipped')}
                  aria-label={filterStatus === 'skipped' ? '모든 파일 보기' : '건너뛴 파일만 보기'}
                >
                  <SFSymbol
                    name="forward.fill"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.skipped}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 🍎 FILTER STATUS: Show when filtering */}
        {filterStatus !== 'all' && (
          <div className="file-list__filter-status">
            <span className="file-list__filter-text">
              {filterStatus === 'error' && '오류 파일만 표시 중'}
              {filterStatus === 'completed' && '완료된 파일만 표시 중'}
              {filterStatus === 'uploading' && '업로드 중인 파일만 표시 중'}
              {filterStatus === 'cancelled' && '취소된 파일만 표시 중'}
              {filterStatus === 'skipped' && '건너뛴 파일만 표시 중'}
            </span>
            <button
              type="button"
              className="file-list__show-all"
              onClick={handleShowAll}
              aria-label="모든 파일 보기"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.LIGHT}
              />
              모든 파일
            </button>
          </div>
        )}

        {/* 🍎 CLEAR BUTTON: Apple-style minimal */}
        {onClearAll && !readonly && stats.total > 0 && (
          <button
            type="button"
            className="file-list__clear"
            onClick={onClearAll}
            aria-label="Clear all files"
          >
            <SFSymbol
              name="trash"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.LIGHT}
            />
            <span className="file-list__clear-text">Clear</span>
          </button>
        )}

        {/* 🍎 OVERALL PROGRESS: Multi-file upload progress */}
        {stats.total > 1 && (stats.uploading > 0 || (stats.completed > 0 && stats.completed < stats.total)) && (
          <div className="file-list__overall-progress">
            <div
              className="file-list__overall-progress-fill"
              style={{ width: `${(stats.completed / stats.total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* 🍎 NATIVE TABLE: iOS/macOS style */}
      <div className="file-list__items">
        {filteredFiles.map((uploadFile) => (
          <div
            key={uploadFile.id}
            className={`file-item file-item--${uploadFile.status}`}
          >
            {/* 🍎 APPLE COMPACT GRID: One-line layout like iOS/macOS table view */}

            {/* 🍎 ICON: File type indicator */}
            <div className={`file-item__icon-compact ${getFileTypeClass(uploadFile.file)}`}>
              <SFSymbol
                name={getFileIcon(uploadFile.file)}
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
            </div>

            {/* 🍎 NAME: Primary information (flexible width) */}
            <div className="file-item__name-compact">
              <span className="file-item__name-text" title={uploadFile.file.name}>
                {uploadFile.file.name}
              </span>
              {/* 🍎 ERROR MESSAGE: Inline minimal display */}
              {uploadFile.status === 'error' && uploadFile.error && (
                <span className="file-item__error-inline" title={uploadFile.error}>
                  {uploadFile.error.length > 20 ? `${uploadFile.error.substring(0, 20)}...` : uploadFile.error}
                </span>
              )}
              {/* 🔴 SKIPPED MESSAGE: Inline minimal display */}
              {uploadFile.status === 'skipped' && uploadFile.error && (
                <span className="file-item__skipped-inline" title={uploadFile.error}>
                  {uploadFile.error.length > 30 ? `${uploadFile.error.substring(0, 30)}...` : uploadFile.error}
                </span>
              )}
              {/* 🍎 PATH: Subtle secondary info */}
              {uploadFile.relativePath && (
                <span className="file-item__path-compact" title={uploadFile.relativePath}>
                  {uploadFile.relativePath}
                </span>
              )}
            </div>

            {/* 🍎 SIZE: Fixed width column */}
            <div className="file-item__size-compact">
              {uploadHelpers.formatFileSize(uploadFile.fileSize || uploadFile.file.size || 0)}
            </div>

            {/* 🍎 TIME: Fixed width column */}
            <div className="file-item__time-compact">
              {uploadFile.completedAt
                ? formatTime(uploadFile.completedAt.toISOString())
                : uploadFile.status === 'uploading'
                  ? `${uploadFile.progress || 0}%`
                  : ''
              }
            </div>

            {/* 🍎 STATUS: Minimal action column */}
            <div className="file-item__status-compact">
              {uploadFile.status === 'uploading' && (
                <div className="file-item__progress-compact">
                  <div
                    className="file-item__progress-fill-compact"
                    style={{ width: `${uploadFile.progress}%` }}
                  />
                </div>
              )}

              {uploadFile.status === 'completed' && (
                <SFSymbol
                  name="checkmark.circle.fill"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  className="file-item__done-compact"
                />
              )}

              {/* 바이러스 감지 에러는 재시도 불가 */}
              {uploadFile.status === 'error' && onRetryFile && !uploadFile.error?.includes('바이러스 감지') && (
                <button
                  type="button"
                  className="file-item__retry-compact"
                  onClick={() => onRetryFile(uploadFile.id)}
                  aria-label="Retry upload"
                >
                  <SFSymbol
                    name="arrow.clockwise"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.LIGHT}
                  />
                </button>
              )}

              {uploadFile.status === 'cancelled' && (
                <SFSymbol
                  name="xmark.circle"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.LIGHT}
                  className="file-item__cancelled-compact"
                />
              )}

              {uploadFile.status === 'skipped' && (
                <SFSymbol
                  name="forward.fill"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.LIGHT}
                  className="file-item__skipped-compact"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileList
