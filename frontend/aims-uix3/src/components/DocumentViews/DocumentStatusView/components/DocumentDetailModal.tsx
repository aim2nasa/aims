/**
 * DocumentDetailModal Component
 * @since 1.0.0
 * @version 2.0.0 - 🍎 문서검색 FullTextModal 스타일 적용
 *
 * 문서 상세 정보를 표시하는 모달 컴포넌트
 * - React Portal 사용
 * - 드래그로 이동 가능
 * - ESC 키로 닫기
 * - iOS 스타일 디자인
 */

import React, { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/documentStatusService'
import './DocumentDetailModal.css'

interface DocumentDetailModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 선택된 문서 */
  document: Document | null
}

type CopiedState = {
  [key: string]: boolean
}

/**
 * DocumentDetailModal React 컴포넌트
 *
 * 문서의 상세 정보를 탭 형식으로 표시하는 모달
 * - Processing Progress: 처리 진행 상태
 * - Document Info: 문서 정보 (복사 기능)
 * - Raw Data: 원본 JSON 데이터
 *
 * @example
 * ```tsx
 * <DocumentDetailModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   document={selectedDocument}
 * />
 * ```
 */
export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  visible,
  onClose,
  document
}) => {
  const [activeTab, setActiveTab] = useState<'progress' | 'info' | 'raw'>('progress')
  const [copied, setCopied] = useState<CopiedState>({})

  // 🍎 드래그 상태 관리
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  /**
   * 드래그 중 핸들러
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y

    setPosition({ x: newX, y: newY })
  }

  /**
   * 드래그 종료 핸들러
   */
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  /**
   * 드래그 이벤트 리스너 등록
   */
  React.useEffect(() => {
    if (isDragging) {
      window.document.addEventListener('mousemove', handleMouseMove)
      window.document.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.document.removeEventListener('mousemove', handleMouseMove)
        window.document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [isDragging, dragStart])

  /**
   * ESC 키 핸들러
   */
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose()
      }
    }

    if (visible) {
      window.document.addEventListener('keydown', handleEscape)
      return () => {
        window.document.removeEventListener('keydown', handleEscape)
      }
    }
    return undefined
  }, [visible, onClose])

  /**
   * 모달이 열릴 때 위치 초기화
   */
  React.useEffect(() => {
    if (visible) {
      setPosition({ x: 0, y: 0 })
      setActiveTab('progress') // 탭도 초기화
    }
  }, [visible])

  if (!visible || !document) return null

  const filename = DocumentStatusService.extractFilename(document)
  const saveName = DocumentStatusService.extractSaveName(document)
  const status = DocumentStatusService.extractStatus(document)
  const progress = DocumentStatusService.extractProgress(document)

  /**
   * 클립보드 복사 핸들러
   * 복사 성공 시 2초간 체크마크 표시
   */
  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopied((prev) => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
    }
  }

  /**
   * 배경 클릭 핸들러 (모달 닫기)
   */
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  /**
   * 드래그 시작 핸들러
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const modalContent = (
    <div
      className="fulltext-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div
        ref={modalRef}
        className="fulltext-modal-container"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* 모달 헤더 */}
        <div
          className="fulltext-modal-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <h2 id="detail-modal-title" className="fulltext-modal-title">
            {filename}
          </h2>
          <button
            className="fulltext-modal-close"
            onClick={onClose}
            aria-label="모달 닫기"
            onMouseDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="detail-tab-navigation">
          <button
            className={`detail-tab-button ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
            aria-pressed={activeTab === 'progress'}
          >
            처리 진행
          </button>
          <button
            className={`detail-tab-button ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            aria-pressed={activeTab === 'info'}
          >
            문서 정보
          </button>
          <button
            className={`detail-tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
            aria-pressed={activeTab === 'raw'}
          >
            원본 데이터
          </button>
        </div>

        {/* 모달 바디 */}
        <div className="fulltext-modal-body">
          {/* 처리 진행 탭 */}
          {activeTab === 'progress' && (
            <div className="detail-tab-content">
              <h3 className="detail-section-title">처리 진행 상태</h3>

              {/* 진행률 바 */}
              <div className="detail-progress-bar-wrapper">
                <div
                  className={`detail-progress-bar-fill status-${status}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* 진행 정보 */}
              <div className="detail-progress-info-grid">
                <div className="detail-info-item">
                  <span className="detail-info-label">진행률</span>
                  <span className="detail-info-value">{progress}%</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">상태</span>
                  <span className="detail-info-value">
                    <span className={`detail-status-badge status-${status}`}>
                      {status === 'processing' && <span className="detail-status-icon">⟳</span>}
                      {status === 'completed' && <span className="detail-status-icon">✓</span>}
                      {status === 'error' && <span className="detail-status-icon">✕</span>}
                      {status === 'pending' && <span className="detail-status-icon">⋯</span>}
                      {status}
                    </span>
                  </span>
                </div>
                {saveName && (
                  <div className="detail-info-item">
                    <span className="detail-info-label">서버 파일명</span>
                    <span className="detail-info-value detail-info-value--wrap">
                      {saveName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 문서 정보 탭 */}
          {activeTab === 'info' && (
            <div className="detail-tab-content">
              <div className="detail-info-list">
                <div className="detail-info-row">
                  <span className="detail-row-label">Document ID</span>
                  <div className="detail-row-value">
                    <code className="detail-code-text">{document._id || document['id']}</code>
                    <button
                      className={`detail-copy-button ${copied['id'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(document._id || document['id'] || '', 'id')}
                      aria-label="ID 복사"
                    >
                      {copied['id'] ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                <div className="detail-info-row">
                  <span className="detail-row-label">파일명</span>
                  <div className="detail-row-value">
                    <span className="detail-text-value">{filename}</span>
                    <button
                      className={`detail-copy-button ${copied['filename'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(filename, 'filename')}
                      aria-label="파일명 복사"
                    >
                      {copied['filename'] ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                {saveName && (
                  <div className="detail-info-row">
                    <span className="detail-row-label">서버 파일명</span>
                    <div className="detail-row-value">
                      <code className="detail-code-text">{saveName}</code>
                      <button
                        className={`detail-copy-button ${copied['saveName'] ? 'copied' : ''}`}
                        onClick={() => handleCopy(saveName, 'saveName')}
                        aria-label="서버 파일명 복사"
                      >
                        {copied['saveName'] ? '✓' : '📋'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 원본 데이터 탭 */}
          {activeTab === 'raw' && (
            <div className="detail-tab-content">
              <div className="detail-raw-data-container">
                <pre className="fulltext-content">
                  {JSON.stringify(document, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="fulltext-modal-footer">
          <button
            className="fulltext-modal-button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, window.document.body)
}

export default DocumentDetailModal
