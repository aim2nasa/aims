/**
 * AIMS Design System - Badge Component
 * 디자인 가이드라인을 준수하는 공통 배지 컴포넌트
 */

import React from 'react';
import PropTypes from 'prop-types';

const Badge = ({
  children,
  status = 'default',
  size = 'default',
  dot = false,
  count,
  overflowCount = 99,
  showZero = false,
  className = '',
  ...props
}) => {
  // Status badge (without count)
  if (status && !children && !count) {
    const statusClassNames = [
      'aims-badge-status',
      `aims-badge-status-${status}`,
      className
    ].filter(Boolean).join(' ');

    return (
      <span className={statusClassNames} {...props}>
        <span className="aims-badge-status-dot" />
        {props.text && <span className="aims-badge-status-text">{props.text}</span>}
      </span>
    );
  }

  // Count badge
  const showCount = count !== undefined && (count > 0 || showZero);
  const displayCount = count > overflowCount ? `${overflowCount}+` : count;

  const badgeClassNames = [
    'aims-badge',
    className
  ].filter(Boolean).join(' ');

  const countClassNames = [
    'aims-badge-count',
    `aims-badge-count-${size}`,
    `aims-badge-count-${status}`,
    dot ? 'aims-badge-dot' : ''
  ].filter(Boolean).join(' ');

  if (!children) {
    return showCount || dot ? (
      <span className={countClassNames} {...props}>
        {!dot && displayCount}
      </span>
    ) : null;
  }

  return (
    <span className={badgeClassNames} {...props}>
      {children}
      {(showCount || dot) && (
        <sup className={countClassNames}>
          {!dot && displayCount}
        </sup>
      )}
    </span>
  );
};

Badge.propTypes = {
  children: PropTypes.node,
  status: PropTypes.oneOf(['default', 'success', 'processing', 'error', 'warning']),
  size: PropTypes.oneOf(['small', 'default']),
  dot: PropTypes.bool,
  count: PropTypes.number,
  overflowCount: PropTypes.number,
  showZero: PropTypes.bool,
  text: PropTypes.string,
  className: PropTypes.string
};

export default Badge;