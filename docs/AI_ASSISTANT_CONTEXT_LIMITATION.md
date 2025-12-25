# AI 어시스턴트 대화 컨텍스트 한계

## 문제 현상

AI 어시스턴트에서 고객 정보 수정 시 간헐적으로 "고객을 찾을 수 없습니다" 오류 발생

### 재현 시나리오
```
사용자: "고객 이메일 수정해줘"
AI: "어느 고객의 이메일을 수정하시겠습니까?"
사용자: "홍길동"
AI: "홍길동 고객의 현재 이메일은... 수정할 이메일을 알려주세요."
사용자: "new@test.com"
AI: "'홍길동'이라는 이름의 고객을 찾을 수 없습니다."  ← 오류!
```

## 원인 분석

### 대화 히스토리 구조
프론트엔드에서 백엔드로 전송하는 대화 히스토리:
```javascript
// ChatPanel.tsx
const chatMessages = messages.map(m => ({
  role: m.role,    // 'user' | 'assistant'
  content: m.content  // 텍스트만
}));
```

### 문제점
- 대화 히스토리에 **tool 호출 결과가 포함되지 않음**
- Turn 2에서 `search_customers` 호출 → `customerId` 획득
- Turn 3에서 LLM이 이전 턴의 `customerId`를 알 수 없음
- LLM이 tool 없이 "찾을 수 없습니다" 메시지 자체 생성

### 흐름도
```
Turn 2: "홍길동"
  → search_customers 호출
  → customerId: "abc123" 획득 (tool 결과)
  → AI 응답: "현재 이메일은..."

Turn 3: "new@test.com"
  → 대화 히스토리: [user: "홍길동", assistant: "현재 이메일은..."]
  → customerId 정보 없음!
  → LLM 혼란 → 오류 메시지 생성
```

## 해결 방법

### 방법 비교표

| 항목 | 방법 1: 프롬프트 수정 | 방법 2: 히스토리 확장 |
|------|----------------------|---------------------|
| 구현 난이도 | ⭐ 쉬움 | ⭐⭐⭐ 복잡 |
| 코드 변경 | chatService.js만 | ChatPanel + chatService + 타입 |
| 토큰 비용 | 약간 증가 (재검색 1회) | 크게 증가 (매 턴 누적) |
| 신뢰도 | 90% (LLM 규칙 무시 가능) | 99% (시스템적 보장) |
| 배포 범위 | aims-api만 | 프론트 + 백엔드 |

### 방법 1: 시스템 프롬프트 수정 (채택)
- "수정 전 항상 재검색" 규칙 추가
- search → update를 같은 턴에서 실행하도록 유도

### 방법 2: 대화 히스토리에 tool 결과 포함 (미채택)
- ChatPanel + chatService 모두 수정
- assistant 메시지에 tool_calls 포함
- tool 응답을 별도 메시지로 저장

### 채택 이유
- 현재 이슈 빈도가 낮음 (재시도하면 성공)
- 방법 2는 토큰 비용이 대화가 길어질수록 급증
- 방법 1로 90%+ 해결 가능, 필요시 방법 2 추가 구현

## 구현 내용

### chatService.js 시스템 프롬프트 추가
```javascript
## 중요: 고객 정보 수정 시 재검색 필수
- update_customer 호출 전 **반드시** search_customers로 고객을 먼저 검색하세요.
- 이전 대화에서 고객을 이미 검색했더라도, 수정 직전에 다시 검색해야 합니다.
- 검색과 수정을 같은 턴에서 연속으로 실행하세요.
```

## 관련 파일
- `backend/api/aims_api/lib/chatService.js` - SYSTEM_PROMPT
- `frontend/aims-uix3/src/components/ChatPanel/ChatPanel.tsx` - 대화 히스토리 구성

## 발견일
2025-12-25

## 상태
- [x] 문제 분석 완료
- [x] 방법 1 구현 완료
- [ ] 방법 2는 필요시 추후 구현
