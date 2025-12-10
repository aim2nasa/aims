/**
 * AIMS UIX-3 Customer Registration - Basic Info Section
 * @since 2025-10-04
 * @version 2.1.0
 *
 * 🍎 애플 iOS Settings 스타일 완벽 구현
 * - List Item Row 형태의 깔끔한 레이아웃
 * - Progressive Disclosure 패턴 적용
 * - 서브틀한 호버 효과
 *
 * @modified 2025-12-11 - 고객명 실시간 중복검사 추가
 */

import React, { useState, useEffect, useRef } from 'react';
import type { CustomerRegistrationFormData } from '../../../controllers/useCustomerRegistrationController';
import { checkDuplicateName } from '@/services/customerService';

export type BasicInfoFormData = Pick<CustomerRegistrationFormData, 'name' | 'name_en' | 'birth_date' | 'gender'>;

// 중복 검사 상태 타입
type DuplicateCheckStatus = 'idle' | 'checking' | 'duplicate' | 'available';

// Debounce 시간 (ms)
const DUPLICATE_CHECK_DELAY = 500;

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
  // 중복 검사 상태
  const [duplicateStatus, setDuplicateStatus] = useState<DuplicateCheckStatus>('idle');
  const [duplicateCustomer, setDuplicateCustomer] = useState<{
    _id: string;
    name: string;
    customer_type: string;
    status: string;
  } | null>(null);

  // Debounce 타이머 ref
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이름 변경 시 중복 검사
  useEffect(() => {
    // 기존 타이머 취소
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
    }

    const name = formData.name?.trim();

    // 이름이 비어있으면 idle 상태
    if (!name) {
      setDuplicateStatus('idle');
      setDuplicateCustomer(null);
      return;
    }

    // 이름이 2자 미만이면 검사 안함
    if (name.length < 2) {
      setDuplicateStatus('idle');
      setDuplicateCustomer(null);
      return;
    }

    // checking 상태로 변경
    setDuplicateStatus('checking');

    // Debounced 중복 검사
    checkTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkDuplicateName(name);

        if (result.exists && result.customer) {
          setDuplicateStatus('duplicate');
          setDuplicateCustomer(result.customer);
        } else {
          setDuplicateStatus('available');
          setDuplicateCustomer(null);
        }
      } catch (error) {
        // 에러 시 idle로 (백엔드에서 최종 검증)
        setDuplicateStatus('idle');
        setDuplicateCustomer(null);
      }
    }, DUPLICATE_CHECK_DELAY);

    // Cleanup
    return () => {
      if (checkTimerRef.current) {
        clearTimeout(checkTimerRef.current);
      }
    };
  }, [formData.name]);

  // 중복 상태에 따른 클래스
  const getNameFieldClass = () => {
    if (errors['personal_info.name']) return 'form-row--error';
    if (duplicateStatus === 'duplicate') return 'form-row--warning';
    return '';
  };

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
        <div className={`form-row ${getNameFieldClass()}`}>
          <label className="form-row__label form-row__label--required">
            이름
          </label>
          <div className="form-row__input form-row__input--with-status">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="홍길동"
              aria-label="이름"
              aria-required="true"
              aria-invalid={!!errors['personal_info.name'] || duplicateStatus === 'duplicate'}
            />
            {/* 중복 검사 상태 표시 */}
            {duplicateStatus === 'checking' && (
              <span className="form-row__status form-row__status--checking" aria-label="중복 확인 중">
                ⏳
              </span>
            )}
            {duplicateStatus === 'available' && (
              <span className="form-row__status form-row__status--available" aria-label="사용 가능">
                ✓
              </span>
            )}
            {duplicateStatus === 'duplicate' && (
              <span className="form-row__status form-row__status--duplicate" aria-label="중복된 이름">
                !
              </span>
            )}
          </div>
        </div>
        {errors['personal_info.name'] && (
          <div className="form-row__error" role="alert">
            {errors['personal_info.name']}
          </div>
        )}
        {duplicateStatus === 'duplicate' && duplicateCustomer && !errors['personal_info.name'] && (
          <div className="form-row__warning" role="alert">
            이미 등록된 고객입니다 ({duplicateCustomer.customer_type})
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
