/**
 * Regression Tests — 2026-03-15 버그 수정
 *
 * 수정된 버그 4건:
 * 1. credit_pending 재처리 트리거 누락 (storage-routes.js)
 * 2. webhook API 키 인증 불일치 (customers-routes.js, auth.js)
 * 3. virusScanService import 누락 (customers-routes.js)
 * 4. scanAfterUpload ObjectId 변환 누락 (virusScanService.js)
 *
 * @since 2026-03-15
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// 헬퍼: 소스 코드 읽기
// =============================================================================
function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// 1. credit_pending 재처리 트리거 (storage-routes.js)
// =============================================================================
describe('BUG-1: tier 변경 시 credit_pending 재처리 트리거', () => {
  const source = readSource('routes/storage-routes.js');

  test('processCreditPendingDocuments가 creditService에서 import되어야 함', () => {
    expect(source).toMatch(/processCreditPendingDocuments.*require\('\.\.\/lib\/creditService'\)/s);
  });

  test('사용자 tier 변경 후 processCreditPendingDocuments 호출이 있어야 함', () => {
    const updateUserTierIdx = source.indexOf('updateUserTier(db, id, tier)');
    const processIdx = source.indexOf('processCreditPendingDocuments(db, id)', updateUserTierIdx);
    expect(updateUserTierIdx).toBeGreaterThan(-1);
    expect(processIdx).toBeGreaterThan(updateUserTierIdx);
  });

  test('tier 변경의 processCreditPendingDocuments는 별도 try-catch로 격리되어야 함', () => {
    // updateUserTier 이후 ~ SSE 알림 사이에 catch (creditErr)가 있어야 함
    const updateIdx = source.indexOf('updateUserTier(db, id, tier)');
    const sseIdx = source.indexOf('notifyUserAccountSubscribers', updateIdx);
    const block = source.substring(updateIdx, sseIdx);
    expect(block).toContain('catch (creditErr)');
  });

  test('tier 정의 변경 시 해당 tier 사용자 전체에 대해 재처리해야 함', () => {
    const tierDefIdx = source.indexOf('updateTierDefinition(db, tierId, updates)');
    const resJsonIdx = source.indexOf('res.json(', tierDefIdx);
    const block = source.substring(tierDefIdx, resJsonIdx);

    // credit_quota 변경 시에만 실행
    expect(block).toContain('credit_quota !== undefined');
    // 해당 tier 사용자 조회
    expect(block).toMatch(/'storage\.tier':\s*tierId/);
    // 개별 사용자 에러 격리
    expect(block).toContain('catch (userErr)');
    // 전체 블록 에러 격리
    expect(block).toContain('catch (creditErr)');
  });

  test('응답에 credit_pending_reprocessed 필드가 포함되어야 함', () => {
    expect(source).toContain('credit_pending_reprocessed');
    expect(source).toContain('credit_pending_remaining');
  });
});

// =============================================================================
// 2. webhook API 키 인증 (customers-routes.js, auth.js)
// =============================================================================
describe('BUG-2: webhook API 키 — INTERNAL_WEBHOOK_API_KEY 지원', () => {
  const customersSource = readSource('routes/customers-routes.js');
  const authSource = readSource('middleware/auth.js');

  test('customers-routes: webhook 인증에서 INTERNAL_WEBHOOK_API_KEY를 체크해야 함', () => {
    // document-processing-complete webhook에서 INTERNAL_WEBHOOK_API_KEY 허용
    expect(customersSource).toContain('INTERNAL_WEBHOOK_API_KEY');
  });

  test('customers-routes: N8N_API_KEY도 fallback으로 허용해야 함', () => {
    expect(customersSource).toContain('N8N_API_KEY');
  });

  test('auth.js: INTERNAL_WEBHOOK_API_KEY를 체크해야 함', () => {
    expect(authSource).toContain('INTERNAL_WEBHOOK_API_KEY');
  });

  test('auth.js: N8N_WEBHOOK_API_KEY도 fallback으로 허용해야 함', () => {
    expect(authSource).toContain('N8N_WEBHOOK_API_KEY');
  });
});

// =============================================================================
// 3. virusScanService import (customers-routes.js)
// =============================================================================
describe('BUG-3: virusScanService import 누락', () => {
  const source = readSource('routes/customers-routes.js');

  test('virusScanService가 require로 import되어야 함', () => {
    expect(source).toMatch(/const\s+virusScanService\s*=\s*require\(['"]\.\.\/lib\/virusScanService['"]\)/);
  });

  test('scanAfterUpload 호출이 존재해야 함', () => {
    expect(source).toContain('virusScanService.scanAfterUpload');
  });
});

// =============================================================================
// 4. scanAfterUpload ObjectId 변환 (virusScanService.js)
// =============================================================================
describe('BUG-4: scanAfterUpload ObjectId 변환 누락', () => {
  const source = readSource('lib/virusScanService.js');

  test('mongodb ObjectId가 import되어야 함', () => {
    expect(source).toMatch(/const\s*\{\s*ObjectId\s*\}\s*=\s*require\(['"]mongodb['"]\)/);
  });

  test('scanAfterUpload에서 문자열 documentId를 ObjectId로 변환해야 함', () => {
    // scanAfterUpload 함수 내에서 typeof documentId === 'string' 체크
    const fnStart = source.indexOf('async function scanAfterUpload');
    const fnBody = source.substring(fnStart, fnStart + 500);
    expect(fnBody).toContain("typeof documentId === 'string'");
    expect(fnBody).toContain('new ObjectId(documentId)');
  });

  test('findOne에서 변환된 docId를 사용해야 함 (원본 documentId가 아닌)', () => {
    const fnStart = source.indexOf('async function scanAfterUpload');
    const fnBody = source.substring(fnStart, fnStart + 500);
    expect(fnBody).toMatch(/findOne\(\{\s*_id:\s*docId\s*\}/);
  });

  test('updateOne에서도 변환된 docId를 사용해야 함', () => {
    const fnStart = source.indexOf('async function scanAfterUpload');
    const fnEnd = source.indexOf('module.exports');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toMatch(/updateOne\(\s*\{\s*_id:\s*docId\s*\}/);
  });
});

// =============================================================================
// 5. deploy 스크립트 — Docker 환경변수 전달
// =============================================================================
describe('BUG-2 보완: deploy 스크립트 환경변수 전달', () => {
  const deploySource = readSource('deploy_aims_api.sh');

  test('N8N_WEBHOOK_API_KEY가 Docker에 전달되어야 함', () => {
    expect(deploySource).toContain('N8N_WEBHOOK_API_KEY');
  });

  test('INTERNAL_WEBHOOK_API_KEY가 Docker에 전달되어야 함', () => {
    expect(deploySource).toContain('INTERNAL_WEBHOOK_API_KEY');
  });
});
