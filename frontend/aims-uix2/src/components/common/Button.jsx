/**
 * AIMS Design System - Button Component
 * 디자인 가이드라인을 준수하는 공통 버튼 컴포넌트
 */

import React from 'react';
import PropTypes from 'prop-types';

const Button = ({
  children,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  icon = null,
  onClick,
  className = '',
  type = 'button',
  block = false,
  ...props
}) => {
  const classNames = [
    'aims-btn',
    `aims-btn-${variant}`,
    `aims-btn-${size}`,
    block ? 'aims-btn-block' : '',
    loading ? 'aims-btn-loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <span className="aims-btn-loading-icon">
          <svg className="aims-btn-spinner" viewBox="0 0 24 24">
            <circle className="aims-btn-spinner-circle" cx="12" cy="12" r="10" />
          </svg>
        </span>
      )}
      {icon && !loading && <span className="aims-btn-icon">{icon}</span>}
      <span className="aims-btn-text">{children}</span>
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'success', 'ghost', 'link', 'dashed']),
  size: PropTypes.oneOf(['small', 'default', 'large']),
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.node,
  onClick: PropTypes.func,
  className: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  block: PropTypes.bool
};

export default Button;