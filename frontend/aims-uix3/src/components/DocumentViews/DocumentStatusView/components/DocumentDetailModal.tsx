/**
 * DocumentDetailModal Component
 * @since 1.0.0
 * @version 3.0.0 - 🍎 단일 통합 레이아웃 (애플 스타일)
 *
 * 문서 상세 정보를 단일 뷰로 표시하는 모달 컴포넌트
 * - React Portal 사용
 * - 드래그로 이동 가능
 * - ESC 키로 닫기
 * - iOS Settings 스타일 디자인
 * - 원본 데이터 섹션만 독립 스크롤
 */

import React, { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { Tooltip } from '../../../../shared/ui'
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
 * 문서의 상세 정보를 단일 레이아웃으로 표시
 * - 처리 진행 상태 (컴팩트)
 * - 문서 정보 2열 그리드
 * - 원본 데이터 (독립 스크롤)
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
          <Tooltip content="모달 닫기">
            <button
              className="fulltext-modal-close"
              onClick={onClose}
              aria-label="모달 닫기"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ✕
            </button>
          </Tooltip>
        </div>

        {/* 모달 바디 - 통합 레이아웃 */}
        <div className="fulltext-modal-body detail-unified-layout">

          {/* 섹션 1: 컴팩트 처리 진행 상태 */}
          <section className="detail-section detail-section--status">
            <h3 className="detail-section-title">처리 진행 상태</h3>

            {/* 진행률 바 */}
            <div className="detail-progress-bar-wrapper">
              <div
                className={`detail-progress-bar-fill status-${status}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* 인라인 상태 정보 */}
            <div className="detail-status-inline">
              <span className={`detail-status-badge status-${status}`}>
                {status === 'processing' && <span className="detail-status-icon">⟳</span>}
                {status === 'completed' && <span className="detail-status-icon">✓</span>}
                {status === 'error' && <span className="detail-status-icon">✕</span>}
                {status === 'pending' && <span className="detail-status-icon">⋯</span>}
                {status}
              </span>
              <span className="detail-progress-text">{progress}%</span>
            </div>
          </section>

          {/* 섹션 2: 문서 정보 2열 그리드 */}
          <section className="detail-section detail-section--info">
            <h3 className="detail-section-title">문서 정보</h3>

            <div className="detail-info-grid">
              {/* Document ID 카드 */}
              <div className="detail-info-card">
                <div className="detail-info-card-header">
                  <span className="detail-info-card-label">Document ID</span>
                  <Tooltip content="ID 복사">
                    <button
                      className={`detail-copy-button ${copied['id'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(document._id || document['id'] || '', 'id')}
                      aria-label="ID 복사"
                    >
                      {copied['id'] ? '✓' : '📋'}
                    </button>
                  </Tooltip>
                </div>
                <code className="detail-info-card-value">{document._id || document['id']}</code>
              </div>

              {/* 파일명 카드 */}
              <div className="detail-info-card">
                <div className="detail-info-card-header">
                  <span className="detail-info-card-label">파일명</span>
                  <Tooltip content="파일명 복사">
                    <button
                      className={`detail-copy-button ${copied['filename'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(filename, 'filename')}
                      aria-label="파일명 복사"
                    >
                      {copied['filename'] ? '✓' : '📋'}
                    </button>
                  </Tooltip>
                </div>
                <span className="detail-info-card-value">{filename}</span>
              </div>

              {/* 서버 파일명 카드 (있는 경우만) */}
              {saveName && (
                <div className="detail-info-card detail-info-card--full">
                  <div className="detail-info-card-header">
                    <span className="detail-info-card-label">서버 파일명</span>
                    <Tooltip content="서버 파일명 복사">
                      <button
                        className={`detail-copy-button ${copied['saveName'] ? 'copied' : ''}`}
                        onClick={() => handleCopy(saveName, 'saveName')}
                        aria-label="서버 파일명 복사"
                      >
                        {copied['saveName'] ? '✓' : '📋'}
                      </button>
                    </Tooltip>
                  </div>
                  <code className="detail-info-card-value detail-info-card-value--wrap">
                    {saveName}
                  </code>
                </div>
              )}
            </div>
          </section>

          {/* 섹션 3: 원본 데이터 (독립 스크롤) */}
          <section className="detail-section detail-section--raw">
            <div className="detail-raw-header">
              <h3 className="detail-section-title">원본 데이터</h3>
              <Tooltip content="원본 데이터 복사" placement="left">
                <button
                  className={`detail-copy-button ${copied['raw'] ? 'copied' : ''}`}
                  onClick={() => handleCopy(JSON.stringify(document, null, 2), 'raw')}
                  aria-label="원본 데이터 복사"
                >
                  {copied['raw'] ? '✓' : '📋'}
                </button>
              </Tooltip>
            </div>

            {/* 독립 스크롤 영역 */}
            <div className="detail-raw-scroll-container">
              <pre className="detail-code-block">
                <code className="detail-code-text detail-code-text--raw">
                  {JSON.stringify(document, null, 2)}
                </code>
              </pre>
            </div>
          </section>

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
