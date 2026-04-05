/* eslint-disable @typescript-eslint/no-explicit-any -- API 응답 타입 캐스팅 */
/**
 * AIMS UIX-3 Customer Registration Controller
 * @since 2025-10-03
 * @version 1.1.0
 *
 * 고객 등록 폼의 비즈니스 로직 담당
 * 폼 상태 관리, 검증, API 통신 처리
 *
 * @modified 2025-12-11 - Draft(임시저장) 기능 추가
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { CreateCustomerSchema, type CreateCustomerData } from '@/entities/customer/model';
import { api } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';
import { invalidateQueries } from '@/app/queryClient';

// Draft 저장 키
const DRAFT_STORAGE_KEY = 'aims_customer_registration_draft';
// Debounce 시간 (ms)
const DRAFT_SAVE_DELAY = 1000;

interface UseCustomerRegistrationControllerProps {
  /** 등록 성공 시 콜백 */
  onSuccess?: (customerId: string, customerName: string) => void | Promise<void>;
  /** 등록 실패 시 콜백 */
  onError?: (error: Error) => void | Promise<void>;
}

export interface CustomerRegistrationFormData {
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
/**
 * localStorage에서 Draft 로드
 */
const loadDraftFromStorage = (): CustomerRegistrationFormData | null => {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 유효한 데이터인지 확인
      if (parsed && typeof parsed.name === 'string') {
        return parsed as CustomerRegistrationFormData;
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[Draft] localStorage 읽기 실패:', e);
    }
  }
  return null;
};

/**
 * localStorage에 Draft 저장
 */
const saveDraftToStorage = (data: CustomerRegistrationFormData): void => {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[Draft] localStorage 저장 실패:', e);
    }
  }
};

/**
 * localStorage에서 Draft 삭제
 */
const clearDraftFromStorage = (): void => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[Draft] localStorage 삭제 실패:', e);
    }
  }
};

/**
 * 폼 데이터가 비어있는지 확인
 */
const isFormEmpty = (data: CustomerRegistrationFormData): boolean => {
  return (
    !data.name.trim() &&
    !data.name_en?.trim() &&
    !data.birth_date &&
    !data.mobile_phone?.trim() &&
    !data.home_phone?.trim() &&
    !data.work_phone?.trim() &&
    !data.email?.trim() &&
    !data.postal_code?.trim() &&
    !data.address1?.trim() &&
    !data.address2?.trim()
  );
};

export const useCustomerRegistrationController = ({
  onSuccess,
  onError,
}: UseCustomerRegistrationControllerProps = {}) => {
  // Draft에서 초기값 로드 (한 번만 실행)
  const [formData, setFormData] = useState<CustomerRegistrationFormData>(() => {
    const draft = loadDraftFromStorage();
    if (draft) {
      if (import.meta.env.DEV) {
        console.log('[Draft] 임시저장 데이터 복원:', draft.name || '(이름 없음)');
      }
      return draft;
    }
    return {
      name: '',
      customer_type: '개인',
    };
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasDraft, setHasDraft] = useState<boolean>(() => loadDraftFromStorage() !== null);

  // Debounce 타이머 ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  /**
   * Draft 저장 (debounced)
   */
  const saveDraft = useCallback((data: CustomerRegistrationFormData) => {
    // 기존 타이머 취소
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 새 타이머 설정
    saveTimerRef.current = setTimeout(() => {
      if (isFormEmpty(data)) {
        // 폼이 비어있으면 draft 삭제
        clearDraftFromStorage();
        setHasDraft(false);
      } else {
        saveDraftToStorage(data);
        setHasDraft(true);
        if (import.meta.env.DEV) {
          console.log('[Draft] 자동 저장:', data.name || '(이름 없음)');
        }
      }
    }, DRAFT_SAVE_DELAY);
  }, []);

  /**
   * 폼 필드 값 변경 핸들러
   */
  const handleChange = <Field extends keyof CustomerRegistrationFormData>(
    field: Field,
    value: CustomerRegistrationFormData[Field]
  ) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        [field]: value,
      };
      // Draft 자동 저장 (debounced)
      saveDraft(newData);
      return newData;
    });

    // 필드 변경 시 해당 필드의 에러 제거
    const fieldKey = String(field);
    if (errors[fieldKey]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
  };

  /**
   * 폼 데이터를 API 요청 형식으로 변환
   */
  const transformToApiFormat = (data: CustomerRegistrationFormData): CreateCustomerData => {
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
      },
      contracts: [],
      documents: [],
      consultations: [],
    };
  };

  /**
   * 폼 검증
   */
  const validate = (data: CustomerRegistrationFormData): FormErrors => {
    const apiData = transformToApiFormat(data);
    const validationResult = CreateCustomerSchema.safeParse(apiData);

    if (!validationResult.success) {
      const newErrors: FormErrors = {};
      validationResult.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        newErrors[path] = issue.message;
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

      // API 호출 (api.post는 자동으로 Authorization 헤더 추가)
      const result = await api.post<{
        success: boolean;
        data: {
          _id: string;
          personal_info: { name: string; };
        }
      }>(
        '/api/customers',
        apiData
      );

      const customerId = result.data?._id;
      const customerName = result.data?.personal_info?.name;

      if (!customerId || !customerName) {
        throw new Error('고객 등록에 실패했습니다.');
      }

      if (import.meta.env.DEV) {
        console.log('[useCustomerRegistrationController] 고객 생성 완료:', customerId, customerName);
      }

      // TanStack Query 캐시 무효화로 모든 View 자동 업데이트
      invalidateQueries.customerChanged();

      // 성공 콜백 (async 지원)
      if (onSuccess) {
        await onSuccess(customerId, customerName);
      }

      // Draft 삭제 (등록 성공 시)
      clearDraftFromStorage();
      setHasDraft(false);

      // 폼 초기화
      setFormData({
        name: '',
        customer_type: '개인',
      });
    } catch (error) {
      const err = error as any; // ApiError 타입

      // API 에러 응답에서 메시지 추출
      // ApiError의 경우: err.data에 백엔드 응답이 직접 들어있음
      // 우선순위: data.error > message > 기본 메시지
      const errorMessage = (err.data && typeof err.data === 'object' && 'error' in err.data)
        ? (err.data.error as string)
        : err.message || '고객 등록 중 오류가 발생했습니다.';

      if (import.meta.env.DEV) {
        console.error('[useCustomerRegistrationController] 고객 등록 실패:', {
          status: err.status,
          error: err.data?.error,
          details: err.data?.details,
          fullError: err,
        });
      }
      errorReporter.reportApiError(err as Error, { component: 'useCustomerRegistrationController.handleSubmit' });

      // 에러 콜백 (async 지원)
      if (onError) {
        await onError(new Error(errorMessage));
      }

      // 일반 에러 메시지 설정
      setErrors({
        submit: errorMessage,
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
    // Draft도 함께 삭제
    clearDraftFromStorage();
    setHasDraft(false);
  };

  /**
   * Draft 수동 삭제 (사용자가 "임시저장 삭제" 버튼 클릭 시)
   */
  const clearDraft = useCallback(() => {
    clearDraftFromStorage();
    setHasDraft(false);
    setFormData({
      name: '',
      customer_type: '개인',
    });
    setErrors({});
  }, []);

  return {
    formData,
    errors,
    isSubmitting,
    /** Draft 존재 여부 */
    hasDraft,
    handleChange,
    handleSubmit,
    handleReset,
    /** Draft 수동 삭제 */
    clearDraft,
  };
};

