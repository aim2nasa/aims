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
  // 펼쳐진 트리 노드
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  // 선택된 고객
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // 모달 열릴 때 전체 고객 로드
  useEffect(() => {
    if (visible) {
      console.log('[CustomerSelectorModal] 고객 데이터 로딩 시작');
      loadCustomers({ limit: 10000, page: 1 });
      setSelectedCustomer(null);
      setSearchQuery('');
      setExpandedNodes(new Set());
    }
  }, [visible, loadCustomers]);

  // 개인/법인으로 분류
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

    return { personalCustomers: personal, corporateCustomers: corporate };
  }, [allCustomers]);

  // 검색 필터링
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return allCustomers.filter(customer => {
      const name = customer.personal_info?.name?.toLowerCase() || '';
      const phone = customer.personal_info?.mobile_phone?.replace(/-/g, '') || '';
      return name.includes(query) || phone.includes(query);
    });
  }, [allCustomers, searchQuery]);

  // 트리 노드 토글
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

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

  const isSearching = searchQuery.trim().length > 0;

  console.log('[CustomerSelectorModal] 렌더링:', {
    isLoading,
    allCustomersCount: allCustomers.length,
    personalCount: personalCustomers.length,
    corporateCount: corporateCustomers.length,
    isSearching,
    searchResultsCount: searchResults.length
  });

  return (
    <DraggableModal
      visible={visible}
      onClose={onClose}
      title="고객 선택"
      initialWidth={600}
      initialHeight={700}
      minWidth={500}
      minHeight={500}
      showHeader={true}
      footer={
        <div className="customer-selector-modal__footer-buttons">
          <button
            className="customer-selector-modal__button customer-selector-modal__button--secondary"
            onClick={onClose}
          >
            취소
          </button>
          <button
            className="customer-selector-modal__button customer-selector-modal__button--primary"
            onClick={handleConfirm}
            disabled={!selectedCustomer}
          >
            선택 완료
          </button>
        </div>
      }
    >
      {/* 검색 입력 */}
      <div className="customer-selector-modal__search">
        <input
          type="text"
          className="customer-selector-modal__search-input"
          placeholder="고객 이름 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="customer-selector-modal__loading">
          고객 이름 검색 중...
        </div>
      )}

      {/* 고객 목록 */}
      {!isLoading && (
        <div className="customer-selector-modal__list">
          {isSearching ? (
            // 검색 결과
            searchResults.length === 0 ? (
              <div className="customer-selector-modal__empty">
                검색 결과가 없습니다
              </div>
            ) : (
              searchResults.map(customer => (
                <div
                  key={customer._id}
                  className={`customer-selector-modal__customer-item ${
                    selectedCustomer?._id === customer._id ? 'selected' : ''
                  }`}
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <div className="customer-selector-modal__customer-name">
                    {customer.personal_info?.name || '이름 없음'}
                  </div>
                  <div className="customer-selector-modal__customer-meta">
                    <span className="customer-selector-modal__customer-type">
                      {customer.insurance_info?.customer_type || '개인'}
                    </span>
                    {customer.personal_info?.mobile_phone && (
                      <span className="customer-selector-modal__customer-phone">
                        {customer.personal_info.mobile_phone}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            // 트리 구조
            <>
              {allCustomers.length === 0 ? (
                <div className="customer-selector-modal__empty">
                  등록된 고객이 없습니다
                </div>
              ) : (
                <>
                  {/* 개인 그룹 */}
                  <div className="customer-selector-modal__tree-group">
                    <div
                      className="customer-selector-modal__tree-header"
                      onClick={() => toggleNode('personal')}
                    >
                      <span className="customer-selector-modal__tree-icon">
                        {expandedNodes.has('personal') ? '▼' : '▶'}
                      </span>
                      <span className="customer-selector-modal__tree-title">
                        개인 ({personalCustomers.length})
                      </span>
                    </div>
                    {expandedNodes.has('personal') && (
                      <div className="customer-selector-modal__tree-items">
                        {personalCustomers.map(customer => (
                          <div
                            key={customer._id}
                            className={`customer-selector-modal__customer-item ${
                              selectedCustomer?._id === customer._id ? 'selected' : ''
                            }`}
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <div className="customer-selector-modal__customer-name">
                              {customer.personal_info?.name || '이름 없음'}
                            </div>
                            {customer.personal_info?.mobile_phone && (
                              <div className="customer-selector-modal__customer-phone">
                                {customer.personal_info.mobile_phone}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 법인 그룹 */}
                  <div className="customer-selector-modal__tree-group">
                    <div
                      className="customer-selector-modal__tree-header"
                      onClick={() => toggleNode('corporate')}
                    >
                      <span className="customer-selector-modal__tree-icon">
                        {expandedNodes.has('corporate') ? '▼' : '▶'}
                      </span>
                      <span className="customer-selector-modal__tree-title">
                        법인 ({corporateCustomers.length})
                      </span>
                    </div>
                    {expandedNodes.has('corporate') && (
                      <div className="customer-selector-modal__tree-items">
                        {corporateCustomers.map(customer => (
                          <div
                            key={customer._id}
                            className={`customer-selector-modal__customer-item ${
                              selectedCustomer?._id === customer._id ? 'selected' : ''
                            }`}
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <div className="customer-selector-modal__customer-name">
                              {customer.personal_info?.name || '이름 없음'}
                            </div>
                            {customer.personal_info?.mobile_phone && (
                              <div className="customer-selector-modal__customer-phone">
                                {customer.personal_info.mobile_phone}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </DraggableModal>
  );
};

export default CustomerSelectorModal;
