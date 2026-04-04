/**
 * Regression Test — 2026-03-28 BSONError 수정
 *
 * 문제: POST /api/notify/document-uploaded 엔드포인트에서
 *       프론트엔드 클라이언트 ID(file_xxx)를 new ObjectId()로 변환 시도 → BSONError
 *
 * 근본 원인:
 *   - notify/document-uploaded는 SSE 알림 전용 엔드포인트
 *   - 바이러스 스캔 + PDF 변환이 이 엔드포인트에 잘못 추가되어 있었음
 *   - 동일 기능이 webhooks/document-processing-complete에서 이미 정상 작동 중 (중복)
 *
 * 수정 내용:
 *   1. notify/document-uploaded에서 바이러스 스캔 + PDF 변환 코드 제거
 *   2. virusScanService.scanAfterUpload에 ObjectId.isValid 방어 코드 추가
 *
 * @since 2026-03-28
 */

const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// 1. notify/document-uploaded에서 바이러스 스캔/PDF 변환 제거 검증
// =============================================================================
describe('FIX-1: notify/document-uploaded는 SSE 알림 전용이어야 함', () => {
  const source = readSource('routes/notification-routes.js');

  // notify/document-uploaded 엔드포인트 본문만 추출
  function getNotifyDocUploadedBody() {
    const routeStart = source.indexOf("'/notify/document-uploaded'");
    if (routeStart === -1) return '';
    // 다음 router. 또는 }); 패턴까지가 이 라우트의 범위
    const nextRoute = source.indexOf('router.', routeStart + 1);
    return source.substring(routeStart, nextRoute > -1 ? nextRoute : routeStart + 3000);
  }

  const routeBody = getNotifyDocUploadedBody();

  test('엔드포인트가 존재해야 함', () => {
    expect(routeBody.length).toBeGreaterThan(0);
  });

  test('scanAfterUpload 호출이 없어야 함 (파이프라인 완료 webhook에서 처리)', () => {
    expect(routeBody).not.toContain('scanAfterUpload');
  });

  test('new ObjectId(documentId) 변환이 없어야 함', () => {
    expect(routeBody).not.toMatch(/new ObjectId\(documentId\)/);
  });

  test('triggerPdfConversionIfNeeded 호출이 없어야 함', () => {
    expect(routeBody).not.toContain('triggerPdfConversionIfNeeded');
  });

  test('SSE 알림 기능은 유지되어야 함', () => {
    expect(routeBody).toContain('notifyCustomerDocSubscribers');
  });

  test('인증 미들웨어가 적용되어 있어야 함', () => {
    expect(routeBody).toContain('authenticateJWT');
  });
});

// =============================================================================
// 2. document-processing-complete에서 바이러스 스캔이 여전히 트리거되는지 검증
// =============================================================================
describe('FIX-2: document-processing-complete에서 바이러스 스캔이 정상 작동해야 함', () => {
  const source = readSource('routes/notification-routes.js');

  function getDocProcessingCompleteBody() {
    const routeStart = source.indexOf("'/webhooks/document-processing-complete'");
    if (routeStart === -1) return '';
    const nextRoute = source.indexOf('router.', routeStart + 1);
    return source.substring(routeStart, nextRoute > -1 ? nextRoute : routeStart + 5000);
  }

  const routeBody = getDocProcessingCompleteBody();

  test('엔드포인트가 존재해야 함', () => {
    expect(routeBody.length).toBeGreaterThan(0);
  });

  test('scanAfterUpload가 호출되어야 함', () => {
    expect(routeBody).toContain('virusScanService.scanAfterUpload');
  });

  test('triggerPdfConversionIfNeeded가 호출되어야 함', () => {
    expect(routeBody).toContain('triggerPdfConversionIfNeeded');
  });

  test('document_id는 요청 body에서 가져와야 함 (신뢰할 수 있는 파이프라인 ID)', () => {
    expect(routeBody).toMatch(/document_id.*req\.body|req\.body.*document_id/s);
  });
});

// =============================================================================
// 3. virusScanService ObjectId.isValid 방어 코드 검증
// =============================================================================
describe('FIX-3: scanAfterUpload에 ObjectId.isValid 방어 코드가 있어야 함', () => {
  const source = readSource('lib/virusScanService.js');

  function getScanAfterUploadBody() {
    const fnStart = source.indexOf('async function scanAfterUpload');
    if (fnStart === -1) return '';
    return source.substring(fnStart, fnStart + 600);
  }

  const fnBody = getScanAfterUploadBody();

  test('ObjectId.isValid 검증이 new ObjectId 변환 전에 있어야 함', () => {
    const isValidIdx = fnBody.indexOf('ObjectId.isValid');
    const newObjectIdIdx = fnBody.indexOf('new ObjectId(documentId)');
    expect(isValidIdx).toBeGreaterThan(-1);
    expect(newObjectIdIdx).toBeGreaterThan(-1);
    expect(isValidIdx).toBeLessThan(newObjectIdIdx);
  });

  test('유효하지 않은 ID일 때 early return 해야 함', () => {
    // ObjectId.isValid 실패 시 return이 있어야 함
    const isValidIdx = fnBody.indexOf('ObjectId.isValid');
    const block = fnBody.substring(isValidIdx, isValidIdx + 200);
    expect(block).toContain('return');
  });
});

// =============================================================================
// 4. 실제 ObjectId.isValid 동작 검증 (런타임)
// =============================================================================
describe('FIX-4: ObjectId.isValid가 클라이언트 로컬 ID를 올바르게 거부해야 함', () => {
  test('프론트엔드 generateFileId 형식을 거부해야 함', () => {
    // uploadService에서 생성하는 형식: file_${Date.now()}_${crypto.randomUUID().slice(0,8)}
    expect(ObjectId.isValid('file_1711583342000_a1b2c3d4')).toBe(false);
  });

  test('useBatchUpload에서 생성하는 형식을 거부해야 함', () => {
    expect(ObjectId.isValid('file_1711583342000_x9y8z7w6')).toBe(false);
  });

  test('crGroupingUtils에서 생성하는 형식을 거부해야 함', () => {
    expect(ObjectId.isValid('crfile_1711583342000_abc1234')).toBe(false);
  });

  test('유효한 MongoDB ObjectId는 통과해야 함', () => {
    expect(ObjectId.isValid('507f1f77bcf86cd799439011')).toBe(true);
    expect(ObjectId.isValid(new ObjectId().toString())).toBe(true);
  });

  test('빈 문자열, undefined, null을 거부해야 함', () => {
    expect(ObjectId.isValid('')).toBe(false);
    expect(ObjectId.isValid(undefined)).toBe(false);
    expect(ObjectId.isValid(null)).toBe(false);
  });
});
