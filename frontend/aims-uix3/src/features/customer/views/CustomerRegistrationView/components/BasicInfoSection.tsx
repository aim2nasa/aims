/**
 * AIMS UIX-3 Customer Registration - Basic Info Section
 * @since 2025-10-04
 * @version 2.0.0
 *
 * 🍎 애플 iOS Settings 스타일 완벽 구현
 * - List Item Row 형태의 깔끔한 레이아웃
 * - Progressive Disclosure 패턴 적용
 * - 서브틀한 호버 효과
 */

import React from 'react';
import type { CustomerRegistrationFormData } from '../../../controllers/useCustomerRegistrationController';

export type BasicInfoFormData = Pick<CustomerRegistrationFormData, 'name' | 'name_en' | 'birth_date' | 'gender'>;

interface BasicInfoSectionProps {
  formData: BasicInfoFormData;
  errors: Record<string, string>;
  onChange: (field: keyof BasicInfoFormData, value: BasicInfoFormData[keyof BasicInfoFormData]) => void;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  formData,
  errors,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title form-section__title--basic">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="5" r="2.5"/>
          <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
        </svg>
        <span>기본</span>
      </h3>

      <div className="form-section__content">
        {/* 이름 */}
        <div className={`form-row ${errors['personal_info.name'] ? 'form-row--error' : ''}`}>
          <label className="form-row__label form-row__label--required">
            이름
          </label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="홍길동"
              aria-label="이름"
              aria-required="true"
              aria-invalid={!!errors['personal_info.name']}
            />
          </div>
        </div>
        {errors['personal_info.name'] && (
          <div className="form-row__error" role="alert">
            {errors['personal_info.name']}
          </div>
        )}

        {/* 이름 (영문) */}
        <div className={`form-row ${errors['personal_info.name_en'] ? 'form-row--error' : ''}`}>
          <label className="form-row__label">
            이름 (영문)
          </label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.name_en || ''}
              onChange={(e) => onChange('name_en', e.target.value)}
              placeholder="Hong Gildong"
              aria-label="이름 (영문)"
              aria-invalid={!!errors['personal_info.name_en']}
            />
          </div>
        </div>
        {errors['personal_info.name_en'] && (
          <div className="form-row__error" role="alert">
            {errors['personal_info.name_en']}
          </div>
        )}

        {/* 생년월일 */}
        <div className={`form-row ${errors['personal_info.birth_date'] ? 'form-row--error' : ''}`}>
          <label className="form-row__label">
            생년월일
          </label>
          <div className="form-row__input form-row__input--date">
            <input
              type="date"
              value={formData.birth_date || ''}
              onChange={(e) => onChange('birth_date', e.target.value)}
              aria-label="생년월일"
              aria-invalid={!!errors['personal_info.birth_date']}
            />
            <span className="date-icon">📅</span>
          </div>
        </div>
        {errors['personal_info.birth_date'] && (
          <div className="form-row__error" role="alert">
            {errors['personal_info.birth_date']}
          </div>
        )}

        {/* 성별 */}
        <div className="form-row">
          <label className="form-row__label">
            성별
          </label>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="gender"
                value="M"
                checked={formData.gender === 'M'}
                onChange={(e) => onChange('gender', e.target.value as 'M' | 'F')}
                aria-label="남성"
              />
              <span>남성</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="gender"
                value="F"
                checked={formData.gender === 'F'}
                onChange={(e) => onChange('gender', e.target.value as 'M' | 'F')}
                aria-label="여성"
              />
              <span>여성</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoSection;
