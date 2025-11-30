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
import { ContractsTab } from '../CustomerDetailView/tabs/ContractsTab'
import { DocumentsTab } from '../CustomerDetailView/tabs/DocumentsTab'
import { AnnualReportTab } from '../CustomerDetailView/tabs/AnnualReportTab'
import type { Customer } from '@/entities/customer/model'
import { CustomerService } from '@/services/customerService'
import { CustomerDocument } from '@/stores/CustomerDocument'
import { RelationshipService } from '@/services/relationshipService'
import SFSymbol, { SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from '../../../../components/SFSymbol'
import './CustomerFullDetailView.css'

interface CustomerFullDetailViewProps {
  visible: boolean
  customerId: string | null
  onClose: () => void
  onCustomerDeleted?: () => void
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void
}

export const CustomerFullDetailView: React.FC<CustomerFullDetailViewProps> = ({
  visible,
  customerId,
  onClose,
  onCustomerDeleted,
  onSelectCustomer
}) => {
  // 🍎 상태 관리
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🍎 모달 상태
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [isFamilyModalVisible, setIsFamilyModalVisible] = useState(false)
  const [isCorporateModalVisible, setIsCorporateModalVisible] = useState(false)
  const [annualReportRefreshTrigger, setAnnualReportRefreshTrigger] = useState(0)

  // 🍎 개수 상태
  const [contractCount, setContractCount] = useState(0)
  const [documentCount, setDocumentCount] = useState(0)
  const [annualReportCount, setAnnualReportCount] = useState(0)

  // 🍎 가족 관계 추가 가능 여부
  const [canAddFamilyRelation, setCanAddFamilyRelation] = useState(false)

  // 🍎 리사이즈 상태 (퍼센트 기반)
  const [topLeftWidth, setTopLeftWidth] = useState(37.5) // 고객정보 폭 %
  const [bottomLeftWidth, setBottomLeftWidth] = useState(65) // 문서 폭 %
  const [topRowFlex, setTopRowFlex] = useState(1) // 상단 행 비율
  const [isDragging, setIsDragging] = useState<'top-h' | 'bottom-h' | 'vertical' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const confirmController = useAppleConfirmController()

  // 🍎 고객 데이터 로드
  const loadCustomer = useCallback(async () => {
    if (!customerId) {
      setCustomer(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await CustomerService.getCustomer(customerId)
      setCustomer(data)
    } catch (err) {
      console.error('[CustomerFullDetailView] 고객 로드 실패:', err)
      setError(err instanceof Error ? err.message : '고객 정보를 불러올 수 없습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [customerId])

  // 🍎 초기 로드
  useEffect(() => {
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
        setCanAddFamilyRelation(false)
      }
    }

    checkCanAddFamilyRelation()
  }, [customer])

  // 🍎 수정 핸들러
  const handleEditClick = useCallback(() => {
    setIsEditModalVisible(true)
  }, [])

  // 🍎 삭제 핸들러
  const handleDeleteClick = useCallback(async () => {
    if (!customer) return

    const confirmed = await confirmController.actions.openModal({
      title: '고객 삭제',
      message: `"${customer.personal_info?.name}" 고객을 삭제하시겠습니까?`,
      confirmText: '삭제',
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
          title: '삭제 실패',
          message: error instanceof Error ? error.message : '고객 삭제에 실패했습니다.',
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

  // 🍎 리사이즈 핸들러 - 수평 (상단 행: 고객정보 ↔ 보험계약)
  const handleTopHorizontalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = topLeftWidth
    const container = contentRef.current
    if (!container) return

    setIsDragging('top-h')

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const deltaX = moveEvent.clientX - startX
      const deltaPercent = (deltaX / containerRect.width) * 100
      const newWidth = Math.max(20, Math.min(80, startWidth + deltaPercent))
      setTopLeftWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [topLeftWidth])

  // 🍎 리사이즈 핸들러 - 수평 (하단 행: 문서 ↔ Annual Report)
  const handleBottomHorizontalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = bottomLeftWidth
    const container = contentRef.current
    if (!container) return

    setIsDragging('bottom-h')

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const deltaX = moveEvent.clientX - startX
      const deltaPercent = (deltaX / containerRect.width) * 100
      const newWidth = Math.max(20, Math.min(80, startWidth + deltaPercent))
      setBottomLeftWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [bottomLeftWidth])

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
          <div className="customer-full-detail__state customer-full-detail__state--error">
            <SFSymbol
              name="exclamationmark.triangle.fill"
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>{error}</span>
            <button
              type="button"
              className="customer-full-detail__retry"
              onClick={() => void loadCustomer()}
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 🍎 고객 데이터 표시 */}
        {customer && !isLoading && !error && (
          <>
            {/* 🍎 액션 버튼 영역 */}
            <div className="customer-full-detail__actions">
              {canAddFamilyRelation && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsFamilyModalVisible(true)}
                  title="가족 구성원을 추가합니다 (가족대표만 가능)"
                  leftIcon={<span>👥</span>}
                >
                  가족 추가
                </Button>
              )}
              {isBusinessCustomer && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsCorporateModalVisible(true)}
                  title="법인 관계자를 추가합니다"
                  leftIcon={<span>👤</span>}
                >
                  관계자 추가
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleEditClick}
                leftIcon={<span>✏️</span>}
              >
                정보 수정
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteClick}
                leftIcon={<span>🗑️</span>}
              >
                고객 삭제
              </Button>
              <div className="customer-full-detail__actions-spacer" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                leftIcon={<span>←</span>}
              >
                돌아가기
              </Button>
            </div>

            {/* 🍎 섹션들 - 스크롤 가능한 컨테이너 */}
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
              {/* 🍎 상단 행 - 고객정보 | 리사이즈 핸들 | 보험계약 */}
              <div className="customer-full-detail__row customer-full-detail__row--top">
                {/* 🍎 고객 정보 섹션 (기본정보 + 가족관계 통합) */}
                <section className="customer-full-detail__section customer-full-detail__section--customer-info">
                <h2 className="customer-full-detail__section-title">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="5" r="2.5"/>
                    <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
                  </svg>
                  <span>고객 정보</span>
                </h2>
                <div className="customer-full-detail__section-content customer-full-detail__section-content--customer-info">
                  {/* 🍎 기본정보 테이블 (3행 컴팩트 레이아웃) */}
                  <table className="customer-info-table customer-info-table--compact">
                    <tbody>
                      {/* Row 1: 이름, 생년월일, 성별, 유형 (모두 짧은 필드) */}
                      <tr>
                        <td className="customer-info-table__label">이름</td>
                        <td className="customer-info-table__value">{customer.personal_info?.name || '-'}</td>
                        <td className="customer-info-table__label">생년월일</td>
                        <td className="customer-info-table__value">{customer.personal_info?.birth_date || '-'}</td>
                        <td className="customer-info-table__label">성별</td>
                        <td className="customer-info-table__value">
                          {customer.personal_info?.gender === 'M' ? '남' : customer.personal_info?.gender === 'F' ? '여' : '-'}
                        </td>
                        <td className="customer-info-table__label">유형</td>
                        <td className="customer-info-table__value">
                          <span className="customer-info-table__type-badge">{customer.insurance_info?.customer_type || '개인'}</span>
                        </td>
                      </tr>
                      {/* Row 2: 휴대폰, 이메일 (중간 길이 필드) */}
                      <tr>
                        <td className="customer-info-table__label">휴대폰</td>
                        <td className="customer-info-table__value">{customer.personal_info?.mobile_phone || '-'}</td>
                        <td className="customer-info-table__label">이메일</td>
                        <td className="customer-info-table__value" colSpan={5}>{customer.personal_info?.email || '-'}</td>
                      </tr>
                      {/* Row 3: 주소 (긴 필드, 전체 행 사용) */}
                      <tr>
                        <td className="customer-info-table__label">주소</td>
                        <td className="customer-info-table__value" colSpan={7}>
                          {customer.personal_info?.address?.postal_code && `(${customer.personal_info.address.postal_code}) `}
                          {customer.personal_info?.address?.address1 || '-'}
                          {customer.personal_info?.address?.address2 && ` ${customer.personal_info.address.address2}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {/* 가족 리스트 - 구분선 없이 바로 아래 */}
                  <div className="customer-info-family-list">
                    <RelationshipsTab
                      customer={customer}
                      {...(onSelectCustomer ? { onSelectCustomer } : {})}
                    />
                  </div>
                </div>
              </section>

              {/* 🍎 리사이즈 핸들 - 고객정보 ↔ 보험계약 */}
              <div
                className={`customer-full-detail__resize-handle customer-full-detail__resize-handle--horizontal ${isDragging === 'top-h' ? 'customer-full-detail__resize-handle--dragging' : ''}`}
                onMouseDown={handleTopHorizontalResize}
                role="separator"
                aria-orientation="vertical"
                aria-label="고객정보와 보험계약 사이 크기 조절"
              />

              {/* 🍎 보험 계약 섹션 */}
              <section className="customer-full-detail__section">
                <h2 className="customer-full-detail__section-title">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="2" y="2" width="12" height="12" rx="2"/>
                    <path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                  <span>보험 계약</span>
                  {contractCount > 0 && (
                    <span className="customer-full-detail__section-count">{contractCount}</span>
                  )}
                </h2>
                <div className="customer-full-detail__section-content customer-full-detail__section-content--contracts">
                  <ContractsTab
                    customer={customer}
                    onContractCountChange={setContractCount}
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

              {/* 🍎 하단 행 - 문서 | 리사이즈 핸들 | Annual Report */}
              <div className="customer-full-detail__row customer-full-detail__row--bottom">
                {/* 🍎 문서 섹션 */}
                <section className="customer-full-detail__section">
                  <h2 className="customer-full-detail__section-title">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1.5 1.5 0 011.06.44l2.415 2.414a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0112.5 15h-8A1.5 1.5 0 013 13.5v-11z"/>
                    </svg>
                    <span>문서</span>
                    {documentCount > 0 && (
                      <span className="customer-full-detail__section-count">{documentCount}</span>
                    )}
                  </h2>
                  <div className="customer-full-detail__section-content customer-full-detail__section-content--documents">
                    <DocumentsTab
                      customer={customer}
                      onDocumentCountChange={setDocumentCount}
                      onAnnualReportNeedRefresh={() => setAnnualReportRefreshTrigger(prev => prev + 1)}
                    />
                  </div>
                </section>

                {/* 🍎 리사이즈 핸들 - 문서 ↔ Annual Report */}
                <div
                  className={`customer-full-detail__resize-handle customer-full-detail__resize-handle--horizontal ${isDragging === 'bottom-h' ? 'customer-full-detail__resize-handle--dragging' : ''}`}
                  onMouseDown={handleBottomHorizontalResize}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="문서와 Annual Report 사이 크기 조절"
                />

                {/* 🍎 Annual Report 섹션 */}
                <section className="customer-full-detail__section">
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
                    <span>Annual Report</span>
                    {annualReportCount > 0 && (
                      <span className="customer-full-detail__section-count">{annualReportCount}</span>
                    )}
                  </h2>
                  <div className="customer-full-detail__section-content customer-full-detail__section-content--annual-report">
                    <AnnualReportTab
                      customer={customer}
                      onAnnualReportCountChange={setAnnualReportCount}
                      refreshTrigger={annualReportRefreshTrigger}
                    />
                  </div>
                </section>
              </div>
            </div>
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
