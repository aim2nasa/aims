/**
 * User Profile Menu Component
 * @since 1.0.0
 * @version 1.1.0
 *
 * 사용자 프로필 메뉴 - 계정 관리, 설정, 로그아웃 등
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import UserProfileHeader from './UserProfileHeader';
import UserProfileMenuItem from './UserProfileMenuItem';
import { useDevModeStore } from '../../../shared/store/useDevModeStore';
import { useAccountSettingsStore } from '../../../shared/store/useAccountSettingsStore';
import { useAuthStore } from '../../../shared/stores/authStore';
import { deleteAccount } from '../../../entities/auth/api';
import { AccountSettingsModal } from '../../../features/AccountSettings';
import { AppleConfirmModal } from '../../DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { useAppleConfirmController } from '../../../controllers/useAppleConfirmController';
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
  /** 메뉴 클릭 핸들러 (LeftPane 메뉴와 연동) */
  onMenuClick?: (menuKey: string) => void;
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
  onMenuClick
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // 개발자 모드 상태
  const { isDevMode } = useDevModeStore();

  // 인증 상태
  const { logout: authLogout, token } = useAuthStore();

  // 계정 설정 모달 상태
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

  // 계정 설정 View 상태 (Zustand store 사용)
  const { openAccountSettingsView } = useAccountSettingsStore();

  // 확인 모달 컨트롤러
  const { state: confirmState, actions: confirmActions } = useAppleConfirmController();

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
    // TODO: 계정 전환 UI 표시 (개발자 모드)
    alert('계정 전환 기능은 Header의 개발자 모드(Ctrl+Shift+D)에서 사용 가능합니다.');
    onClose();
  };

  const handleAccountSettings = () => {
    setIsAccountSettingsOpen(true);
    onClose();
  };

  const handleAdvancedSettings = () => {
    setIsAccountSettingsOpen(false);
    openAccountSettingsView();
  };

  const handleMyFiles = () => {
    if (onMenuClick) {
      onMenuClick('documents-my-files');
    }
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    const confirmed = await confirmActions.openModal({
      title: '로그아웃',
      message: '정말 로그아웃하시겠습니까?',
      confirmText: '로그아웃',
      cancelText: '취소',
      confirmStyle: 'destructive',
      iconType: 'warning'
    });
    if (confirmed) {
      // authStore 상태 초기화
      authLogout();

      // 레거시 API용 사용자 ID 제거
      localStorage.removeItem('aims-current-user-id');

      // 로그인 페이지로 이동
      navigate('/login', { replace: true });
    }
  };

  const handleDeleteAccount = async () => {
    onClose();
    const confirmed = await confirmActions.openModal({
      title: '계정 삭제',
      message: '계정을 완전히 삭제합니다.\n이 작업은 되돌릴 수 없습니다.\n정말 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      iconType: 'error'
    });
    if (confirmed && token) {
      try {
        await deleteAccount(token);

        // authStore 상태 초기화
        authLogout();

        // 레거시 API용 사용자 ID 제거
        localStorage.removeItem('aims-current-user-id');

        // 삭제 완료 알림
        await confirmActions.openModal({
          title: '삭제 완료',
          message: '계정이 삭제되었습니다.',
          confirmText: '확인',
          showCancel: false,
          iconType: 'success'
        });

        // 로그인 페이지로 이동
        navigate('/login', { replace: true });
      } catch (error) {
        console.error('계정 삭제 실패:', error);
        await confirmActions.openModal({
          title: '오류',
          message: '계정 삭제에 실패했습니다.',
          confirmText: '확인',
          showCancel: false,
          iconType: 'error'
        });
      }
    }
  };

  if (!isOpen && !isAccountSettingsOpen && !confirmState.isOpen) return null;

  const menuContent = (
    <>
      {/* 프로필 메뉴 */}
      {isOpen && (
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
            {/* 그룹 1: 빠른 네비게이션 */}
            <UserProfileMenuItem
              icon="folder"
              label="내 보관함"
              onClick={handleMyFiles}
              showDivider={true}
              iconColor="green"
            />

            {/* 그룹 2: 계정 관리 */}
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

            {/* 로그아웃 */}
            <UserProfileMenuItem
              icon="arrow.right.square"
              label="로그아웃"
              onClick={handleLogout}
              isDangerous={true}
              showDivider={isDevMode}
            />

            {/* 계정 삭제 - 개발자 모드에서만 표시 */}
            {isDevMode && (
              <UserProfileMenuItem
                icon="trash"
                label="계정 완전 삭제"
                onClick={handleDeleteAccount}
                isDangerous={true}
              />
            )}
          </div>
        </div>
      )}

      {/* 계정 설정 모달 */}
      <AccountSettingsModal
        visible={isAccountSettingsOpen}
        onClose={() => setIsAccountSettingsOpen(false)}
        onAdvancedSettingsClick={handleAdvancedSettings}
      />

      {/* 확인 모달 */}
      <AppleConfirmModal state={confirmState} actions={confirmActions} />
    </>
  );

  // Portal을 사용하여 body에 직접 렌더링
  return createPortal(menuContent, document.body);
};

export default UserProfileMenu;
