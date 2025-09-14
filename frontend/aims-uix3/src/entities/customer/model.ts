/**
 * AIMS UIX-3 Customer Entity Model
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 엔티티의 타입 정의 및 검증 스키마
 * Zod를 사용한 런타임 타입 검증
 */

import { z } from 'zod';

/**
 * 고객 기본 정보 스키마
 */
export const CustomerSchema = z.object({
  _id: z.string(),
  name: z.string().min(1, '이름은 필수입니다'),
  phone: z.string().optional(),
  email: z.string().email('유효한 이메일 주소를 입력해주세요').optional(),
  address: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['M', 'F', 'other']).optional(),
  occupation: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),

  // 메타데이터
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isActive: z.boolean().default(true),
});

/**
 * 고객 생성 요청 스키마
 */
export const CreateCustomerSchema = CustomerSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  isActive: true,
  tags: true,
});

/**
 * 고객 업데이트 요청 스키마
 */
export const UpdateCustomerSchema = CreateCustomerSchema.partial({
  name: true,
});

/**
 * 고객 검색 쿼리 스키마
 */
export const CustomerSearchQuerySchema = z.object({
  q: z.string().optional(), // 검색어
  tags: z.array(z.string()).optional(), // 태그 필터
  isActive: z.boolean().optional(), // 활성 상태 필터
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 고객 검색 응답 스키마
 */
export const CustomerSearchResponseSchema = z.object({
  customers: z.array(CustomerSchema),
  total: z.number(),
  hasMore: z.boolean(),
  offset: z.number(),
  limit: z.number(),
});

/**
 * TypeScript 타입 추출
 */
export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerData = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerData = z.infer<typeof UpdateCustomerSchema>;
export type CustomerSearchQuery = z.infer<typeof CustomerSearchQuerySchema>;
export type CustomerSearchResponse = z.infer<typeof CustomerSearchResponseSchema>;

/**
 * 고객 상태 유틸리티
 */
export const CustomerUtils = {
  /**
   * 고객 전체 이름 반환 (표시용)
   */
  getDisplayName: (customer: Customer): string => {
    return customer.name || '이름 없음';
  },

  /**
   * 고객 연락처 정보 반환
   */
  getContactInfo: (customer: Customer): string => {
    const contacts = [customer.phone, customer.email].filter(Boolean);
    return contacts.length > 0 ? contacts.join(', ') : '연락처 없음';
  },

  /**
   * 고객 나이 계산 (생년월일 기준)
   */
  getAge: (customer: Customer): number | null => {
    if (!customer.birthDate) return null;

    const birth = new Date(customer.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  },

  /**
   * 고객 활성 상태 텍스트 반환
   */
  getStatusText: (customer: Customer): string => {
    return customer.isActive ? '활성' : '비활성';
  },

  /**
   * 고객 성별 텍스트 반환
   */
  getGenderText: (customer: Customer): string => {
    switch (customer.gender) {
      case 'M':
        return '남성';
      case 'F':
        return '여성';
      case 'other':
        return '기타';
      default:
        return '미입력';
    }
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
    return a.name.localeCompare(b.name, 'ko', { numeric: true });
  },

  /**
   * 고객 생성일로 정렬하는 비교 함수 (최신순)
   */
  sortByCreatedDate: (a: Customer, b: Customer): number => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  },

  /**
   * 고객 업데이트일로 정렬하는 비교 함수 (최신순)
   */
  sortByUpdatedDate: (a: Customer, b: Customer): number => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  },
};

/**
 * 고객 태그 관련 유틸리티
 */
export const CustomerTagUtils = {
  /**
   * 자주 사용되는 태그 목록
   */
  COMMON_TAGS: [
    '중요고객',
    'VIP',
    '신규고객',
    '재방문',
    '보험가입',
    '상담완료',
    '계약체결',
    '보험금청구',
    '문의사항',
    '불만사항',
  ] as const,

  /**
   * 태그 색상 매핑
   */
  getTagColor: (tag: string): string => {
    const colorMap: Record<string, string> = {
      '중요고객': 'red',
      'VIP': 'purple',
      '신규고객': 'green',
      '재방문': 'blue',
      '보험가입': 'orange',
      '상담완료': 'cyan',
      '계약체결': 'gold',
      '보험금청구': 'magenta',
      '문의사항': 'gray',
      '불만사항': 'red',
    };

    return colorMap[tag] || 'default';
  },

  /**
   * 태그 추가
   */
  addTag: (customer: Customer, tag: string): Customer => {
    if (!customer.tags.includes(tag)) {
      return {
        ...customer,
        tags: [...customer.tags, tag],
      };
    }
    return customer;
  },

  /**
   * 태그 제거
   */
  removeTag: (customer: Customer, tag: string): Customer => {
    return {
      ...customer,
      tags: customer.tags.filter(t => t !== tag),
    };
  },

  /**
   * 태그 토글
   */
  toggleTag: (customer: Customer, tag: string): Customer => {
    return customer.tags.includes(tag)
      ? CustomerTagUtils.removeTag(customer, tag)
      : CustomerTagUtils.addTag(customer, tag);
  },
};