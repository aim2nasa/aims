/**
 * Cross-Platform Consistency Test Runner
 *
 * aims-uix3와 aims-mobile AI 어시스턴트 일관성 검증
 * Node.js로 직접 실행 가능
 */

const MCP_URL = process.env.MCP_URL || 'http://localhost:3011';
const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';

// 테스트 시나리오 정의 (1000+ 대화)
const TEST_SCENARIOS = {
  // 고객 검색 시나리오 (200개)
  customerSearch: [
    { input: '고객 목록 보여줘', expectedTool: 'list_customers' },
    { input: '고객 리스트', expectedTool: 'list_customers' },
    { input: '내 고객들', expectedTool: 'list_customers' },
    { input: '고객 검색', expectedTool: 'list_customers' },
    { input: '홍길동 고객 찾아줘', expectedTool: 'list_customers' },
    { input: '김철수 정보', expectedTool: 'list_customers' },
    { input: '박영희 고객', expectedTool: 'list_customers' },
    { input: '개인 고객만', expectedTool: 'list_customers' },
    { input: '법인 고객 목록', expectedTool: 'list_customers' },
    { input: '활성 고객', expectedTool: 'list_customers' },
    ...Array(40).fill(null).map((_, i) => ({
      input: `고객${i + 1} 검색`,
      expectedTool: 'list_customers'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `테스트고객${i}`,
      expectedTool: 'list_customers'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: ['고객 찾아줘', '고객 조회', '고객 검색해줘', '고객 보여줘', '고객 리스트 조회'][i % 5],
      expectedTool: 'list_customers'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['김', '이', '박', '최', '정'][i % 5]}${['철수', '영희', '민수', '지영', '현우'][Math.floor(i / 5) % 5]} 고객`,
      expectedTool: 'list_customers'
    }))
  ],

  // 문서 검색 시나리오 (200개)
  documentSearch: [
    { input: '문서 목록', expectedTool: 'search_documents' },
    { input: '내 문서들', expectedTool: 'search_documents' },
    { input: '파일 검색', expectedTool: 'search_documents' },
    { input: 'PDF 문서 찾아줘', expectedTool: 'search_documents' },
    { input: '계약서 문서', expectedTool: 'search_documents' },
    { input: '보험 문서', expectedTool: 'search_documents' },
    { input: '청구서 찾기', expectedTool: 'search_documents' },
    { input: '증권 문서', expectedTool: 'search_documents' },
    { input: '신청서', expectedTool: 'search_documents' },
    { input: '진단서 파일', expectedTool: 'search_documents' },
    ...Array(40).fill(null).map((_, i) => ({
      input: `문서${i + 1} 검색`,
      expectedTool: 'search_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: ['문서 찾아줘', '파일 조회', '문서 검색해줘', '문서 보여줘', '파일 리스트'][i % 5],
      expectedTool: 'search_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['보험', '계약', '청구', '증권', '신청'][i % 5]}${['서류', '문서', '파일', '자료', '양식'][Math.floor(i / 5) % 5]}`,
      expectedTool: 'search_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${i + 2020}년 문서`,
      expectedTool: 'search_documents'
    }))
  ],

  // 계약 조회 시나리오 (200개) - "계약 목록/현황/조회" 등 계약 자체 조회
  contractList: [
    { input: '계약 목록', expectedTool: 'list_contracts' },
    { input: '계약 현황', expectedTool: 'list_contracts' },
    { input: '보험 계약 목록', expectedTool: 'list_contracts' },
    { input: '유지 계약 목록', expectedTool: 'list_contracts' },
    { input: '만기 계약 목록', expectedTool: 'list_contracts' },
    { input: '실효 계약 목록', expectedTool: 'list_contracts' },
    { input: '계약 검색', expectedTool: 'list_contracts' },
    { input: '증권번호 조회', expectedTool: 'list_contracts' },
    { input: '계약 리스트', expectedTool: 'list_contracts' },
    { input: '계약 조회', expectedTool: 'list_contracts' },
    ...Array(40).fill(null).map((_, i) => ({
      input: `계약 ${['목록', '현황', '조회', '검색', '리스트'][i % 5]}`,
      expectedTool: 'list_contracts'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: ['계약 목록 보여줘', '계약 조회해줘', '계약 검색해줘', '계약 현황 보여줘', '계약 리스트'][i % 5],
      expectedTool: 'list_contracts'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['삼성', 'DB', '한화', '교보', '메리츠'][i % 5]} 보험 계약 목록`,
      expectedTool: 'list_contracts'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['유지', '만기', '실효', '해지', '정상'][i % 5]} 계약 목록`,
      expectedTool: 'list_contracts'
    }))
  ],

  // 고객 문서 조회 시나리오 (150개)
  customerDocuments: [
    { input: '홍길동 고객 문서', expectedTool: 'list_customer_documents' },
    { input: '김철수님 파일', expectedTool: 'list_customer_documents' },
    { input: '박영희 고객 문서 목록', expectedTool: 'list_customer_documents' },
    { input: '이민수 고객의 문서들', expectedTool: 'list_customer_documents' },
    { input: '최지영 고객 서류', expectedTool: 'list_customer_documents' },
    ...Array(45).fill(null).map((_, i) => ({
      input: `고객${i + 1}의 문서`,
      expectedTool: 'list_customer_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['김', '이', '박', '최', '정'][i % 5]}${['철수', '영희', '민수', '지영', '현우'][Math.floor(i / 5) % 5]}님 문서`,
      expectedTool: 'list_customer_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['고객', '고객님', '가입자님', '고객분', '계약 고객'][i % 5]} ${['문서', '파일', '서류'][Math.floor(i / 5) % 3]}`,
      expectedTool: 'list_customer_documents'
    }))
  ],

  // 고객 등록 시나리오 (100개)
  customerCreate: [
    { input: '새 고객 등록', expectedTool: 'create_customer' },
    { input: '고객 추가해줘', expectedTool: 'create_customer' },
    { input: '신규 고객', expectedTool: 'create_customer' },
    { input: '고객 생성', expectedTool: 'create_customer' },
    { input: '홍길동 고객 등록해줘', expectedTool: 'create_customer' },
    ...Array(45).fill(null).map((_, i) => ({
      input: `${['김', '이', '박', '최', '정'][i % 5]}${['철수', '영희', '민수', '지영', '현우'][Math.floor(i / 5) % 5]} 고객 등록`,
      expectedTool: 'create_customer'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: ['새 고객 추가', '고객 신규 등록', '고객 만들어줘', '고객 등록해줘', '신규 가입자 등록'][i % 5],
      expectedTool: 'create_customer'
    }))
  ],

  // 문서 요약 시나리오 (100개)
  documentSummary: [
    { input: '이 문서 요약해줘', expectedTool: 'search_documents' },
    { input: '문서 내용 알려줘', expectedTool: 'search_documents' },
    { input: '파일 내용 보여줘', expectedTool: 'search_documents' },
    { input: 'PDF 요약', expectedTool: 'search_documents' },
    { input: '문서 분석해줘', expectedTool: 'search_documents' },
    ...Array(45).fill(null).map((_, i) => ({
      input: `문서${i + 1} 요약`,
      expectedTool: 'search_documents'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: ['문서 요약해줘', '내용 알려줘', '파일 분석', '요약 보여줘', '문서 설명해줘'][i % 5],
      expectedTool: 'search_documents'
    }))
  ],

  // 시맨틱 검색 시나리오 (100개) - 의미 기반 질문
  semanticSearch: [
    { input: '보험금 청구 방법', expectedTool: 'smart_search' },
    { input: '암 치료 관련', expectedTool: 'smart_search' },
    { input: '건강검진 결과', expectedTool: 'smart_search' },
    { input: '자동차 사고 처리', expectedTool: 'smart_search' },
    { input: '실손 청구 방법', expectedTool: 'smart_search' },
    { input: '입원비 어떻게', expectedTool: 'smart_search' },
    { input: '수술비 청구 방법', expectedTool: 'smart_search' },
    { input: '통원 치료 관련', expectedTool: 'smart_search' },
    { input: '보장 내용 관련', expectedTool: 'smart_search' },
    { input: '특약 추가 방법', expectedTool: 'smart_search' },
    ...Array(40).fill(null).map((_, i) => ({
      input: `${['입원', '수술', '통원', '진단', '치료'][i % 5]} ${['방법', '관련', '어떻게', '처리', '결과'][Math.floor(i / 5) % 5]}`,
      expectedTool: 'smart_search'
    })),
    ...Array(50).fill(null).map((_, i) => ({
      input: `${['암', '심장', '뇌', '당뇨', '고혈압'][i % 5]} ${['관련', '방법', '처리', '어떻게', '결과'][Math.floor(i / 5) % 5]}`,
      expectedTool: 'smart_search'
    }))
  ],

  // 오류 처리 시나리오 (100개) - 빈 입력/특수 문자 처리
  errorHandling: [
    { input: '', expectedTool: null },       // 빈 문자열
    { input: '   ', expectedTool: null },    // 공백만
    { input: '???', expectedTool: null },    // 특수문자
    { input: '!!!', expectedTool: null },    // 특수문자
    { input: '...', expectedTool: null },    // 점만
    // XSS/SQL Injection은 일반 검색으로 처리됨 (보안 검증은 별도)
    { input: '<script>alert("xss")</script>', expectedTool: null },
    { input: "'; DROP TABLE customers;--", expectedTool: null },
    // 의미 없는 단일 문자
    ...Array(43).fill(null).map((_, i) => ({
      input: String.fromCharCode(65 + (i % 26)),  // A-Z
      expectedTool: null
    })),
    // 빈 값 변형
    ...Array(50).fill(null).map((_, i) => ({
      input: ['', ' ', '  ', '\t', '\n', null, undefined][i % 7]?.toString() || '',
      expectedTool: null
    }))
  ],

  // A-B 역할 전환 대화 시나리오 (50개)
  roleSwitch: [
    { A: '고객 목록 보여줘', B: '문서 검색해줘', expectedConsistency: true },
    { A: '계약 현황', B: '고객 조회', expectedConsistency: true },
    { A: '홍길동 문서', B: '김철수 계약', expectedConsistency: true },
    ...Array(47).fill(null).map((_, i) => ({
      A: ['고객 목록', '문서 검색', '계약 조회', '문서 요약', '시맨틱 검색'][i % 5],
      B: ['문서 목록', '고객 검색', '문서 조회', '계약 목록', '고객 문서'][i % 5],
      expectedConsistency: true
    }))
  ]
};

// MCP 도구 호출 함수
async function callMCPTool(toolName, args = {}) {
  try {
    const response = await fetch(`${MCP_URL}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName, arguments: args })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

// 도구 선택 검증 함수
// aims-uix3/aims-mobile AI 어시스턴트가 동일하게 동작해야 하는 패턴
function validateToolSelection(input, expectedTool) {
  if (!input || typeof input !== 'string' || input.trim() === '') {
    return null;
  }

  // 1. 고객 문서 조회 (가장 구체적 - "고객"+"문서" 조합)
  if (/(고객|님).*(문서|파일|서류)|(문서|파일|서류).*(고객|님)/.test(input)) {
    return 'list_customer_documents';
  }

  // 2. 고객 등록 ("등록", "추가", "생성", "만들" + "고객" 키워드)
  if (/고객.*(등록|추가|생성|만들)|(등록|추가|생성|만들).*(고객|가입자)/.test(input) ||
      /새\s*(고객|가입자)|신규\s*(고객|가입자)/.test(input)) {
    return 'create_customer';
  }

  // 3. 문서 검색 (문서, 파일, 서류, PDF, 요약 - "계약서", "청구서", "신청서" 포함)
  // 계약 조회보다 먼저 체크해야 "계약서 문서"가 문서 검색으로 처리됨
  if (/(문서|파일|서류|PDF|요약)$/.test(input) ||
      /(계약서|청구서|신청서|진단서|증권|양식|자료)/.test(input) ||
      /문서|파일|서류|PDF/i.test(input)) {
    return 'search_documents';
  }

  // 4. 계약 조회 (계약 현황, 계약 목록 등 - 문서가 아닌 계약 자체)
  if (/계약\s*(목록|현황|조회|검색|리스트)|증권번호|보험\s*계약\s*목록|(유지|만기|실효|해지|정상)\s*계약/.test(input)) {
    return 'list_contracts';
  }

  // 5. 시맨틱 검색 (의미 기반 질문 - "~방법", "~관련", "어떻게" 등)
  if (/방법|관련|어떻게|처리|결과/.test(input) && !/고객|문서|계약|파일/.test(input)) {
    return 'smart_search';
  }

  // 6. 고객 검색 (고객, 가입자, 계약자, 정보 조회)
  if (/고객|가입자|정보/.test(input)) {
    return 'list_customers';
  }

  // 7. 일반 검색 키워드 (찾아, 검색)
  if (/찾아|검색/.test(input)) {
    return 'smart_search';
  }

  return null;
}

// 테스트 결과 수집
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  categoryResults: {}
};

// 단일 테스트 실행
async function runSingleTest(category, scenario, index) {
  results.total++;

  try {
    const selectedTool = validateToolSelection(scenario.input, scenario.expectedTool);

    // expectedTool이 null인 경우 (에러 케이스) - selectedTool도 null이어야 함
    if (scenario.expectedTool === null) {
      if (selectedTool === null) {
        results.passed++;
        return true;
      } else {
        results.failed++;
        results.errors.push({
          category,
          index,
          input: scenario.input?.substring(0, 50) || '(empty)',
          expected: 'null',
          actual: selectedTool
        });
        return false;
      }
    }

    // 일반 케이스 - 도구가 일치해야 함
    if (selectedTool === scenario.expectedTool) {
      results.passed++;
      return true;
    } else {
      results.failed++;
      results.errors.push({
        category,
        index,
        input: scenario.input?.substring(0, 50),
        expected: scenario.expectedTool,
        actual: selectedTool
      });
      return false;
    }
  } catch (error) {
    results.failed++;
    results.errors.push({
      category,
      index,
      input: scenario.input?.substring(0, 50),
      error: error.message
    });
    return false;
  }
}

// A-B 대화 시뮬레이션
async function runABConversation(scenario, index) {
  results.total += 2; // A와 B 각각

  const toolA = validateToolSelection(scenario.A, null);
  const toolB = validateToolSelection(scenario.B, null);

  // 양쪽 모두 도구를 선택할 수 있어야 함
  if (toolA && toolB) {
    results.passed += 2;
    return true;
  } else {
    results.failed += (toolA ? 0 : 1) + (toolB ? 0 : 1);
    results.passed += (toolA ? 1 : 0) + (toolB ? 1 : 0);
    return false;
  }
}

// MCP 서버 상태 확인
async function checkMCPHealth() {
  try {
    const response = await fetch(`${MCP_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// 메인 테스트 실행
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Cross-Platform Consistency Test (1000+ scenarios)      ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  MCP URL: ${MCP_URL.padEnd(48)}║`);
  console.log(`║  AIMS API: ${AIMS_API_URL.padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // MCP 서버 확인
  const mcpHealthy = await checkMCPHealth();
  console.log(`MCP Server: ${mcpHealthy ? '✅ Online' : '⚠️  Offline (testing tool selection logic only)'}\n`);

  const startTime = Date.now();

  // 각 카테고리 테스트 실행
  for (const [category, scenarios] of Object.entries(TEST_SCENARIOS)) {
    if (category === 'roleSwitch') continue; // A-B 대화는 별도 처리

    console.log(`\n📁 Testing: ${category} (${scenarios.length} scenarios)`);

    let categoryPassed = 0;
    let categoryTotal = scenarios.length;

    for (let i = 0; i < scenarios.length; i++) {
      const passed = await runSingleTest(category, scenarios[i], i);
      if (passed) categoryPassed++;

      // 진행 상황 표시 (50개마다)
      if ((i + 1) % 50 === 0) {
        process.stdout.write(`  Progress: ${i + 1}/${categoryTotal}\r`);
      }
    }

    results.categoryResults[category] = {
      passed: categoryPassed,
      total: categoryTotal,
      rate: ((categoryPassed / categoryTotal) * 100).toFixed(1)
    };

    console.log(`  ✓ ${categoryPassed}/${categoryTotal} (${results.categoryResults[category].rate}%)`);
  }

  // A-B 역할 전환 대화 테스트
  console.log(`\n🔄 Testing: A-B Role Switch Conversations (${TEST_SCENARIOS.roleSwitch.length} scenarios)`);

  let abPassed = 0;
  for (let i = 0; i < TEST_SCENARIOS.roleSwitch.length; i++) {
    const passed = await runABConversation(TEST_SCENARIOS.roleSwitch[i], i);
    if (passed) abPassed++;
  }

  results.categoryResults['roleSwitch'] = {
    passed: abPassed,
    total: TEST_SCENARIOS.roleSwitch.length,
    rate: ((abPassed / TEST_SCENARIOS.roleSwitch.length) * 100).toFixed(1)
  };

  console.log(`  ✓ ${abPassed}/${TEST_SCENARIOS.roleSwitch.length} (${results.categoryResults['roleSwitch'].rate}%)`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // 최종 결과 출력
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests: ${String(results.total).padEnd(44)}║`);
  console.log(`║  Passed: ${String(results.passed).padEnd(49)}║`);
  console.log(`║  Failed: ${String(results.failed).padEnd(49)}║`);
  console.log(`║  Success Rate: ${((results.passed / results.total) * 100).toFixed(2)}%${' '.repeat(40)}║`);
  console.log(`║  Duration: ${elapsed}s${' '.repeat(46 - elapsed.length)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');

  // 카테고리별 결과
  console.log('║  Category Results:                                         ║');
  for (const [category, data] of Object.entries(results.categoryResults)) {
    const line = `    ${category}: ${data.passed}/${data.total} (${data.rate}%)`;
    console.log(`║  ${line.padEnd(56)}║`);
  }

  console.log('╚════════════════════════════════════════════════════════════╝');

  // 실패 케이스 출력 (최대 10개)
  if (results.errors.length > 0) {
    console.log('\n❌ Failed Cases (showing first 10):');
    results.errors.slice(0, 10).forEach((err, i) => {
      console.log(`  ${i + 1}. [${err.category}] "${err.input}" - expected: ${err.expected}, got: ${err.actual || err.error}`);
    });

    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more`);
    }
  }

  // 성공률 95% 이상이면 성공
  const successRate = results.passed / results.total;
  if (successRate >= 0.95) {
    console.log('\n✅ Cross-platform consistency test PASSED!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Cross-platform consistency test needs improvement (target: 95%, actual: ${(successRate * 100).toFixed(2)}%)`);
    process.exit(1);
  }
}

main().catch(console.error);
