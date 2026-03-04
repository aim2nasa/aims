/**
 * DocumentExplorerView Component
 * @since 1.0.0
 *
 * 문서 탐색기 View 컴포넌트
 * 윈도우 탐색기 스타일의 트리 구조로 문서를 분류별로 탐색
 *
 * 데이터 소스: explorer-tree API (서버사이드 집계)
 * - 초성 미선택: 고객 요약 (~30KB)
 * - 초성 선택: 고객 + 해당 초성 문서 전체 (limit 없음)
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { usePersistedState } from '@/hooks/usePersistedState'
import { DocumentExplorerToolbar } from './DocumentExplorerToolbar'
import { DocumentExplorerTree } from './DocumentExplorerTree'
import { InitialFilterBar } from '@/shared/ui/InitialFilterBar'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from './types/documentExplorer'
import type { InitialType, DocumentTreeNode, DocumentTreeData } from './types/documentExplorer'
import { useDocumentExplorerTree } from './hooks/useDocumentExplorerTree'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { DocumentSummaryModal } from '../DocumentStatusView/components/DocumentSummaryModal'
import { DocumentFullTextModal } from '../DocumentStatusView/components/DocumentFullTextModal'
import type { Document } from '@/types/documentStatus'
import './DocumentExplorerView.toolbar.css';
import './DocumentExplorerView.tree.css';
import './DocumentExplorerView.features.css';
import './DocumentExplorerView.datejump.css';
import './DocumentExplorerView.mobile.css';

export interface DocumentExplorerViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 (RightPane 프리뷰) */
  onDocumentClick?: (documentId: string) => void
  /** 문서 더블클릭 핸들러 (모달 프리뷰) */
  onDocumentDoubleClick?: (document: Document) => void
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string) => void
}

/** explorer-tree API 응답 타입 */
interface ExplorerTreeData {
  customers: Array<{ customerId: string; name: string; initial: string; docCount: number; latestUpload: string | null }>
  totalCustomers: number
  totalDocuments: number
  initials: Record<string, number>
  documents?: Document[]
}

/**
 * 문서 탐색기 내부 컨텐츠 컴포넌트
 */
const DocumentExplorerContent: React.FC<{
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onCustomerClick?: (customerId: string) => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
}> = ({ onDocumentClick, onDocumentDoubleClick, onCustomerClick, selectedInitial, onSelectedInitialChange, initialType, onInitialTypeChange }) => {

  // 파일명 표시 모드 (별칭/원본) - localStorage 동기화
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  const handleFilenameModeChange = useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
  }, [])

  // === explorer-tree API 데이터 (DocumentStatusProvider 대체) ===
  const [explorerData, setExplorerData] = useState<ExplorerTreeData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchExplorerTree = useCallback(async (initial: string | null) => {
    setIsLoading(true)
    try {
      const data = await DocumentStatusService.getExplorerTree('excludeMyFiles', initial || undefined)
      setExplorerData(data)
    } catch (error) {
      console.error('Explorer tree fetch failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // selectedInitial 변경 시 재조회
  useEffect(() => { fetchExplorerTree(selectedInitial) }, [fetchExplorerTree, selectedInitial])

  // 이벤트 기반 새로고침 — ref로 최신 selectedInitial 참조 (Race Condition 방지)
  const selectedInitialRef = useRef(selectedInitial)
  useEffect(() => { selectedInitialRef.current = selectedInitial }, [selectedInitial])

  useEffect(() => {
    const handleRefresh = () => { void fetchExplorerTree(selectedInitialRef.current) }
    window.addEventListener('documentLinked', handleRefresh)
    window.addEventListener('refresh-document-library', handleRefresh)
    return () => {
      window.removeEventListener('documentLinked', handleRefresh)
      window.removeEventListener('refresh-document-library', handleRefresh)
    }
  }, [fetchExplorerTree])

  // 초성 카운트: explorer-tree 응답에서 추출 (별도 API 불필요)
  const serverInitialCounts = useMemo(() => {
    const map = new Map<string, number>()
    KOREAN_INITIALS.forEach(i => map.set(i, 0))
    ALPHABET_INITIALS.forEach(i => map.set(i, 0))
    NUMBER_INITIALS.forEach(i => map.set(i, 0))
    if (explorerData?.initials) {
      Object.entries(explorerData.initials).forEach(([k, v]) => map.set(k, v))
    }
    return map
  }, [explorerData?.initials])

  // 초성 선택 시: explorer-tree에서 받은 documents를 useDocumentExplorerTree에 전달
  // 초성 미선택 시: documents는 빈 배열 (고객 요약 트리를 별도 빌드)
  const documents = useMemo(() => {
    if (!selectedInitial || !explorerData?.documents) return []
    return explorerData.documents
  }, [selectedInitial, explorerData?.documents])

  const {
    groupBy,
    expandedKeys,
    searchTerm,
    selectedDocumentId,
    isAllExpanded,
    treeData: docTreeData,
    minTagCount,
    sortBy,
    sortDirection,
    quickFilter,
    recentDocuments,
    customerFilter,
    dateFilter,
    thumbnailEnabled,
    setGroupBy,
    toggleNode,
    toggleExpandAll,
    setSearchTerm,
    setSelectedDocumentId,
    setMinTagCount,
    setSortBy,
    setQuickFilter,
    addToRecentDocuments,
    setCustomerFilter,
    jumpToDate,
    getAvailableDates,
    clearDateFilter,
    setThumbnailEnabled,
  } = useDocumentExplorerTree({
    documents,
    isLoading,
    filenameMode,
  })

  // 초성 미선택 시: 고객 요약 트리 빌드 (서버 데이터 그대로 렌더링)
  // initialType(탭)에 따라 해당 카테고리 고객만 필터링
  const customerSummaryTree = useMemo<DocumentTreeData | null>(() => {
    if (selectedInitial || !explorerData?.customers) return null

    let customers = explorerData.customers

    // 탭(한글/영문/숫자)에 따라 고객 필터링
    const koreanSet: Set<string> = new Set(KOREAN_INITIALS)
    const alphabetSet: Set<string> = new Set(ALPHABET_INITIALS)
    const numberSet: Set<string> = new Set(NUMBER_INITIALS)

    if (initialType === 'korean') {
      customers = customers.filter(c => koreanSet.has(c.initial))
    } else if (initialType === 'alphabet') {
      customers = customers.filter(c => alphabetSet.has(c.initial))
    } else if (initialType === 'number') {
      customers = customers.filter(c => numberSet.has(c.initial))
    }

    // 검색어로 고객명 필터
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      customers = customers.filter(c => c.name.toLowerCase().includes(lower))
    }

    const nodes: DocumentTreeNode[] = customers.map(c => ({
      key: `customer-${c.customerId}`,
      label: c.name,
      type: 'group' as const,
      icon: /^[가-힣]/.test(c.name) ? 'person.fill' : 'building.2.fill',
      count: c.docCount,
      children: [],
      metadata: {
        customerId: c.customerId,
        customerType: (/^[가-힣]/.test(c.name) ? 'personal' : 'corporate') as 'personal' | 'corporate',
      }
    }))

    const totalDocs = customers.reduce((sum, c) => sum + c.docCount, 0)

    return {
      nodes,
      totalDocuments: totalDocs,
      groupStats: { groupCount: customers.length }
    }
  }, [selectedInitial, explorerData?.customers, searchTerm, initialType])

  // 최종 트리 데이터: 초성 선택 여부에 따라 분기
  const treeData = selectedInitial
    ? docTreeData
    : (customerSummaryTree || { nodes: [], totalDocuments: 0, groupStats: { groupCount: 0 } })

  // 요약 모드: 고객 키 → 초성 매핑 (폴더 클릭 시 초성 전환용)
  const customerInitialMap = useMemo(() => {
    const map = new Map<string, string>()
    if (explorerData?.customers) {
      explorerData.customers.forEach(c => {
        map.set(`customer-${c.customerId}`, c.initial)
      })
    }
    return map
  }, [explorerData?.customers])

  // 요약 모드 고객 폴더 클릭 후, 초성 전환 완료 시 자동 펼침할 키
  const pendingExpandKeyRef = useRef<string | null>(null)

  // 초성 전환 후 데이터 로드 완료 → 대기 중인 폴더 자동 펼침
  useEffect(() => {
    if (!selectedInitial || !pendingExpandKeyRef.current) return
    if (isLoading) return // 아직 로드 중

    const key = pendingExpandKeyRef.current
    pendingExpandKeyRef.current = null

    // 해당 고객 폴더가 트리에 있으면 펼치기
    const nodeExists = treeData.nodes.some(n => n.key === key)
    if (nodeExists) {
      toggleNode(key)
    }
  }, [selectedInitial, isLoading, treeData.nodes, toggleNode])

  // onToggleNode 래핑: 요약 모드에서 고객 폴더 클릭 시 초성 전환
  const handleToggleNode = useCallback(
    (key: string) => {
      // 요약 모드(초성 미선택)이고, 고객 노드이면 초성으로 전환
      if (!selectedInitial && customerInitialMap.has(key)) {
        const initial = customerInitialMap.get(key)!
        pendingExpandKeyRef.current = key
        // 검색어 클리어: 검색 자동 펼침 effect와의 충돌 방지
        if (searchTerm) {
          setSearchTerm('')
        }
        onSelectedInitialChange(initial)
        return
      }
      // 그 외: 기존 토글 동작
      toggleNode(key)
    },
    [selectedInitial, customerInitialMap, toggleNode, onSelectedInitialChange, searchTerm, setSearchTerm]
  )

  // 문서 클릭 핸들러
  const handleDocumentClick = useCallback(
    (doc: Document) => {
      const docId = doc._id || doc.id || ''
      setSelectedDocumentId(docId)
      addToRecentDocuments(docId)
      onDocumentClick?.(docId)
    },
    [onDocumentClick, setSelectedDocumentId, addToRecentDocuments]
  )

  // 고객명 클릭 핸들러 (해당 고객 문서만 필터)
  const handleCustomerClick = useCallback(
    (customerName: string) => {
      setCustomerFilter(customerName)
    },
    [setCustomerFilter]
  )

  // 문서 더블클릭 핸들러
  const handleDocumentDoubleClick = useCallback(
    (doc: Document) => {
      onDocumentDoubleClick?.(doc)
    },
    [onDocumentDoubleClick]
  )

  // 요약/전체텍스트 모달 상태
  const [summaryDoc, setSummaryDoc] = useState<Document | null>(null)
  const [fullTextDoc, setFullTextDoc] = useState<Document | null>(null)

  const handleSummaryClick = useCallback((doc: Document) => setSummaryDoc(doc), [])
  const handleFullTextClick = useCallback((doc: Document) => setFullTextDoc(doc), [])

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    void fetchExplorerTree(selectedInitial)
  }, [fetchExplorerTree, selectedInitial])

  return (
    <div className="doc-explorer-content">
      {/* 툴바 */}
      <DocumentExplorerToolbar
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isAllExpanded={isAllExpanded}
        onToggleExpandAll={toggleExpandAll}
        onRefresh={handleRefresh}
        totalDocuments={treeData.totalDocuments}
        groupCount={treeData.groupStats.groupCount}
        isLoading={isLoading}
        minTagCount={minTagCount}
        onMinTagCountChange={setMinTagCount}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortByChange={setSortBy}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        customerFilter={customerFilter}
        onCustomerFilterClear={() => setCustomerFilter(null)}
        onJumpToDate={jumpToDate}
        getAvailableDates={getAvailableDates}
        dateFilter={dateFilter}
        onDateFilterClear={clearDateFilter}
        thumbnailEnabled={thumbnailEnabled}
        onThumbnailEnabledChange={setThumbnailEnabled}
        filenameMode={filenameMode}
        onFilenameModeChange={handleFilenameModeChange}
      />

      {/* 초성 필터 바 - 공용 컴포넌트 사용 */}
      <InitialFilterBar
        initialType={initialType}
        onInitialTypeChange={onInitialTypeChange}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={onSelectedInitialChange}
        initialCounts={serverInitialCounts}
        countLabel="건"
        targetLabel="고객"
      />

      {/* 트리 뷰 */}
      <div className="doc-explorer-tree-container">
        {isLoading && !explorerData ? (
          <div className="doc-explorer-loading">
            <div className="doc-explorer-loading__spinner" />
            <p>문서를 불러오는 중...</p>
          </div>
        ) : (
          <DocumentExplorerTree
            nodes={treeData.nodes}
            expandedKeys={expandedKeys}
            selectedDocumentId={selectedDocumentId}
            groupBy={groupBy}
            onToggleNode={handleToggleNode}
            onDocumentClick={handleDocumentClick}
            onDocumentDoubleClick={handleDocumentDoubleClick}
            onCustomerClick={handleCustomerClick}
            recentDocuments={recentDocuments}
            sortBy={sortBy}
            sortDirection={sortDirection}
            searchTerm={searchTerm}
            thumbnailEnabled={thumbnailEnabled}
            filenameMode={filenameMode}
            onFilenameModeChange={handleFilenameModeChange}
            onSummaryClick={handleSummaryClick}
            onFullTextClick={handleFullTextClick}
          />
        )}
      </div>

      {/* 요약 모달 */}
      <DocumentSummaryModal
        visible={summaryDoc !== null}
        onClose={() => setSummaryDoc(null)}
        document={summaryDoc}
      />

      {/* 전체 텍스트 모달 */}
      <DocumentFullTextModal
        visible={fullTextDoc !== null}
        onClose={() => setFullTextDoc(null)}
        document={fullTextDoc}
      />
    </div>
  )
}

/**
 * 문서 탐색기 View
 * DocumentStatusProvider 제거 — explorer-tree API로 직접 데이터 조회
 */
export const DocumentExplorerView: React.FC<DocumentExplorerViewProps> = ({
  visible,
  onClose,
  onDocumentClick,
  onDocumentDoubleClick,
  onCustomerClick,
}) => {
  const breadcrumbItems = getBreadcrumbItems('documents-explorer')
  const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('doc-explorer-selected-initial', null)
  const [initialType, setInitialType] = usePersistedState<InitialType>('doc-explorer-initial-type', 'korean')

  // 탭 전환 시 선택된 초성 초기화
  const handleInitialTypeChange = useCallback((type: InitialType) => {
    setInitialType(type)
    setSelectedInitial(null)
  }, [setInitialType, setSelectedInitial])

  return (
    <CenterPaneView
      visible={visible}
      title="문서 탐색기"
      breadcrumbItems={breadcrumbItems}
      onClose={onClose}
    >
      <DocumentExplorerContent
        onDocumentClick={onDocumentClick}
        onDocumentDoubleClick={onDocumentDoubleClick}
        onCustomerClick={onCustomerClick}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={setSelectedInitial}
        initialType={initialType}
        onInitialTypeChange={handleInitialTypeChange}
      />
    </CenterPaneView>
  )
}

export default DocumentExplorerView
