/**
 * AIMS Design System - Card Component
 * 디자인 가이드라인을 준수하는 공통 카드 컴포넌트
 */

import React from 'react';
import PropTypes from 'prop-types';

const Card = ({
  children,
  title = '',
  extra = null,
  bordered = true,
  hoverable = false,
  loading = false,
  size = 'default',
  className = '',
  bodyClassName = '',
  style = {},
  onClick,
  ...props
}) => {
  const cardClassNames = [
    'aims-card',
    bordered ? 'aims-card-bordered' : '',
    hoverable ? 'aims-card-hoverable' : '',
    loading ? 'aims-card-loading' : '',
    `aims-card-${size}`,
    className
  ].filter(Boolean).join(' ');

  const bodyClassNames = [
    'aims-card-body',
    bodyClassName
  ].filter(Boolean).join(' ');

  const handleClick = onClick ? () => onClick() : undefined;

  return (
    <div 
      className={cardClassNames} 
      style={style}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {(title || extra) && (
        <div className="aims-card-header">
          {title && <div className="aims-card-title">{title}</div>}
          {extra && <div className="aims-card-extra">{extra}</div>}
        </div>
      )}
      <div className={bodyClassNames}>
        {loading ? (
          <div className="aims-card-loading-content">
            <div className="aims-card-loading-block" />
            <div className="aims-card-loading-block" />
            <div className="aims-card-loading-block" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

Card.propTypes = {
  children: PropTypes.node,
  title: PropTypes.node,
  extra: PropTypes.node,
  bordered: PropTypes.bool,
  hoverable: PropTypes.bool,
  loading: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'default', 'large']),
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
  style: PropTypes.object,
  onClick: PropTypes.func
};

export default Card;