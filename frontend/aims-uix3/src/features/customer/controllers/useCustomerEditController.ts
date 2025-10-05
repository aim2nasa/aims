/**
 * AIMS UIX-3 Customer Edit Controller
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 정보 수정 비즈니스 로직 컨트롤러
 * ARCHITECTURE.md의 Controller Layer 패턴을 따름
 */

import { useState, useCallback, useEffect } from 'react';
import { Customer, UpdateCustomerData } from '@/entities/customer';
import { CustomerService } from '@/services/customerService';

/**
 * 탭 타입 정의
 * 고객 등록과 동일한 4개 탭
 */
export type CustomerEditTab = 'info' | 'contact' | 'address' | 'insurance';

/**
 * 필드 에러 타입
 */
export interface FieldErrors {
  [key: string]: string;
}

/**
 * useCustomerEditController Hook
 *
 * 고객 정보 수정 폼의 상태 관리 및 비즈니스 로직 처리
 *
 * @param customer - 수정할 고객 정보
 * @returns 컨트롤러 상태 및 액션
 */
export const useCustomerEditController = (customer: Customer) => {
  // 1. 폼 데이터 상태
  const [formData, setFormData] = useState<UpdateCustomerData>({
    personal_info: { ...customer.personal_info },
    insurance_info: customer.insurance_info ? { ...customer.insurance_info } : undefined,
  });

  // 2. UI 상태
  const [activeTab, setActiveTab] = useState<CustomerEditTab>('info');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // customer prop 변경 시 formData 업데이트
  useEffect(() => {
    setFormData({
      personal_info: { ...customer.personal_info },
      insurance_info: customer.insurance_info ? { ...customer.insurance_info } : undefined,
    });
  }, [customer]);

  /**
   * 필드 값 변경 핸들러
   */
  const handleFieldChange = useCallback((field: string, value: any) => {
    setFormData((prev) => {
      const keys = field.split('.');
      if (keys.length === 1) {
        return { ...prev, [field]: value };
      }

      // 중첩된 객체 업데이트
      const [parent, child] = keys;
      const parentKey = parent as keyof UpdateCustomerData;
      return {
        ...prev,
        [parentKey]: {
          ...(prev[parentKey] as any),
          [child]: value,
        },
      };
    });

    // 에러 클리어
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  /**
   * 전화번호 형식 검증
   */
  const validatePhoneNumber = (phone: string | undefined): boolean => {
    if (!phone || phone.trim() === '') return true; // 선택 필드

    // 010-1234-5678 또는 02-123-4567 형식
    const phoneRegex = /^0\d{1,2}-\d{3,4}-\d{4}$/;
    return phoneRegex.test(phone);
  };

  /**
   * 이메일 형식 검증
   */
  const validateEmail = (email: string | undefined): boolean => {
    if (!email || email.trim() === '') return true; // 선택 필드

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  /**
   * 생년월일 형식 검증
   */
  const validateBirthDate = (date: string | undefined): boolean => {
    if (!date || date.trim() === '') return true; // 선택 필드

    // YYYY-MM-DD 형식
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(date);
  };

  /**
   * 전체 폼 검증
   */
  const validateAllFields = useCallback((): boolean => {
    const newErrors: FieldErrors = {};

    // 필수 필드: 고객명
    if (!formData.personal_info?.name || formData.personal_info.name.trim() === '') {
      newErrors['personal_info.name'] = '고객명은 필수입니다';
    }

    // 휴대폰번호 형식 검증
    if (formData.personal_info?.mobile_phone && !validatePhoneNumber(formData.personal_info.mobile_phone)) {
      newErrors['personal_info.mobile_phone'] = '올바른 전화번호 형식이 아닙니다 (예: 010-1234-5678)';
    }

    // 집전화 형식 검증
    if (formData.personal_info?.home_phone && !validatePhoneNumber(formData.personal_info.home_phone)) {
      newErrors['personal_info.home_phone'] = '올바른 전화번호 형식이 아닙니다 (예: 02-123-4567)';
    }

    // 직장전화 형식 검증
    if (formData.personal_info?.work_phone && !validatePhoneNumber(formData.personal_info.work_phone)) {
      newErrors['personal_info.work_phone'] = '올바른 전화번호 형식이 아닙니다 (예: 02-123-4567)';
    }

    // 이메일 형식 검증
    if (formData.personal_info?.email && !validateEmail(formData.personal_info.email)) {
      newErrors['personal_info.email'] = '올바른 이메일 형식이 아닙니다';
    }

    // 생년월일 형식 검증
    if (formData.personal_info?.birth_date && !validateBirthDate(formData.personal_info.birth_date)) {
      newErrors['personal_info.birth_date'] = '올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)';
    }

    // 연간보험료 검증
    if (formData.insurance_info?.annual_premium !== undefined && formData.insurance_info.annual_premium < 0) {
      newErrors['insurance_info.annual_premium'] = '0 이상의 값을 입력해주세요';
    }

    // 총보장액 검증
    if (formData.insurance_info?.total_coverage !== undefined && formData.insurance_info.total_coverage < 0) {
      newErrors['insurance_info.total_coverage'] = '0 이상의 값을 입력해주세요';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  /**
   * 저장 핸들러
   */
  const handleSave = useCallback(async (): Promise<boolean> => {
    // Validation
    if (!validateAllFields()) {
      return false;
    }

    setIsSubmitting(true);
    try {
      // personal_info에서 null/빈값 제거 및 정리
      const cleanPersonalInfo: any = {};
      if (formData.personal_info) {
        Object.entries(formData.personal_info).forEach(([key, value]) => {
          // name은 필수이므로 항상 포함
          if (key === 'name') {
            cleanPersonalInfo[key] = value;
          }
          // 나머지 필드는 유효한 값만 포함
          else if (value !== null && value !== '' && value !== undefined) {
            cleanPersonalInfo[key] = value;
          }
        });
      }

      // 백엔드로 전송할 데이터 (personal_info와 insurance_info만)
      const updatePayload: UpdateCustomerData = {
        personal_info: cleanPersonalInfo,
        insurance_info: formData.insurance_info,
      };

      await CustomerService.updateCustomer(customer._id, updatePayload);
      return true;
    } catch (error) {
      console.error('[useCustomerEditController] 저장 실패:', error);
      setErrors({
        submit: error instanceof Error ? error.message : '저장에 실패했습니다',
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [customer._id, formData, validateAllFields]);

  /**
   * 탭 변경 핸들러
   */
  const handleTabChange = useCallback((tab: CustomerEditTab) => {
    setActiveTab(tab);
  }, []);

  return {
    // 상태
    formData,
    activeTab,
    errors,
    isSubmitting,

    // 액션
    handleFieldChange,
    handleTabChange,
    handleSave,
    validateAllFields,
  };
};
