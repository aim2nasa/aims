/**
 * dateCoerce.js — DB 게이트웨이 날짜 필드 자동 변환 모듈 (#55)
 *
 * 목적:
 *   파이프라인(Python 서비스)이 보내는 ISO 8601 string timestamp를
 *   MongoDB BSON Date로 자동 변환하여 타입 안전성을 보장합니다.
 *
 * 배경 (#55):
 *   - Python isoformat (예: "2026-04-07T01:23:10.919750")이 string으로 그대로 저장되어
 *     인덱스 정렬/범위 쿼리 결과가 부정확해지는 버그 발견.
 *   - Source of Truth: BSON Date.
 *
 * 사용처:
 *   - routes/internal-routes.js POST /internal/files
 *   - routes/internal-routes.js PATCH /internal/files/:id
 *   - routes/internal-routes.js PATCH /internal/files/:id/parsing-status (extra_fields)
 *
 * 변환 대상 (DATE_FIELDS):
 *   - top-level: createdAt, updatedAt, overallStatusUpdatedAt
 *   - nested:    upload.converted_at
 *
 * 변환 제외 (의도적 string 유지):
 *   - upload.uploaded_at
 *   - docembed.updated_at
 */

const { z } = require('zod');

// 변환 대상 필드 (top-level)
const TOP_LEVEL_DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'overallStatusUpdatedAt',
]);

// 변환 대상 필드 (dot-path) — $set 및 중첩 객체 양쪽에 사용
const DOT_PATH_DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'overallStatusUpdatedAt',
  'upload.converted_at',
]);

// ISO 8601 패턴 (Python isoformat 포함, Z/타임존 옵션)
//   - "2026-04-07T01:23:10"
//   - "2026-04-07T01:23:10.919750"
//   - "2026-04-07T01:23:10.919Z"
//   - "2026-04-07T17:28:12.243+09:00"
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// 타임존 표시(끝의 Z 또는 +HH:MM/-HH:MM)가 있는지 검사
const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Python isoformat 등 타임존이 없는 ISO 문자열을 UTC로 명시하기 위해
 * 'Z'를 부착합니다. 타임존이 이미 있으면 그대로 반환.
 *
 * 이유: Node.js `new Date('2026-04-07T01:23:10.919750')`는 ECMAScript 사양상
 * 마이크로초/타임존 없는 형식을 **로컬 타임존**으로 해석할 수 있어
 * 의도와 다른 시각이 만들어집니다. AIMS는 모든 timestamp가 UTC라는 SSOT를
 * 따르므로 명시적으로 UTC(Z)로 강제합니다.
 */
function normalizeIsoForUtc(s) {
  if (HAS_TZ_RE.test(s)) return s;
  // 마이크로초(7자리 이상) → 밀리초(3자리)로 절단 후 Z 부착
  // 예: "2026-04-07T01:23:10.919750" → "2026-04-07T01:23:10.919Z"
  //     "2026-04-07T01:23:10.9197506" → "2026-04-07T01:23:10.919Z"
  //     "2026-04-07T01:23:10" → "2026-04-07T01:23:10Z"
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
  if (m) {
    const base = m[1];
    const frac = m[2];
    if (frac && frac.length > 0) {
      return `${base}.${frac.slice(0, 3).padEnd(3, '0')}Z`;
    }
    return `${base}Z`;
  }
  // 위 패턴에 안 맞으면 그대로 (Date 생성에서 실패하면 호출자가 원본 유지)
  return s;
}

/**
 * 단일 값을 Date로 강제 변환 (실패 시 원본 유지).
 *
 * @param {*} value
 * @returns {Date|*} Date 객체 또는 원본
 */
function coerceDate(value) {
  // null/undefined: 그대로
  if (value === null) return null;
  if (value === undefined) return undefined;

  // 이미 Date 객체: 그대로 반환 (동일 참조)
  if (value instanceof Date) return value;

  // 문자열: ISO 8601 패턴이면 Date로 변환 시도
  if (typeof value === 'string') {
    if (!ISO_8601_RE.test(value)) return value;
    const normalized = normalizeIsoForUtc(value);
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return value;
    return d;
  }

  // 그 외 (숫자, boolean, 객체 등): 그대로
  return value;
}

/**
 * files 컬렉션 insert용 문서의 날짜 필드를 Date로 변환합니다.
 * - top-level 필드: createdAt, updatedAt, overallStatusUpdatedAt
 * - 중첩: upload.converted_at
 * - **passthrough**: 알려지지 않은 필드는 그대로 유지.
 * - **제외**: upload.uploaded_at, docembed.updated_at은 손대지 않음.
 *
 * 원본 doc은 변경하지 않고 얕은 복사본을 반환합니다.
 *
 * @param {object|null|undefined} doc
 * @returns {object|null|undefined}
 */
function coerceFileDocumentDates(doc) {
  if (doc === null) return null;
  if (doc === undefined) return undefined;
  if (typeof doc !== 'object' || Array.isArray(doc)) return doc;

  const out = { ...doc };

  // top-level 날짜 필드
  for (const key of TOP_LEVEL_DATE_FIELDS) {
    if (key in out) {
      out[key] = coerceDate(out[key]);
    }
  }

  // upload.converted_at (uploaded_at은 절대 건드리지 않음)
  if (out.upload && typeof out.upload === 'object' && !Array.isArray(out.upload)) {
    if ('converted_at' in out.upload) {
      out.upload = { ...out.upload, converted_at: coerceDate(out.upload.converted_at) };
    }
  }

  return out;
}

/**
 * MongoDB updateOne $set 객체의 날짜 필드를 Date로 변환합니다.
 *
 * 처리 키:
 *   - flat key: createdAt, updatedAt, overallStatusUpdatedAt
 *   - dot-path: upload.converted_at
 *
 * 그 외 키는 그대로 통과(passthrough).
 *
 * @param {object|null|undefined} setObj
 * @returns {object|null|undefined}
 */
function coerceFileSetDates(setObj) {
  if (setObj === null) return null;
  if (setObj === undefined) return undefined;
  if (typeof setObj !== 'object' || Array.isArray(setObj)) return setObj;

  const out = { ...setObj };
  for (const key of Object.keys(out)) {
    if (DOT_PATH_DATE_FIELDS.has(key)) {
      out[key] = coerceDate(out[key]);
    }
  }
  return out;
}

// ============================================================================
// Zod 스키마 — 직접 사용하면 잘못된 페이로드를 즉시 거부 가능
// ============================================================================

/**
 * 문자열을 Date로 강제 변환하면서, 변환 실패 시 검증 에러를 발생시키는 Zod 타입.
 * - undefined/null 그대로 통과 (optional/nullable과 조합)
 * - 이미 Date면 그대로 통과
 */
const zCoercedDate = z.preprocess((val) => {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val;
  if (typeof val === 'string' && ISO_8601_RE.test(val)) {
    const d = new Date(normalizeIsoForUtc(val));
    if (!isNaN(d.getTime())) return d;
  }
  return val; // Date 검증에서 실패하게 둠
}, z.date());

/**
 * files 컬렉션 insert 페이로드 스키마.
 * - 알려진 날짜 필드는 검증/변환
 * - 그 외 필드는 passthrough
 */
const FileInsertSchema = z
  .object({
    createdAt: zCoercedDate.optional(),
    updatedAt: zCoercedDate.optional(),
    overallStatusUpdatedAt: zCoercedDate.optional(),
  })
  .passthrough();

/**
 * PATCH $set 페이로드 스키마.
 * - dot-path 키를 다루기 위해 strict하지 않게 passthrough
 * - 명시적 검증보다는 coerceFileSetDates 사용을 권장
 */
const FilePatchSetSchema = z
  .object({
    createdAt: zCoercedDate.optional(),
    updatedAt: zCoercedDate.optional(),
    overallStatusUpdatedAt: zCoercedDate.optional(),
  })
  .passthrough();

module.exports = {
  coerceDate,
  coerceFileDocumentDates,
  coerceFileSetDates,
  FileInsertSchema,
  FilePatchSetSchema,
  // 내부 노출 (테스트/디버깅용)
  TOP_LEVEL_DATE_FIELDS,
  DOT_PATH_DATE_FIELDS,
};
