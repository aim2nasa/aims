/**
 * 🍎 iOS Style Dropdown Component
 *
 * 가이드 준수:
 * - CSS_SYSTEM.md: CSS 변수 사용, 하드코딩 금지
 * - COMPONENT_GUIDE.md: 타입 안전한 Props, 합성 우선
 * - ARCHITECTURE.md: Document-Controller-View 패턴
 */

import React, { useState, useRef, useEffect } from 'react';
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
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 선택된 옵션 찾기
  const selectedOption = options.find(opt => opt.value === value);

  // 드롭다운 위치 계산 (위/아래)
  useEffect(() => {
    if (isOpen && dropdownRef.current && menuRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current.offsetHeight;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // 아래 공간이 충분하면 아래로, 아니면 위로
      setOpenUpward(spaceBelow < menuHeight && spaceAbove > spaceBelow);
    }
  }, [isOpen]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  // 옵션 선택 핸들러
  const handleOptionClick = (option: DropdownOption) => {
    if (option.disabled) return; // disabled 옵션은 선택 불가
    onChange(option.value);
    setIsOpen(false);
  };

  // 키보드 네비게이션
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
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

      {/* Dropdown 옵션 리스트 */}
      {isOpen && (
        <div
          ref={menuRef}
          className={`ios-dropdown__menu ${openUpward ? 'ios-dropdown__menu--upward' : ''}`}
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`ios-dropdown__option ${
                option.value === value ? 'ios-dropdown__option--selected' : ''
              } ${option.disabled ? 'ios-dropdown__option--disabled' : ''}`}
              onClick={() => handleOptionClick(option)}
              disabled={option.disabled}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
