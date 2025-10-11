/**
 * CustomerRegistrationView Component
 * @since 2.0.0
 * @updated 2025-10-03
 *
 * 고객 등록 View 컴포넌트
 * iOS Settings 스타일의 폼 기반 구현
 */

import React from 'react';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import { CustomerRegistrationView as RegistrationForm } from '@/features/customer/views/CustomerRegistrationView/CustomerRegistrationView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';

interface CustomerRegistrationViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
}

/**
 * CustomerRegistrationView React 컴포넌트
 *
 * 고객 등록 기능을 위한 View
 * 3px 마진으로 설정된 좁은 간격 사용
 *
 * @example
 * ```tsx
 * <CustomerRegistrationView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerRegistrationView: React.FC<CustomerRegistrationViewProps> = ({
  visible,
  onClose,
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="고객 등록"
      titleIcon={<SFSymbol name="person-fill-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={3}
      marginBottom={3}
      marginLeft={3}
      marginRight={3}
      className="customer-registration-view"
    >
      <RegistrationForm />
    </CenterPaneView>
  );
};

export default CustomerRegistrationView;
