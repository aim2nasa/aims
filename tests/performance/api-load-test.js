/**
 * AIMS API 부하 테스트 (k6)
 * @since 2026-01-10
 *
 * 실행 방법:
 *   k6 run tests/performance/api-load-test.js
 *
 * 환경 변수:
 *   K6_BASE_URL: API 기본 URL (기본값: http://localhost:3010)
 *   K6_VUS: 가상 사용자 수 (기본값: 10)
 *   K6_DURATION: 테스트 지속 시간 (기본값: 30s)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

// 테스트 설정
export const options = {
  stages: [
    { duration: '10s', target: 5 },   // 웜업: 5 VU로 증가
    { duration: '30s', target: 10 },  // 부하: 10 VU 유지
    { duration: '20s', target: 20 },  // 스파이크: 20 VU로 증가
    { duration: '10s', target: 0 },   // 쿨다운: 0으로 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% 요청이 500ms 이내
    http_req_failed: ['rate<0.01'],    // 실패율 1% 미만
    errors: ['rate<0.05'],             // 에러율 5% 미만
  },
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3010';

// 테스트 데이터
const testUserId = '507f1f77bcf86cd799439011';

export default function () {
  // 1. Health Check
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    const success = check(res, {
      'health status 200': (r) => r.status === 200,
      'health response ok': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'ok';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.5);

  // 2. 고객 목록 조회
  group('Get Customers', () => {
    const res = http.get(`${BASE_URL}/api/customers`, {
      headers: { 'X-User-Id': testUserId },
    });
    const success = check(res, {
      'customers status 200': (r) => r.status === 200,
      'customers is array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body) || Array.isArray(body.customers);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.5);

  // 3. 문서 목록 조회
  group('Get Documents', () => {
    const res = http.get(`${BASE_URL}/api/documents`, {
      headers: { 'X-User-Id': testUserId },
    });
    const success = check(res, {
      'documents status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.5);

  // 4. 계약 목록 조회
  group('Get Contracts', () => {
    const res = http.get(`${BASE_URL}/api/contracts`, {
      headers: { 'X-User-Id': testUserId },
    });
    const success = check(res, {
      'contracts status 200 or 401': (r) => r.status === 200 || r.status === 401,
    });
    errorRate.add(!success && res.status !== 401);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.5);

  // 5. 검색 API
  group('Search Documents', () => {
    const res = http.get(`${BASE_URL}/api/documents/search?q=보험`, {
      headers: { 'X-User-Id': testUserId },
    });
    const success = check(res, {
      'search status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
  });

  sleep(1);
}

// 테스트 종료 시 요약 리포트
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      requests_total: data.metrics.http_reqs?.values?.count || 0,
      requests_failed: data.metrics.http_req_failed?.values?.rate || 0,
      duration_avg: data.metrics.http_req_duration?.values?.avg || 0,
      duration_p95: data.metrics.http_req_duration?.values['p(95)'] || 0,
      duration_max: data.metrics.http_req_duration?.values?.max || 0,
      error_rate: data.metrics.errors?.values?.rate || 0,
    },
    thresholds: {
      passed: Object.values(data.thresholds || {}).every(t => !t.ok === false),
    },
  };

  return {
    'tests/performance/results/summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// 텍스트 요약 헬퍼
function textSummary(data, opts) {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║             AIMS API Performance Test Results                 ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║  Total Requests: ${String(data.metrics.http_reqs?.values?.count || 0).padStart(8)}                               ║`,
    `║  Failed Rate:    ${String((data.metrics.http_req_failed?.values?.rate * 100 || 0).toFixed(2) + '%').padStart(8)}                               ║`,
    `║  Avg Duration:   ${String((data.metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(8)}                               ║`,
    `║  P95 Duration:   ${String((data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(8)}                               ║`,
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];
  return lines.join('\n');
}
