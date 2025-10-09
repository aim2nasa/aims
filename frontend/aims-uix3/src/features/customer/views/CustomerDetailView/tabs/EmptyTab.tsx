/**
 * AIMS UIX-3 Customer Detail - Empty Tab Placeholder
 * @since 2025-10-09
 * @version 1.0.0
 *
 * 🍎 빈 탭 플레이스홀더 컴포넌트
 * - 아직 구현되지 않은 탭 내용을 표시
 * - 애플 스타일의 서브틀한 빈 상태 표시
 */

import React from 'react';
import './EmptyTab.css';

interface EmptyTabProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export const EmptyTab: React.FC<EmptyTabProps> = ({ title, description, icon }) => {
  return (
    <div className="empty-tab">
      {icon && <div className="empty-tab__icon">{icon}</div>}
      <div className="empty-tab__title">{title}</div>
      {description && <div className="empty-tab__description">{description}</div>}
    </div>
  );
};

export default EmptyTab;
