/**
 * AIMS UIX-3 Customer Full Detail View
 * @since 2025-11-30
 *
 * 🍎 고객 전체 정보 페이지 (CenterPane 전용)
 * - 고객정보(기본+가족), 보험계약, 문서, Annual Report 표시
 * - RightPane 없이 CenterPane 전체 활용
 * - 완전히 새로운 컴팩트 레이아웃
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CenterPaneView } from '../../../../components/CenterPaneView/CenterPaneView'
import CustomerEditModal from '../CustomerEditModal'
import FamilyRelationshipModal from '../../components/FamilyRelationshipModal'
import CorporateRelationshipModal from '../../components/CorporateRelationshipModal'
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController'
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { Button } from '../../../../shared/ui/Button'
import { RelationshipsTab } from '../CustomerDetailView/tabs/RelationshipsTab'
import { MemosTab } from '../CustomerDetailView/tabs/MemosTab'
import { ContractsTab } from '../CustomerDetailView/tabs/ContractsTab'
import { DocumentsTab } from '../CustomerDetailView/tabs/DocumentsTab'
import { AnnualReportTab } from '../CustomerDetailView/tabs/AnnualReportTab'
import { CustomerReviewTab } from '../CustomerDetailView/tabs/CustomerReviewTab'
import { CustomerReviewApi } from '../../api/customerReviewApi'
import { useAddressArchiveController } from '../../controllers/useAddressArchiveController'
import { AddressArchiveModal } from '../../components/AddressArchiveModal'
import { DocumentContentSearchModal } from '../../components/DocumentContentSearchModal'
import { Tooltip } from '@/shared/ui/Tooltip'
import type { Customer } from '@/entities/customer/model'
import { CustomerService } from '@/services/customerService'
import { CustomerDocument } from '@/stores/CustomerDocument'
import { RelationshipService } from '@/services/relationshipService'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'
import SFSymbol, { SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from '../../../../components/SFSymbol'
import { formatDate } from '@/shared/lib/timeUtils'
import { errorReporter } from '@/shared/lib/errorReporter'
import { AddressApi } from '../../api/addressApi'
import { isRequestCancelledError, setActiveCustomer } from '@/shared/lib/api'
import './CustomerFullDetailView.css'

interface CustomerFullDetailViewProps {
  visible: boolean
  customerId: string | null
  onClose: () => void
  onCustomerDeleted?: () => void
  /** 싱글클릭: RightPane에 고객 요약보기 표시 */
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void
  /** 더블클릭: 고객 전체보기로 화면 이동 */
  onNavigateToFullDetail?: (customerId: string, customerData?: Customer) => void
  /** 메뉴 네비게이션 핸들러 (문서 검색 등) */
  onNavigate?: (menuKey: string) => void
  /** 간략 보기로 전환 (customers-all + customerId 유지) */
  onSwitchToCompactView?: (customerId: string) => void
}

export const CustomerFullDetailView: React.FC<CustomerFullDetailViewProps> = ({
  visible,
  customerId,
  onClose,
  onCustomerDeleted,
  onSelectCustomer,
  onNavigateToFullDetail,
  onNavigate,
  onSwitchToCompactView
}) => {
  // 🍎 상태 관리
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleted, setIsDeleted] = useState(false)  // 🍎 삭제된 고객 여부

  // 🍎 개발자 모드 (Ctrl+Alt+D)
  const { isDevMode } = useDevModeStore()

  // 🍎 최근 고객 목록 관리
  const { addRecentCustomer, removeRecentCustomer } = useRecentCustomersStore()

  // 🍎 모달 상태
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [isFamilyModalVisible, setIsFamilyModalVisible] = useState(false)
  const [isCorporateModalVisible, setIsCorporateModalVisible] = useState(false)
  const [annualReportRefreshTrigger, setAnnualReportRefreshTrigger] = useState(0)
  const [customerReviewRefreshTrigger, setCustomerReviewRefreshTrigger] = useState(0)

  // 🍎 더보기 토글 (휴면 처리 등 드물게 사용하는 액션 펼치기)
  const [showExtraActions, setShowExtraActions] = useState(false)

  // 🍎 개수 상태
  const [contractCount, setContractCount] = useState(0)
  const [documentCount, setDocumentCount] = useState(0)
  const [annualReportCount, setAnnualReportCount] = useState(0)
  const [customerReviewCount, setCustomerReviewCount] = useState(0)
  const [arHistoryCount, setArHistoryCount] = useState(0)
  const [crHistoryCount, setCrHistoryCount] = useState(0)

  // 🍎 계약 검색 상태
  const [contractSearchTerm, setContractSearchTerm] = useState('')

  // 🍎 문서 검색 상태
  const [documentSearchTerm, setDocumentSearchTerm] = useState('')

  // 🍎 Annual Report 검색 상태
  const [annualReportSearchTerm, setAnnualReportSearchTerm] = useState('')

  // 🍎 Customer Review 검색 상태
  const [customerReviewSearchTerm, setCustomerReviewSearchTerm] = useState('')

  // 🍎 고객 정보 탭 상태 ('info' | 'memo')
  const [customerInfoTab, setCustomerInfoTab] = useState<'info' | 'memo'>('info')

  // 🍎 보고서 탭 상태 ('annual' | 'review')
  const [reportTab, setReportTab] = useState<'annual' | 'review'>('annual')

  // 🍎 보험 이력 탭 상태 ('ar' | 'cr')
  const [historyTab, setHistoryTab] = useState<'ar' | 'cr'>('ar')

  // 🍎 문서 내용 검색 모달 상태
  const [isDocContentSearchModalOpen, setIsDocContentSearchModalOpen] = useState(false)

  // 🍎 주소 검증 상태
  const [isVerifyingAddress, setIsVerifyingAddress] = useState(false)

  // 🍎 가족 관계 추가 가능 여부
  const [canAddFamilyRelation, setCanAddFamilyRelation] = useState(false)

  // 🍎 모바일 뷰 감지 (768px 이하에서 탭 기반 레이아웃)
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768)
  const [mobileActiveSection, setMobileActiveSection] = useState<'contracts' | 'documents' | 'report' | 'memo'>('contracts')

  // 🍎 리사이즈 기본값 및 localStorage 키
  const LAYOUT_STORAGE_KEY = 'aims-customer-full-detail-layout'
  const DEFAULT_TOP_LEFT_WIDTH = 31 // 🍎 상단: 고객정보(31%) ↔ 보험계약(69%)
  const DEFAULT_BOTTOM_LEFT_WIDTH = 55 // 🍎 하단: 문서(55%) ↔ Annual Report(45%)
  const DEFAULT_TOP_ROW_FLEX = 0.81 // 🍎 상단 행이 하단보다 약간 작음

  // 🍎 localStorage에서 저장된 레이아웃 불러오기
  const getInitialLayoutValues = () => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          // 🍎 하위 호환: 기존 leftWidth가 있으면 상단/하단 모두에 적용
          topLeftWidth: parsed.topLeftWidth ?? parsed.leftWidth ?? DEFAULT_TOP_LEFT_WIDTH,
          bottomLeftWidth: parsed.bottomLeftWidth ?? parsed.leftWidth ?? DEFAULT_BOTTOM_LEFT_WIDTH,
          topRowFlex: parsed.topRowFlex ?? DEFAULT_TOP_ROW_FLEX
        }
      }
    } catch (e) {
      console.warn('[CustomerFullDetailView] localStorage 레이아웃 불러오기 실패:', e)
    }
    return {
      topLeftWidth: DEFAULT_TOP_LEFT_WIDTH,
      bottomLeftWidth: DEFAULT_BOTTOM_LEFT_WIDTH,
      topRowFlex: DEFAULT_TOP_ROW_FLEX
    }
  }

  // 🍎 리사이즈 상태 (퍼센트 기반) - localStorage에서 초기값 로드
  // 🍎 상단/하단 왼쪽 너비 독립 조절
  const [topLeftWidth, setTopLeftWidth] = useState(() => getInitialLayoutValues().topLeftWidth)
  const [bottomLeftWidth, setBottomLeftWidth] = useState(() => getInitialLayoutValues().bottomLeftWidth)
  const [topRowFlex, setTopRowFlex] = useState(() => getInitialLayoutValues().topRowFlex)

  // 🍎 레이아웃 변경 여부 확인
  const isLayoutModified =
    Math.abs(topLeftWidth - DEFAULT_TOP_LEFT_WIDTH) > 0.01 ||
    Math.abs(bottomLeftWidth - DEFAULT_BOTTOM_LEFT_WIDTH) > 0.01 ||
    Math.abs(topRowFlex - DEFAULT_TOP_ROW_FLEX) > 0.01

  // 🍎 레이아웃 리셋 핸들러 (localStorage도 삭제)
  const handleResetLayout = useCallback(() => {
    setTopLeftWidth(DEFAULT_TOP_LEFT_WIDTH)
    setBottomLeftWidth(DEFAULT_BOTTOM_LEFT_WIDTH)
    setTopRowFlex(DEFAULT_TOP_ROW_FLEX)

    // 🍎 localStorage에서 저장된 레이아웃 삭제
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
    } catch (e) {
      console.warn('[CustomerFullDetailView] localStorage 레이아웃 삭제 실패:', e)
    }
  }, [])
  const [isDragging, setIsDragging] = useState<'top-h' | 'bottom-h' | 'vertical' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevIsDragging = useRef<'top-h' | 'bottom-h' | 'vertical' | null>(null)

  // 🍎 리사이즈 값 로그 출력 및 localStorage 저장 (드래그 종료 시)
  useEffect(() => {
    if (prevIsDragging.current !== null && isDragging === null) {
      console.log('📐 [레이아웃 값]', {
        topLeftWidth: topLeftWidth.toFixed(2),
        bottomLeftWidth: bottomLeftWidth.toFixed(2),
        topRowFlex: topRowFlex.toFixed(3)
      })

      // 🍎 localStorage에 레이아웃 저장
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
          topLeftWidth,
          bottomLeftWidth,
          topRowFlex
        }))
      } catch (e) {
        console.warn('[CustomerFullDetailView] localStorage 레이아웃 저장 실패:', e)
      }
    }
    prevIsDragging.current = isDragging
  }, [isDragging, topLeftWidth, bottomLeftWidth, topRowFlex])

  const confirmController = useAppleConfirmController()

  // 🍎 주소 변경 이력 컨트롤러
  const addressArchiveController = useAddressArchiveController(customerId || '')

  // 🍎 고객 데이터 로드
  const loadCustomer = useCallback(async () => {
    if (!customerId) {
      setCustomer(null)
      setIsLoading(false)
      return
    }

    console.log('🔥🔥🔥 [CustomerFullDetailView] loadCustomer 시작 [BUILD v0.375.0]:', {
      customerId: customerId,
      customerIdLast6: customerId.slice(-6),
      timestamp: new Date().toISOString()
    })

    setIsLoading(true)
    setError(null)
    setIsDeleted(false)

    // 🔧 사용자가 실제로 고객을 선택했으므로 이전 고객의 요청 취소
    // 이 호출은 CustomerFullDetailView에서만 해야 함 (백그라운드 작업에서는 절대 호출 금지!)
    setActiveCustomer(customerId)

    try {
      const data = await CustomerService.getCustomer(customerId)
      setCustomer(data)
      addRecentCustomer(data) // 🔧 최근 검색 고객 목록에 추가
      setIsLoading(false) // 🔧 성공 시에만 로딩 종료
    } catch (err) {
      // 🔧 취소된 요청은 조용히 무시 (고객 전환 등 정상적인 상황)
      // setIsLoading(false) 호출하지 않음 - 새 고객 로딩이 진행 중이므로
      if (isRequestCancelledError(err)) {
        console.log('[CustomerFullDetailView] 요청 취소됨 (무시):', customerId)
        return
      }

      console.error('[CustomerFullDetailView] 고객 로드 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'CustomerFullDetailView.loadCustomer', payload: { customerId } })
      const errorMessage = err instanceof Error ? err.message : '고객 정보를 불러올 수 없습니다.'

      // 🍎 삭제된 고객 감지 (404 또는 "삭제되었습니다" 메시지)
      if (errorMessage.includes('404') || errorMessage.includes('삭제')) {
        setIsDeleted(true)
        setError('해당 고객은 삭제되었습니다.')
        // 🍎 최근 검색 고객 목록에서 삭제된 고객 제거
        if (customerId) {
          removeRecentCustomer(customerId)
          console.log('[CustomerFullDetailView] 삭제된 고객을 최근 목록에서 제거:', customerId)
        }
      } else {
        setError(errorMessage)
      }
      setIsLoading(false) // 🔧 실제 에러 시에만 로딩 종료
    }
    // 🔧 finally 제거 - 취소된 요청에서 setIsLoading(false)가 호출되면 안 됨
  }, [customerId, addRecentCustomer, removeRecentCustomer])

  // 🍎 초기 로드
  useEffect(() => {
    console.log('🔥🔥🔥 [CustomerFullDetailView] useEffect 트리거 [BUILD v0.375.0]:', {
      visible,
      customerId: customerId?.slice(-6),
      willLoad: !!(visible && customerId)
    })
    if (visible && customerId) {
      void loadCustomer()
    }
  }, [visible, customerId, loadCustomer])

  // 🍎 가족 관계 추가 가능 여부 확인
  useEffect(() => {
    if (!customer) return

    const checkCanAddFamilyRelation = async () => {
      // 법인 고객은 가족 추가 불가
      if (customer.insurance_info?.customer_type !== '개인') {
        setCanAddFamilyRelation(false)
        return
      }

      try {
        const allData = await RelationshipService.getAllRelationshipsWithCustomers()
        const { relationships } = allData

        // 가족 관계 네트워크 구축
        const familyNetworks = new Map<string, Set<string>>()

        relationships.forEach(relationship => {
          const category = relationship.relationship_info.relationship_category
          const fromCustomer = relationship.from_customer
          const toCustomer = relationship.related_customer

          if (category === 'family' &&
              typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === '개인' &&
              typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === '개인') {

            const fromId = fromCustomer._id
            const toId = toCustomer._id

            if (!familyNetworks.has(fromId)) {
              familyNetworks.set(fromId, new Set())
            }
            if (!familyNetworks.has(toId)) {
              familyNetworks.set(toId, new Set())
            }

            familyNetworks.get(fromId)!.add(toId)
            familyNetworks.get(toId)!.add(fromId)
          }
        })

        // 현재 고객이 가족이 없는 경우 → 가족관계 추가 가능
        if (!familyNetworks.has(customer._id)) {
          setCanAddFamilyRelation(true)
          return
        }

        // 가족대표 확인
        const myFamilyMembers = new Set<string>()
        const stack = [customer._id]
        const visited = new Set<string>()

        while (stack.length > 0) {
          const currentId = stack.pop()!
          if (visited.has(currentId)) continue

          visited.add(currentId)
          myFamilyMembers.add(currentId)

          const connections = familyNetworks.get(currentId)
          if (connections) {
            connections.forEach(connectedId => {
              if (!visited.has(connectedId)) {
                stack.push(connectedId)
              }
            })
          }
        }

        const familyRelationships = relationships.filter(rel => {
          const fromId = typeof rel.from_customer === 'string' ? rel.from_customer : rel.from_customer?._id
          const toId = typeof rel.related_customer === 'string' ? rel.related_customer : rel.related_customer?._id
          return fromId && toId && myFamilyMembers.has(fromId) && myFamilyMembers.has(toId)
        })

        let familyRepId: string | null = null
        if (familyRelationships.length > 0) {
          const relationshipWithRep = familyRelationships.find(rel => rel.family_representative)
          if (relationshipWithRep) {
            const rep = relationshipWithRep.family_representative
            familyRepId = typeof rep === 'string' ? rep : rep?._id || null
          }
        }

        setCanAddFamilyRelation(familyRepId === customer._id)
      } catch (error) {
        console.error('[CustomerFullDetailView] 가족 관계 확인 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'CustomerFullDetailView.checkCanAddFamilyRelation', payload: { customerId: customer._id } })
        setCanAddFamilyRelation(false)
      }
    }

    checkCanAddFamilyRelation()
  }, [customer])
  // 🍎 고객리뷰 count 미리 로드 (탭 선택 전에도 표시하기 위함)
  useEffect(() => {
    if (!customer?._id) return

    const loadCustomerReviewCount = async () => {
      try {
        const result = await CustomerReviewApi.getCustomerReviews(customer._id)
        if (result.success && result.data) { setCustomerReviewCount(result.data.reviews.length) }
      } catch (error) {
        console.error('[CustomerFullDetailView] 고객리뷰 count 로드 실패:', error)
      }
    }

    loadCustomerReviewCount()
  }, [customer?._id])

  // 🍎 모바일 뷰포트 감지 리스너
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 🍎 수정 핸들러
  const handleEditClick = useCallback(() => {
    setIsEditModalVisible(true)
  }, [])

  // 🍎 소프트 삭제 핸들러 (휴면 처리)
  const handleSoftDeleteClick = useCallback(async () => {
    if (!customer) return

    const confirmed = await confirmController.actions.openModal({
      title: '고객 휴면 처리',
      message: `"${customer.personal_info?.name}" 고객을 휴면 처리하시겠습니까?\n\n휴면 처리된 고객은 언제든지 휴면 해제할 수 있습니다.`,
      confirmText: '휴면 처리',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    })

    if (confirmed) {
      try {
        const document = CustomerDocument.getInstance()
        await document.deleteCustomer(customer._id)
        onCustomerDeleted?.()
        onClose()
      } catch (error) {
        await confirmController.actions.openModal({
          title: '휴면 처리 실패',
          message: error instanceof Error ? error.message : '고객 휴면 처리에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        })
      }
    }
  }, [customer, onClose, onCustomerDeleted, confirmController])

  // 🍎 영구 삭제 핸들러 (Hard Delete)
  const handlePermanentDeleteClick = useCallback(async () => {
    if (!customer) return

    const confirmed = await confirmController.actions.openModal({
      title: '영구 삭제',
      message: `"${customer.personal_info?.name}" 고객과 연결된 모든 데이터를 영구 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다.\n\n삭제될 데이터:\n- 고객 정보\n- 연결된 모든 문서\n- 연결된 모든 계약\n- 연결된 모든 관계`,
      confirmText: '영구 삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'error'
    })

    if (confirmed) {
      try {
        const document = CustomerDocument.getInstance()
        const result = await document.permanentDeleteCustomer(customer._id)

        await confirmController.actions.openModal({
          title: '영구 삭제 완료',
          message: `고객이 영구 삭제되었습니다.\n\n삭제된 데이터:\n- 관계: ${result.deletedRelationships}개\n- 계약: ${result.deletedContracts}개\n- 문서: ${result.deletedDocuments}개`,
          confirmText: '확인',
          confirmStyle: 'primary',
          showCancel: false,
          iconType: 'success'
        })

        onCustomerDeleted?.()
        onClose()
      } catch (error) {
        await confirmController.actions.openModal({
          title: '영구 삭제 실패',
          message: error instanceof Error ? error.message : '고객 영구 삭제에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        })
      }
    }
  }, [customer, onClose, onCustomerDeleted, confirmController])

  // 🍎 휴면 해제 핸들러
  const handleRestoreClick = useCallback(async () => {
    if (!customer) return

    const confirmed = await confirmController.actions.openModal({
      title: '휴면 해제',
      message: `"${customer.personal_info?.name}" 고객을 활성 상태로 변경하시겠습니까?`,
      confirmText: '휴면 해제',
      cancelText: '취소',
      confirmStyle: 'primary',
      showCancel: true,
      iconType: 'info'
    })

    if (confirmed) {
      try {
        const document = CustomerDocument.getInstance()
        await document.restoreCustomer(customer._id)

        await confirmController.actions.openModal({
          title: '휴면 해제 완료',
          message: `"${customer.personal_info?.name}" 고객이 활성 상태로 변경되었습니다.`,
          confirmText: '확인',
          confirmStyle: 'primary',
          showCancel: false,
          iconType: 'success'
        })

        onCustomerDeleted?.() // View 새로고침 트리거
        onClose()
      } catch (error) {
        await confirmController.actions.openModal({
          title: '휴면 해제 실패',
          message: error instanceof Error ? error.message : '휴면 해제에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        })
      }
    }
  }, [customer, onClose, onCustomerDeleted, confirmController])

  // 🍎 수정 성공 핸들러
  const handleSaveSuccess = useCallback(() => {
    void loadCustomer()
  }, [loadCustomer])

  // 🍎 관계 추가 성공 핸들러
  const handleRelationshipSuccess = useCallback(() => {
    void loadCustomer()
  }, [loadCustomer])

  // 🍎 주소 자동 검증 핸들러
  const handleVerifyAddress = useCallback(async () => {
    if (!customer || !customerId) return
    const address1 = customer.personal_info?.address?.address1
    if (!address1) return

    setIsVerifyingAddress(true)
    try {
      // 주소 검증 수행
      const verificationResult = await AddressApi.verifyAddress(address1)

      // 고객 정보 업데이트
      await CustomerService.updateCustomer(customerId, {
        personal_info: {
          address: {
            ...customer.personal_info?.address,
            verification_status: verificationResult
          }
        }
      })

      // 고객 정보 새로고침
      await loadCustomer()
    } catch (error) {
      console.error('[CustomerFullDetailView] 주소 검증 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'CustomerFullDetailView.handleVerifyAddress' })
    } finally {
      setIsVerifyingAddress(false)
    }
  }, [customer, customerId, loadCustomer])

  // 🍎 리사이즈 핸들러 - 수평 (상단/하단 독립 조절)
  const handleHorizontalResize = useCallback((e: React.MouseEvent, handleType: 'top-h' | 'bottom-h') => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = handleType === 'top-h' ? topLeftWidth : bottomLeftWidth
    const container = contentRef.current
    if (!container) return

    setIsDragging(handleType)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const deltaX = moveEvent.clientX - startX
      const deltaPercent = (deltaX / containerRect.width) * 100
      const newWidth = Math.max(20, Math.min(80, startWidth + deltaPercent))

      // 🍎 상단/하단 독립적으로 변경
      if (handleType === 'top-h') {
        setTopLeftWidth(newWidth)
      } else {
        setBottomLeftWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [topLeftWidth, bottomLeftWidth])

  // 🍎 리사이즈 핸들러 - 수직 (상단 행 ↔ 하단 행)
  const handleVerticalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startFlex = topRowFlex
    const container = contentRef.current
    if (!container) return

    setIsDragging('vertical')

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const deltaY = moveEvent.clientY - startY
      const deltaPercent = (deltaY / containerRect.height) * 2 // 2배로 민감도 조절
      const newFlex = Math.max(0.3, Math.min(3, startFlex + deltaPercent))
      setTopRowFlex(newFlex)
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [topRowFlex])

  // 🍎 법인 고객 여부
  const isBusinessCustomer = customer?.insurance_info?.customer_type === '법인'

  // 🍎 고객 타입 아이콘
  const getCustomerTypeIcon = () => {
    if (isBusinessCustomer) {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="customer-full-detail-icon customer-icon--corporate">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="customer-full-detail-icon customer-icon--personal">
        <circle cx="10" cy="10" r="10" opacity="0.2" />
        <circle cx="10" cy="7" r="3" />
        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
      </svg>
    )
  }

  // 🍎 렌더링 - customerId 없으면 렌더링하지 않음
  if (!visible || !customerId) return null

  return (
    <CenterPaneView
      visible={visible}
      title={customer?.personal_info?.name || '고객 정보'}
      titleIcon={customer ? getCustomerTypeIcon() : undefined}
      titleAction={
        onSwitchToCompactView && customerId ? (
          <Tooltip content="간략 보기로 전환" placement="bottom">
            <button
              type="button"
              className="view-switch-button view-switch-button--compact"
              onClick={() => onSwitchToCompactView(customerId)}
              aria-label="간략 보기"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                {/* 단일 박스 아이콘 (간략 보기) - 전체보기 사각형 하나와 동일 크기 */}
                <rect x="5" y="5" width="6" height="6" rx="1" />
              </svg>
            </button>
          </Tooltip>
        ) : undefined
      }
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
      className="customer-full-detail-view"
    >
      <div className="customer-full-detail">
        {/* 🍎 로딩 상태 */}
        {isLoading && (
          <div className="customer-full-detail__state customer-full-detail__state--loading">
            <SFSymbol
              name="arrow.clockwise"
              animation={SFSymbolAnimation.ROTATE}
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>고객 정보를 불러오는 중입니다...</span>
          </div>
        )}

        {/* 🍎 에러 상태 */}
        {error && !isLoading && (
          <div className={`customer-full-detail__state ${isDeleted ? 'customer-full-detail__state--deleted' : 'customer-full-detail__state--error'}`}>
            <SFSymbol
              name={isDeleted ? 'trash.fill' : 'exclamationmark.triangle.fill'}
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>{error}</span>
            {isDeleted ? (
              <button
                type="button"
                className="customer-full-detail__back"
                onClick={() => window.history.back()}
              >
                돌아가기
              </button>
            ) : (
              <button
                type="button"
                className="customer-full-detail__retry"
                onClick={() => void loadCustomer()}
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* 🍎 고객 데이터 표시 */}
        {customer && !isLoading && !error && (
          <>
            {/* 🍎 액션 버튼 영역 */}
            <div className="customer-full-detail__actions">
              {canAddFamilyRelation && (
                <Tooltip content="가족대표가 되어 가족 구성원을 추가합니다">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsFamilyModalVisible(true)}
                    leftIcon={<span>👥</span>}
                  >
                    가족 추가
                  </Button>
                </Tooltip>
              )}
              {isBusinessCustomer && (
                <Tooltip content="법인 관계자를 추가합니다">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsCorporateModalVisible(true)}
                    leftIcon={<span>👤</span>}
                  >
                    관계자 추가
                  </Button>
                </Tooltip>
              )}
              <Tooltip content="고객 정보(연락처,주소등)를 수정합니다">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEditClick}
                  leftIcon={<span>✏️</span>}
                >
                  정보 수정
                </Button>
              </Tooltip>
              {/* 🍎 휴면 고객 → "휴면 해제" 항상 표시 */}
              {customer.meta?.status === 'inactive' && (
                <Tooltip content="휴면 고객을 활성 상태로 변경합니다">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRestoreClick}
                    leftIcon={<span>♻️</span>}
                  >
                    휴면 해제
                  </Button>
                </Tooltip>
              )}
              {/* 🍎 "···" 토글 → 클릭하면 휴면 처리/영구 삭제 버튼이 인라인으로 펼쳐짐 */}
              <Tooltip content={showExtraActions ? '접기' : '더보기'}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExtraActions(prev => !prev)}
                  className="more-actions-toggle"
                >
                  ···
                </Button>
              </Tooltip>
              {showExtraActions && (
                <>
                  {customer.meta?.status !== 'inactive' && (
                    <Tooltip content="고객을 휴면 처리합니다 (휴면 해제 가능)">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleSoftDeleteClick}
                        leftIcon={<span>💤</span>}
                      >
                        휴면 처리
                      </Button>
                    </Tooltip>
                  )}
                  {isDevMode && (
                    <Tooltip content="고객과 연결된 모든 데이터를 영구 삭제합니다">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handlePermanentDeleteClick}
                        leftIcon={<span>🗑️</span>}
                      >
                        영구 삭제
                      </Button>
                    </Tooltip>
                  )}
                </>
              )}
              <div className="customer-full-detail__actions-spacer" />
              {/* 🍎 레이아웃 리셋 버튼 (변경 시에만 표시) */}
              {isLayoutModified && (
                <Tooltip content="레이아웃을 기본값으로 되돌립니다">
                  <button
                    type="button"
                    className="customer-full-detail__reset-layout"
                    onClick={handleResetLayout}
                    aria-label="레이아웃 초기화"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>

            {isMobileView ? (
              /* 🍎 모바일 레이아웃 - 탭 기반 단일 섹션 전체화면 */
              <div className="customer-full-detail__mobile">
                {/* 🍎 고객 정보 카드 (항상 표시) */}
                <div className="customer-full-detail__mobile-info-card">
                  <div className="customer-full-detail__mobile-info-grid">
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">이름</span>
                      <span className="mobile-info-value">{customer.personal_info?.name || '-'}</span>
                    </div>
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">유형</span>
                      <span className="mobile-info-value">
                        <span className="customer-info-grid__type-badge">{customer.insurance_info?.customer_type || '개인'}</span>
                      </span>
                    </div>
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">생년월일</span>
                      <span className="mobile-info-value">{formatDate(customer.personal_info?.birth_date)}</span>
                    </div>
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">성별</span>
                      <span className="mobile-info-value">
                        {customer.personal_info?.gender === 'M' ? '남' : customer.personal_info?.gender === 'F' ? '여' : '-'}
                      </span>
                    </div>
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">휴대폰</span>
                      <span className="mobile-info-value">{customer.personal_info?.mobile_phone || '-'}</span>
                    </div>
                    <div className="mobile-info-item">
                      <span className="mobile-info-label">이메일</span>
                      <span className="mobile-info-value">{customer.personal_info?.email || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* 🍎 섹션 탭 바 (iOS 세그먼트 컨트롤 스타일) */}
                <div className="customer-full-detail__mobile-tabs">
                  <button type="button" className={`mobile-tab ${mobileActiveSection === 'contracts' ? 'mobile-tab--active' : ''}`} onClick={() => setMobileActiveSection('contracts')}>
                    보험이력{contractCount > 0 && <span className="mobile-tab__count">{contractCount}</span>}
                  </button>
                  <button type="button" className={`mobile-tab ${mobileActiveSection === 'documents' ? 'mobile-tab--active' : ''}`} onClick={() => setMobileActiveSection('documents')}>
                    문서{documentCount > 0 && <span className="mobile-tab__count">{documentCount}</span>}
                  </button>
                  <button type="button" className={`mobile-tab ${mobileActiveSection === 'report' ? 'mobile-tab--active' : ''}`} onClick={() => setMobileActiveSection('report')}>
                    보고서{(annualReportCount + customerReviewCount) > 0 && <span className="mobile-tab__count">{annualReportCount + customerReviewCount}</span>}
                  </button>
                  <button type="button" className={`mobile-tab ${mobileActiveSection === 'memo' ? 'mobile-tab--active' : ''}`} onClick={() => setMobileActiveSection('memo')}>
                    메모
                  </button>
                </div>

                {/* 🍎 섹션 패널 (모두 렌더링, display:none 전환 - SSE 실시간 업데이트 유지) */}
                <div className="customer-full-detail__mobile-panel">
                  {/* 보험이력 섹션 */}
                  <div className={`mobile-panel-section ${mobileActiveSection === 'contracts' ? 'mobile-panel-section--active' : ''}`}>
                    <div className="mobile-panel-header">
                      <div className="history-tabs">
                        <button type="button" className={`history-tabs__tab ${historyTab === 'ar' ? 'history-tabs__tab--active' : ''}`} onClick={() => setHistoryTab('ar')}>
                          AR이력{arHistoryCount > 0 && <span className="history-tabs__count">{arHistoryCount}</span>}
                        </button>
                        <button type="button" className={`history-tabs__tab ${historyTab === 'cr' ? 'history-tabs__tab--active' : ''}`} onClick={() => setHistoryTab('cr')}>
                          변액이력{crHistoryCount > 0 && <span className="history-tabs__count">{crHistoryCount}</span>}
                        </button>
                      </div>
                      <div className="customer-full-detail__section-search">
                        <SFSymbol name="magnifyingglass" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} className="section-search-icon" decorative={true} />
                        <input type="text" value={contractSearchTerm} onChange={(e) => setContractSearchTerm(e.target.value)} placeholder="검색" className="section-search-input" />
                        {contractSearchTerm && (
                          <button type="button" className="section-search-clear" onClick={() => setContractSearchTerm('')} aria-label="지우기">
                            <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.REGULAR} decorative={true} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="customer-full-detail__section-content customer-full-detail__section-content--contracts">
                      <ContractsTab customer={customer} onContractCountChange={setContractCount} searchTerm={contractSearchTerm} onSearchChange={setContractSearchTerm} refreshTrigger={annualReportRefreshTrigger} historyTab={historyTab} onArHistoryCountChange={setArHistoryCount} onCrHistoryCountChange={setCrHistoryCount} />
                    </div>
                  </div>

                  {/* 문서 섹션 */}
                  <div className={`mobile-panel-section ${mobileActiveSection === 'documents' ? 'mobile-panel-section--active' : ''}`}>
                    <div className="mobile-panel-header">
                      <span className="mobile-panel-title">문서</span>
                      {documentCount > 0 && <span className="customer-full-detail__section-count">{documentCount}</span>}
                      <div className="customer-full-detail__section-search">
                        <SFSymbol name="magnifyingglass" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} className="section-search-icon" decorative={true} />
                        <input type="text" value={documentSearchTerm} onChange={(e) => setDocumentSearchTerm(e.target.value)} placeholder="파일명 검색" className="section-search-input" />
                        {documentSearchTerm && (
                          <button type="button" className="section-search-clear" onClick={() => setDocumentSearchTerm('')} aria-label="지우기">
                            <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.REGULAR} decorative={true} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="customer-full-detail__section-content customer-full-detail__section-content--documents">
                      <DocumentsTab customer={customer} onDocumentCountChange={setDocumentCount} onAnnualReportNeedRefresh={() => setAnnualReportRefreshTrigger(prev => prev + 1)} onCustomerReviewNeedRefresh={() => setCustomerReviewRefreshTrigger(prev => prev + 1)} searchTerm={documentSearchTerm} onSearchChange={setDocumentSearchTerm} onNavigate={onNavigate} />
                    </div>
                  </div>

                  {/* 보고서 섹션 */}
                  <div className={`mobile-panel-section ${mobileActiveSection === 'report' ? 'mobile-panel-section--active' : ''}`}>
                    <div className="mobile-panel-header">
                      <div className="report-tabs">
                        <button type="button" className={`report-tabs__tab ${reportTab === 'annual' ? 'report-tabs__tab--active' : ''}`} onClick={() => setReportTab('annual')}>
                          Annual Report{annualReportCount > 0 && <span className="report-tabs__count">{annualReportCount}</span>}
                        </button>
                        <button type="button" className={`report-tabs__tab ${reportTab === 'review' ? 'report-tabs__tab--active' : ''}`} onClick={() => setReportTab('review')}>
                          변액 리포트{customerReviewCount > 0 && <span className="report-tabs__count">{customerReviewCount}</span>}
                        </button>
                      </div>
                      <div className="customer-full-detail__section-search">
                        <SFSymbol name="magnifyingglass" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} className="section-search-icon" decorative={true} />
                        <input type="text" value={reportTab === 'annual' ? annualReportSearchTerm : customerReviewSearchTerm} onChange={(e) => reportTab === 'annual' ? setAnnualReportSearchTerm(e.target.value) : setCustomerReviewSearchTerm(e.target.value)} placeholder="검색" className="section-search-input" />
                        {(reportTab === 'annual' ? annualReportSearchTerm : customerReviewSearchTerm) && (
                          <button type="button" className="section-search-clear" onClick={() => reportTab === 'annual' ? setAnnualReportSearchTerm('') : setCustomerReviewSearchTerm('')} aria-label="지우기">
                            <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.REGULAR} decorative={true} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="customer-full-detail__section-content customer-full-detail__section-content--report">
                      <div className={`report-tab-panel ${reportTab === 'annual' ? 'report-tab-panel--active' : ''}`}>
                        <AnnualReportTab customer={customer} onAnnualReportCountChange={setAnnualReportCount} refreshTrigger={annualReportRefreshTrigger} searchTerm={annualReportSearchTerm} onSearchChange={setAnnualReportSearchTerm} />
                      </div>
                      <div className={`report-tab-panel ${reportTab === 'review' ? 'report-tab-panel--active' : ''}`}>
                        <CustomerReviewTab customer={customer} onCustomerReviewCountChange={setCustomerReviewCount} refreshTrigger={customerReviewRefreshTrigger} searchTerm={customerReviewSearchTerm} onSearchChange={setCustomerReviewSearchTerm} />
                      </div>
                    </div>
                  </div>

                  {/* 메모 섹션 */}
                  <div className={`mobile-panel-section ${mobileActiveSection === 'memo' ? 'mobile-panel-section--active' : ''}`}>
                    <div className="customer-info-memos customer-info-memos--full">
                      <MemosTab customer={customer} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            /* 🍎 데스크톱 레이아웃 - 2행 4섹션 그리드 */
            <div
              ref={contentRef}
              className={`customer-full-detail__content ${isDragging === 'top-h' || isDragging === 'bottom-h' ? 'customer-full-detail--resizing-horizontal' : ''} ${isDragging === 'vertical' ? 'customer-full-detail--resizing-vertical' : ''}`}
              style={{
                '--top-left-width': `${topLeftWidth}%`,
                '--bottom-left-width': `${bottomLeftWidth}%`,
                '--top-row-flex': topRowFlex,
                '--bottom-row-flex': 1,
              } as React.CSSProperties}
            >
              {/* 🍎 상단 행: 고객정보 | 리사이즈 핸들 | 보험계약 */}
              <div className="customer-full-detail__row customer-full-detail__row--top">
                {/* 🍎 고객 정보 섹션 */}
                <section className="customer-full-detail__section customer-full-detail__section--customer-info">
                <h2 className="customer-full-detail__section-title">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="5" r="2.5"/>
                    <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
                  </svg>
                  {/* 🍎 탭 버튼 영역 */}
                  <div className="customer-info-tabs">
                    <button
                      type="button"
                      className={`customer-info-tabs__tab ${customerInfoTab === 'info' ? 'customer-info-tabs__tab--active' : ''}`}
                      onClick={() => setCustomerInfoTab('info')}
                    >
                      고객 정보
                    </button>
                    <button
                      type="button"
                      className={`customer-info-tabs__tab ${customerInfoTab === 'memo' ? 'customer-info-tabs__tab--active' : ''}`}
                      onClick={() => setCustomerInfoTab('memo')}
                    >
                      메모
                    </button>
                  </div>
                </h2>
                <div className="customer-full-detail__section-content customer-full-detail__section-content--customer-info">
                  {/* 🍎 고객 정보 탭 콘텐츠 */}
                  {customerInfoTab === 'info' && (
                    <>
                      {/* 🍎 기본정보 그리드 (반응형 레이아웃) */}
                      <div className="customer-info-grid">
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">이름</span>
                          <span className="customer-info-grid__value">{customer.personal_info?.name || '-'}</span>
                        </div>
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">생년월일</span>
                          <span className="customer-info-grid__value">{formatDate(customer.personal_info?.birth_date)}</span>
                        </div>
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">성별</span>
                          <span className="customer-info-grid__value">
                            {customer.personal_info?.gender === 'M' ? '남' : customer.personal_info?.gender === 'F' ? '여' : '-'}
                          </span>
                        </div>
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">유형</span>
                          <span className="customer-info-grid__value">
                            <span className="customer-info-grid__type-badge">{customer.insurance_info?.customer_type || '개인'}</span>
                          </span>
                        </div>
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">휴대폰</span>
                          <span className="customer-info-grid__value">{customer.personal_info?.mobile_phone || '-'}</span>
                        </div>
                        <div className="customer-info-grid__item">
                          <span className="customer-info-grid__label">이메일</span>
                          <span className="customer-info-grid__value">{customer.personal_info?.email || '-'}</span>
                        </div>
                        <div className="customer-info-grid__item customer-info-grid__item--full">
                          <span className="customer-info-grid__label">주소</span>
                          <span className="customer-info-grid__value customer-info-grid__address">
                            {/* 주소 검증 상태 아이콘 */}
                            {customer.personal_info?.address?.address1 && (() => {
                              const status = customer.personal_info?.address?.verification_status;
                              const isPending = status !== 'verified' && status !== 'failed';
                              const tooltipText = isVerifyingAddress ? '검증 중...' : status === 'verified' ? '검증된 주소' : status === 'failed' ? '검증 실패 (클릭하여 재검증)' : '미검증 주소 (클릭하여 검증)';
                              const iconClass = status === 'verified' ? 'customer-info-grid__verified-icon--verified' : status === 'failed' ? 'customer-info-grid__verified-icon--failed' : 'customer-info-grid__verified-icon--pending';
                              const isClickable = !isVerifyingAddress && (isPending || status === 'failed');

                              const iconContent = isVerifyingAddress ? (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="customer-info-grid__verified-icon-spinner">
                                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" opacity="0.25"/>
                                  <path d="M8 1a7 7 0 017 7h-1.5A5.5 5.5 0 008 2.5V1z"/>
                                </svg>
                              ) : status === 'verified' ? (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.78 5.28l-4.5 6a.75.75 0 01-1.14.06l-2.25-2.25a.75.75 0 111.06-1.06l1.64 1.64 3.97-5.3a.75.75 0 111.22.88z"/>
                                </svg>
                              ) : status === 'failed' ? (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.53 4.47a.75.75 0 010 1.06L9.06 8l2.47 2.47a.75.75 0 11-1.06 1.06L8 9.06l-2.47 2.47a.75.75 0 01-1.06-1.06L6.94 8 4.47 5.53a.75.75 0 011.06-1.06L8 6.94l2.47-2.47a.75.75 0 011.06 0z"/>
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm-.75 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7.25a1 1 0 110-2 1 1 0 010 2z"/>
                                </svg>
                              );

                              return (
                                <Tooltip content={tooltipText}>
                                  {isClickable ? (
                                    <button
                                      type="button"
                                      className={`customer-info-grid__verified-icon ${iconClass} customer-info-grid__verified-icon--clickable`}
                                      onClick={handleVerifyAddress}
                                      aria-label={tooltipText}
                                    >
                                      {iconContent}
                                    </button>
                                  ) : (
                                    <span className={`customer-info-grid__verified-icon ${iconClass} ${isVerifyingAddress ? 'customer-info-grid__verified-icon--verifying' : ''}`}>
                                      {iconContent}
                                    </span>
                                  )}
                                </Tooltip>
                              );
                            })()}
                            <span className="customer-info-grid__address-text">
                              {customer.personal_info?.address?.postal_code && `(${customer.personal_info.address.postal_code}) `}
                              {customer.personal_info?.address?.address1 || '-'}
                              {customer.personal_info?.address?.address2 && ` ${customer.personal_info.address.address2}`}
                            </span>
                            <Tooltip content="주소 변경 이력 보기">
                              <button
                                className="customer-info-grid__history-btn"
                                onClick={addressArchiveController.open}
                                aria-label="주소 변경 이력"
                                type="button"
                              >
                                <span className="customer-info-grid__history-label">
                                  이력({addressArchiveController.addressHistory.length})
                                </span>
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="customer-info-grid__history-icon">
                                  <path d="M2 2h12v3H2V2zm0 4h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6zm3 3h6v1H5V9z"/>
                                </svg>
                              </button>
                            </Tooltip>
                          </span>
                        </div>
                      </div>
                      {/* 가족 리스트 - 구분선 없이 바로 아래 */}
                      <div className="customer-info-family-list">
                        <RelationshipsTab
                          customer={customer}
                          {...(onSelectCustomer ? { onSelectCustomer } : {})}
                          {...(onNavigateToFullDetail ? { onNavigateToFullDetail } : {})}
                        />
                      </div>
                    </>
                  )}
                  {/* 🍎 메모 탭 콘텐츠 */}
                  {customerInfoTab === 'memo' && (
                    <div className="customer-info-memos customer-info-memos--full">
                      <MemosTab customer={customer} />
                    </div>
                  )}
                </div>
              </section>

                {/* 🍎 리사이즈 핸들 - 고객정보 ↔ 보험계약 */}
                <div
                  className={`customer-full-detail__resize-handle customer-full-detail__resize-handle--horizontal customer-full-detail__resize-handle--top-h ${isDragging === 'top-h' ? 'customer-full-detail__resize-handle--dragging' : ''}`}
                  onMouseDown={(e) => handleHorizontalResize(e, 'top-h')}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="고객정보와 보험계약 사이 크기 조절"
                />

                {/* 🍎 보험 이력 섹션 (탭 구조: AR 이력, 변액 이력) */}
                <section className="customer-full-detail__section customer-full-detail__section--contracts">
                <h2 className="customer-full-detail__section-title">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="2" y="2" width="12" height="12" rx="2"/>
                    <path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                  {/* 🍎 보험 이력 탭 버튼 */}
                  <div className="history-tabs">
                    <button
                      type="button"
                      className={`history-tabs__tab ${historyTab === 'ar' ? 'history-tabs__tab--active' : ''}`}
                      onClick={() => setHistoryTab('ar')}
                    >
                      Annual Report 이력
                      {arHistoryCount > 0 && (
                        <span className="history-tabs__count">{arHistoryCount}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`history-tabs__tab ${historyTab === 'cr' ? 'history-tabs__tab--active' : ''}`}
                      onClick={() => setHistoryTab('cr')}
                    >
                      변액 리포트 이력
                      {crHistoryCount > 0 && (
                        <span className="history-tabs__count">{crHistoryCount}</span>
                      )}
                    </button>
                  </div>
                  {/* 🍎 계약 검색 */}
                  <div className="customer-full-detail__section-search">
                    <SFSymbol
                      name="magnifyingglass"
                      size={SFSymbolSize.CAPTION_2}
                      weight={SFSymbolWeight.MEDIUM}
                      className="section-search-icon"
                      decorative={true}
                    />
                    <input
                      type="text"
                      value={contractSearchTerm}
                      onChange={(e) => setContractSearchTerm(e.target.value)}
                      placeholder="상품명, 증권번호 검색"
                      className="section-search-input"
                    />
                    {contractSearchTerm && (
                      <button
                        type="button"
                        className="section-search-clear"
                        onClick={() => setContractSearchTerm('')}
                        aria-label="검색어 지우기"
                      >
                        <SFSymbol
                          name="xmark.circle.fill"
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.REGULAR}
                          decorative={true}
                        />
                      </button>
                    )}
                  </div>
                </h2>
                  <div className="customer-full-detail__section-content customer-full-detail__section-content--contracts">
                    <ContractsTab
                      customer={customer}
                      onContractCountChange={setContractCount}
                      searchTerm={contractSearchTerm}
                      onSearchChange={setContractSearchTerm}
                      refreshTrigger={annualReportRefreshTrigger}
                      historyTab={historyTab}
                      onArHistoryCountChange={setArHistoryCount}
                      onCrHistoryCountChange={setCrHistoryCount}
                    />
                  </div>
                </section>
              </div>

              {/* 🍎 리사이즈 핸들 - 상단 행 ↔ 하단 행 */}
              <div
                className={`customer-full-detail__resize-handle customer-full-detail__resize-handle--vertical ${isDragging === 'vertical' ? 'customer-full-detail__resize-handle--dragging' : ''}`}
                onMouseDown={handleVerticalResize}
                role="separator"
                aria-orientation="horizontal"
                aria-label="상단 행과 하단 행 사이 크기 조절"
              />

              {/* 🍎 하단 행: 문서 | 리사이즈 핸들 | Annual Report */}
              <div className="customer-full-detail__row customer-full-detail__row--bottom">
                {/* 🍎 문서 섹션 */}
                <section className="customer-full-detail__section customer-full-detail__section--documents">
                <h2 className="customer-full-detail__section-title">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1.5 1.5 0 011.06.44l2.415 2.414a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0112.5 15h-8A1.5 1.5 0 013 13.5v-11z"/>
                  </svg>
                  <span>문서</span>
                  {documentCount > 0 && (
                    <span className="customer-full-detail__section-count">{documentCount}</span>
                  )}
                  {/* 🍎 파일명 검색 */}
                  <div className="customer-full-detail__section-search">
                    <SFSymbol
                      name="magnifyingglass"
                      size={SFSymbolSize.CAPTION_2}
                      weight={SFSymbolWeight.MEDIUM}
                      className="section-search-icon"
                      decorative={true}
                    />
                    <input
                      type="text"
                      value={documentSearchTerm}
                      onChange={(e) => setDocumentSearchTerm(e.target.value)}
                      placeholder="파일명 검색"
                      className="section-search-input"
                    />
                    {documentSearchTerm && (
                      <button
                        type="button"
                        className="section-search-clear"
                        onClick={() => setDocumentSearchTerm('')}
                        aria-label="검색어 지우기"
                      >
                        <SFSymbol
                          name="xmark.circle.fill"
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.REGULAR}
                          decorative={true}
                        />
                      </button>
                    )}
                  </div>
                  {/* 🍎 문서 내용 검색 버튼 */}
                  <Tooltip content="문서 내용 검색">
                    <button
                      type="button"
                      className="customer-full-detail__content-search-btn"
                      onClick={() => setIsDocContentSearchModalOpen(true)}
                      aria-label="문서 내용 검색"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                      </svg>
                    </button>
                  </Tooltip>
                </h2>
                  <div className="customer-full-detail__section-content customer-full-detail__section-content--documents">
                    <DocumentsTab
                      customer={customer}
                      onDocumentCountChange={setDocumentCount}
                      onAnnualReportNeedRefresh={() => setAnnualReportRefreshTrigger(prev => prev + 1)}
                      onCustomerReviewNeedRefresh={() => setCustomerReviewRefreshTrigger(prev => prev + 1)}
                      searchTerm={documentSearchTerm}
                      onSearchChange={setDocumentSearchTerm}
                      onNavigate={onNavigate}
                    />
                  </div>
                </section>

                {/* 🍎 리사이즈 핸들 - 문서 ↔ Annual Report */}
                <div
                  className={`customer-full-detail__resize-handle customer-full-detail__resize-handle--horizontal customer-full-detail__resize-handle--bottom-h ${isDragging === 'bottom-h' ? 'customer-full-detail__resize-handle--dragging' : ''}`}
                  onMouseDown={(e) => handleHorizontalResize(e, 'bottom-h')}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="문서와 Annual Report 사이 크기 조절"
                />

                {/* 🍎 보고서 섹션 (탭 구조: 연간, 고객리뷰 등) */}
                <section className="customer-full-detail__section customer-full-detail__section--report">
                <h2 className="customer-full-detail__section-title">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="2" y="1" width="12" height="14" rx="1.5" fill="var(--color-success-overlay-bg)"/>
                    <rect x="4" y="9" width="1.5" height="4" rx="0.5" fill="var(--color-success-overlay-icon)"/>
                    <rect x="7" y="7" width="1.5" height="6" rx="0.5" fill="var(--color-success-overlay-icon)"/>
                    <rect x="10" y="5" width="1.5" height="8" rx="0.5" fill="var(--color-success-overlay-icon)"/>
                  </svg>
                  {/* 🍎 보고서 탭 버튼 */}
                  <div className="report-tabs">
                    <button
                      type="button"
                      className={`report-tabs__tab ${reportTab === 'annual' ? 'report-tabs__tab--active' : ''}`}
                      onClick={() => setReportTab('annual')}
                    >
                      Annual Report
                      {annualReportCount > 0 && (
                        <span className="report-tabs__count">{annualReportCount}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`report-tabs__tab ${reportTab === 'review' ? 'report-tabs__tab--active' : ''}`}
                      onClick={() => setReportTab('review')}
                    >
                      변액 리포트
                      {customerReviewCount > 0 && (
                        <span className="report-tabs__count">{customerReviewCount}</span>
                      )}
                    </button>
                  </div>
                  {/* 🍎 검색 (보고서 탭별) */}
                  <div className="customer-full-detail__section-search">
                    <SFSymbol
                      name="magnifyingglass"
                      size={SFSymbolSize.CAPTION_2}
                      weight={SFSymbolWeight.MEDIUM}
                      className="section-search-icon"
                      decorative={true}
                    />
                    <input
                      type="text"
                      value={reportTab === 'annual' ? annualReportSearchTerm : customerReviewSearchTerm}
                      onChange={(e) => reportTab === 'annual'
                        ? setAnnualReportSearchTerm(e.target.value)
                        : setCustomerReviewSearchTerm(e.target.value)
                      }
                      placeholder="검색"
                      className="section-search-input"
                    />
                    {(reportTab === 'annual' ? annualReportSearchTerm : customerReviewSearchTerm) && (
                      <button
                        type="button"
                        className="section-search-clear"
                        onClick={() => reportTab === 'annual'
                          ? setAnnualReportSearchTerm('')
                          : setCustomerReviewSearchTerm('')
                        }
                        aria-label="검색어 지우기"
                      >
                        <SFSymbol
                          name="xmark.circle.fill"
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.REGULAR}
                          decorative={true}
                        />
                      </button>
                    )}
                  </div>
                </h2>
                  <div className="customer-full-detail__section-content customer-full-detail__section-content--report">
                    {/* 🍎 연간 보고서 탭 - 항상 렌더링하여 SSE 실시간 업데이트 유지 */}
                    <div className={`report-tab-panel ${reportTab === 'annual' ? 'report-tab-panel--active' : ''}`}>
                      <AnnualReportTab
                        customer={customer}
                        onAnnualReportCountChange={setAnnualReportCount}
                        refreshTrigger={annualReportRefreshTrigger}
                        searchTerm={annualReportSearchTerm}
                        onSearchChange={setAnnualReportSearchTerm}
                      />
                    </div>
                    {/* 🍎 고객리뷰 탭 - 항상 렌더링하여 SSE 실시간 업데이트 유지 */}
                    <div className={`report-tab-panel ${reportTab === 'review' ? 'report-tab-panel--active' : ''}`}>
                      <CustomerReviewTab
                        customer={customer}
                        onCustomerReviewCountChange={setCustomerReviewCount}
                        refreshTrigger={customerReviewRefreshTrigger}
                        searchTerm={customerReviewSearchTerm}
                        onSearchChange={setCustomerReviewSearchTerm}
                      />
                    </div>
                  </div>
                </section>
              </div>
            </div>
            )}
          </>
        )}
      </div>

      {/* 🍎 모달들 */}
      {customer && (
        <>
          <CustomerEditModal
            visible={isEditModalVisible}
            customer={customer}
            onClose={() => setIsEditModalVisible(false)}
            onSuccess={handleSaveSuccess}
          />

          <FamilyRelationshipModal
            visible={isFamilyModalVisible}
            onCancel={() => setIsFamilyModalVisible(false)}
            customerId={customer._id}
            onSuccess={handleRelationshipSuccess}
          />

          <CorporateRelationshipModal
            visible={isCorporateModalVisible}
            onCancel={() => setIsCorporateModalVisible(false)}
            customerId={customer._id}
            onSuccess={handleRelationshipSuccess}
          />

          <AddressArchiveModal
            isOpen={addressArchiveController.isOpen}
            onClose={addressArchiveController.close}
            addressHistory={addressArchiveController.addressHistory}
            isLoading={addressArchiveController.isLoading}
            error={addressArchiveController.error}
            customerName={customer.personal_info?.name || ''}
          />

          <DocumentContentSearchModal
            isOpen={isDocContentSearchModalOpen}
            onClose={() => setIsDocContentSearchModalOpen(false)}
            customerId={customer._id}
            customerName={customer.personal_info?.name || ''}
          />
        </>
      )}

      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </CenterPaneView>
  )
}

export default CustomerFullDetailView
