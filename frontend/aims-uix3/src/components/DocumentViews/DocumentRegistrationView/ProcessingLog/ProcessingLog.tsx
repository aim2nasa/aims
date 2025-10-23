/**
 * Processing Log Component
 * @since 2025-10-23
 *
 * 🍎 Apple-style 문서 처리 로그 뷰
 * - AR 감지, 업로드 진행, 에러 등의 처리 로그 표시
 * - 접기/펼치기 기능
 * - 자동 스크롤 (최신 로그)
 */

import React, { useState, useRef, useEffect } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { ProcessingLog as Log, LOG_CONFIG } from '../types/logTypes'
import './ProcessingLog.css'

interface ProcessingLogProps {
  logs: Log[]
  maxHeight?: number
  className?: string
  onClear?: () => void
}

export const ProcessingLog: React.FC<ProcessingLogProps> = ({
  logs,
  maxHeight = 300,
  className = '',
  onClear
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // 새 로그 추가 시 자동 스크롤
  useEffect(() => {
    if (isExpanded && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0 // 최신 로그가 위에 있으므로 top으로 스크롤
    }
  }, [logs.length, isExpanded])

  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  if (logs.length === 0) {
    return null
  }

  return (
    <div className={`processing-log ${className}`}>
      {/* Header */}
      <div
        className="processing-log__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="processing-log__header-left">
          <SFSymbol
            name={isExpanded ? 'chevron.down' : 'chevron.right'}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            className="processing-log__chevron"
          />
          <span className="processing-log__title">처리 로그</span>
          <span className="processing-log__count">{logs.length}</span>
        </div>
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
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
        </button>
      </div>

      {/* Log List */}
      {isExpanded && (
        <div
          ref={logContainerRef}
          className="processing-log__container"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {logs.map((log) => {
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
                  </span>
                </div>
                {log.details && (
                  <div className="processing-log__details">
                    {log.details}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProcessingLog
