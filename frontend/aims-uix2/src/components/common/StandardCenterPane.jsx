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
      <header className="standard-center-pane-header" role="banner">
        <div className="header-title-section">
          {title && (
            <h3 className="header-title" id="main-heading">
              {title}
            </h3>
          )}
        </div>
        <nav className="header-actions-section" role="navigation" aria-label="페이지 동작">
          {headerActions && (
            <Space size="middle">
              {headerActions}
            </Space>
          )}
        </nav>
      </header>
    );
  };

  // 콘텐츠 렌더링
  const renderContent = () => {
    if (loading) {
      return (
        <div className="standard-center-pane-loading" role="status" aria-live="polite">
          <Spin size="large" aria-hidden="true" />
          <p className="loading-text" aria-describedby="main-heading">
            {loadingText}
          </p>
        </div>
      );
    }

    return (
      <main
        className={`standard-center-pane-content ${bodyClassName}`}
        role="main"
        aria-labelledby="main-heading"
        tabIndex={-1}
      >
        {children}
      </main>
    );
  };

  // 푸터 렌더링
  const renderFooter = () => {
    if (!showFooter || (!footer && !pagination)) return null;

    return (
      <footer className="standard-center-pane-footer" role="contentinfo">
        {footer && (
          <div className="footer-content" role="complementary">
            {footer}
          </div>
        )}
        {pagination && (
          <nav className="footer-pagination" role="navigation" aria-label="페이지 네비게이션">
            {pagination}
          </nav>
        )}
      </footer>
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
      role="main"
      aria-label={title ? `${title} 콘텐츠 영역` : "메인 콘텐츠 영역"}
      {...props}
    >
      <div
        className="standard-center-pane-wrapper"
        role="region"
        aria-live="polite"
      >
        {renderContent()}
        {renderFooter()}
      </div>
    </Card>
  );
};

export default StandardCenterPane;