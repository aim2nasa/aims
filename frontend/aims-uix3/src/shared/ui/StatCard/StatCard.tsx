/**
 * StatCard Component
 * @since 1.0.0
 *
 * 대시보드 통계 카드 컴포넌트
 * iOS 스타일의 통계 정보 표시 카드
 */

import React from 'react';
import './StatCard.css';

export interface StatCardProps {
  /** 카드 제목 */
  title: string;
  /** 표시할 값 */
  value: number | string;
  /** 아이콘 (선택사항) */
  icon?: React.ReactNode;
  /** 카드 색상 테마 */
  color?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  /** 추세 정보 (선택사항) */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** 클릭 핸들러 (선택사항) */
  onClick?: () => void;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 에러 메시지 (선택사항) */
  error?: string;
}

/**
 * StatCard React 컴포넌트
 *
 * 통계 정보를 시각적으로 표시하는 카드 컴포넌트
 * Progressive Disclosure 원칙 준수
 *
 * @example
 * ```tsx
 * <StatCard
 *   title="전체 문서"
 *   value={1234}
 *   icon={<SFSymbol name="doc" />}
 *   color="primary"
 *   onClick={() => navigate('/documents')}
 * />
 * ```
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color = 'neutral',
  trend,
  onClick,
  isLoading = false,
  error
}) => {
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('ko-KR')
    : value;

  return (
    <div
      className={`stat-card stat-card--${color} ${onClick ? 'stat-card--clickable' : ''} ${isLoading ? 'stat-card--loading' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${title}: ${formattedValue}`}
    >
      {isLoading ? (
        <div className="stat-card__skeleton">
          <div className="stat-card__skeleton-title" />
          <div className="stat-card__skeleton-value" />
        </div>
      ) : error ? (
        <div className="stat-card__error">
          <div className="stat-card__error-icon">⚠️</div>
          <h3 className="stat-card__title">{title}</h3>
          <div className="stat-card__error-message">{error}</div>
        </div>
      ) : (
        <>
          <div className="stat-card__header">
            {icon && <div className="stat-card__icon">{icon}</div>}
            <h3 className="stat-card__title">{title}</h3>
          </div>
          <div className="stat-card__body">
            <div className="stat-card__value">{formattedValue}</div>
            {trend && (
              <div
                className={`stat-card__trend ${trend.isPositive ? 'stat-card__trend--positive' : 'stat-card__trend--negative'}`}
                aria-label={`${trend.isPositive ? '증가' : '감소'} ${Math.abs(trend.value)}`}
              >
                <span className="stat-card__trend-icon">
                  {trend.isPositive ? '↑' : '↓'}
                </span>
                <span className="stat-card__trend-value">
                  {Math.abs(trend.value)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

