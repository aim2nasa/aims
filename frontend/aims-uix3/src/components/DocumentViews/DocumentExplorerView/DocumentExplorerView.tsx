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
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { usePersistedState } from '@/hooks/usePersistedState'
import { DocumentExplorerToolbar, type EditModeType } from './DocumentExplorerToolbar'
import { DocumentExplorerTree, DocumentExplorerColumnHeader } from './DocumentExplorerTree'
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
import DownloadHelper from '../../../utils/downloadHelper'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useToastContext } from '@/shared/ui'
import type { Document } from '@/types/documentStatus'
import './DocumentExplorerView.toolbar.css';
import './DocumentExplorerView.tree.css';
import './DocumentExplorerView.features.css';
import './DocumentExplorerView.datejump.css';
import './DocumentExplorerView.mobile.css';
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useAliasGeneration } from '@/hooks/useAliasGeneration'
import { AliasProgressOverlay } from '@/shared/ui/AliasProgressOverlay'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { RenameModal } from '@/shared/ui/RenameModal/RenameModal'
import { useDocumentDownload } from '@/features/customer'
import { useDocumentStatistics } from '@/hooks/useDocumentStatistics'
import { ExplorerProcessingStatusBar } from './components/ExplorerProcessingStatusBar'
import { api } from '@/shared/lib/api'

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
  /** 문서 삭제 완료 핸들러 (삭제된 문서 ID 전달) */
  onDocumentDeleted?: (deletedIds: string | string[]) => void
  /** RP에서 보고 있는 문서 ID (프리뷰 하이라이트용) */
  previewDocumentId?: string | null
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
}

/** explorer-tree API 응답 타입 */
interface SearchDocument {
  _id: string
  displayName: string | null
  displayNameStatus?: string | null
  originalName: string
  uploadedAt: string | null
  fileSize: number | null
  mimeType: string | null
  customerId: string | null
  customerName: string | null
  document_type: string | null
  overallStatus: string | null
  status: string | null
  progress: number
  _hasMetaText: boolean
  _hasOcrText: boolean
  upload: Record<string, unknown> | null
  meta: { mime?: string | null; size_bytes?: number | null; pdf_pages?: number | null; meta_status?: string | null; summary?: string | null } | null
  ocr: { status?: string | null; confidence?: number | null; summary?: string | null } | null
  docembed?: { text_source?: string } | null
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
  onDocumentDeleted?: (deletedIds: string | string[]) => void
  onCustomerClick?: (customerId: string) => void
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
  previewDocumentId?: string | null
  /** View 표시 여부 (SSE/폴링 제어용) */
  visible?: boolean
  /** 뷰 이동 핸들러 (전체문서보기 점프용) */
  onNavigate?: (viewKey: string) => void
}> = ({ onDocumentClick, onDocumentDoubleClick, onDocumentDeleted, onCustomerClick, onCustomerExplorerClick, selectedInitial, onSelectedInitialChange, initialType, onInitialTypeChange, previewDocumentId, visible = true, onNavigate }) => {

  // 파일명 표시 모드 (별칭/원본) - localStorage 동기화
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  const handleFilenameModeChange = useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
  }, [])

  // 문서 처리 현황 통계 (글로벌) — visible=false일 때 SSE/폴링 비활성화
  const { statistics: docStatistics, isLoading: isStatisticsLoading } = useDocumentStatistics({ enabled: visible })

  // 호버 액션: 문서 삭제/이름변경 — reload 대신 트리 재조회로 UI 상태 유지
  const refreshDataRef = useRef<() => void>(() => {})
  const onRefreshData = useCallback(() => { refreshDataRef.current() }, [])
  const lastDeletedDocIdRef = useRef<string | null>(null)
  const onDeleteSuccessWithNotify = useCallback(() => {
    onRefreshData()
    if (lastDeletedDocIdRef.current) {
      onDocumentDeleted?.(lastDeletedDocIdRef.current)
      lastDeletedDocIdRef.current = null
    }
  }, [onRefreshData, onDocumentDeleted])
  const documentActions = useDocumentActions({
    onRenameSuccess: onRefreshData,
    onDeleteSuccess: onDeleteSuccessWithNotify,
  })
  const [renamingDoc, setRenamingDoc] = useState<{ _id: string; originalName: string; displayName?: string } | null>(null)

  const handleRenameClick = useCallback((doc: Document) => {
    const docId = doc._id || doc.id
    if (docId) setRenamingDoc({ _id: docId, originalName: doc.originalName || '', displayName: doc.displayName })
  }, [])

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renamingDoc) return
    setRenamingDoc(null)
    const field = filenameMode === 'original' ? 'originalName' : 'displayName'
    await documentActions.renameDocument(renamingDoc._id, newName, field)
  }, [documentActions, filenameMode, renamingDoc])

  const handleRenameCancel = useCallback(() => {
    setRenamingDoc(null)
  }, [])

  const handleHoverDeleteClick = useCallback((doc: Document) => {
    const docId = doc._id || doc.id
    const docName = doc.displayName || DocumentStatusService.extractOriginalFilename(doc)
    if (docId) {
      lastDeletedDocIdRef.current = docId
      documentActions.deleteDocument(docId, docName)
    }
  }, [documentActions])

  // === 문서함 다운로드 ===
  const toast = useToastContext()

  // 에러 문서 재시도 핸들러 (중복 클릭 방어 포함)
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null)
  const handleRetryDocument = useCallback(async (documentId: string) => {
    if (retryingDocumentId) return // 이미 재시도 중이면 무시

    setRetryingDocumentId(documentId)
    try {
      await api.post<{ success: boolean }>(`/api/documents/${documentId}/retry`, { stage: 'pdf_conversion' })
      toast.show('재시도가 시작되었습니다', { type: 'success' })
    } catch (error) {
      console.error('[DocumentExplorerView] 재시도 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentExplorerView.handleRetryDocument' })
      toast.show('재시도 중 오류가 발생했습니다', { type: 'error' })
    } finally {
      setRetryingDocumentId(null)
    }
  }, [retryingDocumentId, toast])

  // 진행률 토스트 ID를 ref로 관리 (콜백 내에서 최신값 참조)
  const progressToastIdRef = useRef<string | null>(null)
  const handleDownloadProgress = useCallback((progress: import('@/features/customer/hooks/useDocumentDownload').DownloadProgress) => {
    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
    const msg = `압축 준비 중... ${pct}% (${progress.processed}/${progress.total}건)`
    if (progressToastIdRef.current) {
      toast.update(progressToastIdRef.current, msg)
    }
  }, [toast])
  const { download: downloadZip, cancel: _cancelDownload, isDownloading } = useDocumentDownload({
    onProgress: handleDownloadProgress,
  })
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set())
  const [customerSelectMode, setCustomerSelectMode] = useState(false)

  const handleToggleCustomerSelectMode = useCallback(() => {
    setCustomerSelectMode(prev => {
      if (prev) setSelectedCustomerIds(new Set())
      return !prev
    })
  }, [])

  // 고객 체크박스 토글
  const handleToggleCustomerSelect = useCallback((customerId: string) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev)
      if (next.has(customerId)) {
        next.delete(customerId)
      } else {
        next.add(customerId)
      }
      return next
    })
  }, [])

  // 단일 고객 문서함 다운로드 (··· 메뉴)
  const handleDownloadCustomerDocuments = useCallback(async (customerId: string, customerName: string) => {
    const toastId = toast.show(`${customerName} 문서함 압축 준비 중...`, { type: 'info', duration: Infinity })
    progressToastIdRef.current = toastId
    try {
      await downloadZip([customerId])
      toast.dismiss(toastId)
      toast.show(`${customerName} 문서함 다운로드 시작`, { type: 'success' })
    } catch {
      toast.dismiss(toastId)
      toast.show('다운로드에 실패했습니다', { type: 'error' })
    } finally {
      progressToastIdRef.current = null
    }
  }, [downloadZip, toast])

  // 다중 고객 문서함 다운로드 (하단 액션바)
  const handleDownloadSelectedCustomers = useCallback(async () => {
    if (selectedCustomerIds.size === 0) return
    const count = selectedCustomerIds.size
    const toastId = toast.show(`${count}명 고객 문서함 압축 준비 중...`, { type: 'info', duration: Infinity })
    progressToastIdRef.current = toastId
    try {
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST (UTC+9)
      const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
      const timeStr = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`
      const initialSuffix = selectedInitial ? `_${selectedInitial}` : ''
      const zipName = `AIMS_문서함${initialSuffix}_${dateStr}${timeStr}.zip`
      await downloadZip(Array.from(selectedCustomerIds), zipName)
      toast.dismiss(toastId)
      toast.show(`${count}명 고객 문서함 다운로드 시작`, { type: 'success' })
      setSelectedCustomerIds(new Set())
    } catch {
      toast.dismiss(toastId)
      toast.show('다운로드에 실패했습니다', { type: 'error' })
    } finally {
      progressToastIdRef.current = null
    }
  }, [selectedCustomerIds, downloadZip, selectedInitial, toast])

  // 전체 선택/해제
  const handleToggleSelectAllCustomers = useCallback((allCustomerIds: string[]) => {
    setSelectedCustomerIds(prev => {
      if (prev.size === allCustomerIds.length && allCustomerIds.every(id => prev.has(id))) {
        return new Set()
      }
      return new Set(allCustomerIds)
    })
  }, [])

  // === 편집 모드 (일괄 삭제 / AI 별칭 생성) ===
  const { showAlert } = useAppleConfirm()
  const [editMode, setEditMode] = useState<EditModeType>('none')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [, setForceRegenerateAlias] = useState(false)
  const aliasGeneration = useAliasGeneration()
  const isGeneratingAliases = aliasGeneration.progress.isRunning

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
    const idsToDelete = Array.from(selectedDocumentIds)
    await documentActions.deleteDocuments(selectedDocumentIds)
    setSelectedDocumentIds(new Set())
    onDocumentDeleted?.(idsToDelete)
  }, [selectedDocumentIds, documentActions, onDocumentDeleted])

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
          }
        ]
      }
    ]
  }, [contextMenuCustomer, onCustomerClick, navigateToView])


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

  // 이름변경/삭제 성공 시 reload 대신 트리 재조회 (UI 상태 유지)
  refreshDataRef.current = () => { fetchExplorerTree(selectedInitial) }

  // selectedInitial 변경 시 재조회
  useEffect(() => { fetchExplorerTree(selectedInitial) }, [fetchExplorerTree, selectedInitial])

  // 이벤트 기반 새로고침 — ref로 최신 selectedInitial 참조 (Race Condition 방지)
  const selectedInitialRef = useRef(selectedInitial)
  const wasProcessingRef = useRef(false)
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

  // 처리 중인 문서가 있으면 3초마다 자동 갱신 (PDF 변환/임베딩 완료 반영)
  useEffect(() => {
    if (!explorerData?.documents) return
    const hasProcessing = explorerData.documents.some((doc: Document) => {
      const status = (doc as Record<string, unknown>)['overallStatus'] as string | undefined
      return status !== undefined
        && status !== 'completed'
        && status !== 'error'
        && status !== 'credit_pending'
    })
    // 처리중 → 완료 전환 감지 시 마지막 1회 fetch
    if (wasProcessingRef.current && !hasProcessing) {
      void fetchExplorerTree(selectedInitialRef.current)
    }
    wasProcessingRef.current = hasProcessing
    if (!hasProcessing) return
    const interval = setInterval(() => {
      fetchExplorerTree(selectedInitialRef.current)
    }, 3000)
    return () => clearInterval(interval)
  }, [explorerData?.documents, fetchExplorerTree])

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

  // 별칭 없는 문서 존재 여부 및 수 (Progressive Disclosure + 카운트 문구용)
  const hasDocWithoutAlias = useMemo(() =>
    documents.some(doc => !doc.displayName || doc.displayNameStatus === 'failed'),
    [documents]
  )
  const aliasSelectableCount = useMemo(() =>
    documents.filter(doc => !doc.displayName || doc.displayNameStatus === 'failed').length,
    [documents]
  )

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
    setCustomerFilter,
    jumpToDate,
    getAvailableDates,
    clearDateFilter,
    setDateRange,
    setThumbnailEnabled,
    expandToLevel,
    expandToDocument: _expandToDocument,
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
    if (selectedInitial) return
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
  }, [searchTerm, selectedInitial, fetchExplorerTree])

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

    // filename 모드: 서버에서 이미 필터됨 (고객명+파일명 통합 검색)

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
          overallStatus: doc.overallStatus,
          status: doc.status,
          progress: doc.progress,
          _hasMetaText: doc._hasMetaText,
          _hasOcrText: doc._hasOcrText,
          upload: doc.upload,
          meta: doc.meta,
          ocr: doc.ocr,
          docembed: doc.docembed,
          customer_relation: {
            customer_id: doc.customerId || '',
            customer_name: doc.customerName || '',
          },
        } as unknown as Document,
      }))

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
  }, [selectedInitial, filterFetchMode, explorerData?.customers, explorerData?.searchDocuments, searchTerm, initialType])

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
  // 재마운트 시 이미 선택된 초성에 대해 자동 펼침이 재실행되지 않도록
  // sessionStorage에서 복원된 selectedInitial 값으로 초기화
  const lastAutoExpandedInitialRef = useRef<string | null>(selectedInitial)
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
      onDocumentClick?.(docId)
    },
    [onDocumentClick, setSelectedDocumentId]
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
                } else {
                  alert('삭제되었거나 접근할 수 없는 문서입니다.')
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
              if (contextMenuDocument) handleRenameClick(contextMenuDocument)
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
                lastDeletedDocIdRef.current = documentId
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
        editMode={editMode}
        onEditModeChange={handleEditModeChange}
        selectedCount={selectedDocumentIds.size}
        onBatchDelete={handleBatchDelete}
        isDeleting={documentActions.isDeleting}
        hasDocWithoutAlias={hasDocWithoutAlias}
        aliasSelectableCount={aliasSelectableCount}
        onGenerateAliases={(force) => {
          if (selectedDocumentIds.size === 0) return
          void aliasGeneration.generate(
            Array.from(selectedDocumentIds),
            force,
          ).then((summary) => {
            const { completed, skipped, failed } = summary
            if (completed > 0) {
              void fetchExplorerTree(selectedInitialRef.current)
            }
            const parts: string[] = []
            if (completed > 0) parts.push(`${completed}건 생성`)
            if (skipped > 0) parts.push(`${skipped}건 건너뜀`)
            if (failed > 0) parts.push(`${failed}건 실패`)
            if (parts.length > 0) {
              void showAlert({ title: '별칭 생성 완료', message: parts.join(', ') })
            }
          }).catch((err) => {
            console.error('별칭 생성 실패:', err)
          })
        }}
        isGeneratingAliases={isGeneratingAliases}
        isSummaryMode={!selectedInitial && filterFetchMode !== 'all'}
      />

      {/* 초성 필터 바 */}
      <InitialFilterBar
        initialType={initialType}
        onInitialTypeChange={onInitialTypeChange}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={onSelectedInitialChange}
        initialCounts={serverInitialCounts}
        countLabel="건"
        targetLabel="고객"
      />

      {/* 문서 처리 현황 바 — 처리 중 문서가 있을 때만 표시 */}
      <ExplorerProcessingStatusBar
        statistics={docStatistics}
        isLoading={isStatisticsLoading}
        onNavigate={onNavigate}
      />

      {/* 트리 레이아웃 래퍼 — 컬럼 헤더(고정)와 스크롤 영역을 분리 */}
      <div className="doc-explorer-tree-layout">
        {/* 컬럼 헤더 — scroll container 밖에 배치해야 겹침/잘림 버그 없음 */}
        <DocumentExplorerColumnHeader
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortByChange={setSortBy}
          filenameMode={filenameMode}
          onFilenameModeChange={handleFilenameModeChange}
          customerSelectMode={customerSelectMode}
          onToggleCustomerSelectMode={handleToggleCustomerSelectMode}
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
            selectedDocumentId={previewDocumentId ?? selectedDocumentId}
            groupBy={groupBy}
            onToggleNode={handleToggleNode}
            onDocumentClick={handleDocumentClick}
            onDocumentDoubleClick={handleDocumentDoubleClick}
            onCustomerClick={handleCustomerClick}
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
            renamingDocumentId={null}
            onRenameConfirm={undefined}
            onRenameCancel={undefined}
            isEditMode={editMode !== 'none'}
            isAliasMode={editMode === 'alias'}
            selectedDocumentIds={selectedDocumentIds}
            onSelectDocument={handleSelectDocument}
            onCustomerContextMenu={handleCustomerContextMenu}
            onCustomerDetailClick={handleCustomerDetailClick}
            onCustomerExplorerClick={onCustomerExplorerClick}
            onOpenFullDetail={(customerId) => {
              navigateToView('customers-full-detail', customerId)
            }}
            onToggleExpandCustomer={toggleExpandCustomer}
            onDocTypeChange={handleInlineDocTypeChange}
            updatingDocTypeId={updatingDocTypeId}
            onSortByChange={setSortBy}
            hideColumnHeader
            onDownloadCustomerDocuments={handleDownloadCustomerDocuments}
            selectedCustomerIds={selectedCustomerIds}
            onToggleCustomerSelect={customerSelectMode ? handleToggleCustomerSelect : undefined}
            customerSelectMode={customerSelectMode}
            onRetryClick={handleRetryDocument}
          />
        )}

        {/* AI 별칭 생성 진행률 오버레이 */}
        <AliasProgressOverlay
          progress={aliasGeneration.progress}
          onCancel={aliasGeneration.cancel}
        />
        </div>
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

      {/* 고객 다운로드 하단 액션바 (선택 모드 시) */}
      {customerSelectMode && editMode === 'none' && (
        <div className="doc-explorer-action-bar">
          <div className="doc-explorer-action-bar__left">
            <label className="doc-explorer-action-bar__select-all">
              <input
                type="checkbox"
                checked={treeData.nodes.length > 0 && treeData.nodes.every(n => !n.metadata?.customerId || selectedCustomerIds.has(n.metadata.customerId))}
                onChange={() => {
                  const allIds = treeData.nodes
                    .filter(n => n.metadata?.customerId)
                    .map(n => n.metadata!.customerId!)
                  handleToggleSelectAllCustomers(allIds)
                }}
                aria-label="전체 선택"
              />
              <span>전체 선택</span>
            </label>
            <span className="doc-explorer-action-bar__count">
              {selectedCustomerIds.size}명 선택됨
            </span>
          </div>
          <div className="doc-explorer-action-bar__right">
            {selectedCustomerIds.size > 0 && (
              <button
                type="button"
                className="doc-explorer-action-bar__btn doc-explorer-action-bar__btn--clear"
                onClick={() => setSelectedCustomerIds(new Set())}
              >
                선택 해제
              </button>
            )}
            <button
              type="button"
              className="doc-explorer-action-bar__btn doc-explorer-action-bar__btn--download"
              onClick={handleDownloadSelectedCustomers}
              disabled={isDownloading || selectedCustomerIds.size === 0}
            >
              {isDownloading ? '다운로드 중...' : '선택 다운로드'}
            </button>
            <button
              type="button"
              className="doc-explorer-action-bar__btn doc-explorer-action-bar__btn--clear"
              onClick={handleToggleCustomerSelectMode}
            >
              완료
            </button>
          </div>
        </div>
      )}

      {/* 삭제 모드: 상단 툴바에 통합됨 (하단 바 제거) */}

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
        ref={(el) => {
          (typePickerTriggerRef as React.MutableRefObject<HTMLSpanElement | null>).current = el;
          if (el) {
            el.style.position = 'fixed';
            el.style.left = `${documentContextMenu.position.x}px`;
            el.style.top = `${documentContextMenu.position.y}px`;
            el.style.width = '0';
            el.style.height = '0';
            el.style.pointerEvents = 'none';
          }
        }}
      />
      <DocumentTypePickerModal
        visible={typePickerVisible}
        currentType={typePickerDocument?.document_type ?? null}
        triggerRef={typePickerTriggerRef}
        onSelect={handleDocumentTypeChange}
        onClose={() => setTypePickerVisible(false)}
      />

      {/* 이름 변경 모달 */}
      <RenameModal
        visible={renamingDoc !== null}
        onClose={handleRenameCancel}
        onConfirm={handleRenameConfirm}
        editField={filenameMode === 'original' ? 'originalName' : 'displayName'}
        originalName={renamingDoc?.originalName || ''}
        displayName={renamingDoc?.displayName}
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
  onDocumentDeleted,
  onCustomerClick,
  onCustomerExplorerClick,
  previewDocumentId,
  onNavigate,
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
        onDocumentDeleted={onDocumentDeleted}
        onCustomerClick={onCustomerClick}
        onCustomerExplorerClick={onCustomerExplorerClick}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={setSelectedInitial}
        initialType={initialType}
        onInitialTypeChange={handleInitialTypeChange}
        previewDocumentId={previewDocumentId}
        visible={visible}
        onNavigate={onNavigate}
      />
    </CenterPaneView>
  )
}

export default DocumentExplorerView
