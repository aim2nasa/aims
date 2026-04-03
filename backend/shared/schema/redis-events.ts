/**
 * AIMS 공유 스키마 - Redis Pub/Sub 이벤트 채널 + 페이로드 타입
 *
 * aims_api eventBus.js와 Python 서비스(document_pipeline, annual_report_api)가
 * 동일한 채널명과 페이로드 구조를 공유합니다.
 *
 * ⚠️ 이 파일 수정 시 양쪽 서비스 모두 영향을 미칩니다.
 *
 * @since 2026-04-04
 */

// =========================================================================
// 채널명 상수
// =========================================================================

/** Redis Pub/Sub 이벤트 채널 */
export const EVENT_CHANNELS = {
  DOC_PROGRESS: 'aims:doc:progress',
  DOC_COMPLETE: 'aims:doc:complete',
  AR_STATUS: 'aims:ar:status',
  CR_STATUS: 'aims:cr:status',
  DOC_LIST: 'aims:doc:list',
  DOC_LINK: 'aims:doc:link',
} as const;

export type EventChannelName = typeof EVENT_CHANNELS[keyof typeof EVENT_CHANNELS];

// =========================================================================
// 페이로드 타입
// =========================================================================

/** aims:doc:progress — 문서 처리 진행률 */
export interface DocProgressPayload {
  document_id: string;
  progress: number;        // 0~100, -1 = 에러
  stage?: string;          // 기본: 'processing'
  message?: string;
  owner_id?: string;
}

/** aims:doc:complete — 문서 처리 완료 */
export interface DocCompletePayload {
  document_id: string;
  status?: string;         // 기본: 'completed'
  owner_id?: string;
}

/** aims:ar:status — AR 파싱 상태 변경 */
export interface ARStatusPayload {
  customer_id: string;
  file_id?: string;
  status: string;          // 'completed', 'error', 기타
  error_message?: string;
}

/** aims:cr:status — CRS 파싱 상태 변경 */
export interface CRStatusPayload {
  customer_id: string;
  file_id?: string;
  status: string;          // 'completed', 'error', 기타
  error_message?: string;
}

/** aims:doc:list — 문서 목록 변경 */
export interface DocListPayload {
  user_id: string;
  change_type?: string;    // 기본: 'change'
  document_id?: string;
  document_name?: string;
  status?: string;
}

/** aims:doc:link — 문서-고객 연결 요청 */
export interface DocLinkPayload {
  document_id: string;
  customer_id: string;
  user_id: string;
  notes?: string;
}

// =========================================================================
// 페이로드 필수 필드 검증 헬퍼
// =========================================================================

/**
 * 각 채널의 페이로드 필수 필드
 * Python 서비스에서 발행 전 검증 시 참조합니다.
 */
export const EVENT_REQUIRED_FIELDS = {
  [EVENT_CHANNELS.DOC_PROGRESS]: ['document_id', 'progress'],
  [EVENT_CHANNELS.DOC_COMPLETE]: ['document_id'],
  [EVENT_CHANNELS.AR_STATUS]: ['customer_id', 'status'],
  [EVENT_CHANNELS.CR_STATUS]: ['customer_id', 'status'],
  [EVENT_CHANNELS.DOC_LIST]: ['user_id'],
  [EVENT_CHANNELS.DOC_LINK]: ['document_id', 'customer_id', 'user_id'],
} as const;
