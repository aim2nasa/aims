/**
 * DocumentExplorerView Component
 * @since 1.0.0
 *
 * 문서 탐색기 View 컴포넌트
 * 윈도우 탐색기 스타일의 트리 구조로 문서를 분류별로 탐색
 */

import React, { useCallback, useState } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { DocumentStatusProvider } from '@/providers/DocumentStatusProvider'
import { useDocumentStatusContext } from '@/contexts/DocumentStatusContext'
import { usePersistedState } from '@/hooks/usePersistedState'
import { DocumentExplorerToolbar } from './DocumentExplorerToolbar'
import { DocumentExplorerTree } from './DocumentExplorerTree'
import { InitialFilterBar } from '@/shared/ui/InitialFilterBar'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from './types/documentExplorer'
import { useDocumentExplorerTree } from './hooks/useDocumentExplorerTree'
import { DocumentStatusService } from '@/services/DocumentStatusService'
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

/**
 * 문서 탐색기 내부 컨텐츠 컴포넌트
 */
const DocumentExplorerContent: React.FC<{
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onCustomerClick?: (customerId: string) => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
}> = ({ onDocumentClick, onDocumentDoubleClick, onCustomerClick, selectedInitial, onSelectedInitialChange }) => {
  const { state, actions } = useDocumentStatusContext()

  // 🍎 파일명 표시 모드 (별칭/원본) - localStorage 동기화
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  const handleFilenameModeChange = useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
  }, [])

  // 서버사이드 초성 카운트 (DB 전체 대상)
  const [serverInitialCounts, setServerInitialCounts] = React.useState<Map<string, number>>(new Map())

  const fetchInitialCounts = React.useCallback(async () => {
    const counts = await DocumentStatusService.getDocumentInitials('excludeMyFiles')
    const map = new Map<string, number>()
    KOREAN_INITIALS.forEach(i => map.set(i, 0))
    ALPHABET_INITIALS.forEach(i => map.set(i, 0))
    NUMBER_INITIALS.forEach(i => map.set(i, 0))
    Object.entries(counts).forEach(([k, v]) => map.set(k, v as number))
    setServerInitialCounts(map)
  }, [])

  React.useEffect(() => { fetchInitialCounts() }, [fetchInitialCounts])

  React.useEffect(() => {
    const handleRefresh = () => { void fetchInitialCounts() }
    window.addEventListener('documentLinked', handleRefresh)
    window.addEventListener('refresh-document-library', handleRefresh)
    return () => {
      window.removeEventListener('documentLinked', handleRefresh)
      window.removeEventListener('refresh-document-library', handleRefresh)
    }
  }, [fetchInitialCounts])

  const {
    groupBy,
    expandedKeys,
    searchTerm,
    selectedDocumentId,
    isAllExpanded,
    treeData,
    isLoading,
    minTagCount,
    sortBy,
    sortDirection,
    quickFilter,
    recentDocuments,
    customerFilter,
    dateFilter,
    thumbnailEnabled,
    initialType,
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
    setInitialType,
  } = useDocumentExplorerTree({
    documents: state.documents,
    isLoading: state.isLoading,
    filenameMode,
  })

  // 문서 클릭 핸들러
  const handleDocumentClick = useCallback(
    (doc: Document) => {
      const docId = doc._id || doc.id || ''
      setSelectedDocumentId(docId)
      addToRecentDocuments(docId) // 최근 본 문서에 추가
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

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    actions.refreshDocuments()
  }, [actions])

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
        onInitialTypeChange={setInitialType}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={onSelectedInitialChange}
        initialCounts={serverInitialCounts}
        countLabel="건"
        targetLabel="고객"
      />

      {/* 트리 뷰 */}
      <div className="doc-explorer-tree-container">
        {isLoading && state.documents.length === 0 ? (
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
            onToggleNode={toggleNode}
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
          />
        )}
      </div>
    </div>
  )
}

/**
 * 문서 탐색기 View
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

  return (
    <CenterPaneView
      visible={visible}
      title="문서 탐색기"
      breadcrumbItems={breadcrumbItems}
      onClose={onClose}
    >
      <DocumentStatusProvider searchQuery="" fileScope="excludeMyFiles" initialItemsPerPage={500} initialFilter={selectedInitial}>
        <DocumentExplorerContent
          onDocumentClick={onDocumentClick}
          onDocumentDoubleClick={onDocumentDoubleClick}
          onCustomerClick={onCustomerClick}
          selectedInitial={selectedInitial}
          onSelectedInitialChange={setSelectedInitial}
        />
      </DocumentStatusProvider>
    </CenterPaneView>
  )
}

export default DocumentExplorerView
