/**
 * captureSnapshots.js
 * Golden Master 스냅샷 캡처 스크립트 (리팩토링 전 1회 실행)
 *
 * 현재 API의 모든 엔드포인트 동작을 캡처하여 JSON으로 저장.
 * 리팩토링 후 verifyGoldenMaster.test.js로 동일성 검증.
 *
 * 캡처 항목:
 * - HTTP 상태 코드
 * - Content-Type
 * - 응답 JSON shape (키 + 타입, 값은 제외)
 * - success 필드 존재 여부 및 값
 *
 * 사용법: node __tests__/golden-master/captureSnapshots.js
 *
 * @since 2026-02-07
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://100.110.215.65:3010';
const TEST_USER_ID = 'test-golden-master-user';

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

/**
 * JSON 값의 shape 추출 (키+타입만, 값 제외)
 */
function extractShape(value, depth = 0) {
  if (depth > 5) return typeof value;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return [extractShape(value[0], depth + 1)];
  }
  if (typeof value === 'object') {
    const shape = {};
    for (const key of Object.keys(value).sort()) {
      shape[key] = extractShape(value[key], depth + 1);
    }
    return shape;
  }
  return typeof value;
}

/**
 * 단일 엔드포인트 캡처
 */
async function captureEndpoint(method, url, { body, auth = 'test', name } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth === 'test') {
    headers['x-user-id'] = TEST_USER_ID;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_BASE}${url}`, options);
    const contentType = response.headers.get('content-type') || '';
    let responseBody = null;
    let responseShape = null;

    if (contentType.includes('application/json')) {
      responseBody = await response.json();
      responseShape = extractShape(responseBody);
    } else if (contentType.includes('text/event-stream')) {
      responseShape = 'SSE_STREAM';
    } else {
      responseShape = 'non-json';
    }

    return {
      endpoint: `${method} ${url}`,
      name: name || `${method} ${url}`,
      status: response.status,
      contentType: contentType.split(';')[0].trim(),
      shape: responseShape,
      hasSuccessField: responseBody?.success !== undefined,
      successValue: responseBody?.success,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      endpoint: `${method} ${url}`,
      name: name || `${method} ${url}`,
      error: error.message,
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * 도메인별 엔드포인트 정의
 */
const ENDPOINT_GROUPS = {
  health: [
    { method: 'GET', url: '/api/health', auth: 'none' },
    { method: 'GET', url: '/api/health/deep', auth: 'none' },
    { method: 'GET', url: '/api/system/versions', auth: 'none' },
  ],
  documents: [
    { method: 'GET', url: '/api/documents?page=1&limit=5' },
    { method: 'GET', url: '/api/documents?page=1&limit=5&search=test' },
    { method: 'GET', url: '/api/documents/stats' },
    { method: 'GET', url: '/api/documents/status?page=1&limit=5' },
    { method: 'POST', url: '/api/documents/check-hash', body: { hash: 'nonexistent-test-hash-000' } },
    // 에러 경로
    { method: 'GET', url: '/api/documents?page=1&limit=-1', name: 'docs-negative-limit' },
    { method: 'GET', url: '/api/documents?page=1&limit=9999', name: 'docs-limit-too-high' },
    { method: 'GET', url: '/api/documents', auth: 'none', name: 'docs-no-auth' },
  ],
  customers: [
    { method: 'GET', url: '/api/customers?page=1&limit=5' },
    { method: 'GET', url: '/api/customers?page=1&limit=5&status=active' },
    { method: 'GET', url: '/api/customers?page=1&limit=5&status=inactive' },
    { method: 'GET', url: '/api/customers?page=1&limit=5&status=all' },
    { method: 'GET', url: '/api/customers?page=1&limit=5&search=test' },
    { method: 'GET', url: '/api/customers/stats' },
    { method: 'GET', url: '/api/customers/check-name?name=absolutely-nonexistent-name-xyz' },
    { method: 'GET', url: '/api/customers/000000000000000000000000', name: 'cust-nonexistent' },
    // 에러 경로
    { method: 'GET', url: '/api/customers', auth: 'none', name: 'custs-no-auth' },
    { method: 'POST', url: '/api/customers', body: {}, name: 'create-cust-empty-body' },
  ],
  contracts: [
    { method: 'GET', url: '/api/contracts?page=1&limit=5' },
    { method: 'GET', url: '/api/contracts/000000000000000000000000', name: 'contract-nonexistent' },
  ],
  insurance: [
    { method: 'GET', url: '/api/insurance-products' },
    { method: 'GET', url: '/api/insurance-products/statistics' },
  ],
  chat: [
    { method: 'GET', url: '/api/chat/tools' },
    { method: 'GET', url: '/api/chat/sessions' },
    { method: 'GET', url: '/api/chat/stats' },
  ],
  users: [
    { method: 'GET', url: '/api/users', auth: 'none' },
  ],
  'annual-reports': [
    { method: 'GET', url: '/api/annual-reports/all' },
  ],
  address: [
    { method: 'GET', url: '/api/address/test', auth: 'none' },
  ],
  webhooks: [
    // Webhook 엔드포인트는 POST + 빈 body로 shape만 확인
    { method: 'POST', url: '/api/webhooks/ar-status-change', body: {}, auth: 'none', name: 'ar-webhook-empty' },
    { method: 'POST', url: '/api/webhooks/cr-status-change', body: {}, auth: 'none', name: 'cr-webhook-empty' },
  ],
};

async function main() {
  console.log(`=== Golden Master Snapshot Capture ===`);
  console.log(`API: ${API_BASE}`);
  console.log(`User: ${TEST_USER_ID}`);
  console.log('');

  // 서버 가용성 확인
  try {
    const health = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error(`Status: ${health.status}`);
    console.log('[OK] API 서버 응답 정상\n');
  } catch (error) {
    console.error(`[FAIL] API 서버 연결 불가: ${error.message}`);
    console.error('서버가 실행 중인지 확인하세요.');
    process.exit(1);
  }

  // 스냅샷 디렉토리 생성
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }

  const allResults = {};
  let totalEndpoints = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const [group, endpoints] of Object.entries(ENDPOINT_GROUPS)) {
    console.log(`--- ${group} (${endpoints.length} endpoints) ---`);

    const results = [];
    for (const ep of endpoints) {
      const result = await captureEndpoint(ep.method, ep.url, {
        body: ep.body,
        auth: ep.auth,
        name: ep.name,
      });

      results.push(result);
      totalEndpoints++;

      if (result.error) {
        console.log(`  [!] ${result.endpoint} => ERROR: ${result.error}`);
        errorCount++;
      } else {
        const icon = result.status < 400 ? '+' : '-';
        console.log(`  [${icon}] ${result.endpoint} => ${result.status}`);
        successCount++;
      }
    }

    // 그룹별 스냅샷 저장
    const groupPath = path.join(SNAPSHOT_DIR, `${group}.json`);
    fs.writeFileSync(groupPath, JSON.stringify(results, null, 2), 'utf-8');
    allResults[group] = results;
  }

  // 전체 스냅샷 저장
  const allPath = path.join(SNAPSHOT_DIR, '_all.json');
  fs.writeFileSync(allPath, JSON.stringify(allResults, null, 2), 'utf-8');

  console.log('\n=== Capture Complete ===');
  console.log(`Total: ${totalEndpoints} endpoints`);
  console.log(`Success: ${successCount}, Error: ${errorCount}`);
  console.log(`Saved to: ${SNAPSHOT_DIR}`);
}

main().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
