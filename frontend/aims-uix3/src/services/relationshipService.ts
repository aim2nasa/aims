/**
 * AIMS UIX-3 Relationship Service
 * @since 2025-10-09
 * @version 1.0.0
 *
 * 고객 간 관계 관리 서비스
 */

import { api } from '@/shared/lib/api'
import { errorReporter } from '@/shared/lib/errorReporter'
import type { Customer } from '@/entities/customer/model'

/**
 * 관계 정보 인터페이스
 */
export interface Relationship {
  _id: string;
  from_customer: string | Customer; // Customer ID or populated object
  related_customer: string | Customer; // Customer ID or populated object
  relationship_info: {
    relationship_type: string;
    relationship_category: string;
    strength?: string;
  };
  relationship_details?: {
    description?: string;
    contact_frequency?: string;
    influence_level?: string;
  };
  insurance_relevance?: {
    is_beneficiary?: boolean;
    cross_selling_opportunity?: boolean;
    referral_potential?: string;
  };
  family_representative?: string | Customer;
  is_reversed?: boolean;
  display_relationship_label?: string;
  meta?: {
    created_at?: string;
    updated_at?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface RelationshipTypeEntry {
  label?: string;
  [key: string]: unknown;
}

export interface RelationshipTypeData {
  all_types?: Record<string, RelationshipTypeEntry>;
  categories?: Record<string, RelationshipTypeEntry>;
  [key: string]: unknown;
}

/**
 * 관계 생성 데이터
 */
export interface CreateRelationshipData {
  relationship_type: string;
  relationship_category: string;
  strength?: string;
  relationship_details?: {
    description?: string;
    contact_frequency?: string;
    influence_level?: string;
  };
  insurance_relevance?: {
    is_beneficiary?: boolean;
    cross_selling_opportunity?: boolean;
    referral_potential?: string;
  };
}

/**
 * 관계 API 엔드포인트
 */
const ENDPOINTS = {
  RELATIONSHIP_TYPES: '/api/relationship-types',
  CUSTOMER_RELATIONSHIPS: (customerId: string) => `/api/customers/${customerId}/relationships`,
  RELATIONSHIP: (customerId: string, relationshipId: string) =>
    `/api/customers/${customerId}/relationships/${relationshipId}`,
} as const;

/**
 * 관계 서비스 클래스
 */
export class RelationshipService {
  /**
   * 관계 유형 조회
   */
  static async getRelationshipTypes(): Promise<RelationshipTypeData> {
    const response = await api.get<{ success: boolean; data: RelationshipTypeData }>(
      ENDPOINTS.RELATIONSHIP_TYPES
    )

    if (!response.success || !response.data) {
      throw new Error('관계 유형 조회에 실패했습니다')
    }

    return response.data
  }

  /**
   * 특정 고객의 관계 조회
   */
  static async getCustomerRelationships(customerId: string): Promise<Relationship[]> {
    if (!customerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const response = await api.get<{ success: boolean; data: { relationships: Relationship[] } }>(
      `${ENDPOINTS.CUSTOMER_RELATIONSHIPS(customerId)}?include_details=true`
    );

    if (!response.success || !response.data) {
      throw new Error('관계 조회에 실패했습니다');
    }

    return response.data.relationships || [];
  }

  /**
   * 관계 생성
   */
  static async createRelationship(
    fromCustomerId: string,
    toCustomerId: string,
    relationshipData: CreateRelationshipData
  ): Promise<Relationship> {
    if (!fromCustomerId.trim() || !toCustomerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    if (fromCustomerId === toCustomerId) {
      throw new Error('자기 자신과는 관계를 설정할 수 없습니다');
    }

    const response = await api.post<{ success: boolean; data: Relationship }>(
      ENDPOINTS.CUSTOMER_RELATIONSHIPS(fromCustomerId),
      {
        to_customer_id: toCustomerId,
        ...relationshipData,
      }
    );

    if (!response.success || !response.data) {
      throw new Error('관계 생성에 실패했습니다');
    }

    // 관계 변경 이벤트 발생 (다른 뷰 동기화용)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('relationshipChanged'));
    }

    return response.data;
  }

  /**
   * 관계 삭제
   */
  static async deleteRelationship(
    customerId: string,
    relationshipId: string
  ): Promise<void> {
    if (!customerId.trim() || !relationshipId.trim()) {
      throw new Error('고객 ID와 관계 ID가 필요합니다');
    }

    const response = await api.delete<{ success: boolean }>(
      ENDPOINTS.RELATIONSHIP(customerId, relationshipId)
    );

    if (!response.success) {
      throw new Error('관계 삭제에 실패했습니다');
    }

    // 관계 변경 이벤트 발생 (다른 뷰 동기화용)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('relationshipChanged'));
    }
  }

  /**
   * 모든 고객의 관계 데이터 조회 (트리뷰용)
   */
  static async getAllRelationshipsWithCustomers(): Promise<{
    customers: Customer[];
    relationships: Relationship[];
    timestamp: number;
  }> {
    // 1. 모든 고객 조회
    const customersResponse = await api.get<{
      success: boolean;
      data: { customers: Customer[] };
    }>('/api/customers?page=1&limit=1000');

    if (!customersResponse.success || !customersResponse.data) {
      throw new Error('고객 데이터 조회에 실패했습니다');
    }

    const customers = customersResponse.data.customers;
    const allRelationships: Relationship[] = [];

    // 2. 각 고객의 관계 정보 조회
    for (const customer of customers) {
      try {
        const relationships = await RelationshipService.getCustomerRelationships(
          customer._id
        );
        relationships.forEach((rel) => {
          allRelationships.push({
            ...rel,
            from_customer: customer,
          });
        });
      } catch (error) {
        console.warn(`고객 ${customer.personal_info?.name}의 관계 조회 실패:`, error);
        errorReporter.reportApiError(error as Error, { component: 'RelationshipService.getAllRelationshipsWithCustomers', payload: { customerId: customer._id } });
      }
    }

    return {
      customers,
      relationships: allRelationships,
      timestamp: Date.now(),
    };
  }
}

/**
 * 편의를 위한 함수 내보내기
 */
export const {
  getRelationshipTypes,
  getCustomerRelationships,
  createRelationship,
  deleteRelationship,
  getAllRelationshipsWithCustomers,
} = RelationshipService;

/**
 * 기본 내보내기
 */
export default RelationshipService;
