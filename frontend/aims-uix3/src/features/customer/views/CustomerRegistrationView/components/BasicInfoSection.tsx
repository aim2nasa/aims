/**
 * AIMS UIX-3 Customer Registration - Basic Info Section
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 기본 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React from 'react';
import { FormField } from '@/shared/ui';

interface BasicInfoSectionProps {
  formData: {
    name: string;
    name_en?: string;
    birth_date?: string;
    gender?: 'M' | 'F';
  };
  errors: { [key: string]: string };
  onChange: (field: string, value: any) => void;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  formData,
  errors,
  onChange,
}) => {
  return (
    <div className="form-section">
      <h3 className="form-section__title">기본 정보</h3>

      <div className="form-section__content">
        {/* 이름 */}
        <FormField
          label="이름"
          type="text"
          value={formData.name}
          onChange={(e) => onChange('name', e.target.value)}
          error={!!errors['personal_info.name']}
          errorMessage={errors['personal_info.name']}
          placeholder="홍길동"
          required
        />

        {/* 이름 (영문) */}
        <FormField
          label="이름 (영문)"
          type="text"
          value={formData.name_en || ''}
          onChange={(e) => onChange('name_en', e.target.value)}
          error={!!errors['personal_info.name_en']}
          errorMessage={errors['personal_info.name_en']}
          placeholder="Hong Gildong"
        />

        {/* 생년월일 */}
        <FormField
          label="생년월일"
          type="date"
          value={formData.birth_date || ''}
          onChange={(e) => onChange('birth_date', e.target.value)}
          error={!!errors['personal_info.birth_date']}
          errorMessage={errors['personal_info.birth_date']}
        />

        {/* 성별 */}
        <div className="form-field">
          <label className="form-field__label">성별</label>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="gender"
                value="M"
                checked={formData.gender === 'M'}
                onChange={(e) => onChange('gender', e.target.value as 'M' | 'F')}
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
