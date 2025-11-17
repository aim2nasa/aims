/**
 * PersonalFilesView Component
 * @since 1.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 View
 * 좌측: 폴더 트리 네비게이션
 * 우측: 파일/폴더 목록
 */

import React, { useState, useCallback, useMemo } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Tooltip } from '@/shared/ui'
import './PersonalFilesView.css'

interface PersonalFilesViewProps {
  visible: boolean
  onClose: () => void
}

interface FileSystemItem {
  id: string
  name: string
  type: 'folder' | 'file'
  parentId: string | null
  size?: number
  mimeType?: string
  modifiedDate: Date
  starred?: boolean
}

// Mock 데이터
const mockItems: FileSystemItem[] = [
  // 최상위 폴더
  { id: 'folder-1', name: '2024년 업무', type: 'folder', parentId: null, modifiedDate: new Date('2024-11-15'), starred: false },
  { id: 'folder-2', name: '고객 자료', type: 'folder', parentId: null, modifiedDate: new Date('2024-11-14'), starred: true },
  { id: 'folder-3', name: '보험 상품', type: 'folder', parentId: null, modifiedDate: new Date('2024-11-10'), starred: false },

  // 2024년 업무 하위 폴더
  { id: 'folder-1-1', name: 'Q1 실적', type: 'folder', parentId: 'folder-1', modifiedDate: new Date('2024-03-31'), starred: false },
  { id: 'folder-1-2', name: 'Q2 실적', type: 'folder', parentId: 'folder-1', modifiedDate: new Date('2024-06-30'), starred: false },

  // 파일들
  { id: 'file-1', name: '2024년 영업 계획서.pdf', type: 'file', parentId: 'folder-1', size: 2457600, mimeType: 'application/pdf', modifiedDate: new Date('2024-11-15'), starred: false },
  { id: 'file-2', name: 'Q1 분석 보고서.docx', type: 'file', parentId: 'folder-1-1', size: 512000, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedDate: new Date('2024-03-31'), starred: false },
  { id: 'file-3', name: '고객 미팅 메모.docx', type: 'file', parentId: 'folder-2', size: 102400, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedDate: new Date('2024-11-14'), starred: true },
  { id: 'file-4', name: '보험 상품 비교표.xlsx', type: 'file', parentId: 'folder-3', size: 819200, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', modifiedDate: new Date('2024-11-10'), starred: false },
  { id: 'file-5', name: '계약서 양식.pdf', type: 'file', parentId: null, size: 1048576, mimeType: 'application/pdf', modifiedDate: new Date('2024-11-12'), starred: false },
]

// 파일 크기 포맷팅
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// 날짜 포맷팅
const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

// 파일 타입 아이콘 가져오기
const getFileIcon = (item: FileSystemItem): string => {
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
  const [items] = useState<FileSystemItem[]>(mockItems)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

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
  }, [])

  // 현재 폴더의 아이템들 가져오기
  const currentFolderItems = useMemo(() => {
    return items.filter(item => item.parentId === currentFolderId)
  }, [items, currentFolderId])

  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchTerm) return currentFolderItems
    return currentFolderItems.filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [currentFolderItems, searchTerm])

  // 브레드크럼 경로 생성
  const breadcrumbPath = useMemo(() => {
    const path: FileSystemItem[] = []
    let current = currentFolderId

    while (current) {
      const folder = items.find(item => item.id === current)
      if (folder) {
        path.unshift(folder)
        current = folder.parentId
      } else {
        break
      }
    }

    return path
  }, [items, currentFolderId])

  // 폴더 트리 렌더링 (재귀)
  const renderFolderTree = (parentId: string | null, level: number = 0) => {
    const folders = items.filter(item => item.type === 'folder' && item.parentId === parentId)

    return folders.map(folder => {
      const isExpanded = expandedFolderIds.has(folder.id)
      const hasChildren = items.some(item => item.type === 'folder' && item.parentId === folder.id)
      const isActive = currentFolderId === folder.id

      return (
        <div key={folder.id} className="folder-tree-item">
          <div
            className={`folder-tree-row ${isActive ? 'active' : ''}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {hasChildren && (
              <button
                className="folder-expand-button"
                onClick={() => toggleFolder(folder.id)}
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
              onClick={() => handleFolderClick(folder.id)}
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
              {renderFolderTree(folder.id, level + 1)}
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
              <button
                className="breadcrumb-item"
                onClick={() => handleFolderClick(null)}
              >
                내 드라이브
              </button>
              {breadcrumbPath.map((folder) => (
                <React.Fragment key={folder.id}>
                  <span className="breadcrumb-separator">/</span>
                  <button
                    className="breadcrumb-item"
                    onClick={() => handleFolderClick(folder.id)}
                  >
                    {folder.name}
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
            {filteredItems.length === 0 ? (
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
                    key={item.id}
                    className="file-list-row"
                    onClick={() => item.type === 'folder' && handleFolderClick(item.id)}
                  >
                    <div className="row-name">
                      <SFSymbol
                        name={getFileIcon(item)}
                        size={SFSymbolSize.BODY}
                        weight={SFSymbolWeight.REGULAR}
                        decorative={true}
                      />
                      <span>{item.name}</span>
                      {item.starred && (
                        <SFSymbol
                          name="star.fill"
                          size={SFSymbolSize.CAPTION_1}
                          weight={SFSymbolWeight.REGULAR}
                          className="star-icon"
                          decorative={true}
                        />
                      )}
                    </div>
                    <div className="row-size">
                      {item.type === 'file' && item.size ? formatFileSize(item.size) : '—'}
                    </div>
                    <div className="row-modified">
                      {formatDate(item.modifiedDate)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // 그리드 뷰
              <div className="files-grid">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className="file-grid-item"
                    onClick={() => item.type === 'folder' && handleFolderClick(item.id)}
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
                      {item.starred && (
                        <SFSymbol
                          name="star.fill"
                          size={SFSymbolSize.CAPTION_1}
                          weight={SFSymbolWeight.REGULAR}
                          className="star-icon"
                          decorative={true}
                        />
                      )}
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
