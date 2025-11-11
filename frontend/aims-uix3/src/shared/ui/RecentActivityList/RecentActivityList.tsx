/**
 * RecentActivityList Component
 * @since 1.0.0
 *
 * 최근 활동 목록 표시 컴포넌트
 * iOS 스타일의 리스트 형태
 */

import React from 'react';
import { getRelativeTimeString } from '@/shared/utils/timeUtils';
import './RecentActivityList.css';

export interface RecentActivityItem {
  /** 고유 ID */
  id: string;
  /** 제목 */
  title: string | React.ReactNode;
  /** 부제목 (선택) */
  subtitle?: string;
  /** 타임스탬프 */
  timestamp: Date | string;
  /** 아이콘 (선택) */
  icon?: React.ReactNode;
  /** 클릭 핸들러 */
  onClick?: () => void;
}

export interface RecentActivityListProps {
  /** 활동 아이템 목록 */
  items: RecentActivityItem[];
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /** 최대 표시 개수 */
  maxItems?: number;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 에러 메시지 */
  error?: string;
}

/**
 * RecentActivityList React 컴포넌트
 *
 * 최근 활동 내역을 iOS 스타일 리스트로 표시
 * Progressive Disclosure 원칙 준수
 *
 * @example
 * ```tsx
 * <RecentActivityList
 *   items={[
 *     {
 *       id: '1',
 *       title: '보험청구서.pdf',
 *       subtitle: '문서 등록',
 *       timestamp: new Date(),
 *       icon: <DocumentIcon />,
 *       onClick: () => navigate('/documents/1')
 *     }
 *   ]}
 *   emptyMessage="최근 활동이 없습니다"
 *   maxItems={5}
 * />
 * ```
 */
export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  items,
  emptyMessage = '최근 활동이 없습니다',
  maxItems,
  isLoading = false,
  error,
}) => {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  if (isLoading) {
    return (
      <div className="recent-activity-list">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="recent-activity-item recent-activity-item--loading">
            <div className="recent-activity-item__content">
              <div className="recent-activity-item__skeleton-title" />
              <div className="recent-activity-item__skeleton-subtitle" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="recent-activity-list recent-activity-list--error">
        <div className="recent-activity-list__error-icon">⚠️</div>
        <p className="recent-activity-list__error-message">{error}</p>
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className="recent-activity-list recent-activity-list--empty">
        <p className="recent-activity-list__empty-message">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="recent-activity-list">
      {displayItems.map((item, index) => (
        <div
          key={item.id}
          className={`recent-activity-item ${item.onClick ? 'recent-activity-item--clickable' : ''}`}
          onClick={item.onClick}
          role={item.onClick ? 'button' : undefined}
          tabIndex={item.onClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (item.onClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              item.onClick();
            }
          }}
          aria-label={`${item.title} ${item.subtitle || ''} ${getRelativeTimeString(item.timestamp)}`}
        >
          {item.icon && (
            <div className="recent-activity-item__icon">{item.icon}</div>
          )}
          <div className="recent-activity-item__content">
            <div className="recent-activity-item__title">{item.title}</div>
            {item.subtitle && (
              <div className="recent-activity-item__subtitle">{item.subtitle}</div>
            )}
          </div>
          <div className="recent-activity-item__timestamp">
            {getRelativeTimeString(item.timestamp)}
          </div>
          {index < displayItems.length - 1 && (
            <div className="recent-activity-item__divider" />
          )}
        </div>
      ))}
    </div>
  );
};

export default RecentActivityList;
