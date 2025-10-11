/**
 * AIMS UIX-3 Customer Registration - Insurance Info Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 보험 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';

interface InsuranceInfoSectionProps {
  formData: {
    customer_type: '개인' | '법인';
  };
  errors: { [key: string]: string };
  onChange: (field: string, value: any) => void;
}

export const InsuranceInfoSection: React.FC<InsuranceInfoSectionProps> = ({
  formData,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title form-section__title--insurance">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1L3 3v3.5c0 3.5 2.5 6.5 5 7.5 2.5-1 5-4 5-7.5V3L8 1zm0 2l3 1.5v3c0 2-1.5 4-3 5-1.5-1-3-3-3-5v-3L8 3z"/>
          <path d="M6.5 7L7 8l2-2 .5.5L7 9 6 7.5z"/>
        </svg>
        <span>보험</span>
      </h3>

      <div className="form-section__content">
        {/* 고객 유형 */}
        <div className="form-row">
          <label className="form-row__label">고객 유형</label>
          <div className="form-row__input">
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="customer_type"
                  value="개인"
                  checked={formData.customer_type === '개인'}
                  onChange={(e) => onChange('customer_type', e.target.value as '개인' | '법인')}
                />
                <span>개인</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="customer_type"
                  value="법인"
                  checked={formData.customer_type === '법인'}
                  onChange={(e) => onChange('customer_type', e.target.value as '개인' | '법인')}
                />
                <span>법인</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsuranceInfoSection;
