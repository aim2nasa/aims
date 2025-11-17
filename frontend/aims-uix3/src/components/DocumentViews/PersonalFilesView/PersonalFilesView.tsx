/**
 * PersonalFilesView Component
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 View
 * 좌측: 폴더 트리 네비게이션
 * 우측: 파일/폴더 목록
 *
 * 3단계: 파일 업로드/다운로드 기능 추가
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Tooltip, Modal, Button } from '@/shared/ui'
import personalFilesService, { type PersonalFileItem } from '@/services/personalFilesService'
import './PersonalFilesView.css'

interface PersonalFilesViewProps {
  visible: boolean
  onClose: () => void
}

// 파일 크기 포맷팅
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// 날짜 포맷팅
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

// 파일 타입 아이콘 가져오기
const getFileIcon = (item: PersonalFileItem): string => {
  if (item.type === 'folder') return 'folder'

  if (item.mimeType?.includes('pdf')) return 'doc.text'
  if (item.mimeType?.includes('word')) return 'doc.text'
  if (item.mimeType?.includes('sheet') || item.mimeType?.includes('excel')) return 'tablecells'
  if (item.mimeType?.includes('image')) return 'photo'

  return 'doc'
}

export const PersonalFilesView: React.FC<PersonalFilesViewProps> = ({
  visible,
  onClose,
}) => {
  const [items, setItems] = useState<PersonalFileItem[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ _id: string | null; name: string }[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 폴더 생성 모달 상태
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // 컨텍스트 메뉴 상태
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [selectedItem, setSelectedItem] = useState<PersonalFileItem | null>(null)

  // 이름 변경 모달 상태
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renamingItem, setRenamingItem] = useState(false)

  // 드래그 앤 드롭 상태
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // 폴더 내용 로드
  const loadFolderContents = useCallback(async (folderId: string | null) => {
    setLoading(true)
    setError(null)

    try {
      const data = await personalFilesService.getFolderContents(folderId)
      setItems(data.items)
      setBreadcrumbs(data.breadcrumbs)
    } catch (err) {
      console.error('폴더 로드 오류:', err)
      setError(err instanceof Error ? err.message : '폴더를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  // 초기 로드
  useEffect(() => {
    if (visible) {
      loadFolderContents(null)
    }
  }, [visible, loadFolderContents])

  // 폴더 확장/축소
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolderIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderId)) {
        newSet.delete(folderId)
      } else {
        newSet.add(folderId)
      }
      return newSet
    })
  }, [])

  // 폴더 클릭 - 우측 목록 업데이트
  const handleFolderClick = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    loadFolderContents(folderId)
  }, [loadFolderContents])

  // 파일 업로드 버튼 클릭
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // 파일 선택 후 업로드
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      await personalFilesService.uploadFile(file, currentFolderId, (progress) => {
        setUploadProgress(progress)
      })

      // 업로드 완료 후 목록 새로고침
      await loadFolderContents(currentFolderId)

      // 파일 input 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('파일 업로드 오류:', err)
      setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [currentFolderId, loadFolderContents])

  // 파일 다운로드
  const handleFileDownload = useCallback(async (fileId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      await personalFilesService.downloadFile(fileId, fileName)
    } catch (err) {
      console.error('파일 다운로드 오류:', err)
      setError(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다')
    }
  }, [])

  // 새 폴더 모달 열기
  const handleNewFolderClick = useCallback(() => {
    setShowNewFolderModal(true)
    setNewFolderName('')
  }, [])

  // 새 폴더 모달 닫기
  const handleCloseFolderModal = useCallback(() => {
    setShowNewFolderModal(false)
    setNewFolderName('')
  }, [])

  // 폴더 생성
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setError('폴더 이름을 입력해주세요')
      return
    }

    setCreatingFolder(true)
    setError(null)

    try {
      await personalFilesService.createFolder(newFolderName.trim(), currentFolderId)
      await loadFolderContents(currentFolderId)
      handleCloseFolderModal()
    } catch (err) {
      console.error('폴더 생성 오류:', err)
      setError(err instanceof Error ? err.message : '폴더 생성에 실패했습니다')
    } finally {
      setCreatingFolder(false)
    }
  }, [newFolderName, currentFolderId, loadFolderContents, handleCloseFolderModal])

  // 우클릭 컨텍스트 메뉴
  const handleContextMenu = useCallback((e: React.MouseEvent, item: PersonalFileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedItem(item)
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }, [])

  // 컨텍스트 메뉴 닫기
  const handleCloseContextMenu = useCallback(() => {
    setShowContextMenu(false)
    setSelectedItem(null)
  }, [])

  // 이름 변경 모달 열기
  const handleRenameClick = useCallback(() => {
    if (!selectedItem) return
    setRenameValue(selectedItem.name)
    setShowRenameModal(true)
    handleCloseContextMenu()
  }, [selectedItem, handleCloseContextMenu])

  // 이름 변경 모달 닫기
  const handleCloseRenameModal = useCallback(() => {
    setShowRenameModal(false)
    setRenameValue('')
  }, [])

  // 이름 변경 실행
  const handleRenameItem = useCallback(async () => {
    if (!selectedItem || !renameValue.trim()) {
      setError('이름을 입력해주세요')
      return
    }

    setRenamingItem(true)
    setError(null)

    try {
      await personalFilesService.renameItem(selectedItem._id, renameValue.trim())
      await loadFolderContents(currentFolderId)
      handleCloseRenameModal()
    } catch (err) {
      console.error('이름 변경 오류:', err)
      setError(err instanceof Error ? err.message : '이름 변경에 실패했습니다')
    } finally {
      setRenamingItem(false)
    }
  }, [selectedItem, renameValue, currentFolderId, loadFolderContents, handleCloseRenameModal])

  // 삭제
  const handleDeleteClick = useCallback(async () => {
    if (!selectedItem) return

    if (!confirm(`"${selectedItem.name}"${selectedItem.type === 'folder' ? ' 폴더와 모든 하위 항목을' : '을(를)'} 삭제하시겠습니까?`)) {
      handleCloseContextMenu()
      return
    }

    try {
      await personalFilesService.deleteItem(selectedItem._id)
      await loadFolderContents(currentFolderId)
      handleCloseContextMenu()
    } catch (err) {
      console.error('삭제 오류:', err)
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다')
    }
  }, [selectedItem, currentFolderId, loadFolderContents, handleCloseContextMenu])

  // 컨텍스트 메뉴에서 새 폴더 생성
  const handleNewFolderFromContext = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'folder') return
    setCurrentFolderId(selectedItem._id)
    loadFolderContents(selectedItem._id)
    handleCloseContextMenu()
    setTimeout(() => setShowNewFolderModal(true), 100)
  }, [selectedItem, loadFolderContents, handleCloseContextMenu])

  // 컨텍스트 메뉴 외부 클릭 감지
  useEffect(() => {
    if (!showContextMenu) return

    const handleClickOutside = () => {
      setShowContextMenu(false)
      setSelectedItem(null)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showContextMenu])

  // 드래그 시작
  const handleDragStart = useCallback((e: React.DragEvent, item: PersonalFileItem) => {
    e.stopPropagation()
    setDraggingItemId(item._id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item._id)
  }, [])

  // 드래그 오버 (드롭 허용)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // 폴더에 드래그 진입
  const handleDragEnter = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(folderId)
  }, [])

  // 폴더에서 드래그 벗어남
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // relatedTarget이 자식 요소가 아닐 때만 제거 (이벤트 버블링 방지)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverFolderId(null)
    }
  }, [])

  // 드롭
  const handleDrop = useCallback(async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()

    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId || itemId === targetFolderId) {
      setDraggingItemId(null)
      setDragOverFolderId(null)
      return
    }

    try {
      await personalFilesService.moveItem(itemId, targetFolderId)
      await loadFolderContents(currentFolderId)
    } catch (err) {
      console.error('항목 이동 오류:', err)
      setError(err instanceof Error ? err.message : '항목 이동에 실패했습니다')
    } finally {
      setDraggingItemId(null)
      setDragOverFolderId(null)
    }
  }, [currentFolderId, loadFolderContents])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    setDraggingItemId(null)
    setDragOverFolderId(null)
  }, [])

  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchTerm) return items
    return items.filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [items, searchTerm])

  // 폴더 트리 렌더링 (재귀)
  const renderFolderTree = (parentId: string | null, level: number = 0) => {
    const folders = items.filter(item => item.type === 'folder' && item.parentId === parentId)

    return folders.map(folder => {
      const isExpanded = expandedFolderIds.has(folder._id)
      const hasChildren = items.some(item => item.type === 'folder' && item.parentId === folder._id)
      const isActive = currentFolderId === folder._id

      return (
        <div key={folder._id} className="folder-tree-item">
          <div
            className={`folder-tree-row ${isActive ? 'active' : ''}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {hasChildren && (
              <button
                className="folder-expand-button"
                onClick={() => toggleFolder(folder._id)}
                aria-label={isExpanded ? '폴더 닫기' : '폴더 열기'}
              >
                <SFSymbol
                  name={isExpanded ? 'chevron.down' : 'chevron.right'}
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
              </button>
            )}
            <button
              className="folder-name-button"
              onClick={() => handleFolderClick(folder._id)}
              style={{ paddingLeft: hasChildren ? '0' : '20px' }}
            >
              <SFSymbol
                name="folder.fill"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
              <span className="folder-name">{folder.name}</span>
            </button>
          </div>
          {isExpanded && hasChildren && (
            <div className="folder-tree-children">
              {renderFolderTree(folder._id, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <CenterPaneView visible={visible} onClose={onClose} title="내 파일">
      <div className="personal-files-view">
        {/* 좌측: 폴더 트리 */}
        <div className="files-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">빠른 액세스</div>

            {/* 내 드라이브 */}
            <button
              className={`sidebar-item ${currentFolderId === null ? 'active' : ''}`}
              onClick={() => handleFolderClick(null)}
            >
              <SFSymbol
                name="folder.fill"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
              <span>내 드라이브</span>
            </button>

            {/* 즐겨찾기 */}
            <button className="sidebar-item">
              <SFSymbol
                name="star.fill"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
              <span>즐겨찾기</span>
            </button>
          </div>

          {/* 폴더 트리 */}
          <div className="sidebar-section">
            <div className="sidebar-title">폴더</div>
            <div className="folder-tree">
              {renderFolderTree(null)}
            </div>
          </div>
        </div>

        {/* 우측: 파일 목록 */}
        <div className="files-main">
          {/* 툴바 */}
          <div className="files-toolbar">
            {/* 브레드크럼 */}
            <div className="breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb._id || 'root'}>
                  {index > 0 && <span className="breadcrumb-separator">/</span>}
                  <button
                    className="breadcrumb-item"
                    onClick={() => handleFolderClick(crumb._id)}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* 검색 및 뷰 모드 */}
            <div className="toolbar-actions">
              {/* 파일 업로드 */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                aria-label="파일 선택"
              />
              <Tooltip content="파일 업로드">
                <button
                  className="upload-button"
                  onClick={handleUploadClick}
                  disabled={uploading}
                  aria-label="파일 업로드"
                >
                  <SFSymbol
                    name="arrow.up.doc"
                    size={SFSymbolSize.FOOTNOTE}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                </button>
              </Tooltip>

              {/* 새 폴더 */}
              <Tooltip content="새 폴더">
                <button
                  className="upload-button"
                  onClick={handleNewFolderClick}
                  aria-label="새 폴더"
                >
                  <SFSymbol
                    name="folder.badge.plus"
                    size={SFSymbolSize.FOOTNOTE}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                </button>
              </Tooltip>

              {/* 검색 */}
              <div className="search-box">
                <SFSymbol
                  name="magnifyingglass"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  className="search-icon"
                  decorative={true}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="파일 검색"
                  className="search-input"
                />
              </div>

              {/* 뷰 모드 전환 */}
              <div className="view-mode-toggle">
                <Tooltip content="리스트 뷰">
                  <button
                    className={`view-mode-button ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    aria-label="리스트 뷰"
                  >
                    <SFSymbol
                      name="list.bullet"
                      size={SFSymbolSize.FOOTNOTE}
                      weight={SFSymbolWeight.MEDIUM}
                      decorative={true}
                    />
                  </button>
                </Tooltip>
                <Tooltip content="그리드 뷰">
                  <button
                    className={`view-mode-button ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    aria-label="그리드 뷰"
                  >
                    <SFSymbol
                      name="square.grid.2x2"
                      size={SFSymbolSize.FOOTNOTE}
                      weight={SFSymbolWeight.MEDIUM}
                      decorative={true}
                    />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* 업로드 진행률 표시 */}
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="progress-text">업로드 중... {uploadProgress}%</span>
            </div>
          )}

          {/* 파일 목록 */}
          <div className={`files-content ${viewMode === 'grid' ? 'grid-view' : 'list-view'}`}>
            {loading ? (
              <div className="empty-state">
                <p>로딩 중...</p>
              </div>
            ) : error ? (
              <div className="empty-state">
                <p style={{ color: 'var(--color-destructive)' }}>{error}</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <p>파일이 없습니다</p>
              </div>
            ) : viewMode === 'list' ? (
              // 리스트 뷰
              <div className="files-list">
                <div className="files-list-header">
                  <div className="header-name">이름</div>
                  <div className="header-size">크기</div>
                  <div className="header-modified">수정한 날짜</div>
                  <div className="header-actions">작업</div>
                </div>
                {filteredItems.map(item => (
                  <div
                    key={item._id}
                    className={`file-list-row ${draggingItemId === item._id ? 'dragging' : ''} ${item.type === 'folder' && dragOverFolderId === item._id ? 'drag-over' : ''}`}
                    onClick={() => item.type === 'folder' && handleFolderClick(item._id)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onDragOver={item.type === 'folder' ? handleDragOver : undefined}
                    onDragEnter={item.type === 'folder' ? (e) => handleDragEnter(e, item._id) : undefined}
                    onDragLeave={item.type === 'folder' ? handleDragLeave : undefined}
                    onDrop={item.type === 'folder' ? (e) => handleDrop(e, item._id) : undefined}
                  >
                    <div className="row-name">
                      <SFSymbol
                        name={getFileIcon(item)}
                        size={SFSymbolSize.BODY}
                        weight={SFSymbolWeight.REGULAR}
                        decorative={true}
                      />
                      <span>{item.name}</span>
                    </div>
                    <div className="row-size">
                      {item.type === 'file' && item.size ? formatFileSize(item.size) : '—'}
                    </div>
                    <div className="row-modified">
                      {formatDate(item.updatedAt)}
                    </div>
                    <div className="row-actions">
                      {item.type === 'file' && (
                        <Tooltip content="다운로드">
                          <button
                            className="download-button"
                            onClick={(e) => handleFileDownload(item._id, item.name, e)}
                            aria-label="다운로드"
                          >
                            <SFSymbol
                              name="arrow.down.circle"
                              size={SFSymbolSize.FOOTNOTE}
                              weight={SFSymbolWeight.REGULAR}
                              decorative={true}
                            />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // 그리드 뷰
              <div className="files-grid">
                {filteredItems.map(item => (
                  <div
                    key={item._id}
                    className={`file-grid-item ${draggingItemId === item._id ? 'dragging' : ''} ${item.type === 'folder' && dragOverFolderId === item._id ? 'drag-over' : ''}`}
                    onClick={() => item.type === 'folder' && handleFolderClick(item._id)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onDragOver={item.type === 'folder' ? handleDragOver : undefined}
                    onDragEnter={item.type === 'folder' ? (e) => handleDragEnter(e, item._id) : undefined}
                    onDragLeave={item.type === 'folder' ? handleDragLeave : undefined}
                    onDrop={item.type === 'folder' ? (e) => handleDrop(e, item._id) : undefined}
                  >
                    <div className="grid-item-icon">
                      <SFSymbol
                        name={getFileIcon(item)}
                        size={SFSymbolSize.LARGE_TITLE}
                        weight={SFSymbolWeight.REGULAR}
                        decorative={true}
                      />
                    </div>
                    <div className="grid-item-name">
                      {item.name}
                    </div>
                    <div className="grid-item-info">
                      {item.type === 'file' && item.size ? formatFileSize(item.size) : ''}
                    </div>
                    {item.type === 'file' && (
                      <Tooltip content="다운로드">
                        <button
                          className="grid-download-button"
                          onClick={(e) => handleFileDownload(item._id, item.name, e)}
                          aria-label="다운로드"
                        >
                          <SFSymbol
                            name="arrow.down.circle"
                            size={SFSymbolSize.FOOTNOTE}
                            weight={SFSymbolWeight.REGULAR}
                            decorative={true}
                          />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 폴더 생성 모달 */}
      <Modal
        visible={showNewFolderModal}
        onClose={handleCloseFolderModal}
        title="새 폴더"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleCloseFolderModal}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFolder}
              loading={creatingFolder}
              disabled={!newFolderName.trim()}
            >
              만들기
            </Button>
          </div>
        }
      >
        <div style={{ padding: 'var(--spacing-3)' }}>
          <div style={{ marginBottom: 'var(--spacing-2)' }}>
            <label
              htmlFor="folder-name-input"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-footnote)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-1)'
              }}
            >
              폴더 이름
            </label>
            <input
              id="folder-name-input"
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleCreateFolder()
                }
              }}
              placeholder="폴더 이름을 입력하세요"
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--spacing-2)',
                fontSize: 'var(--font-size-body)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                transition: 'border-color var(--duration-fast) var(--easing-ease-out)'
              }}
            />
          </div>
        </div>
      </Modal>

      {/* 컨텍스트 메뉴 */}
      {showContextMenu && selectedItem && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleRenameClick}>
            <SFSymbol
              name="pencil"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              decorative={true}
            />
            <span>이름 변경</span>
          </button>

          {selectedItem.type === 'folder' && (
            <button className="context-menu-item" onClick={handleNewFolderFromContext}>
              <SFSymbol
                name="folder.badge.plus"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
              <span>새 폴더</span>
            </button>
          )}

          <button className="context-menu-item context-menu-item--danger" onClick={handleDeleteClick}>
            <SFSymbol
              name="trash"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              decorative={true}
            />
            <span>삭제</span>
          </button>
        </div>
      )}

      {/* 이름 변경 모달 */}
      <Modal
        visible={showRenameModal}
        onClose={handleCloseRenameModal}
        title="이름 변경"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleCloseRenameModal}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleRenameItem}
              loading={renamingItem}
              disabled={!renameValue.trim()}
            >
              변경
            </Button>
          </div>
        }
      >
        <div style={{ padding: 'var(--spacing-3)' }}>
          <div style={{ marginBottom: 'var(--spacing-2)' }}>
            <label
              htmlFor="rename-input"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-footnote)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-1)'
              }}
            >
              {selectedItem?.type === 'folder' ? '폴더 이름' : '파일 이름'}
            </label>
            <input
              id="rename-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) {
                  handleRenameItem()
                }
              }}
              placeholder="새 이름을 입력하세요"
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--spacing-2)',
                fontSize: 'var(--font-size-body)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                transition: 'border-color var(--duration-fast) var(--easing-ease-out)'
              }}
            />
          </div>
        </div>
      </Modal>
    </CenterPaneView>
  )
}

export default PersonalFilesView
