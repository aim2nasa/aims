/**
 * UploadSummary Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 업로드 완료 후 요약 표시 컴포넌트
 */

import { useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import { Button } from '@/shared/ui/Button'
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
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

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
              {/* 고객(폴더)별 그룹화 */}
              {(() => {
                const skippedFiles = progress.files.filter(f => f.status === 'skipped')
                const grouped = new Map<string, typeof skippedFiles>()
                for (const file of skippedFiles) {
                  const key = file.customerName || file.folderName || '기타'
                  const list = grouped.get(key) || []
                  list.push(file)
                  grouped.set(key, list)
                }
                return Array.from(grouped.entries()).map(([customerName, files]) => {
                  const isCollapsed = collapsedFolders.has(customerName)
                  return (
                    <div key={customerName} className="upload-summary-skipped-folder">
                      <div
                        className="upload-summary-skipped-folder-header"
                        onClick={() => setCollapsedFolders(prev => {
                          const next = new Set(prev)
                          if (next.has(customerName)) next.delete(customerName)
                          else next.add(customerName)
                          return next
                        })}
                      >
                        <span className="upload-summary-skipped-folder-toggle">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="upload-summary-skipped-folder-icon">📁</span>
                        <span className="upload-summary-skipped-folder-name">{customerName}</span>
                        <span className="upload-summary-skipped-folder-count">{files.length}개</span>
                      </div>
                      {!isCollapsed && (
                        <div className="upload-summary-skipped-folder-files">
                          {files.map(file => (
                            <div key={file.fileId} className="upload-summary-skipped-file">
                              <span className="upload-summary-skipped-file-icon">📄</span>
                              <span className="upload-summary-skipped-filename">{file.fileName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
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

      {/* 다음 작업 안내 + 시나리오별 CTA 버튼 */}
      {(() => {
        // 전체 실패 / 재시도 가능 시나리오는 안내/재배치 대상 아님 (기존 동작 유지)
        if (isFullFailure) {
          return (
            <div className="upload-summary-actions">
              <Button variant="secondary" size="sm" onClick={onClose}>
                돌아가기
              </Button>
              <Button variant="primary" size="sm" onClick={onContinueBatchUpload || onClose}>
                다시 시도
              </Button>
            </div>
          )
        }
        if (isPartialSuccess && hasRetryableFailures && onRetryFailed) {
          return (
            <div className="upload-summary-actions">
              {onViewDocuments && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ViewDocumentsIcon />}
                  onClick={onViewDocuments}
                >
                  전체 문서 보기
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={
                  <SFSymbol
                    name="arrow-clockwise"
                    size={SFSymbolSize.FOOTNOTE}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                }
                onClick={onRetryFailed}
              >
                실패 항목 재시도
              </Button>
            </div>
          )
        }

        // 전체 성공 / 부분 실패(재시도 불가) / 취소됨:
        // [전체 문서 보기 (Secondary, 왼쪽)] [문서 일괄등록 (Primary, 오른쪽)]
        return (
          <>
            <div className="upload-summary-next-guide" role="note">
              <div className="upload-summary-next-guide-title">다음 작업을 선택하세요</div>
              <ul className="upload-summary-next-guide-list">
                <li>
                  <strong>전체 문서 보기</strong>
                  <span> — 방금 업로드한 문서 처리 상태 확인</span>
                </li>
                <li>
                  <strong>문서 일괄등록</strong>
                  <span> — 다른 문서 폴더들 일괄 업로드</span>
                </li>
              </ul>
            </div>
            <div className="upload-summary-actions">
              {onViewDocuments && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ViewDocumentsIcon />}
                  onClick={onViewDocuments}
                >
                  전체 문서 보기
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={<BatchUploadIcon />}
                onClick={onContinueBatchUpload || onClose}
              >
                문서 일괄등록
              </Button>
            </div>
          </>
        )
      })()}
    </div>
  )
}

/**
 * 사이드바 "문서 일괄등록" 메뉴(MenuIcons.DocumentBatchUpload)와
 * 100% 동일한 SFSymbol/사이즈/색상 클래스를 재현합니다.
 * @see components/CustomMenu/CustomMenu.tsx  MenuIcons.DocumentBatchUpload
 */
function BatchUploadIcon() {
  return (
    <span className="menu-icon-cyan upload-summary-btn-icon">
      <SFSymbol
        name="archivebox"
        size={SFSymbolSize.CALLOUT}
        weight={SFSymbolWeight.MEDIUM}
      />
    </span>
  )
}

/**
 * 사이드바 "전체 문서 보기" 메뉴(MenuIcons.Library)와
 * 100% 동일한 SFSymbol/사이즈/색상 클래스를 재현합니다.
 * @see components/CustomMenu/CustomMenu.tsx  MenuIcons.Library
 */
function ViewDocumentsIcon() {
  return (
    <span className="menu-icon-purple upload-summary-btn-icon">
      <SFSymbol
        name="books-vertical"
        size={SFSymbolSize.CALLOUT}
        weight={SFSymbolWeight.MEDIUM}
      />
    </span>
  )
}
