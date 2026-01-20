/**
 * FileUploadArea Component
 * @since 1.0.0
 *
 * 애플 스타일의 드래그앤드롭 파일 업로드 영역
 * 단일/다중 파일 및 폴더 업로드 지원
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { FileSelectionOptions } from '../types/uploadTypes'
// import { uploadHelpers } from '../services/userContextService' // 주석 처리된 함수용
import { FeedbackToast } from '../FeedbackToast/FeedbackToast'
import './FileUploadArea.css'

interface FileUploadAreaProps {
  /** 파일 선택 시 콜백 */
  onFilesSelected: (files: File[]) => void
  /** 파일 선택 옵션 */
  options?: Partial<FileSelectionOptions>
  /** 업로드 중 여부 */
  uploading?: boolean
  /** 비활성화 여부 */
  disabled?: boolean
  /** 비활성화 시 표시할 메시지 */
  disabledMessage?: string
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * FileUploadArea React 컴포넌트
 *
 * 애플 스타일의 Ultra-Subtle 드롭존 구현
 * - 파일 드래그앤드롭
 * - 클릭으로 파일 선택
 * - 폴더 선택 지원
 * - 파일 형식 및 크기 검증
 */
export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  onFilesSelected,
  options = {},
  uploading = false,
  disabled = false,
  disabledMessage = '고객을 먼저 선택하세요',
  className = ''
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)

  // 애플 스타일 피드백 상태
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // 기본 옵션 병합
  const {
    multiple = true,
    directory = true,
    accept
  } = options

  /*
   * 파일 유효성 검사 - 업계 표준: 전체 거부 방식
   * 미래 사용 예정으로 주석 처리
   */
  /*
  const _validateFiles = useCallback((files: File[]): File[] => {
    // 1단계: 파일 개수 사전 검증 (전체 거부) - 애플 스타일 피드백
    if (maxFileCount && files.length > maxFileCount) {
      const message = `파일이 너무 많습니다 (${files.length}개). 최대 ${maxFileCount}개까지 가능합니다.`
      setToastMessage(message)
      setToastVisible(true)
      return []
    }

    const validFiles: File[] = []
    const rejectedFiles: string[] = []

    for (const file of files) {
      // 파일 크기 검사
      if (maxFileSize && file.size > maxFileSize) {
        rejectedFiles.push(`${file.name} (파일 크기 초과: ${uploadHelpers.formatFileSize(file.size)})`)
        continue
      }

      // MIME 타입 검사 (항상 통과 - 모든 파일 형식 허용)
      if (!uploadHelpers.isAllowedMimeType(file.type)) {
        rejectedFiles.push(`${file.name} (지원하지 않는 파일 형식: ${file.type})`)
        continue
      }

      validFiles.push(file)
    }

    // 모든 파일을 상위로 전달 (개별 검증은 상위에서 처리)
    return files
  }, [maxFileSize, maxFileCount])
  */

  /**
   * 파일 처리 공통 로직
   */
  const handleFiles = useCallback((files: File[]) => {
    if (disabled) {
      setToastMessage('업로드가 비활성화되었습니다.')
      setToastVisible(true)
      return
    }

    if (uploading) {
      setToastMessage('업로드가 진행 중입니다. 잠시 후 다시 시도해주세요.')
      setToastVisible(true)
      return
    }

    if (files.length === 0) {
      setToastMessage('선택된 파일이 없습니다.')
      setToastVisible(true)
      return
    }

    onFilesSelected(files)
  }, [disabled, onFilesSelected, setToastMessage, setToastVisible, uploading])

  /**
   * 드래그 이벤트 핸들러
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const newCounter = dragCounterRef.current + 1
    dragCounterRef.current = newCounter
    if (newCounter > 0 && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const newCounter = dragCounterRef.current - 1
    dragCounterRef.current = newCounter
    if (newCounter <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsDragging(false)
    dragCounterRef.current = 0

    // 🔧 FIX: dataTransfer.items가 신뢰할 수 없으므로 dataTransfer.files 직접 사용
    const droppedFiles = Array.from(e.dataTransfer.files)

    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles)
    }
  }, [handleFiles])

  /**
   * 파일/폴더 선택 버튼 클릭 (통합)
   */
  const handleFileSelect = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation() // 이벤트 버블링 방지
    }
    if (disabled || uploading) return

    // Shift 키를 누르고 있으면 폴더 선택, 아니면 파일 선택
    if (e?.shiftKey && directory) {
      folderInputRef.current?.click()
    } else {
      fileInputRef.current?.click()
    }
  }, [disabled, uploading, directory])

  /*
   * 폴더 선택 버튼 클릭
   * 미래 사용 예정으로 주석 처리
   */
  /*
  const _handleFolderSelect = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation() // 이벤트 버블링 방지
    }
    if (disabled || uploading) return
    folderInputRef.current?.click()
  }, [disabled, uploading])
  */

  /**
   * 파일 input 변경 핸들러
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)

    // input 초기화 (같은 파일 재선택 가능)
    e.target.value = ''
  }, [handleFiles])

  // 애플 스타일 피드백 닫기 핸들러
  const handleToastClose = useCallback(() => {
    setToastVisible(false)
  }, [])

  useEffect(() => {
    const folderInput = folderInputRef.current
    if (!folderInput) {
      return
    }

    if (directory) {
      folderInput.setAttribute('webkitdirectory', 'true')
    } else {
      folderInput.removeAttribute('webkitdirectory')
    }
  }, [directory])

  // CSS 클래스 계산
  const containerClasses = [
    'file-upload-area',
    isDragging && 'file-upload-area--dragging',
    uploading && 'file-upload-area--uploading',
    disabled && 'file-upload-area--disabled',
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={containerClasses}>
      {/* 숨겨진 파일 input들 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {directory && (
        <input
          ref={folderInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      )}

      {/* 🍎 UNIFIED UPLOAD ZONE: Click or Drop */}
      <div
        className={`file-upload-area__unified-zone ${isDragging ? 'file-upload-area__unified-zone--dragging' : ''}`}
        onClick={handleFileSelect}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="button"
        tabIndex={disabled || uploading ? -1 : 0}
        aria-label="파일 업로드: 클릭하거나 파일을 드래그하세요"
        aria-disabled={disabled || uploading}
      >
        {!uploading && !isDragging && !disabled && (
          <div className="file-upload-area__unified-content">
            <div className="file-upload-area__plus-icon">
              <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
                <path d="M24 10V38M10 24H38" stroke="white" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span className="file-upload-area__hint-text">
                지금 바로 파일을 끌어다 놓으세요!
              </span>
              <span style={{ fontSize: '14px', opacity: 0.6, color: 'var(--color-text-secondary)' }}>
                또는 클릭하여 파일 선택
              </span>
            </div>
          </div>
        )}

        {/* 비활성화 상태: 고객 선택 안내 */}
        {disabled && !uploading && (
          <div className="file-upload-area__disabled-content">
            <SFSymbol
              name="person"
              size={SFSymbolSize.TITLE_3}
              weight={SFSymbolWeight.LIGHT}
              className="file-upload-area__disabled-icon"
            />
            <span className="file-upload-area__disabled-text">
              {disabledMessage}
            </span>
          </div>
        )}

        {isDragging && (
          <div className="file-upload-area__drop-active">
            <SFSymbol
              name="plus.circle.fill"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.LIGHT}
              decorative={true}
            />
            <span>여기에 놓으세요</span>
          </div>
        )}

        {uploading && (
          <div className="file-upload-area__uploading">
            <SFSymbol
              name="arrow.up.circle"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.LIGHT}
              decorative={true}
            />
            <span>업로드 중...</span>
          </div>
        )}
      </div>

      {/* 🍎 애플 스타일 피드백 토스트 */}
      <FeedbackToast
        message={toastMessage}
        type="error"
        visible={toastVisible}
        onClose={handleToastClose}
      />
    </div>
  )
}

export default FileUploadArea
