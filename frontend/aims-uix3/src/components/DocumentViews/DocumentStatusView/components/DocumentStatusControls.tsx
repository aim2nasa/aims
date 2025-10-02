/**
 * DocumentStatusControls Component
 * @since 1.0.0
 *
 * 문서 처리 현황 컨트롤 UI 컴포넌트
 * 🍎 Apple/iOS 디자인 시스템 적용
 */

import React from 'react'
import './DocumentStatusControls.css'

interface DocumentStatusControlsProps {
  /** 폴링 활성화 상태 */
  isPollingEnabled: boolean
  /** 폴링 토글 핸들러 */
  onTogglePolling: () => void
  /** 수동 새로고침 핸들러 */
  onRefresh: () => void
  /** 로딩 상태 */
  isLoading: boolean
  /** API 연결 상태 */
  apiHealth: boolean | null
  /** 마지막 업데이트 시간 */
  lastUpdated: Date | null
}

/**
 * DocumentStatusControls React 컴포넌트
 *
 * 실시간 업데이트 및 제어 UI
 * - 폴링 ON/OFF 토글
 * - 새로고침 버튼
 * - API 연결 상태
 * - 마지막 업데이트 시간
 *
 * @example
 * ```tsx
 * <DocumentStatusControls
 *   isPollingEnabled={true}
 *   onTogglePolling={handleToggle}
 *   onRefresh={handleRefresh}
 *   isLoading={false}
 *   apiHealth={true}
 *   lastUpdated={new Date()}
 * />
 * ```
 */
export const DocumentStatusControls: React.FC<DocumentStatusControlsProps> = ({
  isPollingEnabled,
  onTogglePolling,
  onRefresh,
  isLoading,
  apiHealth,
  lastUpdated
}) => {
  return (
    <div className="document-status-controls">
      <div className="controls-container">
        {/* 왼쪽: 상태 정보 */}
        <div className="controls-left">
          {/* API 연결 상태 */}
          <div className="status-indicator">
            <div className={`status-dot ${apiHealth ? 'status-dot-connected' : 'status-dot-disconnected'}`} />
            <span className="status-text">
              {apiHealth ? 'API 연결됨' : 'API 연결 끊김'}
            </span>
          </div>

          {/* 마지막 업데이트 시간 */}
          {lastUpdated && (
            <div className="update-time">
              <span className="update-time-label">마지막 업데이트:</span>
              <span className="update-time-value">
                {lastUpdated.toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </span>
            </div>
          )}
        </div>

        {/* 오른쪽: 컨트롤 버튼 */}
        <div className="controls-right">
          {/* 폴링 토글 버튼 */}
          <button
            className={`control-button polling-button ${isPollingEnabled ? 'polling-enabled' : 'polling-disabled'}`}
            onClick={onTogglePolling}
            aria-label={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}
            title={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}
          >
            <div className={`polling-dot ${isPollingEnabled ? 'polling-dot-active' : ''}`} />
            <span className="button-text">
              {isPollingEnabled ? '실시간 업데이트 중' : '일시 정지됨'}
            </span>
          </button>

          {/* 새로고침 버튼 */}
          <button
            className="control-button refresh-button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="새로고침"
            title="새로고침"
          >
            <span className={`refresh-icon ${isLoading ? 'refresh-icon-spinning' : ''}`}>
              ↻
            </span>
            <span className="button-text">새로고침</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocumentStatusControls
