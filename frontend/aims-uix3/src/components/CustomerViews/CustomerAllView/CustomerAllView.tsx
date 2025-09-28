/**
 * CustomerAllView Component
 * @since 1.0.0
 *
 * 고객 전체보기 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface CustomerAllViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
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
  onClose
}) => {
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
    />
  )
}

export default CustomerAllView