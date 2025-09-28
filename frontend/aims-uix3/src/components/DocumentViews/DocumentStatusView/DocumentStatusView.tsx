/**
 * DocumentStatusView Component
 * @since 1.0.0
 *
 * 문서 처리 현황 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface DocumentStatusViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentStatusView React 컴포넌트
 *
 * 문서 처리 현황 기능을 위한 View
 * 8px 마진으로 설정된 가장 넓은 간격 사용
 *
 * @example
 * ```tsx
 * <DocumentStatusView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentStatusView: React.FC<DocumentStatusViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 처리 현황"
      onClose={onClose}
      marginTop={8}
      marginBottom={8}
      marginLeft={8}
      marginRight={8}
      className="document-status-view"
    />
  )
}

export default DocumentStatusView