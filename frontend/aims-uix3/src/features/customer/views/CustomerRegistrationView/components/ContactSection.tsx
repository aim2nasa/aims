/**
 * AIMS UIX-3 Customer Registration - Contact Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 연락처 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';

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
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">연락처</h3>

      <div className="form-section__content">
        {/* 휴대폰 */}
        <div className="form-row">
          <label className="form-row__label">휴대폰</label>
          <div className="form-row__input">
            <input
              type="tel"
              value={formData.mobile_phone || ''}
              onChange={(e) => onChange('mobile_phone', e.target.value)}
              placeholder="010-1234-5678"
            />
          </div>
        </div>

        {/* 집 전화 */}
        <div className="form-row">
          <label className="form-row__label">집 전화</label>
          <div className="form-row__input">
            <input
              type="tel"
              value={formData.home_phone || ''}
              onChange={(e) => onChange('home_phone', e.target.value)}
              placeholder="02-1234-5678"
            />
          </div>
        </div>

        {/* 회사 전화 */}
        <div className="form-row">
          <label className="form-row__label">회사 전화</label>
          <div className="form-row__input">
            <input
              type="tel"
              value={formData.work_phone || ''}
              onChange={(e) => onChange('work_phone', e.target.value)}
              placeholder="02-1234-5678"
            />
          </div>
        </div>

        {/* 이메일 */}
        <div className="form-row">
          <label className="form-row__label">이메일</label>
          <div className="form-row__input">
            <input
              type="email"
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
