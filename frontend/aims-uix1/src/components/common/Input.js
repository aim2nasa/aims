/**
 * AIMS Design System - Input Component
 * 디자인 가이드라인을 준수하는 공통 입력 컴포넌트
 */

import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './Input.css';

const Input = forwardRef(({
  type = 'text',
  size = 'default',
  status = '',
  prefix = null,
  suffix = null,
  disabled = false,
  readOnly = false,
  placeholder = '',
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onPressEnter,
  className = '',
  allowClear = false,
  maxLength,
  ...props
}, ref) => {
  const [focused, setFocused] = React.useState(false);
  const [localValue, setLocalValue] = React.useState(value || defaultValue || '');

  React.useEffect(() => {
    if (value !== undefined) {
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    if (value === undefined) {
      setLocalValue(newValue);
    }
    onChange?.(e);
  };

  const handleClear = () => {
    const event = { target: { value: '' } };
    setLocalValue('');
    onChange?.(event);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onPressEnter) {
      onPressEnter(e);
    }
  };

  const wrapperClassNames = [
    'aims-input-wrapper',
    `aims-input-${size}`,
    status ? `aims-input-${status}` : '',
    focused ? 'aims-input-focused' : '',
    disabled ? 'aims-input-disabled' : '',
    className
  ].filter(Boolean).join(' ');

  const showClearButton = allowClear && localValue && !disabled && !readOnly;

  return (
    <div className={wrapperClassNames}>
      {prefix && <span className="aims-input-prefix">{prefix}</span>}
      <input
        ref={ref}
        type={type}
        className="aims-input"
        value={localValue}
        onChange={handleChange}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        maxLength={maxLength}
        {...props}
      />
      {showClearButton && (
        <button
          type="button"
          className="aims-input-clear"
          onClick={handleClear}
          tabIndex={-1}
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
          </svg>
        </button>
      )}
      {suffix && <span className="aims-input-suffix">{suffix}</span>}
    </div>
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  type: PropTypes.string,
  size: PropTypes.oneOf(['small', 'default', 'large']),
  status: PropTypes.oneOf(['', 'error', 'warning', 'success']),
  prefix: PropTypes.node,
  suffix: PropTypes.node,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  defaultValue: PropTypes.string,
  onChange: PropTypes.func,
  onBlur: PropTypes.func,
  onFocus: PropTypes.func,
  onPressEnter: PropTypes.func,
  className: PropTypes.string,
  allowClear: PropTypes.bool,
  maxLength: PropTypes.number
};

export default Input;