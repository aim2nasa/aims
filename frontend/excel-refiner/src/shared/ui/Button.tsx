/**
 * Excel Refiner Button Component
 * aims-uix3 Button 기반 단순화 버전
 */

import React, { forwardRef } from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

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
)

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
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
      .join(' ')

    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        className={classNames}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading && <LoadingSpinner size={size} />}

        {leftIcon && !loading && (
          <span className="button__icon button__icon--left" aria-hidden="true">
            {leftIcon}
          </span>
        )}

        <span className="button__content">{children}</span>

        {rightIcon && !loading && (
          <span className="button__icon button__icon--right" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
