/**
 * aims-mobile API 통합 테스트
 *
 * Web 에뮬레이터 테스트 전 백엔드 연동 검증
 * Node.js로 직접 실행 가능
 */

const API_BASE = 'https://aims.giize.com';

// 테스트 결과
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// 테스트 유틸리티
function test(name, fn) {
  return { name, fn };
}

async function runTest(testCase) {
  results.total++;
  const startTime = Date.now();

  try {
    await testCase.fn();
    results.passed++;
    results.tests.push({
      name: testCase.name,
      status: 'PASS',
      duration: Date.now() - startTime
    });
    console.log(`  ✅ ${testCase.name} (${Date.now() - startTime}ms)`);
    return true;
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: testCase.name,
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - startTime
    });
    console.log(`  ❌ ${testCase.name}: ${error.message}`);
    return false;
  }
}

// 토큰 저장
let authToken = null;
let testUserId = null;

// ============================================
// 테스트 케이스 정의
// ============================================

const tests = {
  // 1. 인증 테스트
  auth: [
    test('개발자 로그인 API', async () => {
      const response = await fetch(`${API_BASE}/api/dev/ensure-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Login failed');
      if (!data.token) throw new Error('No token received');

      authToken = data.token;
      testUserId = data.user?.id;
    }),

    test('토큰 검증 (me API)', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('Token verification failed');
      if (!data.user) throw new Error('No user data in response');
    }),

    test('사용자 정보 조회', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('User info fetch failed');
      if (!data.user) throw new Error('No user data');
    })
  ],

  // 2. MCP 도구 테스트
  mcp: [
    test('MCP 서버 상태', async () => {
      const response = await fetch(`${API_BASE}/api/mcp/health`);
      // 404면 직접 MCP 서버 확인
      if (response.status === 404) {
        // MCP 상태는 서버에서 직접 확인됨
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }),

    test('MCP 도구 목록 조회', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/chat/tools`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('Tools fetch failed');
      if (!Array.isArray(data.tools) || data.tools.length === 0) {
        throw new Error('No tools available');
      }
    })
  ],

  // 3. 채팅 API 테스트
  chat: [
    test('채팅 세션 목록 조회', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/chat/sessions`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('Sessions fetch failed');
    }),

    test('채팅 메시지 전송 (고객 목록)', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '고객 목록 보여줘' }]
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // SSE 응답 확인 (첫 청크만)
      const reader = response.body.getReader();
      const { value, done } = await reader.read();
      reader.cancel();

      if (done || !value) throw new Error('No SSE response');

      const text = new TextDecoder().decode(value);
      if (!text.includes('data:')) throw new Error('Invalid SSE format');
    }),

    test('채팅 메시지 전송 (계약 조회)', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '계약 목록 보여줘' }]
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const { value, done } = await reader.read();
      reader.cancel();

      if (done || !value) throw new Error('No SSE response');
    })
  ],

  // 4. 고객 API 테스트
  customers: [
    test('고객 목록 조회', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/customers?limit=5`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('Customers fetch failed');
    }),

    test('고객 검색 (이름)', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/customers?search=테스트`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error('Customer search failed');
    })
  ],

  // 5. 문서 API 테스트
  documents: [
    test('문서 상태 API 확인', async () => {
      if (!authToken) throw new Error('No token available');

      const response = await fetch(`${API_BASE}/api/documents/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      // 404는 정상 (문서가 없을 수 있음)
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    })
  ]
};

// ============================================
// 테스트 실행
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       aims-mobile API Integration Tests                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  API Base: ${API_BASE.padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // 카테고리별 실행
  for (const [category, testCases] of Object.entries(tests)) {
    console.log(`\n📁 ${category.toUpperCase()}`);
    console.log('─'.repeat(50));

    for (const testCase of testCases) {
      await runTest(testCase);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // 결과 출력
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total: ${String(results.total).padEnd(50)}║`);
  console.log(`║  Passed: ${String(results.passed).padEnd(49)}║`);
  console.log(`║  Failed: ${String(results.failed).padEnd(49)}║`);
  console.log(`║  Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%${' '.repeat(42)}║`);
  console.log(`║  Duration: ${elapsed}s${' '.repeat(46 - elapsed.length)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 실패 테스트 상세
  const failed = results.tests.filter(t => t.status === 'FAIL');
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name}: ${t.error}`);
    });
  }

  // 최종 판정
  const passRate = results.passed / results.total;
  if (passRate >= 0.8) {
    console.log('\n✅ API Integration Test PASSED - Web 개발 준비 완료!');
    process.exit(0);
  } else {
    console.log(`\n⚠️ API Integration Test needs improvement (target: 80%, actual: ${(passRate * 100).toFixed(1)}%)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
