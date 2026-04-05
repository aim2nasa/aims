/**
 * AIMS UIX-3 Relationship Service
 * @since 2025-10-09
 * @version 1.0.0
 *
 * 고객 간 관계 관리 서비스
 */

import { api } from '@/shared/lib/api'
import { invalidateQueries } from '@/app/queryClient'
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
  ALL_RELATIONSHIPS: '/api/relationships',  // 🔧 전체 관계 조회 (N-iteration 제거)
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

    // TanStack Query 캐시 무효화 + 레거시 이벤트 (다른 뷰 동기화용)
    invalidateQueries.relationshipChanged();

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

    // TanStack Query 캐시 무효화 + 레거시 이벤트 (다른 뷰 동기화용)
    invalidateQueries.relationshipChanged();
  }

  /**
   * 모든 고객의 관계 데이터 조회 (트리뷰용)
   * 🔧 N-iteration 제거: 단일 API 호출로 모든 관계 조회
   */
  static async getAllRelationshipsWithCustomers(): Promise<{
    customers: Customer[];
    relationships: Relationship[];
    timestamp: number;
  }> {
    // 🔧 새 벌크 API 사용 - 단일 호출로 모든 관계 + 고객 정보 조회
    const response = await api.get<{
      success: boolean;
      data: {
        relationships: Relationship[];
        customers: Customer[];
        total_count: number;
        timestamp: number;
      };
    }>(ENDPOINTS.ALL_RELATIONSHIPS);

    if (!response.success || !response.data) {
      throw new Error('관계 데이터 조회에 실패했습니다');
    }

    return {
      customers: response.data.customers,
      relationships: response.data.relationships,
      timestamp: response.data.timestamp,
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

