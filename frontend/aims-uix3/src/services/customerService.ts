/**
 * AIMS UIX-3 Customer Service Layer
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 관련 비즈니스 로직 및 API 호출을 담당하는 서비스 레이어
 * ARCHITECTURE.md의 Service Layer 패턴을 따름
 */

import { api } from '@/shared/lib/api';
import {
  Customer,
  CreateCustomerData,
  UpdateCustomerData,
  CustomerSearchQuery,
  CustomerSearchResponse,
  CustomerUtils,
} from '@/entities/customer';

/**
 * 고객 API 엔드포인트
 */
const ENDPOINTS = {
  CUSTOMERS: '/api/customers',
  CUSTOMER: (id: string) => `/api/customers/${id}`,
  CUSTOMER_SEARCH: '/api/customers/search',
  CUSTOMER_TAGS: '/api/customers/tags',
  CUSTOMER_STATS: '/api/customers/stats',
  CUSTOMER_EXPORT: '/api/customers/export',
  CUSTOMER_IMPORT: '/api/customers/import',
  CUSTOMER_BULK: '/api/customers/bulk',
} as const;

/**
 * 고객 서비스 클래스
 * 모든 고객 관련 비즈니스 로직과 API 호출을 중앙화
 */
export class CustomerService {
  /**
   * 고객 목록 조회
   */
  static async getCustomers(
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

    const rawResponse = await api.get<unknown>(`${ENDPOINTS.CUSTOMERS}?${params.toString()}`);

    if (import.meta.env.DEV) {
      console.log('[CustomerService.getCustomers] Raw API response:', rawResponse);
    }

    // API 응답이 { success: true, data: { customers: [...], pagination: {...} } } 형식인 경우 변환
    const response =
      rawResponse &&
      typeof rawResponse === 'object' &&
      'success' in rawResponse &&
      'data' in rawResponse
        ? (rawResponse as { success: boolean; data: unknown }).data
        : rawResponse;

    if (import.meta.env.DEV) {
      console.log('[CustomerService.getCustomers] Transformed response:', response);
    }

    // 응답 검증
    return CustomerUtils.validateSearchResponse(response);
  }

  /**
   * 고객 상세 조회
   */
  static async getCustomer(id: string): Promise<Customer> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const response = await api.get<{ success: boolean; data: unknown }>(ENDPOINTS.CUSTOMER(id));

    // 응답에서 data 추출 후 검증
    if (!response.success || !response.data) {
      throw new Error('고객 정보를 가져올 수 없습니다');
    }

    return CustomerUtils.validate(response.data);
  }

  /**
   * 고객 생성
   */
  static async createCustomer(data: CreateCustomerData): Promise<Customer> {
    // 입력 데이터 검증
    const validatedData = CustomerUtils.validateCreateData(data);

    const response = await api.post<{ success: boolean; data: unknown }>(ENDPOINTS.CUSTOMERS, validatedData);

    // 응답에서 data 추출 후 검증
    const customerData = response && typeof response === 'object' && 'data' in response
      ? response.data
      : response;

    return CustomerUtils.validate(customerData);
  }

  /**
   * 고객 정보 수정
   */
  static async updateCustomer(
    id: string,
    data: UpdateCustomerData
  ): Promise<Customer> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    // 업데이트 요청
    await api.put<unknown>(ENDPOINTS.CUSTOMER(id), data);

    // 업데이트 후 최신 정보 조회
    return await CustomerService.getCustomer(id);
  }

  /**
   * 고객 삭제 (Soft Delete - 휴면 처리)
   * 서버가 업데이트된 고객 데이터를 반환하여 즉시 로컬 상태 업데이트 가능
   */
  static async deleteCustomer(id: string): Promise<Customer> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    // Soft Delete (기본값) - 서버가 업데이트된 고객 반환
    const response = await api.delete<{
      success: boolean;
      message: string;
      soft_delete: boolean;
      customer: unknown;
    }>(ENDPOINTS.CUSTOMER(id));

    if (!response.success || !response.customer) {
      throw new Error('고객을 휴면 처리할 수 없습니다');
    }

    // customerChanged 이벤트 발생 (대시보드 등 다른 View 동기화)
    window.dispatchEvent(new CustomEvent('customerChanged'));

    // 업데이트된 고객 데이터 반환
    return CustomerUtils.validate(response.customer);
  }

  /**
   * 고객 영구 삭제 (Hard Delete)
   * 주의: 연결된 문서, 계약, 관계도 모두 삭제됨
   */
  static async permanentDeleteCustomer(id: string): Promise<{
    deletedRelationships: number;
    deletedContracts: number;
    deletedDocuments: number;
  }> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    // Hard Delete with ?permanent=true
    const response = await api.delete<{
      success: boolean;
      deletedRelationships: number;
      deletedContracts: number;
      deletedDocuments: number;
    }>(`${ENDPOINTS.CUSTOMER(id)}?permanent=true`);

    // 모든 관련 이벤트 발생
    window.dispatchEvent(new CustomEvent('customerChanged'));
    window.dispatchEvent(new CustomEvent('contractChanged'));
    window.dispatchEvent(new CustomEvent('documentChanged'));

    return {
      deletedRelationships: response.deletedRelationships || 0,
      deletedContracts: response.deletedContracts || 0,
      deletedDocuments: response.deletedDocuments || 0,
    };
  }

  /**
   * 고객 복원
   */
  static async restoreCustomer(id: string): Promise<Customer> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const response = await api.post<{ success: boolean; data: unknown }>(
      `${ENDPOINTS.CUSTOMER(id)}/restore`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error('고객을 복원할 수 없습니다');
    }

    return CustomerUtils.validate(response.data);
  }

  /**
   * 고객 검색 (텍스트 검색)
   */
  static async searchCustomers(
    searchTerm: string,
    options: Partial<CustomerSearchQuery> = {}
  ): Promise<CustomerSearchResponse> {
    if (!searchTerm.trim()) {
      // 빈 검색어인 경우 전체 목록 반환
      return CustomerService.getCustomers(options);
    }

    const validatedOptions = CustomerUtils.validateSearchQuery(options);
    const query: CustomerSearchQuery = {
      ...validatedOptions,
      search: searchTerm.trim(),
    };

    return CustomerService.getCustomers(query);
  }

  /**
   * 태그별 고객 조회
   */
  static async getCustomersByTags(
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

    return CustomerService.getCustomers(query);
  }

  /**
   * 사용 중인 모든 태그 조회
   */
  static async getCustomerTags(): Promise<string[]> {
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
  static async getCustomerStats(): Promise<CustomerStats> {
    const response = await api.get<CustomerStats>(ENDPOINTS.CUSTOMER_STATS);

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
  static async exportCustomers(
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

    const response = await api.get<Blob>(`${ENDPOINTS.CUSTOMER_EXPORT}?${params.toString()}`, {
      headers: {
        'Accept': format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });

    return response;
  }

  /**
   * 고객 일괄 가져오기 (CSV/Excel)
   */
  static async importCustomers(file: File): Promise<ImportCustomersResult> {
    if (!file) {
      throw new Error('파일이 필요합니다');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<ImportCustomersResult>(ENDPOINTS.CUSTOMER_IMPORT, formData);

    return response;
  }

  /**
   * 고객 일괄 등록/업데이트 (Excel Import용)
   * - 고객명 기준 upsert: 존재하면 업데이트, 없으면 생성
   */
  static async bulkImportCustomers(customers: BulkCustomerInput[]): Promise<BulkImportResult> {
    if (!customers || customers.length === 0) {
      throw new Error('고객 데이터가 필요합니다');
    }

    const response = await api.post<{ success: boolean; message: string; data: BulkImportResult }>(
      ENDPOINTS.CUSTOMER_BULK,
      { customers }
    );

    if (!response.success) {
      throw new Error(response.message || '고객 일괄 등록에 실패했습니다');
    }

    return response.data;
  }

  /**
   * 고객 일괄 삭제 (소프트 삭제)
   */
  static async deleteCustomers(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      throw new Error('삭제할 고객 ID가 필요합니다');
    }

    // 병렬로 삭제 처리
    await Promise.all(ids.map(id => CustomerService.deleteCustomer(id)));
  }

  /**
   * 개발 환경 전용: 모든 고객 삭제
   * 주의: 개발 환경에서만 사용!
   */
  static async deleteAllCustomers(): Promise<{ deletedCount: number }> {
    const response = await api.delete<{ success: boolean; deletedCount: number }>('/api/dev/customers/all');
    return { deletedCount: response.deletedCount };
  }

  /**
   * 고객 일괄 복원
   */
  static async restoreCustomers(ids: string[]): Promise<Customer[]> {
    if (ids.length === 0) {
      throw new Error('복원할 고객 ID가 필요합니다');
    }

    // 병렬로 복원 처리
    return Promise.all(ids.map(id => CustomerService.restoreCustomer(id)));
  }
}

/**
 * 고객 통계 인터페이스
 */
export interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  totalTags: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
}

/**
 * 고객 가져오기 결과 인터페이스
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

/**
 * 고객 일괄 등록 입력 데이터
 */
export interface BulkCustomerInput {
  name: string;
  customer_type: '개인' | '법인';
  mobile_phone?: string;
  address?: string;
  gender?: string;
  birth_date?: string;
}

/**
 * 고객 일괄 등록 결과
 */
export interface BulkImportResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  created: Array<{ name: string; _id: string }>;
  updated: Array<{ name: string; _id: string; changes: string[] }>;
  skipped: Array<{ name: string; reason: string }>;
  errors: Array<{ name: string; reason: string }>;
}

/**
 * 편의를 위한 함수 내보내기 (기존 API와 호환성 유지)
 */
export const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  permanentDeleteCustomer,
  restoreCustomer,
  searchCustomers,
  getCustomersByTags,
  getCustomerTags,
  getCustomerStats,
  exportCustomers,
  importCustomers,
  bulkImportCustomers,
} = CustomerService;

/**
 * 기본 내보내기
 */
export default CustomerService;
