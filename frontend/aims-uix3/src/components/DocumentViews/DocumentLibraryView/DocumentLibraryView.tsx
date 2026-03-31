/**
 * DocumentLibraryView Component
 * @since 1.0.0
 *
 * 문서 라이브러리 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents/status API를 사용하여 문서 리스트 표시 (DocumentStatusView와 동일)
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Dropdown, Tooltip, Button, ContextMenu, useContextMenu, type ContextMenuSection, Modal } from '@/shared/ui'
import { Pagination } from '@/shared/ui/Pagination'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusController } from '../../../controllers/useDocumentStatusController'
import { useDocumentStatusContext } from '../../../contexts/DocumentStatusContext'
import DocumentStatusList from '../DocumentStatusView/components/DocumentStatusList'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { AppleConfirmModal } from '../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import { api, ApiError } from '@/shared/lib/api'
import { errorReporter } from '@/shared/lib/errorReporter'
import { LinkIcon } from '../components/DocumentActionIcons'
import { DocumentStatusService } from '../../../services/DocumentStatusService'
import type { Document } from '@/types/documentStatus'
import { DocumentService } from '@/services/DocumentService'
import DownloadHelper from '../../../utils/downloadHelper'
import { DocumentProcessingStatusBar } from './DocumentProcessingStatusBar'
import { useDocumentStatistics } from '@/hooks/useDocumentStatistics'
import { useBatchId } from '@/hooks/useBatchId'
import './DocumentLibraryView.header.css';
import './DocumentLibraryView.filters.css';
import './DocumentLibraryView.list.css';
import './DocumentLibraryView.icons.css';
import './DocumentLibraryView.mobile.css';
import './DocumentLibraryView-delete.css'
import { InitialFilterBar, type InitialType } from '@/shared/ui/InitialFilterBar'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from '@/shared/ui/InitialFilterBar/types'
import { invalidateQueries } from '@/app/queryClient'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useAliasGeneration, type AliasProgress } from '@/hooks/useAliasGeneration'
import { AliasProgressOverlay } from '@/shared/ui/AliasProgressOverlay'
import { RenameModal } from '@/shared/ui/RenameModal/RenameModal'
import CustomerSelectorModal from '@/shared/ui/CustomerSelectorModal/CustomerSelectorModal'
import type { Customer } from '@/entities/customer/model'

interface DocumentLibraryViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
  /** 문서 더블클릭 핸들러 (모달 프리뷰) */
  onDocumentDoubleClick?: (document: Document) => void
  /** 문서 삭제 완료 핸들러 (삭제된 문서 ID 전달) */
  onDocumentDeleted?: (deletedIds: string | string[]) => void
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string) => void
  /** 고객 더블클릭 핸들러 (전체보기 페이지로 이동) */
  onCustomerDoubleClick?: (customerId: string) => void
  /** 새로고침 함수 expose */
  onRefreshExpose?: (refreshFn: () => Promise<void>) => void
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
  /** RP에서 보고 있는 문서 ID (프리뷰 하이라이트용) */
  previewDocumentId?: string | null
}

// 🍎 페이지당 항목 수 옵션 (자동 옵션 포함)
const ITEMS_PER_PAGE_OPTIONS_BASE = [
  { value: 'auto', label: '자동' },
  { value: '10', label: '10개씩' },
  { value: '15', label: '15개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

// 🍎 행 높이 상수 (CSS와 동일하게 유지 — DOM 측정 기준)
const ROW_HEIGHT = 28   // CSS height: 28px (.status-item)
const ROW_GAP = 1       // CSS gap: 1px
// 리스트 헤더 높이 기본값 (sticky header)
const DEFAULT_LIST_HEADER_HEIGHT = 24

/**
 * DocumentLibraryContent 내부 컴포넌트 (Pure View)
 * 🍎 DocumentStatusView와 동일한 리스트 기반 레이아웃
 */
const DocumentLibraryContent: React.FC<{
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  isDeleteMode: boolean
  isBulkLinkMode: boolean
  isAliasMode: boolean
  selectedDocumentIds: Set<string>
  onSelectAllIds: (ids: string[]) => void
  onSelectDocument: (documentId: string, event: React.MouseEvent) => void
  onToggleDeleteMode: () => void
  onToggleAliasMode: () => void
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onDeleteSelected: () => void
  onDeleteSingleDocument: (documentId: string, documentName: string) => Promise<void>
  isDeleting: boolean
  isGeneratingAliases: boolean
  onGenerateAliases: (forceRegenerate: boolean) => void
  aliasProgress: AliasProgress
  onAliasCancel: () => void
  onCustomerClick?: (customerId: string) => void
  onCustomerDoubleClick?: (customerId: string) => void
  onBulkLinkClick: (documents: Document[]) => void
  onUnlinkedCustomerClick?: (documentId: string) => void
  onChangeCustomerClick?: (documentId: string, currentCustomerId: string) => void
  onRemoveDocumentsExpose?: (fn: (docIds: Set<string>) => void) => void
  onNavigate?: (viewKey: string) => void
  /** 고객 필터 상태 (null이면 필터 없음) */
  customerFilter: { id: string; name: string } | null
  /** 고객 필터 설정 핸들러 */
  onCustomerFilterChange: (filter: { id: string; name: string } | null) => void
  /** 문서 삭제 완료 핸들러 (삭제된 문서 ID 전달) */
  onDocumentDeleted?: (deletedIds: string | string[]) => void
  /** RP에서 보고 있는 문서 ID (프리뷰 하이라이트용) */
  previewDocumentId?: string | null
  /** 새로고침 함수를 외부로 노출하는 콜백 */
  onRefreshExpose?: (refreshFn: () => Promise<void>) => void
  /** 미연결 문서 필터 활성 여부 */
  isUnlinkedFilter: boolean
  /** 미연결 필터 토글 핸들러 */
  onToggleUnlinkedFilter: () => void
  /** 고객 연결 시작 핸들러 (미연결 필터 + 일괄 연결 모드 동시 진입) */
  onStartCustomerLink: () => void
  /** 고객 연결 모드 취소 */
  onCancelBulkLink: () => void
}> = ({ initialType, onInitialTypeChange, selectedInitial, onSelectedInitialChange, isDeleteMode, isBulkLinkMode, isAliasMode, selectedDocumentIds, onSelectAllIds, onSelectDocument, onToggleDeleteMode, onToggleAliasMode, onDocumentClick, onDocumentDoubleClick, onDeleteSelected, onDeleteSingleDocument, isDeleting, isGeneratingAliases, onGenerateAliases, aliasProgress, onAliasCancel, onCustomerClick, onCustomerDoubleClick, onBulkLinkClick, onUnlinkedCustomerClick, onChangeCustomerClick, onRemoveDocumentsExpose, onNavigate, customerFilter, onCustomerFilterChange, onDocumentDeleted, previewDocumentId, onRefreshExpose, isUnlinkedFilter, onToggleUnlinkedFilter, onStartCustomerLink, onCancelBulkLink }) => {
  // 🍎 처리 상태 필터 (전체 | 처리중 | 완료 | 에러)
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'processing' | 'completed' | 'error'>('all')

  // 🍎 파일명 표시 모드: 'display' = displayName 우선, 'original' = 원본 파일명
  const [filenameMode, setFilenameMode] = React.useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  // 호버 액션: 문서 삭제/이름변경 — reload 대신 데이터 재조회로 UI 상태 유지
  const refreshDataRef = React.useRef<() => void>(() => {})
  const onRefreshData = React.useCallback(() => { refreshDataRef.current() }, [])
  const lastDeletedDocIdRef = React.useRef<string | null>(null)
  const onDeleteSuccessWithNotify = React.useCallback(() => {
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
  const [renamingDoc, setRenamingDoc] = React.useState<{ _id: string; originalName: string; displayName?: string } | null>(null)

  const handleRenameClick = React.useCallback((document: Document) => {
    const docId = document._id || document.id
    if (docId) setRenamingDoc({ _id: docId, originalName: document.originalName || '', displayName: document.displayName })
  }, [])

  const handleRenameConfirm = React.useCallback(async (newName: string) => {
    if (!renamingDoc) return
    setRenamingDoc(null)
    const field = filenameMode === 'original' ? 'originalName' as const : 'displayName' as const
    await documentActions.renameDocument(renamingDoc._id, newName, field)
  }, [documentActions, filenameMode, renamingDoc])

  const handleRenameCancel = React.useCallback(() => {
    setRenamingDoc(null)
  }, [])

  const handleHoverDeleteClick = React.useCallback((document: Document) => {
    const docId = document._id || document.id
    const docName = document.displayName || DocumentStatusService.extractOriginalFilename(document)
    if (docId) {
      lastDeletedDocIdRef.current = docId
      documentActions.deleteDocument(docId, docName)
    }
  }, [documentActions])

  const controller = useDocumentStatusController()
  const { state, actions } = useDocumentStatusContext()

  // 🍎 처리 상태 필터 적용된 문서 목록
  const statusFilteredDocuments = React.useMemo(() => {
    if (statusFilter === 'all') return controller.filteredDocuments
    return controller.filteredDocuments.filter(doc => {
      const st = DocumentStatusService.extractStatus(doc)
      if (statusFilter === 'completed') return st === 'completed'
      if (statusFilter === 'error') return st === 'error'
      // 처리중: completed, error 이외의 모든 상태
      return st !== 'completed' && st !== 'error'
    })
  }, [controller.filteredDocuments, statusFilter])

  // 이름변경/삭제 성공 시 데이터 재조회 (UI 상태 유지)
  refreshDataRef.current = () => { controller.refreshDocuments() }

  // 새로고침 함수를 외부로 노출 (RP rename 등에서 CP 갱신용)
  React.useEffect(() => {
    if (onRefreshExpose) {
      onRefreshExpose(async () => {
        await actions.refreshDocuments()
      })
    }
  }, [onRefreshExpose, actions])

  // 🍎 고객 필터: 더블클릭 시 고객명 자동 설정
  React.useEffect(() => {
    if (customerFilter && !customerFilter.name && state.documents.length > 0) {
      // 현재 문서 목록에서 해당 고객명을 찾아 설정
      const doc = state.documents.find(d =>
        d.customer_relation?.customer_id === customerFilter.id
      )
      if (doc?.customer_relation?.customer_name) {
        onCustomerFilterChange({
          id: customerFilter.id,
          name: doc.customer_relation.customer_name
        })
      }
    }
  }, [customerFilter, state.documents, onCustomerFilterChange])

  // 🍎 별칭 생성 모드: 별칭이 있는 문서도 새로 만들기 여부
  const [forceRegenerateAlias, setForceRegenerateAlias] = React.useState(false)

  // 별칭 모드 종료 시 체크박스 초기화
  React.useEffect(() => {
    if (!isAliasMode) setForceRegenerateAlias(false)
  }, [isAliasMode])

  const handleFilenameModeChange = React.useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
    // 🍎 검색 필드도 동기화: 별칭 모드면 displayName, 원본 모드면 originalName 검색
    actions.setSearchField(mode === 'display' ? 'displayName' : 'originalName')
  }, [actions])

  // 🔴 현재 업로드 배치 ID (실시간 추적 - sessionStorage 변경 시 즉시 반영)
  const currentBatchId = useBatchId()

  // 문서 처리 현황 통계 (Status Bar용)
  // 1. 전체 라이브러리 통계
  const { statistics: docStats, isLoading: statsLoading } = useDocumentStatistics({
    customerLink: isUnlinkedFilter ? 'unlinked' : undefined
  })
  // 2. 현재 배치 통계 (batchId가 있을 때만)
  const { statistics: batchStats, isLoading: batchLoading } = useDocumentStatistics({
    enabled: !!currentBatchId,
    batchId: currentBatchId
  })
  // 3. 미연결 문서 건수 확인 (고객 연결 버튼/필터 표시 여부 결정용)
  const { statistics: unlinkedStats } = useDocumentStatistics({
    customerLink: 'unlinked'
  })
  const hasUnlinkedDocs = (unlinkedStats?.total ?? 0) > 0

  // 📝 서버사이드 초성 카운트 (DB 전체 대상)
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

  // SSE/문서 변경 시 초성 카운트 갱신
  React.useEffect(() => {
    const handleRefresh = () => { void fetchInitialCounts() }
    window.addEventListener('documentLinked', handleRefresh)
    window.addEventListener('refresh-document-library', handleRefresh)
    return () => {
      window.removeEventListener('documentLinked', handleRefresh)
      window.removeEventListener('refresh-document-library', handleRefresh)
    }
  }, [fetchInitialCounts])

  // 🍎 Optimistic Update 함수를 외부로 노출
  React.useEffect(() => {
    if (onRemoveDocumentsExpose) {
      onRemoveDocumentsExpose(actions.removeDocuments)
    }
  }, [onRemoveDocumentsExpose, actions.removeDocuments])

  // 🍎 고객 일괄 연결 모드 진입 시 정렬 자동 적용
  const prevBulkLinkModeRef = React.useRef(isBulkLinkMode)
  React.useEffect(() => {
    // 모드가 false에서 true로 변경될 때만 실행
    if (isBulkLinkMode && !prevBulkLinkModeRef.current) {
      // 날짜 오름차순 정렬 (가장 오래된 것이 위로)
      controller.handleColumnSort('uploadDate')
      if (controller.sortDirection === 'desc') {
        controller.handleColumnSort('uploadDate') // 한 번 더 클릭하여 asc로 변경
      }
    }
    prevBulkLinkModeRef.current = isBulkLinkMode
  }, [isBulkLinkMode])

  // 🍎 문서 컨텍스트 메뉴
  const documentContextMenu = useContextMenu()
  const [contextMenuDocument, setContextMenuDocument] = React.useState<Document | null>(null)

  // 🍎 도움말 모달
  const [helpModalVisible, setHelpModalVisible] = React.useState(false)

  // 🍎 문서 컨텍스트 메뉴 핸들러
  const handleDocumentContextMenu = React.useCallback((document: Document, event: React.MouseEvent) => {
    setContextMenuDocument(document)
    documentContextMenu.open(event)
  }, [documentContextMenu])

  // 🍎 문서 컨텍스트 메뉴 섹션
  const documentContextMenuSections: ContextMenuSection[] = React.useMemo(() => {
    if (!contextMenuDocument) return []

    const documentId = contextMenuDocument._id || contextMenuDocument.id || ''

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
              // onDocumentClick이 있으면 Right Pane 프리뷰, 없으면 상세 모달
              if (onDocumentClick && documentId) {
                onDocumentClick(documentId)
              } else {
                controller.handleDocumentClick(contextMenuDocument)
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
            onClick: () => controller.handleDocumentSummary(contextMenuDocument)
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
                // 문서 상세 조회하여 다운로드 경로 획득
                const response = await DocumentStatusService.getDocumentDetailViaWebhook(documentId)
                if (response) {
                  // API 응답 구조: { data: { raw: { upload: { destPath } } } }
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
                errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDownload' })
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
              if (documentId) {
                const documentName = DocumentStatusService.extractFilename(contextMenuDocument) || '이 문서'
                await onDeleteSingleDocument(documentId, documentName)
              }
            }
          }
        ]
      },
      // 🍎 localhost 전용: 고객 필터링 (고객이 연결된 문서에서만 표시)
      ...(contextMenuDocument.customer_relation?.customer_id ? [{
        id: 'dev-customer',
        items: [
          {
            id: 'filter-customer',
            label: customerFilter?.id === contextMenuDocument.customer_relation.customer_id
              ? `${contextMenuDocument.customer_relation.customer_name ?? '고객'} 필터 해제`
              : `${contextMenuDocument.customer_relation.customer_name ?? '고객'}의 문서만 보기`,
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            ),
            onClick: () => {
              const cid = contextMenuDocument.customer_relation!.customer_id
              const cname = contextMenuDocument.customer_relation!.customer_name
              if (customerFilter?.id === cid) {
                onCustomerFilterChange(null)
              } else {
                onCustomerFilterChange({ id: cid, name: cname ?? '' })
              }
            }
          }
        ]
      }] : [])
    ]
  }, [contextMenuDocument, controller, onDocumentClick, onDeleteSingleDocument, customerFilter, onCustomerFilterChange])

  // 🍎 외부에서 새로고침 이벤트 받기
  React.useEffect(() => {
    const handleRefresh = () => {
      void actions.refreshDocuments()
    }
    window.addEventListener('refresh-document-library', handleRefresh)
    return () => {
      window.removeEventListener('refresh-document-library', handleRefresh)
    }
  }, [actions])

  // 🍎 문서 연결 시 자동 새로고침
  React.useEffect(() => {
    const handleDocumentLinked = () => {
      void actions.refreshDocuments()
    }
    window.addEventListener('documentLinked', handleDocumentLinked)
    return () => {
      window.removeEventListener('documentLinked', handleDocumentLinked)
    }
  }, [actions])

  // 🍎 전체 선택 핸들러 (Context의 documents 사용)
  // 🐛 BUG-3 FIX: 고객 필터 활성 시 API로 해당 고객의 모든 문서 ID 조회
  const handleSelectAll = React.useCallback(async (checked: boolean) => {
    if (checked) {
      // 고객 필터가 있으면 API로 전체 ID 조회 (현재 페이지 한정 아님)
      if (customerFilter?.id) {
        try {
          const allIds = await DocumentStatusService.getAllDocumentIds({
            customerId: customerFilter.id,
            fileScope: 'excludeMyFiles',
            initial: selectedInitial || undefined,
            initialType: initialType || undefined,
          })
          onSelectAllIds(allIds)
        } catch {
          // API 실패 시 현재 페이지 문서만 선택 (폴백)
          const pageIds = controller.filteredDocuments
            .map(doc => doc._id ?? doc.id ?? '')
            .filter(id => id !== '')
          onSelectAllIds(pageIds)
        }
      } else {
        // 고객 필터 없으면 현재 페이지만 선택 (기존 동작 유지)
        const allIds = controller.filteredDocuments
          .map(doc => doc._id ?? doc.id ?? '')
          .filter(id => id !== '')
        onSelectAllIds(allIds)
      }
    } else {
      onSelectAllIds([])
    }
  }, [controller.filteredDocuments, onSelectAllIds, customerFilter, selectedInitial, initialType])

  // 🍎 고객 문서 전체 선택 핸들러 (고객 필터 활성 시 해당 고객의 모든 문서 전체 선택 + 삭제 모드 진입)
  // 🐛 BUG-3 FIX: API로 해당 고객의 모든 문서 ID 조회
  const handleSelectAllCustomerDocs = React.useCallback(async () => {
    if (customerFilter?.id) {
      try {
        const allIds = await DocumentStatusService.getAllDocumentIds({
          customerId: customerFilter.id,
          fileScope: 'excludeMyFiles',
          initial: selectedInitial || undefined,
          initialType: initialType || undefined,
        })
        onSelectAllIds(allIds)
      } catch {
        // API 실패 시 현재 페이지 문서만 선택
        const pageIds = controller.filteredDocuments
          .map(doc => doc._id ?? doc.id ?? '')
          .filter(id => id !== '')
        onSelectAllIds(pageIds)
      }
    } else {
      const allIds = controller.filteredDocuments
        .map(doc => doc._id ?? doc.id ?? '')
        .filter(id => id !== '')
      onSelectAllIds(allIds)
    }
    // 삭제 모드가 아니면 진입
    if (!isDeleteMode) {
      onToggleDeleteMode()
    }
  }, [controller.filteredDocuments, onSelectAllIds, isDeleteMode, onToggleDeleteMode, customerFilter, selectedInitial, initialType])

  // 🍎 자동 페이지네이션: 컨테이너 높이 기반 항목 수 자동 계산
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | 'manual'>(() => {
    const saved = localStorage.getItem('aims-items-per-page-mode')
    return saved === 'manual' ? 'manual' : 'auto'
  })
  const [listWrapperHeight, setListWrapperHeight] = useState(0)
  const listWrapperRef = useRef<HTMLDivElement>(null)

  // 🍎 자동 모드일 때 컨테이너 높이 기반 항목 수 계산
  const autoCalculatedItems = useMemo(() => {
    // 📱 모바일(≤768px): 페이지네이션 숨김 → 전체 표시
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 9999
    }
    if (listWrapperHeight <= 0) return 15 // 기본값

    const wrapper = listWrapperRef.current
    if (!wrapper) return 15

    // 리스트 헤더(sticky) 높이 측정
    const listHeader = wrapper.querySelector('.status-list-header') as HTMLElement | null
    const measuredHeaderHeight = listHeader ? listHeader.getBoundingClientRect().height : 0
    const headerHeight = measuredHeaderHeight > 0 ? measuredHeaderHeight : DEFAULT_LIST_HEADER_HEIGHT

    // 페이지네이션(sticky bottom) 높이 측정 — wrapper 안에 포함됨
    const paginationEl = wrapper.querySelector('.document-pagination') as HTMLElement | null
    const paginationHeight = paginationEl ? paginationEl.getBoundingClientRect().height : 49

    // 사용 가능한 높이 = 래퍼 높이 - 헤더 높이 - 페이지네이션 높이 - 여유분
    const SAFETY_MARGIN = 20
    const availableHeight = listWrapperHeight - headerHeight - paginationHeight - SAFETY_MARGIN

    // N개 행의 총 높이 = N * ROW_HEIGHT + (N-1) * ROW_GAP
    const maxItems = Math.max(1, Math.floor((availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)))

    if (import.meta.env.DEV) {
      console.log('[DocumentLibraryView] 자동 페이지네이션 계산:', {
        listWrapperHeight, headerHeight, availableHeight, maxItems
      })
    }

    return maxItems
  }, [listWrapperHeight])

  // 🍎 ResizeObserver로 library-list-wrapper 높이 측정
  useEffect(() => {
    const wrapper = listWrapperRef.current
    if (!wrapper) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListWrapperHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(wrapper)
    return () => resizeObserver.disconnect()
  }, [])

  // 🍎 자동 모드일 때 계산값을 controller에 반영
  useEffect(() => {
    if (itemsPerPageMode === 'auto' && autoCalculatedItems > 0 && autoCalculatedItems < 9999) {
      controller.handleLimitChange(autoCalculatedItems)
    }
  }, [itemsPerPageMode, autoCalculatedItems, controller.handleLimitChange])

  // 🍎 드롭다운 옵션 (자동 선택 시 계산된 값 표시)
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

  // 🍎 페이지당 항목 수 변경 핸들러 ('auto' 또는 숫자)
  const handleItemsPerPageChange = useCallback((value: string) => {
    if (value === 'auto') {
      setItemsPerPageMode('auto')
      localStorage.setItem('aims-items-per-page-mode', 'auto')
      // 자동 계산값은 위 useEffect에서 반영됨
    } else {
      setItemsPerPageMode('manual')
      localStorage.setItem('aims-items-per-page-mode', 'manual')
      controller.handleLimitChange(Number(value))
    }
  }, [controller.handleLimitChange])

  // 클릭 피드백은 Pagination 컴포넌트 내부에서 처리

  return (
    <>
      {/* 🍎 통합 헤더: 총 문서 개수 + 검색창 + 필터 버튼 + 편집 + 실시간 + 새로고침 (한 줄) */}
      <div className="library-unified-header">
        {/* 왼쪽: 총 문서 개수 + 삭제/연결 모드 컨트롤 */}
        <div className="header-left-section">
            <>

              {/* 🍎 고객 필터 칩: 특정 고객의 문서만 필터링 중일 때 표시 */}
              {customerFilter && customerFilter.name && (
                <div className="customer-filter-chip">
                  <span className="customer-filter-chip__label">
                    {customerFilter.name}의 문서
                  </span>
                  <Tooltip content="전체 선택">
                    <button
                      type="button"
                      className="customer-filter-chip__action"
                      onClick={handleSelectAllCustomerDocs}
                      aria-label="이 고객의 문서 전체 선택"
                    >
                      <SFSymbol
                        name="checkmark"
                        size={SFSymbolSize.CAPTION_2}
                        weight={SFSymbolWeight.MEDIUM}
                        decorative={true}
                      />
                    </button>
                  </Tooltip>
                  <Tooltip content="필터 해제">
                    <button
                      type="button"
                      className="customer-filter-chip__close"
                      onClick={() => onCustomerFilterChange(null)}
                      aria-label="고객 필터 해제"
                    >
                      <SFSymbol
                        name="xmark"
                        size={SFSymbolSize.CAPTION_2}
                        weight={SFSymbolWeight.MEDIUM}
                        decorative={true}
                      />
                    </button>
                  </Tooltip>
                </div>
              )}

              {/* 총 문서 개수 및 현재 표시 범위 */}
              <span className="result-count">
                {state.totalCount > 0 ? (
                  <>
                    {((state.currentPage - 1) * state.itemsPerPage) + 1}-
                    {Math.min(state.currentPage * state.itemsPerPage, state.totalCount)}
                    {' / '}총 {state.totalCount}개
                  </>
                ) : (
                  '문서 없음'
                )}
              </span>

              {/* 삭제 버튼 (일반 모드): 건수 바로 뒤에 배치 */}
              {!isDeleteMode && !isAliasMode && !isBulkLinkMode && (
                <Tooltip content="삭제">
                  <button
                    type="button"
                    className="edit-mode-icon-button"
                    onClick={onToggleDeleteMode}
                    aria-label="삭제"
                  >
                    <SFSymbol
                      name="trash"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                      decorative={true}
                    />
                  </button>
                </Tooltip>
              )}

              {/* 삭제 모드일 때: 선택된 개수 + 삭제 + 취소 */}
              {isDeleteMode && (
                <>
                  <span className="selected-count-inline">
                    {selectedDocumentIds.size}개 선택됨
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDeleteSelected}
                    disabled={isDeleting || selectedDocumentIds.size === 0}
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onToggleDeleteMode}
                  >
                    취소
                  </Button>
                </>
              )}

              {/* 일괄 연결 모드일 때: 선택된 개수 + 고객 선택 + 취소 */}
              {isBulkLinkMode && (
                <>
                  <span className="selected-count-inline">
                    {selectedDocumentIds.size}개 선택됨
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const selectedDocs = state.documents.filter(doc =>
                        selectedDocumentIds.has(doc._id || '')
                      )
                      onBulkLinkClick(selectedDocs)
                    }}
                    disabled={selectedDocumentIds.size === 0}
                    style={{
                      backgroundColor: 'var(--color-ios-orange)',
                      borderColor: 'var(--color-ios-orange)',
                      color: '#fff'
                    }}
                  >
                    고객 선택
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onCancelBulkLink}
                  >
                    취소
                  </Button>
                </>
              )}
            </>
        </div>

        {/* 중앙: 검색창 + 필터 버튼 */}
        <div className="header-center-section">
          {/* 검색창 */}
          <div className="search-input-wrapper">
            <SFSymbol
              name="magnifyingglass"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              className="search-icon"
              decorative={true}
            />
            <input
              type="text"
              value={state.searchTerm}
              onChange={(e) => actions.setSearchTerm(e.target.value)}
              placeholder={filenameMode === 'display' ? '별칭 파일명 검색' : '원본 파일명 검색'}
              className="search-input"
              disabled={isBulkLinkMode}
            />
            {state.searchTerm && (
              <button
                className="search-clear-button"
                onClick={() => actions.setSearchTerm('')}
                aria-label="검색어 지우기"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </button>
            )}
          </div>

        </div>

        {/* 오른쪽: 별칭AI + 삭제 | 고객 연결 + 연결 고객 없음 필터 */}
        <div className="header-right-section">
          {/* 별칭 모드: 별칭AI 버튼 자리에 모드 컨트롤 표시 */}
          {isAliasMode ? (
            <div className="alias-mode-group">
              <span className="alias-mode-count">
                {selectedDocumentIds.size}개 선택됨
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="alias-ai-button"
                onClick={() => onGenerateAliases(forceRegenerateAlias)}
                disabled={isGeneratingAliases || selectedDocumentIds.size === 0}
              >
                <SFSymbol
                  name="sparkles"
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
                {isGeneratingAliases ? '생성 중...' : '별칭 생성'}
              </Button>
              <label className="alias-force-label">
                <input
                  type="checkbox"
                  checked={forceRegenerateAlias}
                  onChange={(e) => setForceRegenerateAlias(e.target.checked)}
                />
                <span>별칭이 있는 문서도 새로 만들기</span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleAliasMode}
              >
                취소
              </Button>
            </div>
          ) : !isDeleteMode && !isBulkLinkMode && (
            <Tooltip content="AI가 문서 내용을 분석하여 알아보기 쉬운 별칭을 자동 생성합니다">
              <Button
                variant="ghost"
                size="sm"
                className="alias-ai-button"
                onClick={onToggleAliasMode}
                aria-label="별칭 생성"
              >
                <SFSymbol
                  name="sparkles"
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
                별칭AI
              </Button>
            </Tooltip>
          )}
          {/* 별칭AI/삭제 버튼과 고객 연결 사이 구분선 */}
          {!isAliasMode && !isDeleteMode && !isBulkLinkMode && (hasUnlinkedDocs || isUnlinkedFilter) && (
            <div className="header-right-section__divider" />
          )}
          {(hasUnlinkedDocs || isUnlinkedFilter || isBulkLinkMode) && (
            <>
              {/* 고객 연결 버튼: 미연결 필터 + 일괄 연결 모드 동시 진입 */}
              {!isBulkLinkMode && !isDeleteMode && !isAliasMode && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onStartCustomerLink}
                  aria-label="미연결 문서에 고객 연결"
                >
                  <LinkIcon width={13} height={13} />
                  고객 연결
                </Button>
              )}
              {isUnlinkedFilter ? (
                <div className="library-unlinked-filter library-unlinked-filter--active" role="status" aria-label="연결 고객 없음 필터 적용 중">
                  <span>연결 고객 없음</span>
                  <button
                    type="button"
                    className="library-unlinked-filter__clear"
                    onClick={onToggleUnlinkedFilter}
                    disabled={isBulkLinkMode}
                    aria-label="연결 고객 없음 필터 해제"
                  >
                    <SFSymbol
                      name="xmark.circle.fill"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                      decorative
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="library-unlinked-filter"
                  onClick={onToggleUnlinkedFilter}
                  aria-label="연결 고객 없는 문서만 보기"
                >
                  <span>연결 고객 없음</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 상태 필터 Segmented Control */}
      <div className="library-status-segment" style={isBulkLinkMode ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        {([
          { value: 'all', label: '전체', icon: 'tray.full', iconColor: 'var(--color-primary-500)', count: docStats?.total ?? 0 },
          { value: 'processing', label: '처리중', icon: 'clock', iconColor: 'var(--color-ios-orange)', count: (docStats?.processing ?? 0) + (docStats?.pending ?? 0) + (docStats?.credit_pending ?? 0) },
          { value: 'completed', label: '완료', icon: 'checkmark', iconColor: 'var(--color-ios-green, #34c759)', count: docStats?.completed ?? 0 },
          { value: 'error', label: '에러', icon: 'exclamationmark', iconColor: 'var(--color-error, #ff3b30)', count: docStats?.error ?? 0 },
        ] as const).map(tab => (
          <button
            key={tab.value}
            type="button"
            className={`library-status-segment__tab${statusFilter === tab.value ? ' library-status-segment__tab--active' : ''}${tab.value === 'error' && tab.count > 0 ? ' library-status-segment__tab--error' : ''}${tab.value === 'processing' && tab.count > 0 ? ' library-status-segment__tab--warning' : ''}`}
            onClick={() => setStatusFilter(tab.value)}
            disabled={isBulkLinkMode}
          >
            <span style={{ color: statusFilter === tab.value ? 'var(--color-neutral-0)' : tab.iconColor }}>
              <SFSymbol
                name={tab.icon}
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.MEDIUM}
                decorative
              />
            </span>
            <span className="library-status-segment__label">{tab.label}</span>
            {(tab.value === 'all' || tab.count > 0) && (
              <span className="library-status-segment__count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* 문서 처리 현황 Status Bar (2분할: 현재 업로드 + 전체 라이브러리) */}
      <DocumentProcessingStatusBar
        statistics={docStats}
        batchStatistics={currentBatchId ? batchStats : null}
        isLoading={statsLoading || batchLoading}
      />

      {/* 초성 필터 바 */}
      <div style={isBulkLinkMode ? { pointerEvents: 'none', opacity: 0.4 } : undefined}>
        <InitialFilterBar
          initialType={initialType}
          onInitialTypeChange={onInitialTypeChange}
          selectedInitial={selectedInitial}
          onSelectedInitialChange={onSelectedInitialChange}
          initialCounts={serverInitialCounts}
          countLabel="개"
          targetLabel="문서"
          className="library-initial-filter"
        />
      </div>


      {/* 🍎 리스트: DocumentStatusView와 동일한 구조 */}
      <div className="library-list-wrapper" ref={listWrapperRef}>
      <AliasProgressOverlay
        progress={aliasProgress}
        onCancel={onAliasCancel}
      />
      <DocumentStatusList
        documents={statusFilteredDocuments}
        isLoading={controller.isLoading}
        isEmpty={statusFilteredDocuments.length === 0 && !state.isLoading}
        error={controller.error}
        {...(onDocumentClick ? { onDocumentClick } : {})}
        {...(onDocumentDoubleClick ? { onDocumentDoubleClick } : {})}
        onDetailClick={controller.handleDocumentClick}
        onSummaryClick={controller.handleDocumentSummary}
        onFullTextClick={controller.handleDocumentFullText}
        onLinkClick={controller.handleDocumentLink}
        onUnlinkedCustomerClick={onUnlinkedCustomerClick}
        onChangeCustomerClick={onChangeCustomerClick}
        sortField={controller.sortField}
        sortDirection={controller.sortDirection}
        onColumnSort={controller.handleColumnSort}
        isDeleteMode={isDeleteMode}
        isBulkLinkMode={isBulkLinkMode}
        isAliasMode={isAliasMode}
        selectedDocumentIds={selectedDocumentIds}
        onSelectAll={handleSelectAll}
        onSelectDocument={onSelectDocument}
        onRowContextMenu={handleDocumentContextMenu}
        {...(onCustomerClick ? { onCustomerClick } : {})}
        {...(onCustomerDoubleClick ? { onCustomerDoubleClick } : {})}
        {...(onNavigate ? { onNavigate } : {})}
        onRefresh={controller.refreshDocuments}
        filenameMode={filenameMode}
        onFilenameModeChange={handleFilenameModeChange}
        onRenameClick={handleRenameClick}
        onDeleteClick={handleHoverDeleteClick}
        renamingDocumentId={null}
        onRenameConfirm={undefined}
        onRenameCancel={undefined}
        searchTerm={state.searchTerm}
        previewDocumentId={previewDocumentId}
      />

      {/* 🍎 페이지네이션: sticky로 리스트 하단에 고정 */}
      {!controller.isLoading && controller.filteredDocuments.length > 0 && (
        <div className="document-pagination document-pagination--sticky">
          {/* 🍎 페이지당 항목 수 선택 */}
          <div className="pagination-limit">
            <Dropdown
              value={itemsPerPageMode === 'auto' ? 'auto' : String(controller.itemsPerPage)}
              options={itemsPerPageOptions}
              onChange={handleItemsPerPageChange}
              aria-label="페이지당 항목 수"
              width={100}
            />
          </div>

          {/* 🍎 페이지 네비게이션 */}
          {state.totalPages > 1 ? (
            <Pagination
              currentPage={controller.currentPage}
              totalPages={state.totalPages}
              onPageChange={controller.handlePageChange}
            />
          ) : (
            <div className="pagination-spacer"></div>
          )}
        </div>
      )}
      </div>

      {/* 모달들 */}
      <DocumentDetailModal
        visible={controller.isDetailModalVisible}
        onClose={controller.handleDetailModalClose}
        document={controller.selectedDocument}
      />
      <DocumentSummaryModal
        visible={controller.isSummaryModalVisible}
        onClose={controller.handleSummaryModalClose}
        document={controller.selectedDocumentForSummary}
      />
      <DocumentFullTextModal
        visible={controller.isFullTextModalVisible}
        onClose={controller.handleFullTextModalClose}
        document={controller.selectedDocumentForFullText}
      />
      <DocumentLinkModal
        visible={controller.isLinkModalVisible}
        onClose={controller.handleLinkModalClose}
        document={controller.selectedDocumentForLink}
        onFetchCustomerDocuments={controller.fetchCustomerDocuments}
        onLink={controller.linkDocumentToCustomer}
      />

      {/* 🍎 문서 컨텍스트 메뉴 */}
      <ContextMenu
        visible={documentContextMenu.isOpen}
        position={documentContextMenu.position}
        sections={documentContextMenuSections}
        onClose={documentContextMenu.close}
      />

      {/* 🍎 문서 보관함 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📄 문서 보관함 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>🔍 문서 찾기</strong></p>
            <ul>
              <li><strong>"홍길동"</strong> 검색 → 해당 고객의 문서만 표시</li>
              <li><strong>"계약서"</strong> 검색 → 파일명에 포함된 문서</li>
              <li>필터로 <strong>처리 상태별</strong> 분류 가능</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>👁️ 문서 미리보기</strong></p>
            <ul>
              <li>문서 <strong>클릭</strong> → 오른쪽에 미리보기</li>
              <li>문서 <strong>우클릭</strong> → AI 요약, 다운로드 메뉴</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>🗑️ 문서 삭제</strong></p>
            <ul>
              <li>상단의 <strong>삭제 버튼</strong> 클릭 → 삭제 모드 활성화</li>
              <li>삭제할 문서 선택 후 <strong>삭제 버튼</strong> 클릭</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 이름 변경 모달 */}
      <RenameModal
        visible={renamingDoc !== null}
        onClose={handleRenameCancel}
        onConfirm={handleRenameConfirm}
        editField={filenameMode === 'original' ? 'originalName' : 'displayName'}
        originalName={renamingDoc?.originalName || ''}
        displayName={renamingDoc?.displayName}
      />
    </>
  )
}

/**
 * DocumentLibraryView React 컴포넌트
 *
 * 문서 라이브러리 및 리스트 표시 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 * 애플 디자인 철학 준수 - 서브틀하고 깔끔한 인터페이스
 *
 * @example
 * ```tsx
 * <DocumentLibraryView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentLibraryView: React.FC<DocumentLibraryViewProps> = ({
  visible,
  onClose,
  onDocumentClick,
  onDocumentDoubleClick,
  onDocumentDeleted,
  onCustomerClick,
  onCustomerDoubleClick,
  onRefreshExpose,
  onNavigate,
  previewDocumentId,
}) => {
  const {
    error,
    searchQuery,
    clearError,
  } = useDocumentsController()

  // Breadcrumb 항목 생성
  const breadcrumbItems = useMemo(() => getBreadcrumbItems('documents-library'), [])

  // 🍎 Optimistic Update 함수를 저장할 ref
  const removeDocumentsFnRef = React.useRef<((docIds: Set<string>) => void) | null>(null)

  // 🍎 새로고침 함수 expose — DocumentLibraryContent 내부에서 처리 (actions 스코프 문제 해결)

  // 🍎 삭제 기능 상태
  const [isDeleteMode, setIsDeleteMode] = React.useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = React.useState(false)

  // 🍎 고객 필터 상태 (특정 고객의 문서만 보기)
  const [customerFilter, setCustomerFilter] = React.useState<{ id: string; name: string } | null>(null)

  // 미연결 문서 필터 상태
  const [isUnlinkedFilter, setIsUnlinkedFilter] = React.useState(false)

  // 미연결 필터 토글 핸들러
  const handleToggleUnlinkedFilter = React.useCallback(() => {
    setIsUnlinkedFilter(prev => {
      // 미연결 필터 켜면 고객 필터 해제
      if (!prev) {
        setCustomerFilter(null)
      }
      return !prev
    })
  }, [])

  // 🍎 고객 일괄 연결 기능 상태
  const [isBulkLinkMode, setIsBulkLinkMode] = React.useState(false)

  // 🍎 "고객 연결" 버튼 핸들러: 미연결 필터 + 일괄 연결 모드 동시 활성화
  const handleStartCustomerLink = React.useCallback(() => {
    setIsUnlinkedFilter(true)
    setCustomerFilter(null)
    setIsBulkLinkMode(true)
    setIsDeleteMode(false)
    setIsAliasMode(false)
    setSelectedDocumentIds(new Set())
  }, [])

  // 🍎 고객 연결 모드 취소 핸들러
  const handleCancelBulkLink = React.useCallback(() => {
    setIsBulkLinkMode(false)
    setIsUnlinkedFilter(false)
    setSelectedDocumentIds(new Set())
  }, [])

  // 🍎 컴포넌트 언마운트 시 bulk link 모드 자동 해제 (다른 메뉴 이동 시)
  React.useEffect(() => {
    return () => {
      setIsBulkLinkMode(false)
      setIsUnlinkedFilter(false)
      setSelectedDocumentIds(new Set())
    }
  }, [])

  // 🍎 별칭 일괄 생성 기능 상태
  const [isAliasMode, setIsAliasMode] = React.useState(false)
  const aliasGeneration = useAliasGeneration()
  const isGeneratingAliases = aliasGeneration.progress.isRunning

  // 초성 필터 상태 (F5 이후에도 유지)
  const [initialType, setInitialType] = usePersistedState<InitialType>('document-library-initial-type', 'korean')
  const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('document-library-selected-initial', null)

  // 탭 전환 시 선택된 초성 초기화
  const handleInitialTypeChange = React.useCallback((type: InitialType) => {
    setInitialType(type)
    setSelectedInitial(null)
  }, [setInitialType, setSelectedInitial])

  const [isCustomerSelectorVisible, setIsCustomerSelectorVisible] = React.useState(false)
  const [documentsToLink, setDocumentsToLink] = React.useState<string[]>([])
  // 🍎 고객 변경 모드: 기존 고객에서 연결 해제 후 새 고객에 연결
  const [documentToChangeCustomer, setDocumentToChangeCustomer] = React.useState<{
    docId: string
    currentCustomerId: string
  } | null>(null)

  // 🍎 고객 변경 아이콘 클릭 핸들러
  const handleChangeCustomerClick = React.useCallback((docId: string, currentCustomerId: string) => {
    setDocumentToChangeCustomer({ docId, currentCustomerId })
    setDocumentsToLink([docId])
    setIsCustomerSelectorVisible(true)
  }, [])

  // 🍎 고객 선택 후 문서 연결 핸들러 (신규 연결 + 고객 변경 통합)
  const handleCustomerSelectedForLink = React.useCallback(async (customer: Customer) => {
    setIsCustomerSelectorVisible(false)

    try {
      // 고객 변경 모드: 기존 고객에서 연결 해제 먼저
      if (documentToChangeCustomer) {
        await DocumentService.unlinkDocumentFromCustomer(
          documentToChangeCustomer.currentCustomerId,
          documentToChangeCustomer.docId,
        )
        setDocumentToChangeCustomer(null)
      }

      // 선택된 문서들을 새 고객에 연결
      for (const docId of documentsToLink) {
        await DocumentService.linkDocumentToCustomer(customer._id, {
          document_id: docId,
          relationship_type: 'general',
        })
      }
      // 성공 시 페이지 새로고침 (Optimistic Update 금지 규칙)
      window.location.reload()
    } catch (error) {
      console.error('문서 연결 실패:', error)
      setDocumentToChangeCustomer(null)
      errorReporter.reportApiError(error instanceof Error ? error : new Error('문서 연결 실패'), {
        component: 'DocumentLibraryView',
        payload: {
          action: 'handleCustomerSelectedForLink',
          documentCount: documentsToLink.length,
          customerId: customer._id,
        },
      })
    }
  }, [documentsToLink, documentToChangeCustomer])

  // 🍎 Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController()

  // 🍎 삭제 모드 토글 핸들러
  const handleToggleDeleteMode = React.useCallback(() => {
    if (isDeleteMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
    // 삭제 모드 켜면 일괄 연결 모드는 끄기
    if (!isDeleteMode && isBulkLinkMode) {
      setIsBulkLinkMode(false)
    }
  }, [isDeleteMode, isBulkLinkMode])

  // 🍎 별칭 생성 모드 토글 핸들러
  const handleToggleAliasMode = React.useCallback(() => {
    if (isAliasMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsAliasMode(!isAliasMode)
    if (!isAliasMode) {
      setIsDeleteMode(false)
      setIsBulkLinkMode(false)
    }
  }, [isAliasMode])

  // 🍎 별칭 단건 순차 생성 핸들러 (실시간 프로그레스 바 표시)
  const handleGenerateAliases = React.useCallback(async (forceRegenerate: boolean) => {
    if (selectedDocumentIds.size === 0) return
    try {
      const summary = await aliasGeneration.generate(
        Array.from(selectedDocumentIds),
        forceRegenerate,
      )
      const { completed, skipped, failed, cancelled } = summary
      const hasCompleted = completed > 0
      const hasSkipped = skipped > 0
      const hasFailed = failed > 0

      let title: string
      let iconType: 'success' | 'info' | 'warning' | 'error'
      if (cancelled) {
        title = '별칭 생성이 취소되었습니다'
        iconType = hasCompleted ? 'warning' : 'info'
      } else if (hasFailed) {
        title = hasCompleted ? '일부 문서의 별칭 생성에 실패했습니다' : '별칭 생성에 실패했습니다'
        iconType = hasCompleted ? 'warning' : 'error'
      } else if (!hasCompleted && hasSkipped) {
        title = '새로 생성할 문서가 없습니다'
        iconType = 'info'
      } else {
        title = '별칭 생성 완료'
        iconType = 'success'
      }

      const lines: string[] = []
      if (hasCompleted) lines.push(`${completed}건의 문서에 별칭이 생성되었습니다.`)
      if (hasFailed) lines.push(`${failed}건 실패 — 잠시 후 다시 시도해 주세요.`)
      if (hasSkipped) {
        if (!hasCompleted && !hasFailed) {
          lines.push(`선택한 ${skipped}건의 문서에 이미 별칭이 있습니다.`)
          lines.push(`'별칭이 있는 문서도 새로 만들기'를 선택한 후 다시 시도해 주세요.`)
        } else {
          lines.push(`${skipped}건은 이미 별칭이 있어 건너뛰었습니다.`)
        }
      }
      if (cancelled) lines.push('나머지 문서는 처리되지 않았습니다.')

      await confirmModal.actions.openModal({
        title,
        message: lines.join('\n'),
        confirmText: '확인',
        showCancel: false,
        iconType,
      })

      window.location.reload()
    } catch (err) {
      console.error('별칭 생성 실패:', err)
      await confirmModal.actions.openModal({
        title: '오류',
        message: '별칭 생성 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error',
      })
    } finally {
      aliasGeneration.reset()
    }
  }, [selectedDocumentIds, aliasGeneration, confirmModal.actions])

  // 🍎 전체 선택/해제 핸들러 (DocumentLibraryContent에서 ID 배열 전달받음)
  const handleSelectAllIds = React.useCallback((ids: string[]) => {
    setSelectedDocumentIds(new Set(ids))
  }, [])

  // 🍎 개별 선택/해제 핸들러
  const handleSelectDocument = React.useCallback((documentId: string, event: React.MouseEvent) => {
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

  // 🍎 고객 필터 설정 (고객명 포함)
  const handleCustomerFilterChange = React.useCallback((filter: { id: string; name: string } | null) => {
    setCustomerFilter(filter)
    // 고객 필터 설정 시 미연결 필터 해제
    if (filter) {
      setIsUnlinkedFilter(false)
    }
    // 필터 해제 시 선택 초기화
    if (!filter) {
      setSelectedDocumentIds(new Set())
      setIsDeleteMode(false)
    }
  }, [])

  // 🍎 문서 삭제 핸들러
  const handleDeleteSelected = React.useCallback(async () => {
    if (selectedDocumentIds.size === 0) {
      await confirmModal.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 문서를 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
      })
      return
    }

    // 확인 모달 표시
    const confirmed = await confirmModal.actions.openModal({
      title: '문서 삭제',
      message: `선택한 ${selectedDocumentIds.size}개의 문서를 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
    })

    if (!confirmed) return

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
          errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSelected.item', payload: { docId } })
          return { success: false, docId, error }
        }
      })

      const results = await Promise.all(deletePromises)
      const failedDeletes = results.filter((r) => !r.success)

      // 실패한 경우 오류 모달 표시
      if (failedDeletes.length > 0) {
        setIsDeleting(false)
        await confirmModal.actions.openModal({
          title: '삭제 실패',
          message: `${failedDeletes.length}개의 문서 삭제에 실패했습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      }

      // 🔄 삭제 완료 후 페이지 새로고침 (CLAUDE.md 규칙 12-1)
      window.location.reload()
    } catch (error) {
      console.error('Error in handleDeleteSelected:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSelected' })
      setIsDeleting(false) // 에러 발생 시에도 상태 복원
      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [selectedDocumentIds, confirmModal])

  // 🍎 단일 문서 삭제 핸들러 (컨텍스트 메뉴용)
  const handleDeleteSingleDocument = React.useCallback(async (documentId: string, documentName: string) => {
    // 확인 모달 표시
    const confirmed = await confirmModal.actions.openModal({
      title: '문서 삭제',
      message: `"${documentName}"을(를) 삭제하시겠습니까?\n\n삭제된 문서는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
      iconType: 'warning',
    })

    if (!confirmed) return

    try {
      setIsDeleting(true)

      // API 호출하여 삭제
      await api.delete(`/api/documents/${documentId}`)

      // 🔄 삭제 완료 후 페이지 새로고침 (CLAUDE.md 규칙 12-1)
      window.location.reload()

    } catch (error) {
      console.error('Error in handleDeleteSingleDocument:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSingleDocument' })
      setIsDeleting(false)

      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [confirmModal])

  return (
    <CenterPaneView visible={visible} onClose={onClose} title="전체 문서 보기" titleIcon={<span className="menu-icon-purple"><SFSymbol name="books-vertical" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>} breadcrumbItems={breadcrumbItems} onBreadcrumbClick={onNavigate}>
      <div className="document-library-view">
        {/* Error 표시 */}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={clearError}>닫기</button>
          </div>
        )}

        {/* 🍎 타겟 영역: 상단 바 + 헤더 + 문서 리스트 + 페이지네이션 */}
        <DocumentStatusProvider searchQuery={searchQuery} fileScope="excludeMyFiles" initialFilter={selectedInitial} initialTypeFilter={initialType} customerIdFilter={customerFilter?.id} customerLinkFilter={isUnlinkedFilter ? 'unlinked' : undefined}>
          <DocumentLibraryContent
            initialType={initialType}
            onInitialTypeChange={handleInitialTypeChange}
            selectedInitial={selectedInitial}
            onSelectedInitialChange={setSelectedInitial}
            isDeleteMode={isDeleteMode}
            isBulkLinkMode={isBulkLinkMode}
            isAliasMode={isAliasMode}
            selectedDocumentIds={selectedDocumentIds}
            onSelectAllIds={handleSelectAllIds}
            onSelectDocument={handleSelectDocument}
            onToggleDeleteMode={handleToggleDeleteMode}
            onToggleAliasMode={handleToggleAliasMode}
            onDeleteSelected={handleDeleteSelected}
            onDeleteSingleDocument={handleDeleteSingleDocument}
            isDeleting={isDeleting}
            isGeneratingAliases={isGeneratingAliases}
            onGenerateAliases={handleGenerateAliases}
            aliasProgress={aliasGeneration.progress}
            onAliasCancel={aliasGeneration.cancel}
            onBulkLinkClick={(documents) => {
              setDocumentsToLink(documents.map(d => d._id || '').filter(Boolean))
              setIsCustomerSelectorVisible(true)
            }}
            onUnlinkedCustomerClick={(documentId) => {
              setDocumentsToLink([documentId])
              setIsCustomerSelectorVisible(true)
            }}
            onChangeCustomerClick={handleChangeCustomerClick}
            onRemoveDocumentsExpose={(fn) => {
              removeDocumentsFnRef.current = fn
            }}
            customerFilter={customerFilter}
            onCustomerFilterChange={handleCustomerFilterChange}
            {...(onDocumentClick && { onDocumentClick })}
            {...(onDocumentDoubleClick && { onDocumentDoubleClick })}
            {...(onCustomerClick && { onCustomerClick })}
            onCustomerDoubleClick={(customerId: string) => {
              // 🍎 고객 더블클릭 → 고객 상세 페이지로 이동
              onCustomerDoubleClick?.(customerId)
            }}
            {...(onNavigate && { onNavigate })}
            onDocumentDeleted={onDocumentDeleted}
            previewDocumentId={previewDocumentId}
            onRefreshExpose={onRefreshExpose}
            isUnlinkedFilter={isUnlinkedFilter}
            onToggleUnlinkedFilter={handleToggleUnlinkedFilter}
            onStartCustomerLink={handleStartCustomerLink}
            onCancelBulkLink={handleCancelBulkLink}
          />
        </DocumentStatusProvider>
      </div>

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />

      {/* 일괄 고객 연결: CustomerSelectorModal */}
      {isCustomerSelectorVisible && (
        <CustomerSelectorModal
          visible={isCustomerSelectorVisible}
          onClose={() => {
            setIsCustomerSelectorVisible(false)
            setDocumentsToLink([])
            setDocumentToChangeCustomer(null)
          }}
          onSelect={handleCustomerSelectedForLink}
          title={documentToChangeCustomer ? '고객 변경' : `고객 선택 (${documentsToLink.length}건 연결)`}
        />
      )}

    </CenterPaneView>
  )
}

export default DocumentLibraryView
