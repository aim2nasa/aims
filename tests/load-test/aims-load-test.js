/**
 * AIMS Load Test Script (k6)
 *
 * 목적: 동시접속자 수용 능력 측정
 *
 * 실행 방법:
 *   k6 run aims-load-test.js
 *   k6 run --vus 50 --duration 2m aims-load-test.js  (50명, 2분)
 *
 * 설치:
 *   Windows: choco install k6
 *   Mac: brew install k6
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ========================================
// 설정
// ========================================
const BASE_URL = __ENV.BASE_URL || 'https://aims.giize.com';
const TEST_USER_EMAIL = __ENV.TEST_EMAIL || 'test@example.com';
const TEST_USER_PASSWORD = __ENV.TEST_PASSWORD || 'test1234';

// Custom Metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const documentListDuration = new Trend('document_list_duration');
const searchDuration = new Trend('search_duration');

// ========================================
// 테스트 시나리오 설정
// ========================================
export const options = {
  // 단계별 부하 증가 (Ramping VUs)
  stages: [
    { duration: '30s', target: 10 },   // 30초간 10명까지 증가
    { duration: '1m', target: 25 },    // 1분간 25명까지 증가
    { duration: '2m', target: 50 },    // 2분간 50명 유지
    { duration: '1m', target: 100 },   // 1분간 100명까지 증가
    { duration: '2m', target: 100 },   // 2분간 100명 유지 (피크)
    { duration: '30s', target: 0 },    // 30초간 종료
  ],

  // 성능 기준 (Thresholds)
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% 요청이 2초 이내
    http_req_failed: ['rate<0.05'],     // 실패율 5% 미만
    errors: ['rate<0.1'],               // 에러율 10% 미만
  },
};

// ========================================
// 헬퍼 함수
// ========================================
function getHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ========================================
// 메인 테스트 시나리오
// ========================================
export default function () {
  let token = null;

  // 1. 로그인
  const loginStart = Date.now();
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
    { headers: getHeaders() }
  );
  loginDuration.add(Date.now() - loginStart);

  const loginSuccess = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!loginSuccess) {
    errorRate.add(1);
    console.log(`Login failed: ${loginRes.status} - ${loginRes.body}`);
    return;
  }

  try {
    token = JSON.parse(loginRes.body).token;
  } catch {
    errorRate.add(1);
    return;
  }

  sleep(1); // 사용자 생각 시간

  // 2. 문서 목록 조회
  const docListStart = Date.now();
  const docListRes = http.get(
    `${BASE_URL}/api/documents?page=1&limit=20`,
    { headers: getHeaders(token) }
  );
  documentListDuration.add(Date.now() - docListStart);

  check(docListRes, {
    'document list status 200': (r) => r.status === 200,
    'document list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.documents) || Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);

  sleep(2); // 문서 목록 확인

  // 3. 고객 목록 조회
  const customerRes = http.get(
    `${BASE_URL}/api/customers?page=1&limit=20`,
    { headers: getHeaders(token) }
  );

  check(customerRes, {
    'customer list status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // 4. 문서 검색
  const searchStart = Date.now();
  const searchRes = http.get(
    `${BASE_URL}/api/documents/search?q=보험`,
    { headers: getHeaders(token) }
  );
  searchDuration.add(Date.now() - searchStart);

  check(searchRes, {
    'search status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(2);

  // 5. 대시보드 통계 조회
  const statsRes = http.get(
    `${BASE_URL}/api/dashboard/stats`,
    { headers: getHeaders(token) }
  );

  check(statsRes, {
    'stats status 200': (r) => r.status === 200 || r.status === 404,
  }) || errorRate.add(1);

  sleep(1);

  // 6. 랜덤 대기 (실제 사용자 행동 시뮬레이션)
  sleep(Math.random() * 3 + 1);
}

// ========================================
// 테스트 완료 후 요약
// ========================================
export function handleSummary(data) {
  const summary = {
    '테스트 결과': {
      '총 요청 수': data.metrics.http_reqs?.values?.count || 0,
      '평균 응답시간': `${Math.round(data.metrics.http_req_duration?.values?.avg || 0)}ms`,
      '95% 응답시간': `${Math.round(data.metrics.http_req_duration?.values?.['p(95)'] || 0)}ms`,
      '최대 응답시간': `${Math.round(data.metrics.http_req_duration?.values?.max || 0)}ms`,
      '실패율': `${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
      '처리량': `${Math.round(data.metrics.http_reqs?.values?.rate || 0)} req/s`,
    },
    'API별 응답시간': {
      '로그인': `${Math.round(data.metrics.login_duration?.values?.avg || 0)}ms`,
      '문서목록': `${Math.round(data.metrics.document_list_duration?.values?.avg || 0)}ms`,
      '검색': `${Math.round(data.metrics.search_duration?.values?.avg || 0)}ms`,
    },
  };

  console.log('\n========================================');
  console.log('AIMS Load Test 결과 요약');
  console.log('========================================');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'summary.json': JSON.stringify(data, null, 2),
  };
}
