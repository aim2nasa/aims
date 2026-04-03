/**
 * AIMS 공유 스키마 - 엔트리 포인트
 *
 * 모든 백엔드 서비스가 이 파일을 통해 스키마에 접근합니다.
 *
 * 사용법:
 *   import { COLLECTIONS, CUSTOMER_FIELDS } from '@aims/shared/schema';
 *
 * @since 2025-12-21
 */

export * from './collections.js';
export * from './customers.js';
export * from './ar-parse-queue.js';
export * from './internal-api.js';
export * from './redis-events.js';
