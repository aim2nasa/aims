/**
 * Processing Log Component
 * @since 2025-10-23
 *
 * 🍎 Apple-style 문서 처리 로그 뷰
 * - AR 감지, 업로드 진행, 에러 등의 처리 로그 표시
 * - 접기/펼치기 기능
 * - 자동 스크롤 (최신 로그)
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { ProcessingLog as Log, LOG_CONFIG } from '../types/logTypes'
import Tooltip from '@/shared/ui/Tooltip'
import './ProcessingLog.css'

interface ProcessingLogProps {
  logs: Log[]
  maxHeight?: number
  className?: string
  onClear?: () => void
}

type SortOrder = 'oldest-first' | 'newest-first'

export const ProcessingLog: React.FC<ProcessingLogProps> = ({
  logs,
  maxHeight = 300,
  className = '',
  onClear
}) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest-first') // 기본값: 최신순 (위→아래로 최신이 맨 위)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef(logs.length)

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

  const downloadLogsAsText = () => {
    // 로그를 텍스트로 변환
    const logText = sortedLogs.map(log => {
      const time = formatTime(log.timestamp)
      const level = log.level.toUpperCase()
      const message = log.message
      const details = log.details ? ` - ${log.details}` : ''
      return `[${time}] [${level}] ${message}${details}`
    }).join('\n')

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

  return (
    <div className={`processing-log ${className}`}>
      {/* Header */}
      <div className="processing-log__header">
        <div className="processing-log__header-left">
          <span className="processing-log__title">처리 로그</span>
          <span className="processing-log__count">{logs.length}</span>
          <span className="processing-log__sort-status">
            {sortOrder === 'oldest-first' ? '오래된순 ↓' : '최신순 ↑'}
          </span>
        </div>
        <div className="processing-log__header-right">
          <Tooltip content={sortOrder === 'oldest-first' ? '최신순 정렬' : '오래된순 정렬'}>
            <div style={{ display: 'inline-block' }}>
              <button
                className="processing-log__sort"
                onClick={(e) => {
                  e.stopPropagation()
                  setSortOrder(prev => prev === 'oldest-first' ? 'newest-first' : 'oldest-first')
                }}
                aria-label={sortOrder === 'oldest-first' ? '최신순 정렬' : '오래된순 정렬'}
              >
                <span className="processing-log__sort-icon">
                  {sortOrder === 'oldest-first' ? '↓' : '↑'}
                </span>
              </button>
            </div>
          </Tooltip>
          <Tooltip content="로그 다운로드">
            <div style={{ display: 'inline-block' }}>
              <button
                className="processing-log__sort"
                onClick={(e) => {
                  e.stopPropagation()
                  downloadLogsAsText()
                }}
                aria-label="로그 다운로드"
              >
                <span className="processing-log__sort-icon">
                  💾
                </span>
              </button>
            </div>
          </Tooltip>
          <Tooltip content="로그 지우기">
            <div style={{ display: 'inline-block' }}>
              <button
                className="processing-log__clear"
                onClick={(e) => {
                  e.stopPropagation()
                  onClear?.()
                }}
                aria-label="로그 지우기"
              >
                <SFSymbol
                  name="trash"
                  size={SFSymbolSize.FOOTNOTE}
                  weight={SFSymbolWeight.SEMIBOLD}
                  decorative={true}
                />
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
                    <SFSymbol
                      name={config.icon}
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
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
    </div>
  )
}

export default ProcessingLog
