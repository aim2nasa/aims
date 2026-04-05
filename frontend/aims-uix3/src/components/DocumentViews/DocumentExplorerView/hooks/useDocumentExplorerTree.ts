/**
 * useDocumentExplorerTree Hook
 * @description 문서 탐색기 트리 상태 및 데이터 관리
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, DocumentTreeData, DocumentTreeNode, QuickFilterType, DateRange } from '../types/documentExplorer'
import { buildTree, filterDocuments, sortTreeNodes, getDocumentDate } from '../utils/treeBuilders'

export interface UseDocumentExplorerTreeOptions {
  documents: Document[]
  isLoading?: boolean
  /** 🍎 파일명 표시 모드 (별칭/원본) - 정렬에 반영 */
  filenameMode?: 'display' | 'original'
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
  sortBy: DocumentSortBy
  sortDirection: SortDirection
  quickFilter: QuickFilterType
  customerFilter: string | null
  dateFilter: Date | null
  dateRange: DateRange | null
  thumbnailEnabled: boolean

  // Actions
  setGroupBy: (groupBy: DocumentGroupBy) => void
  toggleNode: (key: string) => void
  toggleExpandAll: () => void
  toggleExpandCustomer: (customerNodeKey: string) => void
  setSearchTerm: (term: string) => void
  setSelectedDocumentId: (id: string | null) => void
  expandToDocument: (documentId: string) => void
  expandToLevel: (maxLevel: number) => void
  setSortBy: (sortBy: DocumentSortBy) => void
  toggleSortDirection: () => void
  setQuickFilter: (filter: QuickFilterType) => void
  setCustomerFilter: (customerName: string | null) => void
  clearAllFilters: () => void
  jumpToDate: (date: Date) => boolean
  getAvailableDates: () => Date[]
  clearDateFilter: () => void
  setDateRange: (range: DateRange | null) => void
  setThumbnailEnabled: (enabled: boolean) => void
}

/**
 * 문서 탐색기 트리 훅
 */
export function useDocumentExplorerTree({
  documents,
  isLoading = false,
  filenameMode = 'display',
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
  const [sortBy, setSortByState] = usePersistedState<DocumentSortBy>(
    'doc-explorer-sort-by',
    'date'
  )
  const [sortDirection, setSortDirectionState] = usePersistedState<SortDirection>(
    'doc-explorer-sort-direction',
    'desc'
  )
  const [quickFilter, setQuickFilterState] = usePersistedState<QuickFilterType>(
    'doc-explorer-quick-filter',
    'none'
  )
  const [thumbnailEnabled, setThumbnailEnabledState] = usePersistedState<boolean>(
    'doc-explorer-thumbnail-enabled',
    true // 기본값: 활성화
  )
  // Non-persisted states
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isAllExpanded, setIsAllExpanded] = useState(false)
  const [customerFilter, setCustomerFilterState] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<Date | null>(null)
  const [dateRange, setDateRangeState] = useState<DateRange | null>(null)

  // 빠른 필터 적용
  const applyQuickFilter = useCallback(
    (docs: Document[], filter: QuickFilterType): Document[] => {
      if (filter === 'none') return docs

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      switch (filter) {
        case 'today':
          return docs.filter((doc) => {
            const dateStr = getDocumentDate(doc)
            if (!dateStr) return false
            const date = new Date(dateStr)
            return date >= todayStart
          })
        default:
          return docs
      }
    },
    []
  )

  // 고객 필터 적용
  const applyCustomerFilter = useCallback(
    (docs: Document[], customerName: string | null): Document[] => {
      if (!customerName) return docs
      return docs.filter((doc) => doc.customer_relation?.customer_name === customerName)
    },
    []
  )

  // 날짜 필터 적용 (캘린더에서 선택한 특정 날짜)
  const applyDateFilter = useCallback(
    (docs: Document[], filterDate: Date | null): Document[] => {
      if (!filterDate) return docs
      const targetDateStr = `${filterDate.getFullYear()}-${String(filterDate.getMonth() + 1).padStart(2, '0')}-${String(filterDate.getDate()).padStart(2, '0')}`
      return docs.filter((doc) => {
        const dateStr = getDocumentDate(doc)
        if (!dateStr) return false
        const date = new Date(dateStr)
        const docDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        return docDateStr === targetDateStr
      })
    },
    []
  )

  // 날짜 범위 필터 적용 (캘린더에서 선택한 시작일~끝날)
  const applyDateRangeFilter = useCallback(
    (docs: Document[], range: DateRange | null): Document[] => {
      if (!range) return docs
      const startTime = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).getTime()
      // 끝날의 다음 날 0시 (끝날 포함)
      const endTime = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() + 1).getTime()
      return docs.filter((doc) => {
        const dateStr = getDocumentDate(doc)
        if (!dateStr) return false
        const docTime = new Date(dateStr).getTime()
        return docTime >= startTime && docTime < endTime
      })
    },
    []
  )

  // 검색어 + 빠른 필터 + 고객 필터 + 날짜 필터 + 날짜 범위 필터로 필터링된 문서
  const filteredDocuments = useMemo(() => {
    let result = filterDocuments(documents, searchTerm)
    result = applyQuickFilter(result, quickFilter)
    result = applyCustomerFilter(result, customerFilter)
    result = applyDateFilter(result, dateFilter)
    result = applyDateRangeFilter(result, dateRange)
    return result
  }, [documents, searchTerm, quickFilter, customerFilter, dateFilter, dateRange, applyQuickFilter, applyCustomerFilter, applyDateFilter, applyDateRangeFilter])

  // 트리 데이터 빌드 (정렬 적용)
  // 검색어가 있을 때도 그룹핑 유지, 매칭 그룹을 상단에 표시
  const treeData = useMemo(() => {
    const tree = buildTree(filteredDocuments, groupBy)

    // 검색어가 있을 때 매칭 그룹을 상단으로 정렬
    let sortedNodes = tree.nodes
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      sortedNodes = [...tree.nodes].sort((a, b) => {
        // 그룹명이 검색어와 매칭되면 상단으로
        const aMatch = a.label.toLowerCase().includes(term) ? 1 : 0
        const bMatch = b.label.toLowerCase().includes(term) ? 1 : 0
        return bMatch - aMatch
      })
    }

    // 문서 노드에 정렬 적용
    sortedNodes = sortTreeNodes(sortedNodes, sortBy, sortDirection, filenameMode)
    return { ...tree, nodes: sortedNodes }
  }, [filteredDocuments, groupBy, sortBy, sortDirection, searchTerm, filenameMode])

  // expandedKeys를 Set으로 변환
  const expandedKeysSet = useMemo(() => new Set(expandedKeys), [expandedKeys])

  // 검색어 변경 시 매칭 문서가 있는 모든 폴더를 자동 펼치기
  useEffect(() => {
    if (!searchTerm || filteredDocuments.length === 0) return

    // 매칭 문서가 있는 모든 부모 폴더 키를 수집
    const collectAllParentKeys = (nodes: DocumentTreeNode[]): string[] => {
      const keys: string[] = []
      for (const node of nodes) {
        if (node.type === 'document') continue
        if (!node.children || node.children.length === 0) continue

        // 하위에 문서 노드가 있는지 (직접 또는 재귀적으로)
        const hasDocumentDescendant = (n: DocumentTreeNode): boolean => {
          if (n.type === 'document') return true
          return n.children?.some(hasDocumentDescendant) ?? false
        }

        if (hasDocumentDescendant(node)) {
          keys.push(node.key)
          // 자식 폴더도 재귀 수집
          keys.push(...collectAllParentKeys(node.children))
        }
      }
      return keys
    }

    const allParentKeys = collectAllParentKeys(treeData.nodes)
    if (allParentKeys.length > 0) {
      setExpandedKeys(allParentKeys)
    }

    // 첫 번째 문서 선택
    const firstDoc = filteredDocuments[0]
    const firstDocId = firstDoc._id || firstDoc.id
    if (firstDocId) {
      setSelectedDocumentId(firstDocId)
    }
  }, [searchTerm, filteredDocuments, treeData.nodes, setExpandedKeys])

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

  // 특정 고객의 하위 폴더만 펼치기/접기 (소분류까지, 파일은 숨김)
  const toggleExpandCustomer = useCallback(
    (customerNodeKey: string) => {
      const customerNode = treeData.nodes.find(n => n.key === customerNodeKey)
      if (!customerNode || !customerNode.children) return

      // 고객 키 + 대분류 키 수집
      const targetKeys: string[] = [customerNodeKey]
      customerNode.children.forEach(child => {
        if (child.type !== 'document') {
          targetKeys.push(child.key)
        }
      })

      setExpandedKeys(prev => {
        const newSet = new Set(prev)
        // 대분류 중 하나라도 펼쳐져 있으면 → 접기, 아니면 → 펼치기
        const childKeys = targetKeys.slice(1)
        const isExpanded = childKeys.length > 0 && childKeys.some(k => newSet.has(k))

        if (isExpanded) {
          targetKeys.forEach(k => newSet.delete(k))
        } else {
          targetKeys.forEach(k => newSet.add(k))
        }
        return Array.from(newSet)
      })
    },
    [treeData.nodes, setExpandedKeys]
  )

  // 모두 펼치기/접기 — 소분류(level 2)까지만 펼침, 파일은 숨김
  const toggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setExpandedKeys([])
      setIsAllExpanded(false)
    } else {
      // level 0=고객, 1=대분류, 2=소분류 → level 1까지 펼치면 소분류 폴더가 보임
      const keys: string[] = []
      function collectToLevel(nodeList: DocumentTreeNode[], level: number) {
        if (level > 1) return
        nodeList.forEach(node => {
          if (node.type !== 'document') {
            keys.push(node.key)
            if (node.children) collectToLevel(node.children, level + 1)
          }
        })
      }
      collectToLevel(treeData.nodes, 0)
      setExpandedKeys(keys)
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

  // 빠른 필터 설정
  const setQuickFilter = useCallback(
    (filter: QuickFilterType) => {
      setQuickFilterState(filter)
      // 필터 변경 시 고객 필터, 날짜 필터, 날짜 범위 해제
      if (filter !== 'none') {
        setCustomerFilterState(null)
        setDateFilter(null)
        setDateRangeState(null)
      }
    },
    [setQuickFilterState]
  )

  // 고객 필터 설정
  const setCustomerFilter = useCallback(
    (customerName: string | null) => {
      setCustomerFilterState(customerName)
      // 고객 필터 설정 시 빠른 필터 해제
      if (customerName) {
        setQuickFilterState('none')
      }
    },
    [setQuickFilterState]
  )

  // 모든 필터 초기화
  const clearAllFilters = useCallback(() => {
    setQuickFilterState('none')
    setCustomerFilterState(null)
    setDateFilter(null)
    setDateRangeState(null)
    setSearchTermState('')
  }, [setQuickFilterState, setSearchTermState])

  // 날짜 필터 해제
  const clearDateFilter = useCallback(() => {
    setDateFilter(null)
  }, [])

  // 날짜 범위 설정 (dateFilter와 상호 배타)
  const setDateRange = useCallback(
    (range: DateRange | null) => {
      setDateRangeState(range)
      if (range) {
        setDateFilter(null)
        setQuickFilterState('none')
        setCustomerFilterState(null)
        setSearchTermState('')
      }
    },
    [setQuickFilterState, setSearchTermState]
  )

  // 썸네일 활성화/비활성화
  const setThumbnailEnabled = useCallback(
    (enabled: boolean) => {
      setThumbnailEnabledState(enabled)
    },
    [setThumbnailEnabledState]
  )

  // 특정 레벨까지 트리 펼치기 (0=고객, 1=대분류, 2=소분류)
  const expandToLevel = useCallback(
    (maxLevel: number) => {
      const keys: string[] = []
      function collect(nodeList: DocumentTreeNode[], level: number) {
        if (level > maxLevel) return
        nodeList.forEach(node => {
          if (node.type !== 'document') {
            keys.push(node.key)
            if (node.children) collect(node.children, level + 1)
          }
        })
      }
      collect(treeData.nodes, 0)
      setExpandedKeys(keys)
      setIsAllExpanded(false)
    },
    [treeData.nodes, setExpandedKeys]
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

  // 문서가 있는 날짜 목록 반환
  const getAvailableDates = useCallback((): Date[] => {
    const dateSet = new Set<string>()
    documents.forEach((doc) => {
      const dateStr = getDocumentDate(doc)
      if (dateStr) {
        // YYYY-MM-DD 형식으로 변환
        const date = new Date(dateStr)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        dateSet.add(key)
      }
    })
    return Array.from(dateSet)
      .map((str) => new Date(str))
      .sort((a, b) => b.getTime() - a.getTime()) // 최신순 정렬
  }, [documents])

  // 특정 날짜로 점프 (날짜 필터 설정)
  const jumpToDate = useCallback(
    (targetDate: Date): boolean => {
      // 해당 날짜의 문서가 있는지 확인
      const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

      const hasMatchingDocs = documents.some((doc) => {
        const dateStr = getDocumentDate(doc)
        if (!dateStr) return false
        const date = new Date(dateStr)
        const docDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        return docDateStr === targetDateStr
      })

      if (!hasMatchingDocs) {
        return false
      }

      // 다른 필터들 해제하고 날짜 필터 설정
      setQuickFilterState('none')
      setCustomerFilterState(null)
      setSearchTermState('')
      setDateFilter(targetDate)
      setDateRangeState(null)

      return true
    },
    [documents, setQuickFilterState, setSearchTermState]
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
    sortBy,
    sortDirection,
    quickFilter,
    customerFilter,
    dateFilter,
    dateRange,
    thumbnailEnabled,

    // Actions
    setGroupBy,
    toggleNode,
    toggleExpandAll,
    toggleExpandCustomer,
    setSearchTerm,
    setSelectedDocumentId,
    expandToDocument,
    expandToLevel,
    setSortBy,
    toggleSortDirection,
    setQuickFilter,
    setCustomerFilter,
    clearAllFilters,
    jumpToDate,
    getAvailableDates,
    clearDateFilter,
    setDateRange,
    setThumbnailEnabled,
  }
}
