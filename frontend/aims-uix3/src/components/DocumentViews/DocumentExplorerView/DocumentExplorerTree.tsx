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

import React, { useCallback, useRef, useMemo, useEffect } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { Document } from '@/types/documentStatus'
import type { DocumentTreeNode, DocumentGroupBy, DocumentSortBy, SortDirection } from './types/documentExplorer'
import { useDocumentExplorerKeyboard } from './hooks/useDocumentExplorerKeyboard'
import { getDocumentDate } from './utils/treeBuilders'

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
}

// 더블클릭 감지를 위한 타이머
const DOUBLE_CLICK_DELAY = 250

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
}) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickedIdRef = useRef<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

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
    (doc: Document, e: React.MouseEvent) => {
      e.stopPropagation()
      const docId = doc._id || doc.id || ''

      // 클릭한 노드로 포커스 이동
      setFocusedKey(`doc-${docId}`)

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
            {node.label}
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
    const nodeKey = `doc-${docId}`
    const isSelected = selectedDocumentId === docId
    const isFocused = focusedKey === nodeKey
    const badgeType = doc.badgeType || 'BIN'
    const customerName = doc.customer_relation?.customer_name
    const documentDate = getDocumentDate(doc)

    return (
      <div
        key={node.key}
        data-node-key={nodeKey}
        className={`doc-explorer-tree__document doc-explorer-tree__document--level-${level}${isSelected ? ' doc-explorer-tree__document--selected' : ''}${isFocused ? ' doc-explorer-tree__document--focused' : ''}`}
        onClick={(e) => handleDocumentClick(doc, e)}
        role="treeitem"
        tabIndex={-1}
        aria-selected={isSelected}
      >
        {/* 문서 아이콘 */}
        <span className={`doc-explorer-tree__doc-icon doc-explorer-tree__doc-icon--${badgeType.toLowerCase()}`}>
          <SFSymbol
            name={node.icon || 'doc.fill'}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
        </span>

        {/* 문서명 */}
        <span className="doc-explorer-tree__doc-name" title={node.label}>
          {node.label}
        </span>

        {/* 고객명 (클릭 시 해당 고객 문서만 필터) */}
        <span
          className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
          title={customerName ? `${customerName} 문서만 보기` : '-'}
          onClick={customerName ? (e) => handleCustomerBadgeClick(e, customerName) : undefined}
        >
          {customerName || '-'}
        </span>

        {/* 날짜/시간 */}
        <span
          className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
          title={documentDate || '-'}
        >
          {documentDate ? formatDateTime(documentDate) : '-'}
        </span>

        {/* 문서유형 배지 */}
        <span className={`doc-explorer-tree__badge doc-explorer-tree__badge--${badgeType.toLowerCase()}`}>
          {badgeType}
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

  // 빈 상태
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

  // 최근 본 문서 정렬
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

  // 최근 본 문서 렌더링
  const renderRecentDocuments = () => {
    if (sortedRecentDocuments.length === 0) return null

    return (
      <div className="doc-explorer-tree__recent">
        <div className="doc-explorer-tree__recent-header">
          <SFSymbol
            name="clock.fill"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
          <span>최근 본 문서</span>
        </div>
        <div className="doc-explorer-tree__recent-list">
          {sortedRecentDocuments.map((doc) => {
            const docId = doc._id || doc.id || ''
            const isSelected = selectedDocumentId === docId
            const badgeType = doc.badgeType || 'BIN'
            const displayName = doc.displayName || doc.originalName || doc.filename || doc.name || '이름 없음'
            const customerName = doc.customer_relation?.customer_name
            const documentDate = getDocumentDate(doc)

            return (
              <div
                key={`recent-${docId}`}
                className={`doc-explorer-tree__recent-item ${isSelected ? 'doc-explorer-tree__recent-item--selected' : ''}`}
                onClick={(e) => handleDocumentClick(doc, e)}
                role="button"
                tabIndex={0}
              >
                {/* 문서 아이콘 */}
                <span className={`doc-explorer-tree__doc-icon doc-explorer-tree__doc-icon--${badgeType.toLowerCase()}`}>
                  <SFSymbol
                    name="doc.fill"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.REGULAR}
                  />
                </span>

                {/* 문서명 */}
                <span className="doc-explorer-tree__doc-name" title={displayName}>
                  {displayName}
                </span>

                {/* 고객명 */}
                <span
                  className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
                  title={customerName ? `${customerName} 문서만 보기` : '-'}
                  onClick={customerName ? (e) => handleCustomerBadgeClick(e, customerName) : undefined}
                >
                  {customerName || '-'}
                </span>

                {/* 날짜/시간 */}
                <span
                  className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
                  title={documentDate || '-'}
                >
                  {documentDate ? formatDateTime(documentDate) : '-'}
                </span>

                {/* 문서유형 배지 */}
                <span className={`doc-explorer-tree__badge doc-explorer-tree__badge--${badgeType.toLowerCase()}`}>
                  {badgeType}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
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
  )
}
