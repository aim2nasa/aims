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

import React, { useCallback, useRef, useMemo, useEffect, useState, useReducer } from 'react'
// flushSync 제거 — 마우스 이벤트마다 동기 렌더링 강제하면 저사양 PC에서 프리징 발생
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { SummaryIcon, DocumentIcon } from '../components/DocumentActionIcons'
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
  /** 썸네일 미리보기 활성화 여부 */
  thumbnailEnabled?: boolean
  /** 파일명 표시 모드 */
  filenameMode?: 'display' | 'original'
  onFilenameModeChange?: (mode: 'display' | 'original') => void
  /** 요약 보기 핸들러 */
  onSummaryClick?: (document: Document) => void
  /** 전체 텍스트 보기 핸들러 */
  onFullTextClick?: (document: Document) => void
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

// 날짜/시간 포맷 (MM.DD HH:mm:ss) — 순수 함수이므로 컴포넌트 바깥에 정의
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

// filenameMode에 따라 문서 표시명 결정 — 순수 함수이므로 컴포넌트 바깥에 정의
const getDocName = (doc: Document, filenameMode: 'display' | 'original'): { showName: string; altName: string } => {
  const originalName = DocumentStatusService.extractOriginalFilename(doc)
  const hasDisplay = Boolean(doc.displayName)
  const showName = filenameMode === 'display' && hasDisplay
    ? doc.displayName!
    : originalName
  const altName = filenameMode === 'display' && hasDisplay
    ? `원본: ${originalName}`
    : (hasDisplay ? `별칭: ${doc.displayName}` : '')
  return { showName, altName }
}

// ─────────────────────────────────────────────────────────────
// DocumentNode: 문서 노드 React.memo 컴포넌트
// ─────────────────────────────────────────────────────────────

interface DocumentNodeProps {
  node: DocumentTreeNode
  level: number
  selectedDocumentId: string | null
  focusedKey: string | null
  searchTerm: string
  filenameMode: 'display' | 'original'
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
}

const DocumentNode = React.memo<DocumentNodeProps>(({
  node,
  level,
  selectedDocumentId,
  focusedKey,
  searchTerm,
  filenameMode,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onCustomerBadgeClick,
  onSummaryClick,
  onFullTextClick,
}) => {
  const doc = node.document
  if (!doc) return null

  const docId = doc._id || doc.id || ''
  const isSelected = selectedDocumentId === docId
  const isFocused = focusedKey === node.key
  const customerName = doc.customer_relation?.customer_name
  const customerType = doc.customer_relation?.customer_type
  const documentDate = getDocumentDate(doc)
  const filename = DocumentStatusService.extractFilename(doc)
  const { showName, altName } = getDocName(doc, filenameMode)
  const fileExt = doc.mimeType ? DocumentUtils.getFileExtension(doc.mimeType) : ''
  const fileSize = DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(doc))

  return (
    <div
      data-node-key={node.key}
      className={`doc-explorer-tree__document doc-explorer-tree__document--level-${level}${isSelected ? ' doc-explorer-tree__document--selected' : ''}${isFocused ? ' doc-explorer-tree__document--focused' : ''}`}
      onClick={(e) => onDocumentClick(doc, e, node.key)}
      onMouseEnter={(e) => onDocumentMouseEnter(doc, e)}
      onMouseMove={(e) => onDocumentMouseMove(doc, e)}
      onMouseLeave={onDocumentMouseLeave}
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

      {/* 문서명: filenameMode에 따라 별칭/원본 전환 */}
      <span className="doc-explorer-tree__doc-name" title={altName || showName}>
        {highlightText(showName, searchTerm)}
      </span>

      {/* 파일 타입 (JPG, PDF 등) */}
      <span className="doc-explorer-tree__doc-ext" title={fileExt || '-'}>
        {fileExt || '-'}
      </span>

      {/* 파일 크기 */}
      <span className="doc-explorer-tree__doc-size">
        {fileSize}
      </span>

      {/* 고객명 (클릭 시 해당 고객 문서만 필터) + 개인/법인 아이콘 */}
      <span
        className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
        title={customerName ? `${customerName} 문서만 보기` : '-'}
        onClick={customerName ? (e) => onCustomerBadgeClick(e, customerName) : undefined}
      >
        {customerName && (
          <span className="doc-explorer-tree__customer-type-icon">
            {customerType === '법인' ? (
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="7" r="3" />
                <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
              </svg>
            )}
          </span>
        )}
        {customerName ? highlightText(customerName, searchTerm) : '-'}
      </span>

      {/* 날짜/시간 */}
      <span
        className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
        title={documentDate || '-'}
      >
        {documentDate ? formatDateTime(documentDate) : '-'}
      </span>

      {/* 유형 배지 */}
      <span className={`doc-explorer-tree__badge doc-explorer-tree__badge--${(doc.badgeType || 'BIN').toLowerCase()}`}>
        {doc.badgeType || 'BIN'}
      </span>

      {/* 액션 버튼 (요약/전체텍스트) */}
      <span className="doc-explorer-tree__doc-actions">
        <button
          type="button"
          className="doc-explorer-tree__action-btn"
          title="요약 보기"
          onClick={(e) => { e.stopPropagation(); onSummaryClick?.(doc) }}
        >
          <SummaryIcon width={13} height={13} />
        </button>
        <button
          type="button"
          className="doc-explorer-tree__action-btn"
          title="전체 텍스트 보기"
          onClick={(e) => { e.stopPropagation(); onFullTextClick?.(doc) }}
        >
          <DocumentIcon width={13} height={13} />
        </button>
      </span>
    </div>
  )
})

DocumentNode.displayName = 'DocumentNode'

// ─────────────────────────────────────────────────────────────
// GroupNode: 그룹 노드 React.memo 컴포넌트
// ─────────────────────────────────────────────────────────────

interface GroupNodeProps {
  node: DocumentTreeNode
  level: number
  expandedKeys: Set<string>
  focusedKey: string | null
  searchTerm: string
  selectedDocumentId: string | null
  filenameMode: 'display' | 'original'
  onGroupClick: (key: string) => void
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
}

const GroupNode = React.memo<GroupNodeProps>(({
  node,
  level,
  expandedKeys,
  focusedKey,
  searchTerm,
  selectedDocumentId,
  filenameMode,
  onGroupClick,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onCustomerBadgeClick,
  onSummaryClick,
  onFullTextClick,
}) => {
  const isExpanded = expandedKeys.has(node.key)
  const hasChildren = node.children && node.children.length > 0
  const isSpecial = node.metadata?.isSpecial
  const isFocused = focusedKey === node.key

  return (
    <div className="doc-explorer-tree__group">
      <div
        data-node-key={node.key}
        className={`doc-explorer-tree__group-header doc-explorer-tree__group-header--level-${level}${isSpecial ? ' doc-explorer-tree__group-header--special' : ''}${isFocused ? ' doc-explorer-tree__group-header--focused' : ''}`}
        onClick={() => onGroupClick(node.key)}
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
              decorative
            />
          </span>
        ) : (
          <span className="doc-explorer-tree__chevron-placeholder" />
        )}

        {/* 폴더 아이콘 (내 보관함 스타일) */}
        <span className="doc-explorer-tree__folder-icon">
          {isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'}
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
          {node.children!.map((child) => (
            <TreeNode
              key={child.key}
              node={child}
              level={level + 1}
              expandedKeys={expandedKeys}
              focusedKey={focusedKey}
              searchTerm={searchTerm}
              selectedDocumentId={selectedDocumentId}
              filenameMode={filenameMode}
              onGroupClick={onGroupClick}
              onDocumentClick={onDocumentClick}
              onDocumentMouseEnter={onDocumentMouseEnter}
              onDocumentMouseMove={onDocumentMouseMove}
              onDocumentMouseLeave={onDocumentMouseLeave}
              onCustomerBadgeClick={onCustomerBadgeClick}
              onSummaryClick={onSummaryClick}
              onFullTextClick={onFullTextClick}
            />
          ))}
        </div>
      )}
    </div>
  )
})

GroupNode.displayName = 'GroupNode'

// ─────────────────────────────────────────────────────────────
// TreeNode: 노드 타입에 따라 GroupNode/DocumentNode 분기
// ─────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: DocumentTreeNode
  level: number
  expandedKeys: Set<string>
  focusedKey: string | null
  searchTerm: string
  selectedDocumentId: string | null
  filenameMode: 'display' | 'original'
  onGroupClick: (key: string) => void
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  expandedKeys,
  focusedKey,
  searchTerm,
  selectedDocumentId,
  filenameMode,
  onGroupClick,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onCustomerBadgeClick,
  onSummaryClick,
  onFullTextClick,
}) => {
  if (node.type === 'document') {
    return (
      <DocumentNode
        node={node}
        level={level}
        selectedDocumentId={selectedDocumentId}
        focusedKey={focusedKey}
        searchTerm={searchTerm}
        filenameMode={filenameMode}
        onDocumentClick={onDocumentClick}
        onDocumentMouseEnter={onDocumentMouseEnter}
        onDocumentMouseMove={onDocumentMouseMove}
        onDocumentMouseLeave={onDocumentMouseLeave}
        onCustomerBadgeClick={onCustomerBadgeClick}
        onSummaryClick={onSummaryClick}
        onFullTextClick={onFullTextClick}
      />
    )
  }
  return (
    <GroupNode
      node={node}
      level={level}
      expandedKeys={expandedKeys}
      focusedKey={focusedKey}
      searchTerm={searchTerm}
      selectedDocumentId={selectedDocumentId}
      filenameMode={filenameMode}
      onGroupClick={onGroupClick}
      onDocumentClick={onDocumentClick}
      onDocumentMouseEnter={onDocumentMouseEnter}
      onDocumentMouseMove={onDocumentMouseMove}
      onDocumentMouseLeave={onDocumentMouseLeave}
      onCustomerBadgeClick={onCustomerBadgeClick}
      onSummaryClick={onSummaryClick}
      onFullTextClick={onFullTextClick}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// DocumentExplorerTree: 메인 트리 컴포넌트
// ─────────────────────────────────────────────────────────────

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
  thumbnailEnabled = true,
  filenameMode = 'display',
  onFilenameModeChange,
  onSummaryClick,
  onFullTextClick,
}) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickedIdRef = useRef<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // 호버 프리뷰 상태 (useRef로 동기적 업데이트 + forceUpdate로 즉시 렌더링)
  // useState는 비동기적이라 빠른 마우스 이동 시 batching으로 누락될 수 있음
  const [, forceHoverUpdate] = useReducer(x => x + 1, 0)
  const hoverStateRef = useRef<{
    document: Document
    position: { x: number; y: number }
  } | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

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
    needsScroll,
    clearNeedsScroll,
  } = useDocumentExplorerKeyboard({
    nodes,
    expandedKeys,
    selectedDocumentId,
    onToggleNode,
    onDocumentClick,
    onDocumentDoubleClick,
  })

  // 키보드 탐색 시에만 포커스 요소로 스크롤 (마우스 클릭은 스크롤 불필요)
  useEffect(() => {
    if (!needsScroll || !focusedKey || !treeContainerRef.current) return

    const focusedElement = treeContainerRef.current.querySelector(
      `[data-node-key="${focusedKey}"]`
    ) as HTMLElement

    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    clearNeedsScroll()
  }, [needsScroll, focusedKey, clearNeedsScroll])

  // rAF / leave 타이머 cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  // 문서 클릭 핸들러 (싱글/더블클릭 구분)
  const handleDocumentClick = useCallback(
    (doc: Document, e: React.MouseEvent, nodeKey?: string) => {
      e.stopPropagation()
      const docId = doc._id || doc.id || ''

      // 클릭 후에도 hover 유지 (리렌더링으로 인한 mouseLeave 방지)
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }
      forceHoverUpdate()

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

  // 문서 호버 핸들러 (mouseEnter 시 즉시 표시)
  const handleDocumentMouseEnter = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      // Leave 타이머 취소 (문서 간 이동 시 깜빡임 방지)
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      // ref로 동기적 업데이트 + React batching으로 자연스럽게 렌더
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }
      forceHoverUpdate()
    },
    []
  )

  // 마우스 이동 시 위치 업데이트 (rAF throttle로 초당 ~60회 렌더 → 1회)
  const handleDocumentMouseMove = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      // mouseEnter가 안 들어올 수 있으므로, mouseMove에서도 leave 타이머 취소
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }

      const needsImmediate = !hoverStateRef.current
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }

      if (needsImmediate) {
        // hover 상태가 없으면 즉시 표시 (mouseEnter가 누락된 경우)
        forceHoverUpdate()
      } else if (!rafRef.current) {
        // 위치만 업데이트: rAF로 throttle (프레임당 최대 1회 렌더)
        rafRef.current = requestAnimationFrame(() => {
          forceHoverUpdate()
          rafRef.current = null
        })
      }
    },
    []
  )

  // mouseLeave 디바운싱 (문서 간 빠른 이동 시 경쟁 조건 방지)
  const handleDocumentMouseLeave = useCallback(() => {
    // 이미 타이머가 있으면 취소
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
    }
    // 30ms 후에 null로 설정 (다른 문서로 Enter하면 취소됨)
    leaveTimerRef.current = setTimeout(() => {
      hoverStateRef.current = null
      forceHoverUpdate()
      leaveTimerRef.current = null
    }, 30)
  }, [])

  // 최근 본 문서 정렬 (훅은 조건부 리턴 전에 호출해야 함)
  const sortedRecentDocuments = useMemo(() => {
    if (recentDocuments.length === 0) return []

    const sorted = [...recentDocuments].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name': {
          const nameA = filenameMode === 'display' && a.displayName
            ? a.displayName.toLowerCase()
            : DocumentStatusService.extractOriginalFilename(a).toLowerCase()
          const nameB = filenameMode === 'display' && b.displayName
            ? b.displayName.toLowerCase()
            : DocumentStatusService.extractOriginalFilename(b).toLowerCase()
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
  }, [recentDocuments, sortBy, sortDirection, filenameMode])

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
              decorative
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
              const customerName = doc.customer_relation?.customer_name
              const customerType = doc.customer_relation?.customer_type
              const documentDate = getDocumentDate(doc)
              const filename = DocumentStatusService.extractFilename(doc)
              const { showName, altName } = getDocName(doc, filenameMode)
              const fileExt = doc.mimeType ? DocumentUtils.getFileExtension(doc.mimeType) : ''
              const fileSize = DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(doc))

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

                  {/* 문서명: filenameMode에 따라 별칭/원본 전환 */}
                  <span className="doc-explorer-tree__doc-name" title={altName || showName}>
                    {highlightText(showName, searchTerm)}
                  </span>

                  {/* 파일 타입 */}
                  <span className="doc-explorer-tree__doc-ext" title={fileExt || '-'}>
                    {fileExt || '-'}
                  </span>

                  {/* 파일 크기 */}
                  <span className="doc-explorer-tree__doc-size">
                    {fileSize}
                  </span>

                  {/* 고객명 + 개인/법인 아이콘 */}
                  <span
                    className={`doc-explorer-tree__doc-customer${customerName ? ' doc-explorer-tree__doc-customer--clickable' : ' doc-explorer-tree__doc-customer--empty'}`}
                    title={customerName ? `${customerName} 문서만 보기` : '-'}
                    onClick={customerName ? (e) => handleCustomerBadgeClick(e, customerName) : undefined}
                  >
                    {customerName && (
                      <span className="doc-explorer-tree__customer-type-icon">
                        {customerType === '법인' ? (
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                            <circle cx="10" cy="7" r="3" />
                            <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                          </svg>
                        )}
                      </span>
                    )}
                    {customerName ? highlightText(customerName, searchTerm) : '-'}
                  </span>

                  {/* 날짜/시간 */}
                  <span
                    className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
                    title={documentDate || '-'}
                  >
                    {documentDate ? formatDateTime(documentDate) : '-'}
                  </span>

                  {/* 유형 배지 */}
                  <span className={`doc-explorer-tree__badge doc-explorer-tree__badge--${(doc.badgeType || 'BIN').toLowerCase()}`}>
                    {doc.badgeType || 'BIN'}
                  </span>

                  {/* 액션 버튼 */}
                  <span className="doc-explorer-tree__doc-actions">
                    <button
                      type="button"
                      className="doc-explorer-tree__action-btn"
                      title="요약 보기"
                      onClick={(e) => { e.stopPropagation(); onSummaryClick?.(doc) }}
                    >
                      <SummaryIcon width={13} height={13} />
                    </button>
                    <button
                      type="button"
                      className="doc-explorer-tree__action-btn"
                      title="전체 텍스트 보기"
                      onClick={(e) => { e.stopPropagation(); onFullTextClick?.(doc) }}
                    >
                      <DocumentIcon width={13} height={13} />
                    </button>
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
        {nodes.map((node) => (
          <TreeNode
            key={node.key}
            node={node}
            level={0}
            expandedKeys={expandedKeys}
            focusedKey={focusedKey}
            searchTerm={searchTerm}
            selectedDocumentId={selectedDocumentId}
            filenameMode={filenameMode}
            onGroupClick={handleGroupClick}
            onDocumentClick={handleDocumentClick}
            onDocumentMouseEnter={handleDocumentMouseEnter}
            onDocumentMouseMove={handleDocumentMouseMove}
            onDocumentMouseLeave={handleDocumentMouseLeave}
            onCustomerBadgeClick={handleCustomerBadgeClick}
            onSummaryClick={onSummaryClick}
            onFullTextClick={onFullTextClick}
          />
        ))}
      </div>
      {/* 호버 시 썸네일 표시 (thumbnailEnabled일 때만) */}
      {thumbnailEnabled && (
        <HoverPreview
          document={hoverStateRef.current?.document ?? null}
          position={hoverStateRef.current?.position ?? null}
        />
      )}
    </>
  )
}
