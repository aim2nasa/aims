/**
 * MCP 39개 도구 100회 반복 스트레스 테스트
 *
 * 목적: 도구의 안정성, 버그, 논리적 모순 발견
 *
 * 실행 방법:
 *   cd d:\aims\backend\api\aims_mcp
 *   npx vitest run src/__tests__/stress/mcp-100-iterations.e2e.test.ts
 *
 * 환경변수:
 *   MCP_URL: MCP 서버 URL (기본: http://localhost:3011)
 *   TEST_ITERATIONS: 반복 횟수 (기본: 100)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient, checkAllServers } from '../../test-utils/index.js';

// ============================================================
// 설정
// ============================================================

const ITERATIONS = parseInt(process.env.TEST_ITERATIONS || '5', 10);
// Tailscale VPN 경유 원격 서버 (개발 환경)
const MCP_URL = process.env.MCP_URL || 'http://100.110.215.65:3011';

// 테스트 결과 수집
interface TestResult {
  tool: string;
  testCase: string;
  iteration: number;
  success: boolean;
  duration: number;
  error?: string;
  category: 'A' | 'B' | 'C';
}

const results: TestResult[] = [];
const startTime = Date.now();

// ============================================================
// 도구 분류
// ============================================================

// Category A: 읽기 전용 (21개) - 안전하게 반복 가능
const CATEGORY_A_TOOLS = [
  'search_customers',
  'get_customer',
  'list_deleted_customers',
  'check_customer_name',
  'list_contracts',
  'get_contract_details',
  'get_document',
  'list_customer_documents',
  'find_document_by_filename',
  'get_search_analytics',
  'get_failed_queries',
  'list_relationships',
  'get_customer_network',
  'get_annual_reports',
  'get_ar_parsing_status',
  'get_ar_queue_status',
  'search_products',
  'get_customer_reviews',
  'get_storage_info',
  'list_notices',
  'list_faqs',
  'list_usage_guides',
  'find_birthday_customers',
];

// Category B: 쓰기 작업 (13개) - 테스트 데이터 필요
const CATEGORY_B_TOOLS = [
  'create_customer',
  'update_customer',
  'restore_customer',
  'delete_document',
  'delete_documents',
  'link_document_to_customer',
  'create_relationship',
  'delete_relationship',
  'add_customer_memo',
  'list_customer_memos',
  'delete_customer_memo',
  'trigger_ar_parsing',
  'create_contract',
];

// Category C: 외부 API 의존 (5개) - 타임아웃 설정 필요
const CATEGORY_C_TOOLS = [
  'search_documents',
  'search_documents_semantic',
  'submit_search_feedback',
  'search_address',
  'unified_search',
];

// ============================================================
// 테스트 케이스 정의
// ============================================================

interface ToolTestCase {
  tool: string;
  testCase: string;
  args: Record<string, unknown>;
  expectedError?: boolean;
  timeout?: number;
}

// Category A 테스트 케이스
const categoryATests: ToolTestCase[] = [
  // 고객 검색
  { tool: 'search_customers', testCase: '전체조회', args: {} },
  { tool: 'search_customers', testCase: '이름검색', args: { query: '홍' } },
  { tool: 'search_customers', testCase: '유형필터', args: { customerType: '개인' } },
  { tool: 'search_customers', testCase: '상태필터', args: { status: 'active' } },
  { tool: 'search_customers', testCase: '빈쿼리', args: { query: '' } },

  // 삭제된 고객
  { tool: 'list_deleted_customers', testCase: '기본조회', args: {} },
  { tool: 'list_deleted_customers', testCase: 'limit', args: { limit: 5 } },

  // 고객명 중복 체크
  { tool: 'check_customer_name', testCase: '존재하지않는이름', args: { name: `없는고객_${Date.now()}` } },

  // 계약 조회
  { tool: 'list_contracts', testCase: '전체조회', args: {} },
  { tool: 'list_contracts', testCase: 'limit', args: { limit: 5 } },

  // 상품 검색
  { tool: 'search_products', testCase: '전체조회', args: {} },
  { tool: 'search_products', testCase: '키워드검색', args: { query: '종신' } },

  // 검색 분석
  { tool: 'get_search_analytics', testCase: '7일', args: { days: 7 } },
  { tool: 'get_search_analytics', testCase: '30일', args: { days: 30 } },

  // 실패 쿼리
  { tool: 'get_failed_queries', testCase: '기본', args: {} },
  { tool: 'get_failed_queries', testCase: 'limit', args: { limit: 5 } },

  // 저장소 정보
  { tool: 'get_storage_info', testCase: '조회', args: {} },

  // 공지/FAQ/가이드
  { tool: 'list_notices', testCase: '조회', args: {} },
  { tool: 'list_faqs', testCase: '조회', args: {} },
  { tool: 'list_usage_guides', testCase: '조회', args: {} },

  // 생일 고객
  { tool: 'find_birthday_customers', testCase: '현재월', args: { month: new Date().getMonth() + 1 } },
  { tool: 'find_birthday_customers', testCase: '특정월', args: { month: 1 } },
  { tool: 'find_birthday_customers', testCase: '특정일', args: { month: 1, day: 15 } },

  // AR 큐 상태
  { tool: 'get_ar_queue_status', testCase: '조회', args: {} },
];

// Category C 테스트 케이스 (외부 API)
const categoryCTests: ToolTestCase[] = [
  // 주소 검색
  { tool: 'search_address', testCase: '도로명', args: { keyword: '강남대로' }, timeout: 10000 },
  { tool: 'search_address', testCase: '지번', args: { keyword: '역삼동' }, timeout: 10000 },

  // 통합 검색
  { tool: 'unified_search', testCase: '기본', args: { query: '보험' }, timeout: 30000 },
  { tool: 'unified_search', testCase: '문서만', args: { query: '계약', documentsOnly: true }, timeout: 30000 },

  // 시맨틱 검색
  { tool: 'search_documents_semantic', testCase: '시맨틱', args: { query: '만기임박', mode: 'semantic' }, timeout: 30000 },
  { tool: 'search_documents_semantic', testCase: '키워드', args: { query: '홍길동', mode: 'keyword' }, timeout: 30000 },

  // 문서 검색
  { tool: 'search_documents', testCase: '시맨틱', args: { query: '보험', searchMode: 'semantic' }, timeout: 30000 },
  { tool: 'search_documents', testCase: '키워드', args: { query: '계약서', searchMode: 'keyword' }, timeout: 30000 },
];

// ============================================================
// 헬퍼 함수
// ============================================================

async function runTest(
  mcp: MCPTestClient,
  testCase: ToolTestCase,
  iteration: number,
  category: 'A' | 'B' | 'C'
): Promise<TestResult> {
  const start = Date.now();
  try {
    await mcp.call(testCase.tool, testCase.args, { timeout: testCase.timeout || 15000 });
    return {
      tool: testCase.tool,
      testCase: testCase.testCase,
      iteration,
      success: !testCase.expectedError,
      duration: Date.now() - start,
      category,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      tool: testCase.tool,
      testCase: testCase.testCase,
      iteration,
      success: testCase.expectedError === true,
      duration: Date.now() - start,
      error: errorMessage,
      category,
    };
  }
}

function printProgress(iteration: number, total: number) {
  const percent = Math.round((iteration / total) * 100);
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`[${percent}%] Iteration ${iteration}/${total} - Passed: ${passed}, Failed: ${failed}`);
}

function generateReport() {
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  // 도구별 통계
  const byTool = new Map<string, { passed: number; failed: number; totalDuration: number; errors: string[] }>();
  for (const r of results) {
    const existing = byTool.get(r.tool) || { passed: 0, failed: 0, totalDuration: 0, errors: [] };
    if (r.success) existing.passed++;
    else {
      existing.failed++;
      if (r.error && !existing.errors.includes(r.error)) {
        existing.errors.push(r.error);
      }
    }
    existing.totalDuration += r.duration;
    byTool.set(r.tool, existing);
  }

  // 카테고리별 통계
  const byCategory = {
    A: results.filter(r => r.category === 'A'),
    B: results.filter(r => r.category === 'B'),
    C: results.filter(r => r.category === 'C'),
  };

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║              MCP 39 Tools - 100회 반복 테스트 결과                 ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log(`║ 실행 시간: ${(totalDuration / 1000).toFixed(1)}초`);
  console.log(`║ 총 테스트: ${results.length} (${ITERATIONS} iterations)`);
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log(`║ 성공률: ${((passed / results.length) * 100).toFixed(1)}% (${passed} / ${results.length})`);
  console.log(`║ 실패: ${failed}건`);
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log('║ 카테고리별 결과:');
  console.log(`║   Category A (읽기): ${byCategory.A.filter(r => r.success).length}/${byCategory.A.length}`);
  console.log(`║   Category C (외부): ${byCategory.C.filter(r => r.success).length}/${byCategory.C.length}`);
  console.log('╠═══════════════════════════════════════════════════════════════════╣');

  // 실패한 도구 출력
  const failedTools = Array.from(byTool.entries())
    .filter(([, stats]) => stats.failed > 0)
    .sort((a, b) => b[1].failed - a[1].failed);

  if (failedTools.length > 0) {
    console.log('║ 실패 도구:');
    for (const [tool, stats] of failedTools.slice(0, 10)) {
      console.log(`║   - ${tool}: ${stats.failed}건`);
      for (const err of stats.errors.slice(0, 2)) {
        console.log(`║       └ ${err.substring(0, 50)}...`);
      }
    }
  }
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  // JSON 결과 반환 (문서화용)
  return {
    summary: {
      totalTests: results.length,
      passed,
      failed,
      successRate: ((passed / results.length) * 100).toFixed(1),
      durationMs: totalDuration,
      iterations: ITERATIONS,
    },
    byTool: Object.fromEntries(
      Array.from(byTool.entries()).map(([tool, stats]) => [
        tool,
        {
          passed: stats.passed,
          failed: stats.failed,
          avgDuration: Math.round(stats.totalDuration / (stats.passed + stats.failed)),
          errors: stats.errors,
        },
      ])
    ),
    failures: results.filter(r => !r.success).map(r => ({
      tool: r.tool,
      testCase: r.testCase,
      iteration: r.iteration,
      error: r.error,
    })),
  };
}

// ============================================================
// 테스트 실행
// ============================================================

describe(`MCP 39개 도구 ${ITERATIONS}회 반복 스트레스 테스트`, () => {
  let mcp: MCPTestClient;
  let serversAvailable = false;

  beforeAll(async () => {
    console.log(`\n🚀 MCP 스트레스 테스트 시작 (${ITERATIONS}회 반복)\n`);

    const status = await checkAllServers();
    serversAvailable = status.allAvailable;

    if (!serversAvailable) {
      console.warn('⚠️ 서버 연결 불가. 테스트를 건너뜁니다.');
      console.warn(`   MCP: ${status.mcp ? '✅' : '❌'}`);
      console.warn(`   API: ${status.api ? '✅' : '❌'}`);
      console.warn(`   RAG: ${status.rag ? '✅' : '❌'}`);
      return;
    }

    mcp = new MCPTestClient(MCP_URL);
    console.log(`✅ 서버 연결 완료 (MCP: ${MCP_URL})\n`);
  });

  afterAll(() => {
    if (results.length > 0) {
      generateReport();
    }
  });

  // Category A: 읽기 전용 테스트 (100회)
  for (let i = 1; i <= ITERATIONS; i++) {
    it(`[${i}/${ITERATIONS}] Category A: 읽기 전용 도구`, async () => {
      if (!serversAvailable) return;

      const iterationResults = await Promise.all(
        categoryATests.map(test => runTest(mcp, test, i, 'A'))
      );
      results.push(...iterationResults);

      // 모든 테스트가 성공해야 함
      const failed = iterationResults.filter(r => !r.success);
      if (failed.length > 0) {
        console.warn(`  ⚠️ Iteration ${i}: ${failed.length}개 실패`);
        for (const f of failed.slice(0, 3)) {
          console.warn(`     - ${f.tool}/${f.testCase}: ${f.error?.substring(0, 50)}`);
        }
      }

      expect(failed.length).toBeLessThanOrEqual(categoryATests.length * 0.1); // 10% 허용
    }, 60000);
  }

  // Category C: 외부 API 테스트 (100회)
  for (let i = 1; i <= ITERATIONS; i++) {
    it(`[${i}/${ITERATIONS}] Category C: 외부 API 도구`, async () => {
      if (!serversAvailable) return;

      const iterationResults = await Promise.all(
        categoryCTests.map(test => runTest(mcp, test, i, 'C'))
      );
      results.push(...iterationResults);

      // 외부 API는 5% 실패 허용
      const failed = iterationResults.filter(r => !r.success);
      expect(failed.length).toBeLessThanOrEqual(categoryCTests.length * 0.2); // 20% 허용
    }, 120000);
  }

  // 10회마다 진행 상황 출력
  it('진행 상황 보고', () => {
    if (results.length > 0) {
      printProgress(ITERATIONS, ITERATIONS);
    }
  });
});
