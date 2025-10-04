/**
 * CustomerAllView Component
 * @since 2.0.0
 * @updated 2025-10-03
 *
 * 고객 전체보기 View 컴포넌트
 * iOS 스타일의 그리드 레이아웃 구현
 */

import React from 'react';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import { AllCustomersView, AllCustomersViewRef } from '@/features/customer/views/AllCustomersView/AllCustomersView';
import type { Customer } from '@/entities/customer/model';

interface CustomerAllViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void;
  /** 새로고침 함수를 노출하는 콜백 */
  onRefreshExpose?: (refreshFn: () => void) => void;
}

/**
 * CustomerAllView React 컴포넌트
 *
 * 고객 전체보기 기능을 위한 View
 * 4px 마진으로 설정된 일반적인 간격 사용
 *
 * @example
 * ```tsx
 * <CustomerAllView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerAllView: React.FC<CustomerAllViewProps> = ({
  visible,
  onClose,
  onCustomerClick,
  onRefreshExpose,
}) => {
  const allCustomersViewRef = React.useRef<AllCustomersViewRef | null>(null);

  // refresh 함수를 부모에게 노출
  React.useEffect(() => {
    if (onRefreshExpose && allCustomersViewRef.current?.refresh) {
      onRefreshExpose(allCustomersViewRef.current.refresh);
    }
  }, [onRefreshExpose]);

  return (
    <CenterPaneView
      visible={visible}
      title="전체보기"
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="customer-all-view"
    >
      <AllCustomersView
        ref={allCustomersViewRef}
        onCustomerClick={onCustomerClick}
      />
    </CenterPaneView>
  );
};

export default CustomerAllView;
