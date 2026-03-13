# AIMS RAG 검색 품질 개선 계획

> 작성일: 2026-03-13
> 근거: `docs/2026-03-13_RAG_ANSWER_QUALITY_ANALYSIS.md` (3-agent 교차 검증 분석 보고서)

## Context

RAG 검색 답변 품질이 불만족스러운 상황. 3-agent 교차 검증으로 7가지 병목을 식별 완료.
**핵심 원인**: preview 240자 제한(청크의 16%만 LLM 전달), 약한 시스템 프롬프트, 보수적 파라미터.

---

## Phase 1: 파라미터 튜닝 (즉시, ~1시간, 재임베딩 불필요)

**예상 효과: +20~25%**

### 1-1. max_tokens 확대
- **파일**: `backend/api/aims_rag_api/rag_search.py:358`
- **변경**: `max_tokens=500` → `max_tokens=1500`
- **근거**: 실사용 토큰만 과금, 복잡한 답변 잘림 방지

### 1-2. LLM 컨텍스트 문서 수 확대
- **파일**: `backend/api/aims_rag_api/rag_search.py:534`
- **변경**: `LLM_CONTEXT_LIMIT = 5` → `LLM_CONTEXT_LIMIT = 8`
- **근거**: 현재 preview 240자 기준 8개 = ~2,000자(~1,000토큰), 비용 미미

### 1-3. 시스템 프롬프트 개선
- **파일**: `backend/api/aims_rag_api/rag_search.py:341-345`
- **현재**: 1문장 ("추측하지 마")
- **변경**: 보험 도메인 전문 프롬프트 (역할 정의, 답변 규칙, 형식 가이드)

### Phase 1 배포
1. `rag_search.py` 3곳 수정
2. `scp` → 서버 전송
3. `deploy_aims_rag_api.sh` 실행
4. 검증 쿼리 실행 후 답변 비교

---

## Phase 2: Preview 확대 + 텍스트 전처리 + 재임베딩 (~3시간)

**예상 효과: +25~35% (Phase 1 포함 누적 +45~55%)**

### 2-1. Preview 240자 → 청크 전체(1500자)
- **파일**: `backend/embedding/save_to_qdrant.py:80`
- **변경**: `payload['preview'] = chunk['text'][:240]` → `payload['preview'] = chunk['text']`
- **연쇄 영향**:
  - `reranker.py:62`: `preview[:500]`으로 이미 제한 → 변경 불필요
  - LLM 컨텍스트: 8개 x 1500자 = 12,000자 ~ 6,000토큰 → 128K 대비 미미
  - Qdrant 용량: +1.4MB → 무시 가능

### 2-2. 규칙 기반 텍스트 전처리 추가
- **파일**: `backend/embedding/split_text_into_chunks.py`
- **처리 항목** (AI 미사용, 환각 위험 없음):
  1. `\r\n` → `\n` 정규화
  2. 연속 탭 → 단일 공백 (Excel 노이즈 해소)
  3. 연속 공백(3+) → 단일 공백
  4. 연속 빈 줄(4+) → 3줄로 축소
  5. 반복 라인 제거 (10자+ 동일 라인 4회+ 반복 → 2회까지만 유지)

### 2-3. 전체 재임베딩
- MongoDB에서 `docembed.status` 초기화 → 크론이 자동 재처리
- 예상 소요: ~5분 (985개 벡터), 비용 ~$0.01

---

## Phase 3: 아키텍처 개선 (Phase 2 효과 측정 후 판단)

### 3-1. RAG 모델 업그레이드 (선택)
- `gpt-4.1-nano` → `gpt-4.1-mini` (비용 4배 vs +15~20% 품질)

### 3-2. Qdrant에 customer_id 추가 (선택)
- MongoDB 우회 조회 제거 → 검색 속도 개선

### 3-3. 프론트엔드 N+1 해소 (선택)
- 개별 API 호출 → 배치 API

---

## 검증 전략

### 기준 쿼리 세트
1. "캐치업코리아 보험료 전체 내역" (entity + 표 형식)
2. "김보성 대표님 계약 내용" (특정 인물)
3. "화재보험 보장 내용" (concept 검색)
4. "급여대장에서 직원 수" (Excel 노이즈 문서)
5. "존재하지 않는 정보 질문" (환각 방지 테스트)

### 비교 기준
- 답변 길이 (잘림 여부)
- 정량적 정보 정확도 (금액, 날짜)
- 환각 여부 (문서에 없는 정보 생성)
- 응답 시간

---

## 비용 영향

| Phase | 항목 | 추가 비용 |
|-------|------|----------|
| 1 | max_tokens, LLM_CONTEXT_LIMIT, 프롬프트 | 무시 |
| 2 | preview 확대 + 재임베딩 | 검색당 ~$0.0001 + 일회성 ~$0.01 |
| 3 | nano → mini | 검색당 비용 4배 |

**Phase 1~2는 비용 증가 사실상 없음.**

---

## 롤백 계획

- **Phase 1**: 파라미터 원복 → 재배포 (5분)
- **Phase 2**: preview `[:240]` 원복 + 전처리 제거 → 재임베딩 (10분)
- **Phase 3**: DB 설정 원복 (1분)

---

## 수정 대상 파일 요약

| 파일 | Phase | 변경 내용 |
|------|-------|----------|
| `backend/api/aims_rag_api/rag_search.py` | 1 | max_tokens, LLM_CONTEXT_LIMIT, system_prompt |
| `backend/embedding/save_to_qdrant.py` | 2 | preview 240→전체 |
| `backend/embedding/split_text_into_chunks.py` | 2 | preprocess_text() 추가 |
| `backend/embedding/full_pipeline.py` | 3 | customer_id 메타데이터 |
