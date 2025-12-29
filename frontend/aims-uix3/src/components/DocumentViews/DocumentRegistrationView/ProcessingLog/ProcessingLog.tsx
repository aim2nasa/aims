/**
 * Processing Log Component
 * @since 2025-10-23
 *
 * 🍎 Apple-style 문서 처리 로그 뷰
 * - AR 감지, 업로드 진행, 에러 등의 처리 로그 표시
 * - 업로드 진행률 표시 통합
 * - 업로드 완료 시 파일 목록 요약 표시
 * - 자동 스크롤 (최신 로그)
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ProcessingLog as Log, LOG_CONFIG } from '../types/logTypes'
import { UploadState, UploadFile } from '../types/uploadTypes'
import ProgressIndicator from '../ProgressIndicator/ProgressIndicator'
import Tooltip from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import './ProcessingLog.css'

interface ProcessingLogProps {
  logs: Log[]
  maxHeight?: number
  className?: string
  onClear?: () => void
  /** 업로드 상태 (통합된 진행률 표시용) */
  uploadState?: UploadState
  /** 업로드 통계 */
  uploadStats?: {
    completed: number
    errors: number
    uploading: number
  }
  /** 업로드 취소 핸들러 */
  onCancelUpload?: () => void
  /** 파일 재시도 핸들러 */
  onRetryFile?: (fileId: string) => void
}

type SortOrder = 'oldest-first' | 'newest-first'

export const ProcessingLog: React.FC<ProcessingLogProps> = ({
  logs,
  maxHeight = 300,
  className = '',
  onClear,
  uploadState,
  uploadStats,
  onCancelUpload,
  onRetryFile
}) => {
  // 개발자 모드 확인
  const { isDevMode } = useDevModeStore()

  const [sortOrder, setSortOrder] = useState<SortOrder>('newest-first') // 기본값: 최신순 (위→아래로 최신이 맨 위)
  const [isFileSummaryExpanded, setIsFileSummaryExpanded] = useState(true) // 파일 요약 펼침 상태
  const logContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef(logs.length)

  // 업로드 상태 확인
  const hasFiles = uploadState && uploadState.files.length > 0
  const isUploading = uploadState?.uploading || (uploadStats?.uploading ?? 0) > 0

  // 파일 상태별 분류
  const completedFiles = uploadState?.files.filter(f => f.status === 'completed' || f.status === 'warning') || []
  const errorFiles = uploadState?.files.filter(f => f.status === 'error') || []

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 정렬된 로그 목록
  const sortedLogs = useMemo(() => {
    if (sortOrder === 'newest-first') {
      return [...logs] // 이미 최신순으로 추가되므로 그대로
    } else {
      return [...logs].reverse() // 오래된순으로 뒤집기
    }
  }, [logs, sortOrder])

  // 새 로그 추가 시 또는 정렬 순서 변경 시 자동 스크롤
  useEffect(() => {
    if (logContainerRef.current && logs.length > 0) {
      // 로그가 추가되거나 정렬 순서가 변경되면 최신 로그로 스크롤
      if (sortOrder === 'oldest-first') {
        // 오래된순: 맨 아래로 스크롤 (최신 로그가 아래에 있음)
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      } else {
        // 최신순: 맨 위로 스크롤 (최신 로그가 위에 있음)
        logContainerRef.current.scrollTop = 0
      }
    }
    prevLogsLengthRef.current = logs.length
  }, [logs.length, sortOrder])

  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }

  const getLogsAsText = () => {
    // 로그를 텍스트로 변환
    return sortedLogs.map(log => {
      const time = formatTime(log.timestamp)
      const level = log.level.toUpperCase()
      const message = log.message
      const details = log.details ? ` - ${log.details}` : ''
      return `[${time}] [${level}] ${message}${details}`
    }).join('\n')
  }

  const copyLogsToClipboard = async () => {
    const logText = getLogsAsText()
    try {
      await navigator.clipboard.writeText(logText)
      // 복사 성공 피드백 (필요시 토스트 메시지 추가 가능)
      console.log('로그가 클립보드에 복사되었습니다.')
    } catch (error) {
      console.error('클립보드 복사 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'ProcessingLog.copyToClipboard' })
    }
  }

  const downloadLogsAsText = () => {
    const logText = getLogsAsText()

    // 현재 시간을 파일명에 포함
    const now = new Date()
    const filename = `processing-log-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.txt`

    // Blob 생성 및 다운로드
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 파일 아이템 렌더링
  const renderFileItem = (file: UploadFile) => {
    const getStatusIcon = () => {
      switch (file.status) {
        case 'completed':
        case 'warning':
          // ✅ 완료: 초록색 원형 체크마크 (눈에 잘 띄게)
          return <span className="file-item__check-circle">✓</span>
        case 'error':
          return <span className="file-item__error-icon">!</span>
        case 'uploading':
          return <span className="file-item__spinner" />
        default:
          return <SFSymbol name="clock" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} className="file-item__icon file-item__icon--pending" />
      }
    }

    return (
      <div key={file.id} className={`file-item file-item--${file.status}`}>
        <div className="file-item__status">
          {getStatusIcon()}
        </div>
        <div className="file-item__info">
          <span className="file-item__name">{file.file.name}</span>
          <span className="file-item__size">{formatFileSize(file.fileSize)}</span>
        </div>
        {file.status === 'uploading' && (
          <div className="file-item__progress">
            <div className="file-item__progress-bar" style={{ width: `${file.progress}%` }} />
          </div>
        )}
        {/* 완료: 완료 텍스트 */}
        {(file.status === 'completed' || file.status === 'warning') && (
          <span className="file-item__status-text file-item__status-text--success">완료</span>
        )}
        {file.status === 'error' && file.error && (
          <span className="file-item__error">{file.error}</span>
        )}
        {/* 바이러스 감지 에러는 재시도 불가 */}
        {file.status === 'error' && onRetryFile && !file.error?.includes('바이러스 감지') && (
          <button
            type="button"
            className="file-item__retry"
            onClick={() => onRetryFile(file.id)}
            aria-label="재시도"
          >
            재시도
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`processing-log ${className}`}>
      {/* 업로드 진행률 표시 (업로드 중일 때만) */}
      {uploadState && isUploading && (
        <div className="processing-log__progress">
          <ProgressIndicator
            uploadState={uploadState}
            onCancel={onCancelUpload || (() => {})}
          />
        </div>
      )}

      {/* 업로드 파일 요약 (파일이 있을 때만) */}
      {hasFiles && !isUploading && (
        <div className="processing-log__file-summary">
          <button
            type="button"
            className="file-summary__toggle"
            onClick={() => setIsFileSummaryExpanded(!isFileSummaryExpanded)}
            aria-expanded={isFileSummaryExpanded ? "true" : "false"}
          >
            <div className="file-summary__header">
              <SFSymbol
                name="doc"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="file-summary__icon"
              />
              <span className="file-summary__title">업로드 결과</span>
              <span className="file-summary__count">
                {completedFiles.length}/{uploadState?.files.length || 0}
              </span>
              {errorFiles.length > 0 && (
                <span className="file-summary__error-count">
                  {errorFiles.length} 실패
                </span>
              )}
              <span className="file-summary__chevron" aria-hidden="true">
                {isFileSummaryExpanded ? '▲' : '▼'}
              </span>
            </div>
          </button>

          {isFileSummaryExpanded && (
            <div className="file-summary__content">
              {/* 완료된 파일 */}
              {completedFiles.length > 0 && (
                <div className="file-summary__section">
                  <div className="file-summary__section-header">
                    <SFSymbol name="checkmark" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} className="file-summary__section-icon file-summary__section-icon--success" />
                    <span>완료 ({completedFiles.length})</span>
                  </div>
                  <div className="file-summary__list">
                    {completedFiles.map(renderFileItem)}
                  </div>
                </div>
              )}

              {/* 실패한 파일 */}
              {errorFiles.length > 0 && (
                <div className="file-summary__section">
                  <div className="file-summary__section-header">
                    <span className="file-summary__error-icon">!</span>
                    <span className="file-summary__section-title--error">실패 ({errorFiles.length})</span>
                  </div>
                  <div className="file-summary__list">
                    {errorFiles.map(renderFileItem)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header + Log List: 개발자 모드에서만 표시 */}
      {isDevMode && (
        <>
          {/* Header */}
          <div className="processing-log__header">
            <div className="processing-log__header-left">
              <span className="processing-log__title">처리 로그</span>
              <span className="processing-log__count">{logs.length}</span>
              <span className="processing-log__separator">·</span>
              <span className="processing-log__sort-status">
                {sortOrder === 'oldest-first' ? '오래된순' : '최신순'}
              </span>
            </div>
            <div className="processing-log__header-right">
              <Tooltip content={sortOrder === 'oldest-first' ? '최신순 정렬' : '오래된순 정렬'}>
                <div style={{ display: 'inline-block' }}>
                  <button
                    className="processing-log__sort processing-log__sort--primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSortOrder(prev => prev === 'oldest-first' ? 'newest-first' : 'oldest-first')
                    }}
                    aria-label={sortOrder === 'oldest-first' ? '최신순 정렬' : '오래된순 정렬'}
                  >
                    <span className="processing-log__button-icon">
                      {sortOrder === 'oldest-first' ? '↑' : '↓'}
                    </span>
                  </button>
                </div>
              </Tooltip>
              <Tooltip content="로그 복사">
                <div style={{ display: 'inline-block' }}>
                  <button
                    className="processing-log__sort processing-log__sort--success"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyLogsToClipboard()
                    }}
                    aria-label="로그 복사"
                  >
                    <span className="processing-log__button-icon">
                      📋
                    </span>
                  </button>
                </div>
              </Tooltip>
              <Tooltip content="로그 다운로드">
                <div style={{ display: 'inline-block' }}>
                  <button
                    className="processing-log__sort processing-log__sort--info"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadLogsAsText()
                    }}
                    aria-label="로그 다운로드"
                  >
                    <span className="processing-log__button-icon">
                      💾
                    </span>
                  </button>
                </div>
              </Tooltip>
              <Tooltip content="로그 지우기">
                <div style={{ display: 'inline-block' }}>
                  <button
                    className="processing-log__clear processing-log__clear--danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClear?.()
                    }}
                    aria-label="로그 지우기"
                  >
                    <span className="processing-log__button-icon">
                      🗑️
                    </span>
                  </button>
                </div>
              </Tooltip>
            </div>
          </div>

          {/* Log List */}
          <div
            ref={logContainerRef}
            className="processing-log__container"
            style={{ maxHeight: `${maxHeight}px` }}
          >
              {sortedLogs.map((log) => {
                const config = LOG_CONFIG[log.level]

                return (
                  <div key={log.id} className="processing-log__item">
                    <div className="processing-log__item-header">
                      <div
                        className="processing-log__icon"
                        style={{
                          color: config.color,
                          backgroundColor: config.bgColor
                        }}
                      >
                        <span className="processing-log__icon-symbol">
                          {config.icon}
                        </span>
                      </div>
                      <span className="processing-log__time">
                        {formatTime(log.timestamp)}
                      </span>
                      <span
                        className="processing-log__message"
                        style={{ color: config.color }}
                      >
                        {log.message}
                        {log.details && (
                          <span className="processing-log__details">
                            {log.details}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

export default ProcessingLog
