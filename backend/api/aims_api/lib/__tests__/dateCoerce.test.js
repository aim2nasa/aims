/**
 * dateCoerce 모듈 단위 테스트 (#55)
 *
 * 게이트웨이가 ISO 문자열 날짜 필드를 BSON Date로 자동 변환하는지 검증.
 * 검증 대상:
 *   - lib/dateCoerce.js
 *   - 사용처: routes/internal-routes.js (POST /internal/files, PATCH /internal/files/:id)
 *
 * AC 매핑:
 *   - AC#1: POST /internal/files → createdAt 변환
 *   - AC#2: PATCH /internal/files/:id → overallStatusUpdatedAt 변환
 *   - AC#3: PDF 변환 → upload.converted_at 변환
 *   - AC#7: 잘못된 페이로드 거부
 *   - AC#10: 단위 테스트 PASS
 */

const {
  coerceDate,
  coerceFileDocumentDates,
  coerceFileSetDates,
  FileInsertSchema,
  FilePatchSetSchema,
} = require('../dateCoerce');

describe('coerceDate (원자 함수)', () => {
  test('Python isoformat (마이크로초 + 타임존 없음) → Date', () => {
    const input = '2026-04-07T01:23:10.919750';
    const result = coerceDate(input);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-04-07T01:23:10.919Z');
  });

  test('표준 ISO 8601 (Z 포함) → Date', () => {
    const input = '2026-04-10T08:28:12.243Z';
    const result = coerceDate(input);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-04-10T08:28:12.243Z');
  });

  test('타임존 +09:00 포함 → Date (UTC로 정규화)', () => {
    const input = '2026-04-10T17:28:12.243+09:00';
    const result = coerceDate(input);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-04-10T08:28:12.243Z');
  });

  test('이미 Date 객체 → 그대로 반환', () => {
    const input = new Date('2026-04-10T08:28:12.243Z');
    const result = coerceDate(input);
    expect(result).toBe(input); // 동일 객체
  });

  test('null → null', () => {
    expect(coerceDate(null)).toBeNull();
  });

  test('undefined → undefined', () => {
    expect(coerceDate(undefined)).toBeUndefined();
  });

  test('숫자 → 그대로 (Date로 강제 변환 안 함)', () => {
    expect(coerceDate(12345)).toBe(12345);
  });

  test('일반 문자열 (날짜 아님) → 그대로', () => {
    expect(coerceDate('hello')).toBe('hello');
  });

  test('"not-a-date" → 그대로 (변환 실패 시 원본 유지)', () => {
    expect(coerceDate('not-a-date')).toBe('not-a-date');
  });
});

describe('coerceFileDocumentDates (files 컬렉션 insert용)', () => {
  test('createdAt 단일 필드 변환', () => {
    const doc = {
      ownerId: 'user1',
      createdAt: '2026-04-07T01:23:10.919750',
      upload: { originalName: 'test.pdf' },
    };
    const result = coerceFileDocumentDates(doc);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.ownerId).toBe('user1');
    expect(result.upload.originalName).toBe('test.pdf');
  });

  test('overallStatusUpdatedAt 변환', () => {
    const doc = {
      overallStatusUpdatedAt: '2026-04-07T01:23:10.919750',
    };
    const result = coerceFileDocumentDates(doc);
    expect(result.overallStatusUpdatedAt).toBeInstanceOf(Date);
  });

  test('upload.converted_at 중첩 필드 변환', () => {
    const doc = {
      upload: {
        originalName: 'test.pdf',
        converted_at: '2026-04-07T01:23:10.919750',
      },
    };
    const result = coerceFileDocumentDates(doc);
    expect(result.upload.converted_at).toBeInstanceOf(Date);
    expect(result.upload.originalName).toBe('test.pdf');
  });

  test('모든 날짜 필드 동시 변환', () => {
    const doc = {
      createdAt: '2026-04-07T01:23:10.919750',
      overallStatusUpdatedAt: '2026-04-07T02:00:00.000Z',
      upload: { converted_at: '2026-04-07T03:00:00.000Z' },
    };
    const result = coerceFileDocumentDates(doc);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.overallStatusUpdatedAt).toBeInstanceOf(Date);
    expect(result.upload.converted_at).toBeInstanceOf(Date);
  });

  test('passthrough — 알려지지 않은 필드는 그대로', () => {
    const doc = {
      createdAt: '2026-04-07T01:23:10.919750',
      meta: { full_text: '매우 긴 텍스트...', summary: '요약', custom_field: 'x' },
      ownerId: 'user1',
    };
    const result = coerceFileDocumentDates(doc);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.meta.full_text).toBe('매우 긴 텍스트...');
    expect(result.meta.custom_field).toBe('x');
    expect(result.ownerId).toBe('user1');
  });

  test('docembed.updated_at은 변환 안 함 (의도적 string)', () => {
    const doc = {
      docembed: { updated_at: '2026-04-07T01:23:10.919750', status: 'done' },
    };
    const result = coerceFileDocumentDates(doc);
    expect(typeof result.docembed.updated_at).toBe('string');
  });

  test('upload.uploaded_at은 변환 안 함 (의도적 string)', () => {
    const doc = {
      upload: { uploaded_at: '2026-04-07T01:23:10.919750', originalName: 'a.pdf' },
    };
    const result = coerceFileDocumentDates(doc);
    expect(typeof result.upload.uploaded_at).toBe('string');
  });

  test('null/undefined 입력 → 안전 처리', () => {
    expect(coerceFileDocumentDates(null)).toBeNull();
    expect(coerceFileDocumentDates(undefined)).toBeUndefined();
  });
});

describe('coerceFileSetDates ($set operator용 - PATCH)', () => {
  test('flat key createdAt 변환', () => {
    const setObj = {
      createdAt: '2026-04-07T01:23:10.919750',
      status: 'completed',
    };
    const result = coerceFileSetDates(setObj);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.status).toBe('completed');
  });

  test('dot-path "upload.converted_at" 변환', () => {
    const setObj = {
      'upload.converted_at': '2026-04-07T01:23:10.919750',
      'upload.fileSize': 1234,
    };
    const result = coerceFileSetDates(setObj);
    expect(result['upload.converted_at']).toBeInstanceOf(Date);
    expect(result['upload.fileSize']).toBe(1234);
  });

  test('overallStatusUpdatedAt (ocr_worker가 보내는 케이스)', () => {
    const setObj = {
      overallStatusUpdatedAt: '2026-04-07T01:23:10.919750',
      overallStatus: 'embedding',
    };
    const result = coerceFileSetDates(setObj);
    expect(result.overallStatusUpdatedAt).toBeInstanceOf(Date);
  });

  test('알려지지 않은 필드는 그대로', () => {
    const setObj = {
      'custom.nested.field': 'value',
      counter: 42,
    };
    const result = coerceFileSetDates(setObj);
    expect(result['custom.nested.field']).toBe('value');
    expect(result.counter).toBe(42);
  });
});

describe('FileInsertSchema (Zod 스키마 - 직접 사용)', () => {
  test('valid 페이로드 → parse 성공 + Date 변환', () => {
    const input = {
      ownerId: 'user1',
      createdAt: '2026-04-07T01:23:10.919750',
      upload: { originalName: 'test.pdf', fileSize: 1234 },
    };
    const result = FileInsertSchema.parse(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.ownerId).toBe('user1');
  });

  test('잘못된 createdAt ("not-a-date") → 검증 실패', () => {
    const input = {
      ownerId: 'user1',
      createdAt: 'not-a-date',
    };
    const parseResult = FileInsertSchema.safeParse(input);
    expect(parseResult.success).toBe(false);
  });

  test('createdAt 누락 → 허용 (optional)', () => {
    const input = { ownerId: 'user1' };
    const parseResult = FileInsertSchema.safeParse(input);
    expect(parseResult.success).toBe(true);
  });
});
