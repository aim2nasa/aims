/**
 * File List Section Component
 * @since 2025-10-23
 *
 * 🍎 Apple-style 업로드 파일 목록 영역
 * - 파일 목록, 진행률, 성공 메시지 통합 표시
 * - 처리로그와 시각적 일관성 유지
 */

import React from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import FileList from '../FileList/FileList'
import ProgressIndicator from '../ProgressIndicator/ProgressIndicator'
import RefreshButton from '../../../RefreshButton/RefreshButton'
import { UploadState } from '../types/uploadTypes'
import './FileListSection.css'

interface FileListSectionProps {
  uploadState: UploadState
  showSuccessMessage: boolean
  stats: {
    completed: number
    errors: number
    uploading: number
  }
  autoRegistrationLog: string | null
  onRetryFile: (fileId: string) => void
  onClearAll: () => void
  onCancelAll: () => void
  onDismissSuccess: () => void
  onDismissAutoRegistration: () => void
  className?: string
}

export const FileListSection: React.FC<FileListSectionProps> = ({
  uploadState,
  showSuccessMessage,
  stats,
  autoRegistrationLog,
  onRetryFile,
  onClearAll,
  onCancelAll,
  onDismissSuccess,
  onDismissAutoRegistration,
  className = ''
}) => {
  const hasFiles = uploadState.files.length > 0

  return (
    <div className={`file-list-section ${className}`}>
      {/* Header */}
      <div className="file-list-section__header">
        <div className="file-list-section__header-left">
          <span className="file-list-section__title">업로드 목록</span>
          {hasFiles && (
            <span className="file-list-section__count">{uploadState.files.length}</span>
          )}
        </div>
        <div className="file-list-section__header-right">
          {hasFiles && (
            <RefreshButton
              onClick={onClearAll}
              tooltip="업로드 기록 초기화"
              size="small"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="file-list-section__content">
        {/* 진행률 표시 - 업로드 중이거나 성공 메시지 표시 중일 때 */}
        {(uploadState.uploading || showSuccessMessage || stats.uploading > 0) && (
          <div className="file-list-section__progress">
            <ProgressIndicator
              uploadState={uploadState}
              onCancel={(uploadState.uploading || stats.uploading > 0) ? onCancelAll : (() => {})}
            />
          </div>
        )}

        {/* 파일 목록 */}
        {hasFiles ? (
          <>
            <FileList
              files={uploadState.files}
              onRetryFile={onRetryFile}
              onClearAll={onClearAll}
              readonly={false}
            />

            {/* 🍎 SUCCESS MESSAGE: Ultra-minimal notification */}
            {showSuccessMessage && stats.completed > 0 && (
              <div className="upload-success">
                <div className="upload-success__content">
                  <SFSymbol
                    name="checkmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    className="upload-success__icon"
                  />
                  <span className="upload-success__text">
                    {stats.errors > 0
                      ? `${stats.completed} uploaded, ${stats.errors} errors`
                      : `${stats.completed} files uploaded`
                    }
                  </span>
                  {!uploadState.uploading && (
                    <button
                      type="button"
                      onClick={onDismissSuccess}
                      className="upload-success__button"
                      aria-label="Clear completed uploads"
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

            {/* 🍎 Annual Report 자동 등록 로그 메시지 */}
            {autoRegistrationLog && (
              <div className="upload-success">
                <div className="upload-success__content">
                  <SFSymbol
                    name="checkmark.circle.fill"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    className="upload-success__icon"
                  />
                  <span className="upload-success__text">{autoRegistrationLog}</span>
                  <button
                    type="button"
                    onClick={onDismissAutoRegistration}
                    className="upload-success__button"
                    aria-label="Close notification"
                  >
                    <SFSymbol
                      name="xmark"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* 빈 상태 플레이스홀더 */
          <div className="file-list-section__empty">
            <SFSymbol
              name="doc"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.LIGHT}
              className="file-list-section__empty-icon"
            />
            <p className="file-list-section__empty-title">업로드된 파일이 없습니다</p>
            <p className="file-list-section__empty-hint">
              위 버튼을 클릭하거나<br />
              파일을 드래그하여 업로드하세요
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileListSection
