/**
 * User Profile Menu Component
 * @since 1.0.0
 *
 * 사용자 프로필 메뉴 - 계정 관리, 설정, 로그아웃 등
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import UserProfileHeader from './UserProfileHeader';
import UserProfileMenuItem from './UserProfileMenuItem';
import { useDevModeStore } from '../../../shared/store/useDevModeStore';
import './UserProfileMenu.css';

export interface UserProfileMenuProps {
  /** 메뉴 열림/닫힘 상태 */
  isOpen: boolean;
  /** 메뉴 닫기 핸들러 */
  onClose: () => void;
  /** 사용자 정보 */
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  /** 앵커 요소 (메뉴를 표시할 기준 위치) */
  anchorElement: HTMLElement | null;
  /** 테마 토글 핸들러 (선택사항) */
  onThemeToggle?: () => void;
  /** 현재 테마 (선택사항) */
  theme?: 'light' | 'dark' | 'system';
}

/**
 * UserProfileMenu 컴포넌트
 *
 * Apple HIG 스타일의 프로필 메뉴
 * - Portal을 사용한 모달 격리
 * - 키보드 네비게이션 지원
 * - 포커스 트랩
 * - ESC 키로 닫기
 */
export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  isOpen,
  onClose,
  user,
  anchorElement,
  onThemeToggle,
  theme
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // 개발자 모드 상태
  const { isDevMode } = useDevModeStore();

  // 메뉴 위치 계산
  const [position, setPosition] = React.useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // 8px 간격
        right: window.innerWidth - rect.right
      });
    }
  }, [isOpen, anchorElement]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 약간의 지연을 두고 이벤트 리스너 등록 (메뉴 열릴 때 즉시 닫히는 것 방지)
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // 메뉴 열릴 때 첫 항목에 포커스
  useEffect(() => {
    if (isOpen && firstItemRef.current) {
      firstItemRef.current.focus();
    }
  }, [isOpen]);

  // 핸들러들
  const handleSwitchAccount = () => {
    console.log('[UserProfileMenu] 계정 전환 클릭');
    // TODO: 계정 전환 UI 표시 (개발자 모드)
    alert('계정 전환 기능은 Header의 개발자 모드(Ctrl+Shift+D)에서 사용 가능합니다.');
    onClose();
  };

  const handleAccountSettings = () => {
    console.log('[UserProfileMenu] 계정 설정 클릭');
    // TODO: 계정 설정 모달 열기
    onClose();
  };

  const handleThemeToggle = () => {
    console.log('[UserProfileMenu] 테마 토글 클릭');
    if (onThemeToggle) {
      onThemeToggle();
    }
    onClose();
  };

  const handleLogout = () => {
    console.log('[UserProfileMenu] 로그아웃 클릭');
    // TODO: 로그아웃 확인 다이얼로그
    const confirmed = window.confirm('정말 로그아웃하시겠습니까?');
    if (confirmed) {
      // TODO: 실제 로그아웃 처리
      alert('로그아웃 기능은 추후 구현 예정입니다.');
    }
    onClose();
  };

  if (!isOpen) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="user-profile-menu"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        right: `${position.right}px`
      }}
      role="menu"
      aria-label="사용자 프로필 메뉴"
    >
      {/* 사용자 정보 헤더 */}
      <UserProfileHeader
        name={user.name}
        email={user.email}
        {...(user.avatarUrl && { avatarUrl: user.avatarUrl })}
      />

      {/* 메뉴 아이템들 */}
      <div className="user-profile-menu__items">
        {/* 그룹 1: 계정 관리 */}
        {isDevMode && (
          <UserProfileMenuItem
            icon="person.2"
            label="계정 전환"
            onClick={handleSwitchAccount}
          />
        )}
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleAccountSettings}
          showDivider={true}
        />

        {/* 그룹 2: 설정 */}
        <UserProfileMenuItem
          icon="moon"
          label={`테마: ${theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'}`}
          onClick={handleThemeToggle}
          showDivider={true}
        />

        {/* 그룹 3: 시스템 */}
        <UserProfileMenuItem
          icon="arrow.right.square"
          label="로그아웃"
          onClick={handleLogout}
          isDangerous={true}
        />
      </div>
    </div>
  );

  // Portal을 사용하여 body에 직접 렌더링
  return createPortal(menuContent, document.body);
};

export default UserProfileMenu;
