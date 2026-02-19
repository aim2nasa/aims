/**
 * AIMS UIX-3 Tabs Component
 * @since 2025-10-09
 * @version 2.0.0 - Modern underline indicator + icon-only label popup
 *
 * Clean tab navigation:
 * - Underline indicator on active tab (no double-layer backgrounds)
 * - Icon-only mode (<=640px): click shows floating label popup
 * - Progressive Disclosure philosophy
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
 * Modern underline-indicator tab navigation.
 * In icon-only mode (mobile <=640px), clicking a tab shows a
 * brief floating label popup identifying the tab.
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

  // Icon-only mode label popup
  const [labelPopup, setLabelPopup] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const popupTimerRef = useRef<number | undefined>(undefined);
  const isIconOnlyRef = useRef(false);

  // Track icon-only mode via media query (<=640px OR landscape mobile)
  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 640px)');
    const mqLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
    const update = () => { isIconOnlyRef.current = mqNarrow.matches || mqLandscape.matches; };
    update();
    mqNarrow.addEventListener('change', update);
    mqLandscape.addEventListener('change', update);
    return () => {
      mqNarrow.removeEventListener('change', update);
      mqLandscape.removeEventListener('change', update);
    };
  }, []);

  // Cleanup popup timer
  useEffect(() => {
    return () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    };
  }, []);

  const handleTabClick = useCallback((tab: Tab, e: React.MouseEvent<HTMLButtonElement>) => {
    if (tab.disabled) return;

    if (controlledActiveKey === undefined) {
      setUncontrolledActiveKey(tab.key);
    }

    onChange?.(tab.key);

    // Show label popup in icon-only mode
    if (isIconOnlyRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      const labelText = tab.count !== undefined ? `${tab.label} (${tab.count})` : tab.label;
      setPopupPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
      setLabelPopup(labelText);
      popupTimerRef.current = window.setTimeout(() => setLabelPopup(null), 1500);
    }
  }, [controlledActiveKey, onChange]);

  return (
    <>
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
              aria-selected={isActive ? 'true' : 'false'}
              aria-disabled={tab.disabled ? 'true' : undefined}
              className={tabClasses}
              onClick={(e) => handleTabClick(tab, e)}
              disabled={tab.disabled}
              data-tab-key={tab.key}
            >
              {tab.icon && <span className="tabs-bar__tab-icon">{tab.icon}</span>}
              {tab.count !== undefined && (
                <span className="tabs-bar__tab-count">({tab.count})</span>
              )}
              <span className="tabs-bar__tab-label">
                {tab.label}
                {tab.count !== undefined && (
                  <span className="tabs-bar__tab-count--inline"> ({tab.count})</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Label popup for icon-only mode (portal to body to avoid overflow clipping) */}
      {labelPopup && createPortal(
        <div
          className="tabs-bar__label-popup"
          style={{
            '--popup-top': `${popupPos.top}px`,
            '--popup-left': `${popupPos.left}px`,
          } as React.CSSProperties}
        >
          {labelPopup}
        </div>,
        document.body
      )}
    </>
  );
};

export default Tabs;
