/**
 * CustomerEditModal Component
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 정보 수정 모달 컴포넌트
 * DocumentDetailModal 스타일과 완벽히 통일된 🍎 애플 디자인
 *
 * Features:
 * - React Portal 사용
 * - ESC 키로 닫기
 * - iOS Settings 스타일 디자인
 * - 3개 탭: 기본 정보 / 연락처 정보 / 보험 정보
 */

import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Customer } from '@/entities/customer';
import { useCustomerEditController, CustomerEditTab } from '../../controllers/useCustomerEditController';
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
 * DocumentDetailModal과 동일한 스타일 적용
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

  if (!visible) return null;

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

        {/* 🍎 탭 네비게이션 */}
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
            className={`customer-edit-modal-tab ${activeTab === 'insurance' ? 'customer-edit-modal-tab--active' : ''}`}
            onClick={() => handleTabChange('insurance')}
          >
            보험 정보
          </button>
        </div>

        {/* 🍎 콘텐츠 영역 */}
        <div className="customer-edit-modal-content">
          {/* 기본 정보 탭 */}
          {activeTab === 'info' && (
            <div className="customer-edit-modal-section">
              <div className="customer-edit-modal-field-group">
                {/* 고객명 (필수) */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label customer-edit-modal-label--required">
                    고객명
                  </label>
                  <input
                    type="text"
                    className={`customer-edit-modal-input ${errors['personal_info.name'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.name || ''}
                    onChange={(e) => handleFieldChange('personal_info.name', e.target.value)}
                    placeholder="홍길동"
                  />
                  {errors['personal_info.name'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.name']}</span>
                  )}
                </div>

                {/* 영문명 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">영문명</label>
                  <input
                    type="text"
                    className="customer-edit-modal-input"
                    value={formData.personal_info?.name_en || ''}
                    onChange={(e) => handleFieldChange('personal_info.name_en', e.target.value)}
                    placeholder="Hong Gil-dong"
                  />
                </div>

                {/* 생년월일 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">생년월일</label>
                  <input
                    type="date"
                    className={`customer-edit-modal-input ${errors['personal_info.birth_date'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.birth_date || ''}
                    onChange={(e) => handleFieldChange('personal_info.birth_date', e.target.value)}
                  />
                  {errors['personal_info.birth_date'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.birth_date']}</span>
                  )}
                </div>

                {/* 성별 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">성별</label>
                  <select
                    className="customer-edit-modal-input"
                    value={formData.personal_info?.gender || ''}
                    onChange={(e) => handleFieldChange('personal_info.gender', e.target.value as 'M' | 'F' | '')}
                  >
                    <option value="">선택 안함</option>
                    <option value="M">남성</option>
                    <option value="F">여성</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 연락처 정보 탭 */}
          {activeTab === 'contact' && (
            <div className="customer-edit-modal-section">
              <div className="customer-edit-modal-field-group">
                {/* 휴대폰번호 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">휴대폰번호</label>
                  <input
                    type="tel"
                    className={`customer-edit-modal-input ${errors['personal_info.mobile_phone'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.mobile_phone || ''}
                    onChange={(e) => handleFieldChange('personal_info.mobile_phone', e.target.value)}
                    placeholder="010-1234-5678"
                  />
                  {errors['personal_info.mobile_phone'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.mobile_phone']}</span>
                  )}
                </div>

                {/* 집전화 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">집전화</label>
                  <input
                    type="tel"
                    className={`customer-edit-modal-input ${errors['personal_info.home_phone'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.home_phone || ''}
                    onChange={(e) => handleFieldChange('personal_info.home_phone', e.target.value)}
                    placeholder="02-123-4567"
                  />
                  {errors['personal_info.home_phone'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.home_phone']}</span>
                  )}
                </div>

                {/* 직장전화 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">직장전화</label>
                  <input
                    type="tel"
                    className={`customer-edit-modal-input ${errors['personal_info.work_phone'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.work_phone || ''}
                    onChange={(e) => handleFieldChange('personal_info.work_phone', e.target.value)}
                    placeholder="02-987-6543"
                  />
                  {errors['personal_info.work_phone'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.work_phone']}</span>
                  )}
                </div>

                {/* 이메일 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">이메일</label>
                  <input
                    type="email"
                    className={`customer-edit-modal-input ${errors['personal_info.email'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.personal_info?.email || ''}
                    onChange={(e) => handleFieldChange('personal_info.email', e.target.value)}
                    placeholder="example@email.com"
                  />
                  {errors['personal_info.email'] && (
                    <span className="customer-edit-modal-error">{errors['personal_info.email']}</span>
                  )}
                </div>
              </div>

              {/* 주소 정보 */}
              <div className="customer-edit-modal-divider" />
              <h3 className="customer-edit-modal-section-title">주소</h3>
              <div className="customer-edit-modal-field-group">
                {/* 우편번호 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">우편번호</label>
                  <input
                    type="text"
                    className="customer-edit-modal-input"
                    value={formData.personal_info?.address?.postal_code || ''}
                    onChange={(e) => handleFieldChange('personal_info.address.postal_code', e.target.value)}
                    placeholder="12345"
                  />
                </div>

                {/* 주소 1 */}
                <div className="customer-edit-modal-field customer-edit-modal-field--full">
                  <label className="customer-edit-modal-label">주소</label>
                  <input
                    type="text"
                    className="customer-edit-modal-input"
                    value={formData.personal_info?.address?.address1 || ''}
                    onChange={(e) => handleFieldChange('personal_info.address.address1', e.target.value)}
                    placeholder="서울시 강남구 테헤란로 123"
                  />
                </div>

                {/* 주소 2 */}
                <div className="customer-edit-modal-field customer-edit-modal-field--full">
                  <label className="customer-edit-modal-label">상세 주소</label>
                  <input
                    type="text"
                    className="customer-edit-modal-input"
                    value={formData.personal_info?.address?.address2 || ''}
                    onChange={(e) => handleFieldChange('personal_info.address.address2', e.target.value)}
                    placeholder="101동 1001호"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 보험 정보 탭 */}
          {activeTab === 'insurance' && (
            <div className="customer-edit-modal-section">
              <div className="customer-edit-modal-field-group">
                {/* 고객유형 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">고객유형</label>
                  <select
                    className="customer-edit-modal-input"
                    value={formData.insurance_info?.customer_type || '개인'}
                    onChange={(e) => handleFieldChange('insurance_info.customer_type', e.target.value as '개인' | '법인')}
                  >
                    <option value="개인">개인</option>
                    <option value="법인">법인</option>
                  </select>
                </div>

                {/* 위험도 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">위험도</label>
                  <input
                    type="text"
                    className="customer-edit-modal-input"
                    value={formData.insurance_info?.risk_level || ''}
                    onChange={(e) => handleFieldChange('insurance_info.risk_level', e.target.value)}
                    placeholder="중"
                  />
                </div>

                {/* 연간보험료 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">연간보험료</label>
                  <input
                    type="number"
                    className={`customer-edit-modal-input ${errors['insurance_info.annual_premium'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.insurance_info?.annual_premium || ''}
                    onChange={(e) => handleFieldChange('insurance_info.annual_premium', Number(e.target.value))}
                    placeholder="1000000"
                    min="0"
                  />
                  {errors['insurance_info.annual_premium'] && (
                    <span className="customer-edit-modal-error">{errors['insurance_info.annual_premium']}</span>
                  )}
                </div>

                {/* 총보장액 */}
                <div className="customer-edit-modal-field">
                  <label className="customer-edit-modal-label">총보장액</label>
                  <input
                    type="number"
                    className={`customer-edit-modal-input ${errors['insurance_info.total_coverage'] ? 'customer-edit-modal-input--error' : ''}`}
                    value={formData.insurance_info?.total_coverage || ''}
                    onChange={(e) => handleFieldChange('insurance_info.total_coverage', Number(e.target.value))}
                    placeholder="50000000"
                    min="0"
                  />
                  {errors['insurance_info.total_coverage'] && (
                    <span className="customer-edit-modal-error">{errors['insurance_info.total_coverage']}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 전체 에러 메시지 */}
          {errors.submit && (
            <div className="customer-edit-modal-submit-error">
              {errors.submit}
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
