/**
 * UploadSummary Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 업로드 완료 후 요약 표시 컴포넌트
 */

import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import type { BatchUploadProgress } from '../hooks/useBatchUpload'
import './UploadSummary.css'

interface UploadSummaryProps {
  progress: BatchUploadProgress
  onClose: () => void
  onRetryFailed?: () => void
  onViewDocuments?: () => void  // "전체 문서 보기"로 이동
}

export default function UploadSummary({ progress, onClose, onRetryFailed, onViewDocuments }: UploadSummaryProps) {
  const { totalFiles, completedFiles, failedFiles, folders, state } = progress

  const isFullSuccess = failedFiles === 0 && completedFiles === totalFiles
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
        description: `${completedFiles}개 파일이 ${folders.length}명의 고객에게 등록되었습니다.`,
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

  return (
    <div className="upload-summary">
      {/* 상태 아이콘 */}
      <div className={`upload-summary-icon ${status.iconClass}`}>
        <SFSymbol name={status.icon} size={SFSymbolSize.TITLE1} weight={SFSymbolWeight.MEDIUM} />
      </div>

      {/* 제목 및 설명 */}
      <h2 className="upload-summary-title">{status.title}</h2>
      <p className="upload-summary-description">{status.description}</p>

      {/* 통계 카드 */}
      <div className="upload-summary-stats">
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value">{folders.length}</span>
          <span className="upload-summary-stat-label">폴더</span>
        </div>
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value success">{completedFiles}</span>
          <span className="upload-summary-stat-label">성공</span>
        </div>
        {failedFiles > 0 && (
          <div className="upload-summary-stat">
            <span className="upload-summary-stat-value error">{failedFiles}</span>
            <span className="upload-summary-stat-label">실패</span>
          </div>
        )}
        <div className="upload-summary-stat">
          <span className="upload-summary-stat-value">{getElapsedTime()}</span>
          <span className="upload-summary-stat-label">소요 시간</span>
        </div>
      </div>

      {/* 실패 목록 */}
      {failedFolders.length > 0 && (
        <div className="upload-summary-failures">
          <h3 className="upload-summary-failures-title">실패한 항목</h3>
          <div className="upload-summary-failures-list">
            {failedFolders.map((folder) => (
              <div key={folder.folderName} className="upload-summary-failure-item">
                <span className="upload-summary-failure-folder">{folder.folderName}</span>
                <span className="upload-summary-failure-count">
                  {folder.failedFiles}개 실패
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="upload-summary-actions">
        {failedFiles > 0 && onRetryFailed && (
          <button className="upload-summary-btn secondary" onClick={onRetryFailed}>
            <SFSymbol
              name="arrow-clockwise"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>실패 항목 재시도</span>
          </button>
        )}
        {onViewDocuments && (
          <button className="upload-summary-btn secondary" onClick={onViewDocuments}>
            <SFSymbol
              name="doc-text-magnifyingglass"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>현재 진행상황 보기</span>
          </button>
        )}
        <button className="upload-summary-btn primary" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  )
}
