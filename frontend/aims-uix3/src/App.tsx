
import { CustomerService } from '@/services/customerService';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useGaps } from './hooks/useGaps'
import { useDynamicType, initializeDynamicType } from './hooks/useDynamicType'
import { useHapticFeedback, initializeHapticStyles, HAPTIC_TYPES } from './hooks/useHapticFeedback'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import Header from './components/Header'
import { DocumentSearchProvider } from './contexts/DocumentSearchProvider'
import { AppleConfirmProvider } from './contexts/AppleConfirmProvider'
import { useDevModeStore } from './shared/store/useDevModeStore'
import { DevToolsPanel } from './shared/ui/DevToolsPanel'
import { useAccountSettingsStore } from './shared/store/useAccountSettingsStore'
import { useRecentCustomersStore } from './shared/store/useRecentCustomersStore'
import { useUserStore } from './stores/user'
import { getCurrentUser } from './entities/user/api'
import type { Customer as _Customer } from './entities/customer'
import { APP_VERSION } from './config/version'

// Lazy loading으로 성능 최적화
const LayoutControlModal = lazy(() => import('./components/LayoutControlModal'))
const HamburgerButton = lazy(() => import('./components/HamburgerButton'))
const RecentCustomers = lazy(() => import('./components/RecentCustomers'))
const CustomMenu = lazy(() => import('./components/CustomMenu/CustomMenu'))
const DocumentRegistrationView = lazy(() => import('./components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView'))
const DocumentLibraryView = lazy(() => import('./components/DocumentViews/DocumentLibraryView/DocumentLibraryView'))
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
const CustomerDocumentPreviewModal = lazy(() => import('./features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal'))
import type { PreviewDocumentInfo } from './features/customer/controllers/useCustomerDocumentsController'
import DownloadHelper from './utils/downloadHelper'

// 유틸리티 함수 및 타입 import (App.tsx에서 추출됨)
import type { SelectedDocument as _SelectedDocument, SmartSearchDocumentResponse } from './utils/documentTransformers'
import { toSmartSearchDocumentResponse, buildSelectedDocument } from './utils/documentTransformers'
import { adaptToDownloadHelper, convertToPreviewDocumentInfo } from './utils/documentAdapters'
import { useRightPaneContent } from './hooks/useRightPaneContent'
import { usePersistentTheme } from './hooks/usePersistentTheme'

// 상태 영속화를 위한 전역 저장소 (LocalStorage + 컴포넌트 리마운트와 독립)
const STORAGE_KEYS = {
  LAYOUT_MODAL: 'aims_layout_modal_open',
  ACTIVE_VIEW: 'aims_active_document_view'
} as const

// CenterPane과 RightPane의 기본 비율 (0~1 범위)
const DEFAULT_CENTER_PANE_RATIO = 0.5
const DEFAULT_CENTER_WIDTH_PERCENT = DEFAULT_CENTER_PANE_RATIO * 100
const DEFAULT_RIGHT_WIDTH_PERCENT = 100 - DEFAULT_CENTER_WIDTH_PERCENT

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

  // Developer Mode - Global State
  const { toggleDevMode } = useDevModeStore()

  // User Store - 사용자 정보 전역 관리
  const { updateCurrentUser } = useUserStore()

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
        activeDocumentView === "account-settings") {
      setPaginationVisible(false)
      // RightPane은 문서/고객이 선택되지 않은 경우에만 숨김
      if (!selectedDocument && !selectedCustomer) {
        setRightPaneVisible(false)
      }
    } else {
      setPaginationVisible(true)
      setRightPaneVisible(true)
    }
  }, [activeDocumentView, selectedDocument, selectedCustomer])

  // Developer Mode - Global Keyboard Handler (Ctrl+Shift+D)
  useEffect(() => {
    const handleDevMode = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggleDevMode()
      }
    }
    window.addEventListener('keydown', handleDevMode)
    return () => window.removeEventListener('keydown', handleDevMode)
  }, [toggleDevMode])

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
            // URL에서 잘못된 고객 ID 제거
            updateURLParams({ customerId: null })
          })
      }
    }

    // 문서 ID가 URL에 있으면 문서 정보 로드
    if (urlDocumentId && !urlCustomerId) {
      // handleDocumentClick 로직 재사용
      fetch('https://n8nd.giize.com/webhook/smartsearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  // iOS Dynamic Type + 햅틱 피드백 시스템 초기화
  useEffect(() => {
    initializeDynamicType()
    initializeHapticStyles()
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
      'documents', 'documents-register', 'documents-library', 'documents-search', 'documents-my-files', 'dsd',
      // 고객 관리 View들
      'customers', 'customers-register', 'customers-all', 'customers-regional', 'customers-relationship', 'customers-full-detail',
      // 계약 관리 View들
      'contracts', 'contracts-all', 'contracts-import', 'batch-document-upload',
      // 설정 View들
      'account-settings'
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

  return (
    <div
      className="layout-main"
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        ...cssVariables // CSS 변수 적용
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
          {/* CustomMenu - color.png 기반 완벽한 구현 */}
          <Suspense fallback={<div style={{ width: '100%', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
            <CustomMenu
              collapsed={leftPaneCollapsed}
              onMenuClick={handleMenuClick}
              onCustomerClick={handleRecentCustomerClick}
              selectedKey={activeDocumentView || 'dsd'}
            />
          </Suspense>

          {/* 최근 검색 고객 - 컴팩트 리스트 */}
          <Suspense fallback={null}>
            <RecentCustomers
              collapsed={leftPaneCollapsed}
              onCustomerClick={handleRecentCustomerClick}
            />
          </Suspense>

          {/* 햄버거 버튼 + 버전 - 맨 아래 오른쪽 배치 */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: leftPaneCollapsed ? 'center' : 'flex-end' }}>
            {/* 버전 표시 - 햄버거 버튼 바로 위 */}
            <div
              className={`version-display ${leftPaneCollapsed ? 'version-display--collapsed' : 'version-display--expanded'}`}
              style={{
                paddingBottom: 0,
                fontSize: 'var(--font-size-caption-2)',
                color: 'var(--color-text-tertiary)',
                opacity: 0.6,
                textAlign: leftPaneCollapsed ? 'center' : 'left',
                transition: 'all var(--duration-apple-graceful) var(--easing-apple-smooth)',
                userSelect: 'none'
              }}
              aria-label={`버전 ${APP_VERSION}`}
            >
              <div style={{ fontSize: leftPaneCollapsed ? '9px' : '10px', lineHeight: '1.2' }}>
                v{APP_VERSION}
              </div>
            </div>

            {/* 햄버거 버튼 */}
            <div className={`hamburger-container ${leftPaneCollapsed ? 'hamburger-container--collapsed' : 'hamburger-container--expanded'}`} style={{ marginTop: 0 }}>
              <Suspense fallback={<div style={{ width: '32px', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
                <HamburgerButton
                  collapsed={leftPaneCollapsed}
                  onClick={toggleLeftPaneCollapsed}
                />
              </Suspense>
            </div>
          </div>
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
              onDocumentDeleted={() => setRightPaneVisible(false)}
              onCustomerClick={handleCustomerClick}
              onRefreshExpose={(refreshFn) => {
                documentLibraryRefreshRef.current = refreshFn
              }}
              onNavigate={handleMenuClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentSearchView
              visible={activeDocumentView === 'documents-search'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
              onCustomerClick={handleCustomerClick}
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
        className={`layout-rightpane-container ${!rightPaneVisible ? 'layout-rightpane-container--hidden' : ''}`}
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

                  // OCR 신뢰도 표시
                  const ocrData = selectedDocument.ocr as { confidence?: unknown } | undefined
                  const ocrConfidence = ocrData?.confidence
                  if (ocrConfidence !== undefined && ocrConfidence !== null) {
                    const rawNum = typeof ocrConfidence === 'string' ? parseFloat(ocrConfidence) : Number(ocrConfidence)
                    const confidenceNum = typeof rawNum === 'number' ? rawNum : NaN
                    if (!isNaN(confidenceNum)) {
                      // 신뢰도 레벨 계산
                      let label = '매우 낮음'
                      if (confidenceNum >= 0.95) label = '매우 높음'
                      else if (confidenceNum >= 0.85) label = '높음'
                      else if (confidenceNum >= 0.70) label = '보통'
                      else if (confidenceNum >= 0.50) label = '낮음'

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>{fileName}</div>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: '400',
                            color: 'var(--color-text-tertiary)',
                            opacity: 0.7
                          }}>
                            OCR {(confidenceNum * 100).toFixed(1)}% · {label}
                          </div>
                        </div>
                      )
                    }
                  }
                  return fileName
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
                  const download = () => {
                    DownloadHelper.downloadDocument(adaptToDownloadHelper({ ...selectedDocument, fileUrl: selectedDocument.fileUrl ?? '' } as typeof selectedDocument & { fileUrl: string }))
                  }

                  const fileUrl = selectedDocument.fileUrl
                  if (!fileUrl) {
                    const fileName =
                      selectedDocument.upload?.originalName ||
                      selectedDocument.payload?.originalName ||
                      '파일'

                    return (
                      <DownloadOnlyViewer
                        fileName={fileName}
                        onDownload={download}
                      />
                    )
                  }

                  const normalizedUrl = fileUrl.toLowerCase()
                  const isPdf = normalizedUrl.endsWith('.pdf')
                  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(normalizedUrl)

                  if (isPdf) {
                    return (
                      <PDFViewer
                        file={fileUrl}
                        onDownload={download}
                      />
                    )
                  }

                  if (isImage) {
                    return (
                      <ImageViewer
                        file={fileUrl}
                        onDownload={download}
                      />
                    )
                  }

                  const fileName =
                    selectedDocument.upload?.originalName ||
                    selectedDocument.payload?.originalName ||
                    '파일'
                  return (
                    <DownloadOnlyViewer
                      fileName={fileName}
                      onDownload={download}
                    />
                  )
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
          {...(previewModalDocument?.fileUrl ? {
            onDownload: () => {
              // 새 창에서 파일 열기 (다운로드)
              window.open(previewModalDocument.fileUrl!, '_blank');
            }
          } : {})}
        />
      </Suspense>

      {/* 개발자 도구 패널 (DEV 모드에서만 표시) */}
      <DevToolsPanel />

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