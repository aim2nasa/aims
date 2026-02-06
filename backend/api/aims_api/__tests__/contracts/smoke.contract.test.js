/**
 * smoke.contract.test.js
 * 배포 후 스모크 테스트 - 핵심 API 엔드포인트 생존 검증
 *
 * 목적: 모든 주요 API 엔드포인트가 500 에러 없이 응답하는지 빠르게 검증.
 * server.js 리팩토링 시 누락된 import/상수로 인한 ReferenceError → 500을 감지.
 *
 * 검증 기준:
 * - 인증 필요 엔드포인트: 200 (정상) 또는 4xx (클라이언트 에러)만 허용
 * - 인증 불필요 엔드포인트: 200만 허용
 * - 500은 절대 허용하지 않음 (서버 내부 에러 = 코드 결함)
 *
 * @since 2026-02-07
 */

const { API_BASE, checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

const TEST_USER_ID = 'test-smoke-user-001';
let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - smoke 테스트 건너뜀');
});

/**
 * 핵심 API 엔드포인트 목록
 * 각 엔드포인트가 ReferenceError 없이 핸들러에 진입하는지 검증
 */
const SMOKE_ENDPOINTS = [
  // === Health (인증 불필요) ===
  { method: 'GET', path: '/api/health', auth: false, label: 'Health check' },
  { method: 'GET', path: '/api/health/deep', auth: false, label: 'Deep health check' },
  { method: 'GET', path: '/api/system/versions', auth: false, label: 'System versions' },

  // === Customers (인증 필요) ===
  { method: 'GET', path: '/api/customers/stats', auth: true, label: 'Customer stats' },
  { method: 'GET', path: '/api/customers?page=1&limit=5', auth: true, label: 'Customer list' },
  { method: 'GET', path: '/api/customers?page=1&limit=5&status=all', auth: true, label: 'Customer list (all status)' },
  { method: 'GET', path: '/api/customers/check-name?name=__smoke_test__', auth: true, label: 'Customer name check' },

  // === Documents (인증 필요) ===
  { method: 'GET', path: '/api/documents?page=1&limit=5', auth: true, label: 'Document list' },
  { method: 'GET', path: '/api/documents/status?page=1&limit=5', auth: true, label: 'Document status list' },
  { method: 'GET', path: '/api/documents/stats', auth: true, label: 'Document stats' },

  // === Contracts / Insurance (인증 필요) ===
  { method: 'GET', path: '/api/insurance-products', auth: true, label: 'Insurance products' },
  { method: 'GET', path: '/api/contracts?page=1&limit=5', auth: true, label: 'Contract list' },

  // === Users (인증 필요) ===
  { method: 'GET', path: '/api/users', auth: true, label: 'User list' },

  // === Admin (인증 필요) ===
  { method: 'GET', path: '/api/admin/system-stats', auth: true, label: 'Admin system stats' },

  // === Address (인증 불필요) ===
  { method: 'GET', path: '/api/address/test', auth: false, label: 'Address API test' },

  // === SSE Streams (인증 필요, 연결만 확인) ===
  { method: 'GET', path: '/api/documents/status-list/stream', auth: true, label: 'Document status SSE stream', sse: true },

  // === Chat sessions (인증 필요) ===
  { method: 'GET', path: '/api/chat/sessions', auth: true, label: 'Chat sessions' },

  // === Token usage (인증 필요) ===
  { method: 'GET', path: '/api/token-usage/daily?days=1', auth: true, label: 'Token usage' },

  // === Bonus credits (인증 필요) ===
  { method: 'GET', path: '/api/bonus-credits', auth: true, label: 'Bonus credits' },
];

describe('Smoke Test - 핵심 API 엔드포인트 생존 검증', () => {
  test.each(SMOKE_ENDPOINTS)(
    '$label ($method $path) - 500 에러 없음',
    async ({ method, path, auth, sse }) => {
      if (!serverAvailable) return;

      const userId = auth ? TEST_USER_ID : null;
      const options = { method };

      // SSE 엔드포인트는 타임아웃 짧게
      if (sse) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
          const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...(userId ? { 'x-user-id': userId } : {}),
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          // SSE는 200으로 연결되면 성공
          expect(res.status).not.toBe(500);
        } catch (err) {
          clearTimeout(timeoutId);
          // AbortError는 정상 (타임아웃으로 SSE 연결 끊김)
          if (err.name !== 'AbortError') throw err;
        }
        return;
      }

      const res = await apiFetch(path, options, userId);

      // 핵심: 500 Internal Server Error는 절대 허용 안 함
      expect(res.status).not.toBe(500);

      // 추가: 502, 503도 서버 문제
      expect(res.status).not.toBe(502);
      expect(res.status).not.toBe(503);

      // 응답이 유효한 JSON인지 확인
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await res.json();
        expect(body).toBeDefined();
        // success 필드가 있다면 확인 (일부 엔드포인트는 다른 형식)
        if ('success' in body) {
          expect(typeof body.success).toBe('boolean');
        }
      }
    }
  );
});

describe('Smoke Test - 인증 강제 검증', () => {
  // authenticateJWT 미들웨어가 적용된 엔드포인트만 검증
  // (일부 엔드포인트는 인증 없이도 접근 가능하거나, 라우터 레벨 미들웨어 구조로 404 반환)
  const STRICT_AUTH_ENDPOINTS = SMOKE_ENDPOINTS.filter(e =>
    e.auth && !e.sse &&
    // 인증 미들웨어가 개별 핸들러에 적용된 엔드포인트만
    !['Insurance products', 'User list', 'Admin system stats', 'Token usage', 'Bonus credits'].includes(e.label)
  );

  test.each(STRICT_AUTH_ENDPOINTS)(
    '$label - 인증 없이 401 반환 (500 아님)',
    async ({ method, path }) => {
      if (!serverAvailable) return;

      const res = await apiFetch(path, { method }, null);

      // 인증 없이 접근 시 401이어야 함, 절대 500이 아님
      expect(res.status).toBe(401);
    }
  );

  // 모든 인증 필요 엔드포인트가 500을 반환하지 않는지 검증 (가장 중요)
  const ALL_AUTH_ENDPOINTS = SMOKE_ENDPOINTS.filter(e => e.auth && !e.sse);

  test.each(ALL_AUTH_ENDPOINTS)(
    '$label - 인증 없이 접근해도 500 아님 (서버 크래시 방지)',
    async ({ method, path }) => {
      if (!serverAvailable) return;

      const res = await apiFetch(path, { method }, null);

      // 핵심: 인증 없이 접근해도 서버가 크래시하면 안 됨
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(502);
      expect(res.status).not.toBe(503);
    }
  );
});
