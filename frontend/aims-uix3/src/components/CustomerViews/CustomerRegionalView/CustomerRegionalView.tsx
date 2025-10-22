/**
 * CustomerRegionalView Component
 * @since 1.0.0
 *
 * 고객 지역별보기 View 컴포넌트
 * Document-Controller-View 패턴 준수
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import RegionalTreeView from './RegionalTreeView'
import { useCustomerDocument } from '@/hooks/useCustomerDocument'
import type { Customer } from '../../../entities/customer/model'
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';

interface CustomerRegionalViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 고객 클릭 핸들러 (RightPane 표시용) */
  onCustomerClick?: (customerId: string, customer: Customer) => void
  /** RightPane에 표시 중인 선택된 고객 (App.tsx로부터 전달) */
  selectedCustomer?: Customer | null
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
  selectedCustomer
}) => {
  // Document-View 패턴: CustomerDocument 구독
  const { customers, isLoading, loadCustomers, refresh } = useCustomerDocument()

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach(customer => {
      if (customer?._id) {
        map.set(customer._id, customer)
      }
    })
    return map
  }, [customers])

  // 초기 데이터 로드
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[CustomerRegionalView] Document 구독 및 초기 데이터 로드')
    }
    loadCustomers({ limit: 10000 })
  }, [loadCustomers])

  // customerChanged 이벤트 리스너 (고객 생성/수정/삭제 시 즉시 반영)
  useEffect(() => {
    const handleCustomerChange = async () => {
      if (import.meta.env.DEV) {
        console.log('[CustomerRegionalView] customerChanged 이벤트 수신 - 데이터 새로고침')
      }
      // refresh()로 캐시 무시하고 서버에서 최신 데이터 강제 로드
      await refresh({ limit: 10000 })
    }

    window.addEventListener('customerChanged', handleCustomerChange)
    return () => {
      window.removeEventListener('customerChanged', handleCustomerChange)
    }
  }, [refresh])

  // 고객 선택 핸들러 (RightPane 표시)
  const handleCustomerSelect = useCallback((customerId: string) => {
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
        onRefresh={async () => {
          await refresh({ limit: 10000 })
        }}
      />
    </CenterPaneView>
  )
}

export default CustomerRegionalView
