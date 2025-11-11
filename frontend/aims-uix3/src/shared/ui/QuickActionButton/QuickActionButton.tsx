/**
 * QuickActionButton Component
 * @since 1.0.0
 *
 * 대시보드 빠른 액션 버튼 컴포넌트
 * iOS 스타일의 정사각형 액션 버튼
 */

import React from 'react';
import './QuickActionButton.css';

export interface QuickActionButtonProps {
  /** 아이콘 */
  icon: React.ReactNode;
  /** 버튼 레이블 */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 버튼 변형 */
  variant?: 'primary' | 'secondary';
  /** 비활성화 상태 */
  disabled?: boolean;
}

/**
 * QuickActionButton React 컴포넌트
 *
 * 대시보드에서 자주 쓰는 액션을 빠르게 실행할 수 있는 버튼
 * Progressive Disclosure 원칙 준수
 *
 * @example
 * ```tsx
 * <QuickActionButton
 *   icon={<SFSymbol name="plus" />}
 *   label="문서 등록"
 *   onClick={() => navigate('/documents/register')}
 *   variant="primary"
 * />
 * ```
 */
export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  label,
  onClick,
  variant = 'secondary',
  disabled = false
}) => {
  return (
    <button
      className={`quick-action-button quick-action-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      type="button"
    >
      <div className="quick-action-button__icon">{icon}</div>
      <div className="quick-action-button__label">{label}</div>
    </button>
  );
};

export default QuickActionButton;
