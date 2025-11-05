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

  // 표시할 고객 목록 (탭 + 초성 필터링)
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
        return getInitialConsonant(name) === selectedInitial;
      });
    }

    return customers;
  }, [activeTab, allCustomers, personalCustomers, corporateCustomers, isSearching, searchResults, selectedInitial]);

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
      initialWidth={950}
      initialHeight={700}
      minWidth={500}
      minHeight={500}
      showHeader={true}
      showResetButton={true}
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
                name="person.3"
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
                name="building.2"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="customer-selector-modal__tab-icon"
                decorative
              />
              법인 ({corporateCustomers.length})
            </button>
          </div>

          {/* 한글 초성 인덱스 */}
          <div className="customer-selector-modal__initials">
            {['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map(initial => (
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
                  ✕
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
            <div className="customer-selector-modal__table-header">
              <div className="header-name">이름</div>
              <div className="header-birth">생년월일</div>
              <div className="header-gender">성별</div>
              <div className="header-phone">전화</div>
              <div className="header-email">이메일</div>
              <div className="header-address">주소</div>
              <div className="header-type">유형</div>
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
                const isCorporate = customer.insurance_info?.customer_type === '법인';
                const birthDate = customer.personal_info?.birth_date;
                const birthDisplay = birthDate
                  ? new Date(birthDate).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '')
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
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <div className="cell-name">
                      <SFSymbol
                        name={isCorporate ? 'building.2' : 'person.circle'}
                        size={SFSymbolSize.FOOTNOTE}
                        weight={SFSymbolWeight.MEDIUM}
                        className="customer-icon"
                        decorative
                      />
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
                    {selectedCustomer?._id === customer._id && (
                      <SFSymbol
                        name="checkmark.circle.fill"
                        size={SFSymbolSize.CALLOUT}
                        weight={SFSymbolWeight.SEMIBOLD}
                        className="check-icon"
                        decorative
                      />
                    )}
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
