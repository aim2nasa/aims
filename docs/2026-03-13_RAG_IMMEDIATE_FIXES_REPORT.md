# RAG 즉시조치 실행 결과 보고서

**작성일**: 2026-03-13
**검증**: Alex(설계+구현) → Gini(품질검증) → 피드백 반영

---

## 실행 요약

| 조치 | 상태 | 검증 |
|------|------|------|
| 1. API 키 하드코딩 제거 | 완료 | Gini PASS |
| 2. Qdrant ID 체계 개선 + 청크 삭제 | 완료 | Gini PASS |
| 3. Qdrant 데이터 복구 (220건) | 완료 (985 포인트) | Gini PASS |
| 4. RAG API 인증 강화 | 완료 (nginx 설정 별도) | Gini PASS (재검증 후) |

---

## 조치 1: API 키 하드코딩 제거

### 문제
`full_pipeline.py`에 `N8N_WEBHOOK_API_KEY`가 소스코드에 직접 노출.
5개 파일에서 `INTERNAL_API_KEY`의 fallback에 실제 키값이 하드코딩.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `backend/embedding/full_pipeline.py` | `N8N_WEBHOOK_API_KEY` → `os.getenv()` + RuntimeError |
| `backend/embedding/full_pipeline.py` | `INTERNAL_API_KEY` → `os.getenv()` + RuntimeError |
| `backend/api/aims_rag_api/rag_search.py` | fallback `""` (빈 문자열) |
| `backend/api/aims_rag_api/token_tracker.py` | fallback `""` |
| `backend/embedding/process_credit_pending.py` | fallback `""` |
| `backend/api/document_pipeline/services/openai_service.py` | fallback `""` |

### 서버 조치
- `~/.env.shared`에 `INTERNAL_API_KEY`, `N8N_WEBHOOK_API_KEY` 추가
- 크론 래퍼 스크립트 `run_pipeline.sh` 생성 (`.env.shared` 자동 로드)
- 크론탭을 래퍼 스크립트로 교체

---

## 조치 2: Qdrant ID 체계 개선 + 청크 삭제 로직

### 문제
- `save_to_qdrant.py`가 `uuid4()` (랜덤 UUID)를 포인트 ID로 사용
- 동일 문서 재처리 시 기존 청크가 삭제되지 않아 중복 발생
- Qdrant 볼륨 초기화 시 MongoDB 상태(`done`)와 불일치

### 수정 내용 (`save_to_qdrant.py` 재작성)

1. **결정적 UUID**: `uuid5(NAMESPACE_DNS, "aims.docembed.{chunk_id}")`
   - 동일 chunk_id → 항상 동일 UUID → upsert 시 자연스럽게 덮어쓰기

2. **저장 전 기존 청크 삭제**: `delete_doc_chunks()` 함수 추가
   - `doc_id` 필터로 해당 문서의 모든 청크를 먼저 삭제
   - 재처리 시 중복 완전 방지

### 검증
```
동일 입력 동일 출력: True
다른 입력 다른 출력: True
UUID 예시: eff64997-88c7-5077-a02d-1d91fb0b6221
```

---

## 조치 3: Qdrant 데이터 복구

### 문제
- **MongoDB `docembed.status: done` = 220건, Qdrant `points_count` = 0**
- Qdrant 컨테이너 재시작/볼륨 초기화 후 데이터 유실
- RAG API startup이 빈 컬렉션을 자동 생성 → 파이프라인은 이미 `done` → 재처리 안 됨
- **시맨틱 검색이 사실상 작동하지 않는 상태** (Entity 검색만으로 결과 반환)

### 실행 과정

1. 수정된 `save_to_qdrant.py`, `full_pipeline.py`를 서버에 배포
2. 크론 래퍼 스크립트 생성 및 크론탭 교체
3. 테스트 1건 수동 실행 → Qdrant 저장 성공 확인
4. MongoDB 220건 `docembed.status: 'done'` → `'pending'` 일괄 초기화
5. 크론 자동 재임베딩 (1분 간격) → **약 5분 만에 220건 전체 완료**

### 결과
```
Before: Qdrant points = 0,   MongoDB done = 220
After:  Qdrant points = 985, MongoDB done = 220
```

- 220개 문서 → 985개 청크 (평균 4.5 청크/문서)
- OpenAI 임베딩 비용: 약 $0.01 미만

### 발견사항: Qdrant 비어있는데 검색 결과가 나온 이유

하이브리드 검색 구조에서 **Entity 검색(MongoDB 메타데이터)이 독립적으로 동작**하기 때문:
- 쿼리 분석기가 `entity` 또는 `mixed`로 분류 시 MongoDB 검색 실행
- 파일명/tags/summary 정규식 매칭으로 결과 반환
- 유사도 1164% 같은 비정상 높은 값은 Entity 검색 점수 (파일명 완벽매칭 +10.0)
- **의미적 검색은 전혀 작동하지 않았음** (키워드 매칭만 동작)

---

## 조치 4: RAG API 인증 강화

### 문제
- `/search` 엔드포인트에 인증 없음
- `user_id`를 클라이언트가 직접 지정 → 타인 문서 접근 가능
- `/analytics/*` 엔드포인트도 무인증

### 수정 내용

1. **미들웨어 기반 인증** (`ApiKeyMiddleware`)
   - 모든 엔드포인트에 `x-api-key` 검증 적용
   - `/health`만 인증 제외
   - `RAG_API_KEY` 미설정 시 경고 로그 + 스킵 (하위 호환)

2. **배포 스크립트 수정** (`deploy_aims_rag_api.sh`)
   - Docker 환경변수에 `RAG_API_KEY`, `INTERNAL_API_KEY`, `AIMS_API_URL` 추가

3. **nginx 인증 주입** (사용자 조치 필요)
   - 스크립트: `~/aims/setup_rag_nginx_auth.sh`
   - nginx가 `proxy_set_header x-api-key`로 키를 주입
   - 프론트엔드 코드 수정 불필요 (nginx가 처리)

### 검증
```
인증 없이 /search → 403 Invalid API key  (차단)
키 포함 /search  → 200 정상 처리          (통과)
/health          → 200 정상 처리          (인증 제외)
```

### 사용자 조치 필요
```bash
sudo bash ~/aims/setup_rag_nginx_auth.sh
```

---

## Gini 품질 검증 결과

### 1차 검증: FAIL (Major 3건)

| # | 이슈 | 조치 |
|---|------|------|
| 1 | analytics 엔드포인트 인증 누락 | 미들웨어로 전환하여 모든 엔드포인트에 적용 |
| 2 | RAG_API_KEY 미설정 시 경고 없음 | startup 시 경고 로그 추가 |
| 3 | Docker 환경변수 누락 | deploy 스크립트에 환경변수 3개 추가 |

### 2차 검증 (피드백 반영 후)
- 미들웨어 적용 → /health 제외 모든 엔드포인트 인증
- Docker 재배포 → 환경변수 정상 주입 확인
- 인증 테스트 → 403/200 정상 동작

---

## 변경 파일 목록

### 코드 변경
| 파일 | 변경 내용 |
|------|----------|
| `backend/embedding/save_to_qdrant.py` | 결정적 UUID + 청크 삭제 로직 (재작성) |
| `backend/embedding/full_pipeline.py` | API 키 환경변수화 + RuntimeError |
| `backend/api/aims_rag_api/rag_search.py` | ApiKeyMiddleware 추가, INTERNAL_API_KEY fallback 제거 |
| `backend/api/aims_rag_api/token_tracker.py` | INTERNAL_API_KEY fallback 제거 |
| `backend/api/aims_rag_api/deploy_aims_rag_api.sh` | Docker 환경변수 3개 추가 |
| `backend/embedding/process_credit_pending.py` | INTERNAL_API_KEY fallback 제거 |
| `backend/api/document_pipeline/services/openai_service.py` | INTERNAL_API_KEY fallback 제거 |

### 서버 변경
| 항목 | 변경 내용 |
|------|----------|
| `~/.env.shared` | INTERNAL_API_KEY, N8N_WEBHOOK_API_KEY, RAG_API_KEY 추가 |
| `~/aims/backend/embedding/run_pipeline.sh` | 크론 래퍼 스크립트 (신규) |
| crontab | `run_pipeline.sh` 사용으로 변경 |
| aims-rag-api Docker | 재빌드 + 재배포 (v0.1.17) |
| `~/aims/setup_rag_nginx_auth.sh` | nginx 인증 설정 스크립트 (사용자 실행 대기) |

### MongoDB 변경
| 항목 | 변경 내용 |
|------|----------|
| `files.docembed.status` | 220건 `done` → `pending` → 재임베딩 → `done` |

---

## 조치 후 검증: 시맨틱 검색 동작 확인

### nginx 인증 검증 (조치 4 완료)

```
인증 없이 /search 직접 호출  → 403 (차단)
API 키 포함 /search 직접 호출 → 200 (통과)
nginx 경유 /search_api (키 없이) → 200 (nginx가 x-api-key 자동 주입)
인증 없이 /analytics/stats    → 403 (차단)
/health                       → 200 (인증 제외)
```

### 시맨틱 검색 동작 검증

**Concept 쿼리 테스트**: `"법인세 세무조정계산서"` (고객 미선택, 순수 의미 검색)

```
쿼리 유형: concept → Qdrant 벡터 검색만 사용
결과: 9건 반환 (top_k=5)

[1] 21년 세무조정계산서_캐치업코리아 (1).pdf  — cosine: 0.4446, rerank: 0.9994
[2] 20년 세무조정계산서_캐치업코리아.pdf       — cosine: 0.4375, rerank: 0.9997
[3] 0190_주식회사 캐치업코리아_법인2019년.pdf  — cosine: 0.4365, rerank: 0.9996
[4] 캐치업재무제표확인(2023년).pdf             — cosine: 0.4331, rerank: 0.9994
```

- **코사인 유사도 0.43~0.44 범위**: 정상적인 시맨틱 검색 점수 (0~1 스케일)
- **Cross-Encoder rerank 0.999+**: 재순위화 모델도 높은 관련성 확인
- **Qdrant 호출 로그 확인**: `POST http://localhost:6333/collections/docembed/points/search "200 OK"`

→ **시맨틱 검색 정상 동작 확인**

### 기존 검색("캐치업코리아에 대해서")과 점수가 동일하게 보이는 이유

"캐치업코리아에 대해서" 쿼리는 쿼리 분석기가 `entity`로 분류하며, 관계 확장(8명) 시 하이브리드로 전환되지만:

| 검색 방식 | 점수 범위 | 가중치 적용 후 | 비율 |
|-----------|-----------|---------------|------|
| Entity (MongoDB 텍스트 빈도) | 0 ~ 18+ | 11.81 × 0.6 = **7.09** | **97.5%** |
| Vector (Qdrant 코사인) | 0 ~ 1 | 0.44 × 0.4 = **0.18** | **2.5%** |

Entity 점수가 정규화되지 않아 (0~1이 아닌 0~18+) 벡터 검색 기여분이 합산에서 무시됨.
프론트엔드: `Math.round(score × 100)%` → 7.27 = **727%**, 11.81 = **1181%** 등으로 표시.

### 점수 정규화 필요성 평가

**결론: 현재는 불필요 (보류)**

- **Entity 쿼리** → MongoDB만 사용 → 정규화 무관
- **Concept 쿼리** → Qdrant만 사용 → 정규화 무관
- **Mixed 쿼리**에서만 의미 있으나, 쿼리 분석기가 이미 적절히 분류
- 보험 문서 관리 특성상 "고객명 + 문서 유형" 검색이 대부분 → Entity 검색이 더 적합
- 검색 품질 불만이 실제로 발생할 때 진행해도 충분

---

## 잔여 작업

| 항목 | 우선순위 | 상태 |
|------|---------|------|
| ~~nginx 인증 스크립트 실행~~ | ~~높음~~ | ✅ 완료 |
| Qdrant 서버 버전 업그레이드 (v1.9.0 → 최신) | 중간 | 미실행 |
| 임베딩 배치 처리 (청크별 → 배치 API 호출) | 낮음 | 미실행 |
| Qdrant-MongoDB 정합성 헬스체크 크론 | 중간 | 미실행 |
| 하이브리드 검색 점수 정규화 | 낮음 | 보류 (필요 시 진행) |
