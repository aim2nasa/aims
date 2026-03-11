/**
 * 🍎 iOS Style Dropdown Component
 *
 * 가이드 준수:
 * - CSS_SYSTEM.md: CSS 변수 사용, 하드코딩 금지
 * - COMPONENT_GUIDE.md: 타입 안전한 Props, 합성 우선
 * - ARCHITECTURE.md: Document-Controller-View 패턴
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  /** 드롭다운 폭 (px 단위 숫자 또는 CSS 문자열) */
  width?: number | string;
  /** 최소 폭 (px 단위 숫자 또는 CSS 문자열) */
  minWidth?: number | string;
  /** 비활성화 여부 */
  disabled?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
  value,
  options,
  onChange,
  className = '',
  'aria-label': ariaLabel,
  width,
  minWidth,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; upward: boolean }>({ top: 0, left: 0, width: 0, upward: false });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 선택된 옵션 찾기
  const selectedOption = options.find(opt => opt.value === value);

  // 드롭다운 위치 계산 (포탈 기반 — viewport 좌표)
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight || 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const upward = spaceBelow < menuHeight && spaceAbove > spaceBelow;

      setMenuPos({
        top: upward ? rect.top + window.scrollY : rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
        upward,
      });
    }
  }, [isOpen]);

  // 포탈 메뉴 위치 재계산 (upward 시 메뉴 높이 확정 후)
  useEffect(() => {
    if (isOpen && menuRef.current && menuPos.upward && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current.offsetHeight;
      setMenuPos(prev => ({
        ...prev,
        top: rect.top + window.scrollY - menuHeight - 4,
      }));
    }
  }, [isOpen, menuPos.upward]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 활성(선택 가능한) 옵션 인덱스 목록
  const enabledIndices = useMemo(() => options.reduce<number[]>((acc, opt, i) => {
    if (!opt.disabled) acc.push(i);
    return acc;
  }, []), [options]);

  // 메뉴 열릴 때 현재 선택값으로 하이라이트 초기화
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : (enabledIndices[0] ?? -1));
    }
  }, [isOpen, options, value, enabledIndices]);

  // 하이라이트된 옵션으로 스크롤
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !menuRef.current) return;
    const optionEl = menuRef.current.children[highlightedIndex] as HTMLElement | undefined;
    optionEl?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  // 옵션 선택 핸들러
  const handleOptionClick = (option: DropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // 다음/이전 활성 옵션 인덱스 찾기
  const findNextEnabled = useCallback((current: number, direction: 1 | -1): number => {
    const pos = enabledIndices.indexOf(current);
    if (pos === -1) return enabledIndices[0] ?? -1;
    const next = pos + direction;
    if (next < 0 || next >= enabledIndices.length) return current;
    return enabledIndices[next];
  }, [enabledIndices]);

  // 키보드 네비게이션
  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          const opt = options[highlightedIndex];
          if (opt && !opt.disabled) {
            handleOptionClick(opt);
          }
        } else {
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => findNextEnabled(prev, 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => findNextEnabled(prev, -1));
        }
        break;
      case 'Home':
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(enabledIndices[0] ?? -1);
        }
        break;
      case 'End':
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(enabledIndices[enabledIndices.length - 1] ?? -1);
        }
        break;
    }
  };

  // 동적 스타일 계산
  const containerStyle: React.CSSProperties = {};
  if (width !== undefined) {
    containerStyle.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (minWidth !== undefined) {
    containerStyle.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;
  }

  return (
    <div
      ref={dropdownRef}
      className={`ios-dropdown ${disabled ? 'ios-dropdown--disabled' : ''} ${className}`}
      style={containerStyle}
      aria-label={ariaLabel}
    >
      {/* Dropdown 트리거 버튼 */}
      <button
        ref={triggerRef}
        type="button"
        className="ios-dropdown__trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
      >
        <span className="ios-dropdown__value">{selectedOption?.label || '선택'}</span>
        <span className="ios-dropdown__arrow" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown 옵션 리스트 — body 포탈로 overflow:hidden 부모 우회 */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className={`ios-dropdown__menu ios-dropdown__menu--portal ${menuPos.upward ? 'ios-dropdown__menu--upward' : ''}`}
          role="listbox"
          style={{
            position: 'absolute',
            top: `${menuPos.top}px`,
            left: `${menuPos.left}px`,
            minWidth: `${menuPos.width}px`,
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;
            return (
              <button
                key={option.value}
                id={`dropdown-option-${index}`}
                type="button"
                className={[
                  'ios-dropdown__option',
                  isSelected && 'ios-dropdown__option--selected',
                  isHighlighted && 'ios-dropdown__option--highlighted',
                  option.disabled && 'ios-dropdown__option--disabled',
                ].filter(Boolean).join(' ')}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
                disabled={option.disabled}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
              >
                <span className="ios-dropdown__checkmark" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
                <span className="ios-dropdown__option-label">{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
