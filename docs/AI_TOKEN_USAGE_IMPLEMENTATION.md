# AI 토큰 사용량 측정 기능 구현 보고서

## 개요
- **기능**: AI 토큰 사용량 측정 및 대시보드
- **시작일**: 2025-12-13
- **완료일**: 2025-12-13
- **상태**: ✅ 완료

---

## 요구사항
1. ✅ 각 사용자의 AI 토큰 사용량 측정
2. ✅ 각 사용자는 자신의 AI 토큰 사용량 확인 가능
3. ✅ Admin은 모든 사용자 및 시스템 전체 AI 토큰 사용량 확인 가능
4. ✅ 일별 그래프로 총합 표시

---

## AI 사용 포인트

| 위치 | 사용 모델 | 추적 방법 |
|------|----------|----------|
| RAG API (`rag_search.py`) | `text-embedding-3-small`, `gpt-3.5-turbo` | Python 코드에서 aims_api로 HTTP 전송 |
| n8n DocSummary | `gpt-4.1-mini` | HTTP Request 노드로 aims_api에 로깅 |

---

## 아키텍처

```
┌─────────────────┐                     ┌─────────────────┐
│   RAG API       │                     │  n8n DocSummary │
│  (Python)       │                     │  (gpt-4.1-mini) │
└────────┬────────┘                     └────────┬────────┘
         │                                       │
         │  토큰 정보                            │  토큰 정보
         │                                       │
         ▼                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              aims_api: POST /api/ai-usage/log                   │
│                    (토큰 사용량 로깅 웹훅)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              MongoDB: aims_analytics.ai_token_usage             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 구현 단계

### Phase 1: 백엔드 토큰 로깅 API ✅

| 항목 | 상태 | 비고 |
|------|------|------|
| tokenUsageService.js 생성 | ✅ | 토큰 로깅/조회/통계 서비스 |
| token-usage-routes.js 생성 | ✅ | API 라우트 |
| server.js 라우터 등록 | ✅ | |
| 서버 배포 | ✅ | Docker 배포 완료 |

**구현된 API 엔드포인트:**
- ✅ POST /api/ai-usage/log (내부 서비스용, API Key 인증)
- ✅ GET /api/users/me/ai-usage (사용자용, JWT 인증)
- ✅ GET /api/users/me/ai-usage/daily (사용자 일별, JWT 인증)
- ✅ GET /api/admin/ai-usage/overview (관리자용)
- ✅ GET /api/admin/ai-usage/daily (관리자 일별)
- ✅ GET /api/admin/ai-usage/top-users (Top 10 사용자)
- ✅ GET /api/admin/users/:id/ai-usage (특정 사용자)

---

### Phase 2: RAG API 토큰 추적 ✅

| 항목 | 상태 | 비고 |
|------|------|------|
| token_tracker.py 생성 | ✅ | HTTP 기반 토큰 로깅 |
| rag_search.py 수정 | ✅ | 토큰 추적 연동 |
| hybrid_search.py 수정 | ✅ | 임베딩 응답 저장 |
| 서버 배포 | ✅ | |

**추적 위치:**
- `embed_query()`: text-embedding-3-small 토큰
- `generate_answer_with_llm()`: gpt-3.5-turbo 토큰

---

### Phase 3: n8n DocSummary 토큰 추적 ✅

| 항목 | 상태 | 비고 |
|------|------|------|
| DocSummary.json 수정 | ✅ | 로깅 노드 추가 |
| n8n import | ✅ | 수동 import 완료 |
| 테스트 | ✅ | 토큰 로깅 확인 |

**워크플로우 흐름:**
```
Summary Request → LimitText → AI Agent → Log Token Usage → Code → Summary Return
```

---

### Phase 4: 사용자 프론트엔드 (aims-uix3) ✅

| 항목 | 상태 | 비고 |
|------|------|------|
| aiUsageService.ts 생성 | ✅ | API 서비스 |
| AIUsageChart 컴포넌트 생성 | ✅ | 일별 막대 차트 |
| AccountSettingsView 수정 | ✅ | AI 사용량 섹션 추가 |
| 브라우저 테스트 | ✅ | |

**표시 정보:**
- 총 토큰 / 프롬프트 / 완성 토큰
- 예상 비용 (USD)
- 요청 횟수
- 일별 사용량 차트

---

### Phase 5: 관리자 프론트엔드 (aims-admin) ✅

| 항목 | 상태 | 비고 |
|------|------|------|
| aiUsageApi.ts 생성 | ✅ | API 서비스 |
| AIUsagePage 생성 | ✅ | 대시보드 페이지 |
| 라우팅 추가 | ✅ | /dashboard/ai-usage |
| 브라우저 테스트 | ✅ | |

**대시보드 구성:**
- 전체 통계 카드 (총 토큰, 비용, 요청 수, 사용자 수)
- 소스별 사용량 (RAG API vs n8n DocSummary)
- 일별 사용량 그래프
- Top 10 사용자 테이블

---

## 커밋 기록

| 단계 | 커밋 해시 | 메시지 | 날짜 |
|------|----------|--------|------|
| Phase 1-4 | `8e7a5b79` | feat: AI 토큰 사용량 추적 기능 구현 (Phase 1-4) | 2025-12-13 |
| Phase 5 | `f5ef2a2e` | feat: 관리자 AI 사용량 대시보드 추가 (Phase 5) | 2025-12-13 |

---

## 파일 목록

### 생성된 파일
| 파일 | 설명 |
|------|------|
| `backend/api/aims_api/lib/tokenUsageService.js` | 토큰 사용량 서비스 |
| `backend/api/aims_api/routes/token-usage-routes.js` | API 라우트 |
| `backend/api/aims_rag_api/token_tracker.py` | RAG API 토큰 추적 |
| `frontend/aims-uix3/src/services/aiUsageService.ts` | 사용자 API 서비스 |
| `frontend/aims-uix3/src/shared/ui/AIUsageChart/` | 사용자 차트 컴포넌트 |
| `frontend/aims-admin/src/features/dashboard/aiUsageApi.ts` | 관리자 API 서비스 |
| `frontend/aims-admin/src/pages/AIUsagePage/` | 관리자 대시보드 |

### 수정된 파일
| 파일 | 변경 내용 |
|------|----------|
| `backend/api/aims_api/server.js` | 라우터 등록 |
| `backend/api/aims_rag_api/rag_search.py` | 토큰 추적 연동 |
| `backend/api/aims_rag_api/hybrid_search.py` | 임베딩 응답 저장 |
| `backend/n8n_flows/modules/DocSummary.json` | 로깅 노드 추가 |
| `frontend/aims-uix3/src/features/AccountSettings/AccountSettingsView.tsx` | AI 사용량 섹션 |
| `frontend/aims-admin/src/app/router.tsx` | 라우트 추가 |
| `frontend/aims-admin/src/App.tsx` | 네비게이션 추가 |

---

## 토큰 비용 (USD per 1K tokens)

| 모델 | Input | Output | 사용처 |
|------|-------|--------|--------|
| text-embedding-3-small | $0.00002 | - | RAG API 임베딩 |
| gpt-3.5-turbo | $0.0005 | $0.0015 | RAG API 답변 생성 |
| gpt-4.1-mini | $0.0004 | $0.0016 | n8n DocSummary |

---

## 데이터베이스

### 컬렉션: `aims_analytics.ai_token_usage`

```javascript
{
  _id: ObjectId,
  user_id: String,                    // 사용자 ID
  source: String,                     // "rag_api" | "n8n_docsummary"
  request_id: String,                 // UUID
  timestamp: ISODate,
  model: String,                      // 모델명
  prompt_tokens: Number,
  completion_tokens: Number,
  total_tokens: Number,
  estimated_cost_usd: Number,
  metadata: Object                    // 추가 정보
}
```

### 인덱스
- `{ user_id: 1, timestamp: -1 }`
- `{ timestamp: -1 }`
- `{ source: 1, timestamp: -1 }`

---

## 검증 결과

### 관리자 대시보드 테스트 (2025-12-13)
- 총 토큰: 44 ✅
- 프롬프트/완성: 14/30 ✅
- 예상 비용: $0.0001 ✅
- 요청 수: 1 ✅
- 활성 사용자: 1 ✅
- RAG API: 0 (0%) ✅
- n8n DocSummary: 44 (100%) ✅
- Top 사용자: test_token_user ✅
