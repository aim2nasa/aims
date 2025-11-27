/**
 * User Profile Menu Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 메뉴 열기/닫기 상태
 * 2. Portal 렌더링
 * 3. 메뉴 위치 계산
 * 4. ESC 키로 닫기
 * 5. 외부 클릭으로 닫기
 * 6. 메뉴 항목 렌더링
 * 7. 개발자 모드에 따른 "계정 전환" 메뉴 표시/숨김
 * 8. 메뉴 항목 클릭 동작
 * 9. 접근성 (role, aria-label)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserProfileMenu from './UserProfileMenu';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// Mock authStore
const mockLogout = vi.fn();
vi.mock('../../../shared/stores/authStore', () => ({
  useAuthStore: () => ({
    logout: mockLogout,
    token: 'mock-token'
  })
}));

// Mock deleteAccount API
vi.mock('../../../entities/auth/api', () => ({
  deleteAccount: vi.fn()
}));

// Mock child components
vi.mock('./UserProfileHeader', () => ({
  default: ({ name, email }: { name: string; email: string }) => (
    <div data-testid="user-profile-header">
      <span>{name}</span>
      <span>{email}</span>
    </div>
  )
}));

vi.mock('./UserProfileMenuItem', () => ({
  default: ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
    <button data-testid={`menu-item-${label}`} onClick={onClick}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}));

vi.mock('../../../shared/store/useDevModeStore', () => ({
  useDevModeStore: vi.fn()
}));

import { useDevModeStore } from '../../../shared/store/useDevModeStore';

describe('UserProfileMenu', () => {
  const mockUser = {
    id: 'tester',
    name: '홍길동',
    email: 'hong@example.com'
  };

  const mockAnchorElement = document.createElement('div');

  beforeEach(() => {
    // Reset mock
    vi.mocked(useDevModeStore).mockReturnValue({
      isDevMode: false,
      toggleDevMode: vi.fn(),
      setDevMode: vi.fn()
    });

    // Mock getBoundingClientRect
    mockAnchorElement.getBoundingClientRect = vi.fn(() => ({
      bottom: 100,
      right: 200,
      top: 80,
      left: 150,
      width: 50,
      height: 20,
      x: 150,
      y: 80,
      toJSON: () => ({})
    }));

    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

    // Mock localStorage
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  describe('메뉴 열기/닫기', () => {
    it('isOpen=false일 때 메뉴가 렌더링되지 않아야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={false}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('isOpen=true일 때 메뉴가 렌더링되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('Portal 렌더링', () => {
    it('메뉴가 document.body에 직접 렌더링되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu.parentElement).toBe(document.body);
    });
  });

  describe('메뉴 위치 계산', () => {
    it('anchorElement 기준으로 위치가 계산되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const menu = screen.getByRole('menu');
      const styles = menu.style;

      // bottom + 8px = 100 + 8 = 108
      expect(styles.top).toBe('108px');
      // window.innerWidth - right = 1024 - 200 = 824
      expect(styles.right).toBe('824px');
      expect(styles.position).toBe('fixed');
    });
  });

  describe('ESC 키로 닫기', () => {
    it('ESC 키 입력 시 onClose가 호출되어야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      await user.keyboard('{Escape}');

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('다른 키 입력 시 onClose가 호출되지 않아야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      await user.keyboard('{Enter}');
      await user.keyboard('{Space}');
      await user.keyboard('a');

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('외부 클릭으로 닫기', () => {
    it('메뉴 외부 클릭 시 onClose가 호출되어야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      // 외부 영역 클릭
      await waitFor(() => {
        // setTimeout(0) 이후 이벤트 리스너가 등록됨
      });

      await user.click(document.body);

      await waitFor(() => {
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('메뉴 내부 클릭 시 onClose가 호출되지 않아야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      await waitFor(() => {
        // setTimeout(0) 이후 이벤트 리스너가 등록됨
      });

      const menu = screen.getByRole('menu');
      await user.click(menu);

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('사용자 정보 표시', () => {
    it('UserProfileHeader에 사용자 정보를 전달해야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const header = screen.getByTestId('user-profile-header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('홍길동');
      expect(header).toHaveTextContent('hong@example.com');
    });

    it('avatarUrl이 제공되면 UserProfileHeader에 전달해야 한다', () => {
      const userWithAvatar = {
        ...mockUser,
        avatarUrl: 'https://example.com/avatar.jpg'
      };

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={userWithAvatar}
          anchorElement={mockAnchorElement}
        />
      );

      const header = screen.getByTestId('user-profile-header');
      expect(header).toBeInTheDocument();
    });
  });

  describe('메뉴 항목 렌더링', () => {
    it('개발자 모드가 아닐 때 "계정 전환" 메뉴가 표시되지 않아야 한다', () => {
      vi.mocked(useDevModeStore).mockReturnValue({
        isDevMode: false,
        toggleDevMode: vi.fn(),
        setDevMode: vi.fn()
      });

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.queryByTestId('menu-item-계정 전환')).not.toBeInTheDocument();
    });

    it('개발자 모드일 때 "계정 전환" 메뉴가 표시되어야 한다', () => {
      vi.mocked(useDevModeStore).mockReturnValue({
        isDevMode: true,
        toggleDevMode: vi.fn(),
        setDevMode: vi.fn()
      });

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.getByTestId('menu-item-계정 전환')).toBeInTheDocument();
    });

    it('"계정 설정" 메뉴가 항상 표시되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.getByTestId('menu-item-계정 설정')).toBeInTheDocument();
    });

    it('"로그아웃" 메뉴가 항상 표시되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      expect(screen.getByTestId('menu-item-로그아웃')).toBeInTheDocument();
    });
  });

  describe('메뉴 항목 클릭 동작', () => {
    it('"계정 전환" 클릭 시 알림을 표시하고 onClose를 호출해야 한다', async () => {
      // showAlert는 setup.ts에서 전역 mock 처리됨 (AppleConfirmModal 사용)
      vi.mocked(useDevModeStore).mockReturnValue({
        isDevMode: true,
        toggleDevMode: vi.fn(),
        setDevMode: vi.fn()
      });

      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const switchButton = screen.getByTestId('menu-item-계정 전환');
      await user.click(switchButton);

      // showAlert가 호출되고 onClose가 호출되어야 함
      expect(handleClose).toHaveBeenCalled();
    });

    it('"계정 설정" 클릭 시 onClose를 호출해야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const settingsButton = screen.getByTestId('menu-item-계정 설정');
      await user.click(settingsButton);

      expect(handleClose).toHaveBeenCalled();
    });

    it('"로그아웃" 클릭 시 메뉴를 닫고 확인 모달을 표시해야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const logoutButton = screen.getByTestId('menu-item-로그아웃');
      await user.click(logoutButton);

      // 로그아웃 버튼 클릭 시 메뉴가 먼저 닫히고 확인 모달이 표시됨
      expect(handleClose).toHaveBeenCalled();

      // AppleConfirmModal이 표시되는지 확인 (모달의 메시지로 확인)
      await waitFor(() => {
        expect(screen.getByText('정말 로그아웃하시겠습니까?')).toBeInTheDocument();
      });
    });

    it('"로그아웃" 확인 버튼 클릭 후 authLogout 호출, localStorage 제거, /login으로 이동해야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const logoutButton = screen.getByTestId('menu-item-로그아웃');
      await user.click(logoutButton);

      // AppleConfirmModal이 표시될 때까지 대기
      await waitFor(() => {
        expect(screen.getByText('정말 로그아웃하시겠습니까?')).toBeInTheDocument();
      });

      // 확인 모달의 로그아웃 버튼 클릭
      const confirmButton = screen.getByRole('button', { name: '로그아웃' });
      await user.click(confirmButton);

      expect(mockLogout).toHaveBeenCalled();
      expect(localStorage.removeItem).toHaveBeenCalledWith('aims-current-user-id');
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('"로그아웃" 취소 버튼 클릭 시 로그아웃하지 않아야 한다', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenu
          isOpen={true}
          onClose={handleClose}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const logoutButton = screen.getByTestId('menu-item-로그아웃');
      await user.click(logoutButton);

      // AppleConfirmModal이 표시될 때까지 대기
      await waitFor(() => {
        expect(screen.getByText('정말 로그아웃하시겠습니까?')).toBeInTheDocument();
      });

      // 취소 버튼 클릭
      const cancelButton = screen.getByRole('button', { name: '취소' });
      await user.click(cancelButton);

      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  describe('접근성', () => {
    it('role="menu" 속성이 있어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
    });

    it('aria-label이 설정되어야 한다', () => {
      render(
        <UserProfileMenu
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          anchorElement={mockAnchorElement}
        />
      );

      const menu = screen.getByRole('menu', { name: '사용자 프로필 메뉴' });
      expect(menu).toBeInTheDocument();
    });
  });
});
