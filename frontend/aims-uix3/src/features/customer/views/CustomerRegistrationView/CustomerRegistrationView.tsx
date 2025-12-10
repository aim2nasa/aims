/**
 * AIMS UIX-3 Customer Registration View
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 등록 페이지
 * iOS Settings 스타일의 카드형 레이아웃
 */

import React from 'react';
import { useCustomerRegistrationController } from '../../controllers/useCustomerRegistrationController';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { Button } from '../../../../shared/ui/Button';
import { BasicInfoSection } from './components/BasicInfoSection';
import { ContactSection } from './components/ContactSection';
import { AddressSection } from './components/AddressSection';
import { InsuranceInfoSection } from './components/InsuranceInfoSection';
import { invalidateQueries } from '../../../../app/queryClient';
import './CustomerRegistrationView.css';

export const CustomerRegistrationView: React.FC = () => {

  // 🍎 애플 스타일 확인 모달
  const confirmController = useAppleConfirmController();

  const {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
  } = useCustomerRegistrationController({
    onSuccess: async (_customerId, customerName) => {
      // 애플 스타일 성공 모달 표시 (취소 버튼 없이)
      await confirmController.actions.openModal({
        title: '등록 완료',
        message: `${customerName} 님이 등록되었습니다.`,
        confirmText: '확인',
        confirmStyle: 'primary',
        showCancel: false,
        iconType: 'success'
      });
      // 쿼리 캐시 무효화로 모든 View 업데이트 (새로고침 없이)
      invalidateQueries.customers();
      invalidateQueries.relationships();
      // 다른 View 동기화를 위한 이벤트 발생
      window.dispatchEvent(new CustomEvent('customerChanged'));
    },
    onError: async (error) => {
      // 애플 스타일 에러 모달 표시 (취소 버튼 없이)
      await confirmController.actions.openModal({
        title: '등록 실패',
        message: error.message,
        confirmText: '확인',
        confirmStyle: 'destructive',
        showCancel: false,
        iconType: 'error'
      });
    },
  });

  return (
    <React.Fragment>
      <div className="customer-registration">
        <div className="customer-registration__inner">
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
            {errors['submit'] && (
              <div className="form-error" role="alert">
                {errors['submit']}
              </div>
            )}

            {/* Actions */}
            <div className="customer-registration__actions">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || !formData.name.trim()}
                loading={isSubmitting}
                leftIcon={!isSubmitting ? <span>✅</span> : undefined}
              >
                등록하기
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 🍎 애플 스타일 확인 모달 */}
      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </React.Fragment>
  );
};

export default CustomerRegistrationView;
