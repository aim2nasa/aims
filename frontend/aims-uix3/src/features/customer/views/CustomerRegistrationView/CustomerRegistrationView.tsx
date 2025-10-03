/**
 * AIMS UIX-3 Customer Registration View
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 등록 페이지
 * iOS Settings 스타일의 카드형 레이아웃
 */

import React from 'react';
import { Button } from '@/shared/ui';
import { useCustomerRegistrationController } from '../../controllers/useCustomerRegistrationController';
import { BasicInfoSection } from './components/BasicInfoSection';
import { ContactSection } from './components/ContactSection';
import { AddressSection } from './components/AddressSection';
import { InsuranceInfoSection } from './components/InsuranceInfoSection';
import './CustomerRegistrationView.css';

export const CustomerRegistrationView: React.FC = () => {
  const {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    handleReset,
  } = useCustomerRegistrationController({
    onSuccess: (customerId) => {
      alert(`고객 등록 완료! ID: ${customerId}`);
      // TODO: 고객 상세 페이지로 이동 또는 목록 새로고침
    },
    onError: (error) => {
      alert(`고객 등록 실패: ${error.message}`);
    },
  });

  return (
    <div className="customer-registration">
      {/* Header */}
      <div className="customer-registration__header">
        <h1 className="customer-registration__title">고객 등록</h1>
        <p className="customer-registration__subtitle">
          새로운 고객의 정보를 입력하세요
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="customer-registration__form">
        {/* Basic Info Section */}
        <BasicInfoSection
          formData={formData}
          errors={errors}
          onChange={handleChange}
        />

        {/* Contact Section */}
        <ContactSection
          formData={formData}
          errors={errors}
          onChange={handleChange}
        />

        {/* Address Section */}
        <AddressSection
          formData={formData}
          errors={errors}
          onChange={handleChange}
        />

        {/* Insurance Info Section */}
        <InsuranceInfoSection
          formData={formData}
          errors={errors}
          onChange={handleChange}
        />

        {/* Submit Error */}
        {errors.submit && (
          <div className="form-error" role="alert">
            {errors.submit}
          </div>
        )}

        {/* Actions */}
        <div className="customer-registration__actions">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={isSubmitting}
          >
            초기화
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            등록하기
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CustomerRegistrationView;
