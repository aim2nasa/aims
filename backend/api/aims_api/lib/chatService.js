/**
 * chatService.js
 * AI 채팅 서비스 - OpenAI GPT-4o + MCP 연동
 * @since 1.0.0
 */

const OpenAI = require('openai');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logTokenUsage, TOKEN_COSTS } = require('./tokenUsageService');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MCP 서버 URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3011';

// 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 AIMS(Agent Intelligent Management System)의 AI 어시스턴트입니다.
AIMS는 보험 설계사를 위한 지능형 고객 관리 시스템입니다.

당신의 역할:
- 고객 정보 조회 및 관리 지원
- 계약 정보 검색 및 분석
- 문서 검색 및 내용 요약
- 만기 예정 계약, 생일 고객 알림
- 업무 효율화를 위한 데이터 분석

응답 규칙:
1. 한국어로 응답합니다.
2. 날짜/시간은 YYYY.MM.DD HH:mm:ss 형식으로 표시합니다.
3. 금액은 천 단위 구분자(,)를 사용합니다.
4. 필요한 정보가 있으면 제공된 도구를 적극 활용합니다.
5. 개인정보는 신중하게 다룹니다.
6. 간결하고 명확하게 답변합니다.

DB 쓰기 작업 규칙 (고객 등록/수정, 메모 추가):
- 고객 등록: 이름, 전화번호 등 필요한 정보를 대화로 확인한 뒤 등록합니다.
- 고객 수정: 먼저 어느 고객인지 확인하고, 수정할 내용을 확인한 뒤 진행합니다.
- 메모 추가: 메모 내용을 확인한 뒤 추가합니다.
- 사용자가 정보를 제공하지 않으면 먼저 물어보세요.`;

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
          const result = await callMCPTool(toolName, args, userId);

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
