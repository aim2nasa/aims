/**
 * AIMS UIX-3 Customer Registration - Address Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 주소 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';

interface AddressSectionProps {
  formData: {
    postal_code?: string;
    address1?: string;
    address2?: string;
  };
  errors: { [key: string]: string };
  onChange: (field: string, value: any) => void;
}

export const AddressSection: React.FC<AddressSectionProps> = ({
  formData,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1zm0 2.5L12 7v6h-2V8H6v5H4V7l4-3.5z"/>
        </svg>
        <span>주소</span>
      </h3>

      <div className="form-section__content">
        {/* 우편번호 */}
        <div className="form-row">
          <label className="form-row__label">우편번호</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.postal_code || ''}
              onChange={(e) => onChange('postal_code', e.target.value)}
              placeholder="12345"
            />
          </div>
        </div>

        {/* 주소 1 */}
        <div className="form-row">
          <label className="form-row__label">주소</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.address1 || ''}
              onChange={(e) => onChange('address1', e.target.value)}
              placeholder="서울특별시 강남구 테헤란로 123"
            />
          </div>
        </div>

        {/* 주소 2 (상세주소) */}
        <div className="form-row">
          <label className="form-row__label">상세주소</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.address2 || ''}
              onChange={(e) => onChange('address2', e.target.value)}
              placeholder="101동 1001호"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressSection;
