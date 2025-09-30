/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 문서 검색 View 컴포넌트 (빈 페이지)
 * 모든 기능은 문서 라이브러리로 이동됨
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import './DocumentSearchView.css'

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * 빈 페이지 - 제목만 표시
 * 모든 문서 검색 기능은 문서 라이브러리로 이동
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
    >
      <div className="document-search-container">
        {/* 빈 페이지 - 모든 기능은 문서 라이브러리로 이동됨 */}
      </div>
    </CenterPaneView>
  )
}

export default DocumentSearchView