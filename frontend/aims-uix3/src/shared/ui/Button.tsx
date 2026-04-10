/**
 * AIMS UIX-3 Button Component
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 접근성을 준수하는 다양한 스타일의 버튼 컴포넌트
 * 조합 패턴을 사용하여 유연한 확장성 제공
 */

import React, { forwardRef } from 'react';
import './Button.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * 아이콘 사용 가이드 (이슈 #56)
 * - 기본: 텍스트 단독 권장. 아이콘 없이 의미가 충분하면 붙이지 않음
 * - 허용: 동작 유형을 보강하는 기능 아이콘 (plus, arrow.down, arrow.up.right.square, trash, arrow.clockwise 등)
 * - 금지: 사이드바 메뉴 아이콘을 CTA 장식으로 재활용 — 버튼이 네비게이션으로 오인됨
 * - destructive: 텍스트 단독 권장. "삭제" 단어만큼 강한 시그널은 없음
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 버튼의 시각적 스타일 변형 */
  variant?: ButtonVariant;

  /** 버튼의 크기 */
  size?: ButtonSize;

  /** 로딩 상태 (비활성화되며 로딩 스피너 표시) */
  loading?: boolean;

  /** 전체 너비로 확장 */
  fullWidth?: boolean;

  /** 왼쪽에 표시할 아이콘 */
  leftIcon?: React.ReactNode;

  /** 오른쪽에 표시할 아이콘 */
  rightIcon?: React.ReactNode;

  /** 자식 요소들 */
  children: React.ReactNode;
}

/**
 * Loading Spinner Component
 */
const LoadingSpinner: React.FC<{ size: ButtonSize }> = ({ size }) => (
  <svg
    className={`button__spinner button__spinner--${size}`}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="로딩 중"
  >
    <path
      d="M10 2.5a7.5 7.5 0 017.5 7.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="button__spinner-path"
    />
  </svg>
);

/**
 * Button Component
 *
 * @example
 * // 기본 버튼
 * <Button>클릭하기</Button>
 *
 * // 아이콘이 있는 버튼
 * <Button leftIcon={<PlusIcon />} variant="primary">
 *   추가하기
 * </Button>
 *
 * // 로딩 상태 버튼
 * <Button loading variant="primary">
 *   저장 중...
 * </Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'sm',
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const classNames = [
      'button',
      `button--${variant}`,
      `button--${size}`,
      fullWidth && 'button--full-width',
      loading && 'button--loading',
      disabled && 'button--disabled',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={classNames}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        {...props}
      >
        {/* Loading Spinner */}
        {loading && <LoadingSpinner size={size} />}

        {/* Left Icon */}
        {leftIcon && !loading && (
          <span className="button__icon button__icon--left" aria-hidden="true">
            {leftIcon}
          </span>
        )}

        {/* Content */}
        <span className="button__content">
          {children}
        </span>

        {/* Right Icon */}
        {rightIcon && !loading && (
          <span className="button__icon button__icon--right" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;