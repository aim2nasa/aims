/**
 * AIMS UIX-3 Customer Registration - Contact Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 연락처 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';
import { FormField } from '@/shared/ui';

interface ContactSectionProps {
  formData: {
    mobile_phone?: string;
    home_phone?: string;
    work_phone?: string;
    email?: string;
  };
  errors: { [key: string]: string };
  onChange: (field: string, value: any) => void;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  formData,
  errors,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">연락처 정보</h3>

      <div className="form-section__content">
        {/* 휴대폰 */}
        <FormField
          label="휴대폰"
          type="tel"
          value={formData.mobile_phone || ''}
          onChange={(e) => onChange('mobile_phone', e.target.value)}
          error={!!errors['personal_info.mobile_phone']}
          errorMessage={errors['personal_info.mobile_phone']}
          placeholder="010-1234-5678"
        />

        {/* 집 전화 */}
        <FormField
          label="집 전화"
          type="tel"
          value={formData.home_phone || ''}
          onChange={(e) => onChange('home_phone', e.target.value)}
          error={!!errors['personal_info.home_phone']}
          errorMessage={errors['personal_info.home_phone']}
          placeholder="02-1234-5678"
        />

        {/* 회사 전화 */}
        <FormField
          label="회사 전화"
          type="tel"
          value={formData.work_phone || ''}
          onChange={(e) => onChange('work_phone', e.target.value)}
          error={!!errors['personal_info.work_phone']}
          errorMessage={errors['personal_info.work_phone']}
          placeholder="02-1234-5678"
        />

        {/* 이메일 */}
        <FormField
          label="이메일"
          type="email"
          value={formData.email || ''}
          onChange={(e) => onChange('email', e.target.value)}
          error={!!errors['personal_info.email']}
          errorMessage={errors['personal_info.email']}
          placeholder="example@email.com"
        />
      </div>
    </div>
  );
};

export default ContactSection;
