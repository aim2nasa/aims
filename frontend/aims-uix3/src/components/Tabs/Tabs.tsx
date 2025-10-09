/**
 * AIMS UIX-3 Tabs Component
 * @since 2025-10-09
 * @version 1.0.0
 *
 * 🍎 iOS/macOS Segmented Control 스타일의 탭 컴포넌트
 * - Progressive Disclosure: 현재 탭만 강조, 나머지는 서브틀
 * - Apple 디자인 철학 완벽 구현
 */

import React, { useState, useCallback } from 'react';
import './Tabs.css';

export interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  count?: number; // 선택적 카운트 표시 (예: 문서 (5))
}

export interface TabsProps {
  tabs: Tab[];
  defaultActiveKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  className?: string;
}

/**
 * Tabs Component
 *
 * iOS Segmented Control 스타일의 탭 네비게이션을 제공합니다.
 *
 * @example
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { key: 'info', label: '기본 정보', icon: <UserIcon /> },
 *     { key: 'docs', label: '문서', icon: <FileIcon />, count: 5 }
 *   ]}
 *   defaultActiveKey="info"
 *   onChange={(key) => console.log('Tab changed:', key)}
 * />
 * ```
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultActiveKey,
  activeKey: controlledActiveKey,
  onChange,
  className = ''
}) => {
  // Uncontrolled state
  const [uncontrolledActiveKey, setUncontrolledActiveKey] = useState(
    defaultActiveKey || tabs[0]?.key || ''
  );

  // 제어/비제어 컴포넌트 패턴
  const activeKey = controlledActiveKey !== undefined ? controlledActiveKey : uncontrolledActiveKey;

  const handleTabClick = useCallback((tabKey: string, disabled?: boolean) => {
    if (disabled) return;

    if (controlledActiveKey === undefined) {
      setUncontrolledActiveKey(tabKey);
    }

    onChange?.(tabKey);
  }, [controlledActiveKey, onChange]);

  return (
    <div className={`tabs-bar ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const tabClasses = [
          'tabs-bar__tab',
          isActive && 'tabs-bar__tab--active',
          tab.disabled && 'tabs-bar__tab--disabled'
        ].filter(Boolean).join(' ');

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled}
            className={tabClasses}
            onClick={() => handleTabClick(tab.key, tab.disabled)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="tabs-bar__tab-icon">{tab.icon}</span>}
            <span className="tabs-bar__tab-label">
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="tabs-bar__tab-count"> ({tab.count})</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
