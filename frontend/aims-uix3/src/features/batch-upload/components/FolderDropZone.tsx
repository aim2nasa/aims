/**
 * FolderDropZone Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 폴더 선택 및 드래그앤드롭 영역
 */

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import './FolderDropZone.css'

interface FolderDropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export default function FolderDropZone({
  onFilesSelected,
  disabled = false
}: FolderDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled) return

    const items = e.dataTransfer.items
    const allFiles: File[] = []

    // 폴더 엔트리를 재귀적으로 읽는 함수
    const readEntry = async (entry: FileSystemEntry, path: string): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        return new Promise((resolve) => {
          fileEntry.file((file) => {
            // webkitRelativePath를 수동으로 설정한 새 File 객체 생성
            const fileWithPath = new File([file], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            })
            // webkitRelativePath는 readonly라서 Object.defineProperty 사용
            Object.defineProperty(fileWithPath, 'webkitRelativePath', {
              value: path + file.name,
              writable: false,
            })
            allFiles.push(fileWithPath)
            resolve()
          })
        })
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry
        const dirReader = dirEntry.createReader()

        return new Promise((resolve) => {
          const readEntries = () => {
            dirReader.readEntries(async (entries) => {
              if (entries.length === 0) {
                resolve()
                return
              }

              for (const childEntry of entries) {
                await readEntry(childEntry, path + entry.name + '/')
              }

              // 더 읽을 엔트리가 있을 수 있음 (100개 제한)
              readEntries()
            })
          }
          readEntries()
        })
      }
    }

    // DataTransferItemList에서 엔트리 추출
    if (items) {
      const entries: FileSystemEntry[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.()
          if (entry) {
            entries.push(entry)
          }
        }
      }

      // 모든 엔트리 처리
      for (const entry of entries) {
        await readEntry(entry, '')
      }
    }

    if (allFiles.length > 0) {
      onFilesSelected(allFiles)
    }
  }, [disabled, onFilesSelected])

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const files: File[] = []
    for (let i = 0; i < fileList.length; i++) {
      files.push(fileList[i])
    }

    onFilesSelected(files)

    // input 초기화 (같은 폴더 재선택 가능하도록)
    e.target.value = ''
  }, [onFilesSelected])

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <div
      className={`folder-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="폴더를 선택하거나 드래그하세요"
      aria-disabled={disabled}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="folder-input"
        onChange={handleFileInputChange}
        // @ts-expect-error - webkitdirectory is not in standard types
        webkitdirectory=""
        directory=""
        multiple
        disabled={disabled}
      />

      <div className="folder-drop-zone-content">
        <div className="folder-drop-zone-icon">
          <SFSymbol
            name="folder-fill-badge-plus"
            size={SFSymbolSize.TITLE1}
            weight={SFSymbolWeight.MEDIUM}
          />
        </div>

        <div className="folder-drop-zone-text">
          <p className="folder-drop-zone-title">
            {isDragOver ? '여기에 놓으세요' : '폴더를 선택하거나 드래그하세요'}
          </p>
          <p className="folder-drop-zone-description">
            폴더명이 고객명과 일치하면 자동으로 연결됩니다
          </p>
        </div>

        <div className="folder-drop-zone-hint">
          <span className="folder-drop-zone-hint-icon">
            <SFSymbol
              name="info-circle"
              size={SFSymbolSize.FOOTNOTE}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
          <span>예: 홍길동/ 폴더 → 홍길동 고객에게 문서 등록</span>
        </div>
      </div>
    </div>
  )
}
