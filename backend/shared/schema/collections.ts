/**
 * AIMS 공유 스키마 - 컬렉션 정의
 *
 * 모든 백엔드 서비스(aims_api, aims_mcp 등)가 이 파일을 import하여
 * 동일한 컬렉션명을 사용합니다.
 *
 * ⚠️ 이 파일 수정 시 모든 서비스에 영향을 미칩니다.
 *
 * @since 2025-12-21
 */

/**
 * MongoDB 컬렉션명 상수
 *
 * 규칙:
 * - 새 컬렉션 추가 시 반드시 여기에 정의
 * - aims_api, aims_mcp 모두 이 상수를 사용
 * - 직접 문자열 사용 금지
 */
export const COLLECTIONS = {
  // 핵심 엔티티
  USERS: 'users',
  CUSTOMERS: 'customers',
  CONTRACTS: 'contracts',
  FILES: 'files',

  // 관계 데이터
  CUSTOMER_RELATIONSHIPS: 'customer_relationships',
  CUSTOMER_MEMOS: 'customer_memos',

  // 참조 데이터
  INSURANCE_PRODUCTS: 'insurance_products',
  INSURERS: 'insurers',

  // 큐
  AR_PARSE_QUEUE: 'ar_parse_queue',

  // 기타
  CHAT_SESSIONS: 'chat_sessions',
  CHAT_MESSAGES: 'chat_messages',
} as const;

/**
 * 컬렉션명 타입
 */
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
