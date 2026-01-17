/**
 * MCP 도구 빠른 스트레스 테스트
 * 실행: node quick-stress-test.mjs
 */

const MCP_URL = process.env.MCP_URL || 'http://100.110.215.65:3011';
const USER_ID = process.env.USER_ID || '000000000000000000000001';
const ITERATIONS = parseInt(process.env.ITERATIONS || '20', 10);

async function callTool(tool, args, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

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
    // HTTP 모드 응답 구조: { success, result: { content, isError } }
    if (data.result) {
      return data.result;
    }
    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    return { isError: true, content: [{ text: e.message }] };
  }
}

// 테스트 케이스 정의
const categoryATests = [
  { tool: 'search_customers', args: {}, name: '고객 전체조회' },
  { tool: 'search_customers', args: { query: '홍' }, name: '고객 이름검색' },
  { tool: 'search_customers', args: { customerType: '개인' }, name: '고객 유형필터' },
  { tool: 'list_deleted_customers', args: {}, name: '삭제 고객 조회' },
  { tool: 'check_customer_name', args: { name: '없는고객_' + Date.now() }, name: '고객명 중복체크' },
  { tool: 'list_contracts', args: {}, name: '계약 전체조회' },
  { tool: 'list_contracts', args: { limit: 5 }, name: '계약 limit' },
  { tool: 'search_products', args: {}, name: '상품 전체조회' },
  { tool: 'search_products', args: { query: '종신' }, name: '상품 키워드' },
  { tool: 'get_search_analytics', args: { days: 7 }, name: '검색분석 7일' },
  { tool: 'get_failed_queries', args: {}, name: '실패쿼리 조회' },
  { tool: 'get_storage_info', args: {}, name: '저장소 정보' },
  { tool: 'list_notices', args: {}, name: '공지사항 조회' },
  { tool: 'list_faqs', args: {}, name: 'FAQ 조회' },
  { tool: 'list_usage_guides', args: {}, name: '가이드 조회' },
  { tool: 'find_birthday_customers', args: { month: 1 }, name: '1월 생일고객' },
  { tool: 'get_ar_queue_status', args: {}, name: 'AR 큐 상태' },
  // list_relationships는 customerId 필수 - 별도 테스트 필요
];

const categoryCTests = [
  { tool: 'search_address', args: { keyword: '강남대로' }, name: '주소검색', timeout: 10000 },
  { tool: 'unified_search', args: { query: '보험' }, name: '통합검색', timeout: 30000 },
  { tool: 'search_documents_semantic', args: { query: '계약서', mode: 'keyword' }, name: '시맨틱검색', timeout: 30000 },
];

async function runStressTest() {
  console.log(`🚀 MCP 도구 스트레스 테스트 시작 (${ITERATIONS}회 반복)`);
  console.log('='.repeat(60));
  console.log(`MCP Server: ${MCP_URL}`);
  console.log(`User ID: ${USER_ID}`);

  // 서버 헬스체크
  try {
    const health = await fetch(MCP_URL + '/health');
    const data = await health.json();
    console.log(`서버 상태: ${data.status}`);
  } catch (e) {
    console.log(`❌ 서버 연결 실패: ${e.message}`);
    return;
  }

  const results = {
    categoryA: { passed: 0, failed: 0 },
    categoryC: { passed: 0, failed: 0 },
    byTool: {},
    errors: []
  };

  // Category A 테스트
  console.log(`\n📗 Category A: 읽기 전용 (${categoryATests.length}개 × ${ITERATIONS}회)`);
  console.log('-'.repeat(60));

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`  [${i}/${ITERATIONS}] `);
    let passed = 0, failed = 0;

    for (const test of categoryATests) {
      const result = await callTool(test.tool, test.args);
      const key = `${test.tool}:${test.name}`;
      if (!results.byTool[key]) results.byTool[key] = { passed: 0, failed: 0, errors: [] };

      if (!result.isError) {
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
          results.errors.push({ tool: test.tool, test: test.name, error: errMsg });
        }
      }
    }
    console.log(`✅${passed} ❌${failed}`);
  }

  // Category C 테스트
  console.log(`\n📙 Category C: 외부 API (${categoryCTests.length}개 × ${ITERATIONS}회)`);
  console.log('-'.repeat(60));

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`  [${i}/${ITERATIONS}] `);
    let passed = 0, failed = 0;

    for (const test of categoryCTests) {
      const result = await callTool(test.tool, test.args, test.timeout || 30000);
      const key = `${test.tool}:${test.name}`;
      if (!results.byTool[key]) results.byTool[key] = { passed: 0, failed: 0, errors: [] };

      if (!result.isError) {
        results.categoryC.passed++;
        results.byTool[key].passed++;
        passed++;
      } else {
        results.categoryC.failed++;
        results.byTool[key].failed++;
        failed++;
        const errMsg = result.content?.[0]?.text || 'Unknown error';
        if (!results.byTool[key].errors.includes(errMsg)) {
          results.byTool[key].errors.push(errMsg);
          results.errors.push({ tool: test.tool, test: test.name, error: errMsg });
        }
      }
    }
    console.log(`✅${passed} ❌${failed}`);
  }

  // 버그 수정 검증: submit_search_feedback
  console.log(`\n📋 submit_search_feedback 버그 수정 검증`);
  console.log('-'.repeat(60));

  // 먼저 시맨틱 검색으로 logId 획득
  const searchResult = await callTool('search_documents_semantic', { query: '보험', mode: 'semantic' }, 30000);
  let logId = null;

  if (!searchResult.isError) {
    try {
      const searchData = JSON.parse(searchResult.content[0].text);
      logId = searchData.logId;
      console.log(`  시맨틱 검색: ${logId ? '✅ logId=' + logId : '⚠️ logId 없음 (keyword 모드일 수 있음)'}`);
    } catch (e) {
      console.log(`  시맨틱 검색 응답 파싱 실패: ${e.message}`);
    }
  } else {
    console.log(`  시맨틱 검색 실패: ${searchResult.content[0].text.substring(0, 60)}`);
  }

  if (logId) {
    const feedbackResult = await callTool('submit_search_feedback', {
      logId: logId,
      rating: 5,
      comment: '스트레스 테스트 자동 피드백'
    });

    if (!feedbackResult.isError) {
      console.log(`  피드백 제출: ✅ 성공 (버그 수정 확인됨)`);
    } else {
      console.log(`  피드백 제출: ❌ ${feedbackResult.content[0].text.substring(0, 80)}`);
      results.errors.push({ tool: 'submit_search_feedback', test: '피드백 제출', error: feedbackResult.content[0].text });
    }
  } else {
    console.log(`  피드백 제출: ⏭️ 스킵 (logId 필요)`);
  }

  // 결과 요약
  const totalTests = results.categoryA.passed + results.categoryA.failed +
                     results.categoryC.passed + results.categoryC.failed;
  const totalPassed = results.categoryA.passed + results.categoryC.passed;
  const totalFailed = results.categoryA.failed + results.categoryC.failed;

  console.log('\n' + '='.repeat(60));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(60));
  console.log(`총 테스트: ${totalTests} (${ITERATIONS}회 반복)`);
  console.log(`성공률: ${(totalPassed / totalTests * 100).toFixed(1)}%`);
  console.log(`  - Category A (읽기): ${results.categoryA.passed}/${results.categoryA.passed + results.categoryA.failed}`);
  console.log(`  - Category C (외부): ${results.categoryC.passed}/${results.categoryC.passed + results.categoryC.failed}`);

  // 실패한 도구
  const failedTools = Object.entries(results.byTool).filter(([, v]) => v.failed > 0);
  if (failedTools.length > 0) {
    console.log('\n❌ 실패한 도구:');
    for (const [name, stats] of failedTools) {
      console.log(`  - ${name}: ${stats.failed}회 실패`);
      for (const err of stats.errors.slice(0, 2)) {
        console.log(`    └ ${err.substring(0, 70)}...`);
      }
    }
  } else {
    console.log('\n✅ 모든 도구 정상 동작!');
  }

  // JSON 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('📁 상세 결과 (JSON)');
  console.log('='.repeat(60));
  console.log(JSON.stringify({
    summary: {
      iterations: ITERATIONS,
      totalTests,
      passed: totalPassed,
      failed: totalFailed,
      successRate: (totalPassed / totalTests * 100).toFixed(1) + '%'
    },
    byCategory: {
      A: results.categoryA,
      C: results.categoryC
    },
    failedTools: failedTools.map(([name, stats]) => ({
      name,
      failures: stats.failed,
      errors: stats.errors
    })),
    allErrors: results.errors
  }, null, 2));
}

runStressTest().catch(console.error);
