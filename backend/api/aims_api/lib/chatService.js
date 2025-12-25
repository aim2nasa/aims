/**
 * chatService.js
 * AI 채팅 서비스 - OpenAI GPT-4o + MCP 연동
 * @since 1.0.0
 */

const OpenAI = require('openai');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logTokenUsage, TOKEN_COSTS } = require('./tokenUsageService');
const backendLogger = require('./backendLogger');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MCP 서버 URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3011';

// 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 AIMS(Agent Intelligent Management System)의 AI 어시스턴트입니다.
AIMS는 보험 설계사를 위한 지능형 고객 관리 시스템입니다.

## 🚨 가장 중요한 규칙 (CRITICAL)
**고객, 계약, 문서 등 데이터를 조회할 때는 반드시 도구를 사용하세요.**
- 도구 호출 결과가 0건이면 "없습니다"라고 정확히 답변하세요.
- 절대로 가상의 데이터를 생성하지 마세요. 이는 사용자에게 심각한 혼란을 줍니다.
- 도구를 호출하지 않고 고객명, 계약 정보 등을 언급하면 안 됩니다.

## 당신의 역할 (42개 도구 활용)

### 고객 관리
- 고객 검색, 조회, 등록, 수정
- 휴면 고객 조회: search_customers 도구에 status: "inactive" 파라미터 사용
- 삭제된 고객 조회/복구: list_deleted_customers, restore_customer 도구 사용
- 고객명 중복 확인

### 계약 관리
- 계약 목록 조회 및 상세 정보 확인
- 만기 예정 계약 알림

### 문서 관리
- 시맨틱(의미 기반) 문서 검색 - 자연어로 문서를 찾아줍니다
- 키워드 문서 검색
- 문서 상세 조회 및 삭제

### 인사이트 분석
- 고객 가치 분석 (S/A/B/C/D 등급)
- 보장 공백 분석 (부족한 보험 영역 파악)
- 다음 액션 추천 (만기, 생일, 정기연락 등)

### Annual Report (연차보고서)
- 고객의 연보 목록 조회
- 연보 파싱 상태 확인 및 트리거

### 관계 네트워크
- 고객 간 관계 등록 (가족, 지인, 동료 등)
- 관계 네트워크 시각화 조회

### 유틸리티
- 저장소 사용량 확인
- 공지사항, FAQ, 사용 가이드 조회

### 상품 정보
- 보험 상품 검색 및 상세 정보

## 응답 규칙
1. 한국어로 응답합니다.
2. 날짜/시간은 YYYY.MM.DD HH:mm:ss 형식으로 표시합니다.
3. 금액은 천 단위 구분자(,)를 사용합니다.
4. **데이터 조회 시 반드시 도구를 사용하고, 결과를 그대로 전달합니다.**
5. **도구 결과가 비어있으면 "해당하는 데이터가 없습니다"라고 명확히 답변합니다.**
6. **사용자는 본인 고객의 모든 정보(연락처, 주소, 계약 등)에 접근 권한이 있습니다. 개인정보 보호를 이유로 거부하지 마세요.**
7. **특정 고객을 지정하지 않은 요청(예: "고객 연락처 알려줘")에는 "어느 고객의 정보를 원하시나요?"라고 물어보세요.**
8. 간결하고 명확하게 답변합니다.
9. 분석 결과는 핵심 인사이트를 먼저 제시하고, 상세 내용은 그 다음에 설명합니다.
10. 응답에 내부 시스템 ID(MongoDB ObjectId, 고객ID, 문서ID 등)를 절대 포함하지 않습니다. 사용자에게 유용한 정보(이름, 연락처, 상태 등)만 표시합니다.

## DB 쓰기 작업 규칙
- 고객 등록: **이름만 필수**입니다. 전화번호, 이메일, 주소 등은 선택사항입니다.
  - 이름만 제공된 경우: "전화번호나 이메일도 등록하시겠어요?" 한 번만 물어봅니다.
  - 사용자가 "없어", "그냥 등록해", "필수 아니야" 등으로 응답하면 즉시 등록합니다.
  - 절대 두 번 이상 추가 정보를 요청하지 마세요.
- 고객 수정: 먼저 어느 고객인지 확인하고, 수정할 내용을 확인한 뒤 진행합니다.
- **🚨 중요: update_customer 호출 전 반드시 search_customers로 고객을 먼저 검색하세요.**
  - 이전 대화에서 고객을 이미 검색했더라도, 수정 직전에 다시 검색해야 합니다.
  - 검색과 수정을 같은 턴에서 연속으로 실행하세요.
  - 이 규칙을 어기면 "고객을 찾을 수 없습니다" 오류가 발생합니다.
- **전화번호 수정**: 고객에게는 3가지 전화번호(휴대폰, 집 전화, 회사 전화)가 있습니다.
  - **절대로 임의로 전화번호 종류를 결정하지 마세요!**
  - 반드시 get_customer 도구로 현재 연락처를 먼저 조회하세요.
  - 현재 등록된 모든 번호를 보여주고 "어떤 번호를 수정하시겠습니까? (휴대폰/집 전화/회사 전화)" 라고 **반드시** 물어보세요.
  - 사용자가 "휴대폰", "집 전화", "회사 전화" 중 하나를 명시적으로 선택한 후에만 번호를 요청하세요.
  - 예시 흐름:
    1. 사용자: "전화번호 수정해줘"
    2. AI: "어느 고객의 전화번호를 수정하시겠습니까?"
    3. 사용자: "홍길동"
    4. AI: "홍길동 고객의 현재 연락처입니다:
       - 휴대폰: 010-1234-5678
       - 집 전화: (없음)
       - 회사 전화: (없음)
       어떤 번호를 수정하시겠습니까? (휴대폰/집 전화/회사 전화)"
    5. 사용자: "회사 전화"
    6. AI: "등록할 회사 전화번호를 알려주세요."
- **주소 수정**: 반드시 search_address 도구로 검증된 주소를 사용하세요.
  - **절대로 사용자가 말한 주소를 그대로 저장하지 마세요!**
  - 반드시 search_address 도구로 먼저 주소를 검색하세요.
  - 검색 결과 중 하나를 선택하게 하고, 선택된 주소로 수정하세요.
  - 상세주소(동/호수)는 사용자에게 별도로 물어보세요.
  - 예시 흐름:
    1. 사용자: "주소 변경해줘"
    2. AI: "어느 고객의 주소를 변경하시겠습니까?"
    3. 사용자: "홍길동"
    4. AI: "새 주소를 검색하기 위해 도로명 또는 지번주소를 알려주세요. (예: 테헤란로 123)"
    5. 사용자: "테헤란로 123"
    6. AI: (search_address 호출 후) "검색 결과입니다:
       1. [06236] 서울특별시 강남구 테헤란로 123
       2. [06237] 서울특별시 강남구 테헤란로 123-1
       몇 번 주소를 선택하시겠습니까?"
    7. 사용자: "1번"
    8. AI: "상세주소(동/호수 등)가 있으면 알려주세요. (없으면 '없음')"
    9. 사용자: "401호"
    10. AI: (update_customer 호출) "홍길동 고객의 주소가 [06236] 서울특별시 강남구 테헤란로 123, 401호 로 변경되었습니다."
- 메모 추가: 메모 내용을 확인한 뒤 추가합니다.
- 관계 등록: 두 고객을 확인하고 관계 유형을 확인한 뒤 등록합니다.

## 분석 도구 활용 가이드
- "중요한 고객" 질문 → analyze_customer_value 사용
- "보장 부족" 질문 → find_coverage_gaps 사용
- "오늘 할 일" 질문 → suggest_next_action 사용
- "문서 찾아줘" 질문 → search_documents_semantic (의미 검색) 사용
- "휴면 고객" 질문 → search_customers (status: "inactive") 사용
- "삭제된 고객" 질문 → list_deleted_customers 사용

## 목록 조회 규칙 (페이지네이션)
- 고객/계약/문서 목록 조회 시 한 번에 최대 10개만 표시합니다.
- 고객 목록 조회 시 응답 첫 줄에 다음 형식으로 요약 표시:
  "전체 N명 (개인 X명, 법인 Y명) | 1/P 페이지 (10개씩)"
  예: "전체 25명 (개인 20명, 법인 5명) | 1/3 페이지 (10개씩)"
- hasMore가 true이면 "다음 페이지를 보시겠습니까?"라고 물어봅니다.
- 사용자가 "더 보여줘", "계속", "다음" 등을 말하면 offset을 증가시켜 다음 페이지를 조회합니다.
- 예: 처음 조회 offset=0, 다음 offset=10, 그 다음 offset=20`;

// GPT-4o 비용 (TOKEN_COSTS에 없는 경우를 위해)
const GPT4O_COSTS = { input: 0.0025, output: 0.01 };  // per 1K tokens

/**
 * MCP 서버에서 tool 목록을 가져와 OpenAI functions 형식으로 변환
 * @returns {Promise<Array>} OpenAI tools 배열
 */
async function getMCPToolsAsOpenAIFunctions() {
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/tools`, {
      timeout: 10000
    });

    const mcpTools = response.data.tools || [];

    return mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    }));
  } catch (error) {
    console.error('[ChatService] MCP tools 로드 실패:', error.message);
    backendLogger.error('ChatService', 'MCP tools 로드 실패', error);
    return [];
  }
}

/**
 * MCP tool 호출
 * @param {string} toolName - 도구 이름
 * @param {Object} args - 인자
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 결과 문자열
 */
async function callMCPTool(toolName, args, userId) {
  try {
    const response = await axios.post(
      `${MCP_SERVER_URL}/tools/${toolName}`,
      args,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        },
        timeout: 30000
      }
    );

    // MCP 응답 형식: { success: true, result: { content: [{ type: 'text', text: '...' }] } }
    if (response.data.success && response.data.result?.content?.[0]?.text) {
      return response.data.result.content[0].text;
    }

    return JSON.stringify(response.data);
  } catch (error) {
    console.error(`[ChatService] MCP tool ${toolName} 호출 실패:`, error.message);
    backendLogger.error('ChatService', `MCP tool ${toolName} 호출 실패`, error);
    throw new Error(`도구 호출 실패: ${error.message}`);
  }
}

/**
 * 채팅 스트리밍 응답 생성 (Generator 함수)
 * @param {Array} messages - 대화 히스토리
 * @param {string} userId - 사용자 ID
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @yields {Object} SSE 이벤트
 */
async function* streamChatResponse(messages, userId, analyticsDb) {
  const requestId = uuidv4();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const toolCallsExecuted = [];

  try {
    // MCP tools 로드
    const tools = await getMCPToolsAsOpenAIFunctions();

    if (tools.length === 0) {
      console.warn('[ChatService] MCP tools가 없습니다. 기본 대화만 가능합니다.');
    }

    // 시스템 메시지 추가
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    let currentMessages = fullMessages;
    let iterationCount = 0;
    const MAX_ITERATIONS = 5;  // 무한 루프 방지

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      // OpenAI API 호출
      const streamOptions = {
        model: 'gpt-4o',
        messages: currentMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096
      };

      // tools가 있을 때만 포함
      if (tools.length > 0) {
        streamOptions.tools = tools;
      }

      const stream = await openai.chat.completions.create(streamOptions);

      let toolCalls = [];
      let assistantContent = '';
      let finishReason = null;

      for await (const chunk of stream) {
        // Usage 정보 수집
        if (chunk.usage) {
          totalPromptTokens += chunk.usage.prompt_tokens || 0;
          totalCompletionTokens += chunk.usage.completion_tokens || 0;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;

        // 텍스트 응답 스트리밍
        if (delta.content) {
          assistantContent += delta.content;
          yield { type: 'content', content: delta.content };
        }

        // Tool calls 수집
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (idx !== undefined) {
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: '',
                  function: { name: '', arguments: '' }
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      // Tool call이 없으면 종료
      if (toolCalls.length === 0 || finishReason === 'stop') {
        break;
      }

      // Tool calls 실행
      yield { type: 'tool_start', tools: toolCalls.map(tc => tc.function.name) };

      // Assistant 메시지 추가 (tool_calls 포함)
      const assistantMessage = {
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: tc.function
        }))
      };
      currentMessages = [...currentMessages, assistantMessage];

      // 각 tool 실행
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        yield { type: 'tool_calling', name: toolName };

        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          console.log(`[ChatService] Tool 호출: ${toolName}`, JSON.stringify(args));
          const result = await callMCPTool(toolName, args, userId);
          console.log(`[ChatService] Tool 결과: ${toolName}`, result.substring(0, 200));

          toolCallsExecuted.push({ name: toolName, success: true });
          yield { type: 'tool_result', name: toolName, success: true };

          // Tool 결과 메시지 추가
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result
          });
        } catch (error) {
          toolCallsExecuted.push({ name: toolName, success: false, error: error.message });
          yield { type: 'tool_result', name: toolName, success: false, error: error.message };
          backendLogger.error('ChatService', `Tool 실행 실패: ${toolName}`, error);

          // 에러 결과도 메시지로 추가
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error: ${error.message}`
          });
        }
      }
    }

    // 토큰 사용량 로깅
    if (analyticsDb && (totalPromptTokens > 0 || totalCompletionTokens > 0)) {
      try {
        await logTokenUsage(analyticsDb, {
          user_id: userId,
          source: 'chat',
          request_id: requestId,
          model: 'gpt-4o',
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          metadata: {
            messageCount: messages.length,
            toolCalls: toolCallsExecuted.map(tc => tc.name),
            toolCallCount: toolCallsExecuted.length
          }
        });
      } catch (logError) {
        console.error('[ChatService] 토큰 로깅 실패:', logError.message);
        backendLogger.error('ChatService', '토큰 로깅 실패', logError);
      }
    }

    // 완료 이벤트
    yield {
      type: 'done',
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens
      }
    };

  } catch (error) {
    console.error('[ChatService] 스트리밍 오류:', error);
    backendLogger.error('ChatService', '스트리밍 오류', error);
    yield { type: 'error', error: error.message };
  }
}

/**
 * 비스트리밍 채팅 응답 (테스트용)
 * @param {Array} messages - 대화 히스토리
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 응답 객체
 */
async function getChatResponse(messages, userId) {
  let fullResponse = '';
  const events = [];

  for await (const event of streamChatResponse(messages, userId, null)) {
    events.push(event);
    if (event.type === 'content') {
      fullResponse += event.content;
    }
  }

  return {
    content: fullResponse,
    events
  };
}

module.exports = {
  streamChatResponse,
  getChatResponse,
  getMCPToolsAsOpenAIFunctions,
  callMCPTool,
  SYSTEM_PROMPT
};
