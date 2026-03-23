# RAG AI 검색 OOM 크래시 분석 보고서

**날짜**: 2026-03-23
**증상**: 상세 문서검색에서 AI 검색 시 "검색 중 오류가 발생했습니다" 반복 발생
**심각도**: Critical (프로덕션 서비스 크래시)

---

## 1. 증상

사용자가 상세 문서검색 → AI 검색 모드에서 쿼리 입력 시:
- "검색 중 오류가 발생했습니다. 다시 시도해 주세요" 에러 표시
- 서버 프로세스가 죽고 자동 재시작됨
- 재시작 후에도 동일 쿼리 시 동일 크래시 반복

## 2. 서버 로그 분석

```
✅ 키워드 검색 완료: 전체 5개 중 5개 반환
POST /search HTTP/1.0 200 OK

# AI 검색 요청 진입
HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
HTTP Request: POST https://api.openai.com/v1/embeddings "HTTP/1.1 200 OK"
HTTP Request: POST http://localhost:6333/collections/docembed/points/search "HTTP/1.1 200 OK"

📊 쿼리 유형: mixed
🔍 고객명 자동 매칭: ['곽승철'] → customer_id=698edd1a559fc6d089997d61
👨‍👩‍👧‍👦 고객 관계 조회: 곽승철 → 2명 (자녀:곽지민, 배우자:송유미)
🔍 고객 필터 확장: 3명 (본인 + 관계 2명)
🔍 고객 문서 집합: 56개 문서 내 유사도 검색 (고객수: 3)
Batches:   0%|          | 0/1 [00:00<?, ?it/s]

# ← 여기서 프로세스 죽음 (로그 끊김) ←

# 서버 재시작
Use pytorch device: cpu
Started server process [1]
Waiting for application startup.
Application startup complete.
Uvicorn running on http://0.0.0.0:8000
```

**핵심**: Cross-Encoder 배치 처리 시작 직후 프로세스가 죽음.

## 3. 근본 원인

### 3.1 직접 원인: Cross-Encoder predict() 메모리 폭발

**파일**: `backend/api/aims_rag_api/reranker.py` (라인 71)

```python
scores = self.model.predict(pairs)  # ← batch_size 미지정!
```

`sentence_transformers.CrossEncoder.predict()`는 `batch_size` 미지정 시 **기본값 32**를 사용한다.

### 3.2 메모리 계산

```
Cross-Encoder 모델: ms-marco-MiniLM-L-12-v2 (33M 파라미터)
모델 상주 메모리: 33M × 4bytes = 132MB (FP32)

배치 처리 시 활성화 메모리:
  batch_size(32) × max_length(512) × hidden_size(384) × 4bytes × layers(12)
  = 32 × 512 × 384 × 4 × 12
  ≈ 288MB

유휴 시 메모리: ~335MB (docker stats 확인)
배치 처리 시 피크: 335MB + 288MB ≈ 623MB

56개 문서 쌍 처리:
  배치 1: 32개 쌍 → +288MB → 총 ~623MB
  배치 2: 24개 쌍 → 배치 1 tensor 미해제 시 누적 → 총 ~900MB+
```

### 3.3 왜 죽는가

1. **배치 크기가 너무 큼** (32) → 한 번에 ~288MB 메모리 할당
2. **PyTorch tensor 미해제** → 배치 간 메모리 누적
3. **Python GC 미호출** → 가비지 수거 지연
4. **Docker 메모리 제한 없음** → OS OOM Killer가 프로세스 kill
5. **timeout 없음** → 메모리 폭발 전 중단 불가

### 3.4 구조적 문제

| 문제 | 위치 | 설명 |
|------|------|------|
| 배치 크기 미지정 | `reranker.py:71` | 기본값 32 사용, 메모리 피크 ~288MB |
| GC 미호출 | `reranker.py` | predict() 후 torch/gc 정리 없음 |
| 과도한 문서 조회 | `hybrid_search.py:468` | `len(target_doc_ids) * 5`로 과다 조회 |
| timeout 없음 | `rag_search.py:613-630` | reranking 무한 대기 |
| 메모리 제한 없음 | Docker 설정 | OOM Killer 의존 |
| 배치 크기 설정 불가 | 전체 | 환경변수/설정 파일 없음 |

## 4. 영향 범위

- **AI 검색 모드만 영향** (키워드 검색은 정상)
- **문서 수가 많은 고객**일수록 발생 확률 높음 (관계자 포함 시 문서 수 증가)
- 크래시 시 **진행 중인 다른 요청도 함께 실패**
- 서버 재시작까지 **5-10초 다운타임**

## 5. Alex 설계 검토 (2026-03-23)

### 5.1 batch_size 최적값: 8이 아니라 **4**

```
batch_size=32 (현재): 288MB (OOM)
batch_size=8:          72MB (안전)
batch_size=4:          36MB (매우 안전) ← 권장
```

- RERANK_LIMIT=20 (최대 20개 쌍)이므로 batch_size=4면 5배치 × 36MB
- **CPU 환경에서는 배치 크기를 줄여도 속도 저하가 거의 없음** (GPU와 달리 CPU는 배치 병렬화 이점 미미)
- 20개 쌍 처리 시 총 1-2초 (batch_size와 무관)

### 5.2 gc.collect()는 제한적 효과

- PyTorch tensor는 자체 메모리 할당자 사용 → **Python GC로 해제되지 않음**
- `CrossEncoder.predict()`는 내부적으로 `torch.no_grad()` + numpy 변환 수행 → 함수 종료 시 tensor 해제 대상
- 문제는 배치 "간" 누적이 아니라 배치 "내" 메모리 피크
- **gc.collect()는 해가 없으니 방어적으로 추가하되, 근본 해결은 batch_size 축소**

### 5.3 timeout의 한계

`asyncio.wait_for` + `to_thread` 조합의 문제:
- timeout 시 asyncio 태스크는 취소되지만 **실제 스레드는 계속 실행**
- 이전 요청 메모리가 해제되지 않은 채 다음 요청 처리 → **오히려 OOM 확률 증가**
- **timeout보다 입력 제한(RERANK_LIMIT=20 + batch_size=4)이 더 본질적 해결**
- timeout은 "보험"으로 넣되, 스레드 미종료 한계 주석 필수

### 5.4 추가 발견: preview 길이

```python
preview = (payload.get('preview') or '')[:1000]  # 1000자
```
- Cross-Encoder max_length=512 토큰, 한국어 1자 ≈ 1-2토큰 → 512 토큰에서 truncation
- 1000자는 불필요한 문자열 복사 → **500자면 충분**

### 5.5 Alex 최종 판정

> **batch_size=4 한 줄 수정만으로 OOM 근본 해결.**
> RERANK_LIMIT=20 × batch_size=4 = 최대 36MB 피크. 서버 RAM 8GB에서 완전 안전.
> 나머지(gc, timeout, 환경변수, Docker 제한)는 방어 계층.

## 6. 확정 솔루션

| 순위 | 솔루션 | 효과 | 난이도 |
|------|--------|------|--------|
| **P1** | `batch_size=4` | 메모리 피크 **87% 감소** (288→36MB) | 1줄 수정 |
| P2 | `gc.collect()` | 방어적 메모리 정리 | 1줄 추가 |
| P3 | 환경변수화 `RERANKER_BATCH_SIZE` | 운영 중 튜닝 가능 | 3줄 수정 |
| P4 | timeout 10초 | 크래시 → 에러 전환 (스레드 한계 있음) | 5줄 수정 |
| P5 | Docker `--memory=2g` | OOM 격리 | 배포 스크립트 수정 |
| P6 | preview 500자 제한 | 불필요한 복사 방지 | 1줄 수정 |

**P1만으로 근본 해결. P2-P3은 방어 계층으로 함께 적용.**

## 7. 재현 조건

- 쿼리: "곽승철 자동차 보험" (AI 검색 모드)
- 조건: 고객 관계자 포함 문서 56개 이상
- 환경: aims-rag-api Docker 컨테이너 (CPU 모드, 메모리 제한 없음)

## 8. 관련 파일

- `backend/api/aims_rag_api/reranker.py` — Cross-Encoder reranking
- `backend/api/aims_rag_api/rag_search.py` — 검색 엔드포인트
- `backend/api/aims_rag_api/hybrid_search.py` — 하이브리드 검색 엔진
- `backend/api/aims_rag_api/deploy_aims_rag_api.sh` — 배포 스크립트
