/**
 * UploadSummary Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 업로드 완료 후 요약 표시 컴포넌트
 */

import { useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import type { BatchUploadProgress } from '../hooks/useBatchUpload'
import './UploadSummary.css'

interface UploadSummaryProps {
  progress: BatchUploadProgress
  onClose: () => void
  onRetryFailed?: () => void
  onViewDocuments?: () => void  // "전체 문서 보기"로 이동
  onContinueBatchUpload?: () => void  // "계속 일괄등록" (상태 초기화 후 파일 선택으로)
}

export default function UploadSummary({ progress, onClose, onRetryFailed, onViewDocuments, onContinueBatchUpload }: UploadSummaryProps) {
  const { totalFiles, completedFiles, failedFiles, skippedFiles, folders, state } = progress
  const [showSkippedFiles, setShowSkippedFiles] = useState(false)

  const isFullSuccess = failedFiles === 0 && (completedFiles + skippedFiles) === totalFiles
  const isPartialSuccess = completedFiles > 0 && failedFiles > 0
  const isFullFailure = completedFiles === 0 && failedFiles > 0
  const isCancelled = state === 'cancelled'

  // 경과 시간 계산
  const getElapsedTime = (): string => {
    if (!progress.startedAt || !progress.completedAt) return '-'

    const elapsed = Math.floor(
      (progress.completedAt.getTime() - progress.startedAt.getTime()) / 1000
    )

    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60

    if (minutes > 0) {
      return `${minutes}분 ${seconds}초`
    }
    return `${seconds}초`
  }

  // 상태별 아이콘 및 메시지
  const getStatusDisplay = () => {
    if (isCancelled) {
      return {
        icon: 'xmark-circle-fill',
        iconClass: 'cancelled',
        title: '업로드가 취소되었습니다',
        description: `${completedFiles}개 파일이 업로드되었습니다.`,
      }
    }
    if (isFullSuccess) {
      return {
        icon: 'checkmark-circle-fill',
        iconClass: 'success',
        title: '업로드 완료!',
        description: skippedFiles > 0
          ? `${completedFiles}개 파일 등록, ${skippedFiles}개 건너뜀 (중복)`
          : `${completedFiles}개 파일이 ${folders.length}명의 고객에게 등록되었습니다.`,
      }
    }
    if (isPartialSuccess) {
      return {
        icon: 'exclamationmark-circle-fill',
        iconClass: 'warning',
        title: '일부 파일 업로드 실패',
        description: `${completedFiles}개 성공, ${failedFiles}개 실패`,
      }
    }
    if (isFullFailure) {
      return {
        icon: 'xmark-circle-fill',
        iconClass: 'error',
        title: '업로드 실패',
        description: '모든 파일 업로드에 실패했습니다.',
      }
    }
    return {
      icon: 'questionmark-circle-fill',
      iconClass: '',
      title: '업로드 결과',
      description: '',
    }
  }

  const status = getStatusDisplay()

  // 실패한 폴더 목록
  const failedFolders = folders.filter((f) => f.status === 'failed' || f.status === 'partial')

  // 바이러스 감지로 실패한 파일이 있는지 확인 (재시도 불가)
  const hasVirusFailures = progress.files.some(
    (f) => f.status === 'failed' && f.error?.includes('바이러스 감지')
  )
  // 재시도 가능한 실패 파일이 있는지 확인
  const hasRetryableFailures = progress.files.some(
    (f) => f.status === 'failed' && !f.error?.includes('바이러스 감지')
  )

  return (
    <div className="upload-summary">
      {/* 상태 아이콘 */}
      <div className={`upload-summary-icon ${status.iconClass}`}>
        <SFSymbol name={status.icon} size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />
      </div>

      {/* 제목 및 설명 */}
      <h2 className="upload-summary-title">{status.title}</h2>
      <p className="upload-summary-description">{status.description}</p>

      {/* 통계 카드 */}
      <div className="upload-summary-stats">
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value">{folders.length}개</span>
          <span className="upload-summary-stat-label">폴더</span>
        </div>
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value success">{completedFiles}개</span>
          <span className="upload-summary-stat-label">성공</span>
        </div>
        {skippedFiles > 0 && (
          <div className="upload-summary-stat">
            <span className="upload-summary-stat-value skipped">{skippedFiles}개</span>
            <span className="upload-summary-stat-label">건너뜀 (중복)</span>
          </div>
        )}
        {failedFiles > 0 && (
          <div className="upload-summary-stat">
            <span className="upload-summary-stat-value error">{failedFiles}개</span>
            <span className="upload-summary-stat-label">실패</span>
          </div>
        )}
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value">{getElapsedTime()}</span>
          <span className="upload-summary-stat-label">소요 시간</span>
        </div>
      </div>

      {/* 건너뛴 파일 목록 (접기/펼치기) */}
      {skippedFiles > 0 && (
        <div className="upload-summary-skipped">
          <button
            type="button"
            className="upload-summary-skipped-toggle"
            onClick={() => setShowSkippedFiles(!showSkippedFiles)}
          >
            <SFSymbol
              name={showSkippedFiles ? 'chevron-down' : 'chevron-right'}
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>건너뛴 파일 {skippedFiles}건 (중복)</span>
          </button>
          {showSkippedFiles && (
            <div className="upload-summary-skipped-list">
              {progress.files
                .filter((f) => f.status === 'skipped')
                .map((file) => (
                  <div key={file.fileId} className="upload-summary-skipped-item">
                    <span className="upload-summary-skipped-filename">{file.fileName}</span>
                    <span className="upload-summary-skipped-customer">{file.customerName}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 실패 목록 */}
      {failedFolders.length > 0 && (
        <div className="upload-summary-failures">
          <h3 className="upload-summary-failures-title">실패한 항목</h3>
          <div className="upload-summary-failures-list">
            {failedFolders.map((folder) => {
              // 해당 폴더의 실패한 파일 목록
              const failedFilesInFolder = progress.files.filter(
                (f) => f.folderName === folder.folderName && f.status === 'failed'
              )
              return (
                <div key={folder.folderName} className="upload-summary-failure-item">
                  <div className="upload-summary-failure-header">
                    <span className="upload-summary-failure-folder">{folder.folderName}</span>
                    <span className="upload-summary-failure-count">
                      {folder.failedFiles}개 실패
                    </span>
                  </div>
                  {/* 실패한 파일 상세 목록 */}
                  {failedFilesInFolder.length > 0 && (
                    <div className="upload-summary-failure-files">
                      {failedFilesInFolder.map((file) => (
                        <div key={file.fileId} className="upload-summary-failure-file">
                          <span className="upload-summary-failure-filename">{file.fileName}</span>
                          {file.error && (
                            <span className="upload-summary-failure-reason">{file.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 시나리오별 CTA 버튼 */}
      <div className="upload-summary-actions">
        {(() => {
          // 시나리오별 버튼 매핑 (왼쪽=Secondary, 오른쪽=Primary, Apple HIG)
          if (isCancelled) {
            // 취소됨: [전체 문서 보기] [계속 일괄등록]
            return (
              <>
                {onViewDocuments && (
                  <button className="upload-summary-btn secondary" onClick={onViewDocuments}>
                    전체 문서 보기
                  </button>
                )}
                <button className="upload-summary-btn primary" onClick={onContinueBatchUpload || onClose}>
                  계속 일괄등록
                </button>
              </>
            )
          }
          if (isFullFailure) {
            // 전체 실패: [돌아가기] [다시 시도]
            return (
              <>
                <button className="upload-summary-btn secondary" onClick={onClose}>
                  돌아가기
                </button>
                <button className="upload-summary-btn primary" onClick={onContinueBatchUpload || onClose}>
                  다시 시도
                </button>
              </>
            )
          }
          if (isPartialSuccess && hasRetryableFailures && onRetryFailed) {
            // 부분 실패 (재시도 가능): [전체 문서 보기] [실패 항목 재시도]
            return (
              <>
                {onViewDocuments && (
                  <button className="upload-summary-btn secondary" onClick={onViewDocuments}>
                    전체 문서 보기
                  </button>
                )}
                <button className="upload-summary-btn primary" onClick={onRetryFailed}>
                  <SFSymbol
                    name="arrow-clockwise"
                    size={SFSymbolSize.FOOTNOTE}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  <span>실패 항목 재시도</span>
                </button>
              </>
            )
          }
          if (isPartialSuccess) {
            // 부분 실패 (재시도 불가): [계속 일괄등록] [전체 문서 보기]
            return (
              <>
                <button className="upload-summary-btn secondary" onClick={onContinueBatchUpload || onClose}>
                  계속 일괄등록
                </button>
                {onViewDocuments && (
                  <button className="upload-summary-btn primary" onClick={onViewDocuments}>
                    전체 문서 보기
                  </button>
                )}
              </>
            )
          }
          // 전체 성공: [계속 일괄등록] [전체 문서 보기]
          return (
            <>
              <button className="upload-summary-btn secondary" onClick={onContinueBatchUpload || onClose}>
                계속 일괄등록
              </button>
              {onViewDocuments && (
                <button className="upload-summary-btn primary" onClick={onViewDocuments}>
                  전체 문서 보기
                </button>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
