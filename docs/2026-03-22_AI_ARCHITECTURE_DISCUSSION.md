# AIMS AI 아키텍처 토의 보고서

> 날짜: 2026-03-22
> 참여: 곽승철, Claude

---

## 1. 토의 배경

AIMS AI 어시스턴트의 LLM, RAG, MCP 관계에 대한 아키텍처 검토 및 설계 적절성 평가.

---

## 2. LLM / RAG / MCP 역할 정리

| 구분 | 역할 | 비유 |
|------|------|------|
| **LLM** | 언어 이해/생성, 도구 선택 판단, 최종 답변 생성 | 두뇌 |
| **RAG** | 비정형 문서(PDF) 검색, 벡터 유사도 기반 | 참고 자료 |
| **MCP** | 외부 시스템 접근 (DB 조회, API 호출, 데이터 변경) | 손과 도구 |

---

## 3. AIMS의 AI 어시스턴트 동작 흐름

```
사용자 질문
    ↓
chatService → OpenAI (gpt-4.1-mini) + 34개 MCP 도구 목록 전달
    ↓
OpenAI가 적절한 도구 선택
    ├── 고객/계약/메모 질문 → MCP 도구 (MongoDB 직접 조회)
    ├── 문서 내용 검색 → MCP 도구 → RAG API (벡터 검색)
    └── 기타 정보 → MCP 도구 (storage, credit, notices 등)
    ↓
도구 결과를 OpenAI에 다시 전달
    ↓
OpenAI가 최종 답변 생성 → 사용자에게 스트리밍
```

---

## 4. AIMS 설계의 특징: MCP가 RAG를 포함

### 일반적 구조와의 비교

| 구조 | 설명 |
|------|------|
| RAG 단독 | 모든 질문을 벡터 검색으로 처리 (일반 챗봇) |
| MCP 단독 | 구조화된 도구만 사용 (데이터 CRUD) |
| RAG + MCP 병렬 | LLM이 두 경로를 구분해서 호출 |
| **AIMS (MCP 통일)** | **RAG가 MCP 도구 중 하나의 백엔드로 동작** |

### AIMS가 이렇게 설계한 이유

- AIMS 데이터의 80%는 구조화된 데이터 (고객, 계약, AR/CRS 테이블)
- 구조화된 데이터를 벡터 검색으로 찾는 것은 비효율적이고 부정확
- MCP 도구로 통일하면 LLM은 "도구만 고르면 됨" → 단순하고 정확
- RAG는 PDF 문서 내용 검색이라는 한정된 역할에만 필요

### 결론

> **일반적 구조는 아니지만, AIMS의 데이터 특성(구조화 데이터 중심)에 맞는 합리적 설계.**

---

## 5. GraphRAG와의 비교

### GraphRAG가 하는 것

AI가 텍스트에서 엔터티 간 관계를 자동 추출하여 그래프 DB에 저장하고, 그래프 순회로 답변 품질을 높이는 기술.

### AIMS에서 GraphRAG가 불필요한 이유

- AR/CRS 데이터의 관계가 이미 명확하고 예측 가능 (고객→계약→보험상품→보험사)
- MCP 도구로 이 관계를 정확하게 탐색 가능 (그래프 순회와 동일한 효과)
- GraphRAG는 비정형 텍스트에서 "예상하지 못한 관계"를 발견해야 할 때 가치가 큼

### 예시

```
"곽승철의 자동차보험 갱신 이력"

MCP 방식 (현재):
  search_customers → get_annual_reports → get_ar_contract_history
  → 정확한 데이터 반환 (GraphRAG와 결과 동일)

GraphRAG가 더 나은 경우:
  "삼성화재에서 DB손해보험으로 갈아탄 고객 패턴" → 교차 분석 자동 발견
  (현재 AIMS에는 이런 분석 도구가 없음 → 필요 시 MCP 도구 추가로 해결 가능)
```

---

## 6. 개선 가능 영역

### 6.1 도구 수 (34개) — 관찰 필요

- 현재 34개로 OpenAI 기준 관리 가능한 범위
- 도구가 더 늘어나면 LLM의 선택 정확도 저하 가능
- 억지로 합치면 파라미터 복잡성 증가 → 역효과
- **판단**: 현재는 유지, 호출 로그 데이터로 추후 판단

### 6.2 도구 체이닝 비용 — 트레이드오프 존재

```
체이닝 3회: 도구 정의(15K 토큰)가 3번 전송 = 45K
통합 1회:   도구 정의 2번 전송 = 30K, 대신 응답 데이터 더 큼
```

- 통합하면 API 호출 횟수는 줄지만, 불필요한 데이터까지 반환될 수 있음
- **판단**: 자주 함께 호출되는 패턴만 선별적으로 통합하는 것이 올바른 접근
- 실제 호출 패턴 데이터 기반으로 결정해야 함

### 6.3 체이닝 패턴 분석 로그 — 현재 불필요

- 현재 `metadata.toolCalls` 배열로 "함께 사용된 도구"는 파악 가능
- 설계사 업무 패턴이 예측 가능하고, 월 $30 수준 비용에서 최적화 효과 미미
- 사용자 증가 또는 비용 급증 시 재검토

---

## 7. 현재 MCP 도구 목록 (34개)

| 분류 | 도구 | 개수 |
|------|------|------|
| 고객 | search, get, create, update, check_name | 5 |
| 계약 | list, get_details | 2 |
| 문서 | search, get, list, find_by_filename | 4 |
| 메모 | add, list, delete, update, search | 5 |
| 관계 | create, delete, list, get_network | 4 |
| AR | get_annual_reports, get_ar_contract_history | 2 |
| CRS | get_customer_reviews, get_cr_contract_history, query | 3 |
| 검색 | search_documents_semantic, search_address, search_products | 3 |
| 정보 | get_storage, get_credit, find_birthday | 3 |
| 도움말 | list_notices, list_faqs, list_usage_guides | 3 |

---

## 8. 최종 평가

| 관점 | 평가 |
|------|------|
| 아키텍처 방향 (MCP 중심 + RAG 보조) | **합리적** |
| 현재 기능 수준 | **충분** |
| GraphRAG 도입 필요성 | **현재 불필요** |
| 도구 수 최적화 | **현재 유지, 추후 데이터 기반 판단** |
| 체이닝 최적화 | **현재 불필요, 비용 증가 시 재검토** |

> **"최적화된 설계"라고 하기엔 개선 여지가 있지만, 현재 AIMS의 사용 규모와 요구사항에 맞는 합리적 설계.**
