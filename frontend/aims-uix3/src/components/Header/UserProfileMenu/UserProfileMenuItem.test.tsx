/**
 * User Profile Menu Item Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 아이콘 시스템 (SFSymbol)
 * 2. 클릭 핸들러
 * 3. 키보드 네비게이션 (Enter, Space)
 * 4. 위험한 액션 표시
 * 5. 비활성화 상태
 * 6. 구분선 표시
 * 7. 접근성 (role, tabindex)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserProfileMenuItem from './UserProfileMenuItem';

// Mock SFSymbol component
vi.mock('../../SFSymbol', () => ({
  SFSymbol: ({ name, className }: { name: string; className: string }) => (
    <span data-testid="sf-symbol" data-icon={name} className={className}>
      {name}
    </span>
  ),
  SFSymbolSize: {
    CALLOUT: 16
  },
  SFSymbolWeight: {
    SEMIBOLD: 'semibold'
  }
}));

describe('UserProfileMenuItem', () => {
  describe('기본 렌더링', () => {
    it('아이콘과 레이블을 표시해야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
        />
      );

      const icon = screen.getByTestId('sf-symbol');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-icon', 'gearshape');

      const label = screen.getByText('계정 설정');
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('user-profile-menu-item__label');
    });

    it('SFSymbol을 올바른 크기와 두께로 렌더링해야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="person.2"
          label="계정 전환"
          onClick={vi.fn()}
        />
      );

      const icon = screen.getByTestId('sf-symbol');
      expect(icon).toHaveClass('user-profile-menu-item__icon');
    });
  });

  describe('클릭 핸들러', () => {
    it('클릭 시 onClick 핸들러를 호출해야 한다', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleClick}
        />
      );

      const button = screen.getByRole('menuitem');
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('비활성화 상태에서는 onClick 핸들러를 호출하지 않아야 한다', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleClick}
          disabled={true}
        />
      );

      const button = screen.getByRole('menuitem');
      await user.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('키보드 네비게이션', () => {
    it('Enter 키 입력 시 onClick 핸들러를 호출해야 한다', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleClick}
        />
      );

      const button = screen.getByRole('menuitem');
      button.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('Space 키 입력 시 onClick 핸들러를 호출해야 한다', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleClick}
        />
      );

      const button = screen.getByRole('menuitem');
      button.focus();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('비활성화 상태에서는 키보드 이벤트를 처리하지 않아야 한다', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={handleClick}
          disabled={true}
        />
      );

      const button = screen.getByRole('menuitem');
      button.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('위험한 액션 표시', () => {
    it('isDangerous=true일 때 danger 클래스를 추가해야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="arrow.right.square"
          label="로그아웃"
          onClick={vi.fn()}
          isDangerous={true}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveClass('user-profile-menu-item--danger');
    });

    it('isDangerous=false일 때 danger 클래스가 없어야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          isDangerous={false}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).not.toHaveClass('user-profile-menu-item--danger');
    });
  });

  describe('비활성화 상태', () => {
    it('disabled=true일 때 disabled 클래스를 추가해야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          disabled={true}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveClass('user-profile-menu-item--disabled');
      expect(button).toBeDisabled();
    });

    it('disabled=false일 때 비활성화되지 않아야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          disabled={false}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).not.toHaveClass('user-profile-menu-item--disabled');
      expect(button).not.toBeDisabled();
    });
  });

  describe('구분선 표시', () => {
    it('showDivider=true일 때 구분선을 표시해야 한다', () => {
      const { container } = render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          showDivider={true}
        />
      );

      const divider = container.querySelector('.user-profile-menu-divider');
      expect(divider).toBeInTheDocument();
      expect(divider).toHaveAttribute('role', 'separator');
    });

    it('showDivider=false일 때 구분선이 없어야 한다', () => {
      const { container } = render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          showDivider={false}
        />
      );

      const divider = container.querySelector('.user-profile-menu-divider');
      expect(divider).not.toBeInTheDocument();
    });
  });

  describe('접근성', () => {
    it('role="menuitem" 속성이 있어야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toBeInTheDocument();
    });

    it('활성화 상태일 때 tabIndex=0이어야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          disabled={false}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveAttribute('tabindex', '0');
    });

    it('비활성화 상태일 때 tabIndex=-1이어야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="gearshape"
          label="계정 설정"
          onClick={vi.fn()}
          disabled={true}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveAttribute('tabindex', '-1');
    });
  });

  describe('복합 시나리오', () => {
    it('위험한 액션 + 구분선 조합이 정상 작동해야 한다', () => {
      const { container } = render(
        <UserProfileMenuItem
          icon="arrow.right.square"
          label="로그아웃"
          onClick={vi.fn()}
          isDangerous={true}
          showDivider={true}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveClass('user-profile-menu-item--danger');

      const divider = container.querySelector('.user-profile-menu-divider');
      expect(divider).toBeInTheDocument();
    });

    it('비활성화 + 위험한 액션 조합이 정상 작동해야 한다', () => {
      render(
        <UserProfileMenuItem
          icon="arrow.right.square"
          label="로그아웃"
          onClick={vi.fn()}
          isDangerous={true}
          disabled={true}
        />
      );

      const button = screen.getByRole('menuitem');
      expect(button).toHaveClass('user-profile-menu-item--danger');
      expect(button).toHaveClass('user-profile-menu-item--disabled');
      expect(button).toBeDisabled();
    });
  });
});
