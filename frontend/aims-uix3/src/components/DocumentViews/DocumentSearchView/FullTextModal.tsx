/**
 * FullTextModal Component
 * @since 1.0.0
 *
 * 🍎 iOS 스타일 Full Text 모달
 * 문서의 전체 텍스트(meta.full_text 또는 ocr.full_text)를 표시
 * 드래그로 이동 가능
 * React Portal을 사용하여 전체 화면 레벨에서 렌더링
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './FullTextModal.css'

interface FullTextModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 문서 이름 */
  documentName: string
  /** 전체 텍스트 */
  fullText: string
}

/**
 * FullTextModal React 컴포넌트
 *
 * iOS 스타일의 모달로 문서 전체 텍스트를 표시합니다.
 * Progressive Disclosure 원칙에 따라 필요할 때만 표시됩니다.
 *
 * @example
 * ```tsx
 * <FullTextModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   documentName="문서.pdf"
 *   fullText="전체 텍스트 내용..."
 * />
 * ```
 */
export const FullTextModal: React.FC<FullTextModalProps> = ({
  visible,
  onClose,
  documentName,
  fullText
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

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
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    dragOriginRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }, [position.x, position.y])

  /**
   * 드래그 중 핸들러
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragOriginRef.current.x
    const newY = e.clientY - dragOriginRef.current.y

    setPosition({ x: newX, y: newY })
  }, [isDragging])

  /**
   * 드래그 종료 핸들러
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  /**
   * 드래그 이벤트 리스너 등록
   */
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [isDragging, handleMouseMove, handleMouseUp])

  /**
   * ESC 키 핸들러
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose()
      }
    }

    if (visible) {
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('keydown', handleEscape)
      }
    }
    return undefined
  }, [visible, onClose])

  /**
   * 모달이 열릴 때 위치 초기화
   */
  useEffect(() => {
    if (visible) {
      setPosition({ x: 0, y: 0 })
      dragOriginRef.current = { x: 0, y: 0 }
    }
  }, [visible])

  if (!visible) return null

  const modalContent = (
    <div
      className="fulltext-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fulltext-modal-title"
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
          <h2 id="fulltext-modal-title" className="fulltext-modal-title">
            {documentName}
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

        {/* 모달 바디 */}
        <div className="fulltext-modal-body">
          <pre className="fulltext-content">{fullText || '텍스트가 없습니다.'}</pre>
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

  return createPortal(modalContent, document.body)
}

export default FullTextModal
