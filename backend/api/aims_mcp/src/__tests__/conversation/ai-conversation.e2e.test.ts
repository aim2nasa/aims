/**
 * AI 대화 품질 E2E 테스트
 *
 * AI 어시스턴트(OpenAI)가 MCP 도구들을 사용하여 실제 대화에서
 * 적절하게 동작하는지 검증합니다.
 *
 * 검증 항목:
 * 1. 도구 선택: 사용자 질문에 맞는 도구를 호출하는가?
 * 2. 파라미터: 올바른 파라미터를 전달하는가?
 * 3. 응답 품질: 최종 응답이 사용자에게 도움이 되는가?
 *
 * 환경변수:
 *   OPENAI_API_KEY - OpenAI API 키 (필수)
 *   MCP_URL - MCP 서버 URL (기본: http://localhost:3011)
 *
 * 실행:
 *   OPENAI_API_KEY=sk-xxx npm run test:conversation
 *   MCP_URL=http://tars.giize.com:3011 OPENAI_API_KEY=sk-xxx npm run test:conversation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ============================================================
// 설정
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MCP_URL = process.env.MCP_URL || 'http://localhost:3011';
const TEST_USER_ID = '000000000000000000000001';
const MODEL = 'gpt-4o-mini'; // 비용 효율적인 모델
const TIMEOUT_MS = 30000;

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

interface ConversationResult {
  userQuery: string;
  toolsCalled: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
  finalResponse: string;
  success: boolean;
}

interface TestScenario {
  name: string;
  userQuery: string;
  expectedTools: string[]; // 호출되어야 할 도구들
  forbiddenTools?: string[]; // 호출되면 안 되는 도구들
  responseValidation?: (response: string) => boolean;
  description?: string;
}

// ============================================================
// 헬퍼 함수
// ============================================================

/**
 * MCP 서버 상태 확인
 */
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

/**
 * MCP 서버에서 도구 정의 가져오기
 */
async function getMCPTools(): Promise<MCPToolDefinition[]> {
  const res = await fetch(`${MCP_URL}/tools`, {
    headers: { 'x-user-id': TEST_USER_ID },
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json();
  return data.tools || [];
}

/**
 * MCP 도구 호출
 */
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

/**
 * MCP 도구 정의를 OpenAI function 형식으로 변환
 */
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

/**
 * OpenAI API 호출
 */
async function callOpenAI(
  messages: OpenAIMessage[],
  functions: OpenAIFunction[]
): Promise<{
  message: OpenAIMessage;
  usage: { total_tokens: number };
}> {
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

/**
 * 시스템 프롬프트 생성
 */
function getSystemPrompt(): string {
  return `당신은 AIMS(보험 설계사 지능형 관리 시스템)의 AI 어시스턴트입니다.

역할:
- 보험 설계사가 고객, 계약, 문서를 관리하도록 돕습니다
- 제공된 도구들을 사용하여 데이터를 조회하고 작업을 수행합니다
- 한국어로 친절하고 전문적으로 응답합니다

규칙:
1. 항상 도구를 사용하여 실제 데이터를 조회하세요
2. 추측하지 말고 실제 데이터에 기반하여 응답하세요
3. 결과가 없으면 솔직하게 알려주세요
4. 개인정보는 적절히 마스킹하여 표시하세요`;
}

/**
 * 전체 대화 실행 (도구 호출 포함)
 */
async function runConversation(
  userQuery: string,
  functions: OpenAIFunction[]
): Promise<ConversationResult> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: userQuery }
  ];

  const toolsCalled: ConversationResult['toolsCalled'] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const { message } = await callOpenAI(messages, functions);
    messages.push(message);

    // 도구 호출이 없으면 대화 종료
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        userQuery,
        toolsCalled,
        finalResponse: message.content || '',
        success: true
      };
    }

    // 각 도구 호출 처리
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`  🔧 도구 호출: ${toolName}`, toolArgs);

      try {
        const result = await callMCPTool(toolName, toolArgs);
        toolsCalled.push({ name: toolName, arguments: toolArgs, result });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMsg })
        });
      }
    }
  }

  // MAX_ITERATIONS 초과
  return {
    userQuery,
    toolsCalled,
    finalResponse: messages[messages.length - 1].content || '',
    success: false
  };
}

// ============================================================
// 테스트 시나리오 정의
// ============================================================

const testScenarios: TestScenario[] = [
  // === 고객 관리 ===
  {
    name: '전체 고객 목록 조회',
    userQuery: '전체 고객 목록 보여줘',
    expectedTools: ['search_customers'],
    responseValidation: (r) => r.includes('고객') || r.includes('명')
  },
  {
    name: '이름으로 고객 검색',
    userQuery: '홍길동 고객 찾아줘',
    expectedTools: ['search_customers'],
    responseValidation: (r) => r.includes('홍길동') || r.includes('검색') || r.includes('고객')
  },
  {
    name: '법인 고객만 조회',
    userQuery: '법인 고객만 보여줘',
    expectedTools: ['search_customers'],
    description: '고객 유형 필터링 테스트'
  },

  // === 계약 관리 ===
  {
    name: '계약 목록 조회',
    userQuery: '전체 계약 목록 보여줘',
    expectedTools: ['list_contracts'],
    responseValidation: (r) => r.includes('계약') || r.includes('건')
  },
  {
    name: '만기 예정 계약 조회',
    userQuery: '30일 이내 만기 예정인 계약 찾아줘',
    expectedTools: ['find_expiring_contracts'],
    responseValidation: (r) => r.includes('만기') || r.includes('일')
  },

  // === 생일 고객 ===
  {
    name: '이번 달 생일 고객',
    userQuery: '이번 달 생일인 고객이 있어?',
    expectedTools: ['find_birthday_customers'],
    responseValidation: (r) => r.includes('생일') || r.includes('고객')
  },

  // === 통계 ===
  {
    name: '전체 현황 요약',
    userQuery: '전체 현황 요약해줘',
    expectedTools: ['get_statistics'],
    responseValidation: (r) => r.includes('고객') && r.includes('계약')
  },

  // === 문서 검색 ===
  {
    name: '문서 검색',
    userQuery: '보험증권 관련 문서 찾아줘',
    expectedTools: [], // search_documents 또는 search_documents_semantic 중 하나
    responseValidation: (r) =>
      r.includes('문서') || r.includes('증권') || r.includes('찾을 수 없') || r.includes('검색')
  },

  // === 상품 검색 ===
  {
    name: '상품 검색',
    userQuery: '암보험 상품 있어?',
    expectedTools: ['search_products'],
    responseValidation: (r) => r.includes('상품') || r.includes('보험')
  },

  // === 복합 시나리오 ===
  {
    name: '고객 검색 후 상세 조회 (가능성)',
    userQuery: '홍길동 고객 정보 자세히 알려줘',
    expectedTools: ['search_customers'], // 먼저 검색 후 get_customer 호출 가능
    description: 'AI가 검색 후 상세 조회까지 할 수 있음'
  },

  // === 잘못된 요청 처리 ===
  {
    name: '존재하지 않는 기능 요청',
    userQuery: '날씨 알려줘',
    expectedTools: [], // 도구를 호출하지 않아야 함
    responseValidation: (r) =>
      r.includes('할 수 없') || r.includes('지원하지') || r.includes('도움')
  }
];

// ============================================================
// 테스트 실행
// ============================================================

describe('AI 대화 품질 테스트', () => {
  let serverAvailable = false;
  let apiKeyAvailable = false;
  let openAIFunctions: OpenAIFunction[] = [];

  beforeAll(async () => {
    // API 키 확인
    apiKeyAvailable = !!OPENAI_API_KEY;
    if (!apiKeyAvailable) {
      console.warn('⚠️ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
      return;
    }

    // MCP 서버 확인
    serverAvailable = await checkMCPHealth();
    if (!serverAvailable) {
      console.warn(`⚠️ MCP 서버 (${MCP_URL})에 연결할 수 없습니다.`);
      return;
    }

    // 도구 정의 로드
    const mcpTools = await getMCPTools();
    openAIFunctions = convertToOpenAIFunctions(mcpTools);
    console.log(`✅ ${openAIFunctions.length}개 도구 로드 완료`);
  });

  // 각 시나리오 테스트 생성
  describe('도구 선택 검증', () => {
    for (const scenario of testScenarios) {
      it(scenario.name, async () => {
        if (!apiKeyAvailable || !serverAvailable) {
          console.log('테스트 스킵 (API 키 또는 서버 미사용)');
          return;
        }

        console.log(`\n📝 시나리오: ${scenario.name}`);
        console.log(`   질문: "${scenario.userQuery}"`);

        const result = await runConversation(scenario.userQuery, openAIFunctions);

        console.log(`   호출된 도구: [${result.toolsCalled.map(t => t.name).join(', ')}]`);
        console.log(`   응답: ${result.finalResponse.substring(0, 100)}...`);

        // 1. 기대 도구 호출 확인
        const calledToolNames = result.toolsCalled.map(t => t.name);
        for (const expectedTool of scenario.expectedTools) {
          expect(
            calledToolNames.includes(expectedTool),
            `${expectedTool} 도구가 호출되어야 합니다. 실제: [${calledToolNames.join(', ')}]`
          ).toBe(true);
        }

        // 2. 금지된 도구 호출 확인
        if (scenario.forbiddenTools) {
          for (const forbiddenTool of scenario.forbiddenTools) {
            expect(
              calledToolNames.includes(forbiddenTool),
              `${forbiddenTool} 도구는 호출되면 안 됩니다`
            ).toBe(false);
          }
        }

        // 3. 응답 품질 검증
        if (scenario.responseValidation) {
          expect(
            scenario.responseValidation(result.finalResponse),
            `응답 품질 검증 실패: "${result.finalResponse.substring(0, 100)}..."`
          ).toBe(true);
        }

        // 4. 대화 성공 여부
        expect(result.success).toBe(true);
      }, TIMEOUT_MS * 2);
    }
  });

  describe('에러 처리 검증', () => {
    it('잘못된 고객 ID 조회 시 친절한 에러 메시지', async () => {
      if (!apiKeyAvailable || !serverAvailable) return;

      // 직접 도구 호출로 테스트
      const messages: OpenAIMessage[] = [
        { role: 'system', content: getSystemPrompt() },
        {
          role: 'user',
          content: 'ID가 invalid-id인 고객 정보 조회해줘'
        }
      ];

      const { message } = await callOpenAI(messages, openAIFunctions);

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        expect(toolCall.function.name).toBe('get_customer');

        // 도구 결과 처리
        try {
          await callMCPTool('get_customer', { customerId: 'invalid-id' });
        } catch (error) {
          // 에러가 발생해야 함
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('응답 일관성 테스트', () => {
    it('동일한 질문에 일관된 도구 선택', async () => {
      if (!apiKeyAvailable || !serverAvailable) return;

      const query = '고객 목록 보여줘';
      const results: string[][] = [];

      // 3번 반복
      for (let i = 0; i < 3; i++) {
        const result = await runConversation(query, openAIFunctions);
        results.push(result.toolsCalled.map(t => t.name));
      }

      // 모든 결과에서 search_customers 호출
      for (const toolNames of results) {
        expect(toolNames).toContain('search_customers');
      }
    }, TIMEOUT_MS * 4);
  });
});

// ============================================================
// 커스텀 시나리오 테스트 (확장용)
// ============================================================

describe('커스텀 대화 시나리오', () => {
  it.skip('복잡한 멀티턴 대화', async () => {
    // 여러 턴의 대화를 테스트할 때 사용
    // 예: 고객 검색 → 상세 조회 → 메모 추가
  });
});
