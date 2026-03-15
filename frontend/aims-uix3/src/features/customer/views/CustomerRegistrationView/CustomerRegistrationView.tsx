/**
 * AIMS UIX-3 Customer Registration View
 * @since 2025-10-03
 * @version 1.1.0
 *
 * 고객 등록 페이지
 * iOS Settings 스타일의 카드형 레이아웃
 *
 * @modified 2025-12-11 - Draft(임시저장) 기능 추가
 */

import React, { useState } from 'react';
import { useCustomerRegistrationController } from '../../controllers/useCustomerRegistrationController';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { Button } from '../../../../shared/ui/Button';
import { Modal, Tooltip } from '../../../../shared/ui';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import { BasicInfoSection } from './components/BasicInfoSection';
import { ContactSection } from './components/ContactSection';
import { AddressSection } from './components/AddressSection';
import { InsuranceInfoSection } from './components/InsuranceInfoSection';
import { invalidateQueries } from '../../../../app/queryClient';
import './CustomerRegistrationView.css';
import './CustomerRegistrationView.mobile.css';

export const CustomerRegistrationView: React.FC = () => {
  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  // 🍎 애플 스타일 확인 모달
  const confirmController = useAppleConfirmController();

  const {
    formData,
    errors,
    isSubmitting,
    hasDraft,
    handleChange,
    handleSubmit,
    clearDraft,
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
      invalidateQueries.customerChanged();
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
          {/* 🍎 도움말 버튼 */}
          <div className="customer-registration__header">
            <Tooltip content="도움말" placement="bottom">
              <button
                type="button"
                className="help-icon-button"
                onClick={() => setHelpModalVisible(true)}
                aria-label="도움말"
              >
                <SFSymbol
                  name="questionmark.circle"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
              </button>
            </Tooltip>
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
            {errors['submit'] && (
              <div className="form-error" role="alert">
                {errors['submit']}
              </div>
            )}

            {/* Actions */}
            <div className="customer-registration__actions">
              {/* Draft 표시 */}
              {hasDraft && (
                <div className="customer-registration__draft-indicator">
                  <span className="customer-registration__draft-badge">임시저장됨</span>
                  <button
                    type="button"
                    className="customer-registration__draft-clear"
                    onClick={clearDraft}
                    aria-label="임시저장 삭제"
                  >
                    삭제
                  </button>
                </div>
              )}
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

      {/* 🍎 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="👤 고객 등록"
        size="sm"
      >
        <div className="help-modal-content">
          <p><strong>이 화면에서 할 수 있는 일</strong></p>
          <ul>
            <li>새로운 고객 정보를 등록</li>
            <li>개인/법인 고객 구분하여 등록</li>
            <li>연락처, 주소 등 상세 정보 입력</li>
          </ul>
          <div className="help-modal-section">
            <p><strong>필수 입력 정보</strong></p>
            <ul>
              <li><strong>고객명</strong>: 반드시 입력해야 합니다</li>
              <li><strong>고객 유형</strong>: 개인 또는 법인 선택</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>임시저장</strong></p>
            <ul>
              <li>입력 중인 내용은 자동으로 임시저장됩니다</li>
              <li>브라우저를 닫아도 다시 열면 복원됩니다</li>
              <li>필요 없으면 "삭제" 버튼으로 지울 수 있습니다</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>팁</strong></p>
            <ul>
              <li>고객명은 중복 등록이 불가합니다</li>
              <li>전화번호는 "-" 없이 숫자만 입력하세요</li>
            </ul>
          </div>
        </div>
      </Modal>
    </React.Fragment>
  );
};

export default CustomerRegistrationView;
