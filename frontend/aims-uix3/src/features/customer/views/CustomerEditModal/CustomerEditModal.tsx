/**
 * CustomerEditModal Component
 * @since 2025-10-03
 * @version 2.0.0
 *
 * 고객 정보 수정 모달 컴포넌트
 * ✅ 고객 등록 UI와 완벽히 일치하는 구조
 * ✅ 동일한 섹션 컴포넌트 재사용
 *
 * Features:
 * - React Portal 사용
 * - ESC 키로 닫기
 * - iOS Settings 스타일 디자인
 * - 4개 탭: 기본 정보 / 연락처 정보 / 주소 정보 / 보험 정보
 */

import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Customer } from '@/entities/customer';
import { useCustomerEditController } from '../../controllers/useCustomerEditController';
import { BasicInfoSection } from '../CustomerRegistrationView/components/BasicInfoSection';
import type { BasicInfoFormData } from '../CustomerRegistrationView/components/BasicInfoSection';
import { ContactSection } from '../CustomerRegistrationView/components/ContactSection';
import type { ContactFormData } from '../CustomerRegistrationView/components/ContactSection';
import { AddressSection } from '../CustomerRegistrationView/components/AddressSection';
import type { AddressFormData } from '../CustomerRegistrationView/components/AddressSection';
import { InsuranceInfoSection } from '../CustomerRegistrationView/components/InsuranceInfoSection';
import type { InsuranceFormData } from '../CustomerRegistrationView/components/InsuranceInfoSection';
import './CustomerEditModal.css';

interface CustomerEditModalProps {
  /** 모달 표시 여부 */
  visible: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 수정할 고객 정보 */
  customer: Customer;
  /** 저장 성공 시 콜백 */
  onSuccess?: () => void;
}

/**
 * CustomerEditModal React 컴포넌트
 *
 * 고객 정보를 수정할 수 있는 모달
 * 고객 등록 UI와 완벽히 동일한 구조와 레이아웃
 *
 * @example
 * ```tsx
 * <CustomerEditModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   customer={selectedCustomer}
 *   onSuccess={handleRefresh}
 * />
 * ```
 */
export const CustomerEditModal: React.FC<CustomerEditModalProps> = ({
  visible,
  onClose,
  customer,
  onSuccess,
}) => {
  // Controller Hook
  const {
    formData,
    activeTab,
    errors,
    isSubmitting,
    handleFieldChange,
    handleTabChange,
    handleSave,
  } = useCustomerEditController(customer);

  /**
   * ESC 키로 모달 닫기
   */
  useEffect(() => {
    if (!visible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [visible, onClose]);

  /**
   * 저장 버튼 클릭 핸들러
   */
  const handleSaveClick = useCallback(async () => {
    const success = await handleSave();
    if (success) {
      onSuccess?.();
      onClose();
    }
  }, [handleSave, onSuccess, onClose]);

  /**
   * 배경 클릭으로 모달 닫기
   */
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleBasicInfoChange = useCallback(
    (field: keyof BasicInfoFormData, value: BasicInfoFormData[keyof BasicInfoFormData]) => {
      handleFieldChange(`personal_info.${field}`, value)
    },
    [handleFieldChange]
  )

  const handleContactChange = useCallback(
    (field: keyof ContactFormData, value: ContactFormData[keyof ContactFormData]) => {
      handleFieldChange(`personal_info.${field}`, value)
    },
    [handleFieldChange]
  )

  const handleInsuranceChange = useCallback(
    (field: keyof InsuranceFormData, value: InsuranceFormData[keyof InsuranceFormData]) => {
      handleFieldChange(`insurance_info.${field}`, value)
    },
    [handleFieldChange]
  )

  if (!visible) return null;

  // 폼 데이터를 섹션 컴포넌트 형식으로 변환
  const basicInfoData: BasicInfoFormData = {
    name: formData.personal_info?.name ?? ''
  };
  if (formData.personal_info?.name_en !== undefined) basicInfoData.name_en = formData.personal_info.name_en;
  if (formData.personal_info?.birth_date !== undefined) basicInfoData.birth_date = formData.personal_info.birth_date;
  if (formData.personal_info?.gender !== undefined) basicInfoData.gender = formData.personal_info.gender;

  const contactData: ContactFormData = {
    mobile_phone: formData.personal_info?.mobile_phone ?? '',
    home_phone: formData.personal_info?.home_phone ?? '',
    work_phone: formData.personal_info?.work_phone ?? '',
    email: formData.personal_info?.email ?? ''
  };

  const addressData: AddressFormData = {
    postal_code: formData.personal_info?.address?.postal_code,
    address1: formData.personal_info?.address?.address1,
    address2: formData.personal_info?.address?.address2
  };

  const insuranceData: InsuranceFormData = {
    customer_type: formData.insurance_info?.customer_type ?? '개인'
  };

  return createPortal(
    <div
      className="customer-edit-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-edit-modal-title"
    >
      <div className="customer-edit-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 🍎 헤더 영역 - iOS Title Bar */}
        <div className="customer-edit-modal-header">
          <h2 id="customer-edit-modal-title" className="customer-edit-modal-title">
            고객 정보 수정
          </h2>
          <button
            type="button"
            className="customer-edit-modal-close-button"
            onClick={onClose}
            aria-label="모달 닫기"
          >
            ✕
          </button>
        </div>

        {/* 🍎 탭 네비게이션 - 고객 등록과 동일한 4개 탭 */}
        <div className="customer-edit-modal-tabs">
          <button
            type="button"
            className={`customer-edit-modal-tab ${activeTab === 'info' ? 'customer-edit-modal-tab--active' : ''}`}
            onClick={() => handleTabChange('info')}
          >
            기본 정보
          </button>
          <button
            type="button"
            className={`customer-edit-modal-tab ${activeTab === 'contact' ? 'customer-edit-modal-tab--active' : ''}`}
            onClick={() => handleTabChange('contact')}
          >
            연락처 정보
          </button>
          <button
            type="button"
            className={`customer-edit-modal-tab ${activeTab === 'address' ? 'customer-edit-modal-tab--active' : ''}`}
            onClick={() => handleTabChange('address')}
          >
            주소 정보
          </button>
          <button
            type="button"
            className={`customer-edit-modal-tab ${activeTab === 'insurance' ? 'customer-edit-modal-tab--active' : ''}`}
            onClick={() => handleTabChange('insurance')}
          >
            보험 정보
          </button>
        </div>

        {/* 🍎 콘텐츠 영역 - 고객 등록의 섹션 컴포넌트 재사용 */}
        <div className="customer-edit-modal-content">
          {/* 기본 정보 탭 */}
          {activeTab === 'info' && (
            <BasicInfoSection
              formData={basicInfoData}
              errors={errors}
              onChange={handleBasicInfoChange}
            />
          )}

          {/* 연락처 정보 탭 */}
          {activeTab === 'contact' && (
            <ContactSection
              formData={contactData}
              errors={errors}
              onChange={handleContactChange}
            />
          )}

          {/* 주소 정보 탭 */}
          {activeTab === 'address' && (
            <AddressSection
              formData={addressData}
              errors={errors}
              onChange={(field, value) => handleFieldChange(`personal_info.address.${field}`, value)}
            />
          )}

          {/* 보험 정보 탭 */}
          {activeTab === 'insurance' && (
            <InsuranceInfoSection
              formData={insuranceData}
              errors={errors}
              onChange={handleInsuranceChange}
            />
          )}

          {/* 전체 에러 메시지 */}
          {errors['submit'] && (
            <div className="customer-edit-modal-submit-error">
              {errors['submit']}
            </div>
          )}
        </div>

        {/* 🍎 Footer - 저장/취소 버튼 */}
        <div className="customer-edit-modal-footer">
          <button
            type="button"
            className="customer-edit-modal-button customer-edit-modal-button--cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="button"
            className="customer-edit-modal-button customer-edit-modal-button--primary"
            onClick={handleSaveClick}
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CustomerEditModal;
