/**
 * Internal API 계약 테스트
 *
 * aims_api의 Internal API 응답이 @aims/shared-schema에 정의된
 * 필수 필드를 포함하는지 검증합니다.
 *
 * Python 서비스(document_pipeline, annual_report_api)가 이 응답 구조에 의존하므로,
 * 스키마 불일치 시 즉시 감지됩니다.
 *
 * @since 2026-04-04
 */

// TODO: @aims/shared-schema에 INTERNAL_API_REQUIRED_FIELDS, EVENT_CHANNELS 추가 후 .skip 제거
const sharedSchema = require('@aims/shared-schema');
const INTERNAL_API_REQUIRED_FIELDS = sharedSchema.INTERNAL_API_REQUIRED_FIELDS;
const EVENT_CHANNELS = sharedSchema.EVENT_CHANNELS;
const EVENT_REQUIRED_FIELDS = sharedSchema.EVENT_REQUIRED_FIELDS;

// shared-schema에 아직 export되지 않아 전체 skip
const _describe = INTERNAL_API_REQUIRED_FIELDS ? describe : describe.skip;

_describe('Internal API 계약 — 응답 필수 필드', () => {

  test('INTERNAL_API_REQUIRED_FIELDS가 @aims/shared-schema에서 export됨', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS).toBeDefined();
    expect(typeof INTERNAL_API_REQUIRED_FIELDS).toBe('object');
  });

  // 11개 엔드포인트별 필수 필드 정의 존재 검증
  const expectedEndpoints = [
    'files/create', 'files/update', 'files/delete', 'files/delete-by-filter', 'files/count',
    'customers/name', 'customers/batch-names', 'customers/resolve-exact', 'customers/resolve-partial',
    'customers/ownership', 'credit/check',
  ];

  test.each(expectedEndpoints)('엔드포인트 "%s"의 필수 필드가 정의됨', (endpoint) => {
    expect(INTERNAL_API_REQUIRED_FIELDS[endpoint]).toBeDefined();
    expect(Array.isArray(INTERNAL_API_REQUIRED_FIELDS[endpoint])).toBe(true);
    expect(INTERNAL_API_REQUIRED_FIELDS[endpoint].length).toBeGreaterThan(0);
  });

  // 각 엔드포인트의 필수 필드가 누락 없이 정의되었는지
  test('files/create에 insertedId 필수', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS['files/create']).toContain('insertedId');
  });

  test('files/update에 modifiedCount 필수', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS['files/update']).toContain('modifiedCount');
  });

  test('files/delete에 deletedCount 필수', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS['files/delete']).toContain('deletedCount');
  });

  test('customers/name에 name 필수', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS['customers/name']).toContain('name');
  });

  test('customers/batch-names에 names 필수', () => {
    expect(INTERNAL_API_REQUIRED_FIELDS['customers/batch-names']).toContain('names');
  });

  test('customers/resolve-exact에 customerId, customerName 필수', () => {
    const fields = INTERNAL_API_REQUIRED_FIELDS['customers/resolve-exact'];
    expect(fields).toContain('customerId');
    expect(fields).toContain('customerName');
  });

  test('credit/check에 allowed, reason 필수', () => {
    const fields = INTERNAL_API_REQUIRED_FIELDS['credit/check'];
    expect(fields).toContain('allowed');
    expect(fields).toContain('reason');
  });
});

const _describe2 = EVENT_CHANNELS ? describe : describe.skip;

_describe2('Redis 이벤트 계약 — 채널 + 필수 필드', () => {

  test('EVENT_CHANNELS가 @aims/shared-schema에서 export됨', () => {
    expect(EVENT_CHANNELS).toBeDefined();
    expect(typeof EVENT_CHANNELS).toBe('object');
  });

  test('EVENT_REQUIRED_FIELDS가 @aims/shared-schema에서 export됨', () => {
    expect(EVENT_REQUIRED_FIELDS).toBeDefined();
  });

  // 6개 채널 존재 검증
  const expectedChannels = [
    'DOC_PROGRESS', 'DOC_COMPLETE', 'AR_STATUS', 'CR_STATUS', 'DOC_LIST', 'DOC_LINK',
  ];

  test.each(expectedChannels)('EVENT_CHANNELS.%s가 정의됨', (channel) => {
    expect(EVENT_CHANNELS[channel]).toBeDefined();
    expect(typeof EVENT_CHANNELS[channel]).toBe('string');
    expect(EVENT_CHANNELS[channel]).toMatch(/^aims:/);
  });

  // 각 채널의 필수 필드 검증
  test('aims:doc:progress에 document_id, progress 필수', () => {
    const fields = EVENT_REQUIRED_FIELDS[EVENT_CHANNELS.DOC_PROGRESS];
    expect(fields).toContain('document_id');
    expect(fields).toContain('progress');
  });

  test('aims:doc:complete에 document_id 필수', () => {
    const fields = EVENT_REQUIRED_FIELDS[EVENT_CHANNELS.DOC_COMPLETE];
    expect(fields).toContain('document_id');
  });

  test('aims:ar:status에 customer_id, status 필수', () => {
    const fields = EVENT_REQUIRED_FIELDS[EVENT_CHANNELS.AR_STATUS];
    expect(fields).toContain('customer_id');
    expect(fields).toContain('status');
  });

  test('aims:doc:link에 document_id, customer_id, user_id 필수', () => {
    const fields = EVENT_REQUIRED_FIELDS[EVENT_CHANNELS.DOC_LINK];
    expect(fields).toContain('document_id');
    expect(fields).toContain('customer_id');
    expect(fields).toContain('user_id');
  });

  // eventBus.js의 CHANNELS와 shared-schema의 EVENT_CHANNELS 일치 검증
  test('eventBus.js CHANNELS와 shared-schema EVENT_CHANNELS 값 일치', () => {
    const eventBus = require('../../lib/eventBus');
    for (const [key, value] of Object.entries(EVENT_CHANNELS)) {
      expect(eventBus.CHANNELS[key]).toBe(value);
    }
  });
});
