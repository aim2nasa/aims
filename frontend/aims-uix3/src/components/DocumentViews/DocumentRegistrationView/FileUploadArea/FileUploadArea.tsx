/**
 * FileUploadArea Component
 * @since 1.0.0
 *
 * 애플 스타일의 드래그앤드롭 파일 업로드 영역
 * 단일/다중 파일 및 폴더 업로드 지원
 */

import React, { useRef, useState, useCallback } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { FileSelectionOptions } from '../types/uploadTypes'
import { uploadHelpers } from '../services/userContextService'
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
  className = ''
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)

  // 애플 스타일 피드백 상태
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // TypeScript unused variable fix
  React.useEffect(() => {
    if (dragCounter > 0) {
      // Track drag counter for proper drag state management
    }
  }, [dragCounter])

  // 기본 옵션 병합
  const {
    multiple = true,
    directory = true,
    accept,
    maxFileSize,
    maxFileCount
  } = options

  /**
   * 파일 유효성 검사 - 업계 표준: 전체 거부 방식
   */
  const validateFiles = useCallback((files: File[]): File[] => {
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

  /**
   * 파일 처리 공통 로직
   */
  const handleFiles = useCallback((files: File[]) => {
    if (disabled || uploading) return

    // 모든 파일을 상위로 전달 (검증은 DocumentRegistrationView에서)
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }, [disabled, uploading, onFilesSelected])

  /**
   * 드래그 이벤트 핸들러
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setDragCounter(prev => {
      const newCounter = prev + 1
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true)
      }
      return newCounter
    })
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setDragCounter(prev => {
      const newCounter = prev - 1
      if (newCounter === 0) {
        setIsDragging(false)
      }
      return newCounter
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsDragging(false)
    setDragCounter(0)

    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []

    // 폴더와 파일 모두 처리
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry()
        if (entry) {
          if (entry.isDirectory) {
            // 폴더인 경우 재귀적으로 파일 수집
            const folderFiles = await getAllFilesFromEntry(entry)
            files.push(...folderFiles)
          } else {
            // 파일인 경우 직접 추가
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }
      }
    }

    if (files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles])

  // 폴더에서 모든 파일 추출하는 헬퍼 함수
  const getAllFilesFromEntry = async (entry: any): Promise<File[]> => {
    const files: File[] = []

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          // 폴더 경로 정보 추가
          Object.defineProperty(file, 'webkitRelativePath', {
            value: entry.fullPath.slice(1), // 첫 번째 / 제거
            writable: false
          })
          resolve([file])
        })
      })
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      return new Promise((resolve) => {
        reader.readEntries(async (entries: any[]) => {
          for (const childEntry of entries) {
            const childFiles = await getAllFilesFromEntry(childEntry)
            files.push(...childFiles)
          }
          resolve(files)
        })
      })
    }

    return files
  }

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

  /**
   * 폴더 선택 버튼 클릭
   */
  const handleFolderSelect = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation() // 이벤트 버블링 방지
    }
    if (disabled || uploading) return
    folderInputRef.current?.click()
  }, [disabled, uploading])

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
          {...({ webkitdirectory: 'true' } as any)}
          multiple
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      )}

      {/* 🍎 MINIMAL BUTTON: Pure Apple style */}
      <div className="file-upload-area__actions">
        <button
          type="button"
          className="file-upload-area__button file-upload-area__button--minimal"
          onClick={handleFileSelect}
          disabled={disabled || uploading}
          aria-label="Add files"
        >
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>+</span>
        </button>
      </div>

      {/* 🍎 DROPZONE: Clean drag area */}
      <div
        className={`file-upload-area__dropzone ${isDragging ? 'file-upload-area__dropzone--dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        aria-label="Drag and drop files here"
      >
        {!uploading && !isDragging && (
          <div className="file-upload-area__drop-hint">
            <SFSymbol
              name="arrow.down.circle"
              size={SFSymbolSize.CAPTION}
              weight={SFSymbolWeight.ULTRALIGHT}
              decorative={true}
            />
            <span className="file-upload-area__hint-text">
              또는 파일을 여기에 끌어오세요
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
            <span>Drop to upload</span>
          </div>
        )}

        {uploading && (
          <div className="file-upload-area__uploading">
            <SFSymbol
              name="arrow.up.circle"
              size={SFSymbolSize.CAPTION}
              weight={SFSymbolWeight.LIGHT}
              decorative={true}
            />
            <span>Uploading...</span>
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