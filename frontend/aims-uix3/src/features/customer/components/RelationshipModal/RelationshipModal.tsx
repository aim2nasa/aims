/**
 * AIMS UIX-3 Relationship Modal (공통 관계 추가 모달)
 * @since 2025-11-01
 * @version 2.0.0 - Modal 컴포넌트 기반으로 마이그레이션 (Phase 5)
 * @updated 2025-11-06
 *
 * 🍎 애플 디자인 철학 준수
 * - Progressive Disclosure
 * - 서브틀한 기본 상태
 * - 가족관계와 법인관계 공통 사용
 */

import React, { useState, useEffect, useCallback } from 'react';
import Modal from '@/shared/ui/Modal';
import Button from '@/shared/ui/Button';
import { CustomerService } from '@/services/customerService';
import { RelationshipService } from '@/services/relationshipService';
import type { Customer } from '@/entities/customer/model';
import { errorReporter } from '@/shared/lib/errorReporter';
import './RelationshipModal.css';

export interface RelationshipType {
  value: string;
  label: string;
  icon: string;
  description?: string;
}

export interface RelationshipModalProps {
  visible: boolean;
  onCancel: () => void;
  customerId: string;
  onSuccess?: () => void;

  // 차별화 요소
  title: string;  // "가족 관계 추가" 또는 "법인 관계자 추가"
  titleIcon: React.ReactNode;  // SVG 아이콘
  memberLabel: string;  // "가족 구성원" 또는 "관계자"
  relationshipCategory: 'family' | 'corporate';  // API 전송용
  relationshipTypes: RelationshipType[];  // 관계 타입 목록
  allowCustomRelation?: boolean;  // 사용자 입력 관계 허용 여부
  filterCustomerType?: '개인' | '법인';  // 검색할 고객 유형 필터

  // 고객 선택 방식 커스터마이즈
  useSelectorModal?: boolean;  // true이면 검색 입력 대신 선택 버튼 표시
  onSelectorButtonClick?: () => void;  // 선택 버튼 클릭 핸들러
  selectorButtonLabel?: string;  // 선택 버튼 레이블
  selectedCustomerFromExternal?: Customer | null;  // 외부에서 선택한 고객
}

export const RelationshipModal: React.FC<RelationshipModalProps> = ({
  visible,
  onCancel,
  customerId,
  onSuccess,
  title,
  titleIcon,
  memberLabel,
  relationshipCategory,
  relationshipTypes,
  allowCustomRelation = false,
  filterCustomerType = '개인',
  useSelectorModal = false,
  onSelectorButtonClick,
  selectorButtonLabel = '선택',
  selectedCustomerFromExternal
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedRelationType, setSelectedRelationType] = useState<string | null>(null);
  const [customRelationType, setCustomRelationType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [alreadyRelatedCustomers, setAlreadyRelatedCustomers] = useState<Set<string>>(new Set());

  // 고객 검색
  const searchCustomers = useCallback(async (searchValue: string = '') => {
    if (!searchValue.trim()) {
      setCustomers([]);
      return;
    }

    try {
      setSearchLoading(true);
      const result = await CustomerService.getCustomers({
        page: 1,
        limit: 50,
        search: searchValue
      });

      if (result.customers) {
        const normalizedSearch = searchValue.trim().toLowerCase();
        // 지정된 고객 유형만 필터링하고 현재 고객 제외, 이미 관계가 있는 고객 제외
        const filteredCustomers = result.customers.filter((customer: Customer) =>
          customer._id !== customerId &&
          customer.insurance_info?.customer_type === filterCustomerType &&
          !alreadyRelatedCustomers.has(customer._id) &&
          (customer.personal_info?.name || '').toLowerCase().includes(normalizedSearch)
        );

        setCustomers(filteredCustomers);
      }
    } catch (error) {
      console.error('고객 검색 실패:', error);
      setErrorMessage('고객 검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  }, [customerId, alreadyRelatedCustomers, filterCustomerType]);

  // 이미 관계가 있는 고객들을 식별하는 함수
  const identifyRelatedCustomers = useCallback(async () => {
    try {
      // 모든 관계 데이터 로드
      const allData = await RelationshipService.getAllRelationshipsWithCustomers();
      const { relationships } = allData;
      const relatedCustomers = new Set<string>();

      // 현재 고객(customerId)과 이미 관계를 맺은 고객들을 찾음
      relationships.forEach(relationship => {
        const category = relationship.relationship_info.relationship_category;
        const fromCustomer = relationship.from_customer;
        const toCustomer = relationship.related_customer;

        // 현재 카테고리의 관계만 확인
        if (category !== relationshipCategory) {
          return;
        }

        // 현재 고객(customerId)이 from_customer인 경우
        if (typeof fromCustomer === 'object' && fromCustomer?._id === customerId) {
          // 관련된 고객(to_customer)가 필터 타입과 일치하면 제외 대상
          if (typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === filterCustomerType) {
            relatedCustomers.add(toCustomer._id);
          }
        }

        // 현재 고객(customerId)이 to_customer인 경우 (역방향 관계)
        if (typeof toCustomer === 'object' && toCustomer?._id === customerId) {
          // 관련된 고객(from_customer)가 필터 타입과 일치하면 제외 대상
          if (typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === filterCustomerType) {
            relatedCustomers.add(fromCustomer._id);
          }
        }
      });

      setAlreadyRelatedCustomers(relatedCustomers);
    } catch (error) {
      console.error('[RelationshipModal] 관계 고객 식별 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'RelationshipModal.identifyRelatedCustomers' });
      setAlreadyRelatedCustomers(new Set());
    }
  }, [customerId, relationshipCategory, filterCustomerType]);

  const resetForm = useCallback(() => {
    setSelectedRelationType(null);
    setCustomRelationType('');
    setSelectedCustomer(null);
    setSearchText('');
    setCustomers([]);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, []);

  useEffect(() => {
    if (visible) {
      resetForm();
      identifyRelatedCustomers();
    }
  }, [visible, resetForm, identifyRelatedCustomers]);

  // 외부에서 선택한 고객을 내부 상태로 동기화
  useEffect(() => {
    if (selectedCustomerFromExternal) {
      setSelectedCustomer(selectedCustomerFromExternal);
      setSearchText(selectedCustomerFromExternal.personal_info?.name || '');
    }
  }, [selectedCustomerFromExternal]);

  // 폼 유효성 검사
  const isFormValid = selectedCustomer && (
    selectedRelationType === 'custom'
      ? customRelationType.trim().length > 0
      : selectedRelationType !== null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || !selectedRelationType) {
      setErrorMessage(`${memberLabel}과 관계를 모두 선택해주세요`);
      return;
    }

    // 사용자 입력 관계 검증
    if (selectedRelationType === 'custom' && !customRelationType.trim()) {
      setErrorMessage('관계를 입력해주세요');
      return;
    }

    // 자기 자신과의 관계 방지
    if (customerId === selectedCustomer._id) {
      setErrorMessage('자기 자신과는 관계를 설정할 수 없습니다');
      return;
    }

    // 이미 관계가 있는 고객과의 관계 방지
    if (alreadyRelatedCustomers.has(selectedCustomer._id)) {
      setErrorMessage(`선택한 고객은 이미 다른 ${relationshipCategory === 'family' ? '가족' : '법인'}에 속해 있습니다.`);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      // 실제 관계 타입 결정
      const actualRelationType = selectedRelationType === 'custom'
        ? customRelationType.trim()
        : selectedRelationType;

      const relationshipLabel = selectedRelationType === 'custom'
        ? customRelationType.trim()
        : relationshipTypes.find(rt => rt.value === selectedRelationType)?.label || actualRelationType;

      const relationshipData = {
        relationship_type: actualRelationType,
        relationship_category: relationshipCategory,
        strength: 'strong',
        relationship_details: {
          description: `${relationshipCategory === 'family' ? '가족' : '법인'} 관계 - ${relationshipLabel}`,
          contact_frequency: 'weekly',
          influence_level: 'high'
        },
        insurance_relevance: {
          is_beneficiary: false,
          cross_selling_opportunity: true,
          referral_potential: 'high'
        }
      };

      // 실제 API 호출
      await RelationshipService.createRelationship(customerId, selectedCustomer._id, relationshipData);

      setSuccessMessage('관계가 성공적으로 추가되었습니다.');

      // 성공 후 콜백 호출
      setTimeout(() => {
        onSuccess?.();
        onCancel();
      }, 1000);
    } catch (error) {
      console.error('관계 추가 실패:', error);

      // 더 상세한 에러 메시지 제공
      let errorMsg = '관계 추가 중 오류가 발생했습니다.';

      if (error instanceof Error) {
        if (error.message.includes('유효하지 않은 관계 유형')) {
          errorMsg = '선택한 관계 유형이 지원되지 않습니다. 다른 관계를 선택해주세요.';
        } else if (error.message.includes('이미 존재하는 관계')) {
          errorMsg = '이미 설정된 관계입니다. 기존 관계를 삭제한 후 다시 시도해주세요.';
        } else if (error.message.includes('자기 자신')) {
          errorMsg = '자기 자신과는 관계를 설정할 수 없습니다.';
        } else if (error.message.includes('이미 관계') || error.message.includes('다른 관계')) {
          errorMsg = `선택한 고객은 이미 다른 ${relationshipCategory === 'family' ? '가족' : '법인'}에 속해 있습니다.`;
        } else {
          errorMsg = error.message;
        }
      }

      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);

    if (!value.trim()) {
      setCustomers([]);
      setSelectedCustomer(null);
    } else {
      searchCustomers(value);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedRelationType(null);
    setCustomRelationType('');
    setSearchText(customer.personal_info?.name || '');
    setCustomers([]);
    setErrorMessage(null);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setCustomers([]);
    setSelectedCustomer(null);
    setSelectedRelationType(null);
    setCustomRelationType('');
    setErrorMessage(null);
  };

  const handleRelationTypeSelect = (type: string) => {
    if (!selectedCustomer) {
      setSelectedRelationType(null);
      return;
    }

    setSelectedRelationType(type || null);
    if (type !== 'custom') {
      setCustomRelationType('');
    }
    setErrorMessage(null);
  };

  const footer = (
    <div className="relationship-modal__actions">
      <Button
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={loading}
        className="relationship-modal__button relationship-modal__button--cancel"
      >
        취소
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        form="relationship-form"
        disabled={!isFormValid || loading}
        loading={loading}
        leftIcon={
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1l-6 3v4c0 4 3 7 6 7s6-3 6-7V4l-6-3z" />
          </svg>
        }
        className="relationship-modal__button relationship-modal__button--primary"
      >
        관계 추가
      </Button>
    </div>
  );

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title={
        <div className="relationship-modal__title">
          {titleIcon}
          <span>{title}</span>
        </div>
      }
      size="sm"
      footer={footer}
      ariaLabel={title}
      className="relationship-modal"
    >
      <div className="relationship-modal__body">
        <form id="relationship-form" className="relationship-modal__form" onSubmit={handleSubmit}>
            {/* 고객 선택 */}
            <section className="relationship-modal__field">
              <div className="relationship-modal__field-header">
                <div className="relationship-modal__field-title">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="5" r="2.5" />
                    <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" />
                  </svg>
                  <span>{memberLabel} 선택</span>
                </div>
                {selectedCustomer && <span className="relationship-modal__badge">선택됨</span>}
              </div>

              {/* 선택 버튼 모드 */}
              {useSelectorModal ? (
                <div className="relationship-modal__selector-button-wrapper">
                  {selectedCustomer ? (
                    <div className="relationship-modal__selected-customer">
                      <div className="relationship-modal__selected-customer-info">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="5" r="2.5" />
                          <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" />
                        </svg>
                        <span>{selectedCustomer.personal_info?.name || '이름 없음'}</span>
                      </div>
                      <button
                        type="button"
                        className="relationship-modal__change-button"
                        onClick={onSelectorButtonClick}
                      >
                        변경
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={onSelectorButtonClick}
                      type="button"
                      className="relationship-modal__selector-button"
                    >
                      {selectorButtonLabel}
                    </Button>
                  )}
                </div>
              ) : (
                /* 검색 입력 모드 */
                <div className="autocomplete-wrapper relationship-modal__search">
                <input
                  type="text"
                  className="form-input relationship-modal__input"
                  placeholder="고객 이름을 입력하여 검색하세요"
                  value={searchText}
                  onChange={handleSearchChange}
                  autoComplete="off"
                />

                <div className="relationship-modal__input-affix">
                  {searchLoading ? (
                    <div className="autocomplete-loading" role="status" aria-live="polite">
                      <svg className="spinner" width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                  ) : searchText ? (
                    <button
                      type="button"
                      className="relationship-modal__input-clear"
                      onClick={handleClearSearch}
                      aria-label="검색어 지우기"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                      </svg>
                    </button>
                  ) : (
                    <span className="relationship-modal__input-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.397l3.86 3.86a.75.75 0 101.06-1.061l-3.523-3.523zM7 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11z" />
                      </svg>
                    </span>
                  )}
                </div>

                {customers.length > 0 && (
                  <div className="autocomplete-dropdown" role="listbox">
                    {customers.map((customer) => {
                      const customerName = customer.personal_info?.name;

                      return (
                        <button
                          key={customer._id}
                          type="button"
                          className="autocomplete-option"
                          onClick={() => handleCustomerSelect(customer)}
                          role="option"
                        >
                          <div className="autocomplete-option__avatar" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <circle cx="8" cy="5" r="2.5" />
                              <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" />
                            </svg>
                          </div>
                          <span className="autocomplete-option__name">{customerName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {searchText && !searchLoading && customers.length === 0 && !selectedCustomer && (
                  <div className="autocomplete-empty">검색 결과가 없습니다</div>
                )}
                </div>
              )}
            </section>

            {/* 관계 유형 선택 */}
            <section className="relationship-modal__field">
              <div className="relationship-modal__field-header">
                <div className="relationship-modal__field-title">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M7.646 1.146a.5.5 0 01.708 0l6 6A.5.5 0 0114 7.5h-.5V14a1 1 0 01-1 1h-3.5a.5.5 0 01-.5-.5V11H7.5v3.5a.5.5 0 01-.5.5H3.5a1 1 0 01-1-1V7.5H2a.5.5 0 01-.354-.854l6-6z" />
                  </svg>
                  <span>관계 유형 선택</span>
                </div>
                {!selectedCustomer && <span className="relationship-modal__badge relationship-modal__badge--muted">{memberLabel} 먼저 선택</span>}
              </div>
              <select
                className="form-select"
                value={selectedRelationType || ''}
                onChange={(e) => handleRelationTypeSelect(e.target.value)}
                disabled={!selectedCustomer}
              >
                <option value="">
                  {selectedCustomer ? '관계를 선택하세요' : `먼저 ${memberLabel}을(를) 선택해주세요`}
                </option>
                {relationshipTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
                {allowCustomRelation && (
                  <option value="custom">✏️ 직접 입력</option>
                )}
              </select>
            </section>

            {/* 사용자 입력 관계 (선택 시) */}
            {allowCustomRelation && selectedRelationType === 'custom' && (
              <section className="relationship-modal__field">
                <div className="relationship-modal__field-header">
                  <div className="relationship-modal__field-title">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M12.146 2.854a.5.5 0 010 .707L10.707 5H14a.5.5 0 010 1h-4.5a.5.5 0 01-.5-.5V1a.5.5 0 011 0v3.293l1.439-1.439a.5.5 0 01.707 0z"/>
                      <path d="M2 8a1 1 0 011-1h3a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V8zm7.5 0a1 1 0 011-1h3a1 1 0 011 1v5a1 1 0 01-1 1h-3a1 1 0 01-1-1V8z"/>
                    </svg>
                    <span>관계 입력</span>
                  </div>
                </div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="예: 사업 파트너, 지인 등"
                  value={customRelationType}
                  onChange={(e) => setCustomRelationType(e.target.value)}
                  maxLength={20}
                />
              </section>
            )}

            {/* 에러 메시지 */}
            {errorMessage && <div className="relationship-modal__error">{errorMessage}</div>}

            {/* 성공 메시지 */}
            {successMessage && <div className="relationship-modal__success">{successMessage}</div>}
          </form>
        </div>
    </Modal>
  );
};

export default RelationshipModal;
