/**
 * AIMS 공유 스키마 - 고객 필드 정의
 *
 * customers 컬렉션의 필드 구조를 정의합니다.
 * MCP와 aims_api가 동일한 필드에 접근하도록 보장합니다.
 *
 * @since 2025-12-21
 */

/**
 * 고객 필드명 상수
 *
 * 규칙:
 * - 새 필드 추가 시 반드시 여기에 정의
 * - DB 쿼리에서 직접 문자열 사용 금지
 * - 중첩 필드는 점(.) 표기법 사용
 */
export const CUSTOMER_FIELDS = {
  // 최상위 필드
  MEMO: 'memo',
  STATUS: 'status',

  // personal_info 하위 필드
  PERSONAL_INFO: {
    ROOT: 'personal_info',
    NAME: 'personal_info.name',
    MOBILE_PHONE: 'personal_info.mobile_phone',
    BIRTH_DATE: 'personal_info.birth_date',
    EMAIL: 'personal_info.email',
    ADDRESS: 'personal_info.address',
  },

  // insurance_info 하위 필드
  INSURANCE_INFO: {
    ROOT: 'insurance_info',
    CUSTOMER_TYPE: 'insurance_info.customer_type',
  },

  // meta 하위 필드
  META: {
    ROOT: 'meta',
    CREATED_BY: 'meta.created_by',
    CREATED_AT: 'meta.created_at',
    UPDATED_AT: 'meta.updated_at',
    STATUS: 'meta.status',
  },
} as const;

/**
 * 고객 유형 enum
 */
export const CUSTOMER_TYPES = {
  INDIVIDUAL: '개인',
  CORPORATE: '법인',
} as const;

export type CustomerType = typeof CUSTOMER_TYPES[keyof typeof CUSTOMER_TYPES];

/**
 * 고객 상태 enum
 */
export const CUSTOMER_STATUS = {
  ACTIVE: 'active',
  DORMANT: 'dormant',
  DELETED: 'deleted',
} as const;

export type CustomerStatus = typeof CUSTOMER_STATUS[keyof typeof CUSTOMER_STATUS];
