
import { CustomerService } from '@/services/customerService';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useGaps } from './hooks/useGaps'
import { useDynamicType, initializeDynamicType } from './hooks/useDynamicType'
import { useHapticFeedback, initializeHapticStyles, HAPTIC_TYPES } from './hooks/useHapticFeedback'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import Header from './components/Header'
import { DocumentSearchProvider } from './contexts/DocumentSearchProvider'
import { AppleConfirmProvider } from './contexts/AppleConfirmProvider'
import { DevToolsPanel } from './shared/ui/DevToolsPanel'
import { OnboardingTour, type TourStep } from './shared/components/OnboardingTour'
import { RightClickGuide } from './shared/components/RightClickGuide'
import { useAccountSettingsStore } from './shared/store/useAccountSettingsStore'
import { useRecentCustomersStore } from './shared/store/useRecentCustomersStore'
import { useUserStore } from './stores/user'
import { getCurrentUser } from './entities/user/api'
import { useInquiryNotifications } from './shared/hooks/useInquiryNotifications'
import { useUserAccountSSE } from './shared/hooks/useUserAccountSSE'
import { useNoticeNotifications } from './hooks/useNoticeNotifications'
import type { Customer as _Customer } from './entities/customer'
import { APP_VERSION, GIT_HASH, FULL_VERSION, logVersionInfo } from './config/version'
import { errorReporter } from './shared/lib/errorReporter'

// Lazy loading으로 성능 최적화
const LayoutControlModal = lazy(() => import('./components/LayoutControlModal'))
const HamburgerButton = lazy(() => import('./components/HamburgerButton'))
const CustomMenu = lazy(() => import('./components/CustomMenu/CustomMenu'))
const DocumentRegistrationView = lazy(() => import('./components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView'))
const DocumentLibraryView = lazy(() => import('./components/DocumentViews/DocumentLibraryView/DocumentLibraryView'))
const DocumentExplorerView = lazy(() => import('./components/DocumentViews/DocumentExplorerView/DocumentExplorerView'))
const DocumentSearchView = lazy(() => import('./components/DocumentViews/DocumentSearchView/DocumentSearchView'))
const PersonalFilesView = lazy(() => import('./components/DocumentViews/PersonalFilesView/PersonalFilesView'))
const DocumentManagementView = lazy(() => import('./components/DocumentViews/DocumentManagementView/DocumentManagementView'))
const CustomerManagementView = lazy(() => import('./components/CustomerViews/CustomerManagementView/CustomerManagementView'))
const CustomerRegistrationView = lazy(() => import('./components/CustomerViews/CustomerRegistrationView/CustomerRegistrationView'))
const CustomerAllView = lazy(() => import('./components/CustomerViews/CustomerAllView/CustomerAllView'))
const CustomerRegionalView = lazy(() => import('./components/CustomerViews/CustomerRegionalView/CustomerRegionalView'))
const CustomerRelationshipView = lazy(() => import('./components/CustomerViews/CustomerRelationshipView/CustomerRelationshipView'))
const ContractManagementView = lazy(() => import('./components/ContractViews/ContractManagementView'))
const ContractAllView = lazy(() => import('./components/ContractViews/ContractAllView'))
const ContractImportView = lazy(() => import('./components/ContractViews/ContractImportView'))
const BatchDocumentUploadView = lazy(() => import('./features/batch-upload/BatchDocumentUploadView'))
const QuickActionsView = lazy(() => import('./components/QuickActionsViews/QuickActionsView'))
const BaseViewer = lazy(() => import('./components/BaseViewer'))
const PDFViewer = lazy(() => import('./components/PDFViewer'))
const ImageViewer = lazy(() => import('./components/ImageViewer'))
const DownloadOnlyViewer = lazy(() => import('./components/DownloadOnlyViewer'))
const CustomerDetailView = lazy(() => import('./features/customer/views/CustomerDetailView'))
const CustomerFullDetailView = lazy(() => import('./features/customer/views/CustomerFullDetailView'))
const AccountSettingsView = lazy(() => import('./features/AccountSettings/AccountSettingsView'))
const InquiryView = lazy(() => import('./components/InquiryView/InquiryView'))
const NoticeView = lazy(() => import('./components/HelpViews/NoticeView/NoticeView'))
const UsageGuideView = lazy(() => import('./components/HelpViews/UsageGuideView/UsageGuideView'))
const FAQView = lazy(() => import('./components/HelpViews/FAQView/FAQView'))
const HelpDashboardView = lazy(() => import('./components/HelpViews/HelpDashboardView/HelpDashboardView'))
const CustomerDocumentPreviewModal = lazy(() => import('./features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal'))
const ChatPanel = lazy(() => import('./components/ChatPanel'))
import { ViewerControls } from './components/ViewerControls'
import type { PreviewDocumentInfo } from './features/customer/controllers/useCustomerDocumentsController'
import DownloadHelper from './utils/downloadHelper'
import { SearchService } from './services/searchService'
import type { SearchResultItem } from './entities/search'
import type { StorageInfo } from './services/userService'
import type { AIUsageData } from './services/aiUsageService'
import { UsageQuotaWidget } from './shared/ui/UsageQuotaWidget'

// 유틸리티 함수 및 타입 import (App.tsx에서 추출됨)
import type { SelectedDocument as _SelectedDocument, SmartSearchDocumentResponse } from './utils/documentTransformers'
import { toSmartSearchDocumentResponse, buildSelectedDocument } from './utils/documentTransformers'
import { adaptToDownloadHelper, convertToPreviewDocumentInfo } from './utils/documentAdapters'
import { useRightPaneContent } from './hooks/useRightPaneContent'
import { usePersistentTheme } from './hooks/usePersistentTheme'
import { useAppUsageData } from './hooks/useAppUsageData'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { API_CONFIG, getAuthHeaders, api } from './shared/lib/api'
import type { Document as StatusDocument } from './types/documentStatus'
import { ContextMenu, useContextMenu, type ContextMenuSection } from './shared/ui/ContextMenu'
import { Modal } from './shared/ui'
import Tooltip from './shared/ui/Tooltip'

// 상태 영속화를 위한 전역 저장소 (LocalStorage + 컴포넌트 리마운트와 독립)
const STORAGE_KEYS = {
  LAYOUT_MODAL: 'aims_layout_modal_open',
  ACTIVE_VIEW: 'aims_active_document_view'
} as const

// CenterPane과 RightPane의 기본 비율 (0~1 범위)
const DEFAULT_CENTER_PANE_RATIO = 0.5
const DEFAULT_CENTER_WIDTH_PERCENT = DEFAULT_CENTER_PANE_RATIO * 100
const DEFAULT_RIGHT_WIDTH_PERCENT = 100 - DEFAULT_CENTER_WIDTH_PERCENT

// 첫 방문자 가이드 투어 스텝
const ONBOARDING_STEPS: TourStep[] = [
  {
    target: '.header-quick-search-container',
    title: '빠른 검색',
    description: '고객명을 입력하면 즉시 검색 결과가 표시됩니다. 원하는 고객을 클릭하면 바로 상세 정보로 이동합니다.',
    placement: 'bottom',
    icon: 'magnifyingglass'
  },
  {
    target: '[data-menu-key="documents-register"]',
    title: '문서 등록',
    description: '보험 문서(증권, 청약서 등)를 업로드하면 AI가 자동으로 분석하여 고객 정보를 추출합니다.',
    placement: 'right',
    icon: 'doc-badge-plus'
  },
  {
    target: '[data-menu-key="customers-register"]',
    title: '고객 등록',
    description: '새로운 고객을 직접 등록할 수 있습니다. 문서 없이도 고객 정보를 먼저 입력할 수 있습니다.',
    placement: 'right',
    icon: 'person-fill-badge-plus'
  },
  {
    target: '[data-menu-key="documents-library"]',
    title: '문서 보관함',
    description: '등록된 모든 문서를 한눈에 확인하고 관리할 수 있습니다. 고객별로 필터링도 가능합니다.',
    placement: 'right',
    icon: 'folder'
  },
  {
    target: '.header-user-profile',
    title: '계정 설정',
    description: '프로필을 클릭하면 계정 설정, 보안, 알림 등 다양한 설정을 변경할 수 있습니다.',
    placement: 'bottom',
    icon: 'gearshape'
  }
]

const persistentState = {
  layoutControlModalOpen: false,
  activeDocumentView: (() => {
    // 브라우저 환경에서만 LocalStorage 읽기
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_VIEW) || null
    }
    return null
  })() as string | null
}

interface AppProps {
  gaps?: Partial<GapConfig>;
}

function App({ gaps: initialGaps }: AppProps = {}) {
  // RightPane 상태는 useRightPaneContent 훅에서 관리 (아래에서 호출)
  const [centerWidth, setCenterWidth] = useState(DEFAULT_CENTER_WIDTH_PERCENT)
  const [paginationVisible, setPaginationVisible] = useState(true)
  const [isDraggingBRB, setIsDraggingBRB] = useState(false)

  // User Store - 사용자 정보 전역 관리
  const { userId, updateCurrentUser } = useUserStore()

  // 현재 보고 있는 문의 ID (카카오톡 스타일: 열린 채팅방은 카운트 증가 안함)
  const [currentViewingInquiryId, setCurrentViewingInquiryId] = useState<string | null>(null)

  // 문의 알림 관리 (SSE 실시간 알림)
  // 카카오톡 스타일: 현재 보고 있는 문의 ID 전달 → 열린 채팅방은 카운트 증가 안함
  const {
    unreadCount: inquiryUnreadCount,
    unreadIds: inquiryUnreadIds,
    markAsRead: markInquiryAsRead,
  } = useInquiryNotifications(true, currentViewingInquiryId)

  // 공지사항 알림 관리
  const {
    hasNewNotice: noticeHasNew,
    markAsRead: markNoticeAsRead,
  } = useNoticeNotifications()

  // iOS Dynamic Type 시스템 초기화 및 추적
  const dynamicType = useDynamicType()

  // iOS 햅틱 피드백 시스템
  const haptic = useHapticFeedback()

  // 각 레이어별 visibility 상태
  const [headerVisible, setHeaderVisible] = useState(true)
  const [leftPaneVisible, setLeftPaneVisible] = useState(true)
  const [centerPaneVisible, setCenterPaneVisible] = useState(true)
  const [mainPaneVisible, setMainPaneVisible] = useState(true)
  const [brbVisible, setBrbVisible] = useState(true)

  // AI 채팅 패널 열림 상태 (localStorage 영속화 - F5 새로고침 시 유지)
  const [isChatOpen, setIsChatOpen] = useState(() => {
    try {
      return localStorage.getItem('aims-chat-panel-open') === 'true'
    } catch {
      return false
    }
  })

  // isChatOpen 상태 변경 시 localStorage 동기화
  useEffect(() => {
    try {
      localStorage.setItem('aims-chat-panel-open', String(isChatOpen))
    } catch {
      // localStorage 실패 무시
    }
  }, [isChatOpen])

  // AI 팝업 창 열림 상태 (localStorage 기반 + 실시간 감지)
  const [isAiPopupOpen, setIsAiPopupOpen] = useState(() => {
    return localStorage.getItem('aims-ai-popup-open') === 'true'
  })

  // AI 팝업 상태 변화 감지 (다른 탭/팝업에서의 변경 사항 동기화)
  useEffect(() => {
    // storage 이벤트: 다른 탭에서 localStorage 변경 시
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'aims-ai-popup-open') {
        setIsAiPopupOpen(e.newValue === 'true')
      }
    }

    // 커스텀 이벤트: 같은 탭에서 팝업 닫힘 감지 (ChatPanel에서 dispatch)
    const handlePopupClosed = () => {
      setIsAiPopupOpen(false)
    }

    // 커스텀 이벤트: 팝업에서 브라우저 내로 이동 요청
    const handleOpenInMain = () => {
      setIsAiPopupOpen(false)
      setIsChatOpen(true)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('aiAssistantPopupClosed', handlePopupClosed)
    window.addEventListener('aiAssistantOpenInMain', handleOpenInMain)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('aiAssistantPopupClosed', handlePopupClosed)
      window.removeEventListener('aiAssistantOpenInMain', handleOpenInMain)
    }
  }, [])

  // LeftPane 축소/확장 상태 (localStorage 영속화)
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('aims-leftPaneCollapsed')
      return saved === 'true'
    } catch {
      return false
    }
  })

  // 문서 관리 View 상태 (한 번에 하나의 View만 표시) - 영속화 지원
  const [activeDocumentView, setActiveDocumentView] = useState<string | null>(
    persistentState.activeDocumentView
  )

  // 계정 설정 Store
  const { registerSetters, openRequested, clearOpenRequest } = useAccountSettingsStore()

  // CustomerFullDetailView 상태 (CenterPane에서 고객 전체 정보 표시)
  const [fullDetailCustomerId, setFullDetailCustomerId] = useState<string | null>(null)

  // 문서 프리뷰 모달 상태
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewModalDocument, setPreviewModalDocument] = useState<PreviewDocumentInfo | null>(null)

  // 사용량 요약 위젯 상태 (LeftPane 하단) - useAppUsageData 훅으로 분리
  const {
    storageInfo: usageStorageInfo,
    loading: usageLoading,
    refresh: refreshUsageData
  } = useAppUsageData()

  // 사용자 계정 SSE - 관리자가 티어 변경 시 실시간 새로고침
  // localStorage에서 직접 읽어서 SSE 연결 (PersonalFilesView와 동일한 방식)
  const sseUserId = typeof window !== 'undefined'
    ? localStorage.getItem('aims-current-user-id') || ''
    : ''

  useUserAccountSSE(sseUserId, refreshUsageData, {
    enabled: !!sseUserId,
    onTierChanged: (event) => {
      console.log('[App] 티어 변경 알림 수신:', event)
    }
  })

  // 디버그: storageInfo 상태 변화 로그
  useEffect(() => {
    console.log('[App] usageStorageInfo 변경됨:', usageStorageInfo?.tier, usageStorageInfo?.tierName)
  }, [usageStorageInfo])

  // 고객 전체보기 새로고침을 위한 ref
  const customerAllViewRefreshRef = useRef<(() => void) | null>(null)

  // 문서 라이브러리 새로고침을 위한 ref
  const documentLibraryRefreshRef = useRef<(() => Promise<void>) | null>(null)

  // URL 상태 동기화 헬퍼 함수들
  // usePush: true면 pushState (히스토리에 추가), false면 replaceState (현재 항목 교체)
  const updateURLParams = useCallback((params: { view?: string | null; customerId?: string | null; documentId?: string | null; tab?: string | null }, usePush = false) => {
    const url = new URL(window.location.href)
    const currentView = url.searchParams.get('view')
    const isViewChange = params.view !== undefined && params.view !== currentView

    if (params.view !== undefined) {
      if (params.view) {
        url.searchParams.set('view', params.view)
      } else {
        url.searchParams.delete('view')
      }
    }

    if (params.customerId !== undefined) {
      if (params.customerId) {
        url.searchParams.set('customerId', params.customerId)
      } else {
        url.searchParams.delete('customerId')
      }
    }

    if (params.documentId !== undefined) {
      if (params.documentId) {
        url.searchParams.set('documentId', params.documentId)
      } else {
        url.searchParams.delete('documentId')
      }
    }

    if (params.tab !== undefined) {
      if (params.tab) {
        url.searchParams.set('tab', params.tab)
      } else {
        url.searchParams.delete('tab')
      }
    }

    // 🍎 View 변경 시 pushState로 히스토리에 추가 (뒤로가기 지원)
    if (usePush || isViewChange) {
      window.history.pushState({}, '', url.toString())
    } else {
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // RightPane 콘텐츠 관리 훅
  const {
    rightPaneVisible,
    rightPaneContentType,
    selectedDocument,
    selectedCustomer,
    rightPaneRefreshTrigger,
    handleDocumentClick,
    handleCustomerClick,
    handleOpenFullDetail,
    handleCloseFullDetail,
    handleCustomerRefresh,
    handleCustomerDelete,
    toggleRightPane,
    setRightPaneVisible,
    setSelectedDocument,
    setSelectedCustomer,
    setRightPaneContentType,
  } = useRightPaneContent({
    updateURLParams,
    activeDocumentView,
    setActiveDocumentView,
    setFullDetailCustomerId,
    customerAllViewRefreshRef,
  })

  // DocumentRegistrationView, DocumentLibrary, DocumentSearchView 활성 시 PaginationPane 숨김
  // 초기 로딩 시 사용자 정보를 전역 상태에 로드 (앱 시작 시 1회만 실행)
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser()
        updateCurrentUser(user)
      } catch (error) {
        console.error('❌ 초기 사용자 정보 로드 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'App.loadCurrentUser' })
      }
    }

    loadCurrentUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 고객 관련 View 활성 시 PaginationPane 숨김 (디폴트 상태)
  // RightPane은 문서/고객 선택 시에만 표시되도록 handleDocumentClick/handleCustomerClick에서 관리
  useEffect(() => {
    // 🍎 customers-full-detail은 전체 정보를 CenterPane에 표시
    // 단, 관계자 클릭 시 RightPane에 고객 상세 표시를 위해 selectedCustomer 체크
    if (activeDocumentView === "customers-full-detail") {
      setPaginationVisible(false)
      // selectedCustomer가 없을 때만 RightPane 숨김 (관계자 클릭 시 RightPane 열림)
      if (!selectedCustomer) {
        setRightPaneVisible(false)
      }
    } else if (activeDocumentView === "documents" ||
        activeDocumentView === "documents-register" ||
        activeDocumentView === "documents-library" ||
        activeDocumentView === "documents-explorer" ||
        activeDocumentView === "documents-search" ||
        activeDocumentView === "documents-my-files" ||
        activeDocumentView === "dsd" ||
        activeDocumentView === "customers" ||
        activeDocumentView === "customers-register" ||
        activeDocumentView === "customers-all" ||
        activeDocumentView === "customers-regional" ||
        activeDocumentView === "customers-relationship" ||
        activeDocumentView === "contracts" ||
        activeDocumentView === "contracts-all" ||
        activeDocumentView === "contracts-import" ||
        activeDocumentView === "batch-document-upload" ||
        activeDocumentView === "quick-actions" ||
        activeDocumentView === "account-settings" ||
        activeDocumentView === "inquiry") {
      setPaginationVisible(false)
      // RightPane은 문서/고객이 선택되지 않은 경우에만 숨김
      if (!selectedDocument && !selectedCustomer) {
        setRightPaneVisible(false)
      }
    } else if (activeDocumentView?.startsWith("help")) {
      // 도움말 하위 메뉴는 RightPane 항상 숨김
      setPaginationVisible(false)
      setRightPaneVisible(false)
    } else {
      setPaginationVisible(true)
      setRightPaneVisible(true)
    }
  }, [activeDocumentView, selectedDocument, selectedCustomer])


  useEffect(() => {
    if (rightPaneVisible && centerWidth !== DEFAULT_CENTER_WIDTH_PERCENT) {
      setCenterWidth(DEFAULT_CENTER_WIDTH_PERCENT)
    }
  }, [rightPaneVisible])

  // 🍎 Progressive Disclosure: LeftPane 애니메이션 상태 추적
  const [leftPaneAnimationState, setLeftPaneAnimationState] = useState<'idle' | 'expanding' | 'collapsing'>('idle')


  // 갭 시스템 (실시간 조정 가능) - DEFAULT_GAPS 기본값 적용
  const [dynamicGaps, setDynamicGaps] = useState<Partial<GapConfig>>(initialGaps || DEFAULT_GAPS)
  const { cssVariables, gapValues } = useGaps(dynamicGaps)

  // 통합 제어 모달 상태 (영속화 지원)
  const [layoutControlModalOpen, setLayoutControlModalOpen] = useState(false)
  const [modalClickProtection, setModalClickProtection] = useState(false)
  const modalStateRef = useRef(false)

  // 컴포넌트 마운트 시 이전 상태 복원 (모달 + 활성 View + URL 기반 상태)
  useEffect(() => {
    if (persistentState.layoutControlModalOpen) {
      setLayoutControlModalOpen(true)
      modalStateRef.current = true
    }

    // URL에서 상태 복원
    const urlParams = new URLSearchParams(window.location.search)
    const urlView = urlParams.get('view')
    const urlCustomerId = urlParams.get('customerId')
    const urlDocumentId = urlParams.get('documentId')

    // 활성 View 복원 (URL 우선, 그 다음 LocalStorage, 기본값: 고객 관리)
    let viewToRestore = urlView || persistentState.activeDocumentView || 'customers'

    // 🍎 customers-full-detail은 customerId가 필수 - 없으면 기본 뷰로 폴백
    if (viewToRestore === 'customers-full-detail' && !urlCustomerId) {
      viewToRestore = 'customers'
    }

    setActiveDocumentView(viewToRestore)

    // 고객 ID가 URL에 있으면 고객 정보 로드
    if (urlCustomerId) {
      // 🍎 customers-full-detail 뷰일 때는 fullDetailCustomerId 설정
      if (urlView === 'customers-full-detail') {
        setFullDetailCustomerId(urlCustomerId)
      } else {
        // 일반 고객 선택 (RightPane에 표시)
        CustomerService.getCustomer(urlCustomerId)
          .then(customer => {
            setSelectedCustomer(customer)
            setRightPaneContentType('customer')
            setRightPaneVisible(true)
            if (import.meta.env.DEV) {
              console.log('[App] URL에서 고객 정보 복원 완료:', customer)
            }
          })
          .catch(error => {
            console.error('[App] URL에서 고객 정보 복원 실패:', error)
            errorReporter.reportApiError(error as Error, { component: 'App.restoreCustomerFromURL' })
            // URL에서 잘못된 고객 ID 제거
            updateURLParams({ customerId: null })
          })
      }
    }

    // 문서 ID가 URL에 있으면 문서 정보 로드
    if (urlDocumentId && !urlCustomerId) {
      // handleDocumentClick 로직 재사용
      // n8n webhook은 aims_api 프록시를 통해 접근 (보안: 내부망에서만 n8n 접근 가능)
      fetch(`${API_CONFIG.BASE_URL}/api/n8n/smartsearch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),  // JWT 인증 헤더 추가
        },
        body: JSON.stringify({ id: urlDocumentId })
      })
        .then(response => response.json())
        .then(json => {
          const data = Array.isArray(json) ? json as SmartSearchDocumentResponse[] : json ? [json as SmartSearchDocumentResponse] : []
          const fileData = data[0]
          if (!fileData) return

          const rawDocument = toSmartSearchDocumentResponse(fileData)
          if (!rawDocument) return

          const selected = buildSelectedDocument(urlDocumentId, rawDocument)
          setSelectedDocument(selected)
          setRightPaneContentType('document')
          setRightPaneVisible(true)
          if (import.meta.env.DEV) {
            console.log('[App] URL에서 문서 정보 복원 완료:', selected)
          }
        })
        .catch(error => {
          console.error('[App] URL에서 문서 정보 복원 실패:', error)
          errorReporter.reportApiError(error as Error, { component: 'App.restoreDocumentFromURL' })
          updateURLParams({ documentId: null })
        })
    }
  }, [])

  // 🍎 브라우저 뒤로가기/앞으로가기 처리 (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const urlView = urlParams.get('view')
      const urlCustomerId = urlParams.get('customerId')

      // 🍎 View 전환
      let viewToRestore = urlView || 'customers'
      if (viewToRestore === 'customers-full-detail' && !urlCustomerId) {
        viewToRestore = 'customers'
      }
      setActiveDocumentView(viewToRestore)

      // 🍎 customers-full-detail의 경우 customerId 복원
      if (viewToRestore === 'customers-full-detail' && urlCustomerId) {
        setFullDetailCustomerId(urlCustomerId)
      } else {
        setFullDetailCustomerId(null)
      }

      if (import.meta.env.DEV) {
        console.log('[App] popstate 이벤트 처리:', { view: viewToRestore, customerId: urlCustomerId })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // iOS Dynamic Type + 햅틱 피드백 시스템 초기화 + 버전 로깅
  useEffect(() => {
    initializeDynamicType()
    initializeHapticStyles()
    logVersionInfo()
  }, [])


  const { currentSize, scaleFactor, isAccessibilitySize } = dynamicType
  const { isHapticEnabled } = haptic

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[App] iOS 네이티브 시스템 초기화 상태', {
        dynamicType: {
          currentSize,
          scaleFactor,
          isAccessibilitySize
        },
        hapticEnabled: isHapticEnabled
      })
    }
  }, [currentSize, scaleFactor, isAccessibilitySize, isHapticEnabled])

  // 햅틱 피드백을 전역적으로 사용할 수 있도록 window 객체에 바인딩
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.aimsHaptic = haptic
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.aimsHaptic
      }
    }
  }, [haptic])

  // 상태 변경 시 전역 저장소 동기화 (모달 + 활성 View)
  useEffect(() => {
    persistentState.layoutControlModalOpen = layoutControlModalOpen
    modalStateRef.current = layoutControlModalOpen
  }, [layoutControlModalOpen])

  // 활성 View 상태 변경 시 전역 저장소 + LocalStorage + URL 동기화
  useEffect(() => {
    persistentState.activeDocumentView = activeDocumentView

    // LocalStorage에 영속 저장
    if (typeof window !== 'undefined') {
      if (activeDocumentView) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_VIEW, activeDocumentView)
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_VIEW)
      }
    }

    // URL에도 동기화
    updateURLParams({ view: activeDocumentView })
  }, [activeDocumentView, updateURLParams])

  // 테마 시스템 - usePersistentTheme 훅으로 관리
  const { theme, toggleTheme: baseToggleTheme } = usePersistentTheme()

  // 테마 토글 with 햅틱 피드백
  const toggleTheme = useCallback(() => {
    // iOS 16+ 미디움 햅틱 피드백 - 인터페이스 변경
    haptic.triggerHaptic('medium')
    baseToggleTheme()
  }, [haptic, baseToggleTheme])

  // 브라우저 리사이즈 상태 관리
  const [isResizing, setIsResizing] = useState(false)
  const [resizeTimer, setResizeTimer] = useState<NodeJS.Timeout | null>(null)

  // 브라우저 리사이즈 이벤트 핸들러
  useEffect(() => {
    const handleResize = () => {
      setIsResizing(true)

      // 기존 타이머가 있으면 클리어
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }

      // 리사이즈 완료 후 100ms 뒤에 transition 재활성화 (더 빠른 반응)
      const newTimer = setTimeout(() => {
        setIsResizing(false)
      }, 100)

      setResizeTimer(newTimer)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }
    }
  }, [resizeTimer])

  // 이벤트 핸들러들 메모이제이션 (성능 최적화, 기존 동작 보존)
  const toggleHeader = useCallback(() => setHeaderVisible(prev => !prev), [])
  const toggleLeftPane = useCallback(() => setLeftPaneVisible(prev => !prev), [])
  const toggleCenterPane = useCallback(() => setCenterPaneVisible(prev => !prev), [])
  // toggleRightPane은 useRightPaneContent 훅에서 제공
  const toggleBrb = useCallback(() => setBrbVisible(prev => !prev), [])
  const togglePagination = useCallback(() => setPaginationVisible(prev => !prev), [])
  const toggleMainPane = useCallback(() => setMainPaneVisible(prev => !prev), [])

  // 활성 View 존재 여부 확인 (CenterPane 문구 표시 제어용)
  const hasActiveView = useMemo(() => {
    return activeDocumentView !== null
  }, [activeDocumentView])

  // 메뉴 클릭 핸들러 - 모든 View 지원
  const handleMenuClick = useCallback((menuKey: string) => {
    const allViewKeys = [
      // 빠른 작업
      'quick-actions',
      // 문서 관리 View들
      'documents', 'documents-register', 'documents-library', 'documents-explorer', 'documents-search', 'documents-my-files', 'dsd',
      // 고객 관리 View들
      'customers', 'customers-register', 'customers-all', 'customers-regional', 'customers-relationship', 'customers-full-detail',
      // 계약 관리 View들
      'contracts', 'contracts-all', 'contracts-import', 'batch-document-upload',
      // 설정 View들
      'account-settings',
      // 도움말
      'help', 'help-notice', 'help-guide', 'help-faq', 'help-inquiry',
      // 1:1 문의 (하위 호환성)
      'inquiry'
    ]
    if (allViewKeys.includes(menuKey)) {
      setActiveDocumentView(menuKey)

      // 메뉴 변경 시 RightPane 닫기 (문서/고객 선택 해제)
      setSelectedDocument(null)
      setSelectedCustomer(null)
      setRightPaneContentType(null)
      setRightPaneVisible(false)

      // 🍎 URL 업데이트 (view 포함하여 pushState로 히스토리에 추가)
      updateURLParams({ view: menuKey, customerId: null, documentId: null })
    }
  }, [updateURLParams])

  // 🎹 전역 단축키 핸들러 - useGlobalShortcuts 훅으로 분리
  useGlobalShortcuts({ onMenuClick: handleMenuClick })

  // 최근 검색 고객 스토어
  const addRecentCustomer = useRecentCustomersStore((state) => state.addRecentCustomer)

  // 최근 검색 고객 클릭 핸들러 - 고객 전체보기 페이지로 이동
  const handleRecentCustomerClick = useCallback(async (customerId: string) => {
    // customers-full-detail 뷰로 이동
    setActiveDocumentView('customers-full-detail')
    setFullDetailCustomerId(customerId)

    // RightPane 닫기
    setSelectedDocument(null)
    setSelectedCustomer(null)
    setRightPaneContentType(null)
    setRightPaneVisible(false)

    // URL 업데이트
    updateURLParams({ view: 'customers-full-detail', customerId, documentId: null })

    // 최근 검색 고객 목록 순서 업데이트 (클릭한 고객을 맨 위로)
    try {
      const customer = await CustomerService.getCustomer(customerId)
      addRecentCustomer(customer)
    } catch (error) {
      console.error('[App] 최근 고객 순서 업데이트 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'App.handleSwitchToDetailView' })
    }
  }, [updateURLParams, addRecentCustomer])

  // 🍎 전체보기 → 간략보기 전환 핸들러 (customers-all + customerId 유지)
  const handleSwitchToCompactView = useCallback(async (customerId: string) => {
    // customers-all 뷰로 전환
    setActiveDocumentView('customers-all')
    setFullDetailCustomerId(null)

    // 고객 정보 로드 후 RightPane에 직접 표시
    // (handleCustomerClick은 activeDocumentView 체크로 인해 동작하지 않을 수 있음)
    try {
      const customer = await CustomerService.getCustomer(customerId)
      setSelectedCustomer(customer)
      setSelectedDocument(null)
      setRightPaneContentType('customer')
      setRightPaneVisible(true)
    } catch (error) {
      console.error('[App] 간략보기 전환 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'App.handleSwitchToCompactView' })
    }

    // URL 업데이트
    updateURLParams({ view: 'customers-all', customerId, documentId: null })
  }, [updateURLParams])

  // 계정 설정 Store에 모든 setter 등록
  useEffect(() => {
    registerSetters({
      setActiveDocumentView,
      setRightPaneVisible,
      setSelectedDocument,
      setSelectedCustomer,
      setRightPaneContentType,
      updateURLParams
    })
  }, [registerSetters, setActiveDocumentView, setRightPaneVisible, setSelectedDocument, setSelectedCustomer, setRightPaneContentType, updateURLParams])

  // 계정 설정 화면 열기 요청 처리 (새로운 상태 기반 API)
  useEffect(() => {
    if (openRequested) {
      // RightPane 숨기기
      setRightPaneVisible(false)

      // 선택 해제
      setSelectedDocument(null)
      setSelectedCustomer(null)
      setRightPaneContentType(null)

      // View 변경
      setActiveDocumentView('account-settings')

      // URL 파라미터 제거
      updateURLParams({ customerId: null, documentId: null })

      // 요청 처리 완료
      clearOpenRequest()
    }
  }, [openRequested, clearOpenRequest, updateURLParams])

  // 🍎 기본 View (빈 CenterPane 방지)
  const DEFAULT_VIEW = 'customers'

  const closeDocumentView = useCallback(() => {
    // null 대신 기본 View로 설정하여 빈 CenterPane 방지
    setActiveDocumentView(DEFAULT_VIEW)
  }, [])

  // 문서/고객 클릭 핸들러들은 useRightPaneContent 훅에서 제공:
  // handleDocumentClick, handleCustomerClick, handleOpenFullDetail,
  // handleCloseFullDetail, handleCustomerRefresh, handleCustomerDelete

  // RightPane 더블클릭 핸들러 - 모달로 전환
  const handleRightPaneDoubleClick = useCallback(() => {
    if (rightPaneContentType === 'document' && selectedDocument) {
      // RightPane 닫기
      setRightPaneVisible(false);

      // transition 완료 후 (600ms) 콘텐츠 정리 및 모달 열기
      setTimeout(() => {
        setSelectedDocument(null);
        setRightPaneContentType(null);
        updateURLParams({ documentId: null });

        // 모달 열기
        const previewDoc = convertToPreviewDocumentInfo(selectedDocument);
        setPreviewModalDocument(previewDoc);
        setPreviewModalVisible(true);
      }, 600);
    }
  }, [rightPaneContentType, selectedDocument, updateURLParams]);

  // 문서 리스트에서 더블클릭 시 프리뷰 모달 열기
  const handleDocumentPreviewModal = useCallback(async (document: StatusDocument) => {
    const docId = document._id || document.id || ''
    if (!docId) return

    try {
      const result = await api.get<{
        success: boolean
        data?: {
          raw?: unknown
          computed?: { previewFilePath?: string | null; conversionStatus?: string | null }
        }
      }>(`/api/documents/${docId}/status`)

      if (!result.success || !result.data) return

      const rawDocument = toSmartSearchDocumentResponse(result.data.raw)
      if (!rawDocument) return

      const selected = buildSelectedDocument(docId, rawDocument, result.data.computed ?? null)
      const previewDoc = convertToPreviewDocumentInfo(selected)

      setPreviewModalDocument(previewDoc)
      setPreviewModalVisible(true)
    } catch (error) {
      console.error('[handleDocumentPreviewModal] 문서 로드 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'App.handleDocumentPreviewModal' })
    }
  }, [])

  // 검색 결과에서 더블클릭 시 프리뷰 모달 열기
  const handleDocumentPreviewModalFromSearch = useCallback(async (item: SearchResultItem) => {
    const docId = SearchService.getDocumentId(item)
    if (!docId) return

    try {
      const result = await api.get<{
        success: boolean
        data?: {
          raw?: unknown
          computed?: { previewFilePath?: string | null; conversionStatus?: string | null }
        }
      }>(`/api/documents/${docId}/status`)

      if (!result.success || !result.data) return

      const rawDocument = toSmartSearchDocumentResponse(result.data.raw)
      if (!rawDocument) return

      const selected = buildSelectedDocument(docId, rawDocument, result.data.computed ?? null)
      const previewDoc = convertToPreviewDocumentInfo(selected)

      setPreviewModalDocument(previewDoc)
      setPreviewModalVisible(true)
    } catch (error) {
      console.error('[handleDocumentPreviewModalFromSearch] 문서 로드 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'App.handleDocumentPreviewModalFromSearch' })
    }
  }, [])

  // 🍎 Progressive Disclosure: LeftPane 토글 with 애니메이션 상태 관리
  const toggleLeftPaneCollapsed = useCallback(() => {
    setLeftPaneCollapsed(prev => {
      const newCollapsed = !prev

      // localStorage에 상태 저장
      try {
        localStorage.setItem('aims-leftPaneCollapsed', String(newCollapsed))
        if (import.meta.env.DEV) {
          console.log('[App] LeftPane 상태 저장:', newCollapsed)
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[App] LeftPane 상태 저장 실패:', error)
          errorReporter.reportApiError(error as Error, { component: 'App.toggleLeftPane' })
        }
      }

      // 애니메이션 상태 설정
      if (import.meta.env.DEV) {
        console.log('[App] 애니메이션 상태 변경:', newCollapsed ? 'collapsing' : 'expanding')
      }
      setLeftPaneAnimationState(newCollapsed ? 'collapsing' : 'expanding')

      // 모든 단계적 애니메이션 완료 후 idle 상태로 복귀
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[App] 애니메이션 상태 idle로 복귀')
        }
        setLeftPaneAnimationState('idle')
      }, 1000) // 전체 전동 커튼 효과 완료 시간 (600ms + 충분한 여유)

      return newCollapsed
    })
  }, [])
  const resetGaps = useCallback(() => setDynamicGaps(DEFAULT_GAPS), [])

  // Gap 슬라이더 핸들러들
  const handleGapLeftChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapLeft: Number(e.target.value) }))
  }, [])
  const handleGapCenterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapCenter: Number(e.target.value) }))
  }, [])
  const handleGapRightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapRight: Number(e.target.value) }))
  }, [])
  const handleGapTopChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapTop: Number(e.target.value) }))
  }, [])
  const handleGapBottomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapBottom: Number(e.target.value) }))
  }, [])


  // CSS 계산식들 메모이제이션 (성능 최적화, 애플 표준 크기 사용)
  const layoutDimensions = useMemo(() => {
    const leftPaneWidth = leftPaneCollapsed ? 60 : 250
    const leftPaneWidthVar = `${leftPaneWidth}px` // 🍎 transition 동기화: 실제 픽셀 값 사용
    const mainPaneWidth = `calc(100vw - ${leftPaneWidthVar})`

    const availableWidth = `calc(${mainPaneWidth} - var(--gap-left) - var(--gap-center) - var(--gap-right))`
    const centerWidthExpr = `calc(${availableWidth} * ${centerWidth} / 100)`
    const rightWidthExpr = `calc(${availableWidth} - (${centerWidthExpr}))`

    const centerPaneLeft = `calc(${leftPaneWidthVar} + var(--gap-left))`

    // 🍎 미닫이문 UX: RightPane left 위치
    // - 보일 때: CenterPane 우측 (정상 위치)
    // - 숨겨질 때: 화면 우측 밖 (100vw 이상) → 우측으로 슬라이드 아웃
    const rightPaneLeft = rightPaneVisible
      ? `calc(${centerPaneLeft} + ${centerWidthExpr} + var(--gap-center))`
      : `100vw` // 화면 우측 밖으로 완전히 이동

    return {
      leftPaneWidth,
      leftPaneWidthVar,
      mainPaneWidth,
      centerPaneWidth: rightPaneVisible ? centerWidthExpr : `calc(${mainPaneWidth} - var(--gap-left) - var(--gap-right))`,
      rightPaneWidth: rightPaneVisible ? rightWidthExpr : '0px',
      paginationWidth: rightPaneVisible ? centerWidthExpr : `calc(${mainPaneWidth} - var(--gap-left) - var(--gap-right))`,
      brbLeftPosition: rightPaneVisible
        ? `calc(${leftPaneWidthVar} + var(--gap-left) + ${centerWidthExpr})`
        : `calc(${leftPaneWidthVar} + (100vw - ${leftPaneWidthVar}) - var(--gap-right))`,
      centerPaneLeft,
      rightPaneLeft,
      mainContentHeight: 'var(--mainpane-height)',
      centerPaneHeight: paginationVisible ? 'var(--centerpane-height-with-pagination)' : 'var(--centerpane-height-no-pagination)',
      layoutContentHeight: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`
    }
  }, [leftPaneCollapsed, rightPaneVisible, centerWidth, paginationVisible])

  // 모달 열기 핸들러 (강화된 보호 로직)
  const handleModalOpen = useCallback(() => {
    // 이미 열려있거나 보호 중이면 무시
    if (layoutControlModalOpen || modalClickProtection) return

    // iOS 16+ 라이트 햅틱 피드백 - 인터페이스 호버/오픈
    haptic.triggerHaptic('light')

    setModalClickProtection(true)
    setLayoutControlModalOpen(true)
    modalStateRef.current = true
    persistentState.layoutControlModalOpen = true

    // 클릭 보호 해제 (300ms → 100ms로 단축)
    setTimeout(() => {
      setModalClickProtection(false)
    }, 100)
  }, [layoutControlModalOpen, modalClickProtection, haptic])

  // 모달 닫기 핸들러
  const handleModalClose = useCallback(() => {
    setLayoutControlModalOpen(false)
    modalStateRef.current = false
    persistentState.layoutControlModalOpen = false
  }, [])

  // 🍎 전역 컨텍스트 메뉴
  const globalContextMenu = useContextMenu()

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // 🖥️ 플랫폼 감지 (Mac vs Windows/Linux)
  const isMac = useMemo(() => {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
           navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  }, [])

  // 단축키 표시 헬퍼
  const shortcutKey = useMemo(() => ({
    mod: isMac ? '⌘' : 'Ctrl',
    shift: isMac ? '⇧' : 'Shift',
    alt: isMac ? '⌥' : 'Alt'
  }), [isMac])

  // 기본 컨텍스트 메뉴 섹션
  const defaultContextMenuSections: ContextMenuSection[] = useMemo(() => [
    {
      id: 'navigation',
      items: [
        {
          id: 'back',
          label: '뒤로 가기',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          ),
          shortcut: 'Alt+←',
          onClick: () => window.history.back()
        },
        {
          id: 'forward',
          label: '앞으로 가기',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          ),
          shortcut: 'Alt+→',
          onClick: () => window.history.forward()
        },
        {
          id: 'refresh',
          label: '새로고침',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+R`,
          onClick: () => window.location.reload()
        }
      ]
    },
    {
      id: 'quick-actions',
      items: [
        {
          id: 'new-customer',
          label: '고객 등록',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6" />
              <path d="M22 11h-6" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+${shortcutKey.shift}+C`,
          onClick: () => handleMenuClick('customers-register')
        },
        {
          id: 'customer-search',
          label: '고객 검색',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <circle cx="19" cy="11" r="3" />
              <path d="M22 14l-2-2" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+K`,
          onClick: () => {
            // 메뉴 닫힌 후 검색창에 포커스
            setTimeout(() => {
              const searchInput = document.querySelector<HTMLInputElement>('.quick-search__input')
              searchInput?.focus()
            }, 100)
          }
        },
        {
          id: 'new-document',
          label: '문서 등록',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+${shortcutKey.shift}+U`,
          onClick: () => handleMenuClick('documents-register')
        },
        {
          id: 'document-search',
          label: '문서 검색',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <circle cx="11" cy="14" r="3" />
              <path d="M14 17l2 2" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+${shortcutKey.shift}+F`,
          onClick: () => handleMenuClick('documents-search')
        },
        {
          id: 'document-library',
          label: '문서 보기',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
          ),
          shortcut: `${shortcutKey.mod}+${shortcutKey.shift}+L`,
          onClick: () => handleMenuClick('documents-library')
        }
      ]
    }
  ], [handleMenuClick, shortcutKey])

  // 전역 컨텍스트 메뉴 핸들러
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const tagName = target.tagName.toLowerCase()

    // 입력 필드는 기본 컨텍스트 메뉴 허용 (복사/붙여넣기 필요)
    const isInputField =
      tagName === 'input' ||
      tagName === 'textarea' ||
      target.isContentEditable ||
      target.closest('[contenteditable="true"]')

    // 커스텀 컨텍스트 메뉴가 있는 영역은 제외 (각 컴포넌트에서 처리)
    const hasCustomContextMenu = target.closest('[data-context-menu]')

    if (!isInputField && !hasCustomContextMenu) {
      e.preventDefault()
      e.stopPropagation()
      globalContextMenu.open(e)
    }
  }, [globalContextMenu])

  return (
    <div
      className="layout-main"
      onContextMenu={handleContextMenu}
      style={{
        // width, height, position은 layout.css에서 관리 (iPad 미디어쿼리 적용을 위해)
        ...cssVariables as React.CSSProperties // CSS 변수 적용
      }}>

      {/* 🍎 Apple A11y: Skip Navigation - VoiceOver 완벽 지원 */}
      <a
        href="#main-content"
        className="skip-navigation"
        style={{
          position: 'absolute',
          top: 'var(--skip-nav-offset)',
          left: 'var(--spacing-2)',
          background: 'var(--color-primary-500)',
          color: 'white',
          padding: 'var(--spacing-2) var(--spacing-4)',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          fontSize: 'var(--font-size-footnote)',
          fontWeight: 'var(--font-weight-semibold)',
          zIndex: 'var(--z-index-notification)',
          transform: 'translateY(var(--skip-nav-offset))',
          transition: 'transform var(--duration-ios-standard) var(--easing-ios-default)',
          outline: '2px solid transparent',
          outlineOffset: '2px'
        }}
        onFocus={(e) => {
          e.currentTarget.style.transform = 'translateY(var(--skip-nav-visible-offset))'
        }}
        onBlur={(e) => {
          e.currentTarget.style.transform = 'translateY(var(--skip-nav-offset))'
        }}
        aria-label="메인 콘텐츠로 바로 가기"
      >
        메인 콘텐츠로 바로 가기
      </a>

      {/* 🍎 Apple A11y: 접근성 상태 알림 영역 */}
      <div
        id="accessibility-announcements"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          width: 'var(--sr-only-size)',
          height: 'var(--sr-only-size)',
          padding: '0',
          margin: 'calc(var(--sr-only-size) * -1)',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0'
        }}
      />

      {/* Header - Progressive Disclosure 애플 스타일 */}
      <Header
        visible={headerVisible}
        theme={theme}
        onLayoutControlOpen={handleModalOpen}
        onThemeToggle={toggleTheme}
        onMenuClick={handleMenuClick}
        onQuickSearchCustomerClick={(customerId, customer) => {
          // 빠른검색에서 고객 선택 시 customers-full-detail로 이동
          setActiveDocumentView('customers-full-detail')
          setFullDetailCustomerId(customerId)

          // RightPane 닫기
          setSelectedDocument(null)
          setSelectedCustomer(null)
          setRightPaneContentType(null)
          setRightPaneVisible(false)

          // URL 업데이트
          updateURLParams({ view: 'customers-full-detail', customerId, documentId: null })

          // 최근 검색 고객 목록에 추가
          addRecentCustomer(customer)
        }}
        onChatToggle={() => {
          // 팝업이 열려있으면 메인 창에서 AI 어시스턴트 열기 차단
          if (localStorage.getItem('aims-ai-popup-open') === 'true') {
            // 기존 팝업에 포커스 시도
            const existingPopup = window.open('', 'AIMS_AI_Assistant');
            if (existingPopup && !existingPopup.closed) {
              existingPopup.focus();
            }
            return;
          }
          setIsChatOpen(prev => !prev);
        }}
        isChatOpen={isChatOpen && !isAiPopupOpen}
        isAiPopupOpen={isAiPopupOpen}
      />

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <nav
          className={`layout-pane layout-leftpane ${leftPaneAnimationState === 'expanding' ? 'layout-leftpane--expanding' : ''} ${leftPaneAnimationState === 'collapsing' ? 'layout-leftpane--collapsing' : ''}`}
          role="navigation"
          aria-label="메인 네비게이션 메뉴"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            width: layoutDimensions.leftPaneWidthVar,
            height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
            paddingTop: leftPaneCollapsed ? 'var(--spacing-3)' : 'var(--spacing-6)',
            paddingRight: leftPaneCollapsed ? 'var(--spacing-3)' : 'var(--spacing-6)',
            paddingBottom: 'var(--spacing-2)', /* 하단 여백 최소화 */
            paddingLeft: leftPaneCollapsed ? 'var(--spacing-3)' : 'var(--spacing-6)',
            transition: isResizing ? 'none' : 'width var(--duration-apple-graceful) var(--easing-apple-smooth), padding var(--duration-apple-graceful) var(--easing-apple-smooth)'
          }}
        >
          {/* CustomMenu - 메뉴 + 최근 검색 고객 + 하단 영역 통합 */}
          <Suspense fallback={<div style={{ width: '100%', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
            <CustomMenu
              collapsed={leftPaneCollapsed}
              onMenuClick={handleMenuClick}
              onCustomerClick={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
              selectedKey={activeDocumentView || 'dsd'}
              inquiryUnreadCount={inquiryUnreadCount}
              noticeHasNew={noticeHasNew}
              footer={
                <div className={`leftpane-footer ${leftPaneCollapsed ? 'leftpane-footer--collapsed' : ''}`}>
                  {/* 좌측: 사용량 파이 차트 (축소 시 숨김) */}
                  {!leftPaneCollapsed && (
                    <div className="leftpane-footer__left">
                      <UsageQuotaWidget
                        storageInfo={usageStorageInfo}
                        loading={usageLoading}
                        collapsed={leftPaneCollapsed}
                        onClick={() => {
                          setRightPaneVisible(false)
                          setSelectedDocument(null)
                          setSelectedCustomer(null)
                          setRightPaneContentType(null)
                          sessionStorage.setItem('accountSettings_activeTab', 'data')
                          setActiveDocumentView('account-settings')
                          updateURLParams({ customerId: null, documentId: null })
                        }}
                      />
                    </div>
                  )}

                  {/* 가운데: 버전 (축소 시 숨김) */}
                  {!leftPaneCollapsed && (
                    <Tooltip content={`${FULL_VERSION} - 클릭하여 복사`} placement="top">
                      <div
                        className="leftpane-footer__version"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(FULL_VERSION)
                            if (window.aimsHaptic) {
                              window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.SUCCESS)
                            }
                          } catch (err) {
                            console.error('버전 복사 실패:', err)
                            errorReporter.reportApiError(err as Error, { component: 'App.copyVersion' })
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        v{APP_VERSION}
                      </div>
                    </Tooltip>
                  )}

                  {/* 햄버거 버튼 (항상 표시) */}
                  <div className={`leftpane-footer__right ${leftPaneCollapsed ? 'leftpane-footer__right--centered' : ''}`}>
                    <Suspense fallback={<div className="leftpane-footer__hamburger-skeleton" />}>
                      <HamburgerButton
                        collapsed={leftPaneCollapsed}
                        onClick={toggleLeftPaneCollapsed}
                      />
                    </Suspense>
                  </div>
                </div>
              }
            />
          </Suspense>
        </nav>
      )}

      {/* MainPane - 독립 레이어 (배경) */}
      {mainPaneVisible && (
        <div
          className={`layout-pane layout-mainpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            left: layoutDimensions.leftPaneWidthVar,
            width: layoutDimensions.mainPaneWidth,
            height: layoutDimensions.mainContentHeight,
            padding: 'var(--gap-right)'
          }}
        >
        </div>
      )}

      {/* CenterPane - Header-CBR 연동 레이어 */}
      {centerPaneVisible && (
        <main
          id="main-content"
          className={`layout-pane layout-centerpane ${isDraggingBRB || isResizing ? 'no-transition' : ''}`}
          role="main"
          aria-label="메인 콘텐츠 영역"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            left: layoutDimensions.centerPaneLeft,
            width: layoutDimensions.centerPaneWidth,
            height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
            color: 'var(--color-text-primary)'
          }}
        >
          {/* CenterPane 문구 - 활성 View가 없을 때만 표시 (애플 스타일: Invisible until you need it) */}
          {!hasActiveView && (
            <h3
              className="section-heading"
              style={{
                color: 'var(--color-text-primary)',
                margin: '0',
                opacity: hasActiveView ? 0 : 1,
                transition: 'opacity var(--duration-fast) var(--easing-ease-out)',
                animation: hasActiveView ? 'none' : 'centerPanePlaceholderFadeIn var(--duration-fast) var(--easing-ease-out)'
              }}
            >
              CenterPane
            </h3>
          )}

          {/* 문서 관리 View 오버레이들 */}
          <Suspense fallback={null}>
            <DocumentManagementView
              visible={activeDocumentView === 'documents'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentRegistrationView
              visible={activeDocumentView === 'documents-register'}
              onClose={closeDocumentView}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentLibraryView
              visible={activeDocumentView === 'documents-library'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
              onDocumentDoubleClick={handleDocumentPreviewModal}
              onDocumentDeleted={() => setRightPaneVisible(false)}
              onCustomerClick={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
              onRefreshExpose={(refreshFn) => {
                documentLibraryRefreshRef.current = refreshFn
              }}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentExplorerView
              visible={activeDocumentView === 'documents-explorer'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
              onDocumentDoubleClick={handleDocumentPreviewModal}
              onCustomerClick={handleCustomerClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentSearchView
              visible={activeDocumentView === 'documents-search'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
              onDocumentDoubleClick={handleDocumentPreviewModalFromSearch}
              onCustomerClick={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
            />
          </Suspense>

          <Suspense fallback={null}>
            <PersonalFilesView
              visible={activeDocumentView === 'documents-my-files'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
            />
          </Suspense>

          {/* 고객 관리 View 오버레이들 */}
          <Suspense fallback={null}>
            <CustomerManagementView
              visible={activeDocumentView === 'customers'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
              onCustomerClick={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRegistrationView
              visible={activeDocumentView === 'customers-register'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerAllView
              visible={activeDocumentView === 'customers-all'}
              onClose={closeDocumentView}
              onCustomerClick={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
              onRefreshExpose={(refreshFn) => {
                customerAllViewRefreshRef.current = refreshFn
              }}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRegionalView
              visible={activeDocumentView === 'customers-regional'}
              onClose={closeDocumentView}
              onCustomerClick={handleCustomerClick}
              selectedCustomer={selectedCustomer}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRelationshipView
              visible={activeDocumentView === 'customers-relationship'}
              onClose={closeDocumentView}
              onCustomerSelect={handleCustomerClick}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerFullDetailView
              visible={activeDocumentView === 'customers-full-detail'}
              customerId={fullDetailCustomerId}
              onClose={handleCloseFullDetail}
              onCustomerDeleted={() => {
                handleCloseFullDetail()
                if (customerAllViewRefreshRef.current) {
                  customerAllViewRefreshRef.current()
                }
              }}
              onSelectCustomer={handleCustomerClick}
              onNavigateToFullDetail={(customerId) => handleOpenFullDetail(customerId)}
              onNavigate={handleMenuClick}
              onSwitchToCompactView={handleSwitchToCompactView}
            />
          </Suspense>

          <Suspense fallback={null}>
            <AccountSettingsView
              visible={activeDocumentView === 'account-settings'}
              onClose={closeDocumentView}
            />
          </Suspense>

          {/* 계약 관리 View 오버레이들 */}
          <Suspense fallback={null}>
            <ContractManagementView
              visible={activeDocumentView === 'contracts'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
              onCustomerClick={(customerId) => handleCustomerClick(customerId, undefined, 'contracts')}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
            />
          </Suspense>

          <Suspense fallback={null}>
            <ContractAllView
              visible={activeDocumentView === 'contracts-all'}
              onClose={closeDocumentView}
              onCustomerClick={(customerId) => handleCustomerClick(customerId, undefined, 'contracts')}
              onCustomerDoubleClick={(customerId) => handleOpenFullDetail(customerId)}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <ContractImportView
              visible={activeDocumentView === 'contracts-import'}
              onClose={closeDocumentView}
            />
          </Suspense>

          <Suspense fallback={null}>
            <BatchDocumentUploadView
              visible={activeDocumentView === 'batch-document-upload'}
              onClose={closeDocumentView}
              onViewDocuments={() => setActiveDocumentView('documents-library')}
            />
          </Suspense>

          {/* 빠른 작업 View */}
          <Suspense fallback={null}>
            <QuickActionsView
              visible={activeDocumentView === 'quick-actions'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          {/* 1:1 문의 View */}
          <Suspense fallback={null}>
            <InquiryView
              visible={activeDocumentView === 'inquiry' || activeDocumentView === 'help-inquiry'}
              onClose={closeDocumentView}
              unreadIds={inquiryUnreadIds}
              onMarkAsRead={markInquiryAsRead}
              onViewingInquiryChange={setCurrentViewingInquiryId}
            />
          </Suspense>

          {/* 도움말 대시보드 View */}
          <Suspense fallback={null}>
            <HelpDashboardView
              visible={activeDocumentView === 'help'}
              onClose={closeDocumentView}
              onNavigate={handleMenuClick}
              noticeHasNew={noticeHasNew}
              inquiryUnreadCount={inquiryUnreadCount}
            />
          </Suspense>

          {/* 공지사항 View */}
          <Suspense fallback={null}>
            <NoticeView
              visible={activeDocumentView === 'help-notice'}
              onClose={closeDocumentView}
              onMarkAsRead={markNoticeAsRead}
            />
          </Suspense>

          {/* 사용 가이드 View */}
          <Suspense fallback={null}>
            <UsageGuideView
              visible={activeDocumentView === 'help-guide'}
              onClose={closeDocumentView}
            />
          </Suspense>

          {/* FAQ View */}
          <Suspense fallback={null}>
            <FAQView
              visible={activeDocumentView === 'help-faq'}
              onClose={closeDocumentView}
            />
          </Suspense>
        </main>
      )}

      {/* Pagination - Header-CBR 연동 레이어 (조건부) */}
      {paginationVisible && (
        <div
          className="layout-pane layout-pagination"
          style={{
            bottom: `var(--gap-bottom)`,
            left: `calc(${layoutDimensions.leftPaneWidthVar} + var(--gap-left))`,
            width: layoutDimensions.paginationWidth,
          }}
        >
          PaginationPane
        </div>
      )}

      {/* RightPane + BRB 통합 컨테이너 - 미닫이문 UX */}
      <aside
        className={`layout-rightpane-container ${!rightPaneVisible ? 'layout-rightpane-container--hidden' : ''} ${isDraggingBRB || isResizing ? 'no-transition' : ''}`}
        role="complementary"
        aria-label="보조 정보 패널"
        style={{
          position: 'absolute',
          top: `calc(var(--header-height-base) + var(--gap-top))`,
          left: layoutDimensions.rightPaneLeft,
          width: rightPaneVisible ? layoutDimensions.rightPaneWidth : '0px',
          height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {/* BRB - RightPane 컨테이너 내부에서 좌측에 위치 */}
        {brbVisible && (
          <div
            className="layout-brb"
            style={{
              width: 'var(--brb-width)',
              height: '100%',
              flexShrink: 0,
              cursor: rightPaneVisible ? 'col-resize' : 'default',
              // CSS 클래스에서 처리되는 속성들을 인라인에서 제거
              // backgroundColor, zIndex, position, display, alignItems, justifyContent는 CSS에서 처리
              // transition 제거 - 컨테이너의 transition 사용
            }}
            onMouseDown={(e) => {
              e.preventDefault()

              // iOS 16+ 셀렉션 햅틱 피드백 - 드래그 시작
              haptic.triggerHaptic(HAPTIC_TYPES.SELECTION)

              // 🎯 드래그 시작: transition 비활성화
              setIsDraggingBRB(true)

              const startX = e.clientX
              const startWidth = centerWidth

              const handleMouseMove = (e: MouseEvent) => {
                e.preventDefault()

                // 완벽한 픽셀 계산으로 동기화 보장
                const deltaX = e.clientX - startX
                const mainPaneWidth = window.innerWidth - layoutDimensions.leftPaneWidth
                const availableWidth = mainPaneWidth - gapValues.gapLeft - gapValues.gapCenter - gapValues.gapRight

                // 픽셀 단위로 정확한 계산
                const newCenterWidthPx = Math.max(
                  availableWidth * 0.2,
                  Math.min(
                    availableWidth * 0.8,
                    (availableWidth * startWidth / 100) + deltaX
                  )
                )

                // 퍼센트로 변환하여 React state 업데이트
                const newCenterPercent = (newCenterWidthPx / availableWidth) * 100
                setCenterWidth(newCenterPercent)
              }

              const handleMouseUp = () => {
                // iOS 16+ 라이트 햅틱 피드백 - 드래그 완료
                haptic.triggerHaptic(HAPTIC_TYPES.LIGHT)

                // 🎯 드래그 종료: transition 복원
                setIsDraggingBRB(false)

                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
                document.body.style.cursor = 'default'
              }

              document.body.style.cursor = 'col-resize'
              document.addEventListener('mousemove', handleMouseMove)
              document.addEventListener('mouseup', handleMouseUp)
            }}
            aria-label="패널 크기 조절"
            role="separator"
            aria-orientation="vertical"
          >
            {/* Layout Reset Button - BRB 내부 */}
            {centerWidth !== DEFAULT_CENTER_WIDTH_PERCENT && (
              <button
                className="layout-brb-reset"
                onClick={(e) => {
                  e.stopPropagation()
                  setCenterWidth(DEFAULT_CENTER_WIDTH_PERCENT)
                  haptic.triggerHaptic(HAPTIC_TYPES.LIGHT)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="레이아웃 비율 초기화"
                title={`기본 비율로 초기화 (${DEFAULT_CENTER_WIDTH_PERCENT.toFixed(0)}:${DEFAULT_RIGHT_WIDTH_PERCENT.toFixed(0)})`}
              >
                <span aria-hidden="true">⟲</span>
              </button>
            )}
          </div>
        )}

        {/* RightPane - 컨테이너 내부에서 우측에 위치 */}
        <div
          className="layout-rightpane-content"
          onDoubleClick={handleRightPaneDoubleClick}
          style={{
            flex: 1,
            padding: (selectedDocument || selectedCustomer) ? '0' : (rightPaneVisible ? 'var(--spacing-6) var(--spacing-5)' : '0'),
            overflow: 'hidden',
            color: 'var(--color-text-primary)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {!rightPaneContentType && (
            <>
              <h3 className="section-heading" style={{
                color: 'var(--color-text-primary)',
                margin: '0'
              }}>RightPane</h3>
            </>
          )}

          {/* 고객 상세 정보 표시 */}
          {rightPaneContentType === 'customer' && selectedCustomer && (
            <Suspense fallback={<div style={{ padding: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>로딩 중...</div>}>
              <CustomerDetailView
                customer={selectedCustomer}
                onClose={() => {
                  // 🍎 미닫이문 UX: 애니메이션 먼저 시작
                  setRightPaneVisible(false)

                  // transition 완료 후 (600ms) 콘텐츠 정리
                  setTimeout(() => {
                    setSelectedCustomer(null)
                    setRightPaneContentType(null)
                    updateURLParams({ customerId: null })
                  }, 600) // var(--duration-apple-graceful) = 600ms
                }}
                onRefresh={handleCustomerRefresh}
                onDelete={handleCustomerDelete}
                onSelectCustomer={handleCustomerClick}
                onOpenFullDetail={handleOpenFullDetail}
                refreshTrigger={rightPaneRefreshTrigger}
                {...(documentLibraryRefreshRef.current ? { onDocumentLibraryRefresh: documentLibraryRefreshRef.current } : {})}
                gapLeft={gapValues.gapLeft}
                gapRight={gapValues.gapRight}
                gapTop={gapValues.gapTop}
                gapBottom={gapValues.gapBottom}
              />
            </Suspense>
          )}

          {/* 문서 프리뷰 표시 */}
          {rightPaneContentType === 'document' && selectedDocument && (
            <Suspense fallback={<div style={{ padding: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>로딩 중...</div>}>
              <BaseViewer
                visible={true}
                title={(() => {
                  const fileName = selectedDocument.upload?.originalName ||
                                   selectedDocument.payload?.originalName ||
                                   selectedDocument.meta?.originalName ||
                                   '파일'

                  // OCR 신뢰도 계산
                  const ocrData = selectedDocument.ocr as { confidence?: unknown } | undefined
                  const ocrConfidence = ocrData?.confidence
                  let ocrInfo: { percent: string; label: string } | null = null
                  if (ocrConfidence !== undefined && ocrConfidence !== null) {
                    const rawNum = typeof ocrConfidence === 'string' ? parseFloat(ocrConfidence) : Number(ocrConfidence)
                    const confidenceNum = typeof rawNum === 'number' ? rawNum : NaN
                    if (!isNaN(confidenceNum)) {
                      let label = '매우 낮음'
                      if (confidenceNum >= 0.95) label = '매우 높음'
                      else if (confidenceNum >= 0.85) label = '높음'
                      else if (confidenceNum >= 0.70) label = '보통'
                      else if (confidenceNum >= 0.50) label = '낮음'
                      ocrInfo = { percent: (confidenceNum * 100).toFixed(1), label }
                    }
                  }

                  // PDF 변환 여부 및 원본 확장자
                  const isConverted = selectedDocument.isConverted
                  const originalExt = selectedDocument.originalExtension?.toUpperCase()

                  // 서브타이틀: PDF 변환 정보 또는 OCR 정보가 있을 때만 표시
                  if (!isConverted && !ocrInfo) {
                    return fileName
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div>{fileName}</div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '400',
                        color: 'var(--color-text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap'
                      }}>
                        {isConverted && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 5px',
                            backgroundColor: 'var(--color-accent-blue-subtle)',
                            color: 'var(--color-accent-blue)',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '500'
                          }}>
                            PDF 변환됨{originalExt ? ` · 원본 ${originalExt}` : ''}
                          </span>
                        )}
                        {ocrInfo && (
                          <span style={{ opacity: 0.7 }}>
                            OCR {ocrInfo.percent}% · {ocrInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })()}
                onClose={() => {
                  // 🍎 미닫이문 UX: 애니메이션 먼저 시작
                  setRightPaneVisible(false)

                  // transition 완료 후 (600ms) 콘텐츠 정리
                  setTimeout(() => {
                    setSelectedDocument(null)
                    setRightPaneContentType(null)
                    updateURLParams({ documentId: null })
                  }, 600) // var(--duration-apple-graceful) = 600ms
                }}
              >
                {(() => {
                  // 🔴 바이러스 감염 여부 확인
                  const virusScan = (selectedDocument as any).virusScan
                  const isVirusInfected = virusScan?.status === 'infected' || virusScan?.status === 'deleted'

                  // 다운로드 함수 정의 (바이러스 감염 시 undefined)
                  const download = isVirusInfected ? undefined : () => {
                    DownloadHelper.downloadDocument(adaptToDownloadHelper({ ...selectedDocument, fileUrl: selectedDocument.fileUrl ?? '' } as typeof selectedDocument & { fileUrl: string }))
                  }

                  // 파일명 추출
                  const fileName =
                    selectedDocument.upload?.originalName ||
                    selectedDocument.payload?.originalName ||
                    '파일'

                  // 프리뷰용 URL: 변환된 PDF가 있으면 사용, 없으면 원본 사용
                  const previewUrl = selectedDocument.previewFileUrl ?? selectedDocument.fileUrl

                  // 🔴 바이러스 오버레이 컴포넌트
                  const virusOverlay = isVirusInfected ? (
                    <div className="viewer-virus-overlay">
                      <div className="viewer-virus-overlay__icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" fill="#ff3b30"/>
                          <path d="M12 7v6M12 16v1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="viewer-virus-overlay__title">바이러스 감염 파일</div>
                      <div className="viewer-virus-overlay__description">
                        <div>이 파일에서 바이러스가 감지되어</div>
                        <div>다운로드할 수 없습니다.</div>
                      </div>
                      <div className="viewer-virus-overlay__threat">
                        {virusScan?.threatName || '알 수 없는 위협'}
                      </div>
                      <div className="viewer-virus-overlay__filename">{fileName}</div>
                    </div>
                  ) : null

                  // 뷰어 렌더링 함수
                  const renderViewer = () => {
                    if (!previewUrl) {
                      return (
                        <DownloadOnlyViewer
                          fileName={fileName}
                          onDownload={download}
                          downloadDisabled={isVirusInfected}
                          downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
                        />
                      )
                    }

                    const normalizedUrl = previewUrl.toLowerCase()
                    const isPdf = normalizedUrl.endsWith('.pdf')
                    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(normalizedUrl)

                    if (isPdf) {
                      return (
                        <PDFViewer
                          file={previewUrl}
                          onDownload={download}
                          downloadDisabled={isVirusInfected}
                          downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
                        />
                      )
                    }

                    if (isImage) {
                      return (
                        <ImageViewer
                          file={previewUrl}
                          onDownload={download}
                          downloadDisabled={isVirusInfected}
                          downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
                        />
                      )
                    }

                    return (
                      <DownloadOnlyViewer
                        fileName={fileName}
                        onDownload={download}
                        downloadDisabled={isVirusInfected}
                        downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
                      />
                    )
                  }

                  // 바이러스 감염 시 오버레이와 함께 렌더링
                  if (isVirusInfected) {
                    return (
                      <div className="viewer-virus-overlay-container">
                        {renderViewer()}
                        {virusOverlay}
                      </div>
                    )
                  }

                  return renderViewer()
                })()}
              </BaseViewer>
            </Suspense>
          )}
        </div>
      </aside>

      {/* 접근성: 레이아웃 상태 알림 영역 */}
      <div
        id="layout-status-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* 통합 제어 모달 - Lazy Loading */}
      <Suspense fallback={null}>
        <LayoutControlModal
          isOpen={layoutControlModalOpen}
          onClose={handleModalClose}
          headerVisible={headerVisible}
          leftPaneVisible={leftPaneVisible}
          centerPaneVisible={centerPaneVisible}
          rightPaneVisible={rightPaneVisible}
          brbVisible={brbVisible}
          paginationVisible={paginationVisible}
          mainPaneVisible={mainPaneVisible}
          toggleHeader={toggleHeader}
          toggleLeftPane={toggleLeftPane}
          toggleCenterPane={toggleCenterPane}
          toggleRightPane={toggleRightPane}
          toggleBrb={toggleBrb}
          togglePagination={togglePagination}
          toggleMainPane={toggleMainPane}
          resetGaps={resetGaps}
          gapValues={gapValues}
          handleGapLeftChange={handleGapLeftChange}
          handleGapCenterChange={handleGapCenterChange}
          handleGapRightChange={handleGapRightChange}
          handleGapTopChange={handleGapTopChange}
          handleGapBottomChange={handleGapBottomChange}
        />
      </Suspense>

      {/* 문서 프리뷰 모달 */}
      <Suspense fallback={null}>
        <CustomerDocumentPreviewModal
          visible={previewModalVisible}
          isLoading={false}
          error={null}
          document={previewModalDocument}
          onClose={() => {
            setPreviewModalVisible(false);
            setPreviewModalDocument(null);
          }}
          {...(() => {
            // 🔴 바이러스 감염 파일은 다운로드 비활성화
            const virusScan = previewModalDocument?.virusScan
            const isVirusInfected = virusScan?.status === 'infected' || virusScan?.status === 'deleted'

            if (isVirusInfected) {
              return {} // 다운로드 버튼 없음
            }

            return previewModalDocument?.fileUrl ? {
              onDownload: () => {
                // 🔒 보안: noopener,noreferrer로 tab-nabbing 공격 방지
                window.open(previewModalDocument.fileUrl!, '_blank', 'noopener,noreferrer');
              }
            } : {}
          })()}
        />
      </Suspense>

      {/* 개발자 도구 패널 (DEV 모드에서만 표시) */}
      <DevToolsPanel />

      {/* 첫 방문자 가이드 투어 */}
      <OnboardingTour
        steps={ONBOARDING_STEPS}
        onComplete={() => {
          // 투어 완료 후 문서 등록 화면으로 이동
          handleMenuClick('documents-register')
        }}
      />

      {/* 우클릭 가이드 - OnboardingTour 완료 후 표시 */}
      <RightClickGuide />

      {/* 🍎 전역 컨텍스트 메뉴 */}
      <ContextMenu
        visible={globalContextMenu.isOpen}
        position={globalContextMenu.position}
        sections={defaultContextMenuSections}
        onClose={globalContextMenu.close}
        showHelp
        helpContext="general"
        onHelpClick={() => setHelpModalVisible(true)}
      />

      {/* 🍎 도움말 모달 - activeDocumentView에 따라 맥락별 도움말 표시 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title={
          activeDocumentView === 'customers-regional' ? '📍 지역별 고객 보기 사용법' :
          activeDocumentView === 'customers-relationship' ? '💕 관계별 고객 보기 사용법' :
          activeDocumentView === 'customers-all' ? '👤 고객 전체보기 사용법' :
          activeDocumentView === 'contracts-all' ? '📋 전체 계약 보기 사용법' :
          activeDocumentView === 'contracts-import' ? '📥 고객·계약 일괄등록 사용법' :
          activeDocumentView === 'documents-library' ? '📄 문서 보관함 사용법' :
          activeDocumentView === 'documents-search' ? '🔍 상세 문서검색 사용법' :
          activeDocumentView === 'documents-register' ? '📄 고객·계약·문서 등록 사용법' :
          activeDocumentView === 'batch-document-upload' ? '📦 문서 일괄등록 사용법' :
          activeDocumentView === 'documents-my-files' ? '📁 내 보관함 사용법' :
          '🚀 시작하기'
        }
        size="md"
      >
        <div className="help-modal-content">
          {/* 지역별 고객 보기 */}
          {activeDocumentView === 'customers-regional' && (
            <>
              <div className="help-modal-section">
                <p><strong>🗺️ 지역으로 고객 찾기</strong></p>
                <ul>
                  <li>왼쪽 트리에서 <strong>"서울"</strong> 클릭 → 서울에 사는 고객만 표시</li>
                  <li><strong>시/도 → 시/군/구</strong> 순으로 펼쳐서 세부 지역 선택</li>
                  <li>지역명 옆 숫자는 해당 지역의 <strong>고객 수</strong></li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📋 고객 목록 활용</strong></p>
                <ul>
                  <li>지역 선택 후 오른쪽에 <strong>고객 목록</strong> 표시</li>
                  <li>고객 이름 클릭 → <strong>상세 정보</strong> 패널 열기</li>
                  <li>전화/문자 아이콘으로 <strong>바로 연락</strong> 가능</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li>주소 미등록 고객은 <strong>"기타"</strong> 항목에 표시</li>
                  <li>지역별 고객 분포 파악 → <strong>방문 계획</strong> 수립</li>
                </ul>
              </div>
            </>
          )}

          {/* 관계별 고객 보기 */}
          {activeDocumentView === 'customers-relationship' && (
            <>
              <div className="help-modal-section">
                <p><strong>👨‍👩‍👧‍👦 가족 관계 보기</strong></p>
                <ul>
                  <li><strong>가족 폴더</strong> 클릭 → 가족 그룹 목록 표시</li>
                  <li><strong>👑 표시</strong>는 가족 대표 (계약 관리 담당자)</li>
                  <li>🔗 아이콘 클릭 → <strong>가족 간 관계</strong> (배우자, 자녀 등) 표시</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>🏢 법인 관계 보기</strong></p>
                <ul>
                  <li><strong>법인 폴더</strong> 클릭 → 법인 고객 목록 표시</li>
                  <li>직원 이름 옆 괄호 안에 <strong>직책</strong> 표시 (대표, 임원, 직원)</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li>미설정 고객 클릭 → <strong>빠른 등록 패널</strong>에서 바로 관계 설정</li>
                  <li>가족 단위 보험 설계 시 → <strong>가족 그룹</strong>에서 한 번에 확인</li>
                </ul>
              </div>
            </>
          )}

          {/* 고객 전체보기 */}
          {activeDocumentView === 'customers-all' && (
            <>
              <div className="help-modal-section">
                <p><strong>🔍 고객 검색하기</strong></p>
                <ul>
                  <li>검색창에 <strong>"홍길동"</strong> → 이름에 "홍길동" 포함된 고객</li>
                  <li><strong>"ㅎㄱㄷ"</strong> → 한글 초성으로도 검색 가능!</li>
                  <li><strong>"010-1234"</strong> → 전화번호로 검색</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📋 고객 정보 확인</strong></p>
                <ul>
                  <li>고객 행 <strong>클릭</strong> → 오른쪽에 기본 정보 표시</li>
                  <li>고객 행 <strong>더블클릭</strong> → 전체 화면에서 문서, 계약 모두 확인</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li>고객 행 <strong>우클릭</strong> → 전화하기, 문자 보내기 바로 가능</li>
                  <li><strong>"휴면"</strong> 필터로 휴면 고객만 따로 확인</li>
                </ul>
              </div>
            </>
          )}

          {/* 전체 계약 보기 */}
          {activeDocumentView === 'contracts-all' && (
            <>
              <div className="help-modal-section">
                <p><strong>🔍 계약 검색하기</strong></p>
                <ul>
                  <li>검색창에 <strong>"홍길동"</strong> 입력 → 홍길동 고객의 계약만 표시</li>
                  <li><strong>"종신보험"</strong> 입력 → 상품명으로 검색</li>
                  <li><strong>"1234567890"</strong> 입력 → 증권번호로 검색</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📊 정렬하기</strong></p>
                <ul>
                  <li>칼럼 헤더 클릭 → <strong>오름차순/내림차순</strong> 정렬 변경</li>
                  <li><strong>"계약일"</strong> 클릭 → 최신순/오래된순 정렬</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li><strong>고객명 클릭</strong> → 오른쪽에 고객 상세 정보 표시</li>
                  <li>새 계약 등록은 <strong>"고객·계약 일괄등록"</strong> 메뉴에서</li>
                </ul>
              </div>
            </>
          )}

          {/* 고객·계약 일괄등록 */}
          {activeDocumentView === 'contracts-import' && (
            <>
              <div className="help-modal-section">
                <p><strong>📥 엑셀 파일 업로드</strong></p>
                <ul>
                  <li>엑셀 파일을 <strong>드래그</strong>하거나 "파일 선택" 클릭</li>
                  <li>엑셀 양식 다운로드 → 형식에 맞게 데이터 입력</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📋 필수 칼럼</strong></p>
                <ul>
                  <li><strong>고객명</strong>: 계약자 이름 (필수)</li>
                  <li><strong>상품명</strong>: 보험 상품명</li>
                  <li><strong>증권번호</strong>: 10자리 숫자</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li>기존 고객에 계약 추가 시 <strong>고객명 정확히</strong> 입력</li>
                  <li>신규 고객은 자동으로 생성됩니다</li>
                </ul>
              </div>
            </>
          )}

          {/* 문서 보관함 */}
          {activeDocumentView === 'documents-library' && (
            <>
              <div className="help-modal-section">
                <p><strong>🔍 문서 찾기</strong></p>
                <ul>
                  <li><strong>"홍길동"</strong> 검색 → 해당 고객의 문서만 표시</li>
                  <li><strong>"계약서"</strong> 검색 → 파일명에 포함된 문서만</li>
                  <li>필터로 <strong>처리 상태별</strong> 문서 분류</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>👁️ 문서 미리보기</strong></p>
                <ul>
                  <li>문서 <strong>클릭</strong> → 오른쪽에 미리보기 표시</li>
                  <li>문서 <strong>우클릭</strong> → AI 요약, 다운로드 메뉴</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📎 고객 연결 방식</strong></p>
                <ul>
                  <li>문서 등록 시 <strong>고객 선택 → 자동 연결</strong></li>
                  <li>문서-고객 연결은 <strong>등록 시점에 자동 처리</strong>됩니다</li>
                </ul>
              </div>
            </>
          )}

          {/* 상세 문서검색 */}
          {activeDocumentView === 'documents-search' && (
            <>
              <div className="help-modal-section">
                <p><strong>🔍 검색 조건 설정</strong></p>
                <ul>
                  <li><strong>고객 선택</strong>: 특정 고객의 문서만 검색</li>
                  <li><strong>키워드</strong>: 파일명, AI 요약에서 검색</li>
                  <li><strong>기간 설정</strong>: 등록일 범위 지정</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📋 검색 결과</strong></p>
                <ul>
                  <li>문서 클릭 → 오른쪽에 <strong>상세 정보</strong></li>
                  <li>AI가 분석한 <strong>요약</strong>도 검색 대상</li>
                </ul>
              </div>
            </>
          )}

          {/* 새 문서 등록 */}
          {activeDocumentView === 'documents-register' && (
            <>
              <div className="help-modal-section">
                <p><strong>📋 등록 방법</strong></p>
                <ul>
                  <li><strong>1단계</strong>: 고객을 먼저 선택</li>
                  <li><strong>2단계</strong>: 파일을 드래그하거나 클릭해서 업로드</li>
                  <li>문서는 선택한 고객에게 <strong>자동 연결</strong>됩니다</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📎 지원 형식</strong></p>
                <ul>
                  <li><strong>문서</strong>: PDF, DOCX, XLSX, HWP</li>
                  <li><strong>이미지</strong>: JPG, PNG</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>🤖 AR 자동 분석</strong></p>
                <ul>
                  <li>보험 연간보고서(AR) PDF는 AI가 자동 분석</li>
                  <li>고객명 감지 시 해당 고객에게 자동 연결</li>
                </ul>
              </div>
            </>
          )}

          {/* 문서 일괄등록 */}
          {activeDocumentView === 'batch-document-upload' && (
            <>
              <div className="help-modal-section">
                <p><strong>📂 폴더 준비</strong></p>
                <ul>
                  <li>폴더명 = <strong>고객 이름</strong>으로 설정</li>
                  <li>예: "홍길동" 폴더 → 홍길동 고객에게 <strong>자동 연결</strong></li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>🔄 업로드 순서</strong></p>
                <ul>
                  <li><strong>1</strong>: 폴더 드래그 또는 선택</li>
                  <li><strong>2</strong>: 폴더명-고객명 매칭 확인</li>
                  <li><strong>3</strong>: "업로드 시작" 클릭</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>⚠️ 매칭 실패 시</strong></p>
                <ul>
                  <li><strong>✗ 표시</strong> 폴더: 드롭다운에서 고객 수동 선택</li>
                  <li>또는 폴더명을 고객명과 일치하게 수정</li>
                </ul>
              </div>
            </>
          )}

          {/* 내 보관함 */}
          {activeDocumentView === 'documents-my-files' && (
            <>
              <div className="help-modal-section">
                <p><strong>📁 폴더 관리</strong></p>
                <ul>
                  <li><strong>새 폴더</strong> 버튼으로 폴더 생성</li>
                  <li>폴더 <strong>우클릭</strong> → 이름 변경, 삭제</li>
                  <li>폴더끼리 <strong>드래그</strong>로 이동</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>📄 파일 관리</strong></p>
                <ul>
                  <li>파일을 폴더로 <strong>드래그</strong>해서 정리</li>
                  <li>파일 <strong>우클릭</strong> → 미리보기, 다운로드, 삭제</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>💡 팁</strong></p>
                <ul>
                  <li>개인 작업 공간으로 자유롭게 문서 정리</li>
                  <li>고객에게 연결되지 않은 개인 파일 보관용</li>
                </ul>
              </div>
            </>
          )}

          {/* 기본 도움말 (시작하기) */}
          {!activeDocumentView || ![
            'customers-regional', 'customers-relationship', 'customers-all',
            'contracts-all', 'contracts-import',
            'documents-library', 'documents-search', 'documents-register',
            'batch-document-upload', 'documents-my-files'
          ].includes(activeDocumentView) && (
            <>
              <p><strong>보험 설계사를 위한 지능형 문서 관리 시스템입니다.</strong></p>
              <div className="help-modal-section">
                <p><strong>문서 관리</strong></p>
                <ul>
                  <li><strong>문서 등록</strong>: 보험 문서 업로드 → AI가 고객명, 계약정보 자동 추출</li>
                  <li><strong>문서 보관함</strong>: 모든 업로드된 문서 확인 및 고객 연결</li>
                  <li><strong>내 보관함</strong>: 개인 폴더로 문서 정리</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>고객 관리</strong></p>
                <ul>
                  <li><strong>고객 등록</strong>: 신규 고객 정보 입력</li>
                  <li><strong>고객 전체보기</strong>: 등록된 모든 고객 확인 및 상세 정보 조회</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>계약 관리</strong></p>
                <ul>
                  <li><strong>고객·계약 일괄등록</strong>: 엑셀로 계약 정보 일괄 업로드</li>
                  <li><strong>전체 계약 보기</strong>: 모든 계약 현황 확인</li>
                </ul>
              </div>
              <div className="help-modal-section">
                <p><strong>팁</strong></p>
                <ul>
                  <li>각 화면에서 우클릭하면 빠른 작업 메뉴가 나타납니다</li>
                  <li>상단 검색창으로 문서, 고객을 빠르게 찾을 수 있습니다</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* AI 채팅 패널 - 팝업이 열려있으면 메인 창에서 표시하지 않음 */}
      <Suspense fallback={null}>
        <ChatPanel
          isOpen={isChatOpen && !isAiPopupOpen}
          onClose={() => setIsChatOpen(false)}
        />
      </Suspense>

    </div>
  )
}

// DocumentSearchProvider와 AppleConfirmProvider로 App 감싸기
function AppWithProviders(props: AppProps) {
  return (
    <AppleConfirmProvider>
      <DocumentSearchProvider>
        <App {...props} />
      </DocumentSearchProvider>
    </AppleConfirmProvider>
  )
}

export default AppWithProviders