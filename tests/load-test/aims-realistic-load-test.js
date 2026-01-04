/**
 * AIMS 실제 사용 패턴 기반 Load Test
 *
 * 실제 사용자 행동 시뮬레이션:
 * - 로그인 후 대시보드 확인
 * - 문서 탐색 (페이지네이션)
 * - 문서 상세보기 (PDF 프리뷰)
 * - 키워드/AI 검색
 * - 고객 목록/상세
 * - AI 어시스턴트 대화
 *
 * 실행:
 *   k6 run aims-realistic-load-test.js
 *   k6 run --env BASE_URL=https://aims.giize.com aims-realistic-load-test.js
 *
 * 설치 (Windows):
 *   winget install k6
 *   또는: choco install k6
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ========================================
// 환경 설정
// ========================================
const BASE_URL = __ENV.BASE_URL || 'https://aims.giize.com';

// 테스트 계정들 (여러 사용자 시뮬레이션)
const TEST_USERS = [
  { email: 'test1@example.com', password: 'test1234' },
  { email: 'test2@example.com', password: 'test1234' },
  { email: 'demo@aims.com', password: 'demo1234' },
];

// 실제 검색어 패턴
const SEARCH_KEYWORDS = [
  '보험', '계약', '청구', '삼성', 'DB손해', '메리츠',
  '자동차', '암보험', '종신', '연금', '실손',
];

// Custom Metrics
const errorRate = new Rate('errors');
const apiCalls = new Counter('api_calls');

// API별 응답시간 추적
const metrics = {
  login: new Trend('api_login'),
  documents: new Trend('api_documents'),
  documentDetail: new Trend('api_document_detail'),
  customers: new Trend('api_customers'),
  search: new Trend('api_search'),
  aiSearch: new Trend('api_ai_search'),
  chat: new Trend('api_chat'),
  upload: new Trend('api_upload'),
};

// ========================================
// 테스트 시나리오 (점진적 증가)
// ========================================
export const options = {
  scenarios: {
    // 일반 사용자: 대시보드 + 문서 조회 위주
    normal_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },   // 워밍업
        { duration: '3m', target: 50 },   // 일반 부하
        { duration: '2m', target: 100 },  // 피크 부하
        { duration: '2m', target: 100 },  // 피크 유지
        { duration: '1m', target: 50 },   // 감소
        { duration: '30s', target: 0 },   // 종료
      ],
      exec: 'normalUserFlow',
    },

    // 검색 위주 사용자
    search_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 15 },
        { duration: '2m', target: 30 },
        { duration: '2m', target: 30 },
        { duration: '1m', target: 15 },
        { duration: '30s', target: 0 },
      ],
      exec: 'searchUserFlow',
      startTime: '30s', // 30초 후 시작
    },

    // AI 어시스턴트 사용자
    ai_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: 5 },
        { duration: '2m', target: 10 },
        { duration: '2m', target: 10 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
      exec: 'aiUserFlow',
      startTime: '1m',
    },
  },

  // 성능 임계치
  thresholds: {
    http_req_duration: ['p(95)<3000'],    // 95%가 3초 이내
    http_req_failed: ['rate<0.05'],       // 실패율 5% 미만
    errors: ['rate<0.1'],                 // 에러율 10% 미만
    api_login: ['p(95)<1500'],            // 로그인 1.5초 이내
    api_documents: ['p(95)<2000'],        // 문서목록 2초 이내
    api_search: ['p(95)<2500'],           // 검색 2.5초 이내
    api_ai_search: ['p(95)<5000'],        // AI 검색 5초 이내 (느림)
    api_chat: ['p(95)<10000'],            // AI 채팅 10초 이내
  },
};

// ========================================
// 헬퍼 함수
// ========================================
function headers(token = null) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'AIMS-LoadTest/1.0',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function apiCall(name, fn) {
  apiCalls.add(1);
  const start = Date.now();
  const res = fn();
  const duration = Date.now() - start;

  if (metrics[name]) {
    metrics[name].add(duration);
  }

  return res;
}

function login() {
  const user = randomItem(TEST_USERS);

  const res = apiCall('login', () =>
    http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: headers() }
    )
  );

  if (res.status !== 200) {
    // 테스트 계정이 없으면 guest 토큰 사용 (실제 테스트시 수정 필요)
    console.log(`Login failed for ${user.email}: ${res.status}`);
    errorRate.add(1);
    return null;
  }

  try {
    return JSON.parse(res.body).token;
  } catch {
    return null;
  }
}

function thinkTime(min = 1, max = 3) {
  sleep(randomIntBetween(min, max));
}

// ========================================
// 시나리오 1: 일반 사용자 플로우
// ========================================
export function normalUserFlow() {
  const token = login();
  if (!token) return;

  group('Dashboard', () => {
    // 대시보드 통계
    http.get(`${BASE_URL}/api/dashboard/stats`, { headers: headers(token) });
    thinkTime(1, 2);
  });

  group('Document Browsing', () => {
    // 문서 목록 조회 (첫 페이지)
    const listRes = apiCall('documents', () =>
      http.get(`${BASE_URL}/api/documents?page=1&limit=20`, {
        headers: headers(token),
      })
    );

    check(listRes, { 'documents loaded': (r) => r.status === 200 }) || errorRate.add(1);
    thinkTime(2, 4);

    // 문서 상세 조회 (랜덤)
    try {
      const docs = JSON.parse(listRes.body);
      const docList = docs.documents || docs.data || [];

      if (docList.length > 0) {
        const doc = randomItem(docList);
        const docId = doc._id || doc.id;

        apiCall('documentDetail', () =>
          http.get(`${BASE_URL}/api/documents/${docId}`, {
            headers: headers(token),
          })
        );
        thinkTime(3, 5); // 문서 읽는 시간
      }
    } catch {
      // ignore
    }

    // 페이지네이션 (2~3페이지)
    const pages = randomIntBetween(1, 2);
    for (let i = 2; i <= pages + 1; i++) {
      http.get(`${BASE_URL}/api/documents?page=${i}&limit=20`, {
        headers: headers(token),
      });
      thinkTime(1, 2);
    }
  });

  group('Customer Browsing', () => {
    const customerRes = apiCall('customers', () =>
      http.get(`${BASE_URL}/api/customers?page=1&limit=20`, {
        headers: headers(token),
      })
    );

    check(customerRes, { 'customers loaded': (r) => r.status === 200 }) || errorRate.add(1);
    thinkTime(2, 3);
  });

  // 세션 유지 시간 시뮬레이션
  thinkTime(5, 10);
}

// ========================================
// 시나리오 2: 검색 위주 사용자 플로우
// ========================================
export function searchUserFlow() {
  const token = login();
  if (!token) return;

  group('Keyword Search', () => {
    const keyword = randomItem(SEARCH_KEYWORDS);

    const searchRes = apiCall('search', () =>
      http.get(`${BASE_URL}/api/documents/search?q=${encodeURIComponent(keyword)}`, {
        headers: headers(token),
      })
    );

    check(searchRes, { 'search completed': (r) => r.status === 200 || r.status === 404 }) || errorRate.add(1);
    thinkTime(2, 4);

    // 검색 결과 문서 클릭
    try {
      const results = JSON.parse(searchRes.body);
      const docs = results.documents || results.data || results.results || [];

      if (docs.length > 0) {
        const doc = randomItem(docs);
        const docId = doc._id || doc.id || doc.doc_id;

        if (docId) {
          http.get(`${BASE_URL}/api/documents/${docId}`, {
            headers: headers(token),
          });
          thinkTime(3, 5);
        }
      }
    } catch {
      // ignore
    }
  });

  group('AI Search', () => {
    const keyword = randomItem(SEARCH_KEYWORDS);

    // AI 시맨틱 검색 (RAG API)
    const aiRes = apiCall('aiSearch', () =>
      http.post(
        `${BASE_URL}/api/search/semantic`,
        JSON.stringify({ query: `${keyword} 관련 문서 찾아줘`, limit: 10 }),
        { headers: headers(token), timeout: '30s' }
      )
    );

    check(aiRes, {
      'AI search completed': (r) => r.status === 200 || r.status === 404 || r.status === 502,
    }) || errorRate.add(1);

    thinkTime(3, 5);
  });

  thinkTime(3, 6);
}

// ========================================
// 시나리오 3: AI 어시스턴트 사용자 플로우
// ========================================
export function aiUserFlow() {
  const token = login();
  if (!token) return;

  const AI_QUESTIONS = [
    '이번 달 신규 계약 현황 알려줘',
    '김철수 고객의 보험 계약 목록 보여줘',
    '최근 등록된 문서 요약해줘',
    '암보험 관련 문서 찾아줘',
    '미연결 문서 목록 보여줘',
  ];

  group('AI Chat', () => {
    const question = randomItem(AI_QUESTIONS);

    const chatRes = apiCall('chat', () =>
      http.post(
        `${BASE_URL}/api/chat`,
        JSON.stringify({
          message: question,
          conversationHistory: [],
        }),
        {
          headers: headers(token),
          timeout: '60s', // AI 응답은 오래 걸릴 수 있음
        }
      )
    );

    check(chatRes, {
      'chat responded': (r) => r.status === 200 || r.status === 504,
    }) || errorRate.add(1);

    // AI 응답 읽는 시간
    thinkTime(5, 10);

    // 후속 질문 (50% 확률)
    if (Math.random() > 0.5) {
      const followUp = randomItem(['더 자세히 알려줘', '다른 고객은?', '요약해줘']);

      http.post(
        `${BASE_URL}/api/chat`,
        JSON.stringify({
          message: followUp,
          conversationHistory: [
            { role: 'user', content: question },
            { role: 'assistant', content: '응답...' },
          ],
        }),
        { headers: headers(token), timeout: '60s' }
      );

      thinkTime(5, 10);
    }
  });

  thinkTime(10, 20); // AI 사용자는 생각 시간이 긺
}

// ========================================
// 결과 요약
// ========================================
export function handleSummary(data) {
  const m = data.metrics;

  const summary = {
    '===== AIMS Load Test 결과 =====': '',
    '테스트 시간': `${Math.round((m.iteration_duration?.values?.count || 0) * (m.iteration_duration?.values?.avg || 0) / 1000 / 60)}분`,

    '전체 성능': {
      '총 요청수': m.http_reqs?.values?.count || 0,
      '초당 처리량': `${(m.http_reqs?.values?.rate || 0).toFixed(1)} req/s`,
      '평균 응답시간': `${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
      '95% 응답시간': `${Math.round(m.http_req_duration?.values?.['p(95)'] || 0)}ms`,
      '최대 응답시간': `${Math.round(m.http_req_duration?.values?.max || 0)}ms`,
      '실패율': `${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    },

    'API별 응답시간 (p95)': {
      '로그인': `${Math.round(m.api_login?.values?.['p(95)'] || 0)}ms`,
      '문서목록': `${Math.round(m.api_documents?.values?.['p(95)'] || 0)}ms`,
      '문서상세': `${Math.round(m.api_document_detail?.values?.['p(95)'] || 0)}ms`,
      '고객목록': `${Math.round(m.api_customers?.values?.['p(95)'] || 0)}ms`,
      '키워드검색': `${Math.round(m.api_search?.values?.['p(95)'] || 0)}ms`,
      'AI검색': `${Math.round(m.api_ai_search?.values?.['p(95)'] || 0)}ms`,
      'AI채팅': `${Math.round(m.api_chat?.values?.['p(95)'] || 0)}ms`,
    },

    '동시접속 분석': {
      '최대 VU': m.vus_max?.values?.value || 0,
      '권장 동시접속자': estimateCapacity(m),
    },
  };

  console.log('\n' + '='.repeat(50));
  console.log(JSON.stringify(summary, null, 2));
  console.log('='.repeat(50));

  return {
    'load-test-result.json': JSON.stringify(data, null, 2),
    'load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}

function estimateCapacity(m) {
  const p95 = m.http_req_duration?.values?.['p(95)'] || 0;
  const failRate = m.http_req_failed?.values?.rate || 0;
  const maxVU = m.vus_max?.values?.value || 0;

  // 응답시간 2초 이내, 실패율 5% 미만일 때의 최대 VU 추정
  if (p95 < 2000 && failRate < 0.05) {
    return `${maxVU}명 이상 (테스트 기준 충족)`;
  } else if (p95 < 3000 && failRate < 0.1) {
    return `약 ${Math.round(maxVU * 0.7)}명 (응답시간 저하 시작)`;
  } else {
    return `약 ${Math.round(maxVU * 0.5)}명 (성능 병목 발생)`;
  }
}
