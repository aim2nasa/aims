/**
 * User Profile Menu Item Component
 * @since 1.0.0
 *
 * 사용자 프로필 메뉴의 개별 아이템 컴포넌트
 * Apple HIG 준수: 서브틀한 호버 효과, 명확한 액션
 */

import React from 'react';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import './UserProfileMenuItem.css';

export interface UserProfileMenuItemProps {
  /** 아이콘 이름 (SF Symbol) */
  icon: string;
  /** 메뉴 아이템 레이블 */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 위험한 액션 여부 (예: 로그아웃) */
  isDangerous?: boolean;
  /** 구분선 표시 여부 */
  showDivider?: boolean;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 아이콘 색상 (예: 'green') */
  iconColor?: 'green' | 'blue' | 'orange' | 'purple' | 'yellow';
}

/**
 * UserProfileMenuItem 컴포넌트
 *
 * Apple HIG 스타일의 메뉴 아이템
 * - 서브틀한 기본 상태
 * - 부드러운 호버 효과
 * - 명확한 아이콘 + 텍스트
 */
export const UserProfileMenuItem: React.FC<UserProfileMenuItemProps> = ({
  icon,
  label,
  onClick,
  isDangerous = false,
  showDivider = false,
  disabled = false,
  iconColor
}) => {
  const handleClick = () => {
    if (!disabled) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <>
      <button
        className={[
          'user-profile-menu-item',
          isDangerous ? 'user-profile-menu-item--danger' : '',
          disabled ? 'user-profile-menu-item--disabled' : ''
        ].filter(Boolean).join(' ')}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        role="menuitem"
        tabIndex={disabled ? -1 : 0}
      >
        <SFSymbol
          name={icon}
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.SEMIBOLD}
          decorative={true}
          className={[
            'user-profile-menu-item__icon',
            iconColor ? `user-profile-menu-item__icon--${iconColor}` : ''
          ].filter(Boolean).join(' ')}
        />
        <span className="user-profile-menu-item__label">
          {label}
        </span>
      </button>
      {showDivider && <div className="user-profile-menu-divider" role="separator" />}
    </>
  );
};

export default UserProfileMenuItem;
