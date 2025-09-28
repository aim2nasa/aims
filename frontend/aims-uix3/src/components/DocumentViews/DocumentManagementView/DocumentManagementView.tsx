/**
 * DocumentManagementView Component
 * @since 1.0.0
 *
 * 문서 관리 메인 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface DocumentManagementViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentManagementView React 컴포넌트
 *
 * 문서 관리 메인 기능을 위한 View
 * 5px 마진으로 설정된 중간 간격 사용
 *
 * @example
 * ```tsx
 * <DocumentManagementView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentManagementView: React.FC<DocumentManagementViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 관리"
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="document-management-view"
    />
  )
}

export default DocumentManagementView