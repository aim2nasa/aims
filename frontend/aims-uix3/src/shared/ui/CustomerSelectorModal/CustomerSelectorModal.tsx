/**
 * AIMS UIX-3 Customer Selector Modal
 * @since 2025-11-05
 * @version 3.0.0
 *
 * 공용 고객 선택 모달 컴포넌트
 * - DraggableModal 기반
 * - useCustomerDocument 훅 사용
 * - 고객 트리 구조 (개인/법인)
 * - 실시간 검색 기능
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Customer } from '@/entities/customer/model';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import { DraggableModal } from '../DraggableModal';
import { Button } from '../Button';
import { SFSymbol } from '../../../components/SFSymbol/SFSymbol';
import { SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol/SFSymbol.types';
import './CustomerSelectorModal.css';

export interface CustomerSelectorModalProps {
  /** 모달 표시 여부 */
  visible: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 완료 핸들러 */
  onSelect: (customer: Customer) => void;
}

/**
 * 고객 선택 모달
 *
 * 사용법:
 * ```tsx
 * <CustomerSelectorModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSelect={(customer) => {
 *     console.log('선택된 고객:', customer);
 *     setIsOpen(false);
 *   }}
 * />
 * ```
 */
export const CustomerSelectorModal: React.FC<CustomerSelectorModalProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  // CustomerDocument 훅 사용
  const { customers: allCustomers, isLoading, loadCustomers } = useCustomerDocument();

  // 검색 쿼리
  const [searchQuery, setSearchQuery] = useState('');
  // 활성 탭 ('all' | 'personal' | 'corporate')
  const [activeTab, setActiveTab] = useState<'all' | 'personal' | 'corporate'>('all');
  // 선택된 고객
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // 선택된 초성 필터 (ㄱ,ㄴ,ㄷ,...)
  const [selectedInitial, setSelectedInitial] = useState<string | null>(null);
  // 초성 타입 ('korean' | 'alphabet' | 'number')
  const [initialType, setInitialType] = useState<'korean' | 'alphabet' | 'number'>('korean');
  // 정렬 상태 (칼럼명, 오름차순/내림차순)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  // 칼럼 폭 상태 (비율 기반, 합계 100%)
  // [이름, 생년월일, 성별, 전화, 이메일, 주소, 유형]
  const initialColumnWidthRatios = [14, 9, 5, 12, 18, 25, 17]; // %
  const [columnWidthRatios, setColumnWidthRatios] = useState<number[]>(initialColumnWidthRatios);

  // 모달 열릴 때 전체 고객 로드
  useEffect(() => {
    if (visible) {
      console.log('[CustomerSelectorModal] 고객 데이터 로딩 시작');
      loadCustomers({ limit: 10000, page: 1 });
      setSelectedCustomer(null);
      setSearchQuery('');
      setActiveTab('all');
    }
  }, [visible, loadCustomers]);

  // 개인/법인으로 분류 및 정렬
  const { personalCustomers, corporateCustomers } = useMemo(() => {
    const personal: Customer[] = [];
    const corporate: Customer[] = [];

    allCustomers.forEach(customer => {
      const type = customer.insurance_info?.customer_type;
      if (type === '법인') {
        corporate.push(customer);
      } else {
        personal.push(customer);
      }
    });

    // 이름 기준으로 정렬 (가나다순)
    const sortByName = (a: Customer, b: Customer) => {
      const nameA = a.personal_info?.name || '';
      const nameB = b.personal_info?.name || '';
      return nameA.localeCompare(nameB, 'ko-KR');
    };

    personal.sort(sortByName);
    corporate.sort(sortByName);

    return { personalCustomers: personal, corporateCustomers: corporate };
  }, [allCustomers]);

  // 검색 중인지 여부
  const isSearching = searchQuery.trim().length > 0;

  // 검색 필터링
  const searchResults = useMemo(() => {
    if (!isSearching) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return allCustomers.filter(customer => {
      const name = customer.personal_info?.name?.toLowerCase() || '';
      const phone = customer.personal_info?.mobile_phone?.replace(/-/g, '') || '';
      return name.includes(query) || phone.includes(query);
    });
  }, [allCustomers, searchQuery, isSearching]);

  // 한글 초성 추출 함수
  const getInitialConsonant = (name: string): string => {
    if (!name) return '';
    const code = name.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ''; // 한글이 아님
    const initialIndex = Math.floor(code / 588);
    // 초성을 자모(ㄱㄴㄷ...)로 변환
    const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    return initials[initialIndex] || '';
  };

  // 알파벳 초성 추출 함수 (대소문자 구분 없음)
  const getAlphabetInitial = (name: string): string => {
    if (!name) return '';
    const firstChar = name.charAt(0).toUpperCase();
    if (firstChar >= 'A' && firstChar <= 'Z') {
      return firstChar;
    }
    return '';
  };

  // 숫자 초성 추출 함수
  const getNumberInitial = (name: string): string => {
    if (!name) return '';
    const firstChar = name.charAt(0);
    if (firstChar >= '0' && firstChar <= '9') {
      return firstChar;
    }
    return '';
  };

  // 이름의 초성 추출 (타입에 따라)
  const getNameInitial = (name: string, type: 'korean' | 'alphabet' | 'number'): string => {
    if (type === 'korean') return getInitialConsonant(name);
    if (type === 'alphabet') return getAlphabetInitial(name);
    if (type === 'number') return getNumberInitial(name);
    return '';
  };

  // 정렬 핸들러
  const handleSort = useCallback((key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // 칼럼 리사이즈 핸들러 (비율 기반)
  const handleColumnResize = useCallback((e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const tableHeader = (e.target as HTMLElement).closest('.customer-selector-modal__table-header');
    if (!tableHeader) return;

    const tableWidth = tableHeader.clientWidth;
    const startRatio = columnWidthRatios[columnIndex];
    if (startRatio === undefined) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaRatio = (deltaX / tableWidth) * 100; // px를 %로 변환
      const newRatio = Math.max(3, startRatio + deltaRatio); // 최소 3%

      setColumnWidthRatios(prev => {
        const newRatios = [...prev];
        newRatios[columnIndex] = newRatio;
        return newRatios;
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidthRatios]);

  // 칼럼 폭 초기화
  const resetColumnWidths = useCallback(() => {
    setColumnWidthRatios(initialColumnWidthRatios);
  }, []);

  // 표시할 고객 목록 (탭 + 초성 필터링 + 정렬)
  const displayedCustomers = useMemo(() => {
    let customers: Customer[];

    if (isSearching) {
      customers = searchResults;
    } else {
      switch (activeTab) {
        case 'personal':
          customers = personalCustomers;
          break;
        case 'corporate':
          customers = corporateCustomers;
          break;
        case 'all':
        default:
          customers = allCustomers;
      }
    }

    // 초성 필터 적용
    if (selectedInitial && !isSearching) {
      customers = customers.filter(customer => {
        const name = customer.personal_info?.name || '';
        return getNameInitial(name, initialType) === selectedInitial;
      });
    }

    // 정렬 적용
    if (sortConfig) {
      customers = [...customers].sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';

        switch (sortConfig.key) {
          case 'name':
            aValue = a.personal_info?.name || '';
            bValue = b.personal_info?.name || '';
            break;
          case 'birth':
            aValue = a.personal_info?.birth_date || '';
            bValue = b.personal_info?.birth_date || '';
            break;
          case 'gender':
            aValue = a.personal_info?.gender || '';
            bValue = b.personal_info?.gender || '';
            break;
          case 'phone':
            aValue = a.personal_info?.mobile_phone || '';
            bValue = b.personal_info?.mobile_phone || '';
            break;
          case 'email':
            aValue = a.personal_info?.email || '';
            bValue = b.personal_info?.email || '';
            break;
          case 'address':
            // 주소는 personal_info.address.address1 경로 사용
            aValue = a.personal_info?.address?.address1 || '';
            bValue = b.personal_info?.address?.address1 || '';
            break;
          case 'type':
            aValue = a.insurance_info?.customer_type || '';
            bValue = b.insurance_info?.customer_type || '';
            break;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return customers;
  }, [activeTab, allCustomers, personalCustomers, corporateCustomers, isSearching, searchResults, selectedInitial, initialType, sortConfig]);

  // 고객 선택
  const handleSelectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
  }, []);

  // 확인 버튼
  const handleConfirm = useCallback(() => {
    if (selectedCustomer) {
      onSelect(selectedCustomer);
      onClose();
    }
  }, [selectedCustomer, onSelect, onClose]);

  console.log('[CustomerSelectorModal] 렌더링:', {
    visible,
    isLoading,
    allCustomersCount: allCustomers.length,
    personalCount: personalCustomers.length,
    corporateCount: corporateCustomers.length,
    isSearching,
    searchResultsCount: searchResults.length,
    displayedCustomersCount: displayedCustomers.length,
    selectedInitial
  });

  return (
    <DraggableModal
      visible={visible}
      onClose={onClose}
      title="고객 선택"
      initialWidth={1100}
      initialHeight={700}
      minWidth={500}
      minHeight={500}
      showHeader={true}
      showResetButton={true}
      onReset={resetColumnWidths}
      footer={
        <div className="customer-selector-modal__footer-buttons">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={!selectedCustomer}
          >
            선택 완료
          </Button>
        </div>
      }
    >
      {/* 검색 입력 */}
      <div className="customer-selector-modal__search">
        <div className="customer-selector-modal__search-wrapper">
          <SFSymbol
            name="magnifyingglass"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
            className="customer-selector-modal__search-icon"
            decorative
          />
          <input
            type="text"
            className="customer-selector-modal__search-input"
            placeholder="고객 이름 또는 전화번호 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* 탭 (검색 중이 아닐 때만 표시) */}
      {!isSearching && (
        <>
          <div className="customer-selector-modal__tabs">
            <button
              className={`customer-selector-modal__tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <SFSymbol
                name="person.3.fill"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="customer-selector-modal__tab-icon"
                decorative
              />
              전체 ({allCustomers.length})
            </button>
            <button
              className={`customer-selector-modal__tab ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <SFSymbol
                name="person"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="customer-selector-modal__tab-icon"
                decorative
              />
              개인 ({personalCustomers.length})
            </button>
            <button
              className={`customer-selector-modal__tab ${activeTab === 'corporate' ? 'active' : ''}`}
              onClick={() => setActiveTab('corporate')}
            >
              <SFSymbol
                name="building.2.fill"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="customer-selector-modal__tab-icon"
                decorative
              />
              법인 ({corporateCustomers.length})
            </button>
          </div>

          {/* 초성 인덱스 */}
          <div className="customer-selector-modal__initials">
            {/* 초성 타입 토글 버튼 */}
            <button
              className="customer-selector-modal__initial-type-toggle"
              onClick={() => {
                const nextType = initialType === 'korean' ? 'alphabet' : initialType === 'alphabet' ? 'number' : 'korean';
                setInitialType(nextType);
                setSelectedInitial(null);
              }}
              title="초성 타입 전환 (한글/영문/숫자)"
            >
              {initialType === 'korean' ? 'ㄱㄴㄷ' : initialType === 'alphabet' ? 'abc' : '123'}
            </button>

            {/* 초성 버튼들 */}
            {initialType === 'korean' && ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map(initial => (
              <button
                key={initial}
                className={`customer-selector-modal__initial ${selectedInitial === initial ? 'active' : ''}`}
                onClick={() => setSelectedInitial(selectedInitial === initial ? null : initial)}
                title={`${initial}로 시작하는 고객`}
              >
                {initial}
              </button>
            ))}
            {initialType === 'alphabet' && ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'].map(initial => (
              <button
                key={initial}
                className={`customer-selector-modal__initial ${selectedInitial === initial.toUpperCase() ? 'active' : ''}`}
                onClick={() => setSelectedInitial(selectedInitial === initial.toUpperCase() ? null : initial.toUpperCase())}
                title={`${initial.toUpperCase()}로 시작하는 고객`}
              >
                {initial}
              </button>
            ))}
            {initialType === 'number' && ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(initial => (
              <button
                key={initial}
                className={`customer-selector-modal__initial ${selectedInitial === initial ? 'active' : ''}`}
                onClick={() => setSelectedInitial(selectedInitial === initial ? null : initial)}
                title={`${initial}로 시작하는 고객`}
              >
                {initial}
              </button>
            ))}
            {/* 초성 필터 상태 표시 */}
            <div className="customer-selector-modal__filter-status">
              <SFSymbol
                name="line.horizontal.3"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="customer-selector-modal__filter-icon"
                decorative
              />
              <span className="customer-selector-modal__filter-label">필터:</span>
              <span className={`customer-selector-modal__filter-value ${selectedInitial ? 'active' : 'inactive'}`}>
                {selectedInitial || '없음'}
              </span>
              {selectedInitial && (
                <button
                  className="customer-selector-modal__filter-clear"
                  onClick={() => setSelectedInitial(null)}
                  title="초성 필터 해제"
                  aria-label="초성 필터 해제"
                >
                  <SFSymbol
                    name="xmark.circle.fill"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative
                  />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* 로딩 */}
      {isLoading && (
        <div className="customer-selector-modal__loading">
          고객 이름 검색 중...
        </div>
      )}

      {/* 고객 목록 */}
      {!isLoading && (
        <>
          {/* 테이블 헤더 */}
          {displayedCustomers.length > 0 && (
            <div
              className="customer-selector-modal__table-header"
              style={{ gridTemplateColumns: columnWidthRatios.map(w => `${w}%`).join(' ') }}
            >
              <div className="header-name sortable" onClick={() => handleSort('name')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                <span>이름</span>
                {sortConfig?.key === 'name' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 0)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-birth sortable" onClick={() => handleSort('birth')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="10" width="12" height="3" rx="0.5" fill="var(--cake-bottom)"/>
                  <rect x="3" y="7" width="10" height="3" rx="0.5" fill="var(--cake-top)"/>
                  <rect x="4" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <rect x="6.5" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <rect x="9" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <ellipse cx="4.75" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                  <ellipse cx="7.25" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                  <ellipse cx="9.75" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                </svg>
                <span>생년월일</span>
                {sortConfig?.key === 'birth' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 1)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-gender sortable" onClick={() => handleSort('gender')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="5" cy="6" r="2" fill="currentColor"/>
                  <path d="M5 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                  <circle cx="11" cy="6" r="2" fill="currentColor"/>
                  <path d="M11 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                </svg>
                <span>성별</span>
                {sortConfig?.key === 'gender' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 2)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-phone sortable" onClick={() => handleSort('phone')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                </svg>
                <span>전화</span>
                {sortConfig?.key === 'phone' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 3)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-email sortable" onClick={() => handleSort('email')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>이메일</span>
                {sortConfig?.key === 'email' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 4)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-address sortable" onClick={() => handleSort('address')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                </svg>
                <span>주소</span>
                {sortConfig?.key === 'address' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 5)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="header-type sortable" onClick={() => handleSort('type')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
                </svg>
                <span>유형</span>
                {sortConfig?.key === 'type' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                <div
                  className="column-resize-handle"
                  onMouseDown={(e) => handleColumnResize(e, 6)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* 테이블 바디 */}
          <div className="customer-selector-modal__list">
            {displayedCustomers.length === 0 ? (
              <div className="customer-selector-modal__empty">
                {isSearching ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'}
              </div>
            ) : (
              displayedCustomers.map(customer => {
                const birthDate = customer.personal_info?.birth_date;
                const birthDisplay = birthDate
                  ? new Date(birthDate).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')
                  : '-';
                const gender = customer.personal_info?.gender;
                const genderDisplay = gender === 'M' ? '남' : gender === 'F' ? '여' : '-';
                const email = customer.personal_info?.email || '-';
                const emailDisplay = email.length > 25 ? email.substring(0, 22) + '...' : email;
                const address = customer.personal_info?.address;
                const fullAddress = address?.address1
                  ? `${address.address1} ${address.address2 || ''}`.trim()
                  : '-';
                const addressDisplay = fullAddress.length > 30 ? fullAddress.substring(0, 27) + '...' : fullAddress;

                return (
                  <div
                    key={customer._id}
                    className={`customer-selector-modal__customer-row ${
                      selectedCustomer?._id === customer._id ? 'selected' : ''
                    }`}
                    style={{ gridTemplateColumns: columnWidthRatios.map(w => `${w}%`).join(' ') }}
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <div className="cell-name">
                      {customer.personal_info?.name || '이름 없음'}
                    </div>
                    <div className="cell-birth">{birthDisplay}</div>
                    <div className="cell-gender">{genderDisplay}</div>
                    <div className="cell-phone">{customer.personal_info?.mobile_phone || '-'}</div>
                    <div className="cell-email" title={email}>{emailDisplay}</div>
                    <div className="cell-address" title={fullAddress}>{addressDisplay}</div>
                    <div className="cell-type">
                      <span className="type-badge">
                        {customer.insurance_info?.customer_type || '개인'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </DraggableModal>
  );
};

export default CustomerSelectorModal;
