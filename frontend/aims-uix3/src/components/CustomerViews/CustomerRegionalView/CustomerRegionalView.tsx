/**
 * CustomerRegionalView Component
 * @since 1.0.0
 *
 * 고객 지역별보기 View 컴포넌트
 * Document-Controller-View 패턴 준수
 */

import React, { useEffect } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import RegionalTreeView from './RegionalTreeView'
import { useCustomersController } from '../../../controllers/useCustomersController'
import type { Customer } from '../../../entities/customer/model'
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol/SFSymbol';

interface CustomerRegionalViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 고객 클릭 핸들러 (RightPane 표시용) */
  onCustomerClick?: (customerId: string, customer: Customer) => void
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
  onCustomerClick
}) => {
  const { customers, isLoading, selectCustomer, selectedCustomer, loadCustomers } = useCustomersController()

  // View가 열릴 때 전체 고객 데이터 로딩
  useEffect(() => {
    if (visible && !isLoading) {
      // 지역별 보기는 전체 고객 데이터가 필요하므로 limit을 크게 설정
      loadCustomers({ limit: 10000, offset: 0 })
    }
  }, [visible, isLoading, loadCustomers])

  // 고객 선택 핸들러 (내부 상태 + RightPane 표시)
  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c._id === customerId)
    if (customer) {
      // 내부 선택 상태 업데이트
      selectCustomer(customer)
      // RightPane 표시 (부모 컴포넌트로 전달)
      if (onCustomerClick) {
        onCustomerClick(customerId, customer)
      }
    }
  }

  return (
    <CenterPaneView
      visible={visible}
      title="지역별 보기"
      titleIcon={<SFSymbol name="location" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="customer-regional-view"
    >
      <RegionalTreeView
        customers={customers}
        selectedCustomerId={selectedCustomer?._id || null}
        onCustomerSelect={handleCustomerSelect}
        loading={isLoading}
      />
    </CenterPaneView>
  )
}

export default CustomerRegionalView
