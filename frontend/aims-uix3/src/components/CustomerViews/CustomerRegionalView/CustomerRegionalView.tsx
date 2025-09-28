/**
 * CustomerRegionalView Component
 * @since 1.0.0
 *
 * 고객 지역별보기 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import BaseDocumentView from '../../DocumentViews/BaseDocumentView/BaseDocumentView'

interface CustomerRegionalViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * CustomerRegionalView React 컴포넌트
 *
 * 고객 지역별보기 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 *
 * @example
 * ```tsx
 * <CustomerRegionalView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerRegionalView: React.FC<CustomerRegionalViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <BaseDocumentView
      visible={visible}
      title="지역별 보기"
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="customer-regional-view"
    />
  )
}

export default CustomerRegionalView