
import { CustomerService } from '@/services/customerService';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useGaps } from './hooks/useGaps'
import { useDynamicType, initializeDynamicType } from './hooks/useDynamicType'
import { useHapticFeedback, initializeHapticStyles, HAPTIC_TYPES } from './hooks/useHapticFeedback'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import Header from './components/Header'
import { DocumentSearchProvider } from './contexts/DocumentSearchProvider'
import type { Customer } from './entities/customer'

// Lazy loading으로 성능 최적화
const LayoutControlModal = lazy(() => import('./components/LayoutControlModal'))
const HamburgerButton = lazy(() => import('./components/HamburgerButton'))
const CustomMenu = lazy(() => import('./components/CustomMenu/CustomMenu'))
const DocumentRegistrationView = lazy(() => import('./components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView'))
const DocumentLibraryView = lazy(() => import('./components/DocumentViews/DocumentLibraryView/DocumentLibraryView'))
const DocumentSearchView = lazy(() => import('./components/DocumentViews/DocumentSearchView/DocumentSearchView'))
const DocumentStatusView = lazy(() => import('./components/DocumentViews/DocumentStatusView/DocumentStatusView'))
const DocumentManagementView = lazy(() => import('./components/DocumentViews/DocumentManagementView/DocumentManagementView'))
const CustomerManagementView = lazy(() => import('./components/CustomerViews/CustomerManagementView/CustomerManagementView'))
const CustomerRegistrationView = lazy(() => import('./components/CustomerViews/CustomerRegistrationView/CustomerRegistrationView'))
const CustomerAllView = lazy(() => import('./components/CustomerViews/CustomerAllView/CustomerAllView'))
const CustomerRegionalView = lazy(() => import('./components/CustomerViews/CustomerRegionalView/CustomerRegionalView'))
const CustomerRelationshipView = lazy(() => import('./components/CustomerViews/CustomerRelationshipView/CustomerRelationshipView'))
const BaseViewer = lazy(() => import('./components/BaseViewer'))
const PDFViewer = lazy(() => import('./components/PDFViewer'))
const ImageViewer = lazy(() => import('./components/ImageViewer'))
const DownloadOnlyViewer = lazy(() => import('./components/DownloadOnlyViewer'))
const CustomerDetailView = lazy(() => import('./features/customer/views/CustomerDetailView'))
import DownloadHelper from './utils/downloadHelper'

interface SmartSearchUploadRaw {
  originalName?: unknown
  destPath?: unknown
  uploaded_at?: unknown
  [key: string]: unknown
}

interface SmartSearchPayloadRaw {
  original_name?: unknown
  dest_path?: unknown
  mime?: unknown
  size_bytes?: unknown
  uploaded_at?: unknown
  [key: string]: unknown
}

interface SmartSearchMetaRaw {
  mime?: unknown
  size_bytes?: unknown
  [key: string]: unknown
}

interface SmartSearchDocumentResponse {
  upload?: SmartSearchUploadRaw
  payload?: SmartSearchPayloadRaw
  meta?: SmartSearchMetaRaw
}

interface SelectedDocumentUpload {
  originalName: string
  destPath?: string
  uploadedAt?: string
}

interface SelectedDocumentPayload {
  originalName?: string
  destPath?: string
  uploadedAt?: string
  mime?: string
  sizeBytes?: number
}

interface SelectedDocumentMeta {
  mime?: string
  sizeBytes?: number
}

interface SelectedDocument {
  _id: string
  fileUrl?: string
  upload: SelectedDocumentUpload
  payload?: SelectedDocumentPayload
  meta: SelectedDocumentMeta
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const candidate = toTrimmedString(value)
    if (candidate) {
      return candidate
    }
  }
  return undefined
}

const normalizeDestPath = (value?: string): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const resolveFileUrl = (destPath?: string): string | undefined => {
  const normalized = normalizeDestPath(destPath)
  if (!normalized) return undefined
  const adjustedPath = normalized.startsWith('/data')
    ? normalized.replace('/data', '')
    : normalized
  return `https://tars.giize.com${adjustedPath}`
}

const toSmartSearchDocumentResponse = (value: unknown): SmartSearchDocumentResponse | null => {
  if (!isPlainObject(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  const upload: SmartSearchUploadRaw = isPlainObject(record['upload']) ? (record['upload'] as SmartSearchUploadRaw) : ({} as SmartSearchUploadRaw)
  const payload: SmartSearchPayloadRaw = isPlainObject(record['payload']) ? (record['payload'] as SmartSearchPayloadRaw) : ({} as SmartSearchPayloadRaw)
  const meta: SmartSearchMetaRaw = isPlainObject(record['meta']) ? (record['meta'] as SmartSearchMetaRaw) : ({} as SmartSearchMetaRaw)

  return { upload, payload, meta }
}

const buildSelectedDocument = (documentId: string, raw: SmartSearchDocumentResponse): SelectedDocument => {
  const originalName =
    firstNonEmptyString(raw.upload?.['originalName'], raw.payload?.['originalName']) ??
    '문서'

  const destPath = normalizeDestPath(
    firstNonEmptyString(raw.upload?.destPath, raw.payload?.dest_path)
  )

  const uploadedAt =
    toTrimmedString(raw.upload?.uploaded_at) ??
    toTrimmedString(raw.payload?.uploaded_at)

  const metaMime = firstNonEmptyString(raw.meta?.mime, raw.payload?.mime)
  const metaSize = toFiniteNumber(raw.meta?.size_bytes) ?? toFiniteNumber(raw.payload?.size_bytes)

  const payload: SelectedDocumentPayload = {}
  const payloadOriginalName = toTrimmedString(raw.payload?.['originalName'])
  if (payloadOriginalName) payload.originalName = payloadOriginalName

  const payloadDestPath = normalizeDestPath(toOptionalString(raw.payload?.dest_path))
  if (payloadDestPath) payload.destPath = payloadDestPath

  const payloadUploadedAt = toTrimmedString(raw.payload?.uploaded_at)
  if (payloadUploadedAt) payload.uploadedAt = payloadUploadedAt

  const payloadMime = toTrimmedString(raw.payload?.mime)
  if (payloadMime) payload.mime = payloadMime

  const payloadSize = toFiniteNumber(raw.payload?.size_bytes)
  if (payloadSize !== undefined) payload.sizeBytes = payloadSize

  const hasPayload = Object.keys(payload).length > 0

  const meta: SelectedDocumentMeta = {}
  if (metaMime) meta.mime = metaMime
  if (metaSize !== undefined) meta.sizeBytes = metaSize

  const upload: SelectedDocumentUpload = {
    originalName
  }

  if (destPath) {
    upload.destPath = destPath
  }

  if (uploadedAt) {
    upload.uploadedAt = uploadedAt
  }

  const fileUrl = resolveFileUrl(destPath)

  const selected: SelectedDocument = {
    _id: documentId,
    upload,
    meta
  }

  if (fileUrl) {
    selected.fileUrl = fileUrl
  }

  if (hasPayload) {
    selected.payload = payload
  }

  return selected
}

const adaptToDownloadHelper = (doc: SelectedDocument) => {
  const payload: { original_name?: string; dest_path?: string } = {};
  if (doc.payload?.['originalName']) payload.original_name = doc.payload['originalName'];
  if (doc.payload?.['destPath']) payload.dest_path = doc.payload['destPath'];

  return {
    _id: doc._id,
    fileUrl: doc.fileUrl ?? '',
    upload: {
      originalName: doc.upload?.['originalName'] ?? '',
      destPath: doc.upload?.['destPath'] ?? ''
    },
    payload
  };
}

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
  const [rightPaneVisible, setRightPaneVisible] = useState(true)
  const [centerWidth, setCenterWidth] = useState(DEFAULT_CENTER_WIDTH_PERCENT)
  const [paginationVisible, setPaginationVisible] = useState(true)

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

  // LeftPane 축소/확장 상태
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false)

  // 문서 관리 View 상태 (한 번에 하나의 View만 표시) - 영속화 지원
  const [activeDocumentView, setActiveDocumentView] = useState<string | null>(
    persistentState.activeDocumentView
  )

  // RightPane 문서 프리뷰 상태
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null)

  // RightPane 고객 상세 상태
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [rightPaneContentType, setRightPaneContentType] = useState<'document' | 'customer' | null>(null)

  // 고객 전체보기 새로고침을 위한 ref
  const customerAllViewRefreshRef = useRef<(() => void) | null>(null)

  // DocumentRegistrationView, DocumentLibrary, DocumentSearchView, DocumentStatusView 활성 시 PaginationPane 숨김
  // 고객 관련 View 활성 시 PaginationPane 숨김 (디폴트 상태)
  // RightPane은 문서/고객 선택 시에만 표시되도록 handleDocumentClick/handleCustomerClick에서 관리
  useEffect(() => {
    if (activeDocumentView === "documents" ||
        activeDocumentView === "documents-register" ||
        activeDocumentView === "documents-library" ||
        activeDocumentView === "documents-search" ||
        activeDocumentView === "dsd" ||
        activeDocumentView === "customers" ||
        activeDocumentView === "customers-register" ||
        activeDocumentView === "customers-all" ||
        activeDocumentView === "customers-regional" ||
        activeDocumentView === "customers-relationship") {
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

  useEffect(() => {
    if (rightPaneVisible && centerWidth !== DEFAULT_CENTER_WIDTH_PERCENT) {
      setCenterWidth(DEFAULT_CENTER_WIDTH_PERCENT)
    }
  }, [rightPaneVisible, centerWidth])

  // 🍎 Progressive Disclosure: LeftPane 애니메이션 상태 추적
  const [leftPaneAnimationState, setLeftPaneAnimationState] = useState<'idle' | 'expanding' | 'collapsing'>('idle')


  // 갭 시스템 (실시간 조정 가능) - DEFAULT_GAPS 기본값 적용
  const [dynamicGaps, setDynamicGaps] = useState<Partial<GapConfig>>(initialGaps || DEFAULT_GAPS)
  const { cssVariables, gapValues } = useGaps(dynamicGaps)

  // 통합 제어 모달 상태 (영속화 지원)
  const [layoutControlModalOpen, setLayoutControlModalOpen] = useState(false)
  const [modalClickProtection, setModalClickProtection] = useState(false)
  const modalStateRef = useRef(false)

  // 컴포넌트 마운트 시 이전 상태 복원 (모달 + 활성 View)
  useEffect(() => {
    if (persistentState.layoutControlModalOpen) {
      setLayoutControlModalOpen(true)
      modalStateRef.current = true
    }

    // 활성 View 상태 복원
    if (persistentState.activeDocumentView) {
      setActiveDocumentView(persistentState.activeDocumentView)
    }
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

  // 활성 View 상태 변경 시 전역 저장소 + LocalStorage 동기화
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
  }, [activeDocumentView])

  // 테마 시스템
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')

  // 테마 적용 및 시스템 설정 감지
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    // 시스템 테마일 때만 미디어 쿼리 리스너 등록
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

      const handleSystemThemeChange = () => {
        // 시스템 설정이 변경되었을 때 재렌더링 트리거
        // CSS는 이미 @media (prefers-color-scheme: dark) 로 처리됨
        if (import.meta.env.DEV) {
          console.log(`[Theme] 시스템 테마 변경 감지: ${mediaQuery.matches ? 'dark' : 'light'}`)
        }
      }

      // 초기 로그
      if (import.meta.env.DEV) {
        console.log(`[Theme] 시스템 테마 모드 활성화 - 현재: ${mediaQuery.matches ? 'dark' : 'light'}`)
      }

      mediaQuery.addEventListener('change', handleSystemThemeChange)

      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      }
    }

    // 시스템 테마가 아닐 때는 정리 함수 불필요
    return () => {}
  }, [theme])

  const toggleTheme = () => {
    // iOS 16+ 미디움 햅틱 피드백 - 인터페이스 변경
    haptic.triggerHaptic('medium')
    setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light')
  }

  // 브라우저 리사이즈 상태 관리
  const [isResizing, setIsResizing] = useState(false)
  const [resizeTimer, setResizeTimer] = useState<NodeJS.Timeout | null>(null)
  const [forceUpdate, setForceUpdate] = useState(0)

  // 브라우저 리사이즈 이벤트 핸들러
  useEffect(() => {
    const handleResize = () => {
      setIsResizing(true)

      // 모달 상태 보호: 모달이 열려있거나 클릭 보호 중일 때는 리마운트 지연
      if (!modalStateRef.current && !modalClickProtection) {
        // 즉시 레이아웃 강제 업데이트 (Gap 계산 포함)
        setForceUpdate(prev => prev + 1)
      } else {
        // 모달 상태 보호를 위해 리마운트를 지연
        setTimeout(() => {
          if (!modalStateRef.current && !modalClickProtection) {
            setForceUpdate(prev => prev + 1)
          }
        }, 100)
      }

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
  }, [resizeTimer, modalClickProtection])

  // 이벤트 핸들러들 메모이제이션 (성능 최적화, 기존 동작 보존)
  const toggleHeader = useCallback(() => setHeaderVisible(prev => !prev), [])
  const toggleLeftPane = useCallback(() => setLeftPaneVisible(prev => !prev), [])
  const toggleCenterPane = useCallback(() => setCenterPaneVisible(prev => !prev), [])
  const toggleRightPane = useCallback(() => setRightPaneVisible(prev => !prev), [])
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
      // 문서 관리 View들
      'documents', 'documents-register', 'documents-library', 'documents-search', 'dsd',
      // 고객 관리 View들
      'customers', 'customers-register', 'customers-all', 'customers-regional', 'customers-relationship'
    ]
    if (allViewKeys.includes(menuKey)) {
      setActiveDocumentView(menuKey)

      // 메뉴 변경 시 RightPane 닫기 (문서/고객 선택 해제)
      setSelectedDocument(null)
      setSelectedCustomer(null)
      setRightPaneContentType(null)
      setRightPaneVisible(false)
    }
  }, [])

  const closeDocumentView = useCallback(() => {
    setActiveDocumentView(null)
  }, [])

  // 문서 클릭 핸들러 - RightPane 열기 및 문서 프리뷰
  const handleDocumentClick = useCallback(async (documentId: string) => {
    if (import.meta.env.DEV) {
      console.log('[App] 문서 클릭:', documentId)
    }

    try {
      // n8n webhook을 통해 문서 상세 정보 조회
      const response = await fetch('https://n8nd.giize.com/webhook/smartsearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: documentId })
      })

      const json = await response.json() as unknown
      const data = Array.isArray(json) ? json as SmartSearchDocumentResponse[] : json ? [json as SmartSearchDocumentResponse] : []
      if (import.meta.env.DEV) {
        console.log('[App] API 응답 데이터:', data)
      }

      const fileData = data[0]
      if (!fileData) {
        if (import.meta.env.DEV) {
          console.warn('[App] fileData가 비어 있습니다.')
        }
        return
      }

      const rawDocument = toSmartSearchDocumentResponse(fileData)
      if (!rawDocument) {
        if (import.meta.env.DEV) {
          console.warn('[App] smart search 응답이 예상한 형태가 아닙니다.', fileData)
        }
        return
      }

      const selected = buildSelectedDocument(documentId, rawDocument)

      if (import.meta.env.DEV) {
        console.log('[App] 구성된 document 객체:', selected)
        console.log('[App] fileUrl:', selected.fileUrl)
      }

      setSelectedDocument(selected)
      setRightPaneContentType('document')

      // RightPane 항상 표시 (조건 없이)
      setRightPaneVisible(true)
    } catch (error) {
      console.error('[App] 문서 로드 오류:', error)
    }
  }, [])

  // 고객 클릭 핸들러 - RightPane 열기 및 고객 상세 정보
  const handleCustomerClick = useCallback(async (customerId: string, customerData?: Customer) => {
    if (import.meta.env.DEV) {
      console.log('[App] 고객 클릭:', customerId, customerData)
    }

    if (customerData) {
      setSelectedCustomer(customerData)
    } else {
      const customer = await CustomerService.getCustomer(customerId)
      setSelectedCustomer(customer)
    }
    setRightPaneContentType('customer')

    // RightPane이 숨겨져 있으면 표시
    setRightPaneVisible(true)
  }, [])

  // 고객 정보 새로고침 핸들러 (수정 시 사용)
  const handleCustomerRefresh = useCallback(async () => {
    if (!selectedCustomer?._id) return

    try {
      // CustomerService를 동적으로 import
      const customer = await CustomerService.getCustomer(selectedCustomer._id)
      setSelectedCustomer(customer)
      if (import.meta.env.DEV) {
        console.log('[App] 고객 상세정보 새로고침 완료')
      }

      // 고객 전체보기도 새로고침
      if (customerAllViewRefreshRef.current) {
        customerAllViewRefreshRef.current()
        if (import.meta.env.DEV) {
          console.log('[App] 고객 전체보기 새로고침 완료')
        }
      }
    } catch (error) {
      console.error('[App] 고객 정보 새로고침 실패:', error)
    }
  }, [selectedCustomer])

  // 고객 삭제 후 전체보기만 새로고침 핸들러 (삭제 시 사용)
  const handleCustomerDelete = useCallback(() => {
    // 고객 전체보기만 새로고침 (selectedCustomer는 이미 없음)
    if (customerAllViewRefreshRef.current) {
      customerAllViewRefreshRef.current()
      if (import.meta.env.DEV) {
        console.log('[App] 고객 삭제 후 전체보기 새로고침 완료')
      }
    }
  }, [])
  // 🍎 Progressive Disclosure: LeftPane 토글 with 애니메이션 상태 관리
  const toggleLeftPaneCollapsed = useCallback(() => {
    setLeftPaneCollapsed(prev => {
      const newCollapsed = !prev

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
    const rightPaneLeft = `calc(${centerPaneLeft} + ${centerWidthExpr} + var(--gap-center))`

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
      key={forceUpdate} // 브라우저 리사이즈 시 강제 리렌더링
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
      />

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <nav
          className={`layout-pane layout-leftpane ${isResizing ? '' : 'transition-smooth'} ${leftPaneAnimationState === 'expanding' ? 'layout-leftpane--expanding' : ''} ${leftPaneAnimationState === 'collapsing' ? 'layout-leftpane--collapsing' : ''}`}
          role="navigation"
          aria-label="메인 네비게이션 메뉴"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            width: layoutDimensions.leftPaneWidthVar,
            height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
            padding: leftPaneCollapsed ? 'var(--spacing-3)' : 'var(--spacing-6)' /* 🍎 애플 표준: 1:2 비율 (12px/24px) */
          }}
        >
          {/* CustomMenu - color.png 기반 완벽한 구현 */}
          <Suspense fallback={<div style={{ width: '100%', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
            <CustomMenu
              collapsed={leftPaneCollapsed}
              onMenuClick={handleMenuClick}
              selectedKey={activeDocumentView || 'dsd'}
            />
          </Suspense>

          {/* 햄버거 버튼 - aims-uix2 스타일 */}
          <div className={`hamburger-container ${leftPaneCollapsed ? 'hamburger-container--collapsed' : 'hamburger-container--expanded'}`}>
            <Suspense fallback={<div style={{ width: '32px', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
              <HamburgerButton
                collapsed={leftPaneCollapsed}
                onClick={toggleLeftPaneCollapsed}
              />
            </Suspense>
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
          className="layout-pane layout-centerpane"
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
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentSearchView
              visible={activeDocumentView === 'documents-search'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <DocumentStatusView
              visible={activeDocumentView === 'dsd'}
              onClose={closeDocumentView}
              onDocumentClick={handleDocumentClick}
            />
          </Suspense>

          {/* 고객 관리 View 오버레이들 */}
          <Suspense fallback={null}>
            <CustomerManagementView
              visible={activeDocumentView === 'customers'}
              onClose={closeDocumentView}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRegistrationView
              visible={activeDocumentView === 'customers-register'}
              onClose={closeDocumentView}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerAllView
              visible={activeDocumentView === 'customers-all'}
              onClose={closeDocumentView}
              onCustomerClick={handleCustomerClick}
              onRefreshExpose={(refreshFn) => {
                customerAllViewRefreshRef.current = refreshFn
              }}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRegionalView
              visible={activeDocumentView === 'customers-regional'}
              onClose={closeDocumentView}
              onCustomerClick={handleCustomerClick}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CustomerRelationshipView
              visible={activeDocumentView === 'customers-relationship'}
              onClose={closeDocumentView}
              onCustomerSelect={handleCustomerClick}
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

      {/* RightPane + BRB 통합 컨테이너 - Header-CBR 연동 완벽 동기화 */}
      <aside
        className="layout-rightpane-container"
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
          opacity: rightPaneVisible ? 1 : 0,
          overflow: 'hidden',
          // transition 제거: CSS에서 Header-CBR 연동 전용 transition 사용
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
          style={{
            flex: 1,
            padding: (selectedDocument || selectedCustomer) ? '0' : (rightPaneVisible ? 'var(--spacing-6) var(--spacing-5)' : '0'),
            overflow: 'hidden',
            color: 'var(--color-text-primary)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {rightPaneVisible && !rightPaneContentType && (
            <>
              <h3 className="section-heading" style={{
                color: 'var(--color-text-primary)',
                margin: '0'
              }}>RightPane</h3>
            </>
          )}

          {/* 고객 상세 정보 표시 */}
          {rightPaneVisible && rightPaneContentType === 'customer' && selectedCustomer && (
            <Suspense fallback={<div style={{ padding: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>로딩 중...</div>}>
              <CustomerDetailView
                customer={selectedCustomer}
                onClose={() => {
                  setSelectedCustomer(null)
                  setRightPaneContentType(null)
                  setRightPaneVisible(false)
                }}
                onRefresh={handleCustomerRefresh}
                onDelete={handleCustomerDelete}
                onSelectCustomer={handleCustomerClick}
                gapLeft={gapValues.gapLeft}
                gapRight={gapValues.gapRight}
                gapTop={gapValues.gapTop}
                gapBottom={gapValues.gapBottom}
              />
            </Suspense>
          )}

          {/* 문서 프리뷰 표시 */}
          {rightPaneVisible && rightPaneContentType === 'document' && selectedDocument && (
            <Suspense fallback={<div style={{ padding: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>로딩 중...</div>}>
              <BaseViewer
                visible={true}
                title={selectedDocument.upload?.originalName ||
                       selectedDocument.payload?.originalName ||
                       '파일'}
                onClose={() => {
                  setSelectedDocument(null)
                  setRightPaneContentType(null)
                  setRightPaneVisible(false)
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

    </div>
  )
}

// DocumentSearchProvider로 App 감싸기
function AppWithProviders(props: AppProps) {
  return (
    <DocumentSearchProvider>
      <App {...props} />
    </DocumentSearchProvider>
  )
}

export default AppWithProviders