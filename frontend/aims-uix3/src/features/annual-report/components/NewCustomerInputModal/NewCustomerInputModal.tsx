/**
 * NewCustomerInputModal
 *
 * AR 업로드 시 새 고객명 입력 모달
 * - 새 고객명 입력
 * - 실시간 중복 검사
 * - 고객 등록 + AR 저장
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import CustomerService from '@/services/customerService';
import './NewCustomerInputModal.css';

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
  /** 고객 등록 완료 시 콜백 (생성된 고객 ID 전달) */
  onSubmit: (customerId: string, customerName: string) => void;
  /** 뒤로가기 (고객 선택 모달로 돌아가기) */
  onBack?: () => void;
  /** 로딩 상태 */
  isLoading?: boolean;
}

/**
 * 새 고객명 입력 모달
 *
 * Case 2.2: 새 고객으로 등록 선택 시 표시
 * - 고객명 입력
 * - 실시간 중복 검사 (debounce)
 * - 유효성 검증
 */
export const NewCustomerInputModal: React.FC<NewCustomerInputModalProps> = ({
  isOpen,
  onClose,
  arMetadata,
  onSubmit,
  onBack,
  isLoading = false,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setCustomerName(arMetadata.customer_name || '');
      setIsDuplicate(false);
      setDuplicateInfo(null);
      setIsChecking(false);
      setIsSubmitting(false);

      // 포커스 설정
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, arMetadata.customer_name]);

  // 중복 검사 (debounce)
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
        setDuplicateInfo(`"${name}"${typeInfo}${statusInfo}은 이미 등록된 고객입니다.`);
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
      // 고객 등록
      const result = await CustomerService.createCustomer({
        personal_info: {
          name: trimmedName,
        },
        insurance_info: {
          customer_type: '개인',
        },
        contracts: [],
        documents: [],
        consultations: [],
      });

      if (result._id) {
        onSubmit(result._id, trimmedName);
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
    <div className="new-customer-input-modal__footer">
      {onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={isLoading || isSubmitting}
        >
          뒤로
        </Button>
      )}
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
        {isSubmitting ? '등록 중...' : '등록 및 저장'}
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
      <div className="new-customer-input-modal">
        <p className="new-customer-input-modal__description">
          새 고객명을 입력하세요.
        </p>

        <div className="new-customer-input-modal__input-group">
          <label className="new-customer-input-modal__label" htmlFor="customer-name">
            고객명
          </label>
          <input
            ref={inputRef}
            id="customer-name"
            type="text"
            className={`new-customer-input-modal__input ${isDuplicate ? 'new-customer-input-modal__input--error' : ''}`}
            value={customerName}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="고객명을 입력하세요"
            disabled={isLoading || isSubmitting}
          />
          {isChecking && (
            <span className="new-customer-input-modal__checking">
              확인 중...
            </span>
          )}
        </div>

        {isDuplicate && duplicateInfo && (
          <div className="new-customer-input-modal__error">
            {duplicateInfo}
          </div>
        )}

        <div className="new-customer-input-modal__hint">
          추천 형식: "{arMetadata.customer_name} [지역]", "{arMetadata.customer_name} [특징]"
        </div>
      </div>
    </Modal>
  );
};

export default NewCustomerInputModal;
