/**
 * AIMS 공유 스키마 - Internal API 응답 타입 정의
 *
 * aims_api의 Internal API 엔드포인트가 반환하는 응답 구조를 정의합니다.
 * Python 서비스(document_pipeline, annual_report_api, aims_rag_api)가
 * 이 스키마를 참조하여 응답 구조를 검증합니다.
 *
 * @since 2026-04-04
 */

// =========================================================================
// 공통 응답 래퍼
// =========================================================================

/** 모든 Internal API 응답의 공통 구조 */
export interface InternalApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// =========================================================================
// Files API 응답 타입
// =========================================================================

/** POST /internal/files — 파일 생성 */
export interface FileCreateResponse {
  insertedId: string;
}

/** PATCH /internal/files/:id — 파일 업데이트 */
export interface FileUpdateResponse {
  modifiedCount: number;
}

/** DELETE /internal/files/:id — 파일 삭제 */
export interface FileDeleteResponse {
  deletedCount: number;
}

/** DELETE /internal/files/by-filter — 필터 기반 파일 삭제 */
export interface FileDeleteByFilterResponse {
  deletedCount: number;
}

/** POST /internal/files/query — 파일 범용 조회 (배열 반환) */
export type FileQueryResponse = Record<string, unknown>[];

/** POST /internal/files/count — 파일 수 조회 */
export interface FileCountResponse {
  count: number;
}

// =========================================================================
// Customers API 응답 타입
// =========================================================================

/** GET /internal/customers/:id/name — 고객명 단건 조회 */
export interface CustomerNameResponse {
  name: string;
  customerType?: string;
}

/** POST /internal/customers/batch-names — 고객명 배치 조회 */
export interface CustomerBatchNamesResponse {
  names: Record<string, string>;
  types: Record<string, string>;
}

/** POST /internal/customers/resolve-by-name — 고객명으로 조회 (exact) */
export interface CustomerResolveExactResponse {
  customerId: string;
  customerName: string;
}

/** POST /internal/customers/resolve-by-name — 고객명으로 조회 (partial) */
export interface CustomerResolvePartialResponse {
  candidates: Array<{
    customerId: string;
    customerName: string;
  }>;
}

/** GET /internal/customers/:id/ownership — 고객 소유권 조회 */
export interface CustomerOwnershipResponse {
  exists: boolean;
}

// =========================================================================
// Credit API 응답 타입
// =========================================================================

/** POST /internal/check-credit — 크레딧 체크 */
export interface CreditCheckResponse {
  allowed: boolean;
  reason: string;
  credits_used?: number;
  credits_remaining?: number;
  bonus_balance?: number;
  total_available?: number;
  credit_quota?: number;
  credit_quota_full?: number;
  credit_usage_percent?: number;
  estimated_credits?: number;
  days_until_reset?: number;
  tier?: string;
  is_first_month?: boolean;
  pro_rata_ratio?: number;
}

// =========================================================================
// Internal API 응답 필수 필드 검증 헬퍼
// =========================================================================

/**
 * Internal API 응답의 필수 필드 정의
 * Python 서비스에서 응답 검증 시 참조합니다.
 *
 * 키: 엔드포인트 식별자
 * 값: data 필드 내 필수 키 목록
 */
export const INTERNAL_API_REQUIRED_FIELDS = {
  // Files
  'files/create': ['insertedId'],
  'files/update': ['modifiedCount'],
  'files/delete': ['deletedCount'],
  'files/delete-by-filter': ['deletedCount'],
  'files/count': ['count'],

  // Customers
  'customers/name': ['name'],
  'customers/batch-names': ['names'],
  'customers/resolve-exact': ['customerId', 'customerName'],
  'customers/resolve-partial': ['candidates'],
  'customers/ownership': ['exists'],

  // Credit
  'credit/check': ['allowed', 'reason'],
} as const;
