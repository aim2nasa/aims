/**
 * AIMS API 스트레스 테스트 (k6)
 * @since 2026-01-10
 *
 * 시스템 한계점을 찾기 위한 스트레스 테스트
 *
 * 실행 방법:
 *   k6 run tests/performance/stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // 50 VU로 증가
    { duration: '5m', target: 50 },   // 50 VU 유지
    { duration: '2m', target: 100 },  // 100 VU로 증가
    { duration: '5m', target: 100 },  // 100 VU 유지
    { duration: '2m', target: 200 },  // 200 VU로 증가 (스트레스)
    { duration: '5m', target: 200 },  // 200 VU 유지
    { duration: '2m', target: 0 },    // 쿨다운
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'], // 99%가 2초 이내
    http_req_failed: ['rate<0.1'],     // 실패율 10% 미만
  },
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3010';
const testUserId = '507f1f77bcf86cd799439011';

export default function () {
  // 무작위 엔드포인트 선택
  const endpoints = [
    { path: '/api/health', method: 'GET' },
    { path: '/api/customers', method: 'GET' },
    { path: '/api/documents', method: 'GET' },
    { path: '/api/contracts', method: 'GET' },
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

  const res = http.request(endpoint.method, `${BASE_URL}${endpoint.path}`, null, {
    headers: { 'X-User-Id': testUserId },
    timeout: '10s',
  });

  const success = check(res, {
    'status is 2xx or 4xx': (r) => r.status >= 200 && r.status < 500,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success);
  sleep(Math.random() * 0.5);
}
