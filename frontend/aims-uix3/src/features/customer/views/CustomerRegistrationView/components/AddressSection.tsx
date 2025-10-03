/**
 * AIMS UIX-3 Customer Registration - Address Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 주소 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';
import { FormField } from '@/shared/ui';

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
  errors,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">주소 정보</h3>

      <div className="form-section__content">
        {/* 우편번호 */}
        <FormField
          label="우편번호"
          type="text"
          value={formData.postal_code || ''}
          onChange={(e) => onChange('postal_code', e.target.value)}
          error={!!errors['personal_info.address.postal_code']}
          errorMessage={errors['personal_info.address.postal_code']}
          placeholder="12345"
        />

        {/* 주소 1 */}
        <FormField
          label="주소"
          type="text"
          value={formData.address1 || ''}
          onChange={(e) => onChange('address1', e.target.value)}
          error={!!errors['personal_info.address.address1']}
          errorMessage={errors['personal_info.address.address1']}
          placeholder="서울특별시 강남구 테헤란로 123"
        />

        {/* 주소 2 (상세주소) */}
        <FormField
          label="상세주소"
          type="text"
          value={formData.address2 || ''}
          onChange={(e) => onChange('address2', e.target.value)}
          error={!!errors['personal_info.address.address2']}
          errorMessage={errors['personal_info.address.address2']}
          placeholder="101동 1001호"
        />
      </div>
    </div>
  );
};

export default AddressSection;
