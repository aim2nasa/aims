import React from 'react';
import './HamburgerButton.css';

interface HamburgerButtonProps {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
  'aria-label'?: string;
}

const HamburgerButton: React.FC<HamburgerButtonProps> = ({
  collapsed,
  onClick,
  className = '',
  'aria-label': ariaLabel
}) => {
  return (
    <button
      className={`hamburger-button ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel || (collapsed ? '메뉴 펼치기' : '메뉴 접기')}
      title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
    >
      {collapsed ? (
        // MenuUnfoldOutlined 스타일 SVG (메뉴 펼치기)
        <svg
          width="14"
          height="14"
          viewBox="0 0 1024 1024"
          fill="currentColor"
          className="hamburger-icon"
        >
          <path d="M408 442h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8zm-8 204c0 4.4 3.6 8 8 8h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56zm504-486H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zm0 632H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zM115.4 518.9L96 500.4c-3.1-3.1-8.2-3.1-11.3 0L30.4 554.7c-3.1 3.1-3.1 8.2 0 11.3l54.3 54.3c3.1 3.1 8.2 3.1 11.3 0l19.4-18.5c3.1-3.1 3.1-8.2 0-11.3L93 568.2l22.4-22.4c3.1-3.1 3.1-8.2 0-11.3zM355.9 505.1l-19.4 18.5c-3.1 3.1-3.1 8.2 0 11.3L359 557.3l-22.4 22.4c-3.1 3.1-3.1 8.2 0 11.3l19.4 18.5c3.1 3.1 8.2 3.1 11.3 0L421.6 555c3.1-3.1 3.1-8.2 0-11.3l-54.3-54.3c-3.1-3.1-8.2-3.1-11.4-0.3z" />
        </svg>
      ) : (
        // MenuFoldOutlined 스타일 SVG (메뉴 접기)
        <svg
          width="14"
          height="14"
          viewBox="0 0 1024 1024"
          fill="currentColor"
          className="hamburger-icon"
        >
          <path d="M408 442h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8zm-8 204c0 4.4 3.6 8 8 8h480c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H408c-4.4 0-8 3.6-8 8v56zm504-486H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zm0 632H120c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zM142.4 642.1L96 688.5c-3.1 3.1-8.2 3.1-11.3 0l-54.3-54.3c-3.1-3.1-3.1-8.2 0-11.3L84.7 569c3.1-3.1 8.2-3.1 11.3 0l46.4 46.4c3.1 3.1 3.1 8.2 0 11.3l-22.4 22.4 22.4 22.4c3.1 3.1 3.1 8.1 0 11.2zM395.7 701.8L349.3 655.4c-3.1-3.1-3.1-8.2 0-11.3L371.7 622l-22.4-22.4c-3.1-3.1-3.1-8.2 0-11.3l46.4-46.4c3.1-3.1 8.2-3.1 11.3 0l54.3 54.3c3.1 3.1 3.1 8.2 0 11.3L407 661.8c-3.1 3.1-8.2 3.1-11.3 0z" />
        </svg>
      )}
    </button>
  );
};

export default HamburgerButton;