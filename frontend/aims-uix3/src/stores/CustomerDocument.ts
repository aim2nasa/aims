/**
 * AIMS UIX-3 Customer Document (Singleton)
 * @since 2025-10-10
 * @version 1.0.0
 *
 * Document-View 패턴의 Document 역할
 * - 단일 데이터 소스 (Single Source of Truth)
 * - Observer 패턴으로 모든 View에 자동 알림
 * - 모든 CRUD 작업은 이 Document를 통해서만 수행
 */

import { CustomerService } from '@/services/customerService';
import type {
  Customer,
  CreateCustomerData,
  UpdateCustomerData,
  CustomerSearchQuery,
  CustomerSearchPagination
} from '@/entities/customer';

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toMaybeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

const normalizeCustomerPagination = (
  pagination: CustomerSearchPagination | undefined,
  customersLength: number,
  queryLimit?: number
) => {
  const fallbackLimit =
    typeof queryLimit === 'number' && Number.isFinite(queryLimit) && queryLimit > 0
      ? queryLimit
      : customersLength > 0
        ? customersLength
        : 1;

  const limit =
    toFiniteNumber(pagination?.limit) ??
    toFiniteNumber(pagination?.pageSize) ??
    fallbackLimit;

  const safeLimit = limit > 0 ? limit : fallbackLimit;

  const currentPage =
    toFiniteNumber(pagination?.currentPage) ??
    toFiniteNumber(pagination?.page) ??
    1;

  const totalCount =
    toFiniteNumber(pagination?.totalCount) ??
    toFiniteNumber(pagination?.total) ??
    toFiniteNumber(pagination?.count) ??
    customersLength;

  const totalPagesExplicit =
    toFiniteNumber(pagination?.totalPages) ??
    toFiniteNumber(pagination?.totalPage);

  const totalPages =
    totalPagesExplicit && totalPagesExplicit > 0
      ? totalPagesExplicit
      : Math.max(1, Math.ceil(totalCount / Math.max(safeLimit, 1)));

  const hasMore =
    toMaybeBoolean(pagination?.hasMore) ??
    toMaybeBoolean(pagination?.hasNext) ??
    toMaybeBoolean(pagination?.has_next) ??
    currentPage < totalPages;

  return {
    limit: safeLimit,
    currentPage,
    totalCount,
    totalPages,
    hasMore
  };
};

/**
 * Observer 콜백 타입
 */
type ObserverCallback = () => void;

/**
 * CustomerDocument 클래스
 * MFC Document-View 패턴의 Document 역할을 하는 싱글톤 클래스
 */
export class CustomerDocument {
  private static instance: CustomerDocument;

  // Document 데이터
  private customers: Customer[] = [];
  private total: number = 0;
  private hasMore: boolean = false;
  private lastUpdated: number = 0;

  // Observer 패턴: 구독자 목록
  private observers: Set<ObserverCallback> = new Set();

  // 로딩 상태
  private isLoading: boolean = false;
  private error: string | null = null;

  /**
   * Private 생성자 (싱글톤 패턴)
   */
  private constructor() {
    if (import.meta.env.DEV) {
      console.log('[CustomerDocument] 싱글톤 인스턴스 생성됨');
    }
  }

  /**
   * 싱글톤 인스턴스 가져오기
   */
  static getInstance(): CustomerDocument {
    if (!CustomerDocument.instance) {
      CustomerDocument.instance = new CustomerDocument();
    }
    return CustomerDocument.instance;
  }

  // ========== Observer 패턴 메서드 ==========

  /**
   * View를 구독자로 등록
   * @param callback - Document 변경 시 호출될 콜백
   * @returns unsubscribe 함수
   */
  subscribe(callback: ObserverCallback): () => void {
    this.observers.add(callback);
    if (import.meta.env.DEV) {
      if (import.meta.env.DEV) console.log('[CustomerDocument] 구독자 추가됨. 총:', this.observers.size);
    }

    return () => {
      this.observers.delete(callback);
      if (import.meta.env.DEV) {
        if (import.meta.env.DEV) console.log('[CustomerDocument] 구독자 제거됨. 총:', this.observers.size);
      }
    };
  }

  /**
   * 모든 구독자에게 변경 알림
   */
  private notify(): void {
    if (import.meta.env.DEV) {
      if (import.meta.env.DEV) console.log('[CustomerDocument] 모든 구독자에게 알림 전송. 구독자 수:', this.observers.size);
    }
    this.lastUpdated = Date.now();
    this.observers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[CustomerDocument] 구독자 콜백 실행 오류:', error);
      }
    });
  }

  // ========== 데이터 접근 메서드 ==========

  /**
   * 현재 고객 목록 가져오기
   */
  getCustomers(): Customer[] {
    return [...this.customers]; // 불변성 유지
  }

  /**
   * 총 고객 수 가져오기
   */
  getTotal(): number {
    return this.total;
  }

  /**
   * 더 많은 데이터 존재 여부
   */
  getHasMore(): boolean {
    return this.hasMore;
  }

  /**
   * 로딩 상태 가져오기
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * 에러 상태 가져오기
   */
  getError(): string | null {
    return this.error;
  }

  /**
   * 마지막 업데이트 시간
   */
  getLastUpdated(): number {
    return this.lastUpdated;
  }

  /**
   * ID로 특정 고객 찾기
   */
  getCustomerById(id: string): Customer | undefined {
    return this.customers.find(c => c._id === id);
  }

  // ========== CRUD 작업 메서드 ==========

  /**
   * 고객 목록 로드 (READ)
   */
  async loadCustomers(query?: Partial<CustomerSearchQuery>): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.notify(); // 로딩 시작 알림

      if (import.meta.env.DEV) {
        if (import.meta.env.DEV) console.log('[CustomerDocument] 고객 목록 로드 시작:', query);
      }
      const response = await CustomerService.getCustomers(query);

      this.customers = Array.isArray(response.customers) ? response.customers : [];

      const { totalCount, hasMore } = normalizeCustomerPagination(
        response.pagination,
        this.customers.length,
        query?.limit
      );
      this.total = totalCount;
      this.hasMore = hasMore;

      if (import.meta.env.DEV) {
        if (import.meta.env.DEV) console.log('[CustomerDocument] 고객 목록 로드 완료:', {
          count: this.customers.length,
          total: this.total,
          hasMore: this.hasMore
        });
      }

      this.isLoading = false;
      this.notify(); // 로드 완료 알림
    } catch (error) {
      console.error('[CustomerDocument] 고객 목록 로드 실패:', error);
      this.error = error instanceof Error ? error.message : '고객 목록 로드 실패';
      this.isLoading = false;
      this.notify(); // 에러 알림
    }
  }

  /**
   * 고객 생성 (CREATE)
   */
  async createCustomer(data: CreateCustomerData): Promise<Customer> {
    try {
      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 생성 시작:', data);
      }
      const newCustomer = await CustomerService.createCustomer(data);

      // 로컬 상태 업데이트
      this.customers = [newCustomer, ...this.customers];
      this.total += 1;

      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 생성 완료:', newCustomer);
      }
      this.notify(); // 생성 완료 알림

      return newCustomer;
    } catch (error) {
      console.error('[CustomerDocument] 고객 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 고객 수정 (UPDATE)
   */
  async updateCustomer(id: string, data: UpdateCustomerData): Promise<Customer> {
    try {
      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 수정 시작:', { id, data });
      }
      const updatedCustomer = await CustomerService.updateCustomer(id, data);

      // 로컬 상태 업데이트
      const index = this.customers.findIndex(c => c._id === id);
      if (index !== -1) {
        this.customers = [
          ...this.customers.slice(0, index),
          updatedCustomer,
          ...this.customers.slice(index + 1)
        ];
      }

      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 수정 완료:', updatedCustomer);
      }
      this.notify(); // 수정 완료 알림

      return updatedCustomer;
    } catch (error) {
      console.error('[CustomerDocument] 고객 수정 실패:', error);
      throw error;
    }
  }

  /**
   * 고객 삭제 (DELETE)
   */
  async deleteCustomer(id: string): Promise<void> {
    try {
      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 삭제 시작:', id);
      }
      await CustomerService.deleteCustomer(id);

      if (import.meta.env.DEV) {
        console.log('[CustomerDocument] 고객 삭제 완료, 최신 데이터 로드 중:', id);
      }

      // 삭제 후 서버에서 최신 데이터 다시 로드
      await this.loadCustomers({ limit: 10000, page: 1 });
    } catch (error) {
      console.error('[CustomerDocument] 고객 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 전체 데이터 새로고침
   * 기본값: limit: 10000, page: 1 (전체 데이터 로드)
   * Zod 스키마의 기본 limit: 20이 적용되는 것을 방지
   */
  async refresh(query?: Partial<CustomerSearchQuery>): Promise<void> {
    if (import.meta.env.DEV) {
      console.log('[CustomerDocument] 전체 데이터 새로고침');
    }
    // 기본 query 설정 (limit이 없으면 10000 적용)
    const defaultQuery = { limit: 10000, page: 1 };
    const mergedQuery = query ? { ...defaultQuery, ...query } : defaultQuery;
    await this.loadCustomers(mergedQuery);
  }

  /**
   * Document 상태 초기화
   */
  reset(): void {
    if (import.meta.env.DEV) {
      console.log('[CustomerDocument] 상태 초기화');
    }
    this.customers = [];
    this.total = 0;
    this.hasMore = false;
    this.isLoading = false;
    this.error = null;
    this.lastUpdated = 0;
    this.notify();
  }

  /**
   * 디버깅용: 현재 상태 출력
   */
  debug(): void {
    if (import.meta.env.DEV) {
      console.log('[CustomerDocument] 현재 상태:', {
        customers: this.customers.length,
        total: this.total,
        hasMore: this.hasMore,
        isLoading: this.isLoading,
        error: this.error,
        observers: this.observers.size,
        lastUpdated: new Date(this.lastUpdated).toISOString()
      });
    }
  }
}

/**
 * 전역 접근을 위한 편의 함수
 */
export const getCustomerDocument = () => CustomerDocument.getInstance();
