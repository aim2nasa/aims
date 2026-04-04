/**
 * Breadcrumb Component
 * @since 2025-12-11
 *
 * 🍎 Apple 스타일 경로 표시 컴포넌트
 * - 현재 위치를 계층적으로 표시
 * - 클릭 시 해당 위치로 이동 가능
 */

import React from 'react';
import './Breadcrumb.css';

export interface BreadcrumbItem {
  /** 고유 키 (메뉴 키 또는 ID) */
  key: string;
  /** 표시할 라벨 */
  label: string;
  /** 클릭 가능 여부 (기본: true, 마지막 항목은 false) */
  clickable?: boolean;
}

interface BreadcrumbProps {
  /** Breadcrumb 항목 목록 */
  items: BreadcrumbItem[];
  /** 항목 클릭 핸들러 */
  onItemClick?: (key: string) => void;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Breadcrumb 컴포넌트
 *
 * @example
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { key: 'customers', label: '고객' },
 *     { key: 'customers-all', label: '전체 고객 보기' },
 *     { key: 'customer-123', label: '홍길동' }
 *   ]}
 *   onItemClick={(key) => navigate(key)}
 * />
 * ```
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  onItemClick,
  className = ''
}) => {
  if (items.length === 0) return null;

  return (
    <nav className={`breadcrumb-nav ${className}`} aria-label="경로">
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isClickable = item.clickable !== false && !isLast && onItemClick;

          return (
            <li key={item.key} className="breadcrumb-item">
              {isClickable ? (
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => onItemClick(item.key)}
                  aria-label={`${item.label}(으)로 이동`}
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={`breadcrumb-text ${isLast ? 'breadcrumb-text--current' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="breadcrumb-separator" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

