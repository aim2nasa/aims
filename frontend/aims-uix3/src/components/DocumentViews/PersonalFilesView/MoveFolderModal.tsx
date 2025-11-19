/**
 * MoveFolderModal Component
 *
 * 폴더 이동 모달
 * - 폴더 트리 표시
 * - 이동 불가능한 폴더는 비활성화
 * - 순환 참조 방지
 */

import React, { useState, useEffect, useMemo } from 'react'
import DraggableModal from '@/shared/ui/DraggableModal'
import { Button } from '@/shared/ui'
import type { PersonalFileItem } from '@/services/personalFilesService'
import './MoveFolderModal.css'

interface MoveFolderModalProps {
  visible: boolean
  onClose: () => void
  onMove: (targetFolderId: string | null) => Promise<void>
  currentItem: PersonalFileItem | null
  allItems: PersonalFileItem[]
}

export const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
  visible,
  onClose,
  onMove,
  currentItem,
  allItems
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState(false)


  // 디버그: visible 상태 변경 감지
  useEffect(() => {
    console.log("🟢 MoveFolderModal visible 변경:", visible, { currentItem, allItemsCount: allItems.length })
  }, [visible, currentItem, allItems])

  // 디버그: expandedFolderIds 상태 변경 감지
  useEffect(() => {
    console.log("🔵 expandedFolderIds 변경:", Array.from(expandedFolderIds))
  }, [expandedFolderIds])
  // 초기화: 모달이 열릴 때 현재 폴더의 부모를 선택
  useEffect(() => {
    if (visible && currentItem) {
      setSelectedFolderId(currentItem.parentId?.toString() || null)
      // 루트부터 현재 폴더까지의 경로를 모두 확장
      const pathIds = getPathToFolder(currentItem._id)
      setExpandedFolderIds(new Set(pathIds))
    }
  }, [visible, currentItem])

  // 특정 폴더까지의 경로 (부모 폴더 ID 목록)
  const getPathToFolder = (folderId: string): string[] => {
    const path: string[] = []
    let currentId: string | null = folderId

    while (currentId) {
      const folder = allItems.find(item => item._id === currentId && item.type === 'folder')
      if (!folder) break
      if (folder.parentId) {
        path.push(folder.parentId.toString())
      }
      currentId = folder.parentId?.toString() || null
    }

    return path
  }

  // 이동 불가능한 폴더 ID 목록 (자기 자신 + 모든 하위 폴더)
  const disabledFolderIds = useMemo(() => {
    if (!currentItem) return new Set<string>()

    const disabled = new Set<string>()
    disabled.add(currentItem._id)

    // 재귀적으로 모든 하위 폴더 추가
    const addChildren = (parentId: string) => {
      allItems
        .filter(item => item.type === 'folder' && item.parentId?.toString() === parentId)
        .forEach(child => {
          disabled.add(child._id)
          addChildren(child._id)
        })
    }

    if (currentItem.type === 'folder') {
      addChildren(currentItem._id)
    }

    return disabled
  }, [currentItem, allItems])

  const handleToggleFolder = (folderId: string) => {
    console.log('🔵 handleToggleFolder 호출:', folderId)
    setExpandedFolderIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderId)) {
        console.log('  → 축소:', folderId)
        newSet.delete(folderId)
      } else {
        console.log('  → 확장:', folderId)
        newSet.add(folderId)
      }
      return newSet
    })
  }

  const handleSelectFolder = (folderId: string | null, hasChildren: boolean = false) => {
    console.log('🟢 handleSelectFolder 호출:', folderId, 'hasChildren:', hasChildren)
    // 비활성화된 폴더는 선택 불가
    if (folderId && disabledFolderIds.has(folderId)) {
      console.log('  → 비활성화된 폴더, 선택 불가')
      return
    }
    setSelectedFolderId(folderId)

    // 하위 폴더가 있으면 자동으로 expand/collapse
    if (hasChildren && folderId) {
      console.log('  → 하위 폴더 있음, toggle 호출')
      handleToggleFolder(folderId)
    }
  }

  const handleMove = async () => {
    if (!currentItem) return

    // 현재 위치와 같으면 이동하지 않음
    const currentParentId = currentItem.parentId?.toString() || null
    if (selectedFolderId === currentParentId) {
      onClose()
      return
    }

    setMoving(true)
    try {
      await onMove(selectedFolderId)
      onClose()
    } catch (error) {
      console.error('폴더 이동 오류:', error)
    } finally {
      setMoving(false)
    }
  }

  // 폴더 트리 렌더링
  const renderFolderTree = (parentId: string | null, level: number = 0) => {
    const folders = allItems.filter(
      item =>
        item.type === 'folder' &&
        (parentId === null ? item.parentId === null : item.parentId?.toString() === parentId)
    )

    return folders.map(folder => {
      const isExpanded = expandedFolderIds.has(folder._id)
      const isSelected = selectedFolderId === folder._id
      const isDisabled = disabledFolderIds.has(folder._id)
      const hasChildren = allItems.some(
        item => item.type === 'folder' && item.parentId?.toString() === folder._id
      )

      return (
        <div key={folder._id} className="move-folder-tree-item">
          <div
            className={`move-folder-tree-row ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={() => !isDisabled && handleSelectFolder(folder._id, hasChildren)}
          >
            {hasChildren && (
              <button
                className="move-folder-expand-button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleFolder(folder._id)
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  {isExpanded ? (
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  ) : (
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  )}
                </svg>
              </button>
            )}
            {!hasChildren && <div className="move-folder-expand-spacer" />}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="move-folder-icon">
              <path
                d="M2 4C2 3.44772 2.44772 3 3 3H6L7 4H13C13.5523 4 14 4.44772 14 5V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z"
                fill="currentColor"
              />
            </svg>
            <span className="move-folder-name">{folder.name}</span>
            {isSelected && !isDisabled && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="move-folder-check-icon">
                <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {isDisabled && <span className="move-folder-disabled-badge">이동 불가</span>}
          </div>
          {isExpanded && hasChildren && (
            <div className="move-folder-tree-children">
              {renderFolderTree(folder._id, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  if (!currentItem) return null

  return (
    <DraggableModal
      visible={visible}
      onClose={onClose}
      title={`"${currentItem.name}" 이동`}
    >
      <div className="move-folder-modal-content">
        <div className="move-folder-info">
          <p>이동할 위치를 선택하세요</p>
        </div>

        <div className="move-folder-tree-container">
          {/* 루트 폴더 (내 파일) */}
          <div
            className={`move-folder-tree-row root ${selectedFolderId === null ? 'selected' : ''}`}
            onClick={() => handleSelectFolder(null)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="move-folder-icon">
              <path
                d="M2 4C2 3.44772 2.44772 3 3 3H6L7 4H13C13.5523 4 14 4.44772 14 5V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z"
                fill="currentColor"
              />
            </svg>
            <span className="move-folder-name">내 파일</span>
            {selectedFolderId === null && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="move-folder-check-icon">
                <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {/* 폴더 트리 */}
          {renderFolderTree(null, 0)}
        </div>

        <div className="move-folder-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={moving}>
            취소
          </Button>
          <Button variant="primary" onClick={handleMove} disabled={moving}>
            {moving ? '이동 중...' : '이동'}
          </Button>
        </div>
      </div>
    </DraggableModal>
  )
}

export default MoveFolderModal
