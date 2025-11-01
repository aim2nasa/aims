/**
 * User Profile Header Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 사용자 아바타 표시 (이미지 vs 이니셜)
 * 2. 사용자 이름 표시
 * 3. 사용자 이메일 표시
 * 4. 접근성 (role, alt text)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UserProfileHeader from './UserProfileHeader';

describe('UserProfileHeader', () => {
  describe('아바타 표시', () => {
    it('avatarUrl이 제공되면 이미지를 표시해야 한다', () => {
      render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
          avatarUrl="https://example.com/avatar.jpg"
        />
      );

      const avatar = screen.getByRole('img', { name: '홍길동' });
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('avatarUrl이 없으면 이름의 첫 글자(이니셜)를 표시해야 한다', () => {
      render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const initial = screen.getByText('홍');
      expect(initial).toBeInTheDocument();
      expect(initial).toHaveClass('user-profile-header__initial');
    });

    it('이름의 첫 글자가 소문자인 경우 대문자로 변환해야 한다', () => {
      render(
        <UserProfileHeader
          name="john"
          email="john@example.com"
        />
      );

      const initial = screen.getByText('J');
      expect(initial).toBeInTheDocument();
    });

    it('이름이 한 글자인 경우에도 정상 동작해야 한다', () => {
      const { container } = render(
        <UserProfileHeader
          name="김"
          email="kim@example.com"
        />
      );

      const initial = container.querySelector('.user-profile-header__initial');
      expect(initial).toBeInTheDocument();
      expect(initial?.textContent).toBe('김');
    });
  });

  describe('사용자 정보 표시', () => {
    it('사용자 이름을 표시해야 한다', () => {
      render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const nameElement = screen.getByText('홍길동');
      expect(nameElement).toBeInTheDocument();
      expect(nameElement).toHaveClass('user-profile-header__name');
    });

    it('사용자 이메일을 표시해야 한다', () => {
      render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const emailElement = screen.getByText('hong@example.com');
      expect(emailElement).toBeInTheDocument();
      expect(emailElement).toHaveClass('user-profile-header__email');
    });

    it('긴 이름도 정상적으로 표시해야 한다', () => {
      const longName = '아주 긴 이름을 가진 사용자';
      render(
        <UserProfileHeader
          name={longName}
          email="long@example.com"
        />
      );

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('긴 이메일도 정상적으로 표시해야 한다', () => {
      const longEmail = 'very.long.email.address@example.com';
      render(
        <UserProfileHeader
          name="홍길동"
          email={longEmail}
        />
      );

      expect(screen.getByText(longEmail)).toBeInTheDocument();
    });
  });

  describe('접근성', () => {
    it('role="banner" 속성이 있어야 한다', () => {
      const { container } = render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const header = container.querySelector('[role="banner"]');
      expect(header).toBeInTheDocument();
    });

    it('아바타 이미지에 alt 텍스트가 있어야 한다', () => {
      render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
          avatarUrl="https://example.com/avatar.jpg"
        />
      );

      const avatar = screen.getByRole('img', { name: '홍길동' });
      expect(avatar).toHaveAttribute('alt', '홍길동');
    });
  });

  describe('구조와 레이아웃', () => {
    it('아바타와 정보 영역이 분리되어 있어야 한다', () => {
      const { container } = render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const avatar = container.querySelector('.user-profile-header__avatar');
      const info = container.querySelector('.user-profile-header__info');
      expect(avatar).toBeInTheDocument();
      expect(info).toBeInTheDocument();
    });

    it('정보 영역에 이름과 이메일이 포함되어야 한다', () => {
      const { container } = render(
        <UserProfileHeader
          name="홍길동"
          email="hong@example.com"
        />
      );

      const info = container.querySelector('.user-profile-header__info');
      expect(info).toContainElement(screen.getByText('홍길동'));
      expect(info).toContainElement(screen.getByText('hong@example.com'));
    });
  });
});
