/**
 * CustomerManagementView Component
 * @since 1.0.0
 *
 * 고객 관리 메인 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';

interface CustomerManagementViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * CustomerManagementView React 컴포넌트
 *
 * 고객 관리 메인 기능을 위한 View
 * 5px 마진으로 설정된 중간 간격 사용
 *
 * @example
 * ```tsx
 * <CustomerManagementView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="고객 관리"
      titleIcon={<SFSymbol name="person" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="customer-management-view"
    />
  )
}

export default CustomerManagementView
