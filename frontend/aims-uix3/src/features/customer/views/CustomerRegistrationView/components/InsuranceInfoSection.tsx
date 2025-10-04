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
    risk_level?: string;
    annual_premium?: number;
    total_coverage?: number;
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
      <h3 className="form-section__title">보험</h3>

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

        {/* 위험도 */}
        <div className="form-row">
          <label className="form-row__label">위험도</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.risk_level || ''}
              onChange={(e) => onChange('risk_level', e.target.value)}
              placeholder="중간"
            />
          </div>
        </div>

        {/* 연간 보험료 */}
        <div className="form-row">
          <label className="form-row__label">연간 보험료</label>
          <div className="form-row__input">
            <input
              type="number"
              value={formData.annual_premium || ''}
              onChange={(e) => onChange('annual_premium', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="1000000"
            />
          </div>
        </div>

        {/* 총 보장액 */}
        <div className="form-row">
          <label className="form-row__label">총 보장액</label>
          <div className="form-row__input">
            <input
              type="number"
              value={formData.total_coverage || ''}
              onChange={(e) => onChange('total_coverage', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="100000000"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsuranceInfoSection;
