/**
 * AIMS UIX-3 Tabs Component
 * @since 2025-10-09
 * @version 3.0.0 - Modern underline indicator with icon + label
 *
 * Clean tab navigation:
 * - Underline indicator on active tab (no double-layer backgrounds)
 * - Icon + label always visible
 */

import React, { useState, useCallback } from 'react';
import { Tooltip } from '../../shared/ui/Tooltip';
import './Tabs.css';

export interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  count?: number; // 선택적 카운트 표시 (예: 문서 5)
  tooltip?: string; // 커스텀 툴팁 (미지정 시 표시 안함)
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
 * Modern underline-indicator tab navigation.
 *
 * @example
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { key: 'info', label: '기본정보', icon: <UserIcon /> },
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

  const handleTabClick = useCallback((tab: Tab) => {
    if (tab.disabled) return;

    if (controlledActiveKey === undefined) {
      setUncontrolledActiveKey(tab.key);
    }

    onChange?.(tab.key);
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

        const tabButton = (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive ? 'true' : 'false'}
            aria-disabled={tab.disabled ? 'true' : undefined}
            className={tabClasses}
            onClick={() => handleTabClick(tab)}
            disabled={tab.disabled}
            data-tab-key={tab.key}
            data-tooltip={`${tab.label}${tab.count !== undefined ? ` ${tab.count}` : ''}`}
          >
            {tab.icon && <span className="tabs-bar__tab-icon">{tab.icon}</span>}
            <span className="tabs-bar__tab-label">
              <span className="tabs-bar__tab-label-text">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="tabs-bar__tab-count--inline">{tab.count}</span>
              )}
            </span>
          </button>
        );

        if (tab.tooltip) {
          return (
            <Tooltip key={tab.key} content={tab.tooltip} placement="bottom">
              {tabButton}
            </Tooltip>
          );
        }

        return tabButton;
      })}
    </div>
  );
};

export default Tabs;
