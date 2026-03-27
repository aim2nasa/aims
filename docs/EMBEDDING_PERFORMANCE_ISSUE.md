# 임베딩 파이프라인 성능 개선 이슈

> 작성일: 2026-03-27 | 상태: **구현 결정** | 분석: Alex, Gini

## 문제

대량 업로드 시 임베딩 처리가 병목이 되어 사용자 화면에서 90% 상태가 오래 유지됨.

### 현상
- 393개 문서 일괄 업로드 → embed_pending 2,288건 누적
- 사용자 화면에서 90%(embed_pending) → 100%(completed) 전환이 수십 분~수 시간 소요
- 일상적 소량 업로드에서는 체감되지 않으나, 일괄등록 시 심각

## 현재 아키텍처

```
크론 (1분 간격, flock)
    ↓
full_pipeline.py: 대상 문서 전체 조회 (LIMIT 없음) + 매분 최소 7개 MongoDB 쿼리
    ↓
for doc in documents:           # 문서별 순차
    check_credit()              # 문서마다 HTTP 호출 (캐시 없음)
    chunks = split(text)        # 청크 분할
    for chunk in chunks:        # 청크별 순차
        embed(chunk)            # OpenAI API 1건씩 호출 ← 최대 병목
    delete_old_chunks()         # Qdrant 삭제 (비원자적)
    qdrant.upsert(chunks)       # 배치 upsert
```

## Alex 분석: 현재 구현 문제점

### 성능 병목 (Critical)

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| 1 | **OpenAI API 청크별 순차 호출** | `create_embeddings.py:38-71` | 20청크 → 20번 HTTP 왕복 (2-4초/문서) |
| 2 | **문서 간 순차 처리** | `full_pipeline.py:415` | 문서 간 의존성 없는데 순차 루프 |
| 3 | **크레딧 체크 캐시 없음** (메인 루프) | `full_pipeline.py:431` | 같은 사용자 10문서 → 10번 동일 HTTP 호출 |
| 4 | **MongoDB count + find 이중 쿼리** | `full_pipeline.py:410-411` | 같은 필터로 2번 쿼리 |
| 5 | **offset 계산 O(n*m)** | `split_text_into_chunks.py:156` | `text.find(chunk)` 선형 탐색 |

### 안정성 문제

| # | 문제 | 위치 | 위험 |
|---|------|------|------|
| 6 | **Rate Limit 시 재시도 없음** | `create_embeddings.py:55-58` | 일시적 에러에도 데이터 유실 |
| 7 | **Qdrant delete→upsert 비원자적** | `save_to_qdrant.py:63-95` | 삭제 성공 + upsert 실패 → 데이터 유실 |
| 8 | **docembed 전체 덮어쓰기** | `full_pipeline.py:438-453` | `$set: {docembed: {...}}` → retry_count 리셋 |
| 9 | **embedding 좀비 상태** | `full_pipeline.py` | 크래시 시 `overallStatus: 'embedding'` 영구 잠김 |
| 10 | **MongoClient 미해제** | `full_pipeline.py:180` | `close()` 없음, GC 의존 |

---

## 구현 결정

### 채택: 3개 항목 (순차 릴리즈)

Alex/Gini 협의 결과, 다음 3개를 아래 순서로 구현한다.

```
Phase A: #2 Rate Limit backoff     → 안정성 확보 (배치 도입 전 필수)
Phase B: #1 OpenAI API 배치 호출   → 성능 20배 향상
Phase C: #3 embedding 좀비 복구    → 운영 안정성
```

| Phase | 항목 | 난이도 | 효과 | 리스크 | 수정 파일 |
|-------|------|--------|------|--------|----------|
| **A** | Rate Limit 재시도 (backoff) | 낮음 | 중간 (안정성) | 낮음 | `backend/embedding/create_embeddings.py` |
| **B** | OpenAI API 배치 호출 | 낮음 | **최대** (20배 속도) | 낮음 | `backend/embedding/create_embeddings.py` |
| **C** | embedding 좀비 상태 복구 | 낮음 | 중간 (운영 안정성) | 낮음 | `backend/embedding/full_pipeline.py` |

### 구현 순서 근거 (Alex 권고)

**#2(backoff)를 #1(배치) 보다 먼저 구현해야 하는 이유:**
- 배치 호출 도입 시 한 번에 보내는 토큰량이 증가하여 rate limit 발생 확률 상승
- 현재 코드는 `RateLimitError` 시 재시도 없이 `None` 처리 → 배치에서 터지면 수십 개 청크가 한번에 유실
- backoff가 준비된 상태에서 배치를 적용해야 안전

### 보류: 문서 병렬 처리 (#4)

**보류 사유 (Gini 권고):**
- race condition: 여러 worker가 같은 문서를 동시에 처리할 위험 (작업 잠금 패턴 필요)
- 크레딧 경쟁 조건: 동시 크레딧 체크 시 한도 초과 가능 (원자적 차감 아님)
- MongoDB 커넥션 풀 고갈 위험
- #1 적용 후 실측하여 여전히 느리면 그때 검토

### 제외 항목

| 항목 | 제외 사유 |
|------|----------|
| 크레딧 체크 캐시 | 효과 낮음 |
| docembed dot notation | 효과 낮음 |
| Qdrant delete 제거 | 난이도 중간, 효과 낮음 |
| offset 누적 계산 | 효과 미미 |
| 크로스 문서 청크 배치 | #1로 대부분 효과 달성 |
| 이벤트 드리븐 전환 | 난이도/리스크 높음, 현재 규모에서 불필요 |

---

## 검증 전략 (Gini 권고)

각 Phase별 순차 배포, 개별 검증 후 다음 Phase 진행:

```
Phase A 검증: 429 에러 후 성공 재시도 로그 확인
Phase B 검증: 처리 시간 baseline 대비 측정 + 임베딩 품질 동일성 확인
Phase C 검증: stuck 상태 문서 수동 생성 → 자동 복구 확인
```

### 롤백 계획

- **Phase B 롤백**: 배치로 생성된 임베딩 품질 이상 시, MongoDB `docembed.status`를 `pending`으로 복원 + Qdrant 해당 벡터 삭제
- **Phase C 롤백**: 복구 조건이 오판 시 정상 문서를 재처리할 수 있으므로, 복구 대상을 먼저 `count()`로 dry-run 후 실행

### 주의사항

- Phase B(배치 호출) 시 **토큰 합산 기반 배치 분할** 필요 — 단순히 "모든 청크를 한 번에"가 아니라 API 토큰 한도 고려
- Phase C(좀비 복구) 시 Qdrant 부분 저장 청크 존재 가능 — 복구 시 Qdrant 기존 벡터 정리 포함 여부 결정 필요

---

## 종합 평가 매트릭스

> 정렬 기준: 난이도 낮음 + 효과 큼 + 리스크 작음

| 순위 | # | 항목 | 난이도 | 효과 | 리스크 | 수정 범위 | 결정 |
|------|---|------|--------|------|--------|----------|------|
| **1** | 1 | OpenAI API 배치 호출 | 낮음 | **최대** (20배 속도) | 낮음 | `backend/embedding/create_embeddings.py` | **채택 (Phase B)** |
| **2** | 2 | Rate Limit 재시도 (backoff) | 낮음 | 중간 (안정성) | 낮음 | `backend/embedding/create_embeddings.py` | **채택 (Phase A)** |
| **3** | 3 | embedding 좀비 상태 복구 | 낮음 | 중간 (운영 안정성) | 낮음 | `backend/embedding/full_pipeline.py` | **채택 (Phase C)** |
| 4 | 9 | 문서 병렬 처리 | 중간 | 높음 (N배) | 중간 | `backend/embedding/full_pipeline.py` | 보류 |
| 5 | 10 | 크로스 문서 청크 배치 | 중간 | 중간 | 중간 | `create_embeddings.py` + `full_pipeline.py` | 제외 |
| 6 | 8 | 이벤트 드리븐 전환 | 높음 | 높음 | 높음 | 전체 재설계 | 제외 |

## 예상 성능 (채택 3개 적용 시)

```
1,000개 문서 (평균 3청크) 기준:

현재:   3,000회 API 호출 × ~150ms = ~450초 (7.5분)
배치:   1,000회 API 호출(문서당 1회) × ~200ms = ~200초 (3.3분)

≈ 2-3배 속도 개선 + Rate Limit 안정성 + 좀비 자동 복구
```

## 영향 범위

| 파일 | 역할 | Phase A | Phase B | Phase C |
|------|------|---------|---------|---------|
| `backend/embedding/create_embeddings.py` | OpenAI API 호출 | O | O | - |
| `backend/embedding/full_pipeline.py` | 메인 루프/상태 관리 | - | - | O |

## 리스크

- OpenAI API rate limit: Tier 1 기준 RPM 500, TPM 1,000,000 → 배치 호출 시 TPM 소비 증가 (Phase A에서 backoff로 방어)
- 배치 중 일부 청크 실패 시 전체 실패 → 에러 핸들링 설계 필요
- 토큰 사용량 로깅이 배치 단위로 변경됨 → 로깅 코드 수정
