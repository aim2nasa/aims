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
import { DocumentExplorerToolbar, type ExplorerSearchMode, type EditModeType } from './DocumentExplorerToolbar'
import { DocumentExplorerTree } from './DocumentExplorerTree'
import { InitialFilterBar } from '@/shared/ui/InitialFilterBar'
import { ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui/ContextMenu'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from './types/documentExplorer'
import type { InitialType, DocumentTreeNode, DocumentTreeData } from './types/documentExplorer'
import { useDocumentExplorerTree } from './hooks/useDocumentExplorerTree'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { DocumentService } from '@/services/DocumentService'
import { documentTypesService } from '@/services/documentTypesService'
import { DocumentSummaryModal } from '../DocumentStatusView/components/DocumentSummaryModal'
import { DocumentFullTextModal } from '../DocumentStatusView/components/DocumentFullTextModal'
import { DocumentNotesModal } from '../DocumentStatusView/components/DocumentNotesModal'
import { DocumentTypePickerModal } from '@/shared/ui/DocumentTypeCell/DocumentTypePickerModal'
import { DocumentContentSearchModal } from '@/features/customer/components/DocumentContentSearchModal/DocumentContentSearchModal'
import DownloadHelper from '../../../utils/downloadHelper'
import { errorReporter } from '@/shared/lib/errorReporter'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem } from '@/entities/search'
import { formatDate, formatDateTime } from '@/shared/lib/timeUtils'
import { formatFileSize } from '@/shared/lib/fileValidation/constants'
import { SortIndicator } from '@/shared/ui/SortIndicator'
import { Tooltip } from '@/shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { Document } from '@/types/documentStatus'
import './DocumentExplorerView.toolbar.css';
import './DocumentExplorerView.tree.css';
import './DocumentExplorerView.features.css';
import './DocumentExplorerView.datejump.css';
import './DocumentExplorerView.mobile.css';
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { api } from '@/shared/lib/api'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'

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
  /** 고객 문서 분류함 열기 */
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
}

/** explorer-tree API 응답 타입 */
interface SearchDocument {
  _id: string
  displayName: string | null
  originalName: string
  uploadedAt: string | null
  fileSize: number | null
  mimeType: string | null
  customerId: string | null
  customerName: string | null
  document_type: string | null
  badgeType: string | null
}

interface ExplorerTreeData {
  customers: Array<{ customerId: string; name: string; initial: string; docCount: number; latestUpload: string | null; customerType?: string | null; matchedDocCount?: number; nameMatched?: boolean }>
  totalCustomers: number
  totalDocuments: number
  initials: Record<string, number>
  documents?: Document[]
  searchDocuments?: SearchDocument[]
}

/**
 * 문서 탐색기 내부 컨텐츠 컴포넌트
 */
const DocumentExplorerContent: React.FC<{
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onCustomerClick?: (customerId: string) => void
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
}> = ({ onDocumentClick, onDocumentDoubleClick, onCustomerClick, onCustomerExplorerClick, selectedInitial, onSelectedInitialChange, initialType, onInitialTypeChange }) => {

  // 호버 액션: 문서 삭제/이름변경
  const documentActions = useDocumentActions()
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null)

  const handleRenameClick = useCallback((doc: Document) => {
    const docId = doc._id || doc.id
    if (docId) setRenamingDocumentId(docId)
  }, [])

  const handleRenameConfirm = useCallback(async (documentId: string, newName: string) => {
    setRenamingDocumentId(null)
    await documentActions.renameDocument(documentId, newName)
  }, [documentActions])

  const handleRenameCancel = useCallback(() => {
    setRenamingDocumentId(null)
  }, [])

  const handleHoverDeleteClick = useCallback((doc: Document) => {
    const docId = doc._id || doc.id
    const docName = doc.displayName || DocumentStatusService.extractOriginalFilename(doc)
    if (docId) documentActions.deleteDocument(docId, docName)
  }, [documentActions])

  // === 편집 모드 (일괄 삭제 / AI 별칭 생성) ===
  const { showConfirm, showAlert } = useAppleConfirm()
  const [editMode, setEditMode] = useState<EditModeType>('none')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [isGeneratingAliases, setIsGeneratingAliases] = useState(false)
  const [forceRegenerateAlias, setForceRegenerateAlias] = useState(false)

  // 편집 모드 변경 핸들러
  const handleEditModeChange = useCallback((mode: EditModeType) => {
    setEditMode(mode)
    setSelectedDocumentIds(new Set())
    setForceRegenerateAlias(false)
  }, [])

  // 문서 선택/해제 토글
  const handleSelectDocument = useCallback((documentId: string) => {
    setSelectedDocumentIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(documentId)) {
        newSet.delete(documentId)
      } else {
        newSet.add(documentId)
      }
      return newSet
    })
  }, [])

  // 일괄 삭제 실행
  const handleBatchDelete = useCallback(async () => {
    if (selectedDocumentIds.size === 0) return
    await documentActions.deleteDocuments(selectedDocumentIds)
  }, [selectedDocumentIds, documentActions])

  // AI 별칭 일괄 생성 실행
  const handleGenerateAliases = useCallback(async () => {
    if (selectedDocumentIds.size === 0) return
    setIsGeneratingAliases(true)
    try {
      const data = await api.post<{ summary?: { completed: number; skipped: number; failed: number } }>('/api/batch-display-names', {
        document_ids: Array.from(selectedDocumentIds),
        force_regenerate: forceRegenerateAlias,
      })
      if (data.summary) {
        const { completed, skipped, failed } = data.summary
        await showAlert({
          title: '별칭 생성 완료',
          message: `${completed}건 완료, ${skipped}건 스킵, ${failed}건 실패`,
          confirmText: '확인',
          showCancel: false,
          iconType: completed > 0 ? 'success' : 'info',
        })
      }
      window.location.reload()
    } catch (err) {
      console.error('별칭 생성 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentExplorerView.handleGenerateAliases' })
      await showAlert({
        title: '오류',
        message: '별칭 생성 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error',
      })
    } finally {
      setIsGeneratingAliases(false)
    }
  }, [selectedDocumentIds, forceRegenerateAlias, showAlert])

  // 고객 노드 우클릭 → 컨텍스트 메뉴
  const customerContextMenu = useContextMenu()
  const [contextMenuCustomer, setContextMenuCustomer] = useState<{ id: string; name: string; customerType?: '개인' | '법인' } | null>(null)

  const handleCustomerContextMenu = useCallback((customerId: string, customerName: string, event: React.MouseEvent, customerType?: '개인' | '법인') => {
    setContextMenuCustomer({ id: customerId, name: customerName, customerType })
    customerContextMenu.open(event)
  }, [customerContextMenu])

  // 고객 미니 카드: "상세" 버튼 → RightPane 고객 상세
  const handleCustomerDetailClick = useCallback((customerId: string, _customerName: string) => {
    onCustomerClick?.(customerId)
  }, [onCustomerClick])

  // 고객 범위 검색 (특정 고객의 문서만 검색)
  const [scopeCustomer, setScopeCustomer] = useState<{ id: string; name: string; type: '개인' | '법인' } | null>(null)

  // 문서 내용 검색 모달 상태
  const [contentSearchModal, setContentSearchModal] = useState<{ isOpen: boolean; customerId: string; customerName: string; customerType: '개인' | '법인' }>({
    isOpen: false, customerId: '', customerName: '', customerType: '개인'
  })

  // === 내용 검색 / AI 질문 상태 (컨텍스트 메뉴보다 먼저 선언) ===
  const [explorerSearchMode, setExplorerSearchMode] = usePersistedState<ExplorerSearchMode>('doc-explorer-search-mode', 'filename')

  // 고객 컨텍스트 메뉴 — 뷰 네비게이션 핸들러
  const navigateToView = useCallback((view: string, customerId: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    url.searchParams.set('customerId', customerId)
    url.searchParams.delete('tab')
    url.searchParams.delete('documentId')
    window.history.pushState({}, '', url.toString())
    // App.tsx의 popstate 핸들러가 뷰 전환 처리
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  // 고객 컨텍스트 메뉴 섹션
  const customerContextMenuSections: ContextMenuSection[] = useMemo(() => {
    if (!contextMenuCustomer) return []
    return [
      {
        id: 'view',
        items: [
          {
            id: 'customer-mini',
            label: '고객요약보기',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
            onClick: () => {
              onCustomerClick?.(contextMenuCustomer.id)
            }
          },
          {
            id: 'full-detail',
            label: '고객상세보기',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            ),
            onClick: () => {
              navigateToView('customers-full-detail', contextMenuCustomer.id)
            }
          }
        ]
      },
      {
        id: 'document',
        items: [
          {
            id: 'document-explorer',
            label: '문서 분류함 열기',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            ),
            onClick: () => {
              navigateToView('customer-document-explorer', contextMenuCustomer.id)
            }
          },
          {
            id: 'content-search',
            label: '이 고객 문서 검색',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            ),
            onClick: () => {
              setScopeCustomer({
                id: contextMenuCustomer.id,
                name: contextMenuCustomer.name,
                type: contextMenuCustomer.customerType || '개인'
              })
              // 내용 검색 모드로 전환 (파일명 모드일 때만)
              setExplorerSearchMode(prev => prev === 'filename' ? 'content' : prev)
            }
          }
        ]
      }
    ]
  }, [contextMenuCustomer, onCustomerClick, navigateToView, setExplorerSearchMode])

  // 파일명 표시 모드 (별칭/원본) - localStorage 동기화
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  const handleFilenameModeChange = useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
  }, [])

  // === 내용 검색 / AI 질문 결과 상태 ===
  const [contentSearchResults, setContentSearchResults] = useState<SearchResultItem[]>([])
  const [contentSearchAnswer, setContentSearchAnswer] = useState<string | null>(null)
  const [isContentSearching, setIsContentSearching] = useState(false)
  const [contentSearchError, setContentSearchError] = useState<string | null>(null)
  const [lastContentSearchMode, setLastContentSearchMode] = useState<ExplorerSearchMode | null>(null)
  const contentSearchAbortRef = useRef<AbortController | null>(null)

  // === 내용 검색 결과 정렬 상태 ===
  type ContentSortField = 'filetype' | 'filename' | 'customer' | 'date' | 'size' | 'score' | null
  type ContentSortOrder = 'asc' | 'desc'
  const [contentSortField, setContentSortField] = useState<ContentSortField>(null)
  const [contentSortOrder, setContentSortOrder] = useState<ContentSortOrder>('asc')

  // === 페이지네이션 상태 ===
  const CONTENT_PAGE_SIZE = 20
  const [contentPage, setContentPage] = useState(1)

  // 정렬 핸들러
  const handleContentSort = useCallback((field: Exclude<ContentSortField, null>) => {
    if (contentSortField === field) {
      setContentSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setContentSortField(field)
      setContentSortOrder(field === 'score' || field === 'date' ? 'desc' : 'asc')
    }
  }, [contentSortField])

  // 파일 확장자 → 표시 형식 라벨 (정렬용)
  const getFileTypeLabel = useCallback((item: SearchResultItem) => {
    const name = SearchService.getOriginalName(item)
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'pdf') return 'PDF'
    if (ext === 'hwp' || ext === 'hwpx') return 'HWP'
    if (ext === 'xlsx' || ext === 'xls') return 'XLS'
    if (ext === 'docx' || ext === 'doc') return 'DOC'
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'IMG'
    return ext.toUpperCase().slice(0, 3) || 'ETC'
  }, [])

  // 정렬된 결과
  const sortedContentSearchResults = useMemo(() => {
    if (!contentSortField || !contentSearchResults.length) return contentSearchResults

    return [...contentSearchResults].sort((a, b) => {
      let cmp = 0
      if (contentSortField === 'filetype') {
        cmp = getFileTypeLabel(a).localeCompare(getFileTypeLabel(b))
      } else if (contentSortField === 'filename') {
        const nameA = (a.displayName || SearchService.getOriginalName(a)).toLowerCase()
        const nameB = (b.displayName || SearchService.getOriginalName(b)).toLowerCase()
        cmp = nameA.localeCompare(nameB, 'ko-KR')
      } else if (contentSortField === 'customer') {
        const custA = a.customer_relation?.customer_name || ''
        const custB = b.customer_relation?.customer_name || ''
        if (!custA && custB) return 1
        if (custA && !custB) return -1
        cmp = custA.localeCompare(custB, 'ko-KR')
      } else if (contentSortField === 'date') {
        const dateA = ('upload' in a && a.upload?.uploaded_at) ? new Date(a.upload.uploaded_at).getTime() : 0
        const dateB = ('upload' in b && b.upload?.uploaded_at) ? new Date(b.upload.uploaded_at).getTime() : 0
        cmp = dateA - dateB
      } else if (contentSortField === 'size') {
        const sizeA = ('meta' in a && a.meta?.size_bytes) || 0
        const sizeB = ('meta' in b && b.meta?.size_bytes) || 0
        cmp = sizeA - sizeB
      } else if (contentSortField === 'score') {
        const scoreA = ('score' in a ? (a as { score?: number }).score : 0) || 0
        const scoreB = ('score' in b ? (b as { score?: number }).score : 0) || 0
        cmp = scoreA - scoreB
      }
      return contentSortOrder === 'asc' ? cmp : -cmp
    })
  }, [contentSearchResults, contentSortField, contentSortOrder, getFileTypeLabel])

  // 페이지네이션 적용된 결과
  const totalContentPages = Math.max(1, Math.ceil(sortedContentSearchResults.length / CONTENT_PAGE_SIZE))
  const paginatedContentResults = useMemo(() => {
    const start = (contentPage - 1) * CONTENT_PAGE_SIZE
    return sortedContentSearchResults.slice(start, start + CONTENT_PAGE_SIZE)
  }, [sortedContentSearchResults, contentPage])

  // 검색 모드 변경 시 정렬 초기화 + 페이지 리셋
  useEffect(() => {
    setContentPage(1)
    if (lastContentSearchMode === 'semantic') {
      setContentSortField('score')
      setContentSortOrder('desc')
    } else if (lastContentSearchMode) {
      setContentSortField('filename')
      setContentSortOrder('asc')
    }
  }, [lastContentSearchMode])

  // 정렬 변경 시 페이지 리셋
  useEffect(() => {
    setContentPage(1)
  }, [contentSortField, contentSortOrder])

  // 내용 검색 실행 핸들러
  const handleContentSearch = useCallback(async (query: string) => {
    if (!query.trim()) return

    // 이전 요청 취소
    if (contentSearchAbortRef.current) {
      contentSearchAbortRef.current.abort()
    }
    const controller = new AbortController()
    contentSearchAbortRef.current = controller

    setIsContentSearching(true)
    setContentSearchError(null)
    setContentSearchResults([])
    setContentSearchAnswer(null)

    try {
      const searchQuery = {
        query: query.trim(),
        search_mode: explorerSearchMode === 'semantic' ? 'semantic' as const : 'keyword' as const,
        ...(explorerSearchMode === 'content' && { mode: 'AND' as const }),
        ...(scopeCustomer && { customer_id: scopeCustomer.id }),
      }
      const response = await SearchService.searchDocuments(searchQuery, controller.signal)
      setContentSearchResults(response.search_results)
      setContentSearchAnswer(response.answer || null)
      setLastContentSearchMode(explorerSearchMode)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('[DocumentExplorerView] 내용 검색 오류:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentExplorerView.handleContentSearch' })
      setContentSearchError('검색 중 오류가 발생했습니다.')
    } finally {
      if (!controller.signal.aborted) {
        setIsContentSearching(false)
      }
      if (contentSearchAbortRef.current === controller) {
        contentSearchAbortRef.current = null
      }
    }
  }, [explorerSearchMode, scopeCustomer])

  // 검색 모드 전환 시 결과 초기화
  const handleExplorerSearchModeChange = useCallback((mode: ExplorerSearchMode) => {
    setExplorerSearchMode(mode)
    setContentSearchResults([])
    setContentSearchAnswer(null)
    setContentSearchError(null)
    setLastContentSearchMode(null)
  }, [setExplorerSearchMode])

  // 내용 검색 결과 닫기
  const handleCloseContentSearch = useCallback(() => {
    setContentSearchResults([])
    setContentSearchAnswer(null)
    setContentSearchError(null)
    setLastContentSearchMode(null)
    if (contentSearchAbortRef.current) {
      contentSearchAbortRef.current.abort()
      contentSearchAbortRef.current = null
    }
    setIsContentSearching(false)
  }, [])

  // cleanup
  useEffect(() => {
    return () => {
      if (contentSearchAbortRef.current) {
        contentSearchAbortRef.current.abort()
      }
    }
  }, [])

  // === explorer-tree API 데이터 (DocumentStatusProvider 대체) ===
  const [explorerData, setExplorerData] = useState<ExplorerTreeData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // 날짜/기간 필터 활성 시 'all'로 전체 문서 fetch 모드
  const [filterFetchMode, setFilterFetchMode] = useState<'none' | 'all'>('none')

  const fetchExplorerTree = useCallback(async (initial: string | null | 'all', search?: string) => {
    setIsLoading(true)
    try {
      const data = await DocumentStatusService.getExplorerTree('excludeMyFiles', initial || undefined, search || undefined)
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

  // 초성 선택 시 OR 날짜/기간 필터 활성(filterFetchMode=all) 시: documents 사용
  const documents = useMemo(() => {
    if (!explorerData?.documents) return []
    if (selectedInitial || filterFetchMode === 'all') return explorerData.documents
    return []
  }, [selectedInitial, explorerData?.documents, filterFetchMode])

  const {
    groupBy,
    expandedKeys,
    searchTerm,
    selectedDocumentId,
    isAllExpanded,
    treeData: docTreeData,
    sortBy,
    sortDirection,
    quickFilter,
    recentDocuments,
    customerFilter,
    dateFilter,
    dateRange,
    thumbnailEnabled,
    setGroupBy,
    toggleNode,
    toggleExpandAll,
    toggleExpandCustomer,
    setSearchTerm,
    setSelectedDocumentId,
    setSortBy,
    setQuickFilter,
    addToRecentDocuments,
    setCustomerFilter,
    jumpToDate,
    getAvailableDates,
    clearDateFilter,
    setDateRange,
    setThumbnailEnabled,
    expandToLevel,
    expandToDocument,
  } = useDocumentExplorerTree({
    documents,
    isLoading,
    filenameMode,
  })

  // quickFilter/dateFilter 변경 시: 초성 미선택이면 전체 문서 로드 ('all')
  useEffect(() => {
    if (selectedInitial) {
      if (filterFetchMode !== 'none') setFilterFetchMode('none')
      return
    }
    const needsAll = quickFilter !== 'none' || dateFilter !== null || dateRange !== null
    if (needsAll && filterFetchMode !== 'all') {
      setFilterFetchMode('all')
      void fetchExplorerTree('all')
    } else if (!needsAll && filterFetchMode === 'all') {
      setFilterFetchMode('none')
      void fetchExplorerTree(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, dateFilter, dateRange, selectedInitial])

  // 요약 모드 + 통합 검색 칩: 서버 검색 (고객명+파일명) with debounce 300ms
  const serverSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSearchTermRef = useRef<string>('')
  useEffect(() => {
    if (selectedInitial || explorerSearchMode !== 'filename') return
    if (serverSearchTimerRef.current) clearTimeout(serverSearchTimerRef.current)

    const trimmed = searchTerm?.trim() || ''
    const prevTrimmed = prevSearchTermRef.current

    if (!trimmed) {
      // 이전에 검색어가 있었으면 전체 목록 복원, 아니면 skip (초기 로드와 중복 방지)
      if (prevTrimmed) {
        fetchExplorerTree(null)
      }
      prevSearchTermRef.current = ''
      return
    }

    prevSearchTermRef.current = trimmed
    serverSearchTimerRef.current = setTimeout(() => {
      fetchExplorerTree(null, trimmed)
    }, 300)

    return () => {
      if (serverSearchTimerRef.current) clearTimeout(serverSearchTimerRef.current)
    }
  }, [searchTerm, selectedInitial, explorerSearchMode, fetchExplorerTree])

  // 초성 미선택 시: 고객 요약 트리 빌드 (서버 데이터 그대로 렌더링)
  // initialType(탭)에 따라 해당 카테고리 고객만 필터링
  const customerSummaryTree = useMemo<DocumentTreeData | null>(() => {
    if (selectedInitial || filterFetchMode === 'all' || !explorerData?.customers) return null

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

    // 검색어로 고객명 필터 (서버 검색이 아닌 경우에만 클라이언트 필터 적용)
    // explorerSearchMode === 'filename'이면 서버에서 이미 필터됨 (고객명+파일명 통합 검색)
    if (searchTerm && explorerSearchMode !== 'filename') {
      const lower = searchTerm.toLowerCase()
      customers = customers.filter(c => c.name.toLowerCase().includes(lower))
    }

    // searchDocuments를 고객별로 그룹핑
    const searchDocsByCustomer = new Map<string, SearchDocument[]>()
    if (explorerData.searchDocuments) {
      explorerData.searchDocuments.forEach(doc => {
        if (!doc.customerId) return
        const existing = searchDocsByCustomer.get(doc.customerId) || []
        existing.push(doc)
        searchDocsByCustomer.set(doc.customerId, existing)
      })
    }

    const nodes: DocumentTreeNode[] = customers.map(c => {
      const matchedDocs = searchDocsByCustomer.get(c.customerId) || []
      const totalMatchCount = c.matchedDocCount || matchedDocs.length
      const children: DocumentTreeNode[] = matchedDocs.map(doc => ({
        key: `search-doc-${doc._id}`,
        label: doc.displayName || doc.originalName,
        type: 'document' as const,
        icon: 'doc.fill',
        document: {
          _id: doc._id,
          originalName: doc.originalName,
          displayName: doc.displayName,
          uploadedAt: doc.uploadedAt,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          document_type: doc.document_type,
          badgeType: doc.badgeType,
          customer_relation: {
            customer_id: doc.customerId || '',
            customer_name: doc.customerName || '',
          },
        } as unknown as Document,
      }))
      // 인라인 표시(최대 5건)보다 전체 매칭 건수가 많으면 "더 보기" 노드 추가
      if (totalMatchCount > matchedDocs.length) {
        children.push({
          key: `more-docs-${c.customerId}`,
          label: `${totalMatchCount - matchedDocs.length}건 더 보기...`,
          type: 'subgroup' as const,
          icon: 'ellipsis',
          metadata: {
            customerId: c.customerId,
            isSpecial: true,
          },
        })
      }

      return {
        key: `customer-${c.customerId}`,
        label: c.name,
        type: 'group' as const,
        icon: c.customerType === '법인' ? 'building.2.fill' : 'person.fill',
        count: totalMatchCount > 0 ? totalMatchCount : c.docCount,
        children,
        metadata: {
          customerId: c.customerId,
          customerType: (c.customerType === '법인' ? 'corporate' : 'personal') as 'personal' | 'corporate',
          nameMatched: c.nameMatched || false,
        }
      }
    })

    const totalDocs = customers.reduce((sum, c) => sum + c.docCount, 0)

    return {
      nodes,
      totalDocuments: totalDocs,
      groupStats: { groupCount: customers.length }
    }
  }, [selectedInitial, filterFetchMode, explorerData?.customers, explorerData?.searchDocuments, searchTerm, initialType, explorerSearchMode])

  // searchDocuments가 있으면 매칭 문서가 있는 고객을 자동 확장
  useEffect(() => {
    if (!customerSummaryTree || !explorerData?.searchDocuments?.length) return
    const keysToExpand = customerSummaryTree.nodes
      .filter(n => n.children && n.children.length > 0)
      .map(n => n.key)
      .filter(key => !expandedKeys.has(key))
    if (keysToExpand.length > 0) {
      keysToExpand.forEach(key => toggleNode(key))
    }
  }, [explorerData?.searchDocuments]) // eslint-disable-line react-hooks/exhaustive-deps

  // 최종 트리 데이터: 초성 선택 OR 날짜/기간 필터 활성 시 → docTreeData, 그 외 → 고객 요약
  const treeData = (selectedInitial || filterFetchMode === 'all')
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

  // 검색 결과에서 고객 클릭 시 검색어 보존 (복귀용)
  const savedSearchTermRef = useRef<string | null>(null)

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

  // 초성 선택 시 자동 펼침: 고객(level 0) + 대분류(level 1)까지 펼침
  // 설계사가 초성 클릭 즉시 모든 고객의 분류 구조를 한눈에 볼 수 있도록
  const lastAutoExpandedInitialRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedInitial || isLoading) return
    if (docTreeData.nodes.length === 0) return
    if (lastAutoExpandedInitialRef.current === selectedInitial) return

    lastAutoExpandedInitialRef.current = selectedInitial
    // level 0 = 고객까지만 펼침 (대분류는 접힌 상태 + 인라인 배지로 요약 표시)
    expandToLevel(0)
  }, [selectedInitial, isLoading, docTreeData.nodes.length, expandToLevel])

  // 초성 해제 시 ref 리셋
  useEffect(() => {
    if (!selectedInitial) {
      lastAutoExpandedInitialRef.current = null
    }
  }, [selectedInitial])

  // onToggleNode 래핑: 요약 모드에서 고객 폴더 클릭 시 초성 전환
  const handleToggleNode = useCallback(
    (key: string) => {
      // 요약 모드(초성 미선택)이고, 고객 노드이면 초성으로 전환
      if (!selectedInitial && customerInitialMap.has(key)) {
        const initial = customerInitialMap.get(key)!
        pendingExpandKeyRef.current = key

        // 검색 결과에서 고객 클릭 시: 검색어 보존 + 해당 고객만 필터
        if (searchTerm) {
          // 고객명 찾기 (customerFilter 설정용)
          const customer = explorerData?.customers?.find(c => `customer-${c.customerId}` === key)
          if (customer) {
            savedSearchTermRef.current = searchTerm
            setCustomerFilter(customer.name)
          }
          setSearchTerm('')
        }
        onSelectedInitialChange(initial)
        return
      }
      // 그 외: 기존 토글 동작
      toggleNode(key)
    },
    [selectedInitial, customerInitialMap, toggleNode, onSelectedInitialChange, searchTerm, setSearchTerm, explorerData?.customers, setCustomerFilter]
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

  // 컨텍스트 메뉴 상태
  const documentContextMenu = useContextMenu()
  const [contextMenuDocument, setContextMenuDocument] = useState<Document | null>(null)

  // 컨텍스트 메뉴 핸들러 (우클릭)
  const handleDocumentContextMenu = useCallback((doc: Document, event: React.MouseEvent) => {
    setContextMenuDocument(doc)
    documentContextMenu.open(event)
  }, [documentContextMenu])

  // 메모 모달 상태
  const [notesModalVisible, setNotesModalVisible] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<{
    documentName: string
    customerName?: string | undefined
    customerId?: string | undefined
    documentId?: string | undefined
    notes: string
  } | null>(null)

  // 메모 저장 핸들러
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentExplorerView] customerId 또는 documentId 누락')
      return
    }
    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        notes
      )
      setSelectedNotes(prev => prev ? { ...prev, notes } : null)
      void fetchExplorerTree(selectedInitial)
    } catch (error) {
      console.error('[DocumentExplorerView] 메모 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleSaveNotes' })
      throw error
    }
  }, [selectedNotes, fetchExplorerTree, selectedInitial])

  // 메모 삭제 핸들러
  const handleDeleteNotes = useCallback(async () => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) return
    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        ''
      )
      setNotesModalVisible(false)
      setSelectedNotes(null)
      void fetchExplorerTree(selectedInitial)
    } catch (error) {
      console.error('[DocumentExplorerView] 메모 삭제 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleDeleteNotes' })
      throw error
    }
  }, [selectedNotes, fetchExplorerTree, selectedInitial])

  // 문서유형 변경 모달 상태 (컨텍스트 메뉴용)
  const [typePickerVisible, setTypePickerVisible] = useState(false)
  const [typePickerDocument, setTypePickerDocument] = useState<Document | null>(null)
  const typePickerTriggerRef = useRef<HTMLSpanElement>(null)

  // 문서유형 변경 중 상태 (인라인 + 컨텍스트 메뉴 공용)
  const [updatingDocTypeId, setUpdatingDocTypeId] = useState<string | null>(null)

  // 문서유형 변경 핸들러 (컨텍스트 메뉴 피커용)
  const handleDocumentTypeChange = useCallback(async (newType: string) => {
    if (!typePickerDocument) return
    const documentId = typePickerDocument._id || typePickerDocument.id || ''
    if (!documentId) return

    setTypePickerVisible(false)
    setUpdatingDocTypeId(documentId)
    try {
      await documentTypesService.updateDocumentType(documentId, newType)
      void fetchExplorerTree(selectedInitial)
    } catch (error) {
      console.error('[DocumentExplorerView] 문서 유형 변경 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleDocumentTypeChange' })
      await showAlert({
        title: '문서유형 변경 실패',
        message: '문서유형을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.',
        confirmText: '확인',
      })
    } finally {
      setUpdatingDocTypeId(null)
    }
  }, [typePickerDocument, fetchExplorerTree, selectedInitial, showAlert])

  // 문서유형 인라인 변경 핸들러 (DocumentTypeCell용)
  const handleInlineDocTypeChange = useCallback(async (documentId: string, newType: string) => {
    if (updatingDocTypeId) return
    setUpdatingDocTypeId(documentId)
    try {
      await documentTypesService.updateDocumentType(documentId, newType)
      void fetchExplorerTree(selectedInitial)
    } catch (error) {
      console.error('[DocumentExplorerView] 문서 유형 변경 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleInlineDocTypeChange' })
      await showAlert({
        title: '문서유형 변경 실패',
        message: '문서유형을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.',
        confirmText: '확인',
      })
    } finally {
      setUpdatingDocTypeId(null)
    }
  }, [updatingDocTypeId, fetchExplorerTree, selectedInitial, showAlert])

  // 컨텍스트 메뉴 섹션
  const documentContextMenuSections: ContextMenuSection[] = useMemo(() => {
    if (!contextMenuDocument) return []

    const documentId = contextMenuDocument._id || contextMenuDocument.id || ''
    const documentName = contextMenuDocument.displayName || DocumentStatusService.extractOriginalFilename(contextMenuDocument)
    const customerRelation = contextMenuDocument.customer_relation

    return [
      {
        id: 'view',
        items: [
          {
            id: 'preview',
            label: '미리보기',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ),
            onClick: () => {
              if (onDocumentClick && documentId) {
                onDocumentClick(documentId)
              }
            }
          },
          {
            id: 'summary',
            label: 'AI 요약',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            ),
            onClick: () => setSummaryDoc(contextMenuDocument)
          },
          {
            id: 'fulltext',
            label: '전체 텍스트',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M16 9H8" />
              </svg>
            ),
            onClick: () => setFullTextDoc(contextMenuDocument)
          }
        ]
      },
      {
        id: 'actions',
        items: [
          {
            id: 'download',
            label: '다운로드',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            ),
            onClick: async () => {
              try {
                if (!documentId) return
                const response = await DocumentStatusService.getDocumentDetailViaWebhook(documentId)
                if (response) {
                  const apiResponse = response as Record<string, unknown>
                  const data = apiResponse['data'] as Record<string, unknown> | undefined
                  const raw = (data?.['raw'] || apiResponse['raw'] || response) as Record<string, unknown>
                  await DownloadHelper.downloadDocument({
                    _id: documentId,
                    ...raw
                  })
                }
              } catch (error) {
                console.error('다운로드 실패:', error)
                errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleDownload' })
              }
            }
          },
          {
            id: 'change-type',
            label: '문서유형 변경',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ),
            onClick: () => {
              setTypePickerDocument(contextMenuDocument)
              // 다음 프레임에서 열어야 triggerRef가 렌더링된 상태
              requestAnimationFrame(() => setTypePickerVisible(true))
            }
          },
          {
            id: 'rename',
            label: '이름 변경',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            ),
            onClick: () => {
              if (documentId) setRenamingDocumentId(documentId)
            }
          },
          {
            id: 'memo',
            label: '메모',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            ),
            onClick: () => {
              setSelectedNotes({
                documentName: documentName,
                customerName: customerRelation?.customer_name,
                customerId: customerRelation?.customer_id,
                documentId: documentId,
                notes: customerRelation?.notes || ''
              })
              setNotesModalVisible(true)
            }
          }
        ]
      },
      {
        id: 'danger',
        items: [
          {
            id: 'delete',
            label: '삭제',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            ),
            danger: true,
            onClick: () => {
              if (documentId) {
                documentActions.deleteDocument(documentId, documentName)
              }
            }
          }
        ]
      }
    ]
  }, [contextMenuDocument, onDocumentClick, documentActions])

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    void fetchExplorerTree(selectedInitial)
  }, [fetchExplorerTree, selectedInitial])

  // 내용 검색 결과에서 문서 클릭 → RightPane 프리뷰 + 트리 이동
  const handleContentSearchResultClick = useCallback((item: SearchResultItem) => {
    const docId = ('_id' in item ? item._id : undefined) || ('id' in item ? item.id : undefined) || (('payload' in item && item.payload?.doc_id) ? item.payload.doc_id : '')
    if (!docId) return

    onDocumentClick?.(docId)

    if (selectedInitial && documents.length > 0) {
      setSelectedDocumentId(docId)
      expandToDocument(docId)
    }
  }, [onDocumentClick, selectedInitial, documents.length, setSelectedDocumentId, expandToDocument])

  // 검색 결과 키보드 네비게이션
  const [searchResultFocusIndex, setSearchResultFocusIndex] = useState(-1)
  const searchResultsListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSearchResultFocusIndex(-1)
  }, [contentSearchResults, contentPage])

  const handleSearchResultKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!paginatedContentResults.length) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSearchResultFocusIndex(prev =>
          prev < paginatedContentResults.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSearchResultFocusIndex(prev =>
          prev > 0 ? prev - 1 : paginatedContentResults.length - 1
        )
        break
      case 'Enter':
        if (searchResultFocusIndex >= 0 && paginatedContentResults[searchResultFocusIndex]) {
          e.preventDefault()
          handleContentSearchResultClick(paginatedContentResults[searchResultFocusIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        handleCloseContentSearch()
        break
    }
  }, [paginatedContentResults, searchResultFocusIndex, handleCloseContentSearch, handleContentSearchResultClick])

  useEffect(() => {
    if (searchResultFocusIndex >= 0 && searchResultsListRef.current) {
      const items = searchResultsListRef.current.querySelectorAll('.doc-explorer-search-results__item')
      items[searchResultFocusIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [searchResultFocusIndex])

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
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortByChange={setSortBy}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        customerFilter={customerFilter}
        onCustomerFilterClear={() => {
          setCustomerFilter(null)
          // 검색 결과에서 진입했으면 검색어 복원 + 요약 모드 복귀
          if (savedSearchTermRef.current) {
            setSearchTerm(savedSearchTermRef.current)
            onSelectedInitialChange(null)
            savedSearchTermRef.current = null
          }
        }}
        onJumpToDate={jumpToDate}
        getAvailableDates={getAvailableDates}
        dateFilter={dateFilter}
        onDateFilterClear={clearDateFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        thumbnailEnabled={thumbnailEnabled}
        onThumbnailEnabledChange={setThumbnailEnabled}
        filenameMode={filenameMode}
        onFilenameModeChange={handleFilenameModeChange}
        searchMode={explorerSearchMode}
        onSearchModeChange={handleExplorerSearchModeChange}
        onContentSearch={handleContentSearch}
        isContentSearching={isContentSearching}
        onContentSearchClear={handleCloseContentSearch}
        editMode={editMode}
        onEditModeChange={handleEditModeChange}
        selectedCount={selectedDocumentIds.size}
        scopeCustomer={scopeCustomer}
        onScopeCustomerClear={() => {
          setScopeCustomer(null)
          handleCloseContentSearch()
        }}
        isSummaryMode={!selectedInitial && filterFetchMode !== 'all'}
      />

      {/* 초성 필터 바 - 검색 결과 표시 중에는 숨김 */}
      {!lastContentSearchMode && (
        <InitialFilterBar
          initialType={initialType}
          onInitialTypeChange={onInitialTypeChange}
          selectedInitial={selectedInitial}
          onSelectedInitialChange={onSelectedInitialChange}
          initialCounts={serverInitialCounts}
          countLabel="건"
          targetLabel="고객"
        />
      )}

      {/* 트리 뷰 또는 검색 결과 (트리 영역을 대체) */}
      <div className="doc-explorer-tree-container">
        {/* 내용 검색 / AI 질문 결과 — 트리 영역 전체를 대체 */}
        {lastContentSearchMode ? (
          <div className="doc-explorer-search-results" tabIndex={0} onKeyDown={handleSearchResultKeyDown}>
            {/* 결과 헤더 */}
            <div className="doc-explorer-search-results__header">
              <div className="doc-explorer-search-results__header-left">
                <SFSymbol
                  name={lastContentSearchMode === 'semantic' ? 'sparkles' : 'magnifyingglass'}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative
                />
                <span className="doc-explorer-search-results__title">
                  {lastContentSearchMode === 'semantic' ? 'AI 질문 결과' : '내용 검색 결과'}
                </span>
                <span className="doc-explorer-search-results__count">
                  {contentSearchResults.length}건
                </span>
                {scopeCustomer && (
                  <span className="doc-explorer-search-results__scope-badge">
                    {scopeCustomer.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="doc-explorer-search-results__back"
                onClick={handleCloseContentSearch}
                aria-label="검색 결과 닫기"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.FOOTNOTE}
                  weight={SFSymbolWeight.REGULAR}
                />
              </button>
            </div>

            {/* AI 답변 (시맨틱 모드) */}
            {contentSearchAnswer && (
              <div className="doc-explorer-search-results__answer">
                <SFSymbol
                  name="sparkles"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  className="doc-explorer-search-results__answer-icon"
                  decorative
                />
                <span>{contentSearchAnswer}</span>
              </div>
            )}

            {/* 에러 표시 */}
            {contentSearchError && (
              <div className="doc-explorer-search-results__error">
                <SFSymbol name="exclamationmark.triangle" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.REGULAR} decorative />
                <span>{contentSearchError}</span>
              </div>
            )}

            {/* 로딩 중 */}
            {isContentSearching && (
              <div className="doc-explorer-search-results__loading">
                <div className="doc-explorer-search-results__loading-spinner" />
                <span>검색 중...</span>
              </div>
            )}

            {/* 검색 결과 목록 */}
            {contentSearchResults.length > 0 && (
              <>
              {/* 🍎 칼럼 헤더 */}
              <div className="doc-explorer-search-results__col-header">
                <div
                  className={`doc-explorer-search-results__col sortable ${contentSortField === 'filetype' ? 'sorted' : ''}`}
                  data-col="filetype"
                  onClick={() => handleContentSort('filetype')}
                  role="button"
                  tabIndex={0}
                >
                  <span>형식</span>
                  <SortIndicator field="filetype" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                </div>
                <div
                  className={`doc-explorer-search-results__col sortable ${contentSortField === 'filename' ? 'sorted' : ''}`}
                  data-col="filename"
                  onClick={() => handleContentSort('filename')}
                  role="button"
                  tabIndex={0}
                >
                  <span>파일명</span>
                  <SortIndicator field="filename" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                </div>
                <div
                  className={`doc-explorer-search-results__col sortable ${contentSortField === 'customer' ? 'sorted' : ''}`}
                  data-col="customer"
                  onClick={() => handleContentSort('customer')}
                  role="button"
                  tabIndex={0}
                >
                  <span>고객</span>
                  <SortIndicator field="customer" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                </div>
                <div
                  className={`doc-explorer-search-results__col sortable ${contentSortField === 'date' ? 'sorted' : ''}`}
                  data-col="date"
                  onClick={() => handleContentSort('date')}
                  role="button"
                  tabIndex={0}
                >
                  <span>업로드일</span>
                  <SortIndicator field="date" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                </div>
                <div
                  className={`doc-explorer-search-results__col sortable ${contentSortField === 'size' ? 'sorted' : ''}`}
                  data-col="size"
                  onClick={() => handleContentSort('size')}
                  role="button"
                  tabIndex={0}
                >
                  <span>크기</span>
                  <SortIndicator field="size" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                </div>
                {lastContentSearchMode === 'semantic' && (
                  <div
                    className={`doc-explorer-search-results__col sortable ${contentSortField === 'score' ? 'sorted' : ''}`}
                    data-col="score"
                    onClick={() => handleContentSort('score')}
                    role="button"
                    tabIndex={0}
                  >
                    <span>유사도</span>
                    <SortIndicator field="score" currentSortField={contentSortField} sortDirection={contentSortOrder} />
                  </div>
                )}
              </div>
              <div className="doc-explorer-search-results__list" ref={searchResultsListRef}>
                {paginatedContentResults.map((item, index) => {
                  const docId = ('_id' in item ? item._id : undefined) || ('id' in item ? item.id : undefined) || ''
                  const displayName = item.displayName || SearchService.getOriginalName(item)
                  const originalName = SearchService.getOriginalName(item)
                  const summary = SearchService.getSummary(item)
                  const score = 'score' in item ? (item as { score?: number }).score : undefined
                  const customerName = item.customer_relation?.customer_name
                  const customerType = item.customer_relation?.customer_type
                  const ext = originalName.split('.').pop()?.toLowerCase() || ''
                  const uploadedAt = ('upload' in item && item.upload?.uploaded_at) ? item.upload.uploaded_at : undefined
                  const sizeBytes = ('meta' in item && item.meta?.size_bytes) ? item.meta.size_bytes : undefined

                  return (
                    <button
                      key={docId || index}
                      type="button"
                      className={`doc-explorer-search-results__item ${selectedDocumentId === docId ? 'doc-explorer-search-results__item--selected' : ''} ${searchResultFocusIndex === index ? 'doc-explorer-search-results__item--focused' : ''}`}
                      onClick={() => handleContentSearchResultClick(item)}
                    >
                      {/* 파일 타입 배지 */}
                      <span className={`doc-explorer-search-results__file-badge doc-explorer-search-results__file-badge--${ext === 'pdf' ? 'pdf' : ext === 'hwp' || ext === 'hwpx' ? 'hwp' : ext === 'xlsx' || ext === 'xls' ? 'excel' : ext === 'docx' || ext === 'doc' ? 'word' : ext === 'jpg' || ext === 'jpeg' || ext === 'png' ? 'image' : 'other'}`}>
                        {ext === 'pdf' ? 'PDF' : ext === 'hwp' || ext === 'hwpx' ? 'HWP' : ext === 'xlsx' || ext === 'xls' ? 'XLS' : ext === 'docx' || ext === 'doc' ? 'DOC' : ext === 'jpg' || ext === 'jpeg' || ext === 'png' ? 'IMG' : ext.toUpperCase().slice(0, 3)}
                      </span>
                      {/* 문서 정보 */}
                      <div className="doc-explorer-search-results__item-content">
                        <div className="doc-explorer-search-results__item-top">
                          <span className="doc-explorer-search-results__item-name">{displayName}</span>
                        </div>
                        {summary && (
                          <span className="doc-explorer-search-results__item-snippet">
                            {summary.length > 120 ? summary.substring(0, 120) + '...' : summary}
                          </span>
                        )}
                      </div>
                      {/* 고객 — 개인/법인 아이콘 구분 (AllCustomersView 동일 방식) */}
                      <span className="doc-explorer-search-results__item-customer">
                        {customerName ? (
                          <>
                            {customerType === '법인' ? (
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate" aria-hidden="true">
                                <circle cx="10" cy="10" r="10" opacity="0.2" />
                                <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal" aria-hidden="true">
                                <circle cx="10" cy="10" r="10" opacity="0.2" />
                                <circle cx="10" cy="7" r="3" />
                                <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                              </svg>
                            )}
                            {customerName}
                          </>
                        ) : (
                          <span className="doc-explorer-search-results__item-no-customer">-</span>
                        )}
                      </span>
                      {/* 업로드일 */}
                      <span className="doc-explorer-search-results__item-date">
                        {uploadedAt ? (
                          <Tooltip content={formatDateTime(uploadedAt)}>
                            <span>{formatDate(uploadedAt)}</span>
                          </Tooltip>
                        ) : '-'}
                      </span>
                      {/* 크기 */}
                      <span className="doc-explorer-search-results__item-size">
                        {sizeBytes ? formatFileSize(sizeBytes) : '-'}
                      </span>
                      {/* 유사도 (시맨틱만) */}
                      {lastContentSearchMode === 'semantic' && (
                        <span className="doc-explorer-search-results__item-score">
                          {score !== undefined && score > 0 ? `${(score * 100).toFixed(0)}%` : '-'}
                        </span>
                      )}
                      {/* 화살표 (그리드 마지막 요소가 아닌 경우 숨김) */}
                      <SFSymbol
                        name="chevron.right"
                        size={SFSymbolSize.CAPTION_2}
                        weight={SFSymbolWeight.REGULAR}
                        className="doc-explorer-search-results__item-arrow"
                        decorative
                      />
                    </button>
                  )
                })}
              </div>
              {/* 🍎 페이지네이션 */}
              {totalContentPages > 1 && (
                <div className="doc-explorer-search-results__pagination">
                  <button
                    type="button"
                    className="doc-explorer-search-results__page-btn"
                    onClick={() => { setContentPage(p => Math.max(1, p - 1)); searchResultsListRef.current?.scrollTo(0, 0) }}
                    disabled={contentPage <= 1}
                    aria-label="이전 페이지"
                  >
                    <SFSymbol name="chevron.left" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative />
                  </button>
                  <span className="doc-explorer-search-results__page-info">
                    <span className="doc-explorer-search-results__page-size">{CONTENT_PAGE_SIZE}건씩</span>
                    {contentPage} / {totalContentPages}
                  </span>
                  <button
                    type="button"
                    className="doc-explorer-search-results__page-btn"
                    onClick={() => { setContentPage(p => Math.min(totalContentPages, p + 1)); searchResultsListRef.current?.scrollTo(0, 0) }}
                    disabled={contentPage >= totalContentPages}
                    aria-label="다음 페이지"
                  >
                    <SFSymbol name="chevron.right" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative />
                  </button>
                </div>
              )}
              </>
            )}

            {/* 결과 없음 */}
            {contentSearchResults.length === 0 && !contentSearchError && !isContentSearching && (
              <div className="doc-explorer-search-results__empty">
                <SFSymbol name="doc.text.magnifyingglass" size={SFSymbolSize.TITLE_3} weight={SFSymbolWeight.ULTRALIGHT} decorative />
                <span>검색 결과가 없습니다</span>
                <span className="doc-explorer-search-results__empty-hint">다른 키워드로 다시 검색해 보세요</span>
              </div>
            )}
          </div>
        ) : isLoading && !explorerData ? (
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
            onRenameClick={handleRenameClick}
            onDeleteClick={handleHoverDeleteClick}
            onDocumentContextMenu={handleDocumentContextMenu}
            renamingDocumentId={renamingDocumentId}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
            isEditMode={editMode !== 'none'}
            selectedDocumentIds={selectedDocumentIds}
            onSelectDocument={handleSelectDocument}
            onCustomerContextMenu={handleCustomerContextMenu}
            onCustomerDetailClick={handleCustomerDetailClick}
            onCustomerExplorerClick={onCustomerExplorerClick}
            onOpenQuickSearch={(customerId, customerName, customerType) => {
              setScopeCustomer({
                id: customerId,
                name: customerName,
                type: customerType || '개인'
              })
              if (explorerSearchMode === 'filename') {
                handleExplorerSearchModeChange('content')
              }
            }}
            onOpenContentSearchModal={(customerId, customerName, customerType) => {
              setContentSearchModal({
                isOpen: true,
                customerId,
                customerName,
                customerType: customerType || '개인'
              })
            }}
            onOpenFullDetail={(customerId) => {
              navigateToView('customers-full-detail', customerId)
            }}
            onToggleExpandCustomer={toggleExpandCustomer}
            onDocTypeChange={handleInlineDocTypeChange}
            updatingDocTypeId={updatingDocTypeId}
          />
        )}
      </div>

      {/* 컨텍스트 메뉴 (문서) */}
      <ContextMenu
        visible={documentContextMenu.isOpen}
        position={documentContextMenu.position}
        sections={documentContextMenuSections}
        onClose={documentContextMenu.close}
      />

      {/* 컨텍스트 메뉴 (고객 노드) */}
      <ContextMenu
        visible={customerContextMenu.isOpen}
        position={customerContextMenu.position}
        sections={customerContextMenuSections}
        onClose={customerContextMenu.close}
      />

      {/* 편집 모드 하단 액션바 */}
      {editMode !== 'none' && (
        <div className="doc-explorer-action-bar">
          <div className="doc-explorer-action-bar__left">
            <span className="doc-explorer-action-bar__count">
              {selectedDocumentIds.size}건 선택됨
            </span>
          </div>
          <div className="doc-explorer-action-bar__right">
            {editMode === 'alias' && (
              <>
                <label className="doc-explorer-action-bar__force-label">
                  <input
                    type="checkbox"
                    checked={forceRegenerateAlias}
                    onChange={(e) => setForceRegenerateAlias(e.target.checked)}
                    aria-label="기존 별칭 포함"
                  />
                  <span>기존 별칭 포함</span>
                </label>
                <button
                  type="button"
                  className="doc-explorer-action-bar__btn doc-explorer-action-bar__btn--alias"
                  onClick={handleGenerateAliases}
                  disabled={isGeneratingAliases || selectedDocumentIds.size === 0}
                >
                  <SFSymbol
                    name="sparkles"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative
                  />
                  {isGeneratingAliases ? '생성 중...' : 'AI 별칭 생성'}
                </button>
              </>
            )}
            {editMode === 'delete' && (
              <button
                type="button"
                className="doc-explorer-action-bar__btn doc-explorer-action-bar__btn--delete"
                onClick={handleBatchDelete}
                disabled={documentActions.isDeleting || selectedDocumentIds.size === 0}
              >
                <SFSymbol
                  name="trash"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative
                />
                {documentActions.isDeleting ? '삭제 중...' : '일괄 삭제'}
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* 메모 모달 */}
      {selectedNotes && (
        <DocumentNotesModal
          visible={notesModalVisible}
          documentName={selectedNotes.documentName}
          customerName={selectedNotes.customerName}
          customerId={selectedNotes.customerId}
          documentId={selectedNotes.documentId}
          notes={selectedNotes.notes}
          onClose={() => {
            setNotesModalVisible(false)
            setSelectedNotes(null)
          }}
          onSave={handleSaveNotes}
          onDelete={handleDeleteNotes}
        />
      )}

      {/* 문서유형 변경 피커 (숨겨진 트리거) */}
      <span
        ref={typePickerTriggerRef}
        style={{
          position: 'fixed',
          left: documentContextMenu.position.x,
          top: documentContextMenu.position.y,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      />
      <DocumentTypePickerModal
        visible={typePickerVisible}
        currentType={typePickerDocument?.document_type ?? null}
        triggerRef={typePickerTriggerRef}
        onSelect={handleDocumentTypeChange}
        onClose={() => setTypePickerVisible(false)}
      />

      {/* 문서 내용 검색 모달 */}
      <DocumentContentSearchModal
        isOpen={contentSearchModal.isOpen}
        onClose={() => setContentSearchModal(prev => ({ ...prev, isOpen: false }))}
        customerId={contentSearchModal.customerId}
        customerName={contentSearchModal.customerName}
        customerType={contentSearchModal.customerType}
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
  onCustomerExplorerClick,
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
      title="고객별 문서함"
      breadcrumbItems={breadcrumbItems}
      onClose={onClose}
    >
      <DocumentExplorerContent
        onDocumentClick={onDocumentClick}
        onDocumentDoubleClick={onDocumentDoubleClick}
        onCustomerClick={onCustomerClick}
        onCustomerExplorerClick={onCustomerExplorerClick}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={setSelectedInitial}
        initialType={initialType}
        onInitialTypeChange={handleInitialTypeChange}
      />
    </CenterPaneView>
  )
}

export default DocumentExplorerView
