/**
 * AIMS UIX-3 Customer Entity Model
 * @since 2025-09-15
 * @version 2.0.0 - MongoDB 스키마 구조 반영
 *
 * 고객 엔티티의 타입 정의 및 검증 스키마
 * Zod를 사용한 런타임 타입 검증
 * MongoDB customers 컬렉션 구조와 일치
 */

import { z } from 'zod';

/**
 * 주소 정보 스키마
 */
export const AddressSchema = z.object({
  postal_code: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
});

/**
 * 주소 이력 항목 스키마
 */
export const AddressHistoryItemSchema = z.object({
  _id: z.string().optional(),
  address: AddressSchema,
  changed_at: z.string().datetime(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  changed_by: z.string().optional(),
});

/**
 * 개인 정보 스키마
 */
export const PersonalInfoSchema = z.object({
  name: z.string().optional(),
  name_en: z.string().optional(),
  birth_date: z.string().nullable().optional(),
  gender: z.preprocess(
    (val) => (val === '남' ? 'M' : val === '여' ? 'F' : val === null ? undefined : val),
    z.enum(['M', 'F']).optional()
  ),
  mobile_phone: z.string().nullable().optional(),
  home_phone: z.string().nullable().optional(),
  work_phone: z.string().nullable().optional(),
  email: z.string().email('유효한 이메일 주소를 입력해주세요').nullable().optional().or(z.literal('')),
  address: AddressSchema.nullable().optional(),
});

/**
 * 보험 정보 스키마
 */
export const InsuranceInfoSchema = z.object({
  customer_type: z.enum(['개인', '법인']).default('개인'),
  risk_level: z.string().optional(),
  annual_premium: z.number().optional(),
  total_coverage: z.number().optional(),
});

/**
 * 메타 정보 스키마
 */
export const MetaSchema = z.object({
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string().nullable().optional(),
  last_modified_by: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  original_name: z.string().nullable().optional(),
});

/**
 * 고객 전체 스키마
 */
export const CustomerSchema = z.object({
  _id: z.string(),
  personal_info: PersonalInfoSchema,
  insurance_info: InsuranceInfoSchema.optional(),
  contracts: z.array(z.any()).default([]),
  documents: z.array(z.any()).default([]),
  consultations: z.array(z.any()).default([]),
  meta: MetaSchema,
  tags: z.array(z.string()).default([]),
  segments: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  search_metadata: z.record(z.string(), z.unknown()).optional(),
  // ⭐ Soft Delete 필드
  deleted_at: z.string().datetime().nullable().optional(),
  deleted_by: z.string().nullable().optional(),
});

/**
 * 고객 생성 요청 스키마
 */
export const CreateCustomerSchema = z.object({
  personal_info: PersonalInfoSchema,
  insurance_info: InsuranceInfoSchema.optional(),
  contracts: z.array(z.any()).default([]),
  documents: z.array(z.any()).default([]),
  consultations: z.array(z.any()).default([]),
});

/**
 * 고객 업데이트 요청 스키마
 *
 * 업데이트는 personal_info와 insurance_info만 가능
 * _id, meta, contracts, documents, consultations는 업데이트 대상이 아님
 */
export const UpdateCustomerSchema = z.object({
  personal_info: PersonalInfoSchema.partial().optional(),
  insurance_info: InsuranceInfoSchema.partial().optional(),
});

/**
 * 고객 검색 쿼리 스키마
 */
export const CustomerSearchQuerySchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100000).default(20),  // 지역별 보기 등을 위해 큰 값 허용
  search: z.string().optional(),
  status: z.string().optional(),
  customerType: z.enum(['개인', '법인']).optional(),
  region: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hasDocuments: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * 고객 검색 페이지네이션 스키마
 */
export const CustomerSearchPaginationSchema = z.object({
  currentPage: z.number().optional(),
  page: z.number().optional(),
  totalPages: z.number().optional(),
  totalPage: z.number().optional(),
  totalCount: z.number().optional(),
  total: z.number().optional(),
  count: z.number().optional(),
  limit: z.number().optional(),
  pageSize: z.number().optional(),
  hasMore: z.boolean().optional(),
  hasNext: z.boolean().optional(),
  has_next: z.boolean().optional(),
}).passthrough();

/**
 * 고객 검색 응답 스키마
 */
export const CustomerSearchResponseSchema = z.object({
  customers: z.array(CustomerSchema),
  pagination: CustomerSearchPaginationSchema.optional(),
  tags: z.array(z.string()).optional(),
  availableTags: z.array(z.string()).optional(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    statuses: z.array(z.string()).optional(),
  }).partial().optional(),
  metadata: z.object({
    availableTags: z.array(z.string()).optional(),
    totalTags: z.number().optional(),
    totalRegions: z.number().optional(),
  }).partial().optional(),
}).passthrough();

/**
 * TypeScript 타입 추출
 */
export type Address = z.infer<typeof AddressSchema>;
export type AddressHistoryItem = z.infer<typeof AddressHistoryItemSchema>;
export type PersonalInfo = z.infer<typeof PersonalInfoSchema>;
export type InsuranceInfo = z.infer<typeof InsuranceInfoSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerData = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerData = z.infer<typeof UpdateCustomerSchema>;
export type CustomerSearchQuery = z.infer<typeof CustomerSearchQuerySchema>;
export type CustomerSearchPagination = z.infer<typeof CustomerSearchPaginationSchema>;
export type CustomerSearchResponse = z.infer<typeof CustomerSearchResponseSchema>;

/**
 * 고객 유틸리티
 */
export const CustomerUtils = {
  /**
   * 고객 표시명 반환
   */
  getDisplayName: (customer: Customer): string => {
    return customer.personal_info?.name || '이름 없음';
  },

  /**
   * 고객 유형 텍스트 반환
   */
  getCustomerTypeText: (customer: Customer): string => {
    return customer.insurance_info?.customer_type || '개인';
  },

  /**
   * 고객 연락처 정보 반환
   */
  getContactInfo: (customer: Customer): string => {
    const contacts = [
      customer.personal_info?.mobile_phone,
      customer.personal_info?.email,
    ].filter(Boolean);
    return contacts.length > 0 ? contacts.join(', ') : '연락처 없음';
  },

  /**
   * 고객 나이 계산
   */
  getAge: (customer: Customer): number | null => {
    const birthDate = customer.personal_info?.birth_date;
    if (!birthDate) return null;

    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  },

  /**
   * 고객 성별 텍스트 반환
   */
  getGenderText: (customer: Customer): string => {
    switch (customer.personal_info?.gender) {
      case 'M':
        return '남성';
      case 'F':
        return '여성';
      default:
        return '미입력';
    }
  },

  /**
   * 고객 활성 상태 텍스트 반환
   */
  getStatusText: (customer: Customer): string => {
    return customer.meta?.status === 'active' ? '활성' : '비활성';
  },

  /**
   * 고객 주소 텍스트 반환
   */
  getAddressText: (customer: Customer): string => {
    const address = customer.personal_info?.address;
    if (!address) return '주소 없음';

    const parts = [address.address1, address.address2].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '주소 없음';
  },

  /**
   * 고객 데이터 검증
   */
  validate: (data: unknown): Customer => {
    return CustomerSchema.parse(data);
  },

  /**
   * 고객 생성 데이터 검증
   */
  validateCreateData: (data: unknown): CreateCustomerData => {
    return CreateCustomerSchema.parse(data);
  },

  /**
   * 고객 업데이트 데이터 검증
   */
  validateUpdateData: (data: unknown): UpdateCustomerData => {
    return UpdateCustomerSchema.parse(data);
  },

  /**
   * 검색 쿼리 검증
   */
  validateSearchQuery: (query: unknown): CustomerSearchQuery => {
    return CustomerSearchQuerySchema.parse(query);
  },

  /**
   * 검색 응답 검증
   */
  validateSearchResponse: (response: unknown): CustomerSearchResponse => {
    return CustomerSearchResponseSchema.parse(response);
  },

  /**
   * 고객 이름으로 정렬하는 비교 함수
   */
  sortByName: (a: Customer, b: Customer): number => {
    const nameA = a.personal_info?.name || '';
    const nameB = b.personal_info?.name || '';
    return nameA.localeCompare(nameB, 'ko', { numeric: true });
  },

  /**
   * 고객 생성일로 정렬하는 비교 함수 (최신순)
   */
  sortByCreatedDate: (a: Customer, b: Customer): number => {
    const dateA = a.meta?.created_at || '';
    const dateB = b.meta?.created_at || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  },
};

/**
 * 고객 유형 유틸리티
 */
export const CustomerTypeUtils = {
  /**
   * 고객 유형 아이콘 반환
   */
  getIcon: (customerType: string): string => {
    return customerType === '법인' ? '🏢' : '👤';
  },

  /**
   * 고객 유형 색상 반환
   */
  getColor: (customerType: string): string => {
    return customerType === '법인' ? 'blue' : 'green';
  },
};

// ==================== Customer Memo ====================

/**
 * 고객 메모 스키마
 * @since 2025-12-10
 */
export const CustomerMemoSchema = z.object({
  _id: z.string(),
  customer_id: z.string(),
  content: z.string().min(1),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  updated_by: z.string().optional(),
  is_mine: z.boolean().optional(),
});

export type CustomerMemo = z.infer<typeof CustomerMemoSchema>;
