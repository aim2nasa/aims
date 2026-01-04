/**
 * useDocumentExplorerTree Hook
 * @description 문서 탐색기 트리 상태 및 데이터 관리
 */

import { useState, useMemo, useCallback } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentTreeData } from '../types/documentExplorer'
import { buildTree, collectAllKeys, filterDocuments } from '../utils/treeBuilders'

export interface UseDocumentExplorerTreeOptions {
  documents: Document[]
  isLoading?: boolean
}

export interface UseDocumentExplorerTreeResult {
  // State
  groupBy: DocumentGroupBy
  expandedKeys: Set<string>
  searchTerm: string
  selectedDocumentId: string | null
  isAllExpanded: boolean
  treeData: DocumentTreeData
  filteredDocuments: Document[]
  isLoading: boolean

  // Actions
  setGroupBy: (groupBy: DocumentGroupBy) => void
  toggleNode: (key: string) => void
  toggleExpandAll: () => void
  setSearchTerm: (term: string) => void
  setSelectedDocumentId: (id: string | null) => void
  expandToDocument: (documentId: string) => void
}

/**
 * 문서 탐색기 트리 훅
 */
export function useDocumentExplorerTree({
  documents,
  isLoading = false,
}: UseDocumentExplorerTreeOptions): UseDocumentExplorerTreeResult {
  // Persisted states (F5 새로고침 후에도 유지)
  const [groupBy, setGroupByState] = usePersistedState<DocumentGroupBy>(
    'doc-explorer-group-by',
    'customer'
  )
  const [expandedKeys, setExpandedKeys] = usePersistedState<string[]>(
    'doc-explorer-expanded',
    []
  )
  const [searchTerm, setSearchTermState] = usePersistedState<string>(
    'doc-explorer-search',
    ''
  )

  // Non-persisted states
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isAllExpanded, setIsAllExpanded] = useState(false)

  // 검색어로 필터링된 문서
  const filteredDocuments = useMemo(() => {
    return filterDocuments(documents, searchTerm)
  }, [documents, searchTerm])

  // 트리 데이터 빌드
  const treeData = useMemo(() => {
    return buildTree(filteredDocuments, groupBy)
  }, [filteredDocuments, groupBy])

  // expandedKeys를 Set으로 변환
  const expandedKeysSet = useMemo(() => new Set(expandedKeys), [expandedKeys])

  // 분류 기준 변경 (확장 상태 초기화)
  const setGroupBy = useCallback(
    (newGroupBy: DocumentGroupBy) => {
      setGroupByState(newGroupBy)
      setExpandedKeys([])
      setIsAllExpanded(false)
    },
    [setGroupByState, setExpandedKeys]
  )

  // 노드 토글
  const toggleNode = useCallback(
    (key: string) => {
      setExpandedKeys((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(key)) {
          newSet.delete(key)
        } else {
          newSet.add(key)
        }
        return Array.from(newSet)
      })
    },
    [setExpandedKeys]
  )

  // 모두 펼치기/접기
  const toggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setExpandedKeys([])
      setIsAllExpanded(false)
    } else {
      const allKeys = collectAllKeys(treeData.nodes)
      setExpandedKeys(allKeys)
      setIsAllExpanded(true)
    }
  }, [isAllExpanded, treeData.nodes, setExpandedKeys])

  // 검색어 설정
  const setSearchTerm = useCallback(
    (term: string) => {
      setSearchTermState(term)
    },
    [setSearchTermState]
  )

  // 특정 문서까지 트리 펼치기
  const expandToDocument = useCallback(
    (documentId: string) => {
      // 해당 문서가 속한 그룹을 찾아서 펼치기
      const findParentKeys = (nodes: typeof treeData.nodes, targetId: string, path: string[] = []): string[] | null => {
        for (const node of nodes) {
          if (node.type === 'document' && node.document?._id === targetId) {
            return path
          }
          if (node.children) {
            const result = findParentKeys(node.children, targetId, [...path, node.key])
            if (result) return result
          }
        }
        return null
      }

      const parentKeys = findParentKeys(treeData.nodes, documentId)
      if (parentKeys) {
        setExpandedKeys((prev) => {
          const newSet = new Set(prev)
          parentKeys.forEach((key) => newSet.add(key))
          return Array.from(newSet)
        })
        setSelectedDocumentId(documentId)
      }
    },
    [treeData.nodes, setExpandedKeys]
  )

  return {
    // State
    groupBy,
    expandedKeys: expandedKeysSet,
    searchTerm,
    selectedDocumentId,
    isAllExpanded,
    treeData,
    filteredDocuments,
    isLoading,

    // Actions
    setGroupBy,
    toggleNode,
    toggleExpandAll,
    setSearchTerm,
    setSelectedDocumentId,
    expandToDocument,
  }
}
