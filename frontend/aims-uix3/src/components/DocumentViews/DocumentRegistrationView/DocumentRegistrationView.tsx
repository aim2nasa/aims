/**
 * DocumentRegistrationView Component
 * @since 1.0.0
 *
 * 문서 등록 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface DocumentRegistrationViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentRegistrationView React 컴포넌트
 *
 * 문서 등록 기능을 위한 View
 * 4px 마진으로 설정된 일반적인 간격 사용
 *
 * @example
 * ```tsx
 * <DocumentRegistrationView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentRegistrationView: React.FC<DocumentRegistrationViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 등록"
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="document-registration-view"
    />
  )
}

export default DocumentRegistrationView