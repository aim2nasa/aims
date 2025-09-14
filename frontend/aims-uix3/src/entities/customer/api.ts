/**
 * AIMS UIX-3 Customer API
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 엔티티 관련 API 호출 함수들
 * TanStack Query와 함께 사용
 */

import { api } from '@/shared/lib/api';
import {
  Customer,
  CreateCustomerData,
  UpdateCustomerData,
  CustomerSearchQuery,
  CustomerSearchResponse,
  CustomerUtils,
} from './model';

/**
 * 고객 API 엔드포인트
 */
const ENDPOINTS = {
  CUSTOMERS: '/api/customers',
  CUSTOMER: (id: string) => `/api/customers/${id}`,
  CUSTOMER_SEARCH: '/api/customers/search',
  CUSTOMER_TAGS: '/api/customers/tags',
} as const;

/**
 * 고객 목록 조회
 */
export async function getCustomers(
  query: Partial<CustomerSearchQuery> = {}
): Promise<CustomerSearchResponse> {
  // 검색 쿼리 검증 및 기본값 적용
  const validatedQuery = CustomerUtils.validateSearchQuery(query);

  // URL 파라미터 구성
  const params = new URLSearchParams();
  Object.entries(validatedQuery).forEach(([key, value]) => {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, String(item)));
      } else {
        params.append(key, String(value));
      }
    }
  });

  const response = await api.get<unknown>(`${ENDPOINTS.CUSTOMERS}?${params.toString()}`);

  // 응답 검증
  return CustomerUtils.validateSearchResponse(response);
}

/**
 * 고객 상세 조회
 */
export async function getCustomer(id: string): Promise<Customer> {
  if (!id.trim()) {
    throw new Error('고객 ID가 필요합니다');
  }

  const response = await api.get<unknown>(ENDPOINTS.CUSTOMER(id));

  // 응답 검증
  return CustomerUtils.validate(response);
}

/**
 * 고객 생성
 */
export async function createCustomer(data: CreateCustomerData): Promise<Customer> {
  // 입력 데이터 검증
  const validatedData = CustomerUtils.validateCreateData(data);

  const response = await api.post<unknown>(ENDPOINTS.CUSTOMERS, validatedData);

  // 응답 검증
  return CustomerUtils.validate(response);
}

/**
 * 고객 정보 수정
 */
export async function updateCustomer(
  id: string,
  data: UpdateCustomerData
): Promise<Customer> {
  if (!id.trim()) {
    throw new Error('고객 ID가 필요합니다');
  }

  // 입력 데이터 검증
  const validatedData = CustomerUtils.validateUpdateData(data);

  const response = await api.put<unknown>(ENDPOINTS.CUSTOMER(id), validatedData);

  // 응답 검증
  return CustomerUtils.validate(response);
}

/**
 * 고객 삭제 (소프트 삭제)
 */
export async function deleteCustomer(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error('고객 ID가 필요합니다');
  }

  // 실제로는 isActive를 false로 변경
  await updateCustomer(id, { isActive: false });
}

/**
 * 고객 복원
 */
export async function restoreCustomer(id: string): Promise<Customer> {
  if (!id.trim()) {
    throw new Error('고객 ID가 필요합니다');
  }

  return updateCustomer(id, { isActive: true });
}

/**
 * 고객 검색 (텍스트 검색)
 */
export async function searchCustomers(
  searchTerm: string,
  options: Partial<CustomerSearchQuery> = {}
): Promise<CustomerSearchResponse> {
  if (!searchTerm.trim()) {
    // 빈 검색어인 경우 전체 목록 반환
    return getCustomers(options);
  }

  const validatedOptions = CustomerUtils.validateSearchQuery(options);
  const query: CustomerSearchQuery = {
    ...validatedOptions,
    q: searchTerm.trim(),
  };

  return getCustomers(query);
}

/**
 * 태그별 고객 조회
 */
export async function getCustomersByTags(
  tags: string[],
  options: Partial<CustomerSearchQuery> = {}
): Promise<CustomerSearchResponse> {
  if (tags.length === 0) {
    throw new Error('최소 하나의 태그가 필요합니다');
  }

  const validatedOptions = CustomerUtils.validateSearchQuery(options);
  const query: CustomerSearchQuery = {
    ...validatedOptions,
    tags: tags.filter(tag => tag.trim()),
  };

  return getCustomers(query);
}

/**
 * 사용 중인 모든 태그 조회
 */
export async function getCustomerTags(): Promise<string[]> {
  const response = await api.get<string[]>(ENDPOINTS.CUSTOMER_TAGS);

  // 기본 검증 (문자열 배열인지 확인)
  if (!Array.isArray(response)) {
    throw new Error('Invalid tags response format');
  }

  return response.filter((tag): tag is string => typeof tag === 'string');
}

/**
 * 고객 통계 조회
 */
export interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  totalTags: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
}

export async function getCustomerStats(): Promise<CustomerStats> {
  const response = await api.get<CustomerStats>('/api/customers/stats');

  // 기본 구조 검증
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid stats response format');
  }

  return {
    total: Number(response.total) || 0,
    active: Number(response.active) || 0,
    inactive: Number(response.inactive) || 0,
    newThisMonth: Number(response.newThisMonth) || 0,
    totalTags: Number(response.totalTags) || 0,
    mostUsedTags: Array.isArray(response.mostUsedTags) ? response.mostUsedTags : [],
  };
}

/**
 * 고객 목록 내보내기 (CSV/Excel)
 */
export async function exportCustomers(
  format: 'csv' | 'excel' = 'csv',
  query: Partial<CustomerSearchQuery> = {}
): Promise<Blob> {
  // 검색 쿼리 검증
  const validatedQuery = CustomerUtils.validateSearchQuery({
    ...query,
    limit: 1000, // 내보내기는 더 큰 제한
  });

  // URL 파라미터 구성
  const params = new URLSearchParams();
  Object.entries(validatedQuery).forEach(([key, value]) => {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, String(item)));
      } else {
        params.append(key, String(value));
      }
    }
  });
  params.append('format', format);

  const response = await api.get<Blob>(`/api/customers/export?${params.toString()}`, {
    headers: {
      'Accept': format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });

  return response;
}

/**
 * 고객 일괄 가져오기 (CSV/Excel)
 */
export interface ImportCustomersResult {
  success: number;
  errors: Array<{
    row: number;
    error: string;
    data: unknown;
  }>;
  total: number;
}

export async function importCustomers(file: File): Promise<ImportCustomersResult> {
  if (!file) {
    throw new Error('파일이 필요합니다');
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<ImportCustomersResult>('/api/customers/import', formData);

  return response;
}