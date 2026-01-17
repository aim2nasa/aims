/**
 * AR/CRS 이력 도구 5종 100회 반복 정밀 테스트
 *
 * 실행: node ar-crs-stress-test.mjs
 * 반복 횟수 조정: ITERATIONS=50 node ar-crs-stress-test.mjs
 *
 * 테스트 대상 (5개):
 * 1. get_ar_contract_history - AR 계약 이력 조회
 * 2. get_cr_parsing_status - CRS 파싱 상태 조회
 * 3. trigger_cr_parsing - CRS 파싱 트리거
 * 4. get_cr_queue_status - CRS 큐 상태 조회
 * 5. get_cr_contract_history - CRS 변액 이력 조회
 */

const MCP_URL = process.env.MCP_URL || 'http://100.110.215.65:3011';
const USER_ID = process.env.USER_ID || '000000000000000000000001';
const ITERATIONS = parseInt(process.env.ITERATIONS || '100', 10);

// 테스트 결과 수집
const results = {
  categoryA: { passed: 0, failed: 0, tests: [] },
  categoryB: { passed: 0, failed: 0, tests: [] },
  byTool: {},
  errors: [],
  bugValidation: {},
  symmetryTests: []
};

// 발견된 고객 ID 저장
let testCustomers = {
  withAR: [],
  withCRS: [],
  withBoth: [],
  withNeither: []
};

async function callTool(tool, args, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();

  try {
    const res = await fetch(MCP_URL + '/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': USER_ID
      },
      body: JSON.stringify({ tool, arguments: args }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    const duration = Date.now() - start;

    if (data.result) {
      return { ...data.result, duration };
    }
    return { ...data, duration };
  } catch (e) {
    clearTimeout(timeoutId);
    return {
      isError: true,
      content: [{ text: e.name === 'AbortError' ? `Timeout after ${timeout}ms` : e.message }],
      duration: Date.now() - start
    };
  }
}

function parseResult(result) {
  if (result.isError) return null;
  try {
    return JSON.parse(result.content?.[0]?.text || '{}');
  } catch {
    return null;
  }
}

// Phase 1: 테스트 데이터 수집
async function collectTestData() {
  console.log('\n📂 Phase 1: 테스트 데이터 수집');
  console.log('-'.repeat(60));

  // 고객 목록 조회
  const customers = await callTool('search_customers', { limit: 50 });
  const customersData = parseResult(customers);

  if (!customersData?.customers?.length) {
    console.log('❌ 고객 데이터를 찾을 수 없습니다.');
    return false;
  }

  console.log(`  고객 ${customersData.customers.length}명 발견`);

  // AR/CRS 데이터 확인
  for (const customer of customersData.customers.slice(0, 20)) {
    const customerId = customer.id || customer._id;

    // AR 데이터 확인
    const ar = await callTool('get_annual_reports', { customerId, limit: 1 });
    const arData = parseResult(ar);
    const hasAR = (arData?.totalReports || arData?.reports?.length || 0) > 0;

    // CRS 데이터 확인
    const cr = await callTool('get_customer_reviews', { customerId, limit: 1 });
    const crData = parseResult(cr);
    const hasCRS = (crData?.totalReviews || crData?.reviews?.length || 0) > 0;

    if (hasAR && hasCRS) {
      testCustomers.withBoth.push(customerId);
    } else if (hasAR) {
      testCustomers.withAR.push(customerId);
    } else if (hasCRS) {
      testCustomers.withCRS.push(customerId);
    } else {
      testCustomers.withNeither.push(customerId);
    }
  }

  console.log(`  AR+CRS: ${testCustomers.withBoth.length}명`);
  console.log(`  AR만: ${testCustomers.withAR.length}명`);
  console.log(`  CRS만: ${testCustomers.withCRS.length}명`);
  console.log(`  없음: ${testCustomers.withNeither.length}명`);

  return true;
}

// 테스트 케이스 생성 (동적)
function generateTestCases() {
  const arCustomer = testCustomers.withAR[0] || testCustomers.withBoth[0];
  const crsCustomer = testCustomers.withCRS[0] || testCustomers.withBoth[0];
  const bothCustomer = testCustomers.withBoth[0];
  const emptyCustomer = testCustomers.withNeither[0];

  return {
    categoryA: [
      // get_ar_contract_history
      { tool: 'get_ar_contract_history', args: { customerId: arCustomer }, name: 'AR이력_정상', skip: !arCustomer },
      { tool: 'get_ar_contract_history', args: { customerId: emptyCustomer }, name: 'AR이력_빈데이터', skip: !emptyCustomer },
      { tool: 'get_ar_contract_history', args: {}, name: 'AR이력_파라미터없음', expectError: true },
      { tool: 'get_ar_contract_history', args: { customerId: 'invalid-id' }, name: 'AR이력_잘못된ID', expectError: true },
      { tool: 'get_ar_contract_history', args: { customerId: '000000000000000000000999' }, name: 'AR이력_없는고객', expectError: true },

      // get_cr_parsing_status
      { tool: 'get_cr_parsing_status', args: { customerId: crsCustomer }, name: 'CRS파싱상태_정상', skip: !crsCustomer },
      { tool: 'get_cr_parsing_status', args: {}, name: 'CRS파싱상태_파라미터없음', expectError: true },
      { tool: 'get_cr_parsing_status', args: { customerId: 'invalid-id' }, name: 'CRS파싱상태_잘못된ID', expectError: true },
      { tool: 'get_cr_parsing_status', args: { fileId: '000000000000000000000999' }, name: 'CRS파싱상태_없는파일', expectError: true },

      // get_cr_queue_status
      { tool: 'get_cr_queue_status', args: {}, name: 'CRS큐상태_기본' },
      { tool: 'get_cr_queue_status', args: { limit: 5 }, name: 'CRS큐상태_limit5' },
      { tool: 'get_cr_queue_status', args: { limit: 1 }, name: 'CRS큐상태_limit1' },

      // get_cr_contract_history
      { tool: 'get_cr_contract_history', args: { customerId: crsCustomer }, name: 'CRS이력_정상', skip: !crsCustomer },
      { tool: 'get_cr_contract_history', args: { customerId: emptyCustomer }, name: 'CRS이력_빈데이터', skip: !emptyCustomer },
      { tool: 'get_cr_contract_history', args: {}, name: 'CRS이력_파라미터없음', expectError: true },
      { tool: 'get_cr_contract_history', args: { customerId: 'invalid-id' }, name: 'CRS이력_잘못된ID', expectError: true },
    ],
    categoryB: [
      // trigger_cr_parsing (쓰기)
      { tool: 'trigger_cr_parsing', args: { customerId: crsCustomer }, name: 'CRS파싱트리거_고객', skip: !crsCustomer },
      { tool: 'trigger_cr_parsing', args: {}, name: 'CRS파싱트리거_파라미터없음', expectError: true },
    ],
    symmetry: bothCustomer ? [
      { customerId: bothCustomer, name: 'AR_CRS_대칭성' }
    ] : []
  };
}

// Phase 2: 100회 반복 테스트
async function runIterationTests(testCases) {
  console.log(`\n📗 Phase 2: Category A 테스트 (${ITERATIONS}회 반복)`);
  console.log('-'.repeat(60));

  const activeTestsA = testCases.categoryA.filter(t => !t.skip);
  console.log(`  활성 테스트: ${activeTestsA.length}개`);

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`  [${String(i).padStart(3)}/${ITERATIONS}] `);
    let passed = 0, failed = 0;
    const durations = [];

    for (const test of activeTestsA) {
      const result = await callTool(test.tool, test.args);
      const key = `${test.tool}:${test.name}`;
      if (!results.byTool[key]) {
        results.byTool[key] = { passed: 0, failed: 0, errors: [], durations: [] };
      }

      durations.push(result.duration);
      results.byTool[key].durations.push(result.duration);

      const isSuccess = test.expectError ? result.isError : !result.isError;

      if (isSuccess) {
        results.categoryA.passed++;
        results.byTool[key].passed++;
        passed++;
      } else {
        results.categoryA.failed++;
        results.byTool[key].failed++;
        failed++;
        const errMsg = result.content?.[0]?.text || 'Unknown error';
        if (!results.byTool[key].errors.includes(errMsg)) {
          results.byTool[key].errors.push(errMsg);
          results.errors.push({ tool: test.tool, test: test.name, error: errMsg, iteration: i });
        }
      }
    }

    const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    console.log(`✅${String(passed).padStart(2)} ❌${failed} (avg: ${avgDuration}ms)`);
  }

  // Category B (쓰기) - 순차 실행
  console.log(`\n📙 Phase 2: Category B 테스트 (${ITERATIONS}회 반복)`);
  console.log('-'.repeat(60));

  const activeTestsB = testCases.categoryB.filter(t => !t.skip);
  console.log(`  활성 테스트: ${activeTestsB.length}개`);

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`  [${String(i).padStart(3)}/${ITERATIONS}] `);
    let passed = 0, failed = 0;

    for (const test of activeTestsB) {
      const result = await callTool(test.tool, test.args, 20000);
      const key = `${test.tool}:${test.name}`;
      if (!results.byTool[key]) {
        results.byTool[key] = { passed: 0, failed: 0, errors: [], durations: [] };
      }

      results.byTool[key].durations.push(result.duration);
      const isSuccess = test.expectError ? result.isError : !result.isError;

      if (isSuccess) {
        results.categoryB.passed++;
        results.byTool[key].passed++;
        passed++;
      } else {
        results.categoryB.failed++;
        results.byTool[key].failed++;
        failed++;
        const errMsg = result.content?.[0]?.text || 'Unknown error';
        if (!results.byTool[key].errors.includes(errMsg)) {
          results.byTool[key].errors.push(errMsg);
          results.errors.push({ tool: test.tool, test: test.name, error: errMsg, iteration: i });
        }
      }
    }
    console.log(`✅${passed} ❌${failed}`);
  }
}

// Phase 3: 버그 검증
async function validateBugs(testCases) {
  console.log(`\n🔍 Phase 3: 버그 검증`);
  console.log('-'.repeat(60));

  // 1. CRS Queue 메커니즘 검증
  console.log('\n  [1] CRS Queue 메커니즘 검증');

  const arQueue = await callTool('get_ar_queue_status', {});
  const crQueue = await callTool('get_cr_queue_status', {});

  const arQueueData = parseResult(arQueue);
  const crQueueData = parseResult(crQueue);

  results.bugValidation.crsQueue = {
    arQueueFields: arQueueData ? Object.keys(arQueueData) : [],
    crQueueFields: crQueueData ? Object.keys(crQueueData) : [],
    arHasGlobalStats: !!arQueueData?.globalStats,
    crHasStats: !!crQueueData?.stats,
    difference: 'AR uses globalStats, CR uses stats field'
  };

  console.log(`      AR Queue 필드: ${results.bugValidation.crsQueue.arQueueFields.join(', ')}`);
  console.log(`      CR Queue 필드: ${results.bugValidation.crsQueue.crQueueFields.join(', ')}`);

  if (crQueueData?.stats) {
    console.log(`      ✅ CRS stats 필드 존재: pending=${crQueueData.stats.pending}, completed=${crQueueData.stats.completed}`);
  } else {
    console.log(`      ⚠️ CRS stats 필드 없음`);
  }

  // 2. 응답 구조 불일치 검증
  console.log('\n  [2] 응답 구조 불일치 검증');

  const bothCustomer = testCases.symmetry[0]?.customerId;
  if (bothCustomer) {
    const arHistory = await callTool('get_ar_contract_history', { customerId: bothCustomer });
    const crHistory = await callTool('get_cr_contract_history', { customerId: bothCustomer });

    const arHistoryData = parseResult(arHistory);
    const crHistoryData = parseResult(crHistory);

    results.bugValidation.responseStructure = {
      arFields: arHistoryData ? Object.keys(arHistoryData) : [],
      crFields: crHistoryData ? Object.keys(crHistoryData) : [],
      arUsesContractHistories: !!arHistoryData?.contractHistories,
      crUsesCrContractHistories: !!crHistoryData?.crContractHistories,
      inconsistent: true
    };

    console.log(`      AR 응답 필드: ${results.bugValidation.responseStructure.arFields.join(', ')}`);
    console.log(`      CR 응답 필드: ${results.bugValidation.responseStructure.crFields.join(', ')}`);

    if (arHistoryData?.contractHistories && crHistoryData?.crContractHistories) {
      console.log(`      ⚠️ 불일치 확인: AR='contractHistories', CR='crContractHistories'`);
    }
  } else {
    console.log(`      ⏭️ 스킵 (AR+CRS 데이터 있는 고객 없음)`);
  }

  // 3. 에러 응답 일관성
  console.log('\n  [3] 에러 응답 일관성 검증');

  const arError = await callTool('get_ar_contract_history', { customerId: 'invalid' });
  const crError = await callTool('get_cr_contract_history', { customerId: 'invalid' });

  const arErrMsg = arError.content?.[0]?.text || '';
  const crErrMsg = crError.content?.[0]?.text || '';

  results.bugValidation.errorConsistency = {
    arErrorPattern: arErrMsg.includes('유효하지 않은 고객 ID'),
    crErrorPattern: crErrMsg.includes('유효하지 않은 고객 ID'),
    consistent: arErrMsg.includes('유효하지 않은 고객 ID') && crErrMsg.includes('유효하지 않은 고객 ID')
  };

  console.log(`      AR 에러: "${arErrMsg.substring(0, 50)}..."`);
  console.log(`      CR 에러: "${crErrMsg.substring(0, 50)}..."`);
  console.log(`      ${results.bugValidation.errorConsistency.consistent ? '✅ 일관성 있음' : '⚠️ 불일치'}`);
}

// Phase 4: 대칭성 테스트
async function runSymmetryTests(testCases) {
  console.log(`\n🔄 Phase 4: AR/CRS 대칭성 테스트`);
  console.log('-'.repeat(60));

  const bothCustomer = testCases.symmetry[0]?.customerId;
  if (!bothCustomer) {
    console.log('  ⏭️ 스킵 (AR+CRS 데이터 있는 고객 없음)');
    return;
  }

  // 이력 조회 대칭성
  const arHistory = await callTool('get_ar_contract_history', { customerId: bothCustomer });
  const crHistory = await callTool('get_cr_contract_history', { customerId: bothCustomer });

  const arData = parseResult(arHistory);
  const crData = parseResult(crHistory);

  const symmetryResult = {
    customerId: bothCustomer,
    arSuccess: !arHistory.isError,
    crSuccess: !crHistory.isError,
    arTotalContracts: arData?.totalContracts || 0,
    crTotalContracts: crData?.totalContracts || 0,
    arHasCustomerName: !!arData?.customerName,
    crHasCustomerName: !!crData?.customerName,
    arHasMessage: !!arData?.message,
    crHasMessage: !!crData?.message
  };

  results.symmetryTests.push(symmetryResult);

  console.log(`  고객 ID: ${bothCustomer}`);
  console.log(`  AR 계약 이력: ${symmetryResult.arTotalContracts}건`);
  console.log(`  CR 변액 이력: ${symmetryResult.crTotalContracts}건`);
  console.log(`  공통 필드 존재: customerName=${symmetryResult.arHasCustomerName && symmetryResult.crHasCustomerName ? '✅' : '⚠️'}, message=${symmetryResult.arHasMessage && symmetryResult.crHasMessage ? '✅' : '⚠️'}`);
}

// 결과 리포트 생성
function generateReport() {
  const totalA = results.categoryA.passed + results.categoryA.failed;
  const totalB = results.categoryB.passed + results.categoryB.failed;
  const total = totalA + totalB;
  const totalPassed = results.categoryA.passed + results.categoryB.passed;

  console.log('\n' + '═'.repeat(70));
  console.log('║          AR/CRS 5 Tools - 100회 반복 테스트 결과                    ║');
  console.log('═'.repeat(70));

  console.log(`\n📊 전체 요약`);
  console.log(`  총 테스트: ${total} (${ITERATIONS}회 반복)`);
  console.log(`  성공률: ${(totalPassed / total * 100).toFixed(1)}%`);
  console.log(`  Category A (읽기): ${results.categoryA.passed}/${totalA} (${(results.categoryA.passed / totalA * 100).toFixed(1)}%)`);
  console.log(`  Category B (쓰기): ${results.categoryB.passed}/${totalB} (${(results.categoryB.passed / totalB * 100).toFixed(1)}%)`);

  // 도구별 상세
  console.log(`\n📋 도구별 상세`);
  const toolGroups = {
    'get_ar_contract_history': [],
    'get_cr_parsing_status': [],
    'get_cr_queue_status': [],
    'get_cr_contract_history': [],
    'trigger_cr_parsing': []
  };

  for (const [key, stats] of Object.entries(results.byTool)) {
    const [tool] = key.split(':');
    if (toolGroups[tool]) {
      toolGroups[tool].push({ key, ...stats });
    }
  }

  for (const [tool, tests] of Object.entries(toolGroups)) {
    const totalPassed = tests.reduce((sum, t) => sum + t.passed, 0);
    const totalFailed = tests.reduce((sum, t) => sum + t.failed, 0);
    const total = totalPassed + totalFailed;
    const avgDuration = tests.length > 0
      ? Math.round(tests.flatMap(t => t.durations).reduce((a, b) => a + b, 0) / tests.flatMap(t => t.durations).length)
      : 0;

    const status = totalFailed === 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${tool}: ${totalPassed}/${total} (avg: ${avgDuration}ms)`);

    for (const test of tests) {
      if (test.failed > 0) {
        console.log(`      ❌ ${test.key.split(':')[1]}: ${test.failed}회 실패`);
        for (const err of test.errors.slice(0, 1)) {
          console.log(`         └ ${err.substring(0, 60)}...`);
        }
      }
    }
  }

  // 버그 검증 결과
  console.log(`\n🐛 버그 검증 결과`);
  console.log(`  [1] CRS Queue: ${results.bugValidation.crsQueue?.crHasStats ? '✅ stats 필드 정상' : '⚠️ 구조 확인 필요'}`);
  console.log(`  [2] 응답 구조: ${results.bugValidation.responseStructure?.inconsistent ? '⚠️ AR/CR 필드명 불일치' : '✅ 일관성 있음'}`);
  console.log(`  [3] 에러 일관성: ${results.bugValidation.errorConsistency?.consistent ? '✅ 일관성 있음' : '⚠️ 불일치'}`);

  // 성공 기준 판정
  console.log(`\n📝 성공 기준 판정`);
  const categoryAPass = totalA > 0 && (results.categoryA.passed / totalA) >= 0.90;
  const categoryBPass = totalB > 0 && (results.categoryB.passed / totalB) >= 0.80;

  console.log(`  Category A (≥90%): ${categoryAPass ? '✅ PASS' : '❌ FAIL'} (${(results.categoryA.passed / totalA * 100).toFixed(1)}%)`);
  console.log(`  Category B (≥80%): ${categoryBPass ? '✅ PASS' : '❌ FAIL'} (${(results.categoryB.passed / totalB * 100).toFixed(1)}%)`);

  // JSON 결과
  console.log('\n' + '═'.repeat(70));
  console.log('📁 상세 결과 (JSON)');
  console.log('═'.repeat(70));
  console.log(JSON.stringify({
    summary: {
      iterations: ITERATIONS,
      totalTests: total,
      passed: totalPassed,
      failed: total - totalPassed,
      successRate: (totalPassed / total * 100).toFixed(1) + '%',
      categoryAPass,
      categoryBPass
    },
    byCategory: {
      A: results.categoryA,
      B: results.categoryB
    },
    bugValidation: results.bugValidation,
    symmetryTests: results.symmetryTests,
    errors: results.errors.slice(0, 10)
  }, null, 2));
}

// 메인 실행
async function main() {
  console.log('🚀 AR/CRS 이력 도구 5종 100회 반복 정밀 테스트');
  console.log('═'.repeat(70));
  console.log(`MCP Server: ${MCP_URL}`);
  console.log(`User ID: ${USER_ID}`);
  console.log(`반복 횟수: ${ITERATIONS}`);

  // 서버 헬스체크
  try {
    const health = await fetch(MCP_URL + '/health');
    const data = await health.json();
    console.log(`서버 상태: ${data.status}`);
  } catch (e) {
    console.log(`❌ 서버 연결 실패: ${e.message}`);
    return;
  }

  // Phase 1: 테스트 데이터 수집
  const dataReady = await collectTestData();
  if (!dataReady) {
    console.log('❌ 테스트 데이터 수집 실패');
    return;
  }

  // 테스트 케이스 생성
  const testCases = generateTestCases();

  // Phase 2: 100회 반복 테스트
  await runIterationTests(testCases);

  // Phase 3: 버그 검증
  await validateBugs(testCases);

  // Phase 4: 대칭성 테스트
  await runSymmetryTests(testCases);

  // 결과 리포트 생성
  generateReport();
}

main().catch(console.error);
