/**
 * AIMS UIX-3 Customer Detail - Documents Tab
 * @since 2025-10-25
 *
 * 🍎 CenterPane DocumentLibraryView 디자인 100% 복제
 * - 칼럼: 파일 타입 아이콘, 파일명, 크기, 연결일, 작업 (문서보기, 연결해제)
 * - 헤더 아이콘 및 스타일 동일
 * - 페이지네이션, 정렬 기능 포함
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import type { Customer } from '@/entities/customer/model'
import { Tooltip, Button, ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui'
import { Dropdown } from '@/shared/ui'
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
import {
  PreviewIcon,
  LinkIcon
} from '../../../../../components/DocumentViews/components/DocumentActionIcons'
import { DocumentNotesModal } from '../../../../../components/DocumentViews/DocumentStatusView/components/DocumentNotesModal'
import DocumentSummaryModal from '../../../../../components/DocumentViews/DocumentStatusView/components/DocumentSummaryModal'
import { useDocumentSearch } from '@/contexts/useDocumentSearch'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'
import { DocumentContentSearchModal } from '../../../components/DocumentContentSearchModal'
import './DocumentsTab.css'

interface DocumentsTabProps {
  customer: Customer
  onRefresh?: () => void
  onDocumentCountChange?: (count: number) => void
  onDocumentLibraryRefresh?: () => Promise<void>
  onAnnualReportNeedRefresh?: () => void
  /** 외부에서 전달받는 검색어 (CustomerFullDetailView에서 사용) */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
  /** 메뉴 네비게이션 핸들러 (간편 문서검색 → 문서 검색 페이지) */
  onNavigate?: (menuKey: string) => void
}

// 🍎 정렬 아이콘 폭 (font-size: 10px + gap: 4px)
const SORT_ICON_WIDTH = 14

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
type SortField = 'originalName' | 'fileSize' | 'linkedAt'
type SortDirection = 'asc' | 'desc'

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  customer,
  onRefresh,
  onDocumentCountChange,
  onDocumentLibraryRefresh,
  onAnnualReportNeedRefresh,
  searchTerm: externalSearchTerm,
  onSearchChange,
  onNavigate
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
    unlinkingId,
    lastUpdated,
    refresh,
    unlinkDocument,
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

  // 🍎 페이지네이션 상태 ('auto' 또는 숫자)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | number>('auto')
  const [containerHeight, setContainerHeight] = useState(0)
  const sectionContainerRef = useRef<HTMLDivElement>(null)

  // PDF 변환 재시도 중인 문서 ID
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null)

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

    // 컨테이너 gap 측정 (요약 헤더가 보일 때만 적용)
    const containerStyle = getComputedStyle(container)
    const gap = parseFloat(containerStyle.gap) || 0

    // fixedHeight 계산: 실제 보이는 요소들의 높이 합
    const fixedHeight = summaryHeight + (summaryHeight > 0 ? gap : 0) + listHeaderHeight + paginationHeight
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

  // 🍎 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1)
  }, [sortField])

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

  // 🍎 검색어로 필터링된 문서 목록
  const filteredDocuments = useMemo(() => {
    if (!searchTerm.trim()) return documents
    const term = searchTerm.toLowerCase().trim()
    return documents.filter(doc =>
      (doc.originalName ?? '').toLowerCase().includes(term)
    )
  }, [documents, searchTerm])

  // 🍎 정렬된 문서 목록
  const sortedDocuments = useMemo(() => {
    const sorted = [...filteredDocuments].sort((a, b) => {
      let aValue: string | number | null
      let bValue: string | number | null

      switch (sortField) {
        case 'originalName':
          aValue = a.originalName ?? ''
          bValue = b.originalName ?? ''
          break
        case 'fileSize':
          aValue = a.fileSize ?? 0
          bValue = b.fileSize ?? 0
          break
        case 'linkedAt':
          aValue = a.linkedAt ?? a.uploadedAt ?? ''
          bValue = b.linkedAt ?? b.uploadedAt ?? ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredDocuments, sortField, sortDirection])

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

  const handleUnlink = useCallback(
    async (document: CustomerDocumentItem) => {
      const confirmed = await confirmController.actions.openModal({
        title: '문서 연결 해제',
        message: `"${document.originalName ?? document._id}" 문서를 고객과의 연결에서 해제하시겠습니까?`,
        confirmText: '해제',
        cancelText: '취소',
        confirmStyle: 'destructive',
        showCancel: true,
        iconType: 'warning'
      })

      if (!confirmed) return

      await unlinkDocument(document._id)

      // 🍎 AR 문서인 경우 Annual Report 탭 즉시 새로고침
      if (document.isAnnualReport) {
        onAnnualReportNeedRefresh?.()
      }

      onRefresh?.()
      // 🍎 문서 라이브러리 즉시 새로고침
      if (onDocumentLibraryRefresh) {
        await onDocumentLibraryRefresh()
      }
    },
    [confirmController.actions, onRefresh, unlinkDocument, onDocumentLibraryRefresh, onAnnualReportNeedRefresh]
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
                }
              } catch (error) {
                console.error('다운로드 실패:', error)
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
              } catch (error) {
                console.error('[DocumentsTab] 문서 삭제 실패:', error)
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
  }, [contextMenuDocument, handlePreview, confirmController.actions, refresh, onRefresh, onDocumentLibraryRefresh, onAnnualReportNeedRefresh, showAlert])

  /**
   * 메모 저장 핸들러
   */
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.documentId || !customer?._id) {
      console.error('[DocumentsTab] documentId 또는 customer._id가 없습니다')
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

    // 🍎 삭제될 문서 중 AR 문서가 있는지 확인
    const hasArDocument = documents.some(
      doc => selectedDocumentIds.has(doc._id) && doc.isAnnualReport
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
          return { success: false, docId, error }
        }
      })

      const results = await Promise.all(deletePromises)
      const failedDeletes = results.filter((r) => !r.success)

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
      setIsDeleting(false) // 에러 발생 시에도 상태 복원
      await confirmController.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [selectedDocumentIds, documents, confirmController, onRefresh, refresh, onDocumentLibraryRefresh, onAnnualReportNeedRefresh])

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

      {renderState()}

      {!isEmpty && documents.length > 0 && (
        <>
          {/* 🍎 리스트 컨테이너 - CenterPane 스타일 */}
          <div
            className="customer-documents__list-container"
            style={{
              '--filename-column-width': `${filenameColumnWidth}px`,
              '--size-column-width': `${sizeColumnWidth}px`,
              '--date-column-width': `${dateColumnWidth}px`,
            } as React.CSSProperties}
          >
            {/* 🍎 칼럼 헤더 - CenterPane과 동일 */}
            <div className="customer-documents-list-header">
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
                className="header-filename header-sortable"
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
                {sortField === 'originalName' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </div>
              <div
                className="header-size header-sortable"
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
                {sortField === 'fileSize' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </div>
              <div className="header-type">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M5 5h2M5 8h4M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>타입</span>
              </div>
              <div
                className="header-date header-sortable"
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
                {sortField === 'linkedAt' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </div>
              <div className="header-actions">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                  <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                </svg>
                <span>작업</span>
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
                  className={`customer-documents-item ${selectedDocumentIds.has(document._id ?? '') ? 'customer-documents-item--selected' : ''}`}
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
                      <Tooltip content="Annual Report">
                        <div className="document-ar-badge">
                          AR
                        </div>
                      </Tooltip>
                    )}
                    {/* 🍎 OCR/TXT BADGE */}
                    {(() => {
                      const typeLabel = DocumentUtils.getDocumentTypeLabel(document);
                      if (typeLabel === 'OCR' && document.ocrConfidence !== null && document.ocrConfidence !== undefined) {
                        // OCR 뱃지 표시
                        const confidence = typeof document.ocrConfidence === 'string'
                          ? parseFloat(document.ocrConfidence)
                          : document.ocrConfidence;
                        const getConfidenceLevel = (conf: number) => {
                          if (conf >= 0.95) return { color: 'excellent', label: '매우 높음' };
                          if (conf >= 0.85) return { color: 'high', label: '높음' };
                          if (conf >= 0.70) return { color: 'medium', label: '보통' };
                          if (conf >= 0.50) return { color: 'low', label: '낮음' };
                          return { color: 'very-low', label: '매우 낮음' };
                        };
                        const level = getConfidenceLevel(confidence);
                        return (
                          <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
                            <div className={`document-ocr-badge ocr-${level.color}`}>
                              OCR
                            </div>
                          </Tooltip>
                        );
                      } else if (typeLabel === 'TXT') {
                        // TXT 뱃지 표시
                        return (
                          <Tooltip content="TXT 기반 문서">
                            <div className="document-txt-badge">
                              TXT
                            </div>
                          </Tooltip>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* 파일명 */}
                  <div
                    className="status-filename status-filename--clickable"
                    onClick={() => handlePreview(document)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handlePreview(document)
                      }
                    }}
                  >
                    {document.originalName ?? '이름 없는 문서'}
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

                  {/* 액션 버튼 */}
                  <div className="status-actions">
                    <Tooltip content="문서 보기">
                      <button
                        type="button"
                        className="action-btn action-btn--detail"
                        onClick={() => handlePreview(document)}
                        aria-label="문서 보기"
                      >
                        <PreviewIcon />
                      </button>
                    </Tooltip>
                    {/* 🍎 연결 해제 버튼 (DEV 모드에서만 표시) */}
                    {isDevMode && (
                      <Tooltip content="연결된 문서는 해제할 수 없습니다">
                        <button
                          type="button"
                          className="action-btn action-btn--unlink"
                          onClick={() => void handleUnlink(document)}
                          aria-label="연결 해제"
                          disabled={true}
                        >
                          {unlinkingId === document._id ? (
                            <SFSymbol
                              name="arrow.clockwise"
                              animation={SFSymbolAnimation.ROTATE}
                              size={SFSymbolSize.CAPTION_1}
                              weight={SFSymbolWeight.REGULAR}
                            />
                          ) : (
                            <LinkIcon />
                          )}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 🍎 페이지네이션 */}
          {totalPages > 0 && (
            <div className="document-pagination">
              <div className="pagination-limit">
                <Dropdown
                  value={itemsPerPageMode === 'auto' ? 'auto' : String(itemsPerPageMode)}
                  options={itemsPerPageOptions}
                  onChange={handleLimitChange}
                  aria-label="페이지당 항목 수"
                  width={70}
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
                  <button
                    type="button"
                    className="simple-document-search__btn"
                    onClick={handleSimpleSearch}
                    disabled={!simpleSearchQuery.trim()}
                    aria-label="검색"
                    title="문서 내용 검색"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                    </svg>
                  </button>
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

              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-button pagination-button--prev"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="이전 페이지"
                  >
                    <span className="pagination-arrow">‹</span>
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-current">{currentPage}</span>
                    <span className="pagination-separator">/</span>
                    <span className="pagination-total">{totalPages}</span>
                  </div>

                  <button
                    type="button"
                    className="pagination-button pagination-button--next"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="다음 페이지"
                  >
                    <span className="pagination-arrow">›</span>
                  </button>
                </div>
              )}

              {totalPages <= 1 && <div className="pagination-spacer"></div>}
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
    </div>
  )
}

export default DocumentsTab
