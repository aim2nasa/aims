/**
 * CustomerRelationshipView Component
 * @since 1.0.0
 *
 * 고객 관계별보기 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface CustomerRelationshipViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * CustomerRelationshipView React 컴포넌트
 *
 * 고객 관계별보기 기능을 위한 View
 * 7px 마진으로 설정된 넓은 간격 사용
 *
 * @example
 * ```tsx
 * <CustomerRelationshipView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerRelationshipView: React.FC<CustomerRelationshipViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="관계별 보기"
      onClose={onClose}
      marginTop={7}
      marginBottom={7}
      marginLeft={7}
      marginRight={7}
      className="customer-relationship-view"
    />
  )
}

export default CustomerRelationshipView