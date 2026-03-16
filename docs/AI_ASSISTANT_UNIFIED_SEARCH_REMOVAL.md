# unified_search 제거 및 search_documents 강화 설계안

> **작성일**: 2026-03-16
> **상태**: Phase 5 완료 (Phase 6 vitest/CI 미진행)
> **관련 이슈**: `AI_ASSISTANT_UNIFIED_SEARCH_ISSUE.md`

---

## 1. 이슈 요약

### 발견 경로
Playwright E2E 테스트 (Q-019, Q-020)에서 발견.

### 증상
AI 어시스턴트에서 "캐치업코리아 보험증권 문서 찾아줘", "캐치업코리아 자동차 관련 문서 찾아줘" 질문 시, **AI(시맨틱) 검색 결과가 쿼리와 완전히 무관한 세무조정계산서를 반환**.

### 재현 케이스

**Q-019: "캐치업코리아 보험증권 문서 찾아줘"**
- 키워드 검색: 부분 관련 (취업규칙, 주당가치평가 등 노이즈 포함)
- AI 검색: **세무조정계산서 3건 상위 고정** (보험증권 무관)

**Q-020: "캐치업코리아 자동차 관련 문서 찾아줘"**
- 키워드 검색: 정확 (자동차등록증, 자동차증권 등)
- AI 검색: **동일한 세무조정계산서 3건 반복** (자동차 무관)

### AI 검색 부정확 원인
1. `text-embedding-3-small` 임베딩이 긴 문서(5000자+)에 범용적 벡터 생성
2. `cross-encoder/ms-marco-MiniLM-L-12-v2`가 영어 전용 — 한국어 재랭크 무효
3. 긴 문서 = 청크 수 많음 = Qdrant에서 매칭 기회 구조적 편향

---

## 2. 근본 원인 분석

### 본질적 문제
"특정 고객의 문서를 키워드로 검색"하는 적합한 MCP 도구가 없어서 AI가 `unified_search`를 호출. unified_search의 AI(Qdrant) 검색이 부정확한 결과 반환.

### 에이전트 리뷰 결과 (4명)

| 에이전트 | 핵심 의견 |
|---------|----------|
| **Alex** | `search_documents`에 이미 `customerId` + `keyword` 모드 존재. 새 도구보다 기존 확장이 최선 |
| **Gini** | FAIL 판정. Qdrant 품질 문제는 `customerId` 추가로 해결 불가. unified_search 자체가 문제 |
| **Sora** | 설계사 90%가 "고객명 + 서류종류" 패턴. 키워드만으로 충분. 엉뚱한 결과보다 "없습니다"가 나음 |
| **Dana** | FAIL 판정. "키워드/AI" 분리 표시가 UX 위반. 시스템 내부 구현을 사용자에게 노출 |

### 결론
**unified_search를 삭제**하고, 기존 `search_documents(keyword + customerId)`로 대체.

---

## 3. 설계

### 핵심 변경
- **삭제**: `unified_search` MCP 도구
- **강화**: `search_documents`가 모든 문서 검색 담당

### AI 동작 흐름 (변경 후)
```
사용자: "캐치업코리아 보험증권 문서 찾아줘"

1단계: search_customers(query="캐치업코리아") → customerId 획득
2단계: search_documents(query="보험증권", customerId="xxx", searchMode="keyword")
→ SmartSearch가 해당 고객 문서에서 키워드 검색 → 정확한 결과
```

### 변경 파일

| 파일 | 변경 |
|------|------|
| `aims_mcp/src/tools/unified_search.ts` | **삭제** |
| `aims_mcp/src/tools/index.ts` | unified_search 등록 제거 |
| `aims_mcp/src/tools/documents.ts` | description 강화 (고객 문서 검색 가이드) |
| `aims_api/lib/chatService.js` | 시스템 프롬프트 unified_search 가이드 제거 → search_documents 가이드로 교체 + RAG 폴백 변경 |

### search_documents description 개선안
```
문서를 검색합니다.

■ 고객의 문서를 찾을 때:
  1. search_customers로 고객 ID를 먼저 조회
  2. search_documents(query="키워드", customerId="고객ID", searchMode="keyword")
  예: "캐치업코리아 보험증권" → customerId 지정 + query="보험증권"

■ 검색 모드:
  - keyword: 파일명/내용에서 키워드 매칭 (기본, 권장)
  - semantic: AI 기반 의미 검색
```

### RAG 폴백 변경
```
chatService.js:
- 변경 전: callMCPTool('unified_search', { query, limit: 5 })
- 변경 후: callMCPTool('search_documents', { query, searchMode: 'keyword', limit: 10 })
```

---

## 4. 증명 계획

### Phase 0: 사전 증명 (구현 전)

SmartSearch의 `customer_id` 필터가 실제로 올바른 결과를 반환하는지 확인.

| 테스트 | 호출 | PASS 기준 |
|--------|------|-----------|
| 0-1 | SmartSearch: query="보험증권", customer_id=캐치업코리아 | 보험증권 문서 반환, 세무조정계산서 없음 |
| 0-2 | RAG API: query="보험증권", mode=keyword, customer_id=캐치업코리아 | 동일 |
| 0-3 | SmartSearch: query="자동차", customer_id=캐치업코리아 | 자동차 문서 반환, 세무조정계산서 없음 |

**FAIL 시 구현 진입 금지. SmartSearch 자체 수정이 먼저 필요.**

### Phase 1: GT v4 기준선 측정 (구현 전)

```
python tools/ai_assistant_tuning/test_tool_selection.py
→ 90건 기준 정확도 기록 (기준선)
→ GT에서 unified_search를 기대 답으로 가진 케이스 식별 → GT 업데이트 계획
```

### Phase 2: 구현

Phase 0, 1 모두 PASS한 경우에만 진입.

### Phase 3: 단위 검증 (구현 후)

| 테스트 | PASS 기준 |
|--------|-----------|
| 3-1 | MCP 도구 목록에 unified_search 없음 |
| 3-2 | "캐치업코리아 보험증권 찾아줘" → search_customers + search_documents 호출, 보험증권 문서 반환, 세무조정계산서 없음 |
| 3-3 | "캐치업코리아 자동차 문서 찾아줘" → 자동차 문서 반환, 세무조정계산서 없음 |

### Phase 4: GT 재측정 (회귀 테스트)

```
GT 업데이트 (unified_search → search_documents 기대답 변경)
→ 90건 재측정
→ Phase 1 기준선 대비 2건 이상 악화 시 즉시 롤백
```

### Phase 5: Playwright E2E (최종 검증)

| 테스트 | PASS 기준 |
|--------|-----------|
| Q-019 재현 | "캐치업코리아 보험증권 문서 찾아줘" → 보험증권 문서 포함, 세무조정계산서 없음 |
| Q-020 재현 | "캐치업코리아 자동차 관련 문서 찾아줘" → 자동차 문서 포함, 세무조정계산서 없음 |

### Phase 6: Regression 테스트 자동화

Phase 5까지 PASS 후, 테스트를 자동화에 영구 등록.

**6-1: vitest 테스트 작성** (`aims_mcp/src/__tests__/`)
```typescript
// search-documents-customer-keyword.test.ts
describe('search_documents - 고객별 키워드 검색', () => {
  test('보험증권 검색 시 해당 고객 문서만 반환')
  test('자동차 검색 시 자동차 관련 문서만 반환')
  test('세무조정계산서가 상위에 나오지 않음')
  test('unified_search 도구가 등록되어 있지 않음')
})
```

**6-2: GT v5 업데이트** (`tools/ai_assistant_tuning/ground_truth.json`)
- unified_search 기대답 → search_documents로 변경
- Q-019, Q-020 패턴 테스트 케이스 추가

**6-3: CI 연동**
- GT 도구 선택 테스트를 `npm test`에 포함
- 향후 도구 변경 시 자동 회귀 검증

### 전체 흐름
```
Phase 0 (사전 증명) → PASS?
  → Phase 1 (기준선) → 기록
    → Phase 2 (구현)
      → Phase 3 (단위 검증) → PASS?
        → Phase 4 (GT 재측정) → 악화 없음?
          → Phase 5 (Playwright E2E) → PASS?
            → Phase 6 (Regression 자동화) → 테스트 등록
              → 완료

어느 Phase에서든 FAIL → 즉시 중단/롤백
```

---

## 5. 구현 결과

### Phase 0 결과 (2026-03-16)
- [x] 테스트 0-1: PASS — SmartSearch(보험증권 + 캐치업코리아) → 보험 관련 문서 반환, 세무조정계산서 0건
- [x] 테스트 0-2: PASS — RAG API(keyword + customer_id) → 보험증권 5건, 세무조정계산서 0건
- [x] 테스트 0-3: PASS — SmartSearch(자동차 + 캐치업코리아) → 자동차 문서만 반환, 세무조정계산서 0건

### Phase 1 결과 (2026-03-16)
- [x] GT v4 기준선: 61/90 (67.8%), 도구 호출 시 61/63 (96.8%), No Tool 27건

### Phase 2 구현 (2026-03-16)
- [x] unified_search.ts 삭제 (-499 lines)
- [x] index.ts 수정 (import/등록 제거)
- [x] http.ts 수정 (import/등록 제거)
- [x] documents.ts description 강화 + searchMode 기본값 keyword 변경
- [x] chatService.js 시스템 프롬프트 교체 + RAG 폴백 변경 (unified_search → search_documents)

### Phase 3 결과 (2026-03-16)
- [x] 테스트 3-1: PASS — MCP 도구 33개, unified_search 없음
- [x] 테스트 3-2: PASS — 보험증권 검색 5건, 세무조정계산서 0건
- [x] 테스트 3-3: PASS — 자동차 검색 5건, 세무조정계산서 0건

### Phase 4 결과 (2026-03-16)
- [x] GT 재측정 정확도: **85/90 (94.4%)** — 도구 호출 시 85/87 (97.7%)
- [x] 기준선 대비 변화: **+26.6% 향상** (67.8% → 94.4%), No Tool 27건 → 3건

### Phase 5 결과 (2026-03-16)
- [x] Q-019 E2E: PASS — 보험증권 5건, 세무조정계산서 0건
- [x] Q-020 E2E: PASS — 자동차 5건, 세무조정계산서 0건

### Phase 6 결과 (2026-03-16)
- [x] GT v2.1 업데이트: unified_search → search_documents 29건 변경 완료
- [ ] vitest 테스트 작성: Phase 6-1 미진행 (기존 e2e 테스트가 unified_search 참조, 별도 PR로 정리)
- [ ] CI 연동: 별도 작업으로 진행

---

## 6. 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/api/aims_mcp/src/tools/unified_search.ts` | 삭제 대상 |
| `backend/api/aims_mcp/src/tools/index.ts` | 도구 등록 |
| `backend/api/aims_mcp/src/tools/documents.ts` | search_documents 도구 (강화 대상) |
| `backend/api/aims_api/lib/chatService.js` | 시스템 프롬프트 + RAG 폴백 |
| `backend/api/document_pipeline/routers/smart_search.py` | SmartSearch (customer_id 필터 지원) |
| `backend/api/aims_rag_api/rag_search.py` | RAG API (keyword 모드 → SmartSearch 중계) |
| `tools/ai_assistant_tuning/ground_truth.json` | GT v4/v5 (도구 선택 정답) |
| `docs/AI_ASSISTANT_UNIFIED_SEARCH_ISSUE.md` | 원본 이슈 문서 |
| `docs/AI_ASSISTANT_TOOL_SELECTION_TUNING.md` | 도구 선택 튜닝 이력 |
