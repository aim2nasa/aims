import React from 'react';
import { Card, Space, Spin } from 'antd';
import './StandardCenterPane.css';

/**
 * 표준 CenterPane 프레임워크
 * 모든 메뉴에서 공통으로 사용할 일관된 레이아웃 구조
 */
const StandardCenterPane = ({
  // 헤더 관련 props
  title,
  extra,
  headerActions,

  // 콘텐츠 관련 props
  children,
  loading = false,
  loadingText = "데이터를 불러오는 중입니다...",

  // 푸터 관련 props
  footer,
  pagination,

  // 스타일 관련 props
  className = "",
  bodyClassName = "",

  // 레이아웃 관련 props
  showHeader = true,
  showFooter = true,

  ...props
}) => {

  // 헤더 렌더링
  const renderHeader = () => {
    if (!showHeader) return null;

    return (
      <div className="standard-center-pane-header">
        <div className="header-title-section">
          {title && <h3 className="header-title">{title}</h3>}
        </div>
        <div className="header-actions-section">
          {headerActions && (
            <Space size="middle">
              {headerActions}
            </Space>
          )}
        </div>
      </div>
    );
  };

  // 콘텐츠 렌더링
  const renderContent = () => {
    if (loading) {
      return (
        <div className="standard-center-pane-loading">
          <Spin size="large" />
          <p className="loading-text">{loadingText}</p>
        </div>
      );
    }

    return (
      <div className={`standard-center-pane-content ${bodyClassName}`}>
        {children}
      </div>
    );
  };

  // 푸터 렌더링
  const renderFooter = () => {
    if (!showFooter || (!footer && !pagination)) return null;

    return (
      <div className="standard-center-pane-footer">
        {footer && <div className="footer-content">{footer}</div>}
        {pagination && <div className="footer-pagination">{pagination}</div>}
      </div>
    );
  };

  return (
    <Card
      className={`standard-center-pane ${className}`}
      title={renderHeader()}
      extra={extra}
      bodyStyle={{
        padding: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
      {...props}
    >
      <div className="standard-center-pane-wrapper">
        {renderContent()}
        {renderFooter()}
      </div>
    </Card>
  );
};

export default StandardCenterPane;