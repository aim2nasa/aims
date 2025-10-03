/**
 * AIMS UIX-3 Customer Registration - Insurance Info Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 보험 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';
import { FormField } from '@/shared/ui';

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
  errors,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">보험 정보</h3>

      <div className="form-section__content">
        {/* 고객 유형 */}
        <div className="form-field">
          <label className="form-field__label">고객 유형</label>
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

        {/* 위험도 */}
        <FormField
          label="위험도"
          type="text"
          value={formData.risk_level || ''}
          onChange={(e) => onChange('risk_level', e.target.value)}
          error={!!errors['insurance_info.risk_level']}
          errorMessage={errors['insurance_info.risk_level']}
          placeholder="중간"
          helpText="고객의 위험도를 입력하세요"
        />

        {/* 연간 보험료 */}
        <FormField
          label="연간 보험료"
          type="number"
          value={formData.annual_premium || ''}
          onChange={(e) => onChange('annual_premium', e.target.value ? Number(e.target.value) : undefined)}
          error={!!errors['insurance_info.annual_premium']}
          errorMessage={errors['insurance_info.annual_premium']}
          placeholder="1000000"
          helpText="원 단위로 입력하세요"
        />

        {/* 총 보장액 */}
        <FormField
          label="총 보장액"
          type="number"
          value={formData.total_coverage || ''}
          onChange={(e) => onChange('total_coverage', e.target.value ? Number(e.target.value) : undefined)}
          error={!!errors['insurance_info.total_coverage']}
          errorMessage={errors['insurance_info.total_coverage']}
          placeholder="100000000"
          helpText="원 단위로 입력하세요"
        />
      </div>
    </div>
  );
};

export default InsuranceInfoSection;
