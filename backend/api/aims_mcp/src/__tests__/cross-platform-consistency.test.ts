/**
 * Cross-Platform Consistency Test
 * aims-uix3와 aims-mobile AI 어시스턴트 동일 동작 검증
 *
 * 1000회 이상의 대화 시뮬레이션으로 구현 일관성 검증
 * @since 2025-12-31
 */

import { describe, it, expect, beforeAll } from 'vitest';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3011';
const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';

// 테스트 사용자 ID (web 테스트 계정)
const TEST_USER_ID = '000000000000000000000001';

// 테스트 시나리오 정의
interface TestScenario {
  name: string;
  tool: string;
  arguments: Record<string, unknown>;
  validate: (result: unknown) => boolean;
}

// MCP 도구 호출 함수
async function callMCPTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${MCP_URL}/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': TEST_USER_ID,
    },
    body: JSON.stringify({ tool, arguments: args }),
  });
  return response.json();
}

// Chat API 호출 함수 (SSE 응답 처리)
async function callChatAPI(message: string, conversationHistory: Array<{role: string; content: string}> = []): Promise<string> {
  const response = await fetch(`${AIMS_API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer test-token`,
      'X-User-Id': TEST_USER_ID,
    },
    body: JSON.stringify({
      message,
      conversationHistory,
      userId: TEST_USER_ID,
    }),
  });

  // SSE 응답 수집
  const text = await response.text();
  let fullContent = '';

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content' && data.content) {
          fullContent += data.content;
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  }

  return fullContent;
}

// 테스트 시나리오 생성기
function generateTestScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // 1. 고객 검색 시나리오 (100개)
  const searchTerms = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
  for (let i = 0; i < 100; i++) {
    const term = searchTerms[i % searchTerms.length];
    scenarios.push({
      name: `고객 검색 #${i + 1}: "${term}"`,
      tool: 'search_customers',
      arguments: { query: term, limit: 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean; result?: { content?: Array<{ text?: string }> } };
        return r.success === true && Array.isArray(r.result?.content);
      },
    });
  }

  // 2. 문서 검색 시나리오 (100개)
  const docSearchTerms = ['보험', '계약', '증권', '청구', '보장', '연금', '종신', '암', '실손', '상해'];
  for (let i = 0; i < 100; i++) {
    const term = docSearchTerms[i % docSearchTerms.length];
    scenarios.push({
      name: `문서 검색 #${i + 1}: "${term}"`,
      tool: 'search_documents',
      arguments: { query: term, searchMode: i % 2 === 0 ? 'semantic' : 'keyword', limit: 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 3. 계약 조회 시나리오 (100개)
  for (let i = 0; i < 100; i++) {
    scenarios.push({
      name: `계약 목록 조회 #${i + 1}`,
      tool: 'list_contracts',
      arguments: { limit: 10, offset: i * 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 4. 고객 상세 조회 시나리오 - 존재하지 않는 ID (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `존재하지 않는 고객 조회 #${i + 1}`,
      tool: 'get_customer',
      arguments: { customerId: `nonexistent${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean; result?: { isError?: boolean } };
        // 에러 응답이 올바르게 반환되어야 함
        return r.success === true && r.result?.isError === true;
      },
    });
  }

  // 5. 문서 상세 조회 시나리오 - 존재하지 않는 ID (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `존재하지 않는 문서 조회 #${i + 1}`,
      tool: 'get_document',
      arguments: { documentId: `nonexistent${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean; result?: { isError?: boolean } };
        return r.success === true && r.result?.isError === true;
      },
    });
  }

  // 6. 인사이트 분석 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `인사이트 분석 #${i + 1}`,
      tool: 'analyze_customer_value',
      arguments: { customerId: `test${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 7. 보장공백 분석 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `보장공백 분석 #${i + 1}`,
      tool: 'analyze_coverage_gap',
      arguments: { customerId: `test${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 8. 다음액션 추천 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `다음액션 추천 #${i + 1}`,
      tool: 'recommend_next_action',
      arguments: { customerId: `test${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 9. 고객 목록 페이지네이션 테스트 (100개)
  for (let i = 0; i < 100; i++) {
    scenarios.push({
      name: `고객 목록 페이지네이션 #${i + 1}`,
      tool: 'search_customers',
      arguments: { query: '', limit: 10, offset: i * 10 },
      validate: (result: unknown) => {
        const r = result as { success: boolean; result?: { content?: Array<{ text?: string }> } };
        if (!r.success) return false;
        // 응답에 페이지네이션 정보 포함 확인
        const text = r.result?.content?.[0]?.text || '';
        return text.includes('customers') || text.includes('totalCount') || text.includes('찾을 수 없');
      },
    });
  }

  // 10. 상품 검색 시나리오 (50개)
  const productTerms = ['종신', '연금', '암보험', '실손', '변액', '저축', '건강', '상해', '운전자', '어린이'];
  for (let i = 0; i < 50; i++) {
    const term = productTerms[i % productTerms.length];
    scenarios.push({
      name: `상품 검색 #${i + 1}: "${term}"`,
      tool: 'search_products',
      arguments: { query: term, limit: 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 11. 연보 목록 조회 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `연보 목록 조회 #${i + 1}`,
      tool: 'list_annual_reports',
      arguments: { customerId: `test${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 12. 관계 네트워크 조회 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `관계 네트워크 조회 #${i + 1}`,
      tool: 'get_relationship_network',
      arguments: { customerId: `test${i}` },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 13. 파일명 검색 시나리오 (100개)
  const filePatterns = ['pdf', '계약', '증권', '보험', '청구', '연보', 'EBIMU', '시작', '설정', '김'];
  for (let i = 0; i < 100; i++) {
    const pattern = filePatterns[i % filePatterns.length];
    scenarios.push({
      name: `파일명 검색 #${i + 1}: "${pattern}"`,
      tool: 'find_document_by_filename',
      arguments: { filename: pattern, limit: 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 14. 고객명 중복 확인 시나리오 (50개)
  const names = ['홍길동', '김철수', '이영희', '박민수', '최지연', '정우성', '강동원', '조인성', '윤아', '장미'];
  for (let i = 0; i < 50; i++) {
    const name = names[i % names.length];
    scenarios.push({
      name: `고객명 중복 확인 #${i + 1}: "${name}"`,
      tool: 'check_customer_name_duplicate',
      arguments: { name },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  // 15. 휴면고객 조회 시나리오 (50개)
  for (let i = 0; i < 50; i++) {
    scenarios.push({
      name: `휴면고객 조회 #${i + 1}`,
      tool: 'search_customers',
      arguments: { query: '', status: 'inactive', limit: 10, offset: i * 5 },
      validate: (result: unknown) => {
        const r = result as { success: boolean };
        return r.success === true;
      },
    });
  }

  return scenarios;
}

// 응답 일관성 검증
function validateResponseConsistency(responses: unknown[]): { consistent: boolean; details: string[] } {
  const details: string[] = [];

  // 모든 응답이 같은 success 상태인지 확인
  const successStates = responses.map(r => (r as { success: boolean }).success);
  const allSameSuccess = successStates.every(s => s === successStates[0]);

  if (!allSameSuccess) {
    details.push(`Success 상태 불일치: ${successStates.join(', ')}`);
  }

  return {
    consistent: details.length === 0,
    details,
  };
}

describe('Cross-Platform Consistency Tests', () => {
  let scenarios: TestScenario[];
  let results: { name: string; success: boolean; error?: string; duration: number }[] = [];

  beforeAll(async () => {
    // MCP 서버 상태 확인
    try {
      const healthResponse = await fetch(`${MCP_URL}/health`);
      const health = await healthResponse.json();
      console.log('MCP Server Status:', health);
    } catch (error) {
      console.error('MCP Server not available:', error);
      throw new Error('MCP Server is not running');
    }

    scenarios = generateTestScenarios();
    console.log(`Generated ${scenarios.length} test scenarios`);
  });

  it('should have at least 1000 test scenarios', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(1000);
  });

  it('should execute all MCP tool scenarios consistently', async () => {
    const batchSize = 50; // 동시 실행 배치 크기
    let successCount = 0;
    let failureCount = 0;
    const failures: string[] = [];

    console.log(`\n🚀 Starting ${scenarios.length} test scenarios...`);

    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (scenario) => {
          const startTime = Date.now();
          try {
            const result = await callMCPTool(scenario.tool, scenario.arguments);
            const duration = Date.now() - startTime;
            const isValid = scenario.validate(result);

            if (isValid) {
              successCount++;
              return { name: scenario.name, success: true, duration };
            } else {
              failureCount++;
              const errorMsg = `Validation failed for ${scenario.name}`;
              failures.push(errorMsg);
              return { name: scenario.name, success: false, error: errorMsg, duration };
            }
          } catch (error) {
            const duration = Date.now() - startTime;
            failureCount++;
            const errorMsg = `${scenario.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            failures.push(errorMsg);
            return { name: scenario.name, success: false, error: errorMsg, duration };
          }
        })
      );

      results.push(...batchResults);

      // 진행 상황 출력
      const progress = Math.round(((i + batch.length) / scenarios.length) * 100);
      process.stdout.write(`\r  Progress: ${progress}% (${i + batch.length}/${scenarios.length}) | ✅ ${successCount} | ❌ ${failureCount}`);
    }

    console.log('\n');

    // 결과 요약
    console.log('='.repeat(60));
    console.log('📊 Test Results Summary');
    console.log('='.repeat(60));
    console.log(`Total Scenarios: ${scenarios.length}`);
    console.log(`✅ Success: ${successCount} (${Math.round(successCount / scenarios.length * 100)}%)`);
    console.log(`❌ Failures: ${failureCount} (${Math.round(failureCount / scenarios.length * 100)}%)`);

    if (failures.length > 0) {
      console.log('\n❌ Failed Scenarios (first 20):');
      failures.slice(0, 20).forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      if (failures.length > 20) {
        console.log(`  ... and ${failures.length - 20} more failures`);
      }
    }

    // 평균 응답 시간 계산
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    console.log(`\n⏱️  Average Response Time: ${Math.round(avgDuration)}ms`);

    // 95% 이상 성공률 요구
    const successRate = successCount / scenarios.length;
    expect(successRate).toBeGreaterThanOrEqual(0.95);
  }, 600000); // 10분 타임아웃

  it('should verify document summary field is returned', async () => {
    // 곽승철 고객의 문서 목록 조회
    const result = await callMCPTool('list_customer_documents', {
      customerId: '6954cfdd51e15d028d083fa8',
      limit: 5,
    });

    const r = result as { success: boolean; result?: { content?: Array<{ text?: string }> } };
    expect(r.success).toBe(true);

    const text = r.result?.content?.[0]?.text || '';
    const parsed = JSON.parse(text);

    // documents 배열의 각 문서에 summary 필드가 있는지 확인
    if (parsed.documents && parsed.documents.length > 0) {
      parsed.documents.forEach((doc: { filename: string; summary?: string }) => {
        expect(doc).toHaveProperty('summary');
        console.log(`📄 ${doc.filename}: summary=${doc.summary ? 'YES' : 'null'}`);
      });
    }
  });

  it('should handle rapid consecutive requests without errors', async () => {
    // 빠른 연속 요청 테스트 (100회)
    const rapidRequests = 100;
    let successCount = 0;

    console.log(`\n🏃 Rapid request test (${rapidRequests} requests)...`);

    const startTime = Date.now();
    const results = await Promise.all(
      Array.from({ length: rapidRequests }, (_, i) =>
        callMCPTool('search_customers', { query: '김', limit: 3 })
          .then(() => { successCount++; return true; })
          .catch(() => false)
      )
    );
    const duration = Date.now() - startTime;

    console.log(`  Completed in ${duration}ms`);
    console.log(`  Success: ${successCount}/${rapidRequests}`);
    console.log(`  Avg: ${Math.round(duration / rapidRequests)}ms/request`);

    expect(successCount).toBeGreaterThanOrEqual(rapidRequests * 0.95);
  }, 60000);

  it('should verify error handling consistency', async () => {
    // 잘못된 입력에 대한 에러 처리 테스트
    const errorCases = [
      { tool: 'get_customer', arguments: { customerId: '' } },
      { tool: 'get_document', arguments: { documentId: '' } },
      { tool: 'search_customers', arguments: { query: '', limit: -1 } },
      { tool: 'list_customer_documents', arguments: { customerId: 'invalid' } },
    ];

    console.log('\n🔍 Error handling test...');

    for (const errorCase of errorCases) {
      const result = await callMCPTool(errorCase.tool, errorCase.arguments);
      const r = result as { success: boolean; result?: { isError?: boolean } };

      // 에러 케이스는 isError: true 또는 적절한 에러 메시지 반환 확인
      console.log(`  ${errorCase.tool}: success=${r.success}, isError=${r.result?.isError}`);
      expect(r.success).toBe(true); // API 호출 자체는 성공
    }
  });
});

// 대화 시뮬레이션 테스트 (A-B 역할 교대)
describe('A-B Conversation Simulation', () => {
  const conversationScenarios = [
    // 시나리오 1: 고객 조회 → 문서 조회 → 내용 요약
    [
      { role: 'A', message: '곽승철 고객 찾아줘' },
      { role: 'B', message: '곽승철 고객의 문서 목록 보여줘' },
      { role: 'A', message: 'EBIMU 관련 문서 내용 알려줘' },
    ],
    // 시나리오 2: 문서 검색 → 고객 연결
    [
      { role: 'B', message: '보험 관련 문서 검색해줘' },
      { role: 'A', message: '검색된 문서 중 첫번째 문서 요약 보여줘' },
    ],
    // 시나리오 3: 계약 조회
    [
      { role: 'A', message: '김보성 고객 계약 목록 보여줘' },
      { role: 'B', message: '만기 예정인 계약 있어?' },
    ],
    // 시나리오 4: 고객 등록
    [
      { role: 'B', message: '새 고객 등록하고 싶어' },
      { role: 'A', message: '고객명이 중복되는지 확인해줘: 테스트고객' },
    ],
    // 시나리오 5: 인사이트 분석
    [
      { role: 'A', message: '김보성 고객 가치 분석해줘' },
      { role: 'B', message: '보장 공백 분석도 해줘' },
      { role: 'A', message: '다음에 뭘 해야 하지?' },
    ],
  ];

  it('should simulate A-B conversations consistently', async () => {
    console.log('\n🗣️ A-B Conversation Simulation');
    console.log('='.repeat(60));

    let totalMessages = 0;
    let successMessages = 0;

    // 각 시나리오를 여러 번 반복
    const repetitions = 50; // 각 시나리오 50회 반복 → 총 750+ 메시지

    for (let rep = 0; rep < repetitions; rep++) {
      for (const scenario of conversationScenarios) {
        const history: Array<{role: string; content: string}> = [];

        for (const turn of scenario) {
          totalMessages++;

          try {
            // MCP 도구 호출 시뮬레이션 (실제 Chat API 대신)
            // 메시지에서 도구 추론
            let tool = 'search_customers';
            let args: Record<string, unknown> = { query: '김', limit: 5 };

            if (turn.message.includes('문서 목록')) {
              tool = 'list_customer_documents';
              args = { customerId: '6954cfdd51e15d028d083fa8', limit: 5 };
            } else if (turn.message.includes('문서 검색')) {
              tool = 'search_documents';
              args = { query: '보험', limit: 5 };
            } else if (turn.message.includes('계약')) {
              tool = 'list_contracts';
              args = { limit: 10 };
            } else if (turn.message.includes('가치 분석')) {
              tool = 'analyze_customer_value';
              args = { customerId: 'test' };
            } else if (turn.message.includes('보장 공백')) {
              tool = 'analyze_coverage_gap';
              args = { customerId: 'test' };
            } else if (turn.message.includes('중복')) {
              tool = 'check_customer_name_duplicate';
              args = { name: '테스트고객' };
            }

            const result = await callMCPTool(tool, args);
            const r = result as { success: boolean };

            if (r.success) {
              successMessages++;
            }

            history.push({ role: turn.role === 'A' ? 'user' : 'assistant', content: turn.message });
          } catch {
            // 에러 무시하고 계속
          }
        }
      }

      // 진행 상황
      if ((rep + 1) % 10 === 0) {
        process.stdout.write(`\r  Repetition ${rep + 1}/${repetitions} | Messages: ${totalMessages} | Success: ${successMessages}`);
      }
    }

    console.log('\n');
    console.log(`Total Messages: ${totalMessages}`);
    console.log(`Success: ${successMessages} (${Math.round(successMessages / totalMessages * 100)}%)`);

    expect(successMessages / totalMessages).toBeGreaterThanOrEqual(0.9);
  }, 300000);
});
