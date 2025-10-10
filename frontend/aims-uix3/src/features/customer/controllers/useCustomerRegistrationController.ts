/**
 * AIMS UIX-3 Customer Registration Controller
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 등록 폼의 비즈니스 로직 담당
 * 폼 상태 관리, 검증, API 통신 처리
 */

import { useState } from 'react';
import { CreateCustomerSchema, type CreateCustomerData } from '@/entities/customer/model';

interface UseCustomerRegistrationControllerProps {
  /** 등록 성공 시 콜백 */
  onSuccess?: (customerId: string) => void | Promise<void>;
  /** 등록 실패 시 콜백 */
  onError?: (error: Error) => void | Promise<void>;
}

interface FormData {
  // Personal Info
  name: string;
  name_en?: string;
  birth_date?: string;
  gender?: 'M' | 'F';
  mobile_phone?: string;
  home_phone?: string;
  work_phone?: string;
  email?: string;
  postal_code?: string;
  address1?: string;
  address2?: string;

  // Insurance Info
  customer_type: '개인' | '법인';
  risk_level?: string;
  annual_premium?: number;
  total_coverage?: number;
}

interface FormErrors {
  [key: string]: string;
}

/**
 * Customer Registration Controller Hook
 *
 * @example
 * const { formData, errors, isSubmitting, handleChange, handleSubmit } = useCustomerRegistrationController({
 *   onSuccess: (customerId) => console.log('등록 완료:', customerId),
 *   onError: (error) => console.error('등록 실패:', error),
 * });
 */
export const useCustomerRegistrationController = ({
  onSuccess,
  onError,
}: UseCustomerRegistrationControllerProps = {}) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    customer_type: '개인',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 폼 필드 값 변경 핸들러
   */
  const handleChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // 필드 변경 시 해당 필드의 에러 제거
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  /**
   * 폼 데이터를 API 요청 형식으로 변환
   */
  const transformToApiFormat = (data: FormData): CreateCustomerData => {
    return {
      personal_info: {
        name: data.name,
        name_en: data.name_en,
        birth_date: data.birth_date,
        gender: data.gender,
        mobile_phone: data.mobile_phone,
        home_phone: data.home_phone,
        work_phone: data.work_phone,
        email: data.email,
        address: data.postal_code || data.address1 || data.address2
          ? {
              postal_code: data.postal_code,
              address1: data.address1,
              address2: data.address2,
            }
          : undefined,
      },
      insurance_info: {
        customer_type: data.customer_type,
        risk_level: data.risk_level,
        annual_premium: data.annual_premium,
        total_coverage: data.total_coverage,
      },
      contracts: [],
      documents: [],
      consultations: [],
    };
  };

  /**
   * 폼 검증
   */
  const validate = (data: FormData): FormErrors => {
    const apiData = transformToApiFormat(data);
    const validationResult = CreateCustomerSchema.safeParse(apiData);

    if (!validationResult.success) {
      const newErrors: FormErrors = {};
      validationResult.error.errors.forEach((error) => {
        const path = error.path.join('.');
        newErrors[path] = error.message;
      });
      return newErrors;
    }

    return {};
  };

  /**
   * 폼 제출 핸들러
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // 검증
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // API 요청 형식으로 변환
      const apiData = transformToApiFormat(formData);

      // API 호출
      const response = await fetch('http://tars.giize.com:3010/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '고객 등록에 실패했습니다.');
      }

      const result = await response.json();
      const customerId = result.data?.customer_id;

      console.log('[useCustomerRegistrationController] 고객 생성 완료:', customerId);

      // customerChanged 이벤트 발생 (지역별 보기 등 다른 View 동기화)
      window.dispatchEvent(new CustomEvent('customerChanged'));

      // 성공 콜백 (async 지원)
      if (onSuccess) {
        await onSuccess(customerId);
      }

      // 폼 초기화
      setFormData({
        name: '',
        customer_type: '개인',
      });
    } catch (error) {
      const err = error as Error;

      // 에러 콜백 (async 지원)
      if (onError) {
        await onError(err);
      }

      // 일반 에러 메시지 설정
      setErrors({
        submit: err.message || '고객 등록 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 폼 리셋 핸들러
   */
  const handleReset = () => {
    setFormData({
      name: '',
      customer_type: '개인',
    });
    setErrors({});
  };

  return {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    handleReset,
  };
};

export default useCustomerRegistrationController;
