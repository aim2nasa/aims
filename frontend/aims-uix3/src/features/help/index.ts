/**
 * Help Feature — Public API
 *
 * 이 feature 외부에서 접근할 때는 반드시 이 barrel export를 사용하세요.
 * 내부 파일 직접 import 금지.
 */

export { helpApi, NOTICE_CATEGORY_LABELS } from './api';
export type { FAQ, FAQCategory, UsageGuide, Notice } from './api';
