/**
 * DocumentExplorerTree
 * @description 문서 탐색기 트리 렌더링 컴포넌트
 */

import React, { useCallback, useRef } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { Document } from '@/types/documentStatus'
import type { DocumentTreeNode, DocumentGroupBy } from './types/documentExplorer'

export interface DocumentExplorerTreeProps {
  nodes: DocumentTreeNode[]
  expandedKeys: Set<string>
  selectedDocumentId: string | null
  groupBy: DocumentGroupBy
  onToggleNode: (key: string) => void
  onDocumentClick: (document: Document) => void
  onDocumentDoubleClick: (document: Document) => void
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
}) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickedIdRef = useRef<string | null>(null)

  // 문서 클릭 핸들러 (싱글/더블클릭 구분)
  const handleDocumentClick = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      e.stopPropagation()
      const docId = doc._id || doc.id || ''

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
    [onDocumentClick, onDocumentDoubleClick]
  )

  // 키보드 접근성
  const handleKeyDown = useCallback(
    (doc: Document, e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onDocumentClick(doc)
      }
    },
    [onDocumentClick]
  )

  // 그룹 노드 렌더링
  const renderGroupNode = (node: DocumentTreeNode, level: number): React.ReactNode => {
    const isExpanded = expandedKeys.has(node.key)
    const hasChildren = node.children && node.children.length > 0
    const isSpecial = node.metadata?.isSpecial

    return (
      <div key={node.key} className="doc-explorer-tree__group">
        <div
          className={`doc-explorer-tree__group-header doc-explorer-tree__group-header--level-${level}${isSpecial ? ' doc-explorer-tree__group-header--special' : ''}`}
          onClick={() => onToggleNode(node.key)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggleNode(node.key)
            }
          }}
          aria-expanded={isExpanded}
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
          <div className="doc-explorer-tree__children">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  // 문서 노드 렌더링
  const renderDocumentNode = (node: DocumentTreeNode, level: number): React.ReactNode => {
    const doc = node.document
    if (!doc) return null

    const docId = doc._id || doc.id || ''
    const isSelected = selectedDocumentId === docId
    const badgeType = doc.badgeType || 'BIN'

    return (
      <div
        key={node.key}
        className={`doc-explorer-tree__document doc-explorer-tree__document--level-${level} ${isSelected ? 'doc-explorer-tree__document--selected' : ''}`}
        onClick={(e) => handleDocumentClick(doc, e)}
        onKeyDown={(e) => handleKeyDown(doc, e)}
        role="button"
        tabIndex={0}
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

        {/* 배지 */}
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

  return (
    <div className="doc-explorer-tree">
      {nodes.map((node) => renderNode(node, 0))}
    </div>
  )
}
