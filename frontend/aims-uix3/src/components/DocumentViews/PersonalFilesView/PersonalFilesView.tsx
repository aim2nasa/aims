/**
 * PersonalFilesView Component
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 View
 * 좌측: 폴더 트리 네비게이션
 * 우측: 파일/폴더 목록
 *
 * 2단계: 백엔드 API 연동 완료
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Tooltip } from '@/shared/ui'
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
                </div>
                {filteredItems.map(item => (
                  <div
                    key={item._id}
                    className="file-list-row"
                    onClick={() => item.type === 'folder' && handleFolderClick(item._id)}
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
                  </div>
                ))}
              </div>
            ) : (
              // 그리드 뷰
              <div className="files-grid">
                {filteredItems.map(item => (
                  <div
                    key={item._id}
                    className="file-grid-item"
                    onClick={() => item.type === 'folder' && handleFolderClick(item._id)}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </CenterPaneView>
  )
}

export default PersonalFilesView
