/**
 * AIMS UIX-3 Customer Detail - Documents Tab
 * @since 2025-10-25
 *
 * 🍎 CenterPane DocumentLibraryView 디자인 100% 복제
 * - 칼럼: 파일 타입 아이콘, 파일명, 크기, 연결일
 * - 헤더 아이콘 및 스타일 동일
 * - 페이지네이션, 정렬 기능 포함
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import type { Customer } from '@/entities/customer/model'
import { Tooltip, Button, ContextMenu, useContextMenu, type ContextMenuSection, DocumentTypeCell, DocumentTypeBadge } from '@/shared/ui'
import { SortIndicator } from '@/shared/ui/SortIndicator'
import { Dropdown } from '@/shared/ui'
import { Pagination } from '@/shared/ui/Pagination'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { formatDateTime, formatDateTimeCompact, formatDate } from '@/shared/lib/timeUtils'
import { api, ApiError } from '@/shared/lib/api'
import { DocumentUtils } from '@/entities/document'
import { useCustomerDocumentsController } from '@/features/customer/controllers/useCustomerDocumentsController'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import DownloadHelper from '../../../../../utils/downloadHelper'
import type { CustomerDocumentItem } from '@/services/DocumentService'
import { DocumentService } from '@/services/DocumentService'
import { CustomerDocumentPreviewModal } from './CustomerDocumentPreviewModal'
import { DocumentNotesModal } from '../../../../../components/DocumentViews/DocumentStatusView/components/DocumentNotesModal'
import DocumentSummaryModal from '../../../../../components/DocumentViews/DocumentStatusView/components/DocumentSummaryModal'
import { useDocumentSearch } from '@/contexts/useDocumentSearch'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'
import { DocumentContentSearchModal } from '../../../components/DocumentContentSearchModal'
import { useCustomerSSE } from '@/shared/hooks/useCustomerSSE'
import { errorReporter } from '@/shared/lib/errorReporter'
import { documentTypesService } from '@/services/documentTypesService'
import { useColumnResize, type ColumnConfig } from '@/hooks/useColumnResize'
import { getCategoryForType, getDocumentTypeLabelsMap } from '@/shared/constants/documentCategories'
import { DocumentCategoryFilter } from './DocumentCategoryFilter'
import './DocumentsTab.layout.css';
import './DocumentsTab.features.css';
import './DocumentsTab.extras.css';
import './DocumentsTab.cfd-overrides.css';
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { RenameModal } from '@/shared/ui/RenameModal/RenameModal'

interface DocumentsTabProps {
  customer: Customer
  onRefresh?: () => void
  onDocumentCountChange?: (count: number) => void
  onDocumentLibraryRefresh?: () => Promise<void>
  onAnnualReportNeedRefresh?: () => void
  onCustomerReviewNeedRefresh?: () => void
  /** 외부에서 전달받는 검색어 (CustomerFullDetailView에서 사용) */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
  /** 메뉴 네비게이션 핸들러 (간편 문서검색 → 문서 검색 페이지) */
  onNavigate?: (menuKey: string) => void
  /** 외부 새로고침 트리거 (RightPane visibility 변경 시) */
  refreshTrigger?: number
  /** 문서 탐색기 확대 핸들러 (CenterPane으로 전환) */
  onExpandToExplorer?: () => void
  /** 필터바를 외부 컨테이너(섹션 헤더)에 포탈 렌더링할 타겟 */
  filterBarPortalTarget?: HTMLElement | null
  /** 문서 삭제 완료 핸들러 (삭제된 문서 ID 전달) */
  onDocumentDeleted?: (deletedIds: string | string[]) => void
}

// 🍎 정렬 아이콘 폭 (font-size: 10px + gap: 4px)
const SORT_ICON_WIDTH = 14

// 🍎 컬럼 리사이즈 설정
const DOCUMENTS_COLUMNS: ColumnConfig[] = [
  { id: 'filename', minWidth: 120, maxWidth: 1200 },
  { id: 'docType', minWidth: 50, maxWidth: 120 },
  { id: 'size', minWidth: 40, maxWidth: 115 },
  { id: 'type', minWidth: 35, maxWidth: 80 },
  { id: 'date', minWidth: 60, maxWidth: 195 }
]

// 🍎 기본 문서유형/타입 칼럼 폭 (고정)
const DEFAULT_DOCTYPE_WIDTH = 65
const DEFAULT_TYPE_WIDTH = 42

// 🍎 페이지당 항목 수 옵션 (자동 옵션 포함)
const ITEMS_PER_PAGE_OPTIONS_BASE = [
  { value: 'auto', label: '자동' },
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

// 🍎 행 높이 상수 (CSS와 동일하게 유지)
const ROW_HEIGHT = 32   // CSS height: 32px
const ROW_GAP = 2       // CSS gap: 2px (행 사이 간격)
// 🍎 기본 높이값 (실제 DOM 측정이 안될 때 fallback)
const DEFAULT_LIST_HEADER_HEIGHT = 32
const DEFAULT_PAGINATION_HEIGHT = 26

// 🍎 정렬 필드 타입
type SortField = 'originalName' | 'fileSize' | 'linkedAt' | 'mimeType' | 'docType'
type SortDirection = 'asc' | 'desc'

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  customer,
  onRefresh,
  onDocumentCountChange,
  onDocumentLibraryRefresh,
  onAnnualReportNeedRefresh,
  onCustomerReviewNeedRefresh,
  searchTerm: externalSearchTerm,
  onSearchChange,
  onNavigate,
  refreshTrigger,
  onExpandToExplorer,
  filterBarPortalTarget,
  onDocumentDeleted,
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()
  const confirmController = useAppleConfirmController()
  const { isDevMode } = useDevModeStore()
  const {
    documents,
    documentCount,
    isLoading,
    isEmpty,
    error,
    lastUpdated,
    refresh,
    updateDocumentLocally,
    previewState,
    previewTarget,
    retryPreview,
    openPreview,
    closePreview
  } = useCustomerDocumentsController(customer?._id, {
    autoLoad: true,
    enabled: Boolean(customer?._id),
    ...(onDocumentCountChange ? { onDocumentsChange: onDocumentCountChange } : {}),
  })

  // 🍎 파일명 표시 모드: 'display' = displayName 우선, 'original' = 원본 파일명
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  // 호버 액션: 문서 삭제/이름변경 — reload 대신 데이터 재조회로 UI 상태 유지
  const onRefreshData = useCallback(() => { refresh() }, [refresh])
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

  const handleRenameClick = useCallback((doc: CustomerDocumentItem) => {
    if (doc._id) setRenamingDoc({ _id: doc._id, originalName: doc.originalName || '', displayName: doc.displayName })
  }, [])

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renamingDoc) return
    setRenamingDoc(null)
    const field = filenameMode === 'original' ? 'originalName' as const : 'displayName' as const
    await documentActions.renameDocument(renamingDoc._id, newName, field)
  }, [documentActions, filenameMode, renamingDoc])

  const handleRenameCancel = useCallback(() => {
    setRenamingDoc(null)
  }, [])

  const handleHoverDeleteClick = useCallback((doc: CustomerDocumentItem) => {
    const docName = doc.displayName || DocumentStatusService.extractOriginalFilename(doc as any)
    if (doc._id) {
      lastDeletedDocIdRef.current = doc._id
      documentActions.deleteDocument(doc._id, docName)
    }
  }, [documentActions])

  // 카테고리 필터 상태
  const [selectedCategory, setSelectedCategory] = useState('')

  // 🍎 페이지네이션 상태 ('auto' 또는 숫자)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | number>(() => {
    const saved = localStorage.getItem('aims-customer-documents-items-per-page')
    if (!saved || saved === 'auto') return 'auto'
    const num = parseInt(saved, 10)
    return isNaN(num) ? 'auto' : num
  })
  const [containerHeight, setContainerHeight] = useState(0)
  const sectionContainerRef = useRef<HTMLDivElement>(null)

  // itemsPerPageMode 변경 시 localStorage에 자동 저장
  useEffect(() => {
    localStorage.setItem('aims-customer-documents-items-per-page', String(itemsPerPageMode))
  }, [itemsPerPageMode])

  // PDF 변환 재시도 중인 문서 ID
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null)

  const [updatingDocTypeId, setUpdatingDocTypeId] = useState<string | null>(null)

  /**
   * 🍎 문서 유형 변경 핸들러
   */
  const handleDocTypeChange = useCallback(async (documentId: string, newType: string) => {
    if (updatingDocTypeId) return // 이미 업데이트 중이면 무시

    // 🍎 낙관적 업데이트: UI 즉시 반영
    const previousType = documents.find(d => d._id === documentId)?.document_type
    updateDocumentLocally(documentId, { document_type: newType === 'unspecified' ? undefined : newType })

    setUpdatingDocTypeId(documentId)
    try {
      await documentTypesService.updateDocumentType(documentId, newType)
      // 백그라운드에서 동기화 (선택적)
      void refresh()
    } catch (error) {
      console.error('[DocumentsTab] 문서 유형 변경 실패:', error)
      // 🍎 실패 시 롤백
      updateDocumentLocally(documentId, { document_type: previousType })
      errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDocTypeChange' })
      await showAlert({
        title: '변경 실패',
        message: '문서 유형 변경에 실패했습니다.',
        confirmText: '확인'
      })
    } finally {
      setUpdatingDocTypeId(null)
    }
  }, [updatingDocTypeId, documents, updateDocumentLocally, refresh, showAlert])

  // 🍎 문서 컨텍스트 메뉴 상태
  const documentContextMenu = useContextMenu()
  const [contextMenuDocument, setContextMenuDocument] = useState<CustomerDocumentItem | null>(null)

  // 🍎 AI 요약 모달 상태
  const [isSummaryModalVisible, setIsSummaryModalVisible] = useState(false)
  const [summaryDocument, setSummaryDocument] = useState<CustomerDocumentItem | null>(null)

  /**
   * PDF 변환 재시도 핸들러
   */
  const handleRetryPdfConversion = useCallback(async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 이벤트 버블링 방지

    if (retryingDocumentId) return // 이미 재시도 중이면 무시

    setRetryingDocumentId(documentId)
    try {
      const result = await api.post<{ success: boolean; message?: string; error?: string }>(
        `/api/documents/${documentId}/retry`,
        { stage: 'pdf_conversion' }
      )

      if (result.success) {
        await showAlert({
          title: '재시도 시작',
          message: 'PDF 변환을 다시 시도하고 있습니다.',
          confirmText: '확인'
        })
        // 목록 새로고침
        await refresh()
      } else {
        await showAlert({
          title: '재시도 실패',
          message: result.error || '재시도에 실패했습니다.',
          confirmText: '확인'
        })
      }
    } catch (error) {
      console.error('[DocumentsTab] PDF 변환 재시도 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleRetryPdfConversion', payload: { documentId } })
      await showAlert({
        title: '오류',
        message: '재시도 중 오류가 발생했습니다.',
        confirmText: '확인'
      })
    } finally {
      setRetryingDocumentId(null)
    }
  }, [retryingDocumentId, refresh, showAlert])

  // 🍎 자동 모드일 때 컨테이너 높이 기반 항목 수 계산
  // ⚠️ CustomerFullDetailView에서는 .customer-documents__header가 display:none으로 숨겨지고
  //    페이지네이션 높이도 26px로 오버라이드됨. 따라서 실제 DOM 요소 높이를 측정해야 함.
  const autoCalculatedItems = useMemo(() => {
    // 📱 모바일(≤768px): 페이지네이션 숨김 → 전체 표시 (스크롤 처리)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 9999
    }
    if (containerHeight <= 0) return 10 // 기본값

    const container = sectionContainerRef.current
    if (!container) return 10

    // 요약 헤더 높이 측정 (CustomerFullDetailView에서는 display:none → 0)
    const summaryHeader = container.querySelector('.customer-documents__header') as HTMLElement | null
    const summaryHeight = summaryHeader ? summaryHeader.getBoundingClientRect().height : 0

    // 리스트 헤더 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const listHeader = container.querySelector('.customer-documents-list-header') as HTMLElement | null
    const measuredListHeaderHeight = listHeader ? listHeader.getBoundingClientRect().height : 0
    const listHeaderHeight = measuredListHeaderHeight > 0 ? measuredListHeaderHeight : DEFAULT_LIST_HEADER_HEIGHT

    // 페이지네이션 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const pagination = container.querySelector('.document-pagination') as HTMLElement | null
    const measuredPaginationHeight = pagination ? pagination.getBoundingClientRect().height : 0
    const paginationHeight = measuredPaginationHeight > 0 ? measuredPaginationHeight : DEFAULT_PAGINATION_HEIGHT

    // 카테고리 필터 바 높이 측정
    const filterBar = container.querySelector('.document-category-filter-bar') as HTMLElement | null
    const filterBarHeight = filterBar ? filterBar.getBoundingClientRect().height : 0

    // 컨테이너 gap 측정 (요약 헤더가 보일 때만 적용)
    const containerStyle = getComputedStyle(container)
    const gap = parseFloat(containerStyle.gap) || 0

    // fixedHeight 계산: 실제 보이는 요소들의 높이 합
    const fixedHeight = summaryHeight + (summaryHeight > 0 ? gap : 0) + filterBarHeight + listHeaderHeight + paginationHeight
    const availableHeight = containerHeight - fixedHeight

    // N개 행의 총 높이 = N * ROW_HEIGHT + (N-1) * ROW_GAP
    // 이를 풀면: N <= (availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)
    const maxItems = Math.max(1, Math.floor((availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)))

    // 디버그 로그 (개발 모드에서만)
    if (import.meta.env.DEV) {
      console.log('[DocumentsTab] 자동 페이지네이션 계산:', {
        containerHeight,
        summaryHeight,
        listHeaderHeight: `${measuredListHeaderHeight} → ${listHeaderHeight}`,
        paginationHeight: `${measuredPaginationHeight} → ${paginationHeight}`,
        gap,
        fixedHeight,
        availableHeight,
        maxItems
      })
    }

    return maxItems
  }, [containerHeight])

  // 🍎 실제 적용되는 페이지당 항목 수
  const itemsPerPage = itemsPerPageMode === 'auto' ? autoCalculatedItems : itemsPerPageMode

  // 🍎 섹션 컨테이너 높이 측정 (ResizeObserver)
  useEffect(() => {
    const container = sectionContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // 🍎 SSE 실시간 업데이트 (폴링 대체) - 통합 SSE 사용
  // HTTP/1.1 연결 제한 문제 해결을 위해 개별 SSE 대신 통합 SSE 사용
  useCustomerSSE(customer?._id, {
    onRefreshDocuments: refresh,
  }, {
    enabled: Boolean(customer?._id),
  })

  // 🍎 PDF 변환 상태 폴링 fallback (SSE 알림 누락 대비)
  // conversion_status가 'processing' 또는 'pending'인 문서가 있으면 5초마다 새로고침
  useEffect(() => {
    const hasProcessingConversion = documents.some(doc => {
      const conversionStatus = doc.conversionStatus
      return conversionStatus === 'processing' || conversionStatus === 'pending'
    })

    if (!hasProcessingConversion) return

    if (import.meta.env.DEV) {
      console.log('[DocumentsTab] PDF 변환 중인 문서 감지, 폴링 시작')
    }

    const pollInterval = setInterval(() => {
      if (import.meta.env.DEV) {
        console.log('[DocumentsTab] PDF 변환 상태 폴링 실행')
      }
      void refresh()
    }, 5000) // 5초마다 새로고침

    return () => {
      if (import.meta.env.DEV) {
        console.log('[DocumentsTab] PDF 변환 폴링 중지')
      }
      clearInterval(pollInterval)
    }
  }, [documents, refresh])

  // 🍎 외부 refreshTrigger 변경 시 새로고침 (RightPane visibility 변경)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      if (import.meta.env.DEV) {
        console.log('[DocumentsTab] refreshTrigger 변경 감지, 새로고침 실행:', refreshTrigger)
      }
      void refresh()
    }
  }, [refreshTrigger, refresh])

  // 🍎 드롭다운 옵션 (자동 모드일 때 계산된 값 표시)
  const itemsPerPageOptions = useMemo(() => {
    return ITEMS_PER_PAGE_OPTIONS_BASE.map(opt => {
      if (opt.value === 'auto') {
        return {
          value: 'auto',
          label: itemsPerPageMode === 'auto' ? `자동(${autoCalculatedItems})` : '자동'
        }
      }
      return opt
    })
  }, [itemsPerPageMode, autoCalculatedItems])

  // 🍎 정렬 상태
  const [sortField, setSortField] = useState<SortField>('linkedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // 🍎 파일명 검색 상태 (외부에서 전달받거나 내부 상태 사용)
  const [internalSearchTerm, setInternalSearchTerm] = useState('')
  const searchTerm = externalSearchTerm ?? internalSearchTerm
  const setSearchTerm = onSearchChange ?? setInternalSearchTerm

  // 🍎 메모 모달 상태
  const [notesModalVisible, setNotesModalVisible] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<{
    documentName: string
    customerName?: string | undefined
    documentId?: string | undefined
    notes: string
  } | null>(null)

  // 🍎 삭제 기능 상태 (DocumentLibraryView와 동일)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // 🍎 간편 문서검색 상태
  const [simpleSearchQuery, setSimpleSearchQuery] = useState('')
  const [isContentSearchModalOpen, setIsContentSearchModalOpen] = useState(false)
  const documentSearch = useDocumentSearch()
  const { addRecentCustomer } = useRecentCustomersStore()

  // 🍎 간편 문서검색 핸들러 - 문서 내용 검색 모달 열기
  const handleSimpleSearch = useCallback(() => {
    if (!simpleSearchQuery.trim()) return
    setIsContentSearchModalOpen(true)
  }, [simpleSearchQuery])

  // 🍎 문서 상세 검색 이동 핸들러 - 문서 검색 페이지로 이동
  const handleGoToDetailSearch = useCallback(() => {
    if (!onNavigate) return

    // 🍎 고객을 최근 고객 목록에 추가 (문서 검색 페이지에서 자동 선택용)
    addRecentCustomer(customer)

    // 🍎 검색 상태 초기화 후 고객만 설정 (바로 타이핑 가능하도록)
    documentSearch.handleReset()
    documentSearch.handleCustomerIdChange(customer._id)

    // 문서 검색 페이지로 이동
    onNavigate('documents-search')
  }, [onNavigate, documentSearch, customer, addRecentCustomer])

  // 🍎 간편 문서검색 Enter 키 핸들러
  const handleSimpleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSimpleSearch()
    }
  }, [handleSimpleSearch])

  // 🍎 동적 칼럼 폭 계산: 파일명(originalName) 기준 (+ 정렬 아이콘)
  const filenameColumnWidth = useMemo(() => {
    if (documents.length === 0) return 200; // 기본값
    const maxLength = Math.max(...documents.map(d => (d.originalName || '').length));
    // 글자당 약 7px + 정렬 아이콘, 최소 150px, 최대 415px
    const calculatedWidth = Math.max(150, Math.min(415, maxLength * 7 + 40 + SORT_ICON_WIDTH));
    return calculatedWidth;
  }, [documents]);

  // 🍎 동적 칼럼 폭 계산: 연결일(linkedAt) 기준 (+ 정렬 아이콘)
  const dateColumnWidth = useMemo(() => {
    if (documents.length === 0) return 130; // 기본값
    // 연결일 형식: "2025-11-29 10:03:22" (약 19자)
    const maxLength = Math.max(
      ...documents.map(d => {
        const linkedAt = d.linkedAt ?? d.uploadedAt ?? null;
        const formatted = formatDateTimeCompact(linkedAt);
        return formatted.length;
      })
    );
    // 글자당 약 7px + 정렬 아이콘, 최소 100px, 최대 195px
    const calculatedWidth = Math.max(100, Math.min(195, maxLength * 7 + 16 + SORT_ICON_WIDTH));
    return calculatedWidth;
  }, [documents]);

  // 🍎 동적 칼럼 폭 계산: 크기(fileSize) 기준 (+ 정렬 아이콘)
  const sizeColumnWidth = useMemo(() => {
    if (documents.length === 0) return 70; // 기본값
    const maxLength = Math.max(
      ...documents.map(d => {
        const sizeLabel = d.fileSize ? DocumentUtils.formatFileSize(d.fileSize) : '-';
        return sizeLabel.length;
      })
    );
    // 글자당 약 7px + 정렬 아이콘, 최소 50px, 최대 115px
    const calculatedWidth = Math.max(50, Math.min(115, maxLength * 7 + 16 + SORT_ICON_WIDTH));
    return calculatedWidth;
  }, [documents]);

  // 🍎 컬럼 리사이즈: 기본 폭 계산
  const defaultColumnWidths = useMemo(() => ({
    filename: filenameColumnWidth,
    docType: DEFAULT_DOCTYPE_WIDTH,
    size: sizeColumnWidth,
    type: DEFAULT_TYPE_WIDTH,
    date: dateColumnWidth,
  }), [filenameColumnWidth, sizeColumnWidth, dateColumnWidth])

  // 🍎 컬럼 리사이즈 훅
  const {
    columnWidths,
    isResizing,
    getResizeHandleProps,
    wasJustResizing
  } = useColumnResize({
    storageKey: 'documents-tab',
    columns: DOCUMENTS_COLUMNS,
    defaultWidths: defaultColumnWidths
  })

  // 🍎 정렬 핸들러 (useColumnResize 훅 뒤에 정의)
  const handleSort = useCallback((field: SortField) => {
    // 리사이즈 직후 클릭은 무시 (정렬 방지)
    if (wasJustResizing()) return

    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1)
  }, [sortField, wasJustResizing])

  // 🍎 검색어로 필터링된 문서 목록
  const filteredDocuments = useMemo(() => {
    let result = documents

    // 카테고리 필터
    if (selectedCategory) {
      result = result.filter(doc => {
        const docType = doc.document_type || (doc.isAnnualReport ? 'annual_report' : '')
        return getCategoryForType(docType) === selectedCategory
      })
    }

    // 검색어 필터
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      result = result.filter(doc =>
        (doc.displayName ?? '').toLowerCase().includes(term) ||
        (doc.originalName ?? '').toLowerCase().includes(term)
      )
    }

    return result
  }, [documents, searchTerm, selectedCategory])

  // 🍎 문서유형 정렬용 라벨 맵 생성 (한글 라벨 기준 가나다순 - 백엔드와 동일)
  const docTypeLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    map.set('', '-')
    // DB 기반 캐시에서 가져옴
    Object.entries(getDocumentTypeLabelsMap()).forEach(([value, label]) => {
      map.set(value, label)
    })
    return map
  }, [])

  // 🍎 정렬된 문서 목록
  const sortedDocuments = useMemo(() => {
    const sorted = [...filteredDocuments].sort((a, b) => {
      let compareResult = 0

      switch (sortField) {
        case 'originalName':
          compareResult = (a.originalName ?? '').localeCompare(b.originalName ?? '', 'ko')
          break
        case 'fileSize':
          compareResult = (a.fileSize ?? 0) - (b.fileSize ?? 0)
          break
        case 'linkedAt': {
          const aDate = a.linkedAt ?? a.uploadedAt ?? ''
          const bDate = b.linkedAt ?? b.uploadedAt ?? ''
          compareResult = aDate.localeCompare(bDate)
          break
        }
        case 'mimeType':
          compareResult = (a.mimeType ?? '').localeCompare(b.mimeType ?? '')
          break
        case 'docType': {
          // 🍎 한글 라벨 기준 가나다순 정렬 (백엔드와 100% 동일)
          const aType = a.document_type || (a.isAnnualReport ? 'annual_report' : '')
          const bType = b.document_type || (b.isAnnualReport ? 'annual_report' : '')
          // value를 한글 라벨로 변환
          const aLabel = docTypeLabelMap.get(aType) ?? aType
          const bLabel = docTypeLabelMap.get(bType) ?? bType
          // 한글 가나다순 정렬
          compareResult = aLabel.localeCompare(bLabel, 'ko')
          break
        }
        default:
          return 0
      }

      return sortDirection === 'asc' ? compareResult : -compareResult
    })
    return sorted
  }, [filteredDocuments, sortField, sortDirection, docTypeLabelMap])

  // 🍎 페이지네이션 계산
  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedDocuments = sortedDocuments.slice(startIndex, endIndex)

  // 🍎 페이지 변경
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // 🍎 페이지당 항목 수 변경 ('auto' 또는 숫자)
  const handleLimitChange = useCallback((value: string) => {
    if (value === 'auto') {
      setItemsPerPageMode('auto')
    } else {
      setItemsPerPageMode(Number(value))
    }
    setCurrentPage(1)
  }, [])

  // 🍎 documentLinked 이벤트 리스너 (문서 연결 시 즉시 반영)
  React.useEffect(() => {
    const handleDocumentLinked = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        documentId: string
        customerId: string
        timestamp: string
      }>

      if (import.meta.env.DEV) {
        console.log('[DocumentsTab] documentLinked 이벤트 수신:', customEvent.detail)
      }

      // 현재 고객의 문서가 연결된 경우에만 새로고침
      if (customEvent.detail.customerId === customer?._id) {
        if (import.meta.env.DEV) {
          console.log('[DocumentsTab] 현재 고객의 문서 연결됨 - 자동 새로고침')
        }
        await refresh()
      }
    }

    window.addEventListener('documentLinked', handleDocumentLinked)
    return () => {
      window.removeEventListener('documentLinked', handleDocumentLinked)
    }
  }, [customer?._id, refresh])

  const handlePreview = useCallback(
    (document: CustomerDocumentItem) => {
      void openPreview(document)
    },
    [openPreview]
  )

  const handleDownload = useCallback(async () => {
    const preview = previewState.data
    if (!preview?.rawDetail) return
    await DownloadHelper.downloadDocument({
      _id: preview.id,
      ...(preview.rawDetail as Record<string, unknown>)
    })
  }, [previewState.data])

  // 🍎 문서 컨텍스트 메뉴 핸들러
  const handleDocumentContextMenu = useCallback((document: CustomerDocumentItem, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenuDocument(document)
    documentContextMenu.open(event)
  }, [documentContextMenu])

  // 🍎 문서 컨텍스트 메뉴 섹션
  const documentContextMenuSections: ContextMenuSection[] = useMemo(() => {
    if (!contextMenuDocument) return []

    const documentId = contextMenuDocument._id
    const documentName = contextMenuDocument.originalName ?? '문서'

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
              handlePreview(contextMenuDocument)
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
            onClick: () => {
              // AI 요약 모달 열기
              setSummaryDocument(contextMenuDocument)
              setIsSummaryModalVisible(true)
            }
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
                errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDownload', payload: { documentId } })
              }
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
            onClick: async () => {
              if (!documentId) return
              // 삭제 확인
              const confirmed = await confirmController.actions.openModal({
                title: '문서 삭제',
                message: `"${documentName}"을(를) 삭제하시겠습니까?\n\n삭제된 문서는 복구할 수 없습니다.`,
                confirmText: '삭제',
                cancelText: '취소',
                confirmStyle: 'destructive',
                showCancel: true,
                iconType: 'warning'
              })
              if (!confirmed) return

              // 🍎 AR 문서인지 먼저 확인 (삭제 전에)
              const isArDocument = contextMenuDocument?.isAnnualReport
              const isCustomerReview = contextMenuDocument?.document_type === 'customer_review'

              try {
                await api.delete(`/api/documents/${documentId}`)
                await refresh()
                onRefresh?.()
                if (onDocumentLibraryRefresh) {
                  await onDocumentLibraryRefresh()
                }
                // 🍎 AR 문서 삭제 시 Annual Report 탭 즉시 새로고침
                if (isArDocument) {
                  onAnnualReportNeedRefresh?.()
                }
                // 🍎 Customer Review 문서 삭제 시 고객리뷰 탭 즉시 새로고침
                if (isCustomerReview) {
                  onCustomerReviewNeedRefresh?.()
                }
              } catch (error) {
                console.error('[DocumentsTab] 문서 삭제 실패:', error)
                errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDelete', payload: { documentId } })
                showAlert({
                  title: '삭제 실패',
                  message: '문서 삭제 중 오류가 발생했습니다.',
                  iconType: 'error'
                })
              }
            }
          }
        ]
      }
    ]
  }, [contextMenuDocument, handlePreview, confirmController.actions, refresh, onRefresh, onDocumentLibraryRefresh, onAnnualReportNeedRefresh, onCustomerReviewNeedRefresh, showAlert])

  /**
   * 메모 저장 핸들러
   */
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.documentId || !customer?._id) {
      console.error('[DocumentsTab] documentId 또는 customer._id가 없습니다')
      errorReporter.reportApiError(new Error('documentId 또는 customer._id 누락'), { component: 'DocumentsTab.handleSaveNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        customer._id,
        selectedNotes.documentId,
        notes
      )

      // 성공 후 상태 업데이트
      setSelectedNotes(prev => prev ? { ...prev, notes } : null)

      // 문서 목록 새로고침
      await refresh()
    } catch (error) {
      console.error('[DocumentsTab] 메모 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleSaveNotes', payload: { documentId: selectedNotes.documentId } })
      showAlert({
        title: '저장 실패',
        message: '메모 저장에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, customer, refresh, showAlert])

  /**
   * 메모 삭제 핸들러 (빈 문자열로 저장)
   */
  const handleDeleteNotes = useCallback(async () => {
    if (!selectedNotes?.documentId || !customer?._id) {
      console.error('[DocumentsTab] documentId 또는 customer._id가 없습니다')
      errorReporter.reportApiError(new Error('documentId 또는 customer._id 누락'), { component: 'DocumentsTab.handleDeleteNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        customer._id,
        selectedNotes.documentId,
        ''
      )

      // 모달 닫기
      setNotesModalVisible(false)
      setSelectedNotes(null)

      // 문서 목록 새로고침
      await refresh()
    } catch (error) {
      console.error('[DocumentsTab] 메모 삭제 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDeleteNotes', payload: { documentId: selectedNotes.documentId } })
      showAlert({
        title: '삭제 실패',
        message: '메모 삭제에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, customer, refresh, showAlert])

  // 🍎 삭제 모드 토글 핸들러 (DocumentLibraryView와 동일)
  const handleToggleDeleteMode = useCallback(() => {
    if (isDeleteMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
  }, [isDeleteMode])

  // 🍎 전체 선택/해제 핸들러
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = paginatedDocuments
        .map(doc => doc._id)
        .filter((id): id is string => id !== undefined && id !== null)
      setSelectedDocumentIds(new Set(allIds))
    } else {
      setSelectedDocumentIds(new Set())
    }
  }, [paginatedDocuments])

  // 🍎 개별 선택/해제 핸들러
  const handleSelectDocument = useCallback((documentId: string, event: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => {
    event.stopPropagation()
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

  // 🍎 문서 삭제 핸들러 (DocumentLibraryView와 동일)
  const handleDeleteSelected = useCallback(async () => {
    if (selectedDocumentIds.size === 0) {
      await confirmController.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 문서를 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
      })
      return
    }

    // 확인 모달 표시
    const confirmed = await confirmController.actions.openModal({
      title: '문서 삭제',
      message: `선택한 ${selectedDocumentIds.size}개의 문서를 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
    })

    if (!confirmed) return

    // 🍎 삭제될 문서 중 AR 문서 또는 AR 분석 중인 문서가 있는지 확인
    const hasArDocument = documents.some(
      doc => selectedDocumentIds.has(doc._id) && (
        doc.isAnnualReport ||
        doc.ar_parsing_status === 'processing' ||
        doc.ar_parsing_status === 'pending'
      )
    )
    // 🍎 삭제될 문서 중 Customer Review 문서가 있는지 확인
    const hasCustomerReview = documents.some(
      doc => selectedDocumentIds.has(doc._id) && doc.document_type === 'customer_review'
    )

    try {
      setIsDeleting(true)

      // 선택된 모든 문서 삭제 (api 모듈 사용 - 토큰/헤더 자동 처리)
      const deletePromises = Array.from(selectedDocumentIds).map(async (docId) => {
        try {
          await api.delete(`/api/documents/${docId}`)
          return { success: true, docId }
        } catch (error) {
          const message = error instanceof ApiError ? error.message : `Failed to delete document ${docId}`
          console.error(`Error deleting document ${docId}:`, message)
          errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDeleteSelected.item', payload: { docId } })
          return { success: false, docId, error }
        }
      })

      const results = await Promise.all(deletePromises)
      const failedDeletes = results.filter((r) => !r.success)

      // 삭제된 문서가 RP에 표시 중이면 RP 닫기
      const successIds = results.filter((r) => r.success).map((r) => r.docId)
      if (successIds.length > 0) {
        onDocumentDeleted?.(successIds)
      }

      // 선택 초기화 및 삭제 모드 종료
      setSelectedDocumentIds(new Set())
      setIsDeleteMode(false)
      setIsDeleting(false) // 모달 표시 전에 상태 복원

      // 부모 컴포넌트에 삭제 완료 알림
      onRefresh?.()

      // 문서 목록 새로고침
      await refresh()

      // 🍎 문서 라이브러리 즉시 새로고침
      if (onDocumentLibraryRefresh) {
        await onDocumentLibraryRefresh()
      }

      // 🍎 AR 문서가 삭제되었으면 Annual Report 탭 즉시 새로고침
      if (hasArDocument) {
        onAnnualReportNeedRefresh?.()
      }
      // 🍎 Customer Review 문서가 삭제되었으면 고객리뷰 탭 즉시 새로고침
      if (hasCustomerReview) {
        onCustomerReviewNeedRefresh?.()
      }

      // 실패한 경우만 오류 모달 표시
      if (failedDeletes.length > 0) {
        await confirmController.actions.openModal({
          title: '삭제 실패',
          message: `${failedDeletes.length}개의 문서 삭제에 실패했습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      }
      // 성공한 경우: 모달 없이 바로 종료 (즉시 UI 반영됨)
    } catch (error) {
      console.error('Error in handleDeleteSelected:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentsTab.handleDeleteSelected' })
      setIsDeleting(false) // 에러 발생 시에도 상태 복원
      await confirmController.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [selectedDocumentIds, documents, confirmController, onRefresh, refresh, onDocumentLibraryRefresh, onAnnualReportNeedRefresh, onCustomerReviewNeedRefresh, onDocumentDeleted])

  const renderState = () => {
    if (isLoading && documents.length === 0) {
      return (
        <div className="customer-documents__state customer-documents__state--loading">
          <SFSymbol
            name='arrow.clockwise'
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>문서 데이터를 불러오는 중입니다...</span>
        </div>
      )
    }

    if (error && documents.length === 0) {
      return (
        <div className="customer-documents__state customer-documents__state--error">
          <SFSymbol
            name='exclamationmark.triangle.fill'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>{error}</span>
          <button
            type="button"
            className="customer-documents__retry"
            onClick={() => void refresh()}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (isEmpty) {
      return (
        <div className="customer-documents__state customer-documents__state--empty">
          <SFSymbol
            name='folder.badge.questionmark'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>연결된 문서가 없습니다.</span>
        </div>
      )
    }

    return null
  }

  const lastUpdatedLabel = lastUpdated
    ? formatDateTime(new Date(lastUpdated).toISOString())
    : null

  return (
    <div ref={sectionContainerRef} className={`customer-documents ${isDeleteMode ? 'customer-documents--delete-mode' : ''}`}>
      <div className="customer-documents__header">
        <div className="customer-documents__summary">
          {/* 🍎 삭제 버튼 (DEV 모드에서만 표시) */}
          {isDevMode && (
            <Tooltip content={isDeleteMode ? '삭제 완료' : '삭제'}>
              <button
                className={`edit-mode-icon-button ${isDeleteMode ? 'edit-mode-icon-button--active' : ''}`}
                onClick={handleToggleDeleteMode}
                aria-label={isDeleteMode ? '삭제 완료' : '삭제'}
              >
                {isDeleteMode ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <SFSymbol
                    name="trash"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                )}
              </button>
            </Tooltip>
          )}

          <span className="customer-documents__count">
            총 <strong>{documentCount}</strong>건 연결됨
          </span>

          {/* 🍎 삭제 모드일 때: 선택된 개수 + 삭제 버튼 */}
          {isDeleteMode && (
            <>
              <span className="selected-count-inline">
                {selectedDocumentIds.size}개 선택됨
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeleting || selectedDocumentIds.size === 0}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </Button>
            </>
          )}

          {!isDeleteMode && lastUpdatedLabel && (
            <span className="customer-documents__updated">
              마지막 동기화: {lastUpdatedLabel}
            </span>
          )}
        </div>
      </div>

      {/* 카테고리 필터 + 확대 버튼 */}
      {(() => {
        const showFilter = !isEmpty && documents.length > 0
        const showExpand = !!onExpandToExplorer
        if (!showFilter && !showExpand) return null

        const filterBarContent = (
          <>
            {showFilter && (
              <DocumentCategoryFilter
                documents={documents}
                selectedCategory={selectedCategory}
                onCategoryChange={(cat) => {
                  setSelectedCategory(cat)
                  setCurrentPage(1)
                }}
              />
            )}
            {showExpand && (
              <button
                type="button"
                className="document-expand-btn"
                onClick={onExpandToExplorer}
                aria-label="문서 분류함 보기"
              >
                <span className="document-expand-btn__icon">📂</span>
                <span className="document-expand-btn__label">문서 분류함</span>
              </button>
            )}
          </>
        )

        // 포탈 타겟이 있으면 섹션 헤더에 렌더링, 없으면 인라인 렌더링
        if (filterBarPortalTarget) {
          return createPortal(filterBarContent, filterBarPortalTarget)
        }

        return (
          <div className="document-category-filter-bar">
            {filterBarContent}
          </div>
        )
      })()}

      {renderState()}

      {!isEmpty && documents.length > 0 && (
        <>
          {/* 🍎 리스트 컨테이너 - CenterPane 스타일 */}
          <div
            ref={(el) => {
              if (el) {
                el.style.setProperty('--filename-column-width', `${columnWidths['filename'] || filenameColumnWidth}px`);
                el.style.setProperty('--doctype-column-width', `${columnWidths['docType'] || DEFAULT_DOCTYPE_WIDTH}px`);
                el.style.setProperty('--size-column-width', `${columnWidths['size'] || sizeColumnWidth}px`);
                el.style.setProperty('--type-column-width', `${columnWidths['type'] || DEFAULT_TYPE_WIDTH}px`);
                el.style.setProperty('--date-column-width', `${columnWidths['date'] || dateColumnWidth}px`);
              }
            }}
            className={`tab-table__scroll customer-documents__list-container${isResizing ? ' is-resizing' : ''}`}
          >
            {/* 🍎 칼럼 헤더 - CenterPane과 동일 */}
            <div className="tab-table__header customer-documents-list-header">
              {/* 🍎 삭제 모드일 때만 체크박스 표시 */}
              {isDeleteMode && (
                <div className="header-checkbox">
                  <input
                    type="checkbox"
                    className="document-select-all-checkbox"
                    checked={selectedDocumentIds.size === paginatedDocuments.length && paginatedDocuments.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="전체 선택"
                  />
                </div>
              )}
              <div className="header-icon"></div>
              <div
                className="header-filename header-sortable resizable-header"
              >
                <div
                  className="header-filename__sort-area"
                  onClick={() => handleSort('originalName')}
                  role="button"
                  tabIndex={0}
                  aria-label="파일명으로 정렬"
                >
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
                    <path d="M9 1v3h3" stroke="#f5f6f7" strokeWidth="0.8" fill="none"/>
                  </svg>
                  <span>파일명</span>
                  <SortIndicator field="originalName" currentSortField={sortField} sortDirection={sortDirection} />
                </div>
                {/* 🍎 파일명 표시 모드 토글: 원본 ↔ 별칭 */}
                <Tooltip content={filenameMode === 'display' ? 'AI가 지어준 별칭으로 표시 중 · 클릭하면 원본 파일명으로 전환' : '원본 파일명 표시 중 · 클릭하면 AI가 지어준 별칭으로 전환'}>
                  <button
                    type="button"
                    className={`filename-mode-toggle ${filenameMode === 'display' ? 'filename-mode-toggle--alias' : 'filename-mode-toggle--original'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      const next = filenameMode === 'display' ? 'original' : 'display'
                      setFilenameMode(next)
                      localStorage.setItem('aims-filename-mode', next)
                    }}
                    aria-label={filenameMode === 'display' ? 'AI가 지어준 별칭으로 표시 중 · 클릭하면 원본 파일명으로 전환' : '원본 파일명 표시 중 · 클릭하면 AI가 지어준 별칭으로 전환'}
                  >
                    {filenameMode === 'display' ? '별칭' : '원본'}
                  </button>
                </Tooltip>
                <div {...getResizeHandleProps('filename')} />
              </div>
              {/* 🍎 문서 유형 칼럼 헤더 */}
              <div
                className="header-doctype header-sortable resizable-header"
                onClick={() => handleSort('docType')}
                role="button"
                tabIndex={0}
                aria-label="문서유형으로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h10v2H2v-2z" fill="currentColor"/>
                </svg>
                <span>문서유형</span>
                <SortIndicator field="docType" currentSortField={sortField} sortDirection={sortDirection} />
                <div {...getResizeHandleProps('docType')} />
              </div>
              <div
                className="header-size header-sortable resizable-header"
                onClick={() => handleSort('fileSize')}
                role="button"
                tabIndex={0}
                aria-label="크기로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M8 2v6l4 2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>크기</span>
                <SortIndicator field="fileSize" currentSortField={sortField} sortDirection={sortDirection} />
                <div {...getResizeHandleProps('size')} />
              </div>
              <div
                className="header-type header-sortable resizable-header"
                onClick={() => handleSort('mimeType')}
                role="button"
                tabIndex={0}
                aria-label="타입으로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M5 5h2M5 8h4M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>타입</span>
                <SortIndicator field="mimeType" currentSortField={sortField} sortDirection={sortDirection} />
                <div {...getResizeHandleProps('type')} />
              </div>
              <div
                className="header-date header-sortable resizable-header"
                onClick={() => handleSort('linkedAt')}
                role="button"
                tabIndex={0}
                aria-label="연결일로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M2 6h12M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>연결일</span>
                <SortIndicator field="linkedAt" currentSortField={sortField} sortDirection={sortDirection} />
                <div {...getResizeHandleProps('date')} />
              </div>
            </div>

            {/* 🍎 문서 리스트 - CenterPane과 동일한 구조 */}
            {paginatedDocuments.map((document, index) => {
              const linkedAt = document.linkedAt ?? document.uploadedAt ?? null
              const formattedDate = formatDateTimeCompact(linkedAt)
              const sizeLabel = document.fileSize ? DocumentUtils.formatFileSize(document.fileSize) : '-'
              const documentId = document._id ?? `doc-${index}`

              return (
                <div
                  key={documentId}
                  className={`tab-table__row customer-documents-item ${selectedDocumentIds.has(document._id ?? '') ? 'customer-documents-item--selected' : ''}`}
                  onContextMenu={(e) => handleDocumentContextMenu(document, e)}
                >
                  {/* 🍎 삭제 모드일 때만 체크박스 표시 */}
                  {isDeleteMode && document._id && (
                    <div className="document-checkbox-wrapper">
                      <input
                        type="checkbox"
                        className="document-checkbox"
                        checked={selectedDocumentIds.has(document._id)}
                        onChange={(e) => handleSelectDocument(document._id!, e)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${document.originalName ?? '문서'} 선택`}
                      />
                    </div>
                  )}
                  {/* 파일 타입 아이콘 */}
                  <div className="document-icon-wrapper">
                    <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, document.originalName)}`}>
                      <SFSymbol
                        name={DocumentUtils.getFileIcon(document.mimeType, document.originalName)}
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.REGULAR}
                        decorative={true}
                      />
                    </div>
                    {/* 🍎 AR BADGE: Annual Report 표시 */}
                    {document.isAnnualReport && (
                      <Tooltip content="연간보고서">
                        <div className="document-ar-badge">
                          AR
                        </div>
                      </Tooltip>
                    )}
                    {/* 🍎 CR BADGE: Customer Review (변액 리포트) 표시 */}
                    {document.document_type === 'customer_review' && !document.isAnnualReport && (
                      <Tooltip content="변액 리뷰">
                        <div className="document-cr-badge">
                          CR
                        </div>
                      </Tooltip>
                    )}
                    {/* 🍎 OCR/TXT/BIN BADGE: 공유 컴포넌트 */}
                    <DocumentTypeBadge document={document} />
                  </div>

                  {/* 파일명 */}
                  <div
                    className="status-filename status-filename--clickable"
                    onClick={() => handlePreview(document)}
                  >
                    {/* 🍎 파일명 표시: filenameMode에 따라 원본/별칭 전환 */}
                    {(() => {
                      const hasDisplay = Boolean(document.displayName)
                      const isAlias = filenameMode === 'display' && hasDisplay
                      const showName = isAlias
                        ? document.displayName!
                        : (document.originalName ?? '이름 없는 문서')
                      const altName = isAlias
                        ? `원본: ${document.originalName ?? ''}`
                        : (hasDisplay ? `별칭: ${document.displayName}` : '')

                      return (
                        <>
                          {altName ? (
                            <Tooltip content={altName}>
                              <span className={`status-filename-text${isAlias ? ' document-name--alias' : ''}`}>{showName}</span>
                            </Tooltip>
                          ) : (
                            <Tooltip content={showName} showOnlyWhenTruncated>
                              <span className={`status-filename-text${isAlias ? ' document-name--alias' : ''}`}>{showName}</span>
                            </Tooltip>
                          )}
                          <span className="status-filename-hover-actions" onClick={(e) => e.stopPropagation()}>
                            <Tooltip content="이름 변경">
                              <button
                                type="button"
                                className="hover-action-btn hover-action-btn--rename"
                                onClick={(e) => { e.stopPropagation(); handleRenameClick(document) }}
                                aria-label="이름 변경"
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </Tooltip>
                            <Tooltip content="삭제">
                              <button
                                type="button"
                                className="hover-action-btn hover-action-btn--delete"
                                onClick={(e) => { e.stopPropagation(); handleHoverDeleteClick(document) }}
                                aria-label="삭제"
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                  <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </Tooltip>
                          </span>
                        </>
                      )
                    })()}
                    {/* 🍎 PDF 변환 배지 - DocumentStatusList.tsx와 동일 */}
                    {(() => {
                      // 파일명에서 확장자 추출하여 변환 대상 여부 판단
                      const filename = document.originalName || ''
                      const extMatch = filename.match(/\.([^.]+)$/i)
                      const ext = extMatch ? extMatch[1].toLowerCase() : ''
                      const convertibleExts = ['pptx', 'ppt', 'xlsx', 'xls', 'docx', 'doc', 'hwp', 'txt']
                      const isConvertible = document.isConvertible ?? convertibleExts.includes(ext)

                      // 변환 대상이 아니면 배지 안 보임
                      if (!isConvertible) return null

                      // 변환 상태: API 값 우선
                      const conversionStatus = document.conversionStatus
                      if (!conversionStatus || conversionStatus === 'not_required') return null

                      // 상태별 툴팁
                      const tooltips: Record<string, string> = {
                        completed: 'PDF 변환 완료',
                        processing: 'PDF 변환 중...',
                        pending: 'PDF 변환 대기 중',
                        failed: 'PDF 변환 실패'
                      }
                      const tooltip = tooltips[conversionStatus] || ''

                      // 상태별 아이콘 (DocumentStatusList.tsx와 동일)
                      const statusIcons: Record<string, React.ReactNode> = {
                        completed: (
                          <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                            <circle cx="6" cy="6" r="5.5" fill="#34c759"/>
                            <path d="M3.5 6l2 2 3-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ),
                        processing: (
                          <svg className="pdf-badge-icon pdf-badge-icon--spin" viewBox="0 0 12 12">
                            <circle cx="6" cy="6" r="5" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="16 8" opacity="0.9"/>
                          </svg>
                        ),
                        pending: (
                          <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                            <circle cx="3" cy="6" r="1.5" fill="#fff"/>
                            <circle cx="6" cy="6" r="1.5" fill="#fff"/>
                            <circle cx="9" cy="6" r="1.5" fill="#fff"/>
                          </svg>
                        ),
                        failed: (
                          <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                            <circle cx="6" cy="6" r="5.5" fill="#fff"/>
                            <path d="M4 4l4 4M8 4l-4 4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        )
                      }
                      const icon = statusIcons[conversionStatus] || statusIcons['pending']

                      return (
                        <Tooltip content={tooltip}>
                          <span className={`pdf-conversion-badge pdf-conversion-badge--${conversionStatus}`}>
                            {icon}
                            <span className="pdf-badge-text">pdf</span>
                          </span>
                        </Tooltip>
                      )
                    })()}
                    {document.notes && typeof document.notes === 'string' && document.notes.trim() !== '' && (
                      <Tooltip
                        content={document.notes.length > 50 ? `${document.notes.substring(0, 50)}...` : document.notes}
                      >
                        <button
                          className="document-notes-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedNotes({
                              documentName: document.originalName ?? '이름 없는 문서',
                              customerName: customer.personal_info.name,
                              documentId: document._id,
                              notes: document.notes || ''
                            })
                            setNotesModalVisible(true)
                          }}
                          aria-label="메모 보기"
                        >
                          📝
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  {/* 🍎 문서 유형 - 공통 컴포넌트 사용 (Single Source of Truth) */}
                  <div className="document-doctype" onClick={(e) => e.stopPropagation()}>
                    <DocumentTypeCell
                      documentType={document.document_type}
                      isAnnualReport={document.isAnnualReport}
                      onChange={(newType) => {
                        const docId = document._id
                        if (docId) {
                          handleDocTypeChange(docId, newType)
                        }
                      }}
                      isUpdating={updatingDocTypeId === document._id}
                    />
                  </div>

                  {/* 크기 */}
                  <span className="document-size">
                    {sizeLabel}
                  </span>

                  {/* 타입 */}
                  <span className="document-type">
                    {document.mimeType ? DocumentUtils.getFileExtension(document.mimeType) : '-'}
                  </span>

                  {/* 연결일 */}
                  <div className="status-date">
                    {formattedDate}
                  </div>

                </div>
              )
            })}
          </div>

          {/* 🍎 페이지네이션 */}
          {totalPages > 0 && (
            <div className="tab-table__pagination document-pagination">
              <div className="pagination-limit">
                <Dropdown
                  value={itemsPerPageMode === 'auto' ? 'auto' : String(itemsPerPageMode)}
                  options={itemsPerPageOptions}
                  onChange={handleLimitChange}
                  aria-label="페이지당 항목 수"
                  width={100}
                />
              </div>

              {/* 🍎 간편 문서검색 */}
              {onNavigate && (
                <div className="simple-document-search">
                  <span className="simple-document-search__label">간편 문서검색</span>
                  <input
                    type="text"
                    className="simple-document-search__input"
                    placeholder="검색어 입력"
                    value={simpleSearchQuery}
                    onChange={(e) => setSimpleSearchQuery(e.target.value)}
                    onKeyDown={handleSimpleSearchKeyDown}
                    aria-label="간편 문서검색"
                  />
                  <Tooltip content="문서 내용 검색">
                  <button
                    type="button"
                    className="simple-document-search__btn"
                    onClick={handleSimpleSearch}
                    disabled={!simpleSearchQuery.trim()}
                    aria-label="검색"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                    </svg>
                  </button>
                  </Tooltip>
                  <span className="simple-document-search__divider">|</span>
                  <Tooltip content="문서 검색 페이지로 이동 (현재 고객 자동 선택)">
                    <div className="simple-document-search__detail-group">
                      <span className="simple-document-search__detail-label">상세 문서검색</span>
                      <button
                        type="button"
                        className="simple-document-search__detail-btn"
                        onClick={handleGoToDetailSearch}
                        aria-label="문서 상세 검색 이동"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                        </svg>
                      </button>
                    </div>
                  </Tooltip>
                </div>
              )}

              {totalPages > 1 ? (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              ) : (
                <div className="pagination-spacer"></div>
              )}
            </div>
          )}
        </>
      )}

      <CustomerDocumentPreviewModal
        visible={previewState.isOpen}
        isLoading={previewState.isLoading}
        error={previewState.error}
        document={previewState.data}
        onClose={closePreview}
        {...(previewTarget ? { onRetry: () => { void retryPreview() } } : {})}
        {...(previewState.data?.rawDetail ? { onDownload: handleDownload } : {})}
      />

      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />

      {selectedNotes && (
        <DocumentNotesModal
          visible={notesModalVisible}
          documentName={selectedNotes.documentName}
          customerName={selectedNotes.customerName}
          customerId={customer._id}
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

      {/* 🍎 간편 문서검색 모달 */}
      <DocumentContentSearchModal
        isOpen={isContentSearchModalOpen}
        onClose={() => {
          setIsContentSearchModalOpen(false)
          setSimpleSearchQuery('')
        }}
        customerId={customer._id}
        customerName={customer.personal_info?.name ?? ''}
        customerType={customer.insurance_info?.customer_type}
        initialQuery={simpleSearchQuery}
      />

      {/* 🍎 문서 컨텍스트 메뉴 */}
      <ContextMenu
        visible={documentContextMenu.isOpen}
        position={documentContextMenu.position}
        sections={documentContextMenuSections}
        onClose={documentContextMenu.close}
      />

      {/* 🍎 AI 요약 모달 */}
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={() => {
          setIsSummaryModalVisible(false)
          setSummaryDocument(null)
        }}
        document={summaryDocument as any}
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

export default DocumentsTab
