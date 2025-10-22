/**
 * RefreshButton Component
 * @since 1.0.0
 *
 * 🍎 애플 스타일 새로고침 버튼
 * - Progressive Disclosure 원칙 준수
 * - 서브틀한 기본 상태, 호버 시 강조
 * - 부드러운 회전 애니메이션
 */

import React, { useState } from 'react';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import './RefreshButton.css';

interface RefreshButtonProps {
  /** 클릭 핸들러 - Promise를 반환하면 로딩 상태 자동 관리 */
  onClick?: () => void | Promise<void>;
  /** 외부에서 제어하는 로딩 상태 */
  loading?: boolean;
  /** 추가 클래스명 */
  className?: string;
  /** 버튼 크기 */
  size?: 'small' | 'medium' | 'large';
  /** 툴팁 텍스트 */
  tooltip?: string;
  /** 비활성화 상태 */
  disabled?: boolean;
}

/**
 * RefreshButton React 컴포넌트
 *
 * 모든 페이지에서 사용할 수 있는 공통 새로고침 버튼
 *
 * @example
 * ```tsx
 * <RefreshButton onClick={handleRefresh} tooltip="데이터 새로고침" />
 * ```
 */
export const RefreshButton: React.FC<RefreshButtonProps> = ({
  onClick = () => undefined,
  loading = false,
  className = '',
  size = 'medium',
  tooltip = '새로고침',
  disabled = false
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 실제 로딩 상태 (외부 loading prop 또는 내부 isRefreshing)
  const externalLoading = Boolean(loading);
  const isDisabled = Boolean(disabled);
  const sanitizedClassName = className.trim();
  const isLoading = externalLoading || isRefreshing;

  const handleClick = async () => {
    if (isDisabled || isLoading) return;

    const result = onClick();

    // onClick이 Promise를 반환하면 로딩 상태 자동 관리
    if (result && result instanceof Promise) {
      setIsRefreshing(true);
      try {
        await result;
      } finally {
        // 애니메이션을 위해 최소 시간 유지
        setTimeout(() => {
          setIsRefreshing(false);
        }, 300);
      }
    }
  };

  // 크기별 SFSymbol 사이즈 매핑
  const symbolSize = {
    small: SFSymbolSize.CAPTION_1,
    medium: SFSymbolSize.BODY,
    large: SFSymbolSize.CALLOUT
  }[size];

  const buttonClasses = [
    'refresh-button',
    `refresh-button--${size}`,
    isLoading && 'refresh-button--loading',
    isDisabled && 'refresh-button--disabled',
    sanitizedClassName
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={handleClick}
      disabled={isDisabled || isLoading}
      aria-label={tooltip}
    >
      <SFSymbol
        name="arrow.clockwise"
        size={symbolSize}
        weight={SFSymbolWeight.MEDIUM}
        className="refresh-button__icon"
        decorative={true}
      />
    </button>
  );
};

export default RefreshButton;
