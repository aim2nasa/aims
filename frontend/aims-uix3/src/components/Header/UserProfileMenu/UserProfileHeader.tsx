/**
 * User Profile Header Component
 * @since 1.0.0
 *
 * 사용자 프로필 메뉴 상단의 사용자 정보 표시
 * Apple HIG 준수: 명확한 정보 계층, 시각적 일관성
 */

import React from 'react';
import './UserProfileHeader.css';

export interface UserProfileHeaderProps {
  /** 사용자 이름 */
  name: string;
  /** 사용자 이메일 */
  email: string;
  /** 프로필 이미지 URL */
  avatarUrl?: string;
}

/**
 * UserProfileHeader 컴포넌트
 *
 * 사용자 정보를 명확하게 표시
 * - 아바타 (이미지 또는 이니셜)
 * - 이름 (굵게)
 * - 이메일 (작게, 서브틀)
 */
export const UserProfileHeader: React.FC<UserProfileHeaderProps> = ({
  name,
  email,
  avatarUrl
}) => {
  const userInitial = name.charAt(0).toUpperCase();

  return (
    <div className="user-profile-header" role="banner">
      <div className="user-profile-header__avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} />
        ) : (
          <span className="user-profile-header__initial">{userInitial}</span>
        )}
      </div>
      <div className="user-profile-header__info">
        <div className="user-profile-header__name">{name}</div>
        <div className="user-profile-header__email">{email}</div>
      </div>
    </div>
  );
};

export default UserProfileHeader;
