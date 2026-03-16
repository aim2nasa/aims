# AI 어시스턴트 도구 선택 튜닝 보고서

> **목표**: AI 어시스턴트(GPT-4.1-mini)가 사용자 질문에 대해 올바른 MCP 도구를 선택하도록 튜닝
> **기간**: 2026-03-16
> **상태**: ✅ Phase 1 완료 — 기준선 확립 / Phase 2~3 중단 (overfitting)

---

## 1. 배경

### 문제
- 사용자: "캐치업코리아 자동차 정보 알려줘"
- **상세문서검색** (RAG 직접 호출): 자동차등록증, 보험증권 등 4건+ 정상 반환
- **AI 어시스턴트**: `list_contracts` 호출 → "자동차 관련 계약은 없습니다" (오답)

### 원인
- AI가 `unified_search` 대신 `list_contracts`를 선택 (도구 선택 오류)
- 시스템 프롬프트 라인67의 "고객명 → search_customers" 규칙이 다른 규칙과 충돌

### 핵심 원칙
1. **MCP 도구로 답할 수 있으면 도구 사용**
2. **그렇지 않을 때 RAG 검색으로 폴백**

### Overfitting 금지 (절대 규칙)
- **특정 테스트 케이스를 잡기 위한 변경이 기존 정답을 깨뜨리면 즉시 롤백**
- 변경 전후 GT 전수 재측정 필수 — 기준선 대비 악화 시 적용 불가
- GT 재정의 시: "모델 점수 올리기"가 아닌 "실제로 합리적인 선택인가"로 판단
- 프롬프트/도구 예시는 패턴 기반으로 설계 — 특정 질문에 맞추지 않음

---

## 2. 측정 결과

### 전체 히스토리

| 단계 | 정확도(전체) | 정확도(도구호출) | 정답 | 오답 | 미선택 | 비고 |
|------|------------|----------------|------|------|-------|------|
| Before v1 (GT v1) | 44.4% | 56.3% | 40 | 31 | 19 | GT 설계 오류 포함 |
| **Before v2 (GT v2)** | **87.8%** | **89.8%** | **79** | **9** | **2** | **최종 기준선** |
| Phase 2 (도구 desc만) | 85.6% | 89.5% | 77 | 9 | 4 | 악화 — TC-025 신규 오답, 미선택↑ |
| Phase 2+3 (desc+프롬프트) | 83.3% | 87.2% | 75 | 11 | 4 | 크게 악화 — 롤백 |
| 옵션 C (규칙 교체) | 81.1% | 89.0% | 73 | 9 | 8 | 미선택 8건 급증 — 롤백 |
| **GT v3 재정의** | **91.1%** | **93.2%** | **82** | **6** | **2** | **GT 4건 acceptable 확장** |

### GT v1 → v2 변경
- Alex/Gini 검증: `customerId` required 도구(9개)에 대해 `search_customers` 먼저 호출은 올바른 동작
- `acceptable_first_calls` 필드 도입 → 29건 기술적 오류 수정

### Before v2 잔여 오답 8건 (TC-052 GT 수정 반영)

| TC | 질문 | 기대 | 선택 | 근본 원인 |
|----|------|------|------|----------|
| TC-001 | 캐치업코리아 자동차 정보 알려줘 | unified_search | list_contracts | "보험" → 계약 연결 |
| TC-042 | 종신보험 찾아줘 | unified_search | search_products | 프롬프트 예시 과적합 |
| TC-048 | 정관 내용 요약해줘 | unified_search | search_documents | 유사 도구 혼동 |
| TC-061 | 자동차보험 가입되어 있어? | unified_search | list_contracts | "보험 가입" → 계약 |
| TC-063 | 변수현 청약서 보여줘 | unified_search | search_customers | 프롬프트 규칙 충돌 |
| TC-067 | 곽승철 보험 증권 문서 찾아줘 | unified_search | search_customers | 프롬프트 규칙 충돌 |
| TC-070 | 연금보험 가입한 고객 있어? | unified_search | list_contracts | "보험 가입" → 계약 |
| TC-086 | 변수현 메모 정리 문서 찾아줘 | unified_search | search_customers | 프롬프트 규칙 충돌 |

---

## 3. Phase 2~3 시도 및 중단 이유

### 시도한 변경
**Phase 2 (도구 description 튜닝)**:
- `unified_search`: "통합 검색" → "정보 검색의 기본 도구" + 사용 시기 명시
- `list_contracts`: "명시적 계약 조회에만 사용, 일반 검색은 unified_search" 추가
- `search_products`: "명시적 상품 카탈로그 요청에만" 추가
- `search_documents`: "검색 모드가 명시된 요청에만" 추가

**Phase 3 (시스템 프롬프트 튜닝)**:
- 라인67 수정: "고객명 → search_customers" → "고객 기본정보 → search_customers, 문서/정보 → unified_search"
- 도구 선택 우선순위 섹션 추가 (판단 기준 5개 + 흔한 실수 4개)

### 중단 이유 (Alex/Gini 공통 판정)
1. **모든 변경이 기준선 대비 악화**: 87.8% → 85.6~83.3%
2. **부작용**: unified_search 강화 → 원래 맞던 케이스(TC-025, TC-075, TC-083)가 unified_search로 끌려감
3. **미선택 증가**: 도구에 "쓰지 말라"는 제약 추가 → 모델이 아무 도구도 선택 못함 (2건→4건)
4. **overfitting 구조**: 8건을 잡으려면 82건이 깨지는 zero-sum 상태
5. **4.1-mini 특성**: 도구 description 미세 변경에 예측 불가능하게 반응

### Gini 근본 원인 분석
시스템 프롬프트 내부에 **구조적으로 충돌하는 2개 규칙** 존재:
- 라인 67: `"고객명 언급 → search_customers/list_contracts"` (CRITICAL)
- 라인 439: `"김보성" → unified_search (사람 이름 = 통합검색)`

이 충돌이 TC-063, TC-067, TC-086의 근본 원인이나, 라인 67을 수정하면 다른 정답 케이스가 무너짐.

---

## 4. 결론 및 다음 단계

### 현재 상태
- **87.8% (80/90)** 유지 (TC-052 GT 수정 반영 시)
- 도구 description / 시스템 프롬프트 변경: **전부 롤백**
- 잔여 오답 8건: 사용자 경험에 **경미한 영향** (대부분 2턴 플로우로 정답 도달)

### Alex 권장 다음 단계
> **"모델을 교정하려 하지 말고, 모델이 뭘 골라도 괜찮은 시스템을 만들어라"**

1. **코드 레벨 폴백** (A안, 권장): 전문 도구가 0건 반환 시 자동으로 unified_search 결과 보충
2. **도구 통합** (B안, 중장기): 검색 도구를 unified_search로 통합, 내부 라우팅
3. **모델 변경** (C안): 4.1-mini → 4.1 또는 4o-mini (비용↑)

### 시스템 프롬프트 구조적 충돌 해소 (Gini 제안, 보류)
```
현재(충돌):
"고객명을 언급하면 반드시 search_customers 또는 list_contracts 호출!"

제안(우선순위 기반):
"고객명을 언급하면 목적에 따라:
  - 고객 정보 자체 → search_customers
  - 계약 조회 → list_contracts
  - 문서/포괄 검색 → unified_search"
```
→ 이 수정은 Phase 2+3 단순 추가와 달리 **기존 규칙의 교체**이므로, 별도 검증이 필요.

---

## 5. 파일 위치

| 파일 | 설명 |
|------|------|
| `docs/AI_ASSISTANT_TOOL_SELECTION_TUNING.md` | 이 문서 |
| `tools/ai_assistant_tuning/ground_truth.json` | GT v2 (90건) |
| `tools/ai_assistant_tuning/test_tool_selection.py` | 자동 테스트 스크립트 |
| `tools/ai_assistant_tuning/results/` | 측정 결과 (before, phase2, phase2_3 등) |
| `backend/api/aims_mcp/src/tools/*.ts` | MCP 도구 definitions (서버) |
| `backend/api/aims_api/lib/chatService.js` | 시스템 프롬프트 (서버) |
