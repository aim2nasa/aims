/**
 * NewCustomerInputModal
 *
 * AR 업로드 시 새 고객명 입력 모달
 * - AIMS Apple 스타일 폼 디자인
 * - 고객명 + 고객유형 (필수)
 * - 상세 정보 접기/펼치기
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import CustomerService from '@/services/customerService';
import { formatPhoneNumber } from '@/shared/lib/phoneUtils';
import { AddressSearchModal } from '@/features/customer/components/AddressSearchModal';
import type { FormattedAddress } from '@/features/customer/api/addressApi';
import './NewCustomerInputModal.css';

export type CustomerType = '개인' | '법인';

export interface NewCustomerInputModalProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** AR 메타데이터 (추출된 고객명) */
  arMetadata: {
    customer_name: string;
    issue_date: string;
  };
  /** 고객 등록 완료 시 콜백 (생성된 고객 ID, 이름, 유형 전달) */
  onSubmit: (customerId: string, customerName: string, customerType: CustomerType) => void;
  /** 뒤로가기 (고객 선택 모달로 돌아가기) - deprecated, 사용하지 않음 */
  onBack?: () => void;
  /** 로딩 상태 */
  isLoading?: boolean;
}

/**
 * 새 고객명 입력 모달
 */
export const NewCustomerInputModal: React.FC<NewCustomerInputModalProps> = ({
  isOpen,
  onClose,
  arMetadata,
  onSubmit,
  isLoading = false,
}) => {
  // 기본 정보
  const [customerName, setCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('개인');

  // 상세 정보 (선택사항)
  const [showDetails, setShowDetails] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [email, setEmail] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // 상태
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 중복 검사 함수 (useEffect 전에 정의)
  const checkDuplicate = useCallback(async (name: string) => {
    if (!name.trim()) {
      setIsDuplicate(false);
      setDuplicateInfo(null);
      return;
    }

    setIsChecking(true);
    try {
      const result = await CustomerService.checkDuplicateName(name.trim());

      if (result.exists) {
        setIsDuplicate(true);
        const typeInfo = result.customer?.customer_type === '법인' ? ' (법인)' : '';
        const statusInfo = result.customer?.status === 'inactive' ? ' (휴면)' : '';
        setDuplicateInfo(`⚠️ "${name}"${typeInfo}${statusInfo} - 중복된 이름입니다!`);
      } else {
        setIsDuplicate(false);
        setDuplicateInfo(null);
      }
    } catch (error) {
      console.error('고객명 중복 검사 오류:', error);
      setIsDuplicate(false);
      setDuplicateInfo(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      const initialName = arMetadata.customer_name || '';
      setCustomerName(initialName);
      setCustomerType('개인');
      setShowDetails(false);
      setBirthDate('');
      setMobilePhone('');
      setEmail('');
      setPostalCode('');
      setAddress1('');
      setAddress2('');
      setIsAddressModalOpen(false);
      setIsDuplicate(false);
      setDuplicateInfo(null);
      setIsChecking(false);
      setIsSubmitting(false);

      // 초기 고객명에 대해 중복 검사 실행
      if (initialName.trim()) {
        checkDuplicate(initialName);
      }

      // 포커스 설정
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, arMetadata.customer_name, checkDuplicate]);

  // 입력값 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerName(value);

    // 이전 debounce 취소
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // 새 debounce 설정 (500ms)
    debounceRef.current = setTimeout(() => {
      checkDuplicate(value);
    }, 500);
  };

  // 등록 핸들러
  const handleSubmit = async () => {
    const trimmedName = customerName.trim();

    if (!trimmedName) {
      return;
    }

    if (isDuplicate) {
      return;
    }

    setIsSubmitting(true);
    try {
      // 고객 등록 데이터 구성
      const customerData: Parameters<typeof CustomerService.createCustomer>[0] = {
        personal_info: {
          name: trimmedName,
          ...(birthDate && { birth_date: birthDate }),
          ...(mobilePhone && { mobile_phone: mobilePhone }),
          ...(email && { email }),
          ...((postalCode || address1 || address2) && {
            address: {
              ...(postalCode && { postal_code: postalCode }),
              ...(address1 && { address1 }),
              ...(address2 && { address2 }),
            },
          }),
        },
        insurance_info: {
          customer_type: customerType,
        },
        contracts: [],
        documents: [],
        consultations: [],
      };

      const result = await CustomerService.createCustomer(customerData);

      if (result._id) {
        onSubmit(result._id, trimmedName, customerType);
      } else {
        console.error('고객 등록 실패: ID 없음');
      }
    } catch (error) {
      console.error('고객 등록 오류:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enter 키 핸들러
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDuplicate && !isChecking && customerName.trim()) {
      handleSubmit();
    }
  };

  const isValid = customerName.trim().length > 0 && !isDuplicate && !isChecking;

  const footer = (
    <div className="ncm-footer">
      <Button
        variant="secondary"
        onClick={onClose}
        disabled={isLoading || isSubmitting}
      >
        취소
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={!isValid || isLoading || isSubmitting}
      >
        {isSubmitting ? '등록 중...' : '등록'}
      </Button>
    </div>
  );

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      title="새 고객 등록"
      size="sm"
      footer={footer}
      backdropClosable={false}
    >
      <div className="ncm">
        {/* 고객명 */}
        <div className={`ncm-row ${isDuplicate ? 'ncm-row--error' : ''}`}>
          <label className="ncm-row__label">고객명</label>
          <div className="ncm-row__content">
            <div className="ncm-row__input-wrap">
              <input
                ref={inputRef}
                type="text"
                className="ncm-row__input"
                value={customerName}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="고객명 입력"
                disabled={isLoading || isSubmitting}
              />
              {isChecking && <span className="ncm-row__status ncm-row__status--checking">...</span>}
              {!isChecking && !isDuplicate && customerName.trim() && (
                <span className="ncm-row__status ncm-row__status--ok">✓</span>
              )}
              {!isChecking && isDuplicate && (
                <span className="ncm-row__status ncm-row__status--error">!</span>
              )}
            </div>
            {isDuplicate && duplicateInfo && (
              <span className="ncm-row__error-msg">{duplicateInfo}</span>
            )}
          </div>
        </div>

        {/* 고객유형 */}
        <div className="ncm-row">
          <label className="ncm-row__label">고객유형</label>
          <div className="ncm-row__content">
            <div className="ncm-radio-group">
              <label className="ncm-radio">
                <input
                  type="radio"
                  name="customer-type"
                  checked={customerType === '개인'}
                  onChange={() => setCustomerType('개인')}
                  disabled={isLoading || isSubmitting}
                />
                <span>개인</span>
              </label>
              <label className="ncm-radio">
                <input
                  type="radio"
                  name="customer-type"
                  checked={customerType === '법인'}
                  onChange={() => setCustomerType('법인')}
                  disabled={isLoading || isSubmitting}
                />
                <span>법인</span>
              </label>
            </div>
          </div>
        </div>

        {/* 힌트 */}
        <div className="ncm-hint">
          동명이인 구분: "{arMetadata.customer_name}-지역" 또는 "-특징"
        </div>

        {/* 상세 정보 토글 */}
        <button
          type="button"
          className={`ncm-toggle ${showDetails ? 'ncm-toggle--open' : ''}`}
          onClick={() => setShowDetails(!showDetails)}
        >
          <svg className="ncm-toggle__icon" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>상세 정보</span>
          <span className="ncm-toggle__badge">선택</span>
        </button>

        {/* 상세 정보 섹션 */}
        {showDetails && (
          <div className="ncm-details">
            <div className="ncm-row ncm-row--compact">
              <label className="ncm-row__label">생년월일</label>
              <div className="ncm-row__content">
                <div className="ncm-row__date-wrap">
                  <input
                    type="date"
                    className="ncm-row__date-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    title="생년월일"
                  />
                </div>
              </div>
            </div>

            <div className="ncm-row ncm-row--compact">
              <label className="ncm-row__label">휴대폰</label>
              <div className="ncm-row__content">
                <input
                  type="tel"
                  className="ncm-row__input"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(formatPhoneNumber(e.target.value))}
                  placeholder="010-1234-5678"
                  maxLength={13}
                  disabled={isLoading || isSubmitting}
                />
              </div>
            </div>

            <div className="ncm-row ncm-row--compact">
              <label className="ncm-row__label">이메일</label>
              <div className="ncm-row__content">
                <input
                  type="email"
                  className="ncm-row__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  disabled={isLoading || isSubmitting}
                />
              </div>
            </div>

            <div className="ncm-row ncm-row--compact">
              <label className="ncm-row__label">주소</label>
              <div className="ncm-row__content">
                <div className="ncm-row__address-wrap">
                  <input
                    type="text"
                    className="ncm-row__input ncm-row__input--readonly"
                    value={address1 ? `${postalCode ? `[${postalCode}] ` : ''}${address1}` : ''}
                    readOnly
                    placeholder="주소 검색을 눌러주세요"
                  />
                  <button
                    type="button"
                    className="ncm-search-btn"
                    onClick={() => setIsAddressModalOpen(true)}
                    disabled={isLoading || isSubmitting}
                  >
                    검색
                  </button>
                </div>
              </div>
            </div>

            {address1 && (
              <div className="ncm-row ncm-row--compact ncm-row--last">
                <label className="ncm-row__label">상세주소</label>
                <div className="ncm-row__content">
                  <input
                    type="text"
                    className="ncm-row__input"
                    value={address2}
                    onChange={(e) => setAddress2(e.target.value)}
                    placeholder="동/호수, 건물명"
                    disabled={isLoading || isSubmitting}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 주소 검색 모달 */}
        {isAddressModalOpen && (
          <AddressSearchModal
            isOpen={isAddressModalOpen}
            onClose={() => setIsAddressModalOpen(false)}
            onAddressSelect={(addr: FormattedAddress) => {
              setPostalCode(addr.postal_code || '');
              setAddress1(addr.address1 || '');
              setAddress2(addr.address2 || '');
              setIsAddressModalOpen(false);
            }}
          />
        )}
      </div>
    </Modal>
  );
};

