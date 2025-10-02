/**
 * CustomerRegistrationView Component
 * @since 1.0.0
 *
 * 고객 등록 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface CustomerRegistrationViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
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
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="고객 등록"
      onClose={onClose}
      marginTop={3}
      marginBottom={3}
      marginLeft={3}
      marginRight={3}
      className="customer-registration-view"
    />
  )
}

export default CustomerRegistrationView