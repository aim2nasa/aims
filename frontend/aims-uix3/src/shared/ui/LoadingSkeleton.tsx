/**
 * AIMS UIX-3 LoadingSkeleton Component
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 로딩 상태를 위한 스켈레톤 플레이스홀더
 * 다양한 콘텐츠 형태에 맞는 스켈레톤 제공
 */

import React from 'react';
import './LoadingSkeleton.css';

export interface LoadingSkeletonProps {
  /** 스켈레톤의 너비 (CSS 값) */
  width?: string | number;

  /** 스켈레톤의 높이 (CSS 값) */
  height?: string | number;

  /** 스켈레톤의 모양 */
  variant?: 'text' | 'rectangle' | 'circle' | 'rounded';

  /** 애니메이션 활성화 여부 */
  animate?: boolean;

  /** 추가 CSS 클래스 */
  className?: string;

  /** 접근성을 위한 설명 */
  'aria-label'?: string;
}

/**
 * 다양한 형태의 로딩 스켈레톤을 제공하는 컴포넌트
 *
 * @example
 * // 텍스트 스켈레톤
 * <LoadingSkeleton variant="text" width="200px" />
 *
 * // 사각형 스켈레톤
 * <LoadingSkeleton variant="rectangle" width="100%" height="200px" />
 *
 * // 원형 아바타 스켈레톤
 * <LoadingSkeleton variant="circle" width="40px" height="40px" />
 */
export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  width = '100%',
  height,
  variant = 'text',
  animate = true,
  className = '',
  'aria-label': ariaLabel = '콘텐츠 로딩 중',
  ...props
}) => {
  // 기본 높이 설정
  const defaultHeight = {
    text: '1em',
    rectangle: '200px',
    circle: '40px',
    rounded: '120px',
  };

  const computedHeight = height || defaultHeight[variant];

  const classNames = [
    'loading-skeleton',
    `loading-skeleton--${variant}`,
    animate && 'loading-skeleton--animate',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const styles = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof computedHeight === 'number' ? `${computedHeight}px` : computedHeight,
  };

  return (
    <div
      className={classNames}
      style={styles}
      role="status"
      aria-label={ariaLabel}
      {...props}
    >
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
};

export default LoadingSkeleton;

/**
 * 텍스트 라인들을 위한 스켈레톤 그룹
 */
export interface TextSkeletonProps {
  /** 라인 수 */
  lines?: number;

  /** 각 라인의 너비 배열 (기본값: 랜덤) */
  widths?: string[];

  /** 라인 간격 */
  gap?: string;

  /** 애니메이션 활성화 여부 */
  animate?: boolean;

  /** 추가 CSS 클래스 */
  className?: string;
}

export const TextSkeleton: React.FC<TextSkeletonProps> = ({
  lines = 3,
  widths,
  gap = 'var(--spacing-2)',
  animate = true,
  className = '',
}) => {
  // 기본 너비 패턴
  const defaultWidths = ['100%', '80%', '60%', '90%', '70%'];

  const lineWidths = widths || Array.from({ length: lines }, (_, index) =>
    defaultWidths[index % defaultWidths.length]
  );

  return (
    <div
      className={`text-skeleton ${className}`}
      style={{ gap }}
      role="status"
      aria-label={`${lines}줄의 텍스트 로딩 중`}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <LoadingSkeleton
          key={index}
          variant="text"
          width={lineWidths[index]}
          animate={animate}
        />
      ))}
    </div>
  );
};

/**
 * 카드 형태의 스켈레톤
 */
export interface CardSkeletonProps {
  /** 아바타 표시 여부 */
  showAvatar?: boolean;

  /** 아바타 크기 */
  avatarSize?: string;

  /** 제목 라인 수 */
  titleLines?: number;

  /** 내용 라인 수 */
  contentLines?: number;

  /** 액션 버튼 표시 여부 */
  showActions?: boolean;

  /** 애니메이션 활성화 여부 */
  animate?: boolean;

  /** 추가 CSS 클래스 */
  className?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  showAvatar = false,
  avatarSize = '40px',
  titleLines = 1,
  contentLines = 3,
  showActions = false,
  animate = true,
  className = '',
}) => {
  return (
    <div
      className={`card-skeleton ${className}`}
      role="status"
      aria-label="카드 콘텐츠 로딩 중"
    >
      {/* Header with Avatar */}
      {showAvatar && (
        <div className="card-skeleton__header">
          <LoadingSkeleton
            variant="circle"
            width={avatarSize}
            height={avatarSize}
            animate={animate}
          />
          <div className="card-skeleton__header-content">
            <LoadingSkeleton
              variant="text"
              width="120px"
              animate={animate}
            />
            <LoadingSkeleton
              variant="text"
              width="80px"
              animate={animate}
            />
          </div>
        </div>
      )}

      {/* Title */}
      <TextSkeleton
        lines={titleLines}
        widths={titleLines === 1 ? ['60%'] : undefined}
        animate={animate}
      />

      {/* Content */}
      <TextSkeleton
        lines={contentLines}
        animate={animate}
      />

      {/* Actions */}
      {showActions && (
        <div className="card-skeleton__actions">
          <LoadingSkeleton
            variant="rounded"
            width="80px"
            height="32px"
            animate={animate}
          />
          <LoadingSkeleton
            variant="rounded"
            width="60px"
            height="32px"
            animate={animate}
          />
        </div>
      )}
    </div>
  );
};