/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 문서 검색 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * 문서 검색 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 *
 * @example
 * ```tsx
 * <DocumentSearchView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentSearchView: React.FC<DocumentSearchViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 검색"
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-search-view"
    />
  )
}

export default DocumentSearchView