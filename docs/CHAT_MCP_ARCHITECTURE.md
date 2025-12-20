# AIMS 채팅 + MCP 연동 아키텍처

## 개요

aims-uix3 프론트엔드에 자연어 채팅 기능을 추가하여, 사용자가 질문하면 MCP 서버를 통해 aims DB에 접근하여 답변하는 시스템.

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (aims-uix3)                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ChatPanel Component                                     │   │
│  │  - 메시지 입력/표시                                       │   │
│  │  - 스트리밍 응답 표시                                     │   │
│  │  - 대화 히스토리 관리                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/SSE (스트리밍)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: aims_api (Node.js, 포트 3010)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  POST /api/chat                                          │   │
│  │  - 사용자 메시지 수신                                     │   │
│  │  - Claude API 호출 (tool_use 모드)                        │   │
│  │  - Tool call 시 MCP 서버로 전달                           │   │
│  │  - 스트리밍 응답 반환                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (tool calls)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  MCP Server (포트 3011) - HTTP 모드                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  18개 Tools (구현 완료)                                   │   │
│  │                                                          │   │
│  │  고객 관련:                                               │   │
│  │  - search_customers: 고객 검색                            │   │
│  │  - get_customer_detail: 고객 상세 조회                    │   │
│  │  - get_customer_contracts: 고객의 계약 목록               │   │
│  │  - get_customer_documents: 고객의 문서 목록               │   │
│  │                                                          │   │
│  │  문서 관련:                                               │   │
│  │  - search_documents: 문서 메타데이터 검색                 │   │
│  │  - search_documents_content: 문서 내용 검색 (RAG)         │   │
│  │  - get_document_detail: 문서 상세 조회                    │   │
│  │                                                          │   │
│  │  계약 관련:                                               │   │
│  │  - search_contracts: 계약 검색                            │   │
│  │  - get_contract_detail: 계약 상세 조회                    │   │
│  │                                                          │   │
│  │  보험상품 관련:                                           │   │
│  │  - search_products: 보험상품 검색                         │   │
│  │  - get_product_detail: 보험상품 상세 조회                 │   │
│  │  - search_insurers: 보험사 검색                           │   │
│  │                                                          │   │
│  │  대시보드/통계:                                           │   │
│  │  - get_dashboard_summary: 대시보드 요약                   │   │
│  │  - get_expiring_contracts: 만기 예정 계약                 │   │
│  │  - get_recent_activities: 최근 활동                       │   │
│  │                                                          │   │
│  │  기타:                                                    │   │
│  │  - get_system_status: 시스템 상태                         │   │
│  │  - get_ai_usage_stats: AI 사용량 통계                     │   │
│  │  - search_annual_reports: 연간보고서 검색                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │ MongoDB  │              │  Qdrant  │
        │ (문서DB) │              │ (벡터DB) │
        └──────────┘              └──────────┘
```

---

## 데이터 흐름

### 1. 일반 질문 (Tool 미사용)
```
User → "안녕하세요"
  → aims_api → Claude API
  → Claude: "안녕하세요! 무엇을 도와드릴까요?"
  → User
```

### 2. DB 조회 필요 질문 (Tool 사용)
```
User → "홍길동 고객 정보 알려줘"
  → aims_api → Claude API (with tools)
  → Claude: tool_use(search_customers, {query: "홍길동"})
  → aims_api → MCP Server (HTTP)
  → MCP → MongoDB 조회
  → MCP → aims_api (결과 반환)
  → aims_api → Claude API (tool_result 전달)
  → Claude: "홍길동 고객님은 개인 고객으로..."
  → User
```

### 3. 복합 질문 (다중 Tool 사용)
```
User → "홍길동 고객의 만기 예정 계약 알려줘"
  → Claude: tool_use(search_customers, {query: "홍길동"})
  → 결과: customerId = "abc123"
  → Claude: tool_use(get_customer_contracts, {customerId: "abc123"})
  → 결과: 계약 목록
  → Claude: "홍길동 고객님의 계약 중 3개월 내 만기 예정은..."
  → User
```

---

## 구현 상세

### Backend: aims_api 채팅 엔드포인트

```javascript
// POST /api/chat
// 위치: backend/api/aims_api/server.js

const Anthropic = require('@anthropic-ai/sdk');

// MCP 서버에서 tool 정의 가져오기
const mcpTools = await fetch('http://localhost:3011/tools').then(r => r.json());

// Claude API 호출
app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory, userId } = req.body;

  // SSE 헤더 설정 (스트리밍)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const anthropic = new Anthropic();

  // Claude API 호출 (tool_use 모드)
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `당신은 AIMS(보험 설계사 관리 시스템)의 AI 어시스턴트입니다.
사용자의 질문에 친절하게 답변하세요.
필요한 경우 제공된 도구를 사용하여 데이터베이스에서 정보를 조회하세요.`,
    messages: conversationHistory,
    tools: mcpTools.tools
  });

  // 스트리밍 처리
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Tool 호출 처리
    if (event.type === 'tool_use') {
      const toolResult = await callMcpTool(event.name, event.input, userId);
      // tool_result를 Claude에게 전달하고 계속 진행
    }
  }

  res.end();
});

// MCP Tool 호출 함수
async function callMcpTool(toolName, input, userId) {
  const response = await fetch(`http://localhost:3011/tools/${toolName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify(input)
  });
  return response.json();
}
```

### Frontend: ChatPanel 컴포넌트

```typescript
// 위치: frontend/aims-uix3/src/features/chat/ChatPanel.tsx

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // 사용자 메시지 추가
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // SSE로 스트리밍 응답 받기
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
        conversationHistory: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        userId: currentUser.id
      })
    });

    const reader = response.body?.getReader();
    let assistantContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      // SSE 파싱 및 UI 업데이트
      assistantContent += parseSSE(text);
      updateAssistantMessage(assistantContent);
    }

    setIsLoading(false);
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="질문을 입력하세요..."
        />
        <button onClick={sendMessage} disabled={isLoading}>
          전송
        </button>
      </div>
    </div>
  );
}
```

---

## 구현 옵션 비교

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A. aims_api 직접 구현** | Node.js에 Claude SDK 추가 | 단순, 기존 인프라 활용 | Node.js Claude SDK 학습 필요 |
| **B. 별도 Python 서비스** | FastAPI로 채팅 API 별도 구축 | Python SDK 성숙, 타입힌트 | 서비스 하나 더 관리 |
| **C. n8n 워크플로우** | n8n으로 채팅 로직 구성 | 노코드, 빠른 프로토타이핑 | 복잡한 로직 어려움 |

**추천: 옵션 A** - aims_api에 `/api/chat` 엔드포인트 추가

---

## 보안 고려사항

1. **사용자 격리**: X-User-ID 헤더로 MCP 호출 시 사용자 데이터만 조회
2. **Rate Limiting**: 채팅 API에 요청 제한 적용
3. **토큰 사용량 로깅**: AI 사용량 추적 (기존 ai_usage 컬렉션 활용)
4. **입력 검증**: 악의적 프롬프트 필터링

---

## 구현 단계

### Phase 1: 백엔드 API
1. aims_api에 `@anthropic-ai/sdk` 패키지 추가
2. `/api/chat` 엔드포인트 구현
3. MCP tool 호출 로직 구현
4. 스트리밍 응답 처리

### Phase 2: 프론트엔드 UI
1. ChatPanel 컴포넌트 생성
2. 메시지 표시 UI
3. SSE 스트리밍 처리
4. 대화 히스토리 관리

### Phase 3: 고도화
1. 대화 저장/불러오기
2. 컨텍스트 메모리 (요약)
3. 멀티모달 (이미지 첨부)
4. 음성 입력/출력

---

## 관련 문서

- [MCP_INTEGRATION.md](./MCP_INTEGRATION.md) - MCP 서버 상세
- [AI_SEARCH_ARCHITECTURE_IMPROVEMENT.md](./20251113_ai_search_architecture_improvement.md) - AI 검색 아키텍처
