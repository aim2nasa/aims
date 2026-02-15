/**
 * AIMS UIX-3 Customer Registration - Contact Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 연락처 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';
import type { CustomerRegistrationFormData } from '../../../controllers/useCustomerRegistrationController';
import { formatPhoneNumber } from '@/shared/lib/phoneUtils';

export type ContactFormData = Pick<CustomerRegistrationFormData, 'mobile_phone' | 'home_phone' | 'work_phone' | 'email'>;

interface ContactSectionProps {
  formData: ContactFormData;
  errors: Record<string, string>;
  onChange: (field: keyof ContactFormData, value: ContactFormData[keyof ContactFormData]) => void;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  formData,
  onChange,
}) => {
  // 전화번호 입력 시 자동 포맷팅 (네이버/카카오 스타일)
  const handlePhoneChange = (field: keyof ContactFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    onChange(field, formatted);
  };

  return (
    <div className="form-section">
      <h3 className="form-section__title form-section__title--contact">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0012.5 1h-9zM8 4a1 1 0 011 1v1a1 1 0 01-2 0V5a1 1 0 011-1zm-2 7a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1z"/>
        </svg>
        <span>연락처</span>
      </h3>

      <div className="form-section__content">
        {/* 휴대폰 */}
        <div className="form-row">
          <label className="form-row__label">휴대폰</label>
          <div className="form-row__input">
            <input
              type="tel"
              inputMode="tel"
              value={formData.mobile_phone || ''}
              onChange={handlePhoneChange('mobile_phone')}
              placeholder="010-1234-5678"
              maxLength={13}
            />
          </div>
        </div>

        {/* 집 전화 */}
        <div className="form-row">
          <label className="form-row__label">집 전화</label>
          <div className="form-row__input">
            <input
              type="tel"
              inputMode="tel"
              value={formData.home_phone || ''}
              onChange={handlePhoneChange('home_phone')}
              placeholder="02-1234-5678"
              maxLength={13}
            />
          </div>
        </div>

        {/* 회사 전화 */}
        <div className="form-row">
          <label className="form-row__label">회사 전화</label>
          <div className="form-row__input">
            <input
              type="tel"
              inputMode="tel"
              value={formData.work_phone || ''}
              onChange={handlePhoneChange('work_phone')}
              placeholder="02-1234-5678"
              maxLength={13}
            />
          </div>
        </div>

        {/* 이메일 */}
        <div className="form-row">
          <label className="form-row__label">이메일</label>
          <div className="form-row__input">
            <input
              type="email"
              inputMode="email"
              value={formData.email || ''}
              onChange={(e) => onChange('email', e.target.value)}
              placeholder="example@email.com"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactSection;
