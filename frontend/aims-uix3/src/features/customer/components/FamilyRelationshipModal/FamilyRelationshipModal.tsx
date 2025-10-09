/**
 * AIMS UIX-3 Family Relationship Modal
 * @since 2025-10-09
 * @version 1.0.0
 *
 * 🍎 애플 디자인 철학 준수
 * - Progressive Disclosure
 * - 서브틀한 기본 상태
 * - Ant Design 절대 사용 금지
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CustomerService } from '@/services/customerService';
import { RelationshipService } from '@/services/relationshipService';
import type { Customer } from '@/entities/customer/model';
import './FamilyRelationshipModal.css';

// 가족관계등록부 범위 내 관계 유형만 허용
const FAMILY_RELATIONSHIP_TYPES = {
  spouse: { label: '배우자', icon: '💑' },
  parent: { label: '부모', icon: '👨‍👩‍👧‍👦' },
  child: { label: '자녀', icon: '👶' }
};

interface FamilyRelationshipModalProps {
  visible: boolean;
  onCancel: () => void;
  customerId: string;
  onSuccess?: () => void;
}

export const FamilyRelationshipModal: React.FC<FamilyRelationshipModalProps> = ({
  visible,
  onCancel,
  customerId,
  onSuccess
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedRelationType, setSelectedRelationType] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        q: searchValue
      });

      if (result.customers) {
        // 개인 고객만 필터링하고 현재 고객 제외
        const individualCustomers = result.customers.filter((customer: Customer) =>
          customer._id !== customerId &&
          customer.insurance_info?.customer_type === '개인'
        );

        setCustomers(individualCustomers);
      }
    } catch (error) {
      console.error('개인 고객 검색 실패:', error);
      setErrorMessage('고객 검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  }, [customerId]);

  const resetForm = useCallback(() => {
    setSelectedRelationType(null);
    setSelectedCustomer(null);
    setSearchText('');
    setCustomers([]);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, []);

  useEffect(() => {
    if (visible) {
      resetForm();
    }
  }, [visible, resetForm]);

  // 가족구성원과 가족관계가 모두 선택되었는지 확인
  const isFormValid = selectedCustomer && selectedRelationType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || !selectedRelationType) {
      setErrorMessage('가족 구성원과 가족 관계를 모두 선택해주세요');
      return;
    }

    // 자기 자신과의 관계 방지
    if (customerId === selectedCustomer._id) {
      setErrorMessage('자기 자신과는 관계를 설정할 수 없습니다');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const relationshipLabel = FAMILY_RELATIONSHIP_TYPES[selectedRelationType as keyof typeof FAMILY_RELATIONSHIP_TYPES]?.label;

      const relationshipData = {
        relationship_type: selectedRelationType,
        relationship_category: 'family',
        strength: 'strong',
        relationship_details: {
          description: `가족 관계 - ${relationshipLabel}`,
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

      setSuccessMessage('가족 관계가 성공적으로 추가되었습니다.');

      // 성공 후 콜백 호출
      setTimeout(() => {
        onSuccess?.();
        onCancel();
      }, 1000);
    } catch (error) {
      console.error('가족 관계 추가 실패:', error);

      // 더 상세한 에러 메시지 제공
      let errorMsg = '가족 관계 추가 중 오류가 발생했습니다.';

      if (error instanceof Error) {
        if (error.message.includes('유효하지 않은 관계 유형')) {
          errorMsg = '선택한 관계 유형이 지원되지 않습니다. 다른 관계를 선택해주세요.';
        } else if (error.message.includes('이미 존재하는 관계')) {
          errorMsg = '이미 설정된 관계입니다. 기존 관계를 삭제한 후 다시 시도해주세요.';
        } else if (error.message.includes('자기 자신')) {
          errorMsg = '자기 자신과는 관계를 설정할 수 없습니다.';
        } else if (error.message.includes('이미 가족') || error.message.includes('다른 가족')) {
          errorMsg = '선택한 고객은 이미 다른 가족에 속해 있습니다. 가족이 없는 고객만 선택할 수 있습니다.';
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
    setSearchText(customer.personal_info?.name || '');
    setCustomers([]);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setCustomers([]);
    setSelectedCustomer(null);
  };

  if (!visible) return null;

  return (
    <div className="family-modal-overlay" onClick={onCancel}>
      <div className="family-modal" onClick={(e) => e.stopPropagation()}>
        <div className="family-modal__header">
          <div className="family-modal__title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M7.646 1.146a.5.5 0 01.708 0l6 6A.5.5 0 0114 7.5h-.5V14a1 1 0 01-1 1h-3.5a.5.5 0 01-.5-.5V11H7.5v3.5a.5.5 0 01-.5.5H3.5a1 1 0 01-1-1V7.5H2a.5.5 0 01-.354-.854l6-6z"/>
            </svg>
            <span>가족 관계 추가</span>
          </div>
          <button
            className="family-modal__close"
            onClick={onCancel}
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
            </svg>
          </button>
        </div>

        <div className="family-modal__body">
          <div className="family-modal__description">
            개인 고객과의 가족 관계를 설정할 수 있습니다. 법인 고객이나 이미 다른 가족에 속한 고객은 선택할 수 없습니다.
          </div>

          <form onSubmit={handleSubmit}>
            {/* 가족 구성원 선택 */}
            <div className="form-section">
              <label className="form-label">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="5" r="2.5"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
                </svg>
                <span>가족 구성원 선택</span>
              </label>

              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  className="form-input"
                  placeholder="고객 이름을 입력하여 검색하세요"
                  value={searchText}
                  onChange={handleSearchChange}
                  autoComplete="off"
                />

                {searchText && (
                  <button
                    type="button"
                    className="autocomplete-clear"
                    onClick={handleClearSearch}
                    aria-label="검색어 지우기"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="8" r="8" opacity="0.2"/>
                      <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                    </svg>
                  </button>
                )}

                {searchLoading && (
                  <div className="autocomplete-loading">
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                )}

                {customers.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {customers.map((customer) => (
                      <button
                        key={customer._id}
                        type="button"
                        className="autocomplete-option"
                        onClick={() => handleCustomerSelect(customer)}
                      >
                        <div className="autocomplete-option__avatar">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="5" r="2.5"/>
                            <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
                          </svg>
                        </div>
                        <span className="autocomplete-option__name">
                          {customer.personal_info?.name}
                        </span>
                        <span className="autocomplete-option__tag">개인</span>
                        {customer.personal_info?.birth_date && (
                          <span className="autocomplete-option__year">
                            ({new Date(customer.personal_info.birth_date).getFullYear()}년생)
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {searchText && !searchLoading && customers.length === 0 && (
                  <div className="autocomplete-empty">
                    검색 결과가 없습니다
                  </div>
                )}
              </div>
            </div>

            {/* 가족 관계 선택 */}
            <div className="form-section">
              <label className="form-label">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d="M7.646 1.146a.5.5 0 01.708 0l6 6A.5.5 0 0114 7.5h-.5V14a1 1 0 01-1 1h-3.5a.5.5 0 01-.5-.5V11H7.5v3.5a.5.5 0 01-.5.5H3.5a1 1 0 01-1-1V7.5H2a.5.5 0 01-.354-.854l6-6z"/>
                </svg>
                <span>가족 관계</span>
              </label>

              <select
                className="form-select"
                value={selectedRelationType || ''}
                onChange={(e) => setSelectedRelationType(e.target.value)}
                disabled={!selectedCustomer}
              >
                <option value="">
                  {selectedCustomer ? '가족 관계를 선택하세요' : '먼저 가족 구성원을 선택해주세요'}
                </option>
                {Object.entries(FAMILY_RELATIONSHIP_TYPES).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.icon} {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 자동 설정 안내 */}
            <div className="family-modal__info">
              💡 <strong>자동 설정:</strong> 가족 관계는 강한 관계 강도, 주간 연락 빈도, 높은 영향력으로 자동 설정되며,
              교차판매 기회와 높은 추천 잠재력이 활성화됩니다.
            </div>

            {/* 에러 메시지 */}
            {errorMessage && (
              <div className="family-modal__error">
                {errorMessage}
              </div>
            )}

            {/* 성공 메시지 */}
            {successMessage && (
              <div className="family-modal__success">
                {successMessage}
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="family-modal__actions">
              <button
                type="button"
                className="family-modal__button family-modal__button--cancel"
                onClick={onCancel}
                disabled={loading}
              >
                취소
              </button>
              <button
                type="submit"
                className="family-modal__button family-modal__button--primary"
                disabled={!isFormValid || loading}
              >
                {loading ? '추가 중...' : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1l-6 3v4c0 4 3 7 6 7s6-3 6-7V4l-6-3z"/>
                    </svg>
                    가족 관계 추가
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FamilyRelationshipModal;
