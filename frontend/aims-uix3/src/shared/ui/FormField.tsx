/**
 * AIMS UIX-3 FormField Component
 * @since 2025-10-03
 * @version 1.0.0
 *
 * Label + Input 조합 컴포넌트
 * iOS Settings 스타일 폼 필드
 */

import React from 'react';
import { Input, type InputProps } from './Input';
import './FormField.css';

export interface FormFieldProps extends InputProps {
  /** 필드 라벨 */
  label: string;

  /** 필수 필드 표시 */
  required?: boolean;

  /** 도움말 텍스트 */
  helpText?: string;
}

/**
 * FormField Component
 *
 * @example
 * // 기본 폼 필드
 * <FormField label="이름" placeholder="홍길동" />
 *
 * // 필수 필드
 * <FormField label="이메일" type="email" required />
 *
 * // 에러 상태
 * <FormField
 *   label="전화번호"
 *   type="tel"
 *   error
 *   errorMessage="올바른 전화번호를 입력해주세요"
 * />
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  helpText,
  errorMessage,
  error = false,
  id,
  ...inputProps
}) => {
  const inputId = id || `form-field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const isRequired = Boolean(required);
  const hasError = Boolean(error);
  const normalizedErrorMessage = typeof errorMessage === 'string' ? errorMessage : undefined;
  const normalizedHelpText = typeof helpText === 'string' ? helpText.trim() : '';
  const shouldShowHelpText = normalizedHelpText.length > 0 && !hasError;

  return (
    <div className={`form-field${hasError ? ' form-field--error' : ''}`}>
      {/* Label */}
      <label htmlFor={inputId} className="form-field__label">
        {label}
        {isRequired && <span className="form-field__required" aria-label="필수">*</span>}
      </label>

      {/* Content */}
      <div className="form-field__content">
        {/* Input */}
        <Input
          id={inputId}
          error={hasError}
          {...(normalizedErrorMessage ? { errorMessage: normalizedErrorMessage } : {})}
          aria-required={isRequired}
          required={isRequired}
          fullWidth
          {...inputProps}
        />
      </div>

      {/* Help Text */}
      {shouldShowHelpText && (
        <span className="form-field__help-text">
          {normalizedHelpText}
        </span>
      )}
    </div>
  );
};

