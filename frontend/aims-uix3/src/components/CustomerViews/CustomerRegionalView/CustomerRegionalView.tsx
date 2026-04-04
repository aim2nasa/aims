/**
 * CustomerRegionalView Component
 * @since 1.0.0
 *
 * 고객 지역별보기 View 컴포넌트
 * Document-Controller-View 패턴 준수
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView'
import RegionalTreeView from './RegionalTreeView'
import { useCustomerDocument } from '@/hooks/useCustomerDocument'
import type { Customer } from '../../../entities/customer/model'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Modal, Tooltip } from '@/shared/ui'

interface CustomerRegionalViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 고객 클릭 핸들러 (RightPane 표시용) */
  onCustomerClick?: (customerId: string, customer: Customer) => void
  /** RightPane에 표시 중인 선택된 고객 (App.tsx로부터 전달) */
  selectedCustomer?: Customer | null
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
  /** 고객 더블클릭 핸들러 (전체보기 이동) */
  onCustomerDoubleClick?: (customerId: string) => void
}

/**
 * CustomerRegionalView React 컴포넌트
 *
 * 고객 지역별보기 기능을 위한 Controller View
 * - useCustomersController를 통해 데이터 가져오기
 * - RegionalTreeView에 데이터 전달 (View는 렌더링만 담당)
 * - Document-Controller-View 패턴 준수
 *
 * @example
 * ```tsx
 * <CustomerRegionalView
 *   visible={isVisible}
 *   onClose={handleClose}
 *   onCustomerClick={handleCustomerClick}
 * />
 * ```
 */
export const CustomerRegionalView: React.FC<CustomerRegionalViewProps> = ({
  visible,
  onClose,
  onCustomerClick,
  selectedCustomer,
  onNavigate,
  onCustomerDoubleClick
}) => {
  // Document-View 패턴: CustomerDocument 구독
  const { customers, isLoading, loadCustomers, refresh } = useCustomerDocument()

  // 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // 고객 ID로 빠른 조회를 위한 맵
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach(customer => {
      if (customer?._id) {
        map.set(customer._id, customer)
      }
    })
    return map
  }, [customers])

  // 초기 데이터 로드 (visible일 때만)
  useEffect(() => {
    if (!visible) return
    if (import.meta.env.DEV) {
      console.log('[CustomerRegionalView] Document 구독 및 초기 데이터 로드')
    }
    loadCustomers({ limit: 10000, page: 1, status: 'all' })
  }, [visible, loadCustomers])

  // Note: customerChanged 이벤트 리스너는 불필요
  // CustomerRegionalView는 useCustomerDocument 훅을 통해 CustomerDocument를 구독하므로
  // Document가 변경되면 자동으로 업데이트됨 (Document-View 패턴)
  // 이벤트 리스너를 추가하면 중복 API 호출로 인한 경쟁 조건(race condition) 발생

  // 트리에서 고객 선택 핸들러 (RightPane 표시 안 함)
  const handleCustomerSelect = useCallback((_customerId: string) => {
    // 고객 선택만 처리, RightPane은 열지 않음
    // 선택된 고객을 트리에 표시하는 용도로만 사용
  }, [])

  // 지도에서 고객 클릭 핸들러 (RightPane 표시)
  const handleCustomerClickFromMap = useCallback((customerId: string) => {
    const customer = customerMap.get(customerId)
    if (!customer) {
      return
    }

    // App.tsx의 handleCustomerClick을 호출하여 RightPane 열기
    if (onCustomerClick) {
      onCustomerClick(customerId, customer)
    }
  }, [customerMap, onCustomerClick])

  return (
    <>
      <CenterPaneView
        visible={visible}
        title="지역별 고객 보기"
        titleIcon={<SFSymbol name="location" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
        onClose={onClose}
        marginTop={6}
        marginBottom={6}
        marginLeft={6}
        marginRight={6}
        className="customer-regional-view"
        titleAccessory={
          <Tooltip content="도움말" placement="bottom">
            <button
              type="button"
              className="help-icon-button"
              onClick={() => setHelpModalVisible(true)}
              aria-label="도움말"
            >
              <SFSymbol name="questionmark.circle" size={SFSymbolSize.BODY} weight={SFSymbolWeight.REGULAR} />
            </button>
          </Tooltip>
        }
      >
        <RegionalTreeView
          customers={customers}
          selectedCustomerId={selectedCustomer?._id || null}
          onCustomerSelect={handleCustomerSelect}
          onCustomerClickFromMap={handleCustomerClickFromMap}
          loading={isLoading}
          onRefresh={async () => {
            await refresh({ limit: 10000 })
          }}
          {...(onNavigate && { onNavigate })}
          onCustomerDoubleClick={onCustomerDoubleClick}
        />
      </CenterPaneView>

      {/* 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📍 지역별 고객 보기 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>🗺️ 지역 선택</strong></p>
            <ul>
              <li>왼쪽 트리에서 <strong>지역 클릭</strong> → 해당 지역 고객 표시</li>
              <li><strong>시/도 → 시/군/구</strong> 순으로 세부 선택</li>
              <li>숫자 = 해당 지역 <strong>고객 수</strong></li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>📋 고객 목록</strong></p>
            <ul>
              <li>고객 이름 클릭 → <strong>상세 정보</strong></li>
              <li>전화/문자 아이콘으로 <strong>바로 연락</strong></li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>💡 활용</strong></p>
            <ul>
              <li>지역별 <strong>방문 계획</strong> 수립에 활용</li>
              <li>주소 미등록 고객은 <strong>"기타"</strong>에 표시</li>
            </ul>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default CustomerRegionalView
