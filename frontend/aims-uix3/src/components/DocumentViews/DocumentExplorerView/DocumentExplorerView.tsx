/**
 * DocumentExplorerView Component
 * @since 1.0.0
 *
 * 문서 탐색기 View 컴포넌트
 * 윈도우 탐색기 스타일의 트리 구조로 문서를 분류별로 탐색
 */

import React, { useCallback } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { DocumentStatusProvider } from '@/providers/DocumentStatusProvider'
import { useDocumentStatusContext } from '@/contexts/DocumentStatusContext'
import { DocumentExplorerToolbar } from './DocumentExplorerToolbar'
import { DocumentExplorerTree } from './DocumentExplorerTree'
import { InitialFilterBar } from './InitialFilterBar'
import { useDocumentExplorerTree } from './hooks/useDocumentExplorerTree'
import type { Document } from '@/types/documentStatus'
import './DocumentExplorerView.css'

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
}> = ({ onDocumentClick, onDocumentDoubleClick, onCustomerClick }) => {
  const { state, actions } = useDocumentStatusContext()

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
    selectedInitial,
    initialCustomerCounts,
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
    setSelectedInitial,
  } = useDocumentExplorerTree({
    documents: state.documents,
    isLoading: state.isLoading,
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
      />

      {/* 초성 필터 바 */}
      <InitialFilterBar
        initialType={initialType}
        onInitialTypeChange={setInitialType}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={setSelectedInitial}
        initialCustomerCounts={initialCustomerCounts}
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

  return (
    <CenterPaneView
      visible={visible}
      title="문서 탐색기"
      breadcrumbItems={breadcrumbItems}
      onClose={onClose}
    >
      <DocumentStatusProvider searchQuery="" fileScope="excludeMyFiles">
        <DocumentExplorerContent
          onDocumentClick={onDocumentClick}
          onDocumentDoubleClick={onDocumentDoubleClick}
          onCustomerClick={onCustomerClick}
        />
      </DocumentStatusProvider>
    </CenterPaneView>
  )
}

export default DocumentExplorerView
