/**
 * 페이지네이션 "다음 페이지" 응답 패턴 테스트
 *
 * AI 어시스턴트가 다양한 사용자 응답에 대해 올바르게 다음 페이지를 조회하는지 검증합니다.
 *
 * 검증 항목:
 * 1. 도구 호출 여부: 사용자가 긍정 응답 시 반드시 도구를 호출하는가?
 * 2. 올바른 도구 선택: unified_search 대신 동일한 도구를 사용하는가?
 * 3. offset 증가: 페이지네이션 파라미터가 올바르게 증가하는가?
 * 4. 컨텍스트 유지: customerId, search 파라미터 등이 유지되는가?
 *
 * 테스트 케이스 (총 50+ 패턴):
 * - 한글 기본: "응", "네", "예", "ㅇㅇ", "ㅇ", "어", "응응", "웅"
 * - 한글 긍정: "그래", "좋아", "알았어", "그래요", "좋아요", "알겠어요"
 * - 한글 명령: "더 보여줘", "계속", "다음", "다음 페이지", "더", "보여줘"
 * - 한글 속어: "ㄱㄱ", "고고", "넹", "넵", "ㅋㅋ"
 * - 영문 기본: "yes", "y", "ok", "okay", "sure", "yep", "yeah", "yup"
 * - 영문 명령: "more", "next", "continue", "next page", "show more"
 * - 혼합: "ㅇㅋ", "ok요", "넵 보여주세요", "응 다음"
 *
 * 환경변수:
 *   OPENAI_API_KEY - OpenAI API 키 (필수)
 *   MCP_URL - MCP 서버 URL (기본: http://localhost:3011)
 *
 * 실행:
 *   OPENAI_API_KEY=sk-xxx npm run test:conversation
 *   OPENAI_API_KEY=sk-xxx MCP_URL=http://tars.giize.com:3011 npm run test:conversation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ============================================================
// 설정
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MCP_URL = process.env.MCP_URL || 'http://localhost:3011';
const TEST_USER_ID = '694737cb86f39e50b456686b'; // 실제 존재하는 사용자 ID
const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 60000;

// 테스트 통계
const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  wrongTool: 0,
  details: [] as { pattern: string; result: string; tool?: string; offset?: number }[]
};

// ============================================================
// 타입 정의
// ============================================================

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface PaginationTestResult {
  firstPageTools: ToolCall[];
  secondPageTools: ToolCall[];
  firstResponse: string;
  secondResponse: string;
  success: boolean;
  firstOffset: number;
  secondOffset: number;
  usedUnifiedSearch: boolean;
}

// ============================================================
// 헬퍼 함수
// ============================================================

async function checkMCPHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MCP_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function getMCPTools(): Promise<MCPToolDefinition[]> {
  const res = await fetch(`${MCP_URL}/tools`, {
    headers: { 'x-user-id': TEST_USER_ID },
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json();
  return data.tools || [];
}

async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${MCP_URL}/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': TEST_USER_ID
    },
    body: JSON.stringify({ tool: toolName, arguments: args }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'MCP call failed');
  }
  const text = data.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : data.result;
}

function convertToOpenAIFunctions(mcpTools: MCPToolDefinition[]): OpenAIFunction[] {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.inputSchema.type || 'object',
      properties: tool.inputSchema.properties || {},
      required: tool.inputSchema.required || []
    }
  }));
}

async function callOpenAI(
  messages: OpenAIMessage[],
  functions: OpenAIFunction[]
): Promise<{ message: OpenAIMessage; usage: { total_tokens: number } }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: functions.map(f => ({ type: 'function', function: f })),
      tool_choice: 'auto'
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return {
    message: data.choices[0].message,
    usage: data.usage
  };
}

function getSystemPrompt(): string {
  return `당신은 AIMS(보험 설계사 지능형 관리 시스템)의 AI 어시스턴트입니다.

## 목록 조회 규칙 (페이지네이션)
- 고객/계약/문서 목록 조회 시 한 번에 최대 10개만 표시합니다.
- **🔴 hasMore 필드를 반드시 확인하세요!**
  - hasMore=true → "다음 페이지를 보시겠습니까?" 물어보기
  - hasMore=false → "모든 데이터를 보셨습니다" 가능
  - **🚨 hasMore=true인데 "모든 문서/고객/계약을 보셨습니다"라고 하면 안 됩니다!**

## 🚨🚨🚨 다음 페이지 요청 - 절대 규칙 (CRITICAL!) 🚨🚨🚨
**사용자가 "응", "네", "예", "ㅇㅇ", "더 보여줘", "계속", "다음" 등으로 응답하면:**
1. **반드시 도구(list_contracts, search_customers 등)를 다시 호출해야 합니다.**
2. **이전 조회와 동일한 파라미터(search, customerId 등)를 유지하고, offset만 증가시킵니다.**
3. **절대로 "더 이상 없습니다", "추가 정보가 없습니다" 등으로 응답하면 안 됩니다!**
4. **도구를 호출하지 않고 응답하는 것은 금지입니다!**

## 🚨🚨🚨 페이지네이션 응답 형식 규칙 (CRITICAL!) 🚨🚨🚨
**hasMore=true일 때 반드시 아래 형식으로 응답하세요:**

1. **고객 문서 목록**: 응답 첫 줄에 고객명과 ID를 함께 표시
   형식: "**고객명**(ID:고객ID)의 문서 N건 중 X-Y번입니다."
   예시: "**캐치업코리아**(ID:6947f716ea0d306a0ac63b61)의 문서 25건 중 1-10번입니다."

2. **고객 목록**: 전체 수와 페이지 표시
   형식: "전체 N명 (개인 X명, 법인 Y명) | 1/P 페이지 (10개씩)"

**🔴 반드시 (ID:xxx) 형태로 고객 ID를 응답에 포함하세요!**
사용자가 "응"이라고 하면, 이전 응답에서 "(ID:xxx)" 패턴을 찾아서 다음 페이지를 조회해야 합니다.

**🔴 다음 페이지 요청 처리 (사용자가 "응", "더 보여줘" 등 응답 시):**
- 이전 응답에서 "(ID:xxx)" 패턴을 찾아 customerId로 사용
- 이전에 보여준 범위(X-Y번)를 확인하여 다음 offset 계산
- **⛔ unified_search 절대 사용 금지!** 반드시 동일한 도구(list_customer_documents 등)를 사용
- **⛔ 새로운 고객 검색(search_customers) 금지!** 이전 응답의 ID를 그대로 사용`;
}

/**
 * 멀티턴 대화 실행 - 첫 번째 페이지 조회 후 다음 페이지 요청
 */
async function runPaginationConversation(
  initialQuery: string,
  nextPageResponse: string,
  functions: OpenAIFunction[]
): Promise<PaginationTestResult> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: initialQuery }
  ];

  const firstPageTools: ToolCall[] = [];
  const secondPageTools: ToolCall[] = [];
  let firstResponse = '';
  let secondResponse = '';

  // === 첫 번째 페이지 조회 ===
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const { message } = await callOpenAI(messages, functions);
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      firstResponse = message.content || '';
      break;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      firstPageTools.push({ name: toolName, arguments: toolArgs });

      try {
        const result = await callMCPTool(toolName, toolArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: String(error) })
        });
      }
    }
  }

  // === 두 번째 페이지 요청 (사용자 응답) ===
  messages.push({ role: 'user', content: nextPageResponse });

  iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const { message } = await callOpenAI(messages, functions);
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      secondResponse = message.content || '';
      break;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      secondPageTools.push({ name: toolName, arguments: toolArgs });

      try {
        const result = await callMCPTool(toolName, toolArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: String(error) })
        });
      }
    }
  }

  // 결과 분석
  const firstOffset = Number(firstPageTools[0]?.arguments?.offset) || 0;
  const secondOffset = Number(secondPageTools[0]?.arguments?.offset) || 0;
  const usedUnifiedSearch = secondPageTools.some(t => t.name === 'unified_search');
  const success = secondPageTools.length > 0 && !usedUnifiedSearch;

  return {
    firstPageTools,
    secondPageTools,
    firstResponse,
    secondResponse,
    success,
    firstOffset,
    secondOffset,
    usedUnifiedSearch
  };
}

// ============================================================
// 테스트할 다양한 응답 패턴 (총 50+ 패턴)
// ============================================================

const POSITIVE_RESPONSES = {
  // 한글 기본 응답 (8개)
  korean_basic: ['응', '네', '예', 'ㅇㅇ', 'ㅇ', '어', '응응', '웅'],

  // 한글 긍정 표현 (8개)
  korean_positive: ['그래', '좋아', '알았어', '그래요', '좋아요', '알겠어요', '알겠습니다', '그럼'],

  // 한글 명령형 (10개)
  korean_command: ['더 보여줘', '계속', '다음', '다음 페이지', '더', '보여줘', '다음꺼', '다음거', '이어서', '나머지'],

  // 한글 줄임말/속어 (8개)
  korean_slang: ['ㄱㄱ', '고고', '넹', '넵', 'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ', '욕'],

  // 영문 기본 응답 (9개)
  english_basic: ['yes', 'y', 'ok', 'okay', 'OK', 'sure', 'yep', 'yeah', 'yup'],

  // 영문 명령형 (7개)
  english_command: ['more', 'next', 'continue', 'next page', 'show more', 'keep going', 'go on'],

  // 혼합 응답 (6개)
  mixed: ['ㅇㅋ', 'ㅇㅋㅇㅋ', 'ok요', '넵 보여주세요', '응 다음', 'yes 보여줘'],

  // 간단한 동의 표현 (5개)
  simple_agreement: ['부탁해', '부탁드려요', '보고 싶어', '궁금해', '보여주세요']
};

const NEGATIVE_RESPONSES = ['아니', '아니요', '됐어', '그만', 'no', 'nope', 'stop', '필요없어'];

// 핵심 응답 패턴 (빠른 테스트용)
const CORE_RESPONSES = ['응', 'ㅇㅇ', '네', '예', 'yes', 'y', 'ok', '더 보여줘', '계속', '다음', 'next', 'more'];

// ============================================================
// 테스트 실행
// ============================================================

describe('페이지네이션 다음 페이지 응답 패턴 테스트', () => {
  let serverAvailable = false;
  let apiKeyAvailable = false;
  let openAIFunctions: OpenAIFunction[] = [];

  beforeAll(async () => {
    apiKeyAvailable = !!OPENAI_API_KEY;
    if (!apiKeyAvailable) {
      console.warn('⚠️ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
      console.warn('   테스트 실행: OPENAI_API_KEY=sk-xxx npm run test:conversation');
      return;
    }

    serverAvailable = await checkMCPHealth();
    if (!serverAvailable) {
      console.warn(`⚠️ MCP 서버 (${MCP_URL})에 연결할 수 없습니다.`);
      console.warn('   서버 상태 확인: curl ' + MCP_URL + '/health');
      return;
    }

    const mcpTools = await getMCPTools();
    openAIFunctions = convertToOpenAIFunctions(mcpTools);
    console.log(`✅ 환경 준비 완료`);
    console.log(`   - MCP 서버: ${MCP_URL}`);
    console.log(`   - 도구 로드: ${openAIFunctions.length}개`);
    console.log(`   - 테스트 사용자: ${TEST_USER_ID}`);
  }, 30000);

  afterAll(() => {
    if (testStats.total > 0) {
      console.log('\n');
      console.log('═'.repeat(60));
      console.log('📊 페이지네이션 응답 패턴 테스트 최종 결과');
      console.log('═'.repeat(60));
      console.log(`총 테스트: ${testStats.total}개`);
      console.log(`✅ 성공: ${testStats.passed}개 (${Math.round(testStats.passed / testStats.total * 100)}%)`);
      console.log(`❌ 실패: ${testStats.failed}개`);
      console.log(`⚠️ 잘못된 도구 사용: ${testStats.wrongTool}개`);
      console.log(`⏭️ 스킵: ${testStats.skipped}개`);
      console.log('═'.repeat(60));

      if (testStats.failed > 0) {
        console.log('\n실패한 패턴:');
        testStats.details
          .filter(d => d.result === 'failed')
          .forEach(d => console.log(`  - "${d.pattern}"`));
      }

      if (testStats.wrongTool > 0) {
        console.log('\n잘못된 도구를 사용한 패턴:');
        testStats.details
          .filter(d => d.result === 'wrong_tool')
          .forEach(d => console.log(`  - "${d.pattern}" → ${d.tool}`));
      }
    }
  });

  // ============================================================
  // 1. 핵심 응답 패턴 테스트 (가장 중요)
  // ============================================================
  describe('핵심 응답 패턴 (Core Responses)', () => {
    for (const response of CORE_RESPONSES) {
      it(`"${response}" → 도구 호출 및 offset 증가`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          console.log('테스트 스킵');
          return;
        }

        const result = await runPaginationConversation(
          '고객 목록 보여줘',
          response,
          openAIFunctions
        );

        // 검증 1: 도구 호출 여부
        expect(result.secondPageTools.length, `"${response}" 응답 시 도구가 호출되어야 합니다`).toBeGreaterThan(0);

        // 검증 2: unified_search 사용 금지
        if (result.usedUnifiedSearch) {
          testStats.wrongTool++;
          testStats.details.push({ pattern: response, result: 'wrong_tool', tool: 'unified_search' });
        }
        expect(result.usedUnifiedSearch, 'unified_search는 사용하면 안 됩니다').toBe(false);

        // 검증 3: offset 증가
        if (result.secondPageTools.length > 0 && 'offset' in result.secondPageTools[0].arguments) {
          expect(result.secondOffset, 'offset이 증가해야 합니다').toBeGreaterThan(0);
        }

        // 검증 4: 올바른 도구 사용
        const validTools = ['search_customers', 'list_contracts', 'list_customer_documents', 'get_customer'];
        const usedValidTool = result.secondPageTools.some(t => validTools.includes(t.name));
        expect(usedValidTool, `올바른 도구(${validTools.join('/')})가 호출되어야 합니다`).toBe(true);

        if (result.success) {
          testStats.passed++;
          testStats.details.push({
            pattern: response,
            result: 'passed',
            tool: result.secondPageTools[0]?.name,
            offset: result.secondOffset
          });
        } else {
          testStats.failed++;
          testStats.details.push({ pattern: response, result: 'failed' });
        }

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 2. 한글 응답 패턴 테스트
  // ============================================================
  describe('한글 기본 응답', () => {
    for (const response of POSITIVE_RESPONSES.korean_basic) {
      it(`"${response}" → 다음 페이지 조회`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          return;
        }

        const result = await runPaginationConversation('고객 목록 보여줘', response, openAIFunctions);

        expect(result.secondPageTools.length).toBeGreaterThan(0);
        expect(result.usedUnifiedSearch).toBe(false);

        if (result.success) {
          testStats.passed++;
          testStats.details.push({ pattern: response, result: 'passed', tool: result.secondPageTools[0]?.name });
        } else {
          testStats.failed++;
          testStats.details.push({ pattern: response, result: 'failed' });
        }

      }, TIMEOUT_MS);
    }
  });

  describe('한글 명령형 응답', () => {
    for (const response of POSITIVE_RESPONSES.korean_command) {
      it(`"${response}" → 다음 페이지 조회`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          return;
        }

        const result = await runPaginationConversation('전체 계약 목록 보여줘', response, openAIFunctions);

        expect(result.secondPageTools.length).toBeGreaterThan(0);

        if (result.success) {
          testStats.passed++;
          testStats.details.push({ pattern: response, result: 'passed' });
        } else {
          testStats.failed++;
          testStats.details.push({ pattern: response, result: 'failed' });
        }

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 3. 영문 응답 패턴 테스트
  // ============================================================
  describe('영문 응답', () => {
    const allEnglish = [...POSITIVE_RESPONSES.english_basic, ...POSITIVE_RESPONSES.english_command];

    for (const response of allEnglish) {
      it(`"${response}" → 다음 페이지 조회`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          return;
        }

        const result = await runPaginationConversation('고객 목록 보여줘', response, openAIFunctions);

        expect(result.secondPageTools.length).toBeGreaterThan(0);

        if (result.success) {
          testStats.passed++;
          testStats.details.push({ pattern: response, result: 'passed' });
        } else {
          testStats.failed++;
          testStats.details.push({ pattern: response, result: 'failed' });
        }

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 4. 줄임말/속어 테스트 (허용적)
  // ============================================================
  describe('줄임말/속어 응답 (허용적 검증)', () => {
    for (const response of POSITIVE_RESPONSES.korean_slang) {
      it(`"${response}" → 다음 페이지 조회 시도`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          return;
        }

        const result = await runPaginationConversation('고객 목록 보여줘', response, openAIFunctions);

        // 줄임말/속어는 AI가 이해하지 못할 수도 있음 - 경고만
        if (result.secondPageTools.length === 0) {
          console.warn(`⚠️ AI가 "${response}" 응답을 이해하지 못했습니다`);
          testStats.details.push({ pattern: response, result: 'warning' });
        } else {
          testStats.passed++;
          testStats.details.push({ pattern: response, result: 'passed' });
        }

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 5. 고객 문서 목록 페이지네이션 (중요!)
  // ============================================================
  describe('고객 문서 목록 페이지네이션', () => {
    const responses = ['응', 'ㅇㅇ', '더 보여줘', 'next', 'yes', '계속'];

    for (const response of responses) {
      it(`"${response}" → list_customer_documents 호출 (unified_search 금지)`, async () => {
        testStats.total++;

        if (!apiKeyAvailable || !serverAvailable) {
          testStats.skipped++;
          return;
        }

        const result = await runPaginationConversation(
          '캐치업코리아 문서 목록 보여줘',
          response,
          openAIFunctions
        );

        // 첫 번째 응답이 성공했으면 두 번째도 성공해야 함
        if (result.firstPageTools.length > 0) {
          expect(result.secondPageTools.length, '두 번째 페이지에서 도구가 호출되어야 합니다').toBeGreaterThan(0);

          // ⚠️ 핵심 검증: unified_search 사용 금지!
          expect(result.usedUnifiedSearch, '❌ unified_search는 절대 사용하면 안 됩니다!').toBe(false);

          // 올바른 도구 사용 검증
          const allowedTools = ['list_customer_documents', 'get_customer', 'search_customers'];
          const usedTool = result.secondPageTools[0]?.name;
          expect(allowedTools, `허용된 도구: ${allowedTools.join(', ')}`).toContain(usedTool);

          if (result.usedUnifiedSearch) {
            testStats.wrongTool++;
            testStats.details.push({ pattern: response, result: 'wrong_tool', tool: 'unified_search' });
          } else {
            testStats.passed++;
            testStats.details.push({ pattern: response, result: 'passed', tool: usedTool });
          }
        } else {
          testStats.skipped++;
        }

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 6. 부정적 응답 테스트
  // ============================================================
  describe('부정적 응답 처리', () => {
    for (const response of NEGATIVE_RESPONSES) {
      it(`"${response}" → 도구 호출 최소화`, async () => {
        if (!apiKeyAvailable || !serverAvailable) return;

        const result = await runPaginationConversation('고객 목록 보여줘', response, openAIFunctions);

        // 부정적 응답에는 페이지네이션 도구를 호출하지 않는 것이 이상적
        console.log(`   "${response}" → 도구 호출: ${result.secondPageTools.length}개`);

      }, TIMEOUT_MS);
    }
  });

  // ============================================================
  // 7. 연속 페이지 조회 테스트 (3페이지)
  // ============================================================
  describe('연속 페이지 조회', () => {
    it('페이지 1 → 2 → 3 연속 조회', async () => {
      if (!apiKeyAvailable || !serverAvailable) {
        console.log('테스트 스킵');
        return;
      }

      const messages: OpenAIMessage[] = [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: '고객 목록 보여줘' }
      ];

      const allTools: ToolCall[] = [];
      const offsets: number[] = [];

      // 3페이지 연속 조회
      for (let page = 1; page <= 3; page++) {
        let iterations = 0;

        while (iterations < 5) {
          iterations++;
          const { message } = await callOpenAI(messages, openAIFunctions);
          messages.push(message);

          if (!message.tool_calls || message.tool_calls.length === 0) {
            break;
          }

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            allTools.push({ name: toolName, arguments: toolArgs });
            offsets.push(Number(toolArgs.offset) || 0);

            try {
              const result = await callMCPTool(toolName, toolArgs);
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
              });
            } catch (error) {
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: String(error) })
              });
            }
          }
        }

        // 다음 페이지 요청 (마지막 페이지 제외)
        if (page < 3) {
          messages.push({ role: 'user', content: '응' });
        }
      }

      console.log(`   도구 호출: ${allTools.length}회`);
      console.log(`   offset 변화: [${offsets.join(' → ')}]`);

      // 검증: 최소 2회 이상 도구 호출
      expect(allTools.length).toBeGreaterThanOrEqual(2);

      // 검증: offset이 증가해야 함
      for (let i = 1; i < offsets.length; i++) {
        if (offsets[i] !== 0) { // 새로운 검색이 아닌 경우
          expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
        }
      }

    }, TIMEOUT_MS * 3);
  });

  // ============================================================
  // 8. 종합 성공률 테스트
  // ============================================================
  describe('종합 성공률 검증', () => {
    it('핵심 패턴 90% 이상 성공해야 함', async () => {
      if (!apiKeyAvailable || !serverAvailable) {
        console.log('테스트 스킵');
        return;
      }

      const results: { response: string; success: boolean }[] = [];

      for (const response of CORE_RESPONSES) {
        const result = await runPaginationConversation('고객 목록 보여줘', response, openAIFunctions);
        results.push({ response, success: result.success });
      }

      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / results.length;

      console.log(`\n   핵심 패턴 성공률: ${successCount}/${results.length} (${Math.round(successRate * 100)}%)`);

      if (successRate < 0.9) {
        console.log('   실패한 패턴:');
        results.filter(r => !r.success).forEach(r => console.log(`     - "${r.response}"`));
      }

      expect(successRate).toBeGreaterThanOrEqual(0.9);

    }, TIMEOUT_MS * CORE_RESPONSES.length);
  });
});
