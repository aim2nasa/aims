/**
 * AIMS 동시접속자 수용량 테스트
 *
 * 목적: 동시접속 설계사 수를 점진적으로 늘리며 시스템 성능 측정
 *
 * 사전 준비:
 *   1. 테스트용 JWT 토큰 발급 (브라우저 개발자도구에서 복사)
 *   2. 환경변수로 전달: k6 run --env TOKEN=eyJ... aims-capacity-test.js
 *
 * 실행 방법:
 *   # 기본 실행 (10 -> 50 -> 100명)
 *   k6 run --env TOKEN=your_jwt_token aims-capacity-test.js
 *
 *   # 사용자 수 조절
 *   k6 run --env TOKEN=xxx --env MAX_VUS=200 aims-capacity-test.js
 *
 *   # 결과를 CSV로 저장 (그래프용)
 *   k6 run --env TOKEN=xxx --out csv=results.csv aims-capacity-test.js
 *
 * 설치:
 *   Windows: winget install Grafana.k6
 *   Mac: brew install k6
 *   Linux: sudo apt install k6
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// ========================================
// 설정
// ========================================
const BASE_URL = __ENV.BASE_URL || 'https://aims.giize.com';
const TOKEN = __ENV.TOKEN || '';
const MAX_VUS = parseInt(__ENV.MAX_VUS) || 100;

if (!TOKEN) {
  console.error('❌ TOKEN 환경변수가 필요합니다!');
  console.error('   브라우저 개발자도구 > Application > Local Storage에서');
  console.error('   auth-storage-v2 의 token 값을 복사하세요.');
  console.error('');
  console.error('   실행: k6 run --env TOKEN=eyJ... aims-capacity-test.js');
}

// Custom Metrics
const errorRate = new Rate('error_rate');
const currentVUs = new Gauge('current_vus');

// API별 응답시간
const apiMetrics = {
  health: new Trend('api_health', true),
  documents: new Trend('api_documents', true),
  documentDetail: new Trend('api_document_detail', true),
  customers: new Trend('api_customers', true),
  customerDetail: new Trend('api_customer_detail', true),
  search: new Trend('api_search', true),
  dashboard: new Trend('api_dashboard', true),
};

// ========================================
// 테스트 시나리오: 점진적 증가
// ========================================
export const options = {
  stages: [
    // 단계별 증가 (10명씩)
    { duration: '30s', target: 10 },    // 10명
    { duration: '1m', target: 10 },     // 10명 유지 (측정)
    { duration: '30s', target: 20 },    // 20명
    { duration: '1m', target: 20 },     // 20명 유지
    { duration: '30s', target: 30 },    // 30명
    { duration: '1m', target: 30 },     // 30명 유지
    { duration: '30s', target: 50 },    // 50명
    { duration: '1m', target: 50 },     // 50명 유지
    { duration: '30s', target: 75 },    // 75명
    { duration: '1m', target: 75 },     // 75명 유지
    { duration: '30s', target: MAX_VUS }, // 최대
    { duration: '2m', target: MAX_VUS },  // 최대 유지
    { duration: '30s', target: 0 },     // 종료
  ],

  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95%가 5초 이내
    http_req_failed: ['rate<0.1'],      // 실패율 10% 미만
    error_rate: ['rate<0.15'],          // 에러율 15% 미만
  },

  // 출력 설정
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ========================================
// 헬퍼 함수
// ========================================
function headers() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
  };
}

function measure(name, fn) {
  const start = Date.now();
  const res = fn();
  const duration = Date.now() - start;

  if (apiMetrics[name]) {
    apiMetrics[name].add(duration);
  }

  return res;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ========================================
// 메인 테스트 시나리오
// ========================================
export default function () {
  currentVUs.add(__VU);

  if (!TOKEN) {
    sleep(1);
    return;
  }

  // 1. 헬스체크 (가장 가벼운 요청)
  group('Health Check', () => {
    const res = measure('health', () =>
      http.get(`${BASE_URL}/api/health`)
    );
    check(res, { 'health OK': (r) => r.status === 200 }) || errorRate.add(1);
  });

  sleep(0.5);

  // 2. 문서 목록 조회 (핵심 기능)
  group('Document List', () => {
    const page = randomInt(1, 3);
    const res = measure('documents', () =>
      http.get(`${BASE_URL}/api/documents?page=${page}&limit=20`, {
        headers: headers(),
      })
    );

    const success = check(res, {
      'documents OK': (r) => r.status === 200,
      'documents has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.documents || body.data;
        } catch (e) { return false; }
      },
    });
    if (!success) errorRate.add(1);

    // 문서 상세 조회 (50% 확률)
    if (success && Math.random() > 0.5) {
      try {
        const docs = JSON.parse(res.body);
        const list = docs.documents || docs.data || [];
        if (list.length > 0) {
          const doc = list[randomInt(0, list.length - 1)];
          const docId = doc._id || doc.id;

          sleep(randomInt(1, 2));

          measure('documentDetail', () =>
            http.get(`${BASE_URL}/api/documents/${docId}`, {
              headers: headers(),
            })
          );
        }
      } catch (e) { /* ignore */ }
    }
  });

  sleep(randomInt(1, 3));

  // 3. 고객 목록 조회
  group('Customer List', () => {
    const res = measure('customers', () =>
      http.get(`${BASE_URL}/api/customers?page=1&limit=20`, {
        headers: headers(),
      })
    );

    const success = check(res, {
      'customers OK': (r) => r.status === 200,
    });
    if (!success) errorRate.add(1);

    // 고객 상세 조회 (30% 확률)
    if (success && Math.random() > 0.7) {
      try {
        const data = JSON.parse(res.body);
        const customers = data.customers || data.data || [];
        if (customers.length > 0) {
          const customer = customers[randomInt(0, customers.length - 1)];
          const customerId = customer._id || customer.id;

          sleep(1);

          measure('customerDetail', () =>
            http.get(`${BASE_URL}/api/customers/${customerId}`, {
              headers: headers(),
            })
          );
        }
      } catch (e) { /* ignore */ }
    }
  });

  sleep(randomInt(1, 2));

  // 4. 검색 (20% 확률)
  if (Math.random() > 0.8) {
    group('Search', () => {
      const keywords = ['보험', '계약', '청구', '삼성', 'DB', '암', '자동차'];
      const keyword = keywords[randomInt(0, keywords.length - 1)];

      const res = measure('search', () =>
        http.get(`${BASE_URL}/api/documents?search=${encodeURIComponent(keyword)}&limit=20`, {
          headers: headers(),
        })
      );

      check(res, { 'search OK': (r) => r.status === 200 || r.status === 404 }) || errorRate.add(1);
    });
  }

  // 5. 사용자 생각 시간
  sleep(randomInt(2, 5));
}

// ========================================
// 결과 요약 및 그래프 데이터 생성
// ========================================
// 안전한 값 접근 헬퍼
function safeGet(obj, path, defaultVal) {
  var keys = path.split('.');
  var current = obj;
  for (var i = 0; i < keys.length; i++) {
    if (current === null || current === undefined) return defaultVal;
    current = current[keys[i]];
  }
  return current !== null && current !== undefined ? current : defaultVal;
}

export function handleSummary(data) {
  const m = data.metrics;

  // 단계별 성능 추출 (그래프용)
  const performanceData = {
    timestamp: new Date().toISOString(),
    maxVUs: MAX_VUS,
    results: {
      totalRequests: safeGet(m, 'http_reqs.values.count', 0),
      throughput: safeGet(m, 'http_reqs.values.rate', 0).toFixed(2),
      avgResponseTime: Math.round(safeGet(m, 'http_req_duration.values.avg', 0)),
      p95ResponseTime: Math.round(safeGet(m, 'http_req_duration.values.p(95)', 0)),
      p99ResponseTime: Math.round(safeGet(m, 'http_req_duration.values.p(99)', 0)),
      maxResponseTime: Math.round(safeGet(m, 'http_req_duration.values.max', 0)),
      errorRate: (safeGet(m, 'http_req_failed.values.rate', 0) * 100).toFixed(2),
    },
    apiPerformance: {
      health: Math.round(safeGet(m, 'api_health.values.avg', 0)),
      documents: Math.round(safeGet(m, 'api_documents.values.avg', 0)),
      documentDetail: Math.round(safeGet(m, 'api_document_detail.values.avg', 0)),
      customers: Math.round(safeGet(m, 'api_customers.values.avg', 0)),
      customerDetail: Math.round(safeGet(m, 'api_customer_detail.values.avg', 0)),
      search: Math.round(safeGet(m, 'api_search.values.avg', 0)),
    },
  };

  // 용량 추정
  const p95 = safeGet(m, 'http_req_duration.values.p(95)', 0);
  const errRate = safeGet(m, 'http_req_failed.values.rate', 0) * 100;

  let capacityEstimate = '';
  if (p95 < 1000 && errRate < 1) {
    capacityEstimate = `✅ 우수: ${MAX_VUS}명 이상 처리 가능`;
  } else if (p95 < 2000 && errRate < 5) {
    capacityEstimate = `✅ 양호: 약 ${MAX_VUS}명 처리 가능`;
  } else if (p95 < 3000 && errRate < 10) {
    capacityEstimate = `⚠️ 주의: 약 ${Math.round(MAX_VUS * 0.7)}명 권장`;
  } else {
    capacityEstimate = `❌ 성능 저하: 약 ${Math.round(MAX_VUS * 0.5)}명 이하 권장`;
  }

  // 콘솔 출력
  console.log('\n' + '='.repeat(60));
  console.log('📊 AIMS 동시접속 수용량 테스트 결과');
  console.log('='.repeat(60));
  console.log(`\n🎯 테스트 최대 동시접속자: ${MAX_VUS}명`);
  console.log(`\n📈 전체 성능:`);
  console.log(`   총 요청 수: ${performanceData.results.totalRequests}`);
  console.log(`   처리량: ${performanceData.results.throughput} req/s`);
  console.log(`   평균 응답시간: ${performanceData.results.avgResponseTime}ms`);
  console.log(`   95% 응답시간: ${performanceData.results.p95ResponseTime}ms`);
  console.log(`   99% 응답시간: ${performanceData.results.p99ResponseTime}ms`);
  console.log(`   최대 응답시간: ${performanceData.results.maxResponseTime}ms`);
  console.log(`   에러율: ${performanceData.results.errorRate}%`);
  console.log(`\n🔌 API별 평균 응답시간:`);
  console.log(`   /api/health: ${performanceData.apiPerformance.health}ms`);
  console.log(`   /api/documents: ${performanceData.apiPerformance.documents}ms`);
  console.log(`   /api/documents/:id: ${performanceData.apiPerformance.documentDetail}ms`);
  console.log(`   /api/customers: ${performanceData.apiPerformance.customers}ms`);
  console.log(`   /api/customers/:id: ${performanceData.apiPerformance.customerDetail}ms`);
  console.log(`   /api/search: ${performanceData.apiPerformance.search}ms`);
  console.log(`\n💡 용량 추정: ${capacityEstimate}`);
  console.log('='.repeat(60));

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-result.json': JSON.stringify(performanceData, null, 2),
  };
}

// k6 내장 텍스트 요약
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
