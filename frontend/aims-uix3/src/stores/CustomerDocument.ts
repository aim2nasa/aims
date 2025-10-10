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
  CustomerSearchResponse
} from '@/entities/customer';

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
    console.log('[CustomerDocument] 싱글톤 인스턴스 생성됨');
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
    console.log('[CustomerDocument] 구독자 추가됨. 총:', this.observers.size);

    return () => {
      this.observers.delete(callback);
      console.log('[CustomerDocument] 구독자 제거됨. 총:', this.observers.size);
    };
  }

  /**
   * 모든 구독자에게 변경 알림
   */
  private notify(): void {
    console.log('[CustomerDocument] 모든 구독자에게 알림 전송. 구독자 수:', this.observers.size);
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

      console.log('[CustomerDocument] 고객 목록 로드 시작:', query);
      const response = await CustomerService.getCustomers(query);

      this.customers = response.customers;
      this.total = response.total ?? this.customers.length; // 🔥 FIX: total이 undefined일 경우 customers.length 사용
      this.hasMore = response.hasMore;

      console.log('[CustomerDocument] 고객 목록 로드 완료:', {
        count: this.customers.length,
        total: this.total,
        hasMore: this.hasMore
      });

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
      console.log('[CustomerDocument] 고객 생성 시작:', data);
      const newCustomer = await CustomerService.createCustomer(data);

      // 로컬 상태 업데이트
      this.customers = [newCustomer, ...this.customers];
      this.total += 1;

      console.log('[CustomerDocument] 고객 생성 완료:', newCustomer);
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
      console.log('[CustomerDocument] 고객 수정 시작:', { id, data });
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

      console.log('[CustomerDocument] 고객 수정 완료:', updatedCustomer);
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
      console.log('[CustomerDocument] 고객 삭제 시작:', id);
      await CustomerService.deleteCustomer(id);

      // 로컬 상태 업데이트
      this.customers = this.customers.filter(c => c._id !== id);
      this.total -= 1;

      console.log('[CustomerDocument] 고객 삭제 완료:', id);
      this.notify(); // 삭제 완료 알림
    } catch (error) {
      console.error('[CustomerDocument] 고객 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 전체 데이터 새로고침
   */
  async refresh(query?: Partial<CustomerSearchQuery>): Promise<void> {
    console.log('[CustomerDocument] 전체 데이터 새로고침');
    await this.loadCustomers(query);
  }

  /**
   * Document 상태 초기화
   */
  reset(): void {
    console.log('[CustomerDocument] 상태 초기화');
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

/**
 * 전역 접근을 위한 편의 함수
 */
export const getCustomerDocument = () => CustomerDocument.getInstance();
