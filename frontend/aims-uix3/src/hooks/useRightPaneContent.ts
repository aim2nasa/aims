/**
 * RightPane 콘텐츠 관리 훅
 *
 * @since 2025-12-05
 * @description
 * App.tsx에서 추출된 RightPane 관련 상태 및 핸들러를 관리합니다.
 * - 문서/고객 선택 상태
 * - RightPane 표시/숨김
 * - 문서 클릭, 고객 클릭 핸들러
 * - 전체 정보 페이지 열기/닫기
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Customer } from '@/entities/customer'
import type { SelectedDocument, DocumentComputedData } from '../utils/documentTransformers'
import { toSmartSearchDocumentResponse, buildSelectedDocument } from '../utils/documentTransformers'
import { CustomerService } from '@/services/customerService'
import { api } from '@/shared/lib/api'
import { logger } from '@/shared/lib/logger'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'

/**
 * RightPane 콘텐츠 타입
 */
export type RightPaneContentType = 'document' | 'customer' | null

/**
 * 이전 UI 상태 (전체 정보 뷰에서 복원용)
 */
interface PreviousUIState {
  view: string | null
  customer: Customer | null
  rightPaneVisible: boolean
  rightPaneContentType: RightPaneContentType
}

/**
 * useRightPaneContent 훅 옵션
 */
export interface UseRightPaneContentOptions {
  /** URL 파라미터 업데이트 함수 */
  updateURLParams: (params: {
    view?: string | null
    customerId?: string | null
    documentId?: string | null
    tab?: string | null
  }) => void
  /** 현재 활성 문서 뷰 */
  activeDocumentView: string | null
  /** 활성 문서 뷰 설정 함수 */
  setActiveDocumentView: (view: string | null) => void
  /** 전체 정보 뷰 고객 ID 설정 함수 */
  setFullDetailCustomerId: (id: string | null) => void
  /** 고객 전체보기 새로고침 ref */
  customerAllViewRefreshRef?: React.MutableRefObject<(() => void) | null>
  /** 탐색기 고객 ID 설정 함수 */
  setExplorerCustomerId?: (id: string | null) => void
  /** 탐색기 고객명 설정 함수 */
  setExplorerCustomerName?: (name: string | null) => void
}

/**
 * useRightPaneContent 훅 반환 타입
 */
export interface UseRightPaneContentReturn {
  // 상태
  rightPaneVisible: boolean
  rightPaneContentType: RightPaneContentType
  selectedDocument: SelectedDocument | null
  selectedCustomer: Customer | null
  /** RightPane이 숨김→표시 전환될 때 증가하는 트리거 (탭 데이터 새로고침용) */
  rightPaneRefreshTrigger: number

  // 핸들러
  handleDocumentClick: (documentId: string) => Promise<void>
  handleCustomerClick: (
    customerId: string | null,
    customerData?: Customer,
    initialTab?: string
  ) => Promise<void>
  handleOpenFullDetail: (customerId: string) => void
  handleCloseFullDetail: () => void
  handleExpandToExplorer: (customerId: string, customerName: string) => void
  handleCollapseExplorer: () => void
  handleCustomerRefresh: () => Promise<void>
  handleCustomerDelete: () => void
  toggleRightPane: () => void

  // Setter (외부에서 제어 필요 시)
  setRightPaneVisible: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedDocument: React.Dispatch<React.SetStateAction<SelectedDocument | null>>
  setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>
  setRightPaneContentType: React.Dispatch<React.SetStateAction<RightPaneContentType>>
}

/**
 * RightPane 콘텐츠 관리 훅
 *
 * @param options 훅 옵션
 * @returns RightPane 상태 및 핸들러
 *
 * @example
 * ```tsx
 * const {
 *   rightPaneVisible,
 *   selectedDocument,
 *   selectedCustomer,
 *   handleDocumentClick,
 *   handleCustomerClick,
 * } = useRightPaneContent({
 *   updateURLParams,
 *   activeDocumentView,
 *   setActiveDocumentView,
 *   setFullDetailCustomerId,
 * })
 * ```
 */
export function useRightPaneContent(
  options: UseRightPaneContentOptions
): UseRightPaneContentReturn {
  const {
    updateURLParams,
    activeDocumentView,
    setActiveDocumentView,
    setFullDetailCustomerId,
    customerAllViewRefreshRef,
    setExplorerCustomerId,
    setExplorerCustomerName,
  } = options

  // 최근 검색 고객 스토어
  const addRecentCustomer = useRecentCustomersStore((state) => state.addRecentCustomer)

  // RightPane 상태
  const [rightPaneVisible, setRightPaneVisible] = useState(false)
  const [rightPaneContentType, setRightPaneContentType] = useState<RightPaneContentType>(null)

  // 선택된 문서/고객 상태
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // RightPane 새로고침 트리거 (숨김→표시 전환 시 증가)
  const [rightPaneRefreshTrigger, setRightPaneRefreshTrigger] = useState(0)

  // 전체 정보 뷰 열기 전 UI 상태 저장 (돌아가기 버튼용)
  const fullDetailPreviousUIStateRef = useRef<PreviousUIState | null>(null)
  // 문서 탐색기 열기 전 UI 상태 저장 (축소 버튼용)
  const explorerPreviousUIStateRef = useRef<PreviousUIState | null>(null)

  // 이전 visible 상태 추적 (숨김 → 표시 감지용)
  const prevVisibleRef = useRef(false)

  // RightPane 토글
  const toggleRightPane = useCallback(() => {
    setRightPaneVisible(prev => !prev)
  }, [])

  // 문서 새로고침 핸들러 (내부용 - visibility change 시 사용)
  const refreshDocument = useCallback(async (documentId: string) => {
    try {
      const result = await api.get<{
        success: boolean
        data?: { raw?: unknown; computed?: DocumentComputedData }
      }>(`/api/documents/${documentId}/status`)
      if (!result.success || !result.data) return
      const rawDocument = toSmartSearchDocumentResponse(result.data.raw)
      if (!rawDocument) return
      const computed = result.data.computed ?? null
      const selected = buildSelectedDocument(documentId, rawDocument, computed)
      setSelectedDocument(selected)
      logger.debug('useRightPaneContent', `문서 새로고침 완료: ${documentId}`)
    } catch (error) {
      logger.error('useRightPaneContent', '문서 새로고침 실패', error)
      errorReporter.reportApiError(error as Error, { component: 'useRightPaneContent.refreshDocument', payload: { documentId } })
    }
  }, [])

  // ref로 최신 상태 유지 (클로저 문제 방지)
  const selectedCustomerRef = useRef(selectedCustomer)
  const selectedDocumentRef = useRef(selectedDocument)
  const rightPaneContentTypeRef = useRef(rightPaneContentType)

  useEffect(() => {
    selectedCustomerRef.current = selectedCustomer
  }, [selectedCustomer])

  useEffect(() => {
    selectedDocumentRef.current = selectedDocument
  }, [selectedDocument])

  useEffect(() => {
    rightPaneContentTypeRef.current = rightPaneContentType
  }, [rightPaneContentType])

  // RightPane이 숨김 → 표시로 변경될 때 새로고침 트리거 증가
  useEffect(() => {
    const wasHidden = !prevVisibleRef.current
    const isNowVisible = rightPaneVisible

    logger.debug('useRightPaneContent', 'visibility change', { wasHidden, isNowVisible, prevVisible: prevVisibleRef.current })

    // 숨김 → 표시 전환 시 트리거 증가 (탭들이 이 트리거를 감지하여 새로고침)
    if (wasHidden && isNowVisible) {
      logger.debug('useRightPaneContent', 'RightPane 표시됨 - refreshTrigger 증가')
      setRightPaneRefreshTrigger(prev => prev + 1)
    }

    prevVisibleRef.current = rightPaneVisible
  }, [rightPaneVisible])

  // 브라우저 탭 활성화 시 새로고침 트리거 증가 (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && rightPaneVisible) {
        logger.debug('useRightPaneContent', '탭 활성화됨 - refreshTrigger 증가')
        setRightPaneRefreshTrigger(prev => prev + 1)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [rightPaneVisible])

  // AI 어시스턴트 데이터 변경 시 RightPane 고객 정보 새로고침
  useEffect(() => {
    const handleAIDataChanged = async () => {
      logger.debug('useRightPaneContent', 'AI 어시스턴트 데이터 변경 감지')

      // 현재 선택된 고객이 있으면 새로고침
      const currentCustomer = selectedCustomerRef.current
      if (currentCustomer?._id) {
        try {
          const customer = await CustomerService.getCustomer(currentCustomer._id)
          setSelectedCustomer(customer)
          logger.debug('useRightPaneContent', 'AI 변경 후 고객 정보 새로고침 완료')
        } catch (error) {
          logger.error('useRightPaneContent', 'AI 변경 후 고객 정보 새로고침 실패', error)
        }
      }

      // refreshTrigger도 증가시켜 탭들이 새로고침하도록
      setRightPaneRefreshTrigger(prev => prev + 1)
    }

    window.addEventListener('aiAssistantDataChanged', handleAIDataChanged)
    return () => {
      window.removeEventListener('aiAssistantDataChanged', handleAIDataChanged)
    }
  }, [])

  // 문서 클릭 핸들러 - RightPane 열기 및 문서 프리뷰
  const handleDocumentClick = useCallback(async (documentId: string) => {
    logger.debug('useRightPaneContent', `문서 클릭: ${documentId}`)

    try {
      // /api/documents/:id/status API로 문서 상세 정보 조회
      const result = await api.get<{
        success: boolean
        data?: {
          raw?: unknown
          computed?: DocumentComputedData
        }
      }>(`/api/documents/${documentId}/status`)
      logger.debug('useRightPaneContent', 'API 응답', result)

      if (!result.success || !result.data) {
        logger.debug('useRightPaneContent', '문서 데이터가 없습니다.')
        return
      }

      // result.data.raw를 SmartSearchDocumentResponse로 변환
      logger.debug('useRightPaneContent', 'result.data.raw', result.data.raw)

      const rawDocument = toSmartSearchDocumentResponse(result.data.raw)
      if (!rawDocument) {
        logger.debug('useRightPaneContent', '문서 응답이 예상한 형태가 아닙니다.', result.data.raw)
        return
      }

      // computed 데이터 추출 (PDF 변환 정보 포함)
      const computed = result.data.computed ?? null

      logger.debug('useRightPaneContent', 'rawDocument after conversion', rawDocument)

      const selected = buildSelectedDocument(documentId, rawDocument, computed)

      logger.debug('useRightPaneContent', '구성된 document 객체', { fileUrl: selected.fileUrl, previewFileUrl: selected.previewFileUrl })

      setSelectedDocument(selected)
      setRightPaneContentType('document')

      // RightPane 항상 표시 (조건 없이)
      setRightPaneVisible(true)

      // URL에 문서 ID 저장
      updateURLParams({ documentId, customerId: null })
    } catch (error) {
      logger.error('useRightPaneContent', '문서 로드 오류', error)
      errorReporter.reportApiError(error as Error, { component: 'useRightPaneContent.handleDocumentClick', payload: { documentId } })
    }
  }, [updateURLParams])

  // 고객 클릭 핸들러 - RightPane 열기 및 고객 상세 정보
  // customerId가 null이면 RightPane 닫기 (CustomerRelationshipView에서 빠른 가족 등록 패널 열 때 사용)
  // initialTab: 선택적으로 초기 탭 지정 (예: 'contracts' - 계약 탭으로 열기)
  const handleCustomerClick = useCallback(
    async (customerId: string | null, customerData?: Customer, initialTab?: string) => {
      logger.debug('useRightPaneContent', `고객 클릭: ${customerId}`, { initialTab })

      // customerId가 null이면 RightPane 닫기
      if (!customerId) {
        setSelectedCustomer(null)
        setRightPaneVisible(false)
        // customers-full-detail 뷰에서는 URL 파라미터 변경하지 않음 (전체보기 대상 고객 ID 유지)
        if (activeDocumentView !== 'customers-full-detail') {
          updateURLParams({ customerId: null, documentId: null, tab: null })
        }
        return
      }

      let customer: Customer
      if (customerData) {
        customer = customerData
        setSelectedCustomer(customerData)
      } else {
        customer = await CustomerService.getCustomer(customerId)
        setSelectedCustomer(customer)
      }
      setRightPaneContentType('customer')

      // 최근 검색 고객 목록에 추가
      addRecentCustomer(customer)

      // RightPane이 숨겨져 있으면 표시
      setRightPaneVisible(true)

      // URL에 고객 ID와 탭 저장 (customers-full-detail 뷰에서는 URL 변경하지 않음)
      if (activeDocumentView !== 'customers-full-detail') {
        updateURLParams({ customerId, documentId: null, tab: initialTab || null })
      }
    },
    [updateURLParams, addRecentCustomer, activeDocumentView]
  )

  // 고객 전체 정보 페이지 열기 핸들러
  const handleOpenFullDetail = useCallback(
    (customerId: string) => {
      // 현재 전체 UI 상태 저장 (돌아가기 버튼에서 복원용)
      fullDetailPreviousUIStateRef.current = {
        view: activeDocumentView,
        customer: selectedCustomer,
        rightPaneVisible: rightPaneVisible,
        rightPaneContentType: rightPaneContentType,
      }

      // RightPane 완전히 닫기 (콘텐츠 타입도 초기화)
      setSelectedCustomer(null)
      setRightPaneContentType(null)
      setRightPaneVisible(false)

      // CustomerFullDetailView 표시
      setFullDetailCustomerId(customerId)
      setActiveDocumentView('customers-full-detail')

      // URL 업데이트 (customerId는 전체 정보 뷰용으로 유지)
      updateURLParams({ view: 'customers-full-detail', customerId, tab: null })
    },
    [
      updateURLParams,
      activeDocumentView,
      selectedCustomer,
      rightPaneVisible,
      rightPaneContentType,
      setActiveDocumentView,
      setFullDetailCustomerId,
      // 🔧 addRecentCustomer 제거 - CustomerFullDetailView에서 처리
    ]
  )

  // 고객 전체 정보 페이지 닫기 핸들러
  const handleCloseFullDetail = useCallback(() => {
    setFullDetailCustomerId(null)

    // 이전 전체 UI 상태 복원
    const prevState = fullDetailPreviousUIStateRef.current
    if (prevState) {
      setActiveDocumentView(prevState.view || 'customers-all')
      setSelectedCustomer(prevState.customer)
      setRightPaneContentType(prevState.rightPaneContentType)
      setRightPaneVisible(prevState.rightPaneVisible)
      updateURLParams({
        view: prevState.view || 'customers-all',
        customerId: prevState.customer?._id || null,
      })
      fullDetailPreviousUIStateRef.current = null
    } else {
      // 폴백: 저장된 상태가 없으면 고객 전체보기로
      setActiveDocumentView('customers-all')
      updateURLParams({ view: 'customers-all', customerId: null })
    }
  }, [updateURLParams, setActiveDocumentView, setFullDetailCustomerId])

  // 고객별 문서 탐색기(CenterPane) 열기 핸들러
  const handleExpandToExplorer = useCallback(
    (customerId: string, customerName: string) => {
      // 현재 전체 UI 상태 저장 (축소 버튼에서 복원용)
      explorerPreviousUIStateRef.current = {
        view: activeDocumentView,
        customer: selectedCustomer,
        rightPaneVisible: rightPaneVisible,
        rightPaneContentType: rightPaneContentType,
      }

      // RightPane 완전히 닫기
      setSelectedCustomer(null)
      setRightPaneContentType(null)
      setRightPaneVisible(false)

      // CustomerDocumentExplorerView 표시
      setExplorerCustomerId?.(customerId)
      setExplorerCustomerName?.(customerName)
      setActiveDocumentView('customer-document-explorer')

      updateURLParams({ view: 'customer-document-explorer', customerId, tab: null })
    },
    [
      updateURLParams,
      activeDocumentView,
      selectedCustomer,
      rightPaneVisible,
      rightPaneContentType,
      setActiveDocumentView,
      setExplorerCustomerId,
      setExplorerCustomerName,
    ]
  )

  // 고객별 문서 탐색기(CenterPane) 닫기 핸들러
  const handleCollapseExplorer = useCallback(() => {
    setExplorerCustomerId?.(null)
    setExplorerCustomerName?.(null)

    // 이전 전체 UI 상태 복원
    const prevState = explorerPreviousUIStateRef.current
    if (prevState) {
      setActiveDocumentView(prevState.view || 'customers-all')
      setSelectedCustomer(prevState.customer)
      setRightPaneContentType(prevState.rightPaneContentType)
      setRightPaneVisible(prevState.rightPaneVisible)
      updateURLParams({
        view: prevState.view || 'customers-all',
        customerId: prevState.customer?._id || null,
      })
      explorerPreviousUIStateRef.current = null
    } else {
      setActiveDocumentView('customers-all')
      updateURLParams({ view: 'customers-all', customerId: null })
    }
  }, [updateURLParams, setActiveDocumentView, setExplorerCustomerId, setExplorerCustomerName])

  // 고객 정보 새로고침 핸들러 (수정 시 사용)
  const handleCustomerRefresh = useCallback(async () => {
    if (!selectedCustomer?._id) return

    try {
      const customer = await CustomerService.getCustomer(selectedCustomer._id)
      setSelectedCustomer(customer)
      logger.debug('useRightPaneContent', '고객 상세정보 새로고침 완료')

      // 고객 전체보기도 새로고침
      if (customerAllViewRefreshRef?.current) {
        customerAllViewRefreshRef.current()
        logger.debug('useRightPaneContent', '고객 전체보기 새로고침 완료')
      }
    } catch (error) {
      logger.error('useRightPaneContent', '고객 정보 새로고침 실패', error)
      errorReporter.reportApiError(error as Error, { component: 'useRightPaneContent.handleCustomerRefresh', payload: { customerId: selectedCustomer?._id } })
    }
  }, [selectedCustomer, customerAllViewRefreshRef])

  // 고객 삭제 후 전체보기만 새로고침 핸들러 (삭제 시 사용)
  const handleCustomerDelete = useCallback(() => {
    // 고객 전체보기만 새로고침 (selectedCustomer는 이미 없음)
    if (customerAllViewRefreshRef?.current) {
      customerAllViewRefreshRef.current()
      logger.debug('useRightPaneContent', '고객 삭제 후 전체보기 새로고침 완료')
    }
  }, [customerAllViewRefreshRef])

  return {
    // 상태
    rightPaneVisible,
    rightPaneContentType,
    selectedDocument,
    selectedCustomer,
    rightPaneRefreshTrigger,

    // 핸들러
    handleDocumentClick,
    handleCustomerClick,
    handleOpenFullDetail,
    handleCloseFullDetail,
    handleExpandToExplorer,
    handleCollapseExplorer,
    handleCustomerRefresh,
    handleCustomerDelete,
    toggleRightPane,

    // Setter
    setRightPaneVisible,
    setSelectedDocument,
    setSelectedCustomer,
    setRightPaneContentType,
  }
}
