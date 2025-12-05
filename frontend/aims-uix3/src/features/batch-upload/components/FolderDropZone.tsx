/**
 * FolderDropZone Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 폴더 선택 및 드래그앤드롭 영역
 */

import { useState, useCallback, type DragEvent } from 'react'
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

  return (
    <div
      className={`folder-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="폴더를 드래그하세요"
      aria-disabled={disabled}
    >
      {/* 폴더 준비 가이드 */}
      <div className="folder-guide">
        <div className="folder-guide-header">
          <span className="folder-guide-badge">예시</span>
          <p className="folder-guide-title">이렇게 폴더를 준비하세요</p>
        </div>

        <div className="folder-guide-content">
          <div className="folder-guide-tree">
            {/* 루트 폴더 */}
            <div className="guide-node root">
              <div className="guide-node-content">
                <span className="guide-icon folder">📁</span>
                <span className="guide-name root">내 고객 문서</span>
                <span className="guide-desc">← 상위 폴더를 드래그하거나</span>
              </div>

              {/* 홍길동 고객 폴더 */}
              <div className="guide-node has-children">
                <div className="guide-node-content">
                  <span className="guide-icon folder">📁</span>
                  <span className="guide-name customer">홍길동</span>
                  <span className="guide-desc alt">← 고객 폴더를 직접 선택</span>
                  <span className="guide-match">
                    <span className="guide-arrow">→</span>
                    <span className="guide-customer-badge">👤 홍길동 고객</span>
                  </span>
                </div>

                {/* 홍길동 하위 파일/폴더 */}
                <div className="guide-node">
                  <div className="guide-node-content">
                    <span className="guide-icon file">📄</span>
                    <span className="guide-name file">보험증권.pdf</span>
                  </div>
                </div>

                <div className="guide-node has-children">
                  <div className="guide-node-content">
                    <span className="guide-icon folder sub">📁</span>
                    <span className="guide-name subfolder">청구서류</span>
                    <span className="guide-note">하위 폴더도 OK</span>
                  </div>

                  {/* 청구서류 하위 */}
                  <div className="guide-node">
                    <div className="guide-node-content">
                      <span className="guide-icon file">📄</span>
                      <span className="guide-name file">진단서.pdf</span>
                    </div>
                  </div>
                  <div className="guide-node last">
                    <div className="guide-node-content">
                      <span className="guide-icon file">📄</span>
                      <span className="guide-name file">영수증.jpg</span>
                    </div>
                  </div>
                </div>

                <div className="guide-node last">
                  <div className="guide-node-content">
                    <span className="guide-icon file">📄</span>
                    <span className="guide-name file">약관.pdf</span>
                  </div>
                </div>
              </div>

              {/* 김영희 고객 폴더 */}
              <div className="guide-node last has-children">
                <div className="guide-node-content">
                  <span className="guide-icon folder">📁</span>
                  <span className="guide-name customer">김영희</span>
                  <span className="guide-match">
                    <span className="guide-arrow">→</span>
                    <span className="guide-customer-badge">👤 김영희 고객</span>
                  </span>
                </div>

                <div className="guide-node last">
                  <div className="guide-node-content">
                    <span className="guide-icon file">📄</span>
                    <span className="guide-name file">계약서.pdf</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="folder-guide-tips">
          <div className="guide-tip">
            <SFSymbol name="checkmark-circle-fill" size={SFSymbolSize.CAPTION1} weight={SFSymbolWeight.MEDIUM} />
            <span>상위 폴더 또는 고객 폴더 직접 선택 가능</span>
          </div>
          <div className="guide-tip">
            <SFSymbol name="checkmark-circle-fill" size={SFSymbolSize.CAPTION1} weight={SFSymbolWeight.MEDIUM} />
            <span>폴더명 = 고객명이면 자동 매칭</span>
          </div>
          <div className="guide-tip">
            <SFSymbol name="checkmark-circle-fill" size={SFSymbolSize.CAPTION1} weight={SFSymbolWeight.MEDIUM} />
            <span>하위 폴더의 파일도 모두 등록</span>
          </div>
        </div>
      </div>

      {/* 드래그 영역 */}
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
            {isDragOver ? '여기에 놓으세요' : '상위 폴더 또는 고객명 폴더를 드래그하세요'}
          </p>
          <p className="folder-drop-zone-description">
            폴더명이 고객명과 일치하면 자동으로 연결됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
