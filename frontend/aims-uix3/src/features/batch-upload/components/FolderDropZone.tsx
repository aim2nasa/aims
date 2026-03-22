/**
 * FolderDropZone Component
 * @since 2025-12-05
 * @version 2.0.0
 *
 * 폴더 선택 및 드래그앤드롭 영역
 * v2: AR/CR 등록 패턴과 동일한 깔끔한 레이아웃으로 개편
 */

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
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
  const [isGuideExpanded, setIsGuideExpanded] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)

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

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const allFiles = Array.from(files)
    onFilesSelected(allFiles)

    // input 초기화 (같은 폴더 재선택 가능)
    e.target.value = ''
  }, [onFilesSelected])

  return (
    <div
      className={`folder-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label={disabled ? "폴더 드롭존 (비활성)" : "폴더를 드래그하세요"}
    >
      {/* 접히는 가이드 — AR/CR 등록 방법과 동일한 패턴 */}
      <div className={`folder-guide ${isGuideExpanded ? 'folder-guide--expanded' : 'folder-guide--collapsed'}`}>
        <button
          type="button"
          className="folder-guide__toggle"
          onClick={() => setIsGuideExpanded(!isGuideExpanded)}
          aria-label={isGuideExpanded ? '사용법 접기' : '사용법 펼치기'}
        >
          <div className="folder-guide__header">
            <svg className="folder-guide__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path className="lightbulb-bulb" d="M12 3C8.68629 3 6 5.68629 6 9C6 11.4363 7.4152 13.5392 9.42857 14.3572V17C9.42857 17.5523 9.87629 18 10.4286 18H13.5714C14.1237 18 14.5714 17.5523 14.5714 17V14.3572C16.5848 13.5392 18 11.4363 18 9C18 5.68629 15.3137 3 12 3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path className="lightbulb-base" d="M9 18H15M10 21H14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 className="folder-guide__title">폴더 준비 방법</h3>
            <span className="folder-guide__toggle-icon" aria-hidden="true">
              {isGuideExpanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        {isGuideExpanded && (
          <div className="folder-guide__content">
            <p className="folder-guide__desc">
              내 PC에 고객 이름으로 된 폴더가 있으면 그대로 사용할 수 있어요.
            </p>

            {/* 간결한 2단계 가이드 — 일반 문서 등록 패턴 */}
            <div className="folder-guide__steps">
              <div className="folder-guide__step">
                <span className="folder-guide__step-number">1</span>
                <div className="folder-guide__step-text">
                  <strong>고객별로 문서 정리</strong>
                  <span>고객 이름 폴더 안에 문서를 넣어두세요</span>
                </div>
              </div>
              <div className="folder-guide__step">
                <span className="folder-guide__step-number">2</span>
                <div className="folder-guide__step-text">
                  <strong>여기로 끌어오기</strong>
                  <span>이름이 같은 고객에게 알아서 연결돼요</span>
                </div>
              </div>
            </div>

            {/* 미니 예시 — 한눈에 볼 수 있는 간결한 구조 */}
            <div className="folder-guide__example">
              <span className="folder-guide__example-label">예시</span>
              <div className="folder-guide__example-tree">
                <div className="folder-guide__example-row">
                  <span>📁</span>
                  <span className="folder-guide__example-name">홍길동</span>
                  <span className="folder-guide__example-arrow">→</span>
                  <span className="folder-guide__example-match">홍길동 고객에 자동 연결</span>
                </div>
                <div className="folder-guide__example-row folder-guide__example-row--child">
                  <span>📄</span>
                  <span className="folder-guide__example-file">보험증권.pdf</span>
                </div>
                <div className="folder-guide__example-row folder-guide__example-row--child">
                  <span>📄</span>
                  <span className="folder-guide__example-file">약관.pdf</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 드롭존 — 화면의 주인공 */}
      <label className={`folder-drop-zone-content ${disabled ? 'disabled' : ''}`}>
        <input
          ref={folderInputRef}
          type="file"
          className="folder-input-hidden"
          onChange={handleInputChange}
          disabled={disabled}
          aria-label="폴더 선택"
          /* @ts-expect-error webkitdirectory is non-standard but widely supported */
          webkitdirectory=""
          multiple
        />
        {/* + 버튼 — AR/CR 드롭존과 동일한 세로 배치 */}
        <div className="folder-select-plus-icon">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <path d="M24 10V38M10 24H38" stroke="white" strokeWidth="4" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="folder-drop-zone-title">
          {isDragOver ? '여기에 놓으세요' : '지금 바로 폴더를 끌어다 놓으세요!'}
        </span>
        <span className="folder-drop-zone-description">
          또는 클릭하여 폴더 선택
        </span>
        <span className="folder-drop-zone-hint">
          내 PC에서 고객 이름으로 만든 폴더를 선택하세요
        </span>
      </label>
    </div>
  )
}
