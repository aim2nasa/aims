/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 🍎 iOS Spotlight Search 스타일 문서 검색 View
 * DocumentLibrary와 완벽한 디자인 일관성
 * Search.py 기능을 React + iOS 네이티브 스타일로 구현
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { SortIndicator } from '@/shared/ui/SortIndicator'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentSearch } from '@/contexts/useDocumentSearch'
import { SearchService, MY_STORAGE_MARKER, MY_STORAGE_DISPLAY_NAME } from '@/services/searchService'
import type { SearchResultItem, SearchMode, KeywordMode } from '@/entities/search'
import { DocumentUtils, DocumentProcessingModule } from '@/entities/document'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Dropdown, Tooltip, type DropdownOption, ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui'
import { api } from '@/shared/lib/api'
import DownloadHelper from '../../../utils/downloadHelper'
import DraggableModal from '@/shared/ui/DraggableModal'
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../components/DocumentActionIcons'
import FullTextModal from './FullTextModal'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { DocumentNotesModal } from '../DocumentStatusView/components/DocumentNotesModal'
import { CustomerSelectorModal } from '@/shared/ui/CustomerSelectorModal'
import { DocumentService } from '@/services/DocumentService'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import type { Customer } from '@/entities/customer'
import type { DocumentCustomerRelation, Document } from '../../../types/documentStatus'
import { getRecentSearchQueries, addRecentSearchQuery, type RecentSearchQuery } from '../../../utils/recentSearchQueries'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import { errorReporter } from '@/shared/lib/errorReporter'
import './DocumentSearchView.search.css';
import './DocumentSearchView.results.css';
import './DocumentSearchView.table.css';
import './DocumentSearchView.controls.css';
import './DocumentSearchView.guide.css';
import './DocumentSearchView.responsive.css';

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 (RightPane 프리뷰) */
  onDocumentClick?: (documentId: string) => void
  /** 문서 더블클릭 핸들러 (모달 프리뷰) */
  onDocumentDoubleClick?: (document: SearchResultItem) => void
  /** 고객 클릭 핸들러 (RightPane) */
  onCustomerClick?: (customerId: string) => void
  /** 고객 더블클릭 핸들러 (전체 정보 페이지) */
  onCustomerDoubleClick?: (customerId: string) => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * iOS Spotlight 스타일의 검색 UI를 제공합니다.
 * Progressive Disclosure 원칙에 따라 필요한 옵션만 단계적으로 표시됩니다.
 *
 * @example
 * ```tsx
 * <DocumentSearchView
 *   visible={isVisible}
 *   onClose={handleClose}
 *   onDocumentClick={handleDocumentClick}
 * />
 * ```
 */
// 검색 모드 옵션 정의
const SEARCH_MODE_OPTIONS: DropdownOption[] = [
  { value: 'keyword', label: '키워드 검색' },
  { value: 'semantic', label: '질문 검색' },
]

// 키워드 모드 옵션 정의
const KEYWORD_MODE_OPTIONS: DropdownOption[] = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
]

// AI 검색 결과 개수 옵션 정의
const TOP_K_OPTIONS: DropdownOption[] = [
  { value: '3', label: '상위 3개' },
  { value: '5', label: '상위 5개' },
  { value: '10', label: '상위 10개' },
  { value: '15', label: '상위 15개' },
  { value: '20', label: '상위 20개' },
]

export const DocumentSearchView: React.FC<DocumentSearchViewProps> = ({
  visible,
  onClose,
  onDocumentClick,
  onDocumentDoubleClick,
  onCustomerClick,
  onCustomerDoubleClick
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()

  // 🍎 DEV 모드 상태
  const isDevMode = useDevModeStore((state) => state.isDevMode)

  const {
    query,
    searchMode,
    keywordMode,
    customerId,
    topK,
    results,
    answer,
    isLoading,
    error,
    lastSearchMode,
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
    handleCustomerIdChange,
    handleTopKChange,
    handleReset,
  } = useDocumentSearch()

  // Full Text 모달 상태 (기존 - 검색 결과용)
  const [isFullTextModalVisible, setIsFullTextModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<{
    name: string
    fullText: string
  } | null>(null)

  // 🍎 새로운 모달 상태 관리 (DocumentLibrary와 동일한 구조)
  // Detail 모달은 API를 통해 가공된 Document 타입을 사용
  const [selectedDocumentForDetail, setSelectedDocumentForDetail] = useState<Document | null>(null)
  const [isDetailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = useState<SearchResultItem | null>(null)
  const [isSummaryModalVisible, setSummaryModalVisible] = useState(false)
  const [selectedDocumentForFullTextNew, setSelectedDocumentForFullTextNew] = useState<SearchResultItem | null>(null)
  const [isFullTextModalVisibleNew, setFullTextModalVisibleNew] = useState(false)
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState<SearchResultItem | null>(null)
  const [isLinkModalVisible, setLinkModalVisible] = useState(false)
  // 🍎 메모 모달 상태
  const [notesModalVisible, setNotesModalVisible] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<{
    documentName: string
    customerName?: string | undefined
    customerId?: string | undefined
    documentId?: string | undefined
    notes: string
  } | null>(null)

  // 🍎 검색어 위치 모달 상태 (키워드 검색 전용)
  const [keywordLocationModalVisible, setKeywordLocationModalVisible] = useState(false)
  const [selectedDocumentForKeywordLocation, setSelectedDocumentForKeywordLocation] = useState<SearchResultItem | null>(null)
  // 🍎 검색어 위치 탐색 상태
  const [keywordMatchIndex, setKeywordMatchIndex] = useState(0)  // 현재 보고 있는 매칭 인덱스

  // 🍎 고객 선택 모달 상태
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  // 🍎 검색 실행 시점의 고객 정보 (검색 결과 설명에 사용)
  const [lastSearchCustomer, setLastSearchCustomer] = useState<Customer | null>(null)
  // 🍎 최근 선택한 고객 목록 (전역 상태)
  const { recentCustomers, addRecentCustomer, getRecentCustomers } = useRecentCustomersStore()
  // 🍎 최근 검색어 목록
  const [recentSearchQueries, setRecentSearchQueries] = useState<RecentSearchQuery[]>([])
  // 🍎 검색어 입력 필드 포커스 상태
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false)
  // 🍎 검색 입력 필드 ref (자동 포커스용)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // 🍎 프로그래밍적 포커스 시 최근 검색어 드롭다운 억제용 플래그
  const suppressRecentDropdown = useRef(false)
  // 🍎 문서 행 싱글클릭/더블클릭 구분용 타이머
  const documentClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 🍎 고객명 싱글클릭/더블클릭 구분용 타이머
  const customerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 🍎 검색창 blur 타이머 (드롭다운 클릭 허용)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 🍎 문서 컨텍스트 메뉴 상태
  const documentContextMenu = useContextMenu()
  const [contextMenuDocument, setContextMenuDocument] = useState<SearchResultItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 🍎 파일명 표시 모드: 'display' = displayName 우선, 'original' = 원본 파일명
  const [filenameMode, setFilenameMode] = React.useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })

  const handleFilenameModeChange = React.useCallback((mode: 'display' | 'original') => {
    setFilenameMode(mode)
    localStorage.setItem('aims-filename-mode', mode)
  }, [])

  // 🍎 정렬 상태
  type SortField = 'filename' | 'customer' | 'status' | 'similarity' | null
  type SortOrder = 'asc' | 'desc'
  const [sortField, setSortField] = useState<SortField>('filename')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // 🍎 AI 검색 결과가 올 때 자동으로 유사도 내림차순 정렬
  useEffect(() => {
    if (lastSearchMode === 'semantic' && results.length > 0) {
      setSortField('similarity')
      setSortOrder('desc')
    } else if (lastSearchMode === 'keyword' && results.length > 0) {
      setSortField('filename')
      setSortOrder('asc')
    }
  }, [lastSearchMode, results.length])

  // 🍎 페이지 표시 시 검색 입력창에 자동 포커스
  useEffect(() => {
    if (!visible) return

    // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 포커스
    // 프로그래밍적 포커스 시 최근 검색어 드롭다운 열리지 않도록 플래그 설정
    suppressRecentDropdown.current = true
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [visible])

  // 🍎 blur 타이머 cleanup (테스트 환경 cleanup 경고 방지)
  useEffect(() => {
    return () => {
      if (blurTimer.current) {
        clearTimeout(blurTimer.current)
      }
    }
  }, [])

  // 🍎 Context의 customerId가 설정되면 해당 고객 자동 선택 (상세 문서 검색 이동 시)
  useEffect(() => {
    if (customerId && !selectedCustomer) {
      // 최근 고객 목록에서 해당 고객 찾기
      const recent = getRecentCustomers()
      const recentCustomer = recent.find(c => c._id === customerId)
      if (recentCustomer) {
        // Customer 객체 재구성 (화면 표시용)
        setSelectedCustomer({
          _id: recentCustomer._id,
          personal_info: {
            name: recentCustomer.name
          }
        } as Customer)
      }
    }
  }, [customerId, selectedCustomer, getRecentCustomers])

  /**
   * 정렬 핸들러
   */
  const handleSort = useCallback((field: Exclude<SortField, null>) => {
    if (sortField === field) {
      // 같은 필드 클릭 시 정렬 순서 토글
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // 다른 필드 클릭 시 오름차순으로 시작 (유사도는 내림차순)
      setSortField(field)
      setSortOrder(field === 'similarity' ? 'desc' : 'asc')
    }
  }, [sortField, sortOrder])

  /**
   * 정렬된 결과 생성
   */
  const sortedResults = useMemo(() => {
    if (!sortField || !results) return results

    const sorted = [...results].sort((a, b) => {
      let compareValue = 0

      if (sortField === 'filename') {
        // 🍎 filenameMode에 따라 정렬 기준 변경
        const nameA = (filenameMode === 'display' && SearchService.getDisplayName(a)) || SearchService.getOriginalName(a)
        const nameB = (filenameMode === 'display' && SearchService.getDisplayName(b)) || SearchService.getOriginalName(b)
        compareValue = nameA.toLowerCase().localeCompare(nameB.toLowerCase(), 'ko-KR')
      } else if (sortField === 'customer') {
        const customerA = ('customer_relation' in a && a.customer_relation?.customer_name) || ''
        const customerB = ('customer_relation' in b && b.customer_relation?.customer_name) || ''
        // 고객 없음은 항상 마지막
        if (!customerA && customerB) return 1
        if (customerA && !customerB) return -1
        compareValue = customerA.localeCompare(customerB, 'ko-KR')
      } else if (sortField === 'status') {
        const statusA = DocumentProcessingModule.getProcessingStatus(a as Document).status
        const statusB = DocumentProcessingModule.getProcessingStatus(b as Document).status
        // 상태 우선순위: completed > processing > failed
        const statusPriority: Record<string, number> = {
          completed: 3,
          processing: 2,
          failed: 1
        }
        compareValue = (statusPriority[statusA] || 0) - (statusPriority[statusB] || 0)
      } else if (sortField === 'similarity') {
        // 유사도 정렬 (시맨틱 검색 결과만 해당)
        const scoreA = ('score' in a ? a.score : 0) || 0
        const scoreB = ('score' in b ? b.score : 0) || 0
        compareValue = scoreA - scoreB
      }

      return sortOrder === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [results, sortField, sortOrder, filenameMode])

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // 검색 실행 시 현재 선택된 고객 저장
      setLastSearchCustomer(selectedCustomer)
      // 검색어를 최근 목록에 추가
      if (query.trim()) {
        addRecentSearchQuery(query.trim())
        setRecentSearchQueries(getRecentSearchQueries())
      }
      handleSearch()
      // 드롭다운 닫기
      setIsSearchInputFocused(false)
    }
  }

  // 🍎 최근 고객 목록은 Zustand store에서 자동으로 관리됨 (useEffect 불필요)

  /**
   * 최근 검색어 목록 불러오기
   */
  useEffect(() => {
    const recent = getRecentSearchQueries()
    console.log('[DocumentSearchView] 최근 검색어 목록:', recent)
    setRecentSearchQueries(recent)
  }, [])

  /**
   * 최근 고객 드롭다운 옵션 생성
   */
  const recentCustomerOptions = useMemo((): DropdownOption[] => {
    const options: DropdownOption[] = [
      { value: '', label: '고객 미선택' }
    ]

    // 전역 상태에서 최근 고객 목록 가져오기
    const recent = getRecentCustomers()
    recent.forEach(customer => {
      options.push({
        value: customer._id,
        label: customer.name
      })
    })

    return options
  }, [recentCustomers, getRecentCustomers])

  /**
   * 최근 고객 드롭다운에서 선택 핸들러
   */
  const handleRecentCustomerSelect = useCallback((customerId: string) => {
    if (!customerId) {
      // "고객 미선택" 선택
      setSelectedCustomer(null)
      handleCustomerIdChange(null)
      return
    }

    // 전역 상태에서 최근 고객 목록 가져와서 찾기
    const recent = getRecentCustomers()
    const recentCustomer = recent.find(c => c._id === customerId)
    if (recentCustomer) {
      // Customer 객체 재구성 (화면 표시용)
      setSelectedCustomer({
        _id: recentCustomer._id,
        personal_info: {
          name: recentCustomer.name
        }
      } as Customer)
      handleCustomerIdChange(customerId)
    }
  }, [getRecentCustomers, handleCustomerIdChange])

  /**
   * 문서 클릭 핸들러 (250ms 타이머로 더블클릭 구분)
   */
  const handleItemClick = (item: SearchResultItem) => {
    const docId = SearchService.getDocumentId(item)
    if (!docId) return
    if (documentClickTimer.current) {
      clearTimeout(documentClickTimer.current)
    }
    documentClickTimer.current = setTimeout(() => {
      if (onDocumentClick) {
        onDocumentClick(docId)
      }
      documentClickTimer.current = null
    }, 250)
  }

  /**
   * 문서 더블클릭 핸들러 (모달 프리뷰)
   */
  const handleItemDoubleClick = (item: SearchResultItem) => {
    if (documentClickTimer.current) {
      clearTimeout(documentClickTimer.current)
      documentClickTimer.current = null
    }
    if (onDocumentDoubleClick) {
      onDocumentDoubleClick(item)
    }
  }

  /**
   * 고객명 클릭 핸들러 (250ms 타이머로 더블클릭 구분)
   */
  const handleCustomerNameClick = (customerId: string) => {
    if (!customerId) return
    if (customerClickTimer.current) {
      clearTimeout(customerClickTimer.current)
    }
    customerClickTimer.current = setTimeout(() => {
      if (onCustomerClick) {
        onCustomerClick(customerId)
      }
      customerClickTimer.current = null
    }, 250)
  }

  /**
   * 고객명 더블클릭 핸들러 (전체 정보 페이지)
   */
  const handleCustomerNameDoubleClick = (customerId: string) => {
    if (customerClickTimer.current) {
      clearTimeout(customerClickTimer.current)
      customerClickTimer.current = null
    }
    if (onCustomerDoubleClick) {
      onCustomerDoubleClick(customerId)
    }
  }

  /**
   * Full Text 모달 닫기 핸들러 (기존 - 더 이상 사용하지 않음)
   */
  const handleCloseFullTextModal = () => {
    setIsFullTextModalVisible(false)
    setSelectedDocument(null)
  }

  /**
   * 🍎 새로운 모달 핸들러들 (DocumentLibrary와 동일)
   * Detail 모달은 API를 통해 가공된 Document를 표시
   */
  const handleDetailClick = useCallback(async (searchResult: SearchResultItem) => {
    // SearchResultItem에서 document_id 추출
    const docId = SearchService.getDocumentId(searchResult)
    if (!docId) {
      console.warn('[DocumentSearchView] document_id가 없습니다:', searchResult)
      return
    }

    try {
      // /api/documents/:id/status API로 가공된 Document 조회
      const response = await DocumentStatusService.getDocumentStatus(docId)

      if (!response.success || !response.data) {
        console.warn('[DocumentSearchView] 문서 데이터가 없습니다.')
        return
      }

      // response.data = { _id, raw: {...}, computed: {...} }
      // raw 데이터에서 필요한 필드 추출하여 가공된 Document 구조 생성
      const { raw, computed } = response.data

      // 문서 목록 API와 동일한 구조로 변환
      const processedDocument: Document = {
        _id: response.data._id,
        ...(raw.upload?.originalName && { originalName: raw.upload.originalName }),
        ...(raw.upload?.uploaded_at && { uploaded_at: raw.upload.uploaded_at }),
        ...(raw.meta?.size_bytes && { fileSize: raw.meta.size_bytes }),
        ...(raw.meta?.mime && { mimeType: raw.meta.mime }),
        ...(raw.customer_relation && { customer_relation: raw.customer_relation }),
        ...(computed.uiStages && { stages: computed.uiStages }),
        ...(computed.overallStatus && { overallStatus: computed.overallStatus }),
        ...(computed.progress !== undefined && { progress: computed.progress })
      }

      setSelectedDocumentForDetail(processedDocument)
      setDetailModalVisible(true)
    } catch (error) {
      console.error('[DocumentSearchView] 문서 상태 조회 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentSearchView.handleDetailClick' })
    }
  }, [])

  const handleDetailModalClose = useCallback(() => {
    setDetailModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForDetail(null)
    }, 300)
  }, [])

  const handleSummaryClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForSummary(document)
    setSummaryModalVisible(true)
  }, [])

  const handleSummaryModalClose = useCallback(() => {
    setSummaryModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForSummary(null)
    }, 300)
  }, [])

  const handleFullTextClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForFullTextNew(document)
    setFullTextModalVisibleNew(true)
  }, [])

  const handleFullTextModalCloseNew = useCallback(() => {
    setFullTextModalVisibleNew(false)
    setTimeout(() => {
      setSelectedDocumentForFullTextNew(null)
    }, 300)
  }, [])

  const handleLinkClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForLink(document)
    setLinkModalVisible(true)
  }, [])

  const handleLinkModalClose = useCallback(() => {
    setLinkModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForLink(null)
    }, 300)
  }, [])

  /**
   * 🍎 메모 저장 핸들러
   */
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentSearchView] customerId 또는 documentId가 없습니다')
      errorReporter.reportApiError(new Error('customerId 또는 documentId 누락'), { component: 'DocumentSearchView.handleSaveNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        notes
      )

      // 성공 후 상태 업데이트
      setSelectedNotes(prev => prev ? { ...prev, notes } : null)

      // 검색 결과 새로고침
      await handleSearch()
    } catch (error) {
      console.error('[DocumentSearchView] 메모 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentSearchView.handleSaveNotes' })
      showAlert({
        title: '저장 실패',
        message: '메모 저장에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, handleSearch, showAlert])

  /**
   * 🍎 메모 삭제 핸들러 (빈 문자열로 저장)
   */
  const handleDeleteNotes = useCallback(async () => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentSearchView] customerId 또는 documentId가 없습니다')
      errorReporter.reportApiError(new Error('customerId 또는 documentId 누락'), { component: 'DocumentSearchView.handleDeleteNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        ''
      )

      // 모달 닫기
      setNotesModalVisible(false)
      setSelectedNotes(null)

      // 검색 결과 새로고침
      await handleSearch()
    } catch (error) {
      console.error('[DocumentSearchView] 메모 삭제 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentSearchView.handleDeleteNotes' })
      showAlert({
        title: '삭제 실패',
        message: '메모 삭제에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, handleSearch, showAlert])

  /**
   * 🍎 고객별 문서 조회 핸들러
   */
  const fetchCustomerDocuments = useCallback(async (customerId: string) => {
    return DocumentService.getCustomerDocuments(customerId)
  }, [])

  /**
   * 🍎 문서-고객 연결 핸들러
   */
  const linkDocumentToCustomer = useCallback(
    async (params: {
      customerId: string
      documentId: string
      relationshipType: string
      notes?: string
    }): Promise<DocumentCustomerRelation | undefined> => {
      const { customerId, documentId, relationshipType, notes } = params

      await DocumentService.linkDocumentToCustomer(customerId, {
        document_id: documentId,
        relationship_type: relationshipType,
        ...(notes ? { notes } : {}),
      })

      // 검색 결과 새로고침은 필요시 추가
      return undefined
    },
    []
  )

  // 🍎 문서 컨텍스트 메뉴 핸들러
  const handleDocumentContextMenu = useCallback((item: SearchResultItem, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenuDocument(item)
    documentContextMenu.open(event)
  }, [documentContextMenu])

  // 🍎 단일 문서 삭제 핸들러 (컨텍스트 메뉴용)
  const handleDeleteSingleDocument = useCallback(async (documentId: string, documentName: string) => {
    // 확인 모달 표시
    const confirmed = await showAlert({
      title: '문서 삭제',
      message: `"${documentName}"을(를) 삭제하시겠습니까?\n\n삭제된 문서는 복구할 수 없습니다.`,
      iconType: 'warning',
      showCancel: true,
      confirmText: '삭제',
      cancelText: '취소',
    })

    if (!confirmed) return

    try {
      setIsDeleting(true)

      // API 호출하여 삭제
      await api.delete(`/api/documents/${documentId}`)

      // 검색 결과 새로고침
      await handleSearch()

      setIsDeleting(false)
    } catch (error) {
      console.error('[DocumentSearchView] 문서 삭제 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentSearchView.handleDeleteSingleDocument', payload: { documentId } })
      setIsDeleting(false)

      void showAlert({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        iconType: 'error',
      })
    }
  }, [showAlert, handleSearch])

  // 🍎 문서 컨텍스트 메뉴 섹션
  const documentContextMenuSections: ContextMenuSection[] = useMemo(() => {
    if (!contextMenuDocument) return []

    const documentId = SearchService.getDocumentId(contextMenuDocument)
    const documentName = SearchService.getOriginalName(contextMenuDocument)

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
              } else {
                handleItemClick(contextMenuDocument)
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
            onClick: () => {
              setSelectedDocumentForSummary(contextMenuDocument)
              setSummaryModalVisible(true)
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
                errorReporter.reportApiError(error as Error, { component: 'DocumentSearchView.download', payload: { documentId } })
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
                await handleDeleteSingleDocument(documentId, documentName)
              }
            }
          }
        ]
      }
    ]
  }, [contextMenuDocument, onDocumentClick, handleDeleteSingleDocument])

  /**
   * 유사도 점수를 5단계로 분류
   * - 백분율과 더 직관적인 레이블 제공
   */
  const getSimilarityLevel = (score: number): {
    icon: string
    label: string
    color: string
    percentage: string
  } => {
    const percentage = `${Math.round(score * 100)}%`
    if (score >= 0.85) {
      return { icon: '🟢', label: '정확히 일치', color: 'excellent', percentage }
    } else if (score >= 0.70) {
      return { icon: '🟢', label: '매우 관련 있음', color: 'high', percentage }
    } else if (score >= 0.50) {
      return { icon: '🟡', label: '관련 있음', color: 'medium', percentage }
    } else if (score >= 0.30) {
      return { icon: '🟠', label: '약간 관련', color: 'low', percentage }
    } else {
      return { icon: '🔴', label: '관련성 낮음', color: 'very-low', percentage }
    }
  }

  /**
   * OCR 신뢰도를 5단계로 분류
   * 0.0 ~ 1.0 범위의 신뢰도를 색상 레벨로 변환
   */
  const getOcrConfidenceLevel = (confidence: number): {
    color: string
    label: string
  } => {
    if (confidence >= 0.95) {
      return { color: 'excellent', label: '매우 높음' }
    } else if (confidence >= 0.85) {
      return { color: 'high', label: '높음' }
    } else if (confidence >= 0.70) {
      return { color: 'medium', label: '보통' }
    } else if (confidence >= 0.50) {
      return { color: 'low', label: '낮음' }
    } else {
      return { color: 'very-low', label: '매우 낮음' }
    }
  }

  /**
   * 🍎 텍스트 스니펫 추출 (키워드 검색용)
   * 검색어 주변 컨텍스트를 추출하여 보여줌
   */
  const getTextSnippet = useCallback((item: SearchResultItem): string => {
    const fullText = (item as any).ocr?.full_text ||
                     (item as any).meta?.full_text ||
                     (item as any).text?.full_text ||
                     ''

    if (!fullText) return '텍스트를 찾을 수 없습니다.'

    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return fullText.substring(0, 300) + '...'

    // 첫 번째 키워드 기준으로 앞뒤 context 추출
    const searchLower = fullText.toLowerCase()
    const keywordLower = keywords[0].toLowerCase()
    const idx = searchLower.indexOf(keywordLower)

    if (idx === -1) return fullText.substring(0, 300) + '...'

    const start = Math.max(0, idx - 100)
    const end = Math.min(fullText.length, idx + keywordLower.length + 200)
    let snippet = fullText.substring(start, end)

    if (start > 0) snippet = '...' + snippet
    if (end < fullText.length) snippet = snippet + '...'

    return snippet
  }, [query])

  /**
   * 🍎 모든 키워드 매칭 위치 찾기 (검색어 위치 탐색용)
   * 문서에서 검색어가 나타나는 모든 위치 인덱스를 반환
   */
  const getAllKeywordMatches = useCallback((item: SearchResultItem): number[] => {
    const fullText = (item as any).ocr?.full_text ||
                     (item as any).meta?.full_text ||
                     (item as any).text?.full_text ||
                     ''

    if (!fullText) return []

    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return []

    const searchLower = fullText.toLowerCase()
    const matches: number[] = []

    // 모든 키워드의 모든 위치를 찾기
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase()
      let startIndex = 0
      let idx = searchLower.indexOf(keywordLower, startIndex)

      while (idx !== -1) {
        matches.push(idx)
        startIndex = idx + 1
        idx = searchLower.indexOf(keywordLower, startIndex)
      }
    })

    // 위치 순으로 정렬하고 중복 제거
    return [...new Set(matches)].sort((a, b) => a - b)
  }, [query])

  /**
   * 🍎 파일명(제목)에서 매칭된 키워드 목록 반환
   */
  const getFilenameKeywordMatches = useCallback((item: SearchResultItem): string[] => {
    const filename = SearchService.getDisplayName(item) || SearchService.getOriginalName(item)
    if (!filename) return []

    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
    const filenameLower = filename.toLowerCase()
    return keywords.filter(k => filenameLower.includes(k.toLowerCase()))
  }, [query])

  /**
   * 🍎 특정 매칭 인덱스의 스니펫 추출 (검색어 위치 탐색용)
   * matchIdx번째 매칭 위치 주변 텍스트와 현재 키워드의 스니펫 내 위치를 반환
   */
  const getTextSnippetAtIndex = useCallback((item: SearchResultItem, matchIdx: number): {
    snippet: string
    currentKeywordOffset: number  // 스니펫 내에서 현재 키워드의 시작 위치
    currentKeywordLength: number  // 현재 키워드의 길이
  } => {
    const fullText = (item as any).ocr?.full_text ||
                     (item as any).meta?.full_text ||
                     (item as any).text?.full_text ||
                     ''

    if (!fullText) return { snippet: '텍스트를 찾을 수 없습니다.', currentKeywordOffset: -1, currentKeywordLength: 0 }

    const matches = getAllKeywordMatches(item)
    if (matches.length === 0 || matchIdx >= matches.length) {
      return { snippet: fullText.substring(0, 300) + '...', currentKeywordOffset: -1, currentKeywordLength: 0 }
    }

    const idx = matches[matchIdx]
    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)

    // 현재 위치에서 실제로 매칭된 키워드 찾기
    const fullTextLower = fullText.toLowerCase()
    let matchedKeyword = keywords[0] || ''
    let matchedLength = matchedKeyword.length
    for (const kw of keywords) {
      if (fullTextLower.substring(idx, idx + kw.length).toLowerCase() === kw.toLowerCase()) {
        matchedKeyword = fullText.substring(idx, idx + kw.length)
        matchedLength = kw.length
        break
      }
    }

    const start = Math.max(0, idx - 100)
    const end = Math.min(fullText.length, idx + matchedLength + 200)
    let snippet = fullText.substring(start, end)

    // "..." prefix 추가 여부에 따른 오프셋 계산
    let currentKeywordOffset = idx - start
    if (start > 0) {
      snippet = '...' + snippet
      currentKeywordOffset += 3  // "..." 길이
    }
    if (end < fullText.length) snippet = snippet + '...'

    return { snippet, currentKeywordOffset, currentKeywordLength: matchedLength }
  }, [query, getAllKeywordMatches])

  /**
   * 🍎 현재 키워드를 특별히 강조하는 하이라이트 (검색어 위치 탐색용)
   * 현재 보고 있는 키워드는 다른 스타일로 표시
   */
  const highlightKeywordsWithCurrent = useCallback((
    text: string,
    currentOffset: number,
    currentLength: number
  ): React.ReactNode => {
    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return text

    // 현재 키워드 위치가 유효한 경우, 특별 처리
    if (currentOffset >= 0 && currentLength > 0) {
      const before = text.substring(0, currentOffset)
      const current = text.substring(currentOffset, currentOffset + currentLength)
      const after = text.substring(currentOffset + currentLength)

      // 앞부분과 뒷부분은 일반 하이라이트, 현재 키워드는 특별 하이라이트
      return (
        <>
          {highlightKeywordsNormal(before, keywords)}
          <mark className="doc-search-highlight doc-search-highlight--current">{current}</mark>
          {highlightKeywordsNormal(after, keywords)}
        </>
      )
    }

    return highlightKeywordsNormal(text, keywords)
  }, [query])

  /**
   * 🍎 일반 키워드 하이라이트 (내부 헬퍼)
   */
  const highlightKeywordsNormal = (text: string, keywords: string[]): React.ReactNode => {
    if (!text || keywords.length === 0) return text

    const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(pattern)

    return parts.map((part, index) => {
      const isMatch = keywords.some(kw => part.toLowerCase() === kw.toLowerCase())
      return isMatch ? (
        <mark key={index} className="doc-search-highlight">{part}</mark>
      ) : (
        <span key={index}>{part}</span>
      )
    })
  }

  /**
   * 🍎 키워드 하이라이트 (키워드 검색용)
   * 텍스트 내 검색어를 하이라이트 처리
   */
  const highlightKeywords = useCallback((text: string): React.ReactNode => {
    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return text

    const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(pattern)

    return parts.map((part, index) => {
      const isMatch = keywords.some(kw => part.toLowerCase() === kw.toLowerCase())
      return isMatch ? (
        <mark key={index} className="doc-search-highlight">{part}</mark>
      ) : (
        <span key={index}>{part}</span>
      )
    })
  }, [query])

  return (
    <CenterPaneView
      visible={visible}
      title="상세 문서검색"
      titleIcon={<SFSymbol name="search-bold" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-search)' }} />}
      titleAccessory={
        <Tooltip content="이전 페이지로 돌아가기" placement="bottom">
          <button
            type="button"
            className="back-icon-button"
            onClick={() => window.history.back()}
            aria-label="돌아가기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
            </svg>
          </button>
        </Tooltip>
      }
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-search-view"
    >
      <div className="document-search-container">
        {/* 🍎 iOS Spotlight 검색바 - 한 줄 레이아웃 */}
        <div className="search-bar-wrapper">
          {/* 🍎 고객 선택 버튼 (모든 검색 모드에서 표시) */}
          <button
            className="customer-select-button"
            onClick={() => setIsCustomerSelectorOpen(true)}
            aria-label="고객 선택"
            title="고객 선택"
          >
            고객선택
          </button>

          {/* 🍎 선택된 고객명 표시 또는 최근 고객 드롭다운 */}
          <div className="selected-customer-display">
            {selectedCustomer ? (
              <>
                <span className="selected-customer-name">
                  {selectedCustomer.personal_info?.name}
                </span>
                <button
                  className="clear-customer-button"
                  onClick={() => {
                    setSelectedCustomer(null)
                    handleCustomerIdChange(null)
                  }}
                  aria-label="고객 선택 해제"
                  title="고객 선택 해제"
                >
                  ✕
                </button>
              </>
            ) : (
              <Dropdown
                value=""
                options={recentCustomerOptions}
                onChange={handleRecentCustomerSelect}
                width={115}
                aria-label="최근 선택한 고객"
              />
            )}
          </div>

          {/* A: 검색 입력 필드 (flex-grow) */}
          <div className="search-input-wrapper">
            <button
              className="search-icon"
              onClick={() => {
                // 최근 검색어 드롭다운 토글
                const newFocusState = !isSearchInputFocused
                setIsSearchInputFocused(newFocusState)
                if (newFocusState) {
                  // 드롭다운 열 때 최근 검색어 다시 불러오기
                  const recent = getRecentSearchQueries()
                  setRecentSearchQueries(recent)
                }
              }}
              aria-label="최근 검색어 보기"
              type="button"
            >
              🔍
            </button>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => {
                // 프로그래밍적 포커스(페이지 진입 시 자동 포커스)에서는 드롭다운 열지 않음
                if (suppressRecentDropdown.current) {
                  suppressRecentDropdown.current = false
                  return
                }
                // 사용자 클릭에 의한 포커스 시에만 최근 검색어 드롭다운 열기
                setIsSearchInputFocused(true)
                const recent = getRecentSearchQueries()
                setRecentSearchQueries(recent)
              }}
              onBlur={() => {
                // 드롭다운 클릭 시간을 주기 위해 지연 (cleanup 가능하도록 ref 사용)
                if (blurTimer.current) clearTimeout(blurTimer.current)
                blurTimer.current = setTimeout(() => setIsSearchInputFocused(false), 200)
              }}
              placeholder="상세 문서검색"
              aria-label="상세 문서검색"
            />
            {/* 🍎 검색어 지우기 버튼 (Progressive Disclosure) */}
            {query.trim() && (
              <button
                className="clear-search-button"
                onClick={() => {
                  handleQueryChange('')
                }}
                aria-label="검색어 지우기"
                type="button"
              >
                ✕
              </button>
            )}
            {/* 🍎 최근 검색어 드롭다운 */}
            {isSearchInputFocused && recentSearchQueries.length > 0 && (
              <div className="recent-search-dropdown">
                <div className="recent-search-header">최근 검색어</div>
                <div className="recent-search-list">
                  {recentSearchQueries.map((item, index) => (
                    <button
                      key={index}
                      className="recent-search-item"
                      onClick={() => {
                        handleQueryChange(item.query)
                        setIsSearchInputFocused(false)
                      }}
                      type="button"
                    >
                      <span className="recent-search-text">{item.query}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* B: 검색 모드 드롭다운 */}
          <Dropdown
            value={searchMode}
            options={SEARCH_MODE_OPTIONS}
            onChange={(value) => handleSearchModeChange(value as SearchMode)}
            aria-label="검색 모드 선택"
            width={135}
          />

          {/* 🍎 Progressive Disclosure: 키워드 검색 시 드롭다운으로 AND/OR 선택 */}
          {searchMode === 'keyword' && (
            <Dropdown
              value={keywordMode}
              options={KEYWORD_MODE_OPTIONS}
              onChange={(value) => handleKeywordModeChange(value as KeywordMode)}
              aria-label="키워드 모드 선택"
              width={75}
            />
          )}

          {/* 🍎 Progressive Disclosure: AI 검색 시 결과 개수 선택 */}
          {searchMode === 'semantic' && (
            <Dropdown
              value={String(topK)}
              options={TOP_K_OPTIONS}
              onChange={(value) => handleTopKChange(Number(value))}
              aria-label="AI 검색 결과 개수 선택"
              width={110}
            />
          )}

          {/* 🍎 Progressive Disclosure: 검색 결과 초기화 버튼 (검색어나 결과가 있을 때만 표시) */}
          {(query || results.length > 0) && (
            <Tooltip content="검색 초기화">
              <button
                className="reset-button"
                onClick={() => {
                  handleReset()
                  setLastSearchCustomer(null)
                }}
                aria-label="검색 초기화"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.CALLOUT}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </button>
            </Tooltip>
          )}

          {/* 검색 버튼 */}
          <button
            className="search-button"
            onClick={() => {
              // 검색 실행 시 현재 선택된 고객 저장
              setLastSearchCustomer(selectedCustomer)
              // 검색어를 최근 목록에 추가
              if (query.trim()) {
                addRecentSearchQuery(query.trim())
                setRecentSearchQueries(getRecentSearchQueries())
              }
              handleSearch()
              // 드롭다운 닫기
              setIsSearchInputFocused(false)
            }}
            disabled={isLoading}
            aria-label={isLoading ? '검색 중' : '검색 실행'}
          >
            {isLoading ? '검색 중...' : '검색'}
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="search-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {/* 검색 결과 영역 */}
        <div className="search-results-section">
          {isLoading ? (
            <div className="search-loading" role="status" aria-live="polite">
              검색 중입니다. 잠시만 기다려 주세요...
            </div>
          ) : results.length > 0 ? (
            <>
              {/* AI 답변 (시맨틱 검색시) - 기본적으로 펼쳐짐, 접기 가능 */}
              {answer && answer.trim() && (
                <details className="search-answer" open>
                  <summary className="answer-title">
                    <span className="answer-arrow">▶</span> AI 답변 (클릭하여 숨기기)
                  </summary>
                  <p className="answer-content">{answer}</p>
                </details>
              )}

              {/* 검색 결과 헤더 */}
              <div className="search-results-header">
                <div className="results-header-text">
                  {lastSearchMode === 'semantic' ? (
                    <p>주어진 검색어와 유사도가 높은 상위 {results.length}개의 문서를 보여드립니다.</p>
                  ) : (
                    <>
                      <p>
                        {lastSearchCustomer
                          ? `${lastSearchCustomer.personal_info?.name}에 대하여 검색한 결과, 총 ${results.length}건의 파일이 검색되었습니다.`
                          : `모든 고객에 대하여 검색한 결과, 총 ${results.length}건의 파일이 검색되었습니다.`}
                      </p>
                      <p className="results-divider">--- 검색 결과 ---</p>
                    </>
                  )}
                </div>
              </div>

              {/* 🍎 유사도 점수 범례 (시맨틱 검색일 때만 표시) */}
              {searchMode === 'semantic' && results.length > 0 && (
                <div className="similarity-legend">
                  <div className="legend-title">유사도 점수:</div>
                  <div className="legend-items">
                    <div className="legend-item">
                      <span className="legend-icon">🟢</span>
                      <span className="legend-label">정확히 일치 (≥85%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟢</span>
                      <span className="legend-label">매우 관련 있음 (≥70%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟡</span>
                      <span className="legend-label">관련 있음 (≥50%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟠</span>
                      <span className="legend-label">약간 관련 (≥30%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🔴</span>
                      <span className="legend-label">관련성 낮음 (&lt;30%)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 🍎 컬럼 헤더 */}
              <div className="search-results-column-header" data-search-mode={searchMode}>
                <div className="header-index">#</div>
                <div className="header-filename">
                  <div
                    className={`header-filename__sort-area sortable ${sortField === 'filename' ? 'sorted' : ''}`}
                    onClick={() => handleSort('filename')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('filename')
                      }
                    }}
                    aria-label={`파일명으로 정렬 ${sortField === 'filename' ? (sortOrder === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
                      <path className="pdf-icon-fold" d="M9 1v3h3" strokeWidth="0.8" fill="none"/>
                    </svg>
                    <span>파일명</span>
                    <SortIndicator field="filename" currentSortField={sortField} sortDirection={sortOrder} />
                  </div>
                  {/* 🍎 파일명 표시 모드 토글: 원본 ↔ 별칭 */}
                  <Tooltip content={filenameMode === 'display' ? '원본 파일명 보기' : '별칭 보기'}>
                    <button
                      type="button"
                      className="filename-mode-toggle"
                      onClick={(e) => {
                        e.stopPropagation()
                        const next = filenameMode === 'display' ? 'original' : 'display'
                        handleFilenameModeChange(next)
                      }}
                      aria-label={filenameMode === 'display' ? '원본 파일명 보기' : '별칭 보기'}
                    >
                      {filenameMode === 'display' ? '별칭' : '원본'}
                    </button>
                  </Tooltip>
                </div>
                <div
                  className={`header-customer sortable ${sortField === 'customer' ? 'sorted' : ''}`}
                  onClick={() => handleSort('customer')}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSort('customer')
                    }
                  }}
                  aria-label={`연결된 고객으로 정렬 ${sortField === 'customer' ? (sortOrder === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                >
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  </svg>
                  <span>연결된 고객</span>
                  <SortIndicator field="customer" currentSortField={sortField} sortDirection={sortOrder} />
                </div>
                <div
                  className={`header-status sortable ${sortField === 'status' ? 'sorted' : ''}`}
                  onClick={() => handleSort('status')}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSort('status')
                    }
                  }}
                  aria-label={`상태로 정렬 ${sortField === 'status' ? (sortOrder === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                >
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M5 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>상태</span>
                  <SortIndicator field="status" currentSortField={sortField} sortDirection={sortOrder} />
                </div>
                {/* 🍎 유사도 헤더 (시맨틱 검색 시만 표시) */}
                {searchMode === 'semantic' && (
                  <div
                    className={`header-similarity sortable ${sortField === 'similarity' ? 'sorted' : ''}`}
                    onClick={() => handleSort('similarity')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('similarity')
                      }
                    }}
                    aria-label={`유사도로 정렬 ${sortField === 'similarity' ? (sortOrder === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <path d="M8 3v10M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    </svg>
                    <span>유사도</span>
                    <SortIndicator field="similarity" currentSortField={sortField} sortDirection={sortOrder} />
                  </div>
                )}
                <div className="header-actions">
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                  </svg>
                  <span>액션</span>
                </div>
              </div>

              {/* 🍎 iOS Table View 스타일 결과 리스트 */}
              <div className="search-results-table" role="list">
                {sortedResults.map((item, index) => {
                  const originalName = SearchService.getOriginalName(item)
                  const displayName = SearchService.getDisplayName(item)
                  const hasDisplay = Boolean(displayName)
                  // 🍎 filenameMode에 따라 표시할 파일명 결정
                  const showName = filenameMode === 'display' && hasDisplay
                    ? displayName!
                    : originalName
                  // 🍎 툴팁용 대체 파일명
                  const altName = filenameMode === 'display' && hasDisplay
                    ? `원본: ${originalName}`
                    : (hasDisplay ? `별칭: ${displayName}` : '')
                  const summary = SearchService.getSummary(item)
                  const confidence = SearchService.getOCRConfidence(item)
                  const score = 'score' in item ? item.score : null
                  const mimeType = SearchService.getMimeType(item)

                  // 🍎 문서 처리 상태 정보 추출
                  const status = DocumentProcessingModule.getProcessingStatus(item as Document)
                  const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(item as Document)
                  const canLink = linkStatus.canLink
                  const linkTooltip = linkStatus.isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

                  return (
                    <div
                      key={index}
                      className="search-result-row"
                      data-search-mode={searchMode}
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleDocumentContextMenu(item, e)}
                      role="listitem"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleItemClick(item)
                        }
                      }}
                      aria-label={`문서: ${originalName}`}
                    >
                      {/* 인덱스 */}
                      <div className="row-index">
                        <span>[{index + 1}]</span>
                      </div>

                      {/* 파일명 */}
                      <div className="row-filename">
                        <div className="row-title-wrapper">
                          {/* 🍎 파일 타입 아이콘 */}
                          <div className="document-icon-wrapper">
                            <div className={`document-icon ${DocumentUtils.getFileTypeClass(mimeType, originalName)}`}>
                              <SFSymbol
                                name={DocumentUtils.getFileIcon(mimeType, originalName)}
                                size={SFSymbolSize.CAPTION_1}
                                weight={SFSymbolWeight.REGULAR}
                                decorative={true}
                              />
                            </div>
                            {/* 🍎 AR BADGE: Annual Report 표시 */}
                            {('is_annual_report' in item && item.is_annual_report) ? (
                              <Tooltip content="Annual Report">
                                <div className="document-ar-badge">
                                  AR
                                </div>
                              </Tooltip>
                            ) : null}
                            {/* 🍎 CR BADGE: Customer Review (변액 리포트) 표시 */}
                            {('is_customer_review' in item && item.is_customer_review) && !('is_annual_report' in item && item.is_annual_report) ? (
                              <Tooltip content="변액 리포트">
                                <div className="document-cr-badge">
                                  CR
                                </div>
                              </Tooltip>
                            ) : null}
                            {/* 🍎 OCR BADGE: OCR 처리 완료 문서 신뢰도 표시 */}
                            {confidence !== null && confidence !== undefined ? (
                              <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${getOcrConfidenceLevel(confidence).label})`}>
                                <div className={`document-ocr-badge ocr-${getOcrConfidenceLevel(confidence).color}`}>
                                  OCR
                                </div>
                              </Tooltip>
                            ) : (() => {
                              // OCR 뱃지가 없는 경우, TXT 또는 BIN 타입 표시
                              const typeLabel = DocumentUtils.getDocumentTypeLabel(item);
                              if (typeLabel === 'TXT') {
                                return (
                                  <Tooltip content="TXT 기반 문서">
                                    <div className="document-txt-badge">
                                      TXT
                                    </div>
                                  </Tooltip>
                                );
                              }
                              if (typeLabel === 'BIN') {
                                return (
                                  <Tooltip content="바이너리 파일 (텍스트 추출 불가)">
                                    <div className="document-bin-badge">
                                      BIN
                                    </div>
                                  </Tooltip>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="row-title-container">
                            {/* 🍎 filenameMode에 따라 별칭/원본 전환 표시 */}
                            {altName ? (
                              <Tooltip content={altName}>
                                <span className="row-title">{showName}</span>
                              </Tooltip>
                            ) : (
                              <span className="row-title">{showName}</span>
                            )}
                            {/* 메모 버튼: customer_relation에 notes가 있는 경우에만 표시 */}
                            {('customer_relation' in item && item.customer_relation?.notes &&
                             typeof item.customer_relation.notes === 'string' &&
                             item.customer_relation.notes.trim() !== '') && (
                              <Tooltip
                                content={
                                  item.customer_relation.notes.length > 50
                                    ? `${item.customer_relation.notes.substring(0, 50)}...`
                                    : item.customer_relation.notes
                                }
                              >
                                <button
                                  className="document-notes-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedNotes({
                                      documentName: originalName,
                                      customerName: item.customer_relation?.customer_name,
                                      customerId: item.customer_relation?.customer_id,
                                      documentId: SearchService.getDocumentId(item),
                                      notes: item.customer_relation?.notes || ''
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
                        </div>
                        <div className="row-subtitle">{summary}</div>
                      </div>

                      {/* 연결된 고객 */}
                      <div className="row-customer">
                        {('customer_relation' in item && item.customer_relation?.customer_name) ? (
                          item.customer_relation.customer_type === MY_STORAGE_MARKER ? (
                            // 🆕 내 보관함: 클릭 불가, 폴더 아이콘 (SFSymbol 사용)
                            <span className="customer-name-label customer-name-label--storage">
                              <SFSymbol
                                name="folder"
                                size={SFSymbolSize.CALLOUT}
                                weight={SFSymbolWeight.SEMIBOLD}
                                decorative={true}
                                className="customer-icon--storage"
                              />
                              <span className="customer-name-text">{MY_STORAGE_DISPLAY_NAME}</span>
                            </span>
                          ) : (
                            // 일반 고객: 클릭 가능
                            <button
                              className="customer-name-button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (item.customer_relation?.customer_id) {
                                  handleCustomerNameClick(item.customer_relation.customer_id)
                                }
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                if (item.customer_relation?.customer_id) {
                                  handleCustomerNameDoubleClick(item.customer_relation.customer_id)
                                }
                              }}
                              aria-label={`${item.customer_relation.customer_name} 상세 보기`}
                            >
                              <div className="customer-icon-wrapper">
                                {item.customer_relation.customer_type === '법인' ? (
                                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
                                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                                    <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                                  </svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                                    <circle cx="10" cy="7" r="3" />
                                    <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                                  </svg>
                                )}
                              </div>
                              <span className="customer-name-text">{item.customer_relation.customer_name}</span>
                            </button>
                          )
                        ) : (
                          <span className="customer-none">-</span>
                        )}
                      </div>

                      {/* 상태 */}
                      <div className="row-status">
                        <Tooltip content={status.label}>
                          <div className={`status-icon status-${status.status}`}>
                            {status.icon}
                          </div>
                        </Tooltip>
                      </div>

                      {/* 🍎 유사도 (시맨틱 검색 시만 표시) */}
                      {searchMode === 'semantic' && (
                        <div className="row-similarity">
                          {score !== null && (
                            <Tooltip content={`유사도: ${getSimilarityLevel(score).percentage} - ${getSimilarityLevel(score).label}`}>
                              <div
                                className={`similarity-indicator similarity-${getSimilarityLevel(score).color}`}
                                aria-label={`유사도 ${getSimilarityLevel(score).percentage} ${getSimilarityLevel(score).label}`}
                              >
                                <span className="similarity-icon">{getSimilarityLevel(score).icon}</span>
                                <span className="similarity-percentage">{getSimilarityLevel(score).percentage}</span>
                                <span className="similarity-label">{getSimilarityLevel(score).label}</span>
                              </div>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      {/* 🍎 액션 버튼들 */}
                      <div className="row-actions">
                        {/* 🍎 상세 보기 버튼 */}
                        <Tooltip content="상세 보기">
                          <button
                            className="action-button action-button--detail"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDetailClick(item)
                        }}
                        aria-label="상세 보기"
                      >
                        <EyeIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 요약 보기 버튼 */}
                    <Tooltip content="요약 보기">
                          <button
                            className="action-button action-button--summary"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSummaryClickInternal(item)
                        }}
                        aria-label="요약 보기"
                      >
                        <SummaryIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 전체 텍스트 보기 버튼 */}
                    <Tooltip content="전체 텍스트 보기">
                          <button
                            className="action-button action-button--full"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFullTextClickInternal(item)
                        }}
                        aria-label="전체 텍스트 보기"
                      >
                        <DocumentIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 검색어 위치 버튼 (키워드 검색 시에만 표시) */}
                    {lastSearchMode === 'keyword' && (
                      <Tooltip content="검색어 위치 보기">
                        <button
                          type="button"
                          className="action-button action-button--keyword-location"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDocumentForKeywordLocation(item)
                            setKeywordMatchIndex(0)  // 인덱스 초기화
                            setKeywordLocationModalVisible(true)
                          }}
                          aria-label="검색어 위치 보기"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                            <path d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5z"/>
                          </svg>
                        </button>
                      </Tooltip>
                    )}

                    {/* 🍎 고객에게 연결 버튼 (DEV 모드에서만 표시) */}
                    {isDevMode && (
                      <Tooltip content={linkTooltip}>
                        <button
                          type="button"
                          className="action-button action-button--link"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (canLink) {
                              handleLinkClickInternal(item)
                            }
                          }}
                          aria-label={linkTooltip}
                          disabled={!canLink}
                          data-disabled={!canLink}
                          tabIndex={canLink ? 0 : -1}
                        >
                          <LinkIcon />
                        </button>
                      </Tooltip>
                    )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="search-empty" role="status">
                {lastSearchMode ? (
                  <div className="search-no-results">
                    <div className="no-results-icon">🔍</div>
                    <div className="no-results-text">
                      <div className="no-results-title">검색 결과가 없습니다</div>
                      <div className="no-results-description">
                        다른 검색어를 입력하거나 검색 모드를 변경해보세요.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="search-guide">
                    <div className="guide-header">
                      <div className="guide-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path className="lightbulb-bulb" d="M12 3C8.68629 3 6 5.68629 6 9C6 11.4363 7.4152 13.5392 9.42857 14.3572V17C9.42857 17.5523 9.87629 18 10.4286 18H13.5714C14.1237 18 14.5714 17.5523 14.5714 17V14.3572C16.5848 13.5392 18 11.4363 18 9C18 5.68629 15.3137 3 12 3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path className="lightbulb-base" d="M9 18H15M10 21H14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <h3 className="guide-title">사용 방법</h3>
                    </div>

                    <div className="guide-content">
                      <div className="guide-section">
                        <div className="guide-step">
                          <span className="step-number">1</span>
                          <div className="step-content">
                            <h4 className="step-title">고객 선택</h4>
                            <p className="step-description">특정 고객을 선택하면 해당 고객 문서만 검색합니다</p>
                          </div>
                        </div>

                        <div className="guide-step">
                          <span className="step-number">2</span>
                          <div className="step-content">
                            <h4 className="step-title">검색어 입력</h4>
                            <p className="step-description">찾고 싶은 내용을 검색창에 입력하세요</p>
                          </div>
                        </div>

                        <div className="guide-step">
                          <span className="step-number">3</span>
                          <div className="step-content">
                            <h4 className="step-title">검색 모드 선택</h4>
                            <div className="mode-options">
                              <div className="mode-option">
                                <span className="mode-badge mode-keyword">키워드 검색</span>
                                <p className="mode-description">AND: 모든 키워드 포함</p>
                                <p className="mode-description">OR: 하나 이상 포함</p>
                              </div>
                              <div className="mode-option">
                                <span className="mode-badge mode-ai">질문 검색</span>
                                <p className="mode-description">자연어로 질문하여 답을 검색</p>
                                <p className="mode-description mode-description--credit">크레딧 사용</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="guide-tips">
                        <ul className="tips-list">
                          <li>고객을 먼저 선택하면 더 빠르고 정확합니다</li>
                          <li>질문 검색 예: "암 진단 시 보험금은?"</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Full Text 모달 (기존 - 더 이상 사용하지 않음) */}
      {selectedDocument && (
        <FullTextModal
          visible={isFullTextModalVisible}
          onClose={handleCloseFullTextModal}
          documentName={selectedDocument.name}
          fullText={selectedDocument.fullText}
        />
      )}

      {/* 🍎 새로운 모달들 (DocumentLibrary와 동일) */}
      <DocumentDetailModal
        visible={isDetailModalVisible}
        onClose={handleDetailModalClose}
        document={selectedDocumentForDetail}
      />
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={handleSummaryModalClose}
        document={selectedDocumentForSummary}
      />
      <DocumentFullTextModal
        visible={isFullTextModalVisibleNew}
        onClose={handleFullTextModalCloseNew}
        document={selectedDocumentForFullTextNew}
      />
      <DocumentLinkModal
        visible={isLinkModalVisible}
        onClose={handleLinkModalClose}
        document={selectedDocumentForLink}
        onFetchCustomerDocuments={fetchCustomerDocuments}
        onLink={linkDocumentToCustomer}
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

      {/* 🍎 고객 선택 모달 */}
      <CustomerSelectorModal
        visible={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        onSelect={(customer) => {
          setSelectedCustomer(customer)
          handleCustomerIdChange(customer._id)
          // 최근 고객 목록에 추가 (전역 상태 자동 업데이트)
          addRecentCustomer(customer)
          console.log('선택된 고객:', customer)
        }}
      />

      {/* 🍎 검색어 위치 모달 (키워드 검색 전용) */}
      {selectedDocumentForKeywordLocation && (() => {
        const totalMatches = getAllKeywordMatches(selectedDocumentForKeywordLocation).length
        const filenameMatches = getFilenameKeywordMatches(selectedDocumentForKeywordLocation)
        const currentIndex = keywordMatchIndex
        const hasPrev = currentIndex > 0
        const hasNext = currentIndex < totalMatches - 1
        const filename = (filenameMode === 'display' && SearchService.getDisplayName(selectedDocumentForKeywordLocation)) || SearchService.getOriginalName(selectedDocumentForKeywordLocation)

        return (
          <DraggableModal
            visible={keywordLocationModalVisible}
            onClose={() => {
              setKeywordLocationModalVisible(false)
              setSelectedDocumentForKeywordLocation(null)
              setKeywordMatchIndex(0)
            }}
            title={
              <div className="keyword-location-modal-title">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                </svg>
                <span>검색어 위치</span>
              </div>
            }
            initialWidth={800}
            initialHeight={600}
            minWidth={400}
            minHeight={300}
            storageKey="keyword-location-modal"
          >
            <div className="keyword-location-modal-content">
              <div className="keyword-location-modal-header">
                <span className="keyword-location-filename">
                  {filename}
                </span>
                <span className="keyword-location-query">
                  검색어: <strong>{query}</strong>
                </span>
              </div>

              {/* 🍎 매칭 요약: 제목/본문 각각 표시 */}
              <div className="keyword-location-summary">
                <div className={`keyword-location-summary-item ${filenameMatches.length > 0 ? 'keyword-location-summary-item--match' : ''}`}>
                  <span className="keyword-location-summary-label">제목</span>
                  <span className="keyword-location-summary-count">
                    {filenameMatches.length > 0
                      ? `${filenameMatches.length}건 일치`
                      : '일치 없음'}
                  </span>
                </div>
                <div className={`keyword-location-summary-item ${totalMatches > 0 ? 'keyword-location-summary-item--match' : ''}`}>
                  <span className="keyword-location-summary-label">본문</span>
                  <span className="keyword-location-summary-count">
                    {totalMatches > 0 ? `${totalMatches}건 일치` : '일치 없음'}
                  </span>
                </div>
              </div>

              {/* 🍎 제목 매칭 영역 */}
              {filenameMatches.length > 0 && (
                <div className="keyword-location-section">
                  <div className="keyword-location-section-label">제목에서 발견</div>
                  <div className="keyword-location-section-content">
                    {highlightKeywordsNormal(filename, filenameMatches)}
                  </div>
                </div>
              )}

              {/* 🍎 본문 매칭 영역 */}
              <div className="keyword-location-section keyword-location-section--body">
                <div className="keyword-location-section-label">
                  본문{totalMatches > 0 ? ` (${totalMatches}건)` : ''}
                </div>

                {totalMatches > 0 && (
                  <div className="keyword-location-nav">
                    <button
                      type="button"
                      className="keyword-location-nav-btn"
                      onClick={() => setKeywordMatchIndex(prev => Math.max(0, prev - 1))}
                      disabled={!hasPrev}
                      aria-label="이전 결과"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                      </svg>
                    </button>

                    <span className="keyword-location-counter">
                      <strong>{currentIndex + 1}</strong>
                      <span className="keyword-location-separator">/</span>
                      <span>{totalMatches}</span>
                    </span>

                    <button
                      type="button"
                      className="keyword-location-nav-btn"
                      onClick={() => setKeywordMatchIndex(prev => Math.min(totalMatches - 1, prev + 1))}
                      disabled={!hasNext}
                      aria-label="다음 결과"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </button>
                  </div>
                )}

                <div className="keyword-location-text">
                  {totalMatches > 0 ? (() => {
                    const { snippet, currentKeywordOffset, currentKeywordLength } = getTextSnippetAtIndex(selectedDocumentForKeywordLocation, currentIndex)
                    return highlightKeywordsWithCurrent(snippet, currentKeywordOffset, currentKeywordLength)
                  })() : (
                    <span className="keyword-location-no-match">본문에서 발견된 결과 없음</span>
                  )}
                </div>
              </div>
            </div>
          </DraggableModal>
        )
      })()}

      {/* 🍎 문서 컨텍스트 메뉴 */}
      <ContextMenu
        visible={documentContextMenu.isOpen}
        position={documentContextMenu.position}
        sections={documentContextMenuSections}
        onClose={documentContextMenu.close}
      />
    </CenterPaneView>
  )
}

export default DocumentSearchView
