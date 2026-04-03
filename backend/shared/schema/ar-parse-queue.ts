/**
 * AIMS 공유 스키마 - AR 파싱 큐 (ar_parse_queue) 정의
 *
 * aims_api와 annual_report_api가 공유하는 큐 스키마입니다.
 * - aims_api (Node): 큐 삽입(upsert), 조회(find), 삭제(deleteMany)
 * - annual_report_api (Python): 큐 전체 CRUD (ARParseQueueManager)
 *
 * Python 서비스는 이 파일을 직접 import할 수 없으므로,
 * queue_manager.py의 QueueStatus/MAX_RETRY_COUNT와 동기화를 유지해야 합니다.
 *
 * @since 2026-04-03
 */

/**
 * 큐 상태 상수
 *
 * 상태 전이: pending → processing → completed
 *                               └→ failed (retry_count >= MAX_RETRY_COUNT)
 *            processing → pending (재시도 또는 좀비 복구)
 */
export const AR_QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ArQueueStatus = typeof AR_QUEUE_STATUS[keyof typeof AR_QUEUE_STATUS];

/**
 * 큐 필드명 상수
 */
export const AR_QUEUE_FIELDS = {
  FILE_ID: 'file_id',
  CUSTOMER_ID: 'customer_id',
  STATUS: 'status',
  RETRY_COUNT: 'retry_count',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  PROCESSED_AT: 'processed_at',
  ERROR_MESSAGE: 'error_message',
  METADATA: 'metadata',
} as const;

/**
 * 큐 운영 설정 상수
 *
 * annual_report_api의 queue_manager.py와 동일한 값을 유지해야 합니다.
 */
export const AR_QUEUE_CONFIG = {
  /** 최대 재시도 횟수 (초과 시 failed) */
  MAX_RETRY_COUNT: 3,
  /** processing 상태 타임아웃 (초) — 좀비 작업 복구 기준 */
  STALE_TIMEOUT_SECONDS: 300,
  /** completed 작업 보관 기간 (일) */
  COMPLETED_RETENTION_DAYS: 7,
} as const;
