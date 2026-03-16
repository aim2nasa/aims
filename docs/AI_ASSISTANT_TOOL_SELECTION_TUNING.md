# AI 어시스턴트 도구 선택 튜닝 계획

> **목표**: AI 어시스턴트(GPT-4.1-mini)가 사용자 질문에 대해 올바른 MCP 도구를 선택하도록 튜닝
> **시작일**: 2026-03-16
> **상태**: 🔄 진행 중

---

## 1. 배경

### 문제
- 사용자: "캐치업코리아 자동차 정보 알려줘"
- **상세문서검색** (RAG 직접 호출): 자동차등록증, 보험증권 등 4건+ 정상 반환
- **AI 어시스턴트**: `list_contracts` 호출 → "자동차 관련 계약은 없습니다" (오답)

### 원인
- AI가 `unified_search` 대신 `list_contracts`를 선택 (도구 선택 오류)
- MCP 도구 description이 모호하여 모델이 잘못 판단
- 시스템 프롬프트의 도구 선택 가이드 부족

### 핵심 원칙
1. **MCP 도구로 답할 수 있으면 도구 사용**
2. **그렇지 않을 때 RAG 검색으로 폴백**
3. → **도구 description + 시스템 프롬프트가 AI 어시스턴트 품질의 핵심**

---

## 2. 튜닝 전략

### Phase 1: 측정 기반 마련
- [x] 캐치업코리아 데이터 현황 파악 — 문서 11건, AR 1건(계약6), CRS 0, 메모 0, 관계 0
- [x] Ground Truth (GT) 테스트셋 작성 — **90건** (`tools/ai_assistant_tuning/ground_truth.json`)
- [x] 자동 테스트 스크립트 작성 (`tools/ai_assistant_tuning/test_tool_selection.py`)
- [x] **Before 정확도 측정** — **40/90 (44.4%)**

### Phase 2: MCP 도구 description 튜닝
- [ ] 40개 도구 description 전수 검토
- [ ] 혼동 가능한 도구 간 역할 경계 명확화
- [ ] "이 도구를 사용하지 말아야 할 때" 명시
- [ ] 재측정 → 개선 확인

### Phase 3: 시스템 프롬프트 튜닝
- [ ] 도구 선택 우선순위 규칙 추가
- [ ] 폴백 규칙 추가 (0건 → RAG 검색 시도)
- [ ] 프롬프트 길이 최적화 (4.1-mini 특성 고려)
- [ ] 재측정 → 개선 확인

### Phase 4: 최종 검증
- [ ] 목표 정확도 달성 확인
- [ ] 배포 및 실환경 테스트

---

## 3. 테스트 방법론

### Ground Truth 형식
```json
{
  "id": "TC-001",
  "question": "캐치업코리아 자동차 정보 알려줘",
  "expected_tool": "unified_search",
  "expected_params": { "query": "캐치업코리아 자동차" },
  "category": "정보 검색",
  "notes": "포괄적 정보 요청 → 통합검색 우선"
}
```

### 측정 방식
- 4.1-mini에 시스템 프롬프트 + 도구 definitions + 질문 전송
- **도구 실행 없이** 첫 번째 tool_call만 확인
- 기대 도구와 비교 → 정확도 산출

### 테스트 카테고리
1. **정보 검색** — "~정보 알려줘", "~에 대해 알려줘"
2. **계약 조회** — "계약 목록", "보유 계약"
3. **고객 관리** — "고객 검색", "고객 등록"
4. **문서 검색** — "문서 찾아줘", "서류 검색"
5. **관계/메모** — "가족관계", "메모 추가"
6. **경계 케이스** — 도구 간 혼동 가능한 질문

---

## 4. 현황

### 테스트 데이터
- 고객: 캐치업코리아 (ID: `698f3ed781123c52a305ab1d`)
- 문서(files): 11건 (청약서, 등기부등본, 사업자등록증, 정관, CRS 등)
- AR: 1건 (김보성 명의, 계약 6건, 월보험료 180만원)
- CRS: 0건, 메모: 0건, 관계: 0건
- GT 질문에 사용된 고객: 캐치업코리아, 김보성, 안영미, 변수현, 김영순, 신상철, 정부균, 고영자, 한진구, 곽승철

### 측정 결과

| 단계 | 정확도(전체) | 정확도(도구호출) | 정답 | 오답 | 미선택 | 비고 |
|------|------------|----------------|------|------|-------|------|
| Before v1 (GT v1) | 44.4% | 56.3% | 40 | 31 | 19 | GT 설계 오류 포함 |
| **Before v2 (GT v2)** | **87.8%** | **89.8%** | **79** | **9** | **2** | **올바른 기준선** |
| Phase 2 후 | - | - | - | - | - | |
| Phase 3 후 | - | - | - | - | - | |

### GT v1 → v2 변경 사항
- Alex/Gini 검증 결과: `customerId` required 도구(9개)에 대해 `search_customers`를 먼저 호출하는 것은 올바른 동작
- `acceptable_first_calls` 필드 도입: 허용되는 첫 번째 도구 호출 목록 명시
- 29건의 기술적 오류 수정 (이중 기준 제거)

### Before v2 오류 분석

#### 오답 9건 — 핵심 패턴: unified_search를 써야 하는데 다른 도구 선택

| TC | 질문 | 기대 | 선택 | 패턴 |
|----|------|------|------|------|
| TC-001 | 캐치업코리아 자동차 정보 알려줘 | unified_search | list_contracts | "정보" → 계약으로 오해 |
| TC-042 | 종신보험 찾아줘 | unified_search | search_products | "보험" → 상품으로 오해 |
| TC-048 | 캐치업코리아 정관 내용 요약해줘 | unified_search | search_documents | 유사 도구 혼동 |
| TC-052 | 김보성 보험금 청구한 내역 알려줘 | unified_search | search_customers | 고객명 → search_customers |
| TC-061 | 캐치업코리아 자동차보험 가입되어 있어? | unified_search | list_contracts | "보험 가입" → 계약으로 오해 |
| TC-063 | 변수현 청약서 보여줘 | unified_search | search_customers | 고객명 → search_customers |
| TC-067 | 곽승철 보험 증권 문서 찾아줘 | unified_search | search_customers | 고객명 → search_customers |
| TC-070 | 연금보험 가입한 고객 있어? | unified_search | list_contracts | "보험 가입" → 계약으로 오해 |
| TC-086 | 변수현 메모 정리 문서 찾아줘 | unified_search | search_customers | 고객명 → search_customers |

#### 도구 미선택 2건
| TC | 질문 | 기대 | 원인 |
|----|------|------|------|
| TC-029 | 고객 등록해줘. 이름은 홍길동 | create_customer | 텍스트 응답 (도구 안 씀) |
| TC-041 | 캐치업코리아 주소 변경해줘 | search_customers | 텍스트 응답 (도구 안 씀) |

#### 개선 포인트
1. **"~정보", "~문서", "~서류", "~찾아줘" → unified_search 우선** (TC-001,052,063,067,086)
2. **"~보험 가입" ≠ 계약 목록, "~찾아줘" ≠ 상품 검색** (TC-042,061,070)
3. **search_documents vs unified_search 구분** (TC-048)

---

## 5. 파일 위치

| 파일 | 설명 |
|------|------|
| `docs/AI_ASSISTANT_TOOL_SELECTION_TUNING.md` | 이 문서 (계획 + 결과) |
| `tools/ai_assistant_tuning/ground_truth.json` | GT 테스트셋 |
| `tools/ai_assistant_tuning/test_tool_selection.py` | 자동 테스트 스크립트 |
| `backend/api/aims_mcp/src/tools/*.ts` | MCP 도구 definitions |
| `backend/api/aims_api/lib/chatService.js` | 시스템 프롬프트 |
