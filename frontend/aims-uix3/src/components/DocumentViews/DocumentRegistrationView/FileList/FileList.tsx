/**
 * 🍎 TRUE APPLE STYLE FILE LIST
 * iOS/macOS native table view minimalism
 */

import React, { useMemo } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { UploadFile } from '../types/uploadTypes'
import { uploadHelpers } from '../services/userContextService'
import './FileList.css'

interface FileListProps {
  files: UploadFile[]
  onRemoveFile?: (fileId: string) => void
  onRetryFile?: (fileId: string) => void
  onClearAll?: () => void
  readonly?: boolean
  className?: string
}

/**
 * 🍎 MINIMAL FILE ICONS: System-style
 */
const getFileIcon = (file: File): string => {
  const mimeType = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase() || ''

  // 🍎 IMAGE: Simple photo icon
  if (mimeType.startsWith('image/')) {
    return 'photo'
  }

  // 🍎 DOCUMENT: Text icon
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
    return 'doc.text'
  }

  // 🍎 DEFAULT: Generic document
  return 'doc'
}

/**
 * 🍎 MINIMAL STATUS ICONS
 */
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'pending': return 'clock'
    case 'uploading': return 'ellipsis'
    case 'completed': return 'checkmark'
    case 'error': return 'exclamationmark'
    case 'cancelled': return 'xmark'
    default: return 'clock'
  }
}

/**
 * 🍎 TRUE APPLE FILE LIST COMPONENT
 */
export const FileList: React.FC<FileListProps> = ({
  files,
  onRemoveFile,
  onRetryFile,
  onClearAll,
  readonly = false,
  className = ''
}) => {
  // 🍎 MINIMAL STATS
  const stats = useMemo(() => {
    const total = files.length
    const completed = files.filter(f => f.status === 'completed').length
    const error = files.filter(f => f.status === 'error').length
    const uploading = files.filter(f => f.status === 'uploading').length

    return { total, completed, error, uploading }
  }, [files])

  if (files.length === 0) {
    return null
  }

  return (
    <div className={`file-list ${className}`}>
      {/* 🍎 MINIMAL HEADER: Only when needed */}
      <div className="file-list__header">
        <div className="file-list__header-left">
          <div className="file-list__title">
            {stats.total} {stats.total === 1 ? 'file' : 'files'}
          </div>

          {/* 🍎 SUBTLE STATS: Ultra-minimal badges */}
          {(stats.completed > 0 || stats.uploading > 0 || stats.error > 0) && (
            <div className="file-list__stats">
              {stats.completed > 0 && (
                <span className="file-list__stat file-list__stat--completed">
                  <SFSymbol
                    name="checkmark"
                    size={SFSymbolSize.CAPTION}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.completed}
                </span>
              )}
              {stats.uploading > 0 && (
                <span className="file-list__stat file-list__stat--uploading">
                  <SFSymbol
                    name="ellipsis"
                    size={SFSymbolSize.CAPTION}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.uploading}
                </span>
              )}
              {stats.error > 0 && (
                <span className="file-list__stat file-list__stat--error">
                  <SFSymbol
                    name="exclamationmark"
                    size={SFSymbolSize.CAPTION}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  {stats.error}
                </span>
              )}
            </div>
          )}
        </div>

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
              size={SFSymbolSize.CAPTION}
              weight={SFSymbolWeight.LIGHT}
            />
            <span className="file-list__clear-text">Clear</span>
          </button>
        )}
      </div>

      {/* 🍎 NATIVE TABLE: iOS/macOS style */}
      <div className="file-list__items">
        {files.map((uploadFile) => (
          <div
            key={uploadFile.id}
            className={`file-item file-item--${uploadFile.status}`}
          >
            {/* 🍎 MINIMAL ICON */}
            <div className="file-item__icon">
              <SFSymbol
                name={getFileIcon(uploadFile.file)}
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
            </div>

            {/* 🍎 CLEAN INFO */}
            <div className="file-item__info">
              <div className="file-item__name">
                {uploadFile.file.name}
              </div>

              <div className="file-item__details">
                <span className="file-item__size">
                  {uploadHelpers.formatFileSize(uploadFile.fileSize || uploadFile.file.size || 0)}
                </span>

                {uploadFile.relativePath && (
                  <span className="file-item__path">
                    {uploadFile.relativePath}
                  </span>
                )}

                {uploadFile.completedAt && (
                  <span className="file-item__time">
                    {uploadFile.completedAt.toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* 🍎 STATUS MESSAGES: Minimal */}
              {uploadFile.status === 'error' && uploadFile.error && (
                <div className="file-item__error">
                  {uploadFile.error}
                </div>
              )}

              {uploadFile.status === 'cancelled' && (
                <div className="file-item__cancelled">
                  Cancelled
                </div>
              )}
            </div>

            {/* 🍎 NATIVE STATUS: macOS Finder minimalism */}
            <div className="file-item__status">
              {uploadFile.status === 'uploading' && (
                <div className="file-item__progress-minimal">
                  <div
                    className="file-item__progress-fill"
                    style={{ width: `${uploadFile.progress}%` }}
                  />
                </div>
              )}

              {uploadFile.status === 'completed' && (
                <SFSymbol
                  name="checkmark"
                  size={SFSymbolSize.CAPTION}
                  weight={SFSymbolWeight.LIGHT}
                  className="file-item__done"
                />
              )}

              {uploadFile.status === 'error' && onRetryFile && (
                <button
                  type="button"
                  className="file-item__retry-minimal"
                  onClick={() => onRetryFile(uploadFile.id)}
                  aria-label="Retry"
                >
                  <SFSymbol
                    name="arrow.clockwise"
                    size={SFSymbolSize.CAPTION}
                    weight={SFSymbolWeight.LIGHT}
                  />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileList