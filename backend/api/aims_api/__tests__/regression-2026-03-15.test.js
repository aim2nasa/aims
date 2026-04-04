/**
 * Regression Tests — 2026-03-15 버그 수정
 *
 * 수정된 버그 6건:
 * 1. credit_pending 재처리 트리거 누락 (storage-routes.js)
 * 2. webhook API 키 인증 불일치 (notification-routes.js, auth.js)
 * 3. virusScanService import 누락 (notification-routes.js)
 * 4. scanAfterUpload ObjectId 변환 누락 (virusScanService.js)
 * 5. AR/CR 라우트 인증 미들웨어 누락 (annual-report-routes.js)
 * 7. ocr_usage_log file_id unique 인덱스 → 재처리 시 중복 에러 (ocrUsageLogService.js)
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

  test('creditPolicy.processPendingDocuments가 사용되어야 함', () => {
    expect(source).toContain('creditPolicy.processPendingDocuments');
  });

  test('사용자 tier 변경 후 creditPolicy.processPendingDocuments 호출이 있어야 함', () => {
    const updateUserTierIdx = source.indexOf('updateUserTier(db, id, tier)');
    const processIdx = source.indexOf('creditPolicy.processPendingDocuments(id)', updateUserTierIdx);
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
// 2. webhook API 키 인증 (notification-routes.js, auth.js)
// =============================================================================
describe('BUG-2: webhook API 키 — INTERNAL_WEBHOOK_API_KEY 지원', () => {
  const customersSource = readSource('routes/notification-routes.js');
  const authSource = readSource('middleware/auth.js');

  test('notification-routes: webhook 인증에서 INTERNAL_WEBHOOK_API_KEY를 체크해야 함', () => {
    // document-processing-complete webhook에서 INTERNAL_WEBHOOK_API_KEY 허용
    expect(customersSource).toContain('INTERNAL_WEBHOOK_API_KEY');
  });

  test('notification-routes: N8N_API_KEY도 fallback으로 허용해야 함', () => {
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
// 3. virusScanService import (notification-routes.js)
// =============================================================================
describe('BUG-3: virusScanService import 누락', () => {
  const source = readSource('routes/notification-routes.js');

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
    const fnBody = source.substring(fnStart, fnStart + 700);
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
// 5. AR/CR 라우트 인증 미들웨어 (annual-report-routes.js)
// =============================================================================
describe('BUG-5: AR/CR 라우트 인증 미들웨어 누락', () => {
  const source = readSource('routes/annual-report-routes.js');

  test('GET /annual-report/status/:file_id에 authenticateJWT가 적용되어야 함', () => {
    const routeMatch = source.match(
      /router\.get\(\s*['"]\/annual-report\/status\/:file_id['"]\s*,\s*(authenticate\w+)/
    );
    expect(routeMatch).not.toBeNull();
    expect(routeMatch[1]).toMatch(/^authenticate(JWT|JWTorAPIKey|JWTWithQuery)$/);
  });

  test('POST /annual-report/parse에 authenticateJWT가 적용되어야 함', () => {
    const routeMatch = source.match(
      /router\.post\(\s*['"]\/annual-report\/parse['"]\s*,\s*(authenticate\w+)/
    );
    expect(routeMatch).not.toBeNull();
    expect(routeMatch[1]).toMatch(/^authenticate(JWT|JWTorAPIKey)$/);
  });

  test('POST /annual-report/parse-file에 authenticateJWT가 적용되어야 함', () => {
    const routeMatch = source.match(
      /router\.post\(\s*['"]\/annual-report\/parse-file['"]\s*,\s*(authenticate\w+)/
    );
    expect(routeMatch).not.toBeNull();
    expect(routeMatch[1]).toMatch(/^authenticate(JWT|JWTorAPIKey)$/);
  });

  test('POST /annual-report/check에 authenticateJWT가 적용되어야 함', () => {
    const routeMatch = source.match(
      /router\.post\(\s*['"]\/annual-report\/check['"]\s*,\s*(authenticate\w+)/
    );
    expect(routeMatch).not.toBeNull();
    expect(routeMatch[1]).toMatch(/^authenticate(JWT|JWTorAPIKey)$/);
  });

  test('POST /customer-review/check에 authenticateJWT가 적용되어야 함', () => {
    const routeMatch = source.match(
      /router\.post\(\s*['"]\/customer-review\/check['"]\s*,\s*(authenticate\w+)/
    );
    expect(routeMatch).not.toBeNull();
    expect(routeMatch[1]).toMatch(/^authenticate(JWT|JWTorAPIKey)$/);
  });

  test('req.user.id를 참조하는 모든 라우트에 인증 미들웨어가 있어야 함', () => {
    const lines = source.split('\n');
    const unauthRoutes = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/router\.(get|post|put|delete|patch)\(/) &&
          !line.match(/authenticate/) &&
          line.match(/async\s*\(req/)) {
        const block = lines.slice(i, i + 20).join('\n');
        if (block.includes('req.user.')) {
          unauthRoutes.push(`Line ${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(unauthRoutes).toEqual([]);
  });
});

// =============================================================================
// 6. deploy 스크립트 — Docker 환경변수 전달 (BUG-2 보완)
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

// =============================================================================
// 7. ocr_usage_log file_id unique 인덱스 제거 (ocrUsageLogService.js)
// =============================================================================
describe('BUG-7: ocr_usage_log file_id에 unique 인덱스가 없어야 함', () => {
  const source = readSource('lib/ocrUsageLogService.js');

  test('file_id 인덱스에 unique: true가 없어야 함', () => {
    const fileIdIndexLines = source.split('\n').filter(l =>
      l.includes('file_id') && l.includes('createIndex')
    );
    expect(fileIdIndexLines.length).toBeGreaterThan(0);
    for (const line of fileIdIndexLines) {
      expect(line).not.toContain('unique');
    }
  });

  test('ensureIndexes에서 기존 unique 인덱스를 drop하는 마이그레이션 로직이 있어야 함', () => {
    expect(source).toContain('dropIndex');
    expect(source).toContain('file_id_1');
  });

  test('마이그레이션 catch에서 IndexNotFound만 무시하고 나머지는 throw해야 함', () => {
    expect(source).toContain('IndexNotFound');
    expect(source).not.toMatch(/catch\s*\(e\)\s*\{\s*\}/);
  });

  test('동일 file_id로 여러 번 로그 기록이 가능해야 함 (재처리 시나리오)', () => {
    const logFn = source.substring(
      source.indexOf('async function logOcrUsage'),
      source.indexOf('async function getOcrUsageStats')
    );
    expect(logFn).toContain('insertOne');
    expect(logFn).not.toContain('updateOne');
  });

  test('ocr-usage-routes에서 서버 기동 시 ensureIndexes를 호출해야 함', () => {
    const routesSource = readSource('routes/ocr-usage-routes.js');
    expect(routesSource).toContain('ocrUsageLogService.ensureIndexes');
  });

  test('migrateOcrUsageLog.js에서도 file_id unique 인덱스가 제거되어야 함', () => {
    const migrateSource = readSource('scripts/migrateOcrUsageLog.js');
    const fileIdLines = migrateSource.split('\n').filter(l =>
      l.includes('file_id') && l.includes('createIndex')
    );
    expect(fileIdLines.length).toBeGreaterThan(0);
    for (const line of fileIdLines) {
      expect(line).not.toContain('unique');
    }
  });
});
