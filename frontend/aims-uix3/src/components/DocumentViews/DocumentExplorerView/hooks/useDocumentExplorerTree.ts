/**
 * useDocumentExplorerTree Hook
 * @description 문서 탐색기 트리 상태 및 데이터 관리
 */

import { useState, useMemo, useCallback } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, DocumentTreeData } from '../types/documentExplorer'
import { buildTree, collectAllKeys, filterDocuments, sortTreeNodes } from '../utils/treeBuilders'

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
  minTagCount: number
  sortBy: DocumentSortBy
  sortDirection: SortDirection

  // Actions
  setGroupBy: (groupBy: DocumentGroupBy) => void
  toggleNode: (key: string) => void
  toggleExpandAll: () => void
  setSearchTerm: (term: string) => void
  setSelectedDocumentId: (id: string | null) => void
  expandToDocument: (documentId: string) => void
  setMinTagCount: (value: number) => void
  setSortBy: (sortBy: DocumentSortBy) => void
  toggleSortDirection: () => void
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
  const [minTagCount, setMinTagCountState] = usePersistedState<number>(
    'doc-explorer-min-tag-count',
    1
  )
  const [sortBy, setSortByState] = usePersistedState<DocumentSortBy>(
    'doc-explorer-sort-by',
    'date'
  )
  const [sortDirection, setSortDirectionState] = usePersistedState<SortDirection>(
    'doc-explorer-sort-direction',
    'desc'
  )

  // Non-persisted states
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isAllExpanded, setIsAllExpanded] = useState(false)

  // 검색어로 필터링된 문서
  const filteredDocuments = useMemo(() => {
    return filterDocuments(documents, searchTerm)
  }, [documents, searchTerm])

  // 트리 데이터 빌드 (정렬 적용)
  const treeData = useMemo(() => {
    const tree = buildTree(filteredDocuments, groupBy, minTagCount)
    // 문서 노드에 정렬 적용
    const sortedNodes = sortTreeNodes(tree.nodes, sortBy, sortDirection)
    return { ...tree, nodes: sortedNodes }
  }, [filteredDocuments, groupBy, minTagCount, sortBy, sortDirection])

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

  // 기타 분류 최소 기준 설정
  const setMinTagCount = useCallback(
    (value: number) => {
      setMinTagCountState(value)
    },
    [setMinTagCountState]
  )

  // 정렬 기준 설정
  const setSortBy = useCallback(
    (newSortBy: DocumentSortBy) => {
      if (newSortBy === sortBy) {
        // 같은 기준 클릭 시 방향 토글
        setSortDirectionState((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortByState(newSortBy)
        // 새 기준 선택 시 기본 방향: 날짜는 desc(최신순), 나머지는 asc
        setSortDirectionState(newSortBy === 'date' ? 'desc' : 'asc')
      }
    },
    [sortBy, setSortByState, setSortDirectionState]
  )

  // 정렬 방향 토글
  const toggleSortDirection = useCallback(() => {
    setSortDirectionState((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }, [setSortDirectionState])

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
    minTagCount,
    sortBy,
    sortDirection,

    // Actions
    setGroupBy,
    toggleNode,
    toggleExpandAll,
    setSearchTerm,
    setSelectedDocumentId,
    expandToDocument,
    setMinTagCount,
    setSortBy,
    toggleSortDirection,
  }
}
