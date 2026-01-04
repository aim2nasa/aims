/**
 * DocumentExplorerTree
 * @description 문서 탐색기 트리 렌더링 컴포넌트
 *
 * 키보드 네비게이션:
 * - ↑↓: 이전/다음 노드로 이동
 * - Enter: 프리뷰 열기 (싱글클릭)
 * - Space: 모달 프리뷰 (더블클릭)
 * - ←: 폴더 접기 / 부모로 이동
 * - →: 폴더 펼치기 / 자식으로 이동
 * - Home/End: 처음/마지막으로 이동
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import type { Document } from '@/types/documentStatus'
import type { DocumentTreeNode, DocumentGroupBy, DocumentSortBy, SortDirection } from './types/documentExplorer'
import { useDocumentExplorerKeyboard } from './hooks/useDocumentExplorerKeyboard'
import { getDocumentDate } from './utils/treeBuilders'
import { HoverPreview } from './components/HoverPreview'

// 최근 본 문서 아이콘 (시계 + 문서)
const RecentDocumentsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 시계 */}
    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M6 3V6L8 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* 문서 (오른쪽 하단) */}
    <path d="M10 9V14.5C10 15.05 10.45 15.5 11 15.5H14.5C15.05 15.5 15.5 15.05 15.5 14.5V11L13 9H10Z" fill="currentColor" opacity="0.3" />
    <path d="M10 9H13L15.5 11V14.5C15.5 15.05 15.05 15.5 14.5 15.5H11C10.45 15.5 10 15.05 10 14.5V9Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export interface DocumentExplorerTreeProps {
  nodes: DocumentTreeNode[]
  expandedKeys: Set<string>
  selectedDocumentId: string | null
  groupBy: DocumentGroupBy
  onToggleNode: (key: string) => void
  onDocumentClick: (document: Document) => void
  onDocumentDoubleClick: (document: Document) => void
  onCustomerClick?: (customerName: string) => void
  recentDocuments?: Document[]
  sortBy?: DocumentSortBy
  sortDirection?: SortDirection
  /** 검색어 (하이라이트용) */
  searchTerm?: string
}

// 더블클릭 감지를 위한 타이머
const DOUBLE_CLICK_DELAY = 250

/**
 * 검색어 하이라이트 함수
 * 텍스트에서 검색어와 매칭되는 부분을 하이라이트 처리
 */
const highlightText = (text: string, searchTerm: string): React.ReactNode => {
  if (!searchTerm || !text) return text

  const lowerText = text.toLowerCase()
  const lowerSearch = searchTerm.toLowerCase().trim()

  if (!lowerSearch || !lowerText.includes(lowerSearch)) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let matchIndex = lowerText.indexOf(lowerSearch)
  let keyIndex = 0

  while (matchIndex !== -1) {
    // 매칭 전 부분
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex))
    }
    // 매칭 부분 (하이라이트)
    parts.push(
      <mark key={keyIndex++} className="doc-explorer-highlight">
        {text.slice(matchIndex, matchIndex + lowerSearch.length)}
      </mark>
    )
    lastIndex = matchIndex + lowerSearch.length
    matchIndex = lowerText.indexOf(lowerSearch, lastIndex)
  }

  // 남은 부분
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}

export const DocumentExplorerTree: React.FC<DocumentExplorerTreeProps> = ({
  nodes,
  expandedKeys,
  selectedDocumentId,
  groupBy,
  onToggleNode,
  onDocumentClick,
  onDocumentDoubleClick,
  onCustomerClick,
  recentDocuments = [],
  sortBy = 'date',
  sortDirection = 'desc',
  searchTerm = '',
}) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickedIdRef = useRef<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // 호버 프리뷰 상태
  const [hoverDocument, setHoverDocument] = useState<Document | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 최근 본 문서 섹션 펼침/접힘 상태 (localStorage에 저장)
  const [isRecentExpanded, setIsRecentExpanded] = useState(() => {
    const saved = localStorage.getItem('doc-explorer-recent-expanded')
    return saved !== null ? saved === 'true' : true // 기본값: 펼침
  })

  // 상태 변경 시 localStorage에 저장
  const toggleRecentExpanded = useCallback(() => {
    setIsRecentExpanded(prev => {
      const newValue = !prev
      localStorage.setItem('doc-explorer-recent-expanded', String(newValue))
      return newValue
    })
  }, [])

  // 키보드 네비게이션 훅
  const {
    focusedKey,
    setFocusedKey,
    handleKeyDown: keyboardHandleKeyDown,
  } = useDocumentExplorerKeyboard({
    nodes,
    expandedKeys,
    selectedDocumentId,
    onToggleNode,
    onDocumentClick,
    onDocumentDoubleClick,
  })

  // 포커스된 요소로 스크롤
  useEffect(() => {
    if (!focusedKey || !treeContainerRef.current) return

    const focusedElement = treeContainerRef.current.querySelector(
      `[data-node-key="${focusedKey}"]`
    ) as HTMLElement

    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedKey])

  // 문서 클릭 핸들러 (싱글/더블클릭 구분)
  const handleDocumentClick = useCallback(
    (doc: Document, e: React.MouseEvent, nodeKey?: string) => {
      e.stopPropagation()
      const docId = doc._id || doc.id || ''

      // 클릭한 노드로 포커스 이동
      if (nodeKey) {
        setFocusedKey(nodeKey)
      }

      if (clickTimerRef.current && lastClickedIdRef.current === docId) {
        // 더블클릭
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
        lastClickedIdRef.current = null
        onDocumentDoubleClick(doc)
      } else {
        // 싱글클릭 대기
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current)
        }
        lastClickedIdRef.current = docId
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null
          lastClickedIdRef.current = null
          onDocumentClick(doc)
        }, DOUBLE_CLICK_DELAY)
      }
    },
    [onDocumentClick, onDocumentDoubleClick, setFocusedKey]
  )

  // 그룹 클릭 핸들러
  const handleGroupClick = useCallback(
    (key: string) => {
      setFocusedKey(key)
      onToggleNode(key)
    },
    [onToggleNode, setFocusedKey]
  )

  // 고객명 클릭 핸들러
  const handleCustomerBadgeClick = useCallback(
    (e: React.MouseEvent, customerName: string) => {
      e.stopPropagation() // 문서 클릭 이벤트 방지
      onCustomerClick?.(customerName)
    },
    [onCustomerClick]
  )

  // 문서 호버 핸들러
  const handleDocumentMouseEnter = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      // 기존 타이머 취소
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
      // 마우스 위치 저장
      setHoverPosition({ x: e.clientX, y: e.clientY })
      setHoverDocument(doc)
    },
    []
  )

  // 마우스 이동 시 위치 업데이트 (+ 모달 닫힌 후 복구용 문서 설정)
  const handleDocumentMouseMove = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      setHoverPosition({ x: e.clientX, y: e.clientY })
      // 모달/RightPane 닫힌 후 마우스가 이미 문서 위에 있는 경우 복구
      setHoverDocument(doc)
    },
    []
  )

  const handleDocumentMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
    }
    setHoverDocument(null)
    setHoverPosition(null)
  }, [])

  // 그룹 노드 렌더링
  const renderGroupNode = (node: DocumentTreeNode, level: number): React.ReactNode => {
    const isExpanded = expandedKeys.has(node.key)
    const hasChildren = node.children && node.children.length > 0
    const isSpecial = node.metadata?.isSpecial
    const isFocused = focusedKey === node.key

    return (
      <div key={node.key} className="doc-explorer-tree__group">
        <div
          data-node-key={node.key}
          className={`doc-explorer-tree__group-header doc-explorer-tree__group-header--level-${level}${isSpecial ? ' doc-explorer-tree__group-header--special' : ''}${isFocused ? ' doc-explorer-tree__group-header--focused' : ''}`}
          onClick={() => handleGroupClick(node.key)}
          role="treeitem"
          tabIndex={-1}
          aria-expanded={isExpanded}
          aria-selected={isFocused}
        >
          {/* 펼치기/접기 아이콘 - 자식이 있을 때만 표시 (윈도우 탐색기 스타일) */}
          {hasChildren ? (
            <span className="doc-explorer-tree__chevron">
              <SFSymbol
                name={isExpanded ? 'chevron.down' : 'chevron.right'}
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.MEDIUM}
              />
            </span>
          ) : (
            <span className="doc-explorer-tree__chevron-placeholder" />
          )}

          {/* 폴더 아이콘 (내 보관함 스타일) */}
          <span className="doc-explorer-tree__folder-icon">
            {isExpanded ? '📂' : '📁'}
          </span>

          {/* 그룹 라벨 + 문서 수 */}
          <span className="doc-explorer-tree__group-label">
            {highlightText(node.label, searchTerm)}
            {node.count !== undefined && (
              <span className="doc-explorer-tree__count-inline"> ({node.count}건)</span>
            )}
          </span>
        </div>

        {/* 자식 노드 */}
        {isExpanded && hasChildren && (
          <div className="doc-explorer-tree__children" role="group">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  // 날짜/시간 포맷 (MM.DD HH:mm:ss)
  const formatDateTime = (dateStr: string): string => {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${month}.${day} ${hours}:${minutes}:${seconds}`
    } catch {
      return ''
    }
  }

  // 문서 노드 렌더링
  const renderDocumentNode = (node: DocumentTreeNode, level: number): React.ReactNode => {
    const doc = node.document
    if (!doc) return null

    const docId = doc._id || doc.id || ''
    const isSelected = selectedDocumentId === docId
    const isFocused = focusedKey === node.key
    const customerName = doc.customer_relation?.customer_name
    const documentDate = getDocumentDate(doc)
    const filename = DocumentStatusService.extractFilename(doc)

    return (
      <div
        key={node.key}
        data-node-key={node.key}
        className={`doc-explorer-tree__document doc-explorer-tree__document--level-${level}${isSelected ? ' doc-explorer-tree__document--selected' : ''}${isFocused ? ' doc-explorer-tree__document--focused' : ''}`}
        onClick={(e) => handleDocumentClick(doc, e, node.key)}
        onMouseEnter={(e) => handleDocumentMouseEnter(doc, e)}
        onMouseMove={(e) => handleDocumentMouseMove(doc, e)}
        onMouseLeave={handleDocumentMouseLeave}
        role="treeitem"
        tabIndex={-1}
        aria-selected={isSelected}
      >
        {/* 문서 아이콘 (확장자에 따른 아이콘) */}
        <span className={`doc-explorer-tree__doc-icon document-icon ${DocumentUtils.getFileTypeClass(doc.mimeType, filename)}`}>
          <SFSymbol
            name={DocumentUtils.getFileIcon(doc.mimeType, filename)}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
        </span>

        {/* 문서명 */}
        <span className="doc-explorer-tree__doc-name" title={node.label}>
          {highlightText(node.label, searchTerm)}
        </span>

        {/* 고객명 (클릭 시 해당 고객 문서만 필터) */}
        <span
          className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
          title={customerName ? `${customerName} 문서만 보기` : '-'}
          onClick={customerName ? (e) => handleCustomerBadgeClick(e, customerName) : undefined}
        >
          {customerName ? highlightText(customerName, searchTerm) : '-'}
        </span>

        {/* 날짜/시간 */}
        <span
          className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
          title={documentDate || '-'}
        >
          {documentDate ? formatDateTime(documentDate) : '-'}
        </span>
      </div>
    )
  }

  // 노드 렌더링 (타입에 따라 분기)
  const renderNode = (node: DocumentTreeNode, level: number): React.ReactNode => {
    if (node.type === 'document') {
      return renderDocumentNode(node, level)
    }
    return renderGroupNode(node, level)
  }

  // 최근 본 문서 정렬 (훅은 조건부 리턴 전에 호출해야 함)
  const sortedRecentDocuments = useMemo(() => {
    if (recentDocuments.length === 0) return []

    const sorted = [...recentDocuments].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name': {
          const nameA = (a.displayName || a.originalName || a.filename || a.name || '').toLowerCase()
          const nameB = (b.displayName || b.originalName || b.filename || b.name || '').toLowerCase()
          comparison = nameA.localeCompare(nameB, 'ko')
          break
        }
        case 'customer': {
          const customerA = (a.customer_relation?.customer_name || '').toLowerCase()
          const customerB = (b.customer_relation?.customer_name || '').toLowerCase()
          comparison = customerA.localeCompare(customerB, 'ko')
          break
        }
        case 'date': {
          const dateA = getDocumentDate(a) || ''
          const dateB = getDocumentDate(b) || ''
          comparison = dateA.localeCompare(dateB)
          break
        }
        case 'badgeType': {
          const typeA = a.badgeType || 'BIN'
          const typeB = b.badgeType || 'BIN'
          comparison = typeA.localeCompare(typeB)
          break
        }
        default:
          comparison = 0
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [recentDocuments, sortBy, sortDirection])

  // 최근 본 문서 렌더링 (검색 중일 때는 숨김)
  const renderRecentDocuments = () => {
    if (sortedRecentDocuments.length === 0) return null
    if (searchTerm.trim()) return null // 검색 중에는 최근 본 문서 숨김

    return (
      <div className={`doc-explorer-tree__recent ${!isRecentExpanded ? 'doc-explorer-tree__recent--collapsed' : ''}`}>
        <div
          className="doc-explorer-tree__recent-header"
          onClick={toggleRecentExpanded}
          role="button"
          tabIndex={0}
          aria-expanded={isRecentExpanded ? 'true' : 'false'}
        >
          {/* 펼침/접힘 화살표 */}
          <span className="doc-explorer-tree__recent-chevron">
            <SFSymbol
              name={isRecentExpanded ? 'chevron.down' : 'chevron.right'}
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.MEDIUM}
            />
          </span>
          {/* 커스텀 아이콘 */}
          <RecentDocumentsIcon className="doc-explorer-tree__recent-icon" />
          <span>최근 본 문서</span>
          <span className="doc-explorer-tree__recent-count">({sortedRecentDocuments.length})</span>
        </div>
        {isRecentExpanded && (
          <div className="doc-explorer-tree__recent-list">
            {sortedRecentDocuments.map((doc) => {
              const docId = doc._id || doc.id || ''
              const isSelected = selectedDocumentId === docId
              const displayName = doc.displayName || doc.originalName || doc.filename || doc.name || '이름 없음'
              const customerName = doc.customer_relation?.customer_name
              const documentDate = getDocumentDate(doc)
              const filename = DocumentStatusService.extractFilename(doc)

              return (
                <div
                  key={`recent-${docId}`}
                  className={`doc-explorer-tree__recent-item ${isSelected ? 'doc-explorer-tree__recent-item--selected' : ''}`}
                  onClick={(e) => handleDocumentClick(doc, e)}
                  onMouseEnter={(e) => handleDocumentMouseEnter(doc, e)}
                  onMouseMove={(e) => handleDocumentMouseMove(doc, e)}
                  onMouseLeave={handleDocumentMouseLeave}
                  role="button"
                  tabIndex={0}
                >
                  {/* 문서 아이콘 (확장자에 따른 아이콘) */}
                  <span className={`doc-explorer-tree__doc-icon document-icon ${DocumentUtils.getFileTypeClass(doc.mimeType, filename)}`}>
                    <SFSymbol
                      name={DocumentUtils.getFileIcon(doc.mimeType, filename)}
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.REGULAR}
                    />
                  </span>

                  {/* 문서명 */}
                  <span className="doc-explorer-tree__doc-name" title={displayName}>
                    {highlightText(displayName, searchTerm)}
                  </span>

                  {/* 고객명 */}
                  <span
                    className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
                    title={customerName ? `${customerName} 문서만 보기` : '-'}
                    onClick={customerName ? (e) => handleCustomerBadgeClick(e, customerName) : undefined}
                  >
                    {customerName ? highlightText(customerName, searchTerm) : '-'}
                  </span>

                  {/* 날짜/시간 */}
                  <span
                    className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
                    title={documentDate || '-'}
                  >
                    {documentDate ? formatDateTime(documentDate) : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // 빈 상태 (모든 훅 호출 이후에 체크)
  if (nodes.length === 0) {
    return (
      <div className="doc-explorer-tree__empty">
        <SFSymbol
          name="doc.text.magnifyingglass"
          size={SFSymbolSize.TITLE_1}
          weight={SFSymbolWeight.LIGHT}
          className="doc-explorer-tree__empty-icon"
        />
        <p className="doc-explorer-tree__empty-text">문서가 없습니다</p>
      </div>
    )
  }

  return (
    <>
      <div
        ref={treeContainerRef}
        className="doc-explorer-tree"
        role="tree"
        tabIndex={0}
        onKeyDown={keyboardHandleKeyDown}
      >
        {renderRecentDocuments()}
        {nodes.map((node) => renderNode(node, 0))}
      </div>
      {/* 호버 시 항상 썸네일 표시 */}
      <HoverPreview
        document={hoverDocument}
        position={hoverPosition}
      />
    </>
  )
}
