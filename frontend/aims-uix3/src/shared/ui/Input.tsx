/**
 * AIMS UIX-3 Input Component
 * @since 2025-10-03
 * @version 1.0.0
 *
 * iOS Settings 스타일의 입력 필드 컴포넌트
 * 접근성과 사용성을 고려한 디자인
 */

import React, { forwardRef, useId } from 'react';
import './Input.css';

export type InputType = 'text' | 'email' | 'tel' | 'date' | 'number' | 'password';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** 입력 필드 타입 */
  type?: InputType;

  /** 에러 상태 */
  error?: boolean;

  /** 에러 메시지 */
  errorMessage?: string;

  /** 전체 너비로 확장 */
  fullWidth?: boolean;

  /** 좌측 아이콘 */
  leftIcon?: React.ReactNode;

  /** 우측 아이콘 */
  rightIcon?: React.ReactNode;
}

/**
 * Input Component
 *
 * @example
 * // 기본 입력
 * <Input placeholder="이름을 입력하세요" />
 *
 * // 에러 상태
 * <Input error errorMessage="올바른 이메일을 입력해주세요" />
 *
 * // 아이콘 포함
 * <Input leftIcon={<SearchIcon />} placeholder="검색..." />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type = 'text',
      error = false,
      errorMessage,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const errorId = useId()

    const wrapperClasses = [
      'input-wrapper',
      fullWidth && 'input-wrapper--full-width',
      error && 'input-wrapper--error',
      disabled && 'input-wrapper--disabled',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClasses = [
      'input',
      leftIcon && 'input--with-left-icon',
      rightIcon && 'input--with-right-icon',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        <div className="input-container">
          {/* Left Icon */}
          {leftIcon && (
            <span className="input-icon input-icon--left" aria-hidden="true">
              {leftIcon}
            </span>
          )}

          {/* Input Field */}
          <input
            ref={ref}
            type={type}
            className={inputClasses}
            disabled={disabled}
            aria-invalid={error}
            aria-describedby={error && errorMessage ? errorId : undefined}
            {...props}
          />

          {/* Right Icon */}
          {rightIcon && (
            <span className="input-icon input-icon--right" aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </div>

        {/* Error Message */}
        {error && errorMessage && (
          <span id={errorId} className="input-error-message" role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

