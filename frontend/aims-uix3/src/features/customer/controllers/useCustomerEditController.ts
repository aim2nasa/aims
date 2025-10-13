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
import { CustomerDocument } from '@/stores/CustomerDocument';

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
  const handleFieldChange = useCallback((field: string, value: unknown) => {
    setFormData((prev) => {
      const segments = field.split('.').filter(Boolean);
      if (segments.length === 0) {
        return prev;
      }

      const next: UpdateCustomerData = { ...prev };
      let cursor: Record<string, unknown> = next as unknown as Record<string, unknown>;

      segments.forEach((segment, index) => {
        if (index === segments.length - 1) {
          cursor[segment] = value as unknown;
          return;
        }

        const existing = cursor[segment];
        const nextBranch =
          typeof existing === 'object' && existing !== null
            ? { ...(existing as Record<string, unknown>) }
            : {};
        cursor[segment] = nextBranch;
        cursor = nextBranch;
      });

      return next;
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
   * 전체 폼 검증
   * 모든 값을 그대로 저장 - 검증 없음
   */
  const validateAllFields = useCallback((): boolean => {
    const newErrors: FieldErrors = {};

    // 필수 필드: 고객명만 검증
    if (!formData.personal_info?.name || formData.personal_info.name.trim() === '') {
      newErrors['personal_info.name'] = '고객명은 필수입니다';
    }

    // 나머지 필드는 검증 없이 모두 허용

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
      const cleanPersonalInfo: NonNullable<UpdateCustomerData['personal_info']> = {};
      if (formData.personal_info) {
        Object.entries(formData.personal_info).forEach(([key, value]) => {
          // name은 필수이므로 항상 포함 (문자열만)
          if (key === 'name') {
            if (typeof value === 'string' && value !== '') {
              cleanPersonalInfo.name = value;
            }
            return;
          }

          // gender: 'M' | 'F' 만 허용
          if (key === 'gender') {
            if (value === 'M' || value === 'F') {
              cleanPersonalInfo.gender = value;
            }
            return;
          }

          // address: 객체만 허용
          if (key === 'address') {
            if (value && typeof value === 'object') {
              const addr = value as { postal_code?: string; address1?: string; address2?: string };
              const normalized: NonNullable<NonNullable<UpdateCustomerData['personal_info']>['address']> = {};
              if (addr.postal_code) normalized.postal_code = addr.postal_code;
              if (addr.address1) normalized.address1 = addr.address1;
              if (addr.address2) normalized.address2 = addr.address2;
              if (Object.keys(normalized).length > 0) {
                cleanPersonalInfo.address = normalized;
              }
            }
            return;
          }

          // 그 외 문자열 필드: 유효한 문자열만 포함
          if (typeof value === 'string' && value !== '') {
            (cleanPersonalInfo as Record<string, unknown>)[key] = value;
          }
        });
      }
      // 백엔드로 전송할 데이터 (personal_info와 insurance_info만)
      const updatePayload: UpdateCustomerData = {
        personal_info: cleanPersonalInfo,
        insurance_info: formData.insurance_info,
      };

      // Document-View 패턴: CustomerDocument를 통해 업데이트
      const document = CustomerDocument.getInstance();
      await document.updateCustomer(customer._id, updatePayload);
      if (import.meta.env.DEV) {
        console.log('[useCustomerEditController] Document를 통해 고객 수정 완료 - 모든 View 자동 업데이트됨');
      }
      return true;
    } catch (error) {
      console.error('[Customer Edit] 저장 실패:', error);
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
