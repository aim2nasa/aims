# RAG 검색 타이밍 베이스라인 측정 보고서

> 측정일: 2026-03-21
> 버전: aims-rag-api v0.1.29 (c6340a51)

## 1. 목적

유형별 청킹 파라미터 도입(커밋 15566e6c) 전, 현재 RAG 파이프라인의 단계별 소요 시간을 측정하여 베이스라인을 확보한다. 재임베딩 후 품질/성능 비교 기준으로 활용.

## 2. 테스트 환경

| 항목 | 값 |
|------|-----|
| 서버 | tars (Ubuntu, Tailscale 100.110.215.65) |
| RAG API | Docker 컨테이너 (aims-rag-api) |
| Qdrant | localhost:6333, 컬렉션 `docembed`, **12,161 포인트** |
| 임베딩 모델 | text-embedding-3-small (1,536차원) |
| LLM | gpt-3.5-turbo |
| Cross-Encoder | ms-marco-MiniLM-L-12-v2 (**CPU 모드**) |

## 3. 테스트 방법

### 3.1 타이밍 로그 추가

`hybrid_search.py`에서 OpenAI 임베딩 API 호출 시간을 별도 측정(`last_embedding_ms`), `rag_search.py`에서 각 단계 종료 후 ms 단위로 출력:

```
⏱️ [Timing] 임베딩={ms} | Qdrant검색={ms} | 재순위화={ms} | LLM답변={ms} | 전체={ms}
```

### 3.2 검색 요청

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${RAG_API_KEY}" \
  -d '{"query": "암 진단비 지급 기준", "search_mode": "semantic", "user_id": "695cfe260e822face7a78535"}'
```

### 3.3 로그 확인

```bash
docker logs aims-rag-api --tail 20
```

## 4. 측정 결과

### 4.1 개별 측정 로그 (컨테이너 재시작 후 단독 실행, 4회)

| # | 쿼리 | 임베딩 | Qdrant | 재순위화 | LLM | 전체 |
|---|------|--------|--------|---------|-----|------|
| 1 | 암 진단비 지급 기준 (cold) | 772ms | 164ms | 22,582ms | 8,373ms | 34,187ms |
| 2 | 암 진단비 지급 기준 (cache) | 0ms | 135ms | 22,583ms | 10,563ms | 33,282ms |
| 3 | 퇴직연금 부담금 납입 확인 | 829ms | 141ms | 22,959ms | 5,451ms | 31,043ms |
| 4 | 자동차보험 대인배상 한도 | 163ms | 156ms | 22,761ms | 4,698ms | 29,370ms |

### 4.2 단계별 평균 소요 시간

| 단계 | 평균 | 전체 대비 | 비고 |
|------|------|-----------|------|
| 임베딩 (OpenAI API) | **~440ms** | 1.4% | cold ~800ms, cache hit 0ms |
| Qdrant 벡터 검색 | **149ms** | 0.5% | 12,161 포인트 대상 |
| Cross-Encoder 재순위화 | **22,721ms** | **71%** | CPU 모드 — **최대 병목** |
| LLM 답변 생성 | **7,271ms** | 23% | gpt-3.5-turbo |
| **전체** | **31,971ms** | 100% | |

### 4.2 RAG 검색 품질 (test_rag_quality.py)

8개 보험 관련 질문으로 Qdrant 직접 검색 (필터 없음, 상위 3개):

| # | 질문 | Top1 score | Top1 유형 | 관련성 |
|---|------|-----------|-----------|--------|
| Q1 | 사망보험금 수익자 변경 방법 | 0.573 | insurance_etc | 정확 |
| Q2 | 입원일당 청구 조건 | 0.392 | family_cert | **미스매치** |
| Q3 | 자동차보험 대인배상 한도 | 0.577 | general | 양호 |
| Q4 | 암 진단비 지급 기준 | 0.599 | annual_report | 정확 |
| Q5 | 건강검진 결과 해석 | 0.464 | plan_design | 부분적 |
| Q6 | 법인 사업자등록증 변경 | 0.488 | corp_basic | 정확 |
| Q7 | 퇴직연금 부담금 납입 확인 | 0.640 | hr_document | 정확 |
| Q8 | 보장분석 보고서 비교 | 0.546 | coverage_analysis | 정확 |

- 8개 중 6개 정확, 1개 양호/부분적, 1개 미스매치
- 평균 Top1 score: **0.535**

## 5. 분석

### 5.1 성능 병목

**Cross-Encoder 재순위화가 전체의 71%를 차지.** CPU 모드에서 결과 재순위화에 일관되게 ~23초 소요 (서버 부하 무관). 개선 방안:
- `RERANK_LIMIT`를 50 → 20으로 축소
- GPU 환경으로 전환
- 경량 모델 사용 (TinyBERT 등)

### 5.2 검색 품질

- Q2 "입원일당 청구 조건"이 주민등록등본과 매칭 (score 0.39) — 해당 주제의 문서가 DB에 부재할 가능성
- Q7 "퇴직연금 부담금 납입 확인"이 최고 score 0.64 — 문서명과 내용이 정확히 일치하는 경우 높은 점수

## 6. 다음 단계

1. `reembed_all.py`로 유형별 청킹 파라미터 적용 후 재임베딩
2. 동일 8개 질문으로 재측정하여 score 변화 비교
3. 재순위화 병목 개선 검토

## 7. 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/embedding/test_rag_quality.py` | Qdrant 직접 검색 품질 테스트 |
| `backend/embedding/reembed_all.py` | 전체 재임베딩 스크립트 |
| `backend/api/aims_rag_api/rag_search.py` | 타이밍 로그 출력 |
| `backend/api/aims_rag_api/hybrid_search.py` | 임베딩 시간 별도 측정 |
