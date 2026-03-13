# AIMS RAG 구현 현황 보고서

**작성일**: 2026-03-13
**검증 방법**: 4개 전문 에이전트 병렬 교차 검증 (임베딩 파이프라인 / 검색 엔진 / 연동 구조 / 품질 검증)

---

## 1. 시스템 아키텍처 개요

```
[문서 업로드]
     ↓
[document_pipeline :8100] → 텍스트 추출 (meta/ocr/text)
     ↓
[full_pipeline.py] (크론 1분) → 청킹 → 임베딩 → Qdrant 저장
     ↓
[aims_rag_api :8000] (Docker) → 검색 요청 처리
     ↓
[프론트엔드 / MCP 도구] → 사용자에게 결과 제공
```

---

## 2. 기술 스택

| 계층 | 기술 | 상세 |
|------|------|------|
| **임베딩 모델** | OpenAI `text-embedding-3-small` | 1536차원 |
| **벡터 DB** | Qdrant v1.9.0 (자체 호스팅 Docker) | localhost:6333, 컬렉션 `docembed`, COSINE 거리 |
| **청킹** | LangChain `RecursiveCharacterTextSplitter` | chunk_size=1500, overlap=150 |
| **쿼리 분석** | OpenAI `gpt-4o-mini` | entity/concept/mixed 의도 분류 |
| **재순위화** | `cross-encoder/ms-marco-MiniLM-L-12-v2` | 상위 50개 대상, Sigmoid 정규화 |
| **LLM 답변** | DB에서 동적 조회 (기본 `gpt-3.5-turbo`) | 상위 5개 문서 컨텍스트, temperature=0.1 |
| **메타데이터 검색** | MongoDB 정규식 | `files` 컬렉션 (파일명, tags, summary) |
| **로깅/분석** | MongoDB `aims_analytics` | search_logs, ai_token_usage |

> **참고**: MongoDB Atlas Vector Search는 사용하지 않음. Qdrant가 유일한 벡터 저장소.

---

## 3. 임베딩 파이프라인

### 3.1 실행 방식
- **크론**: 매 1분 (`*/1 * * * *`)
- **중복 방지**: `flock -n /tmp/full_pipeline.lock`
- **배치 크기**: 미설정 — 조건 충족 문서 전체를 순차 처리 (1건씩)
- **재시도**: 최대 3회, `OPENAI_QUOTA_EXCEEDED` 시 파이프라인 즉시 중단

### 3.2 처리 흐름

```
1. MongoDB에서 pending 문서 조회
2. 크레딧 체크 (POST /api/internal/check-credit)
   ├─ 충분 → 계속
   └─ 부족 → credit_pending 상태 저장, 건너뜀
3. 텍스트 추출 (우선순위: meta.full_text > ocr.full_text > text.full_text)
   └─ 텍스트 없으면 → skipped (skip_reason: 'no_text')
4. 청킹 (RecursiveCharacterTextSplitter, 1500자/150 overlap)
5. 임베딩 생성 (text-embedding-3-small, 청크별 개별 API 호출)
6. Qdrant 저장 (docembed 컬렉션, UUID 포인트 ID)
7. MongoDB 상태 업데이트 (docembed.status: 'done', dims: 1536)
8. 바이러스 스캔 webhook 트리거
```

### 3.3 문서 상태 흐름

```
pending ──→ done (임베딩 완료)
  │
  ├──→ skipped (텍스트 없음)
  ├──→ failed (3회 재시도 후 실패)
  └──→ credit_pending (크레딧 부족)
              │
              └──→ pending (매월 1일 00:05 재처리)
```

### 3.4 Qdrant 페이로드 구조

```python
{
    "chunk_id": "{doc_id}_{청크번호}",
    "owner_id": "설계사 ID",
    "customer_id": "고객 ID",
    "original_name": "파일명",
    "uploaded_at": "업로드 시각",
    "mime": "MIME 타입",
    "text_source": "meta | ocr | text",
    "preview": "청크 텍스트 첫 240자"
}
```

---

## 4. 검색 엔진

### 4.1 서버 구성
- **서비스**: FastAPI (aims_rag_api)
- **실행**: Docker 컨테이너 (`--network=host`, 포트 8000)
- **배포**: `deploy_aims_rag_api.sh` (deploy_all.sh Step 3)

### 4.2 API 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/search` | POST | 통합 검색 (키워드/시맨틱) |
| `/feedback` | POST | 사용자 피드백 제출 |
| `/health` | GET | 헬스 체크 |
| `/analytics/overall` | GET | 전체 검색 통계 (7일 기본) |
| `/analytics/query_types` | GET | 쿼리 유형별 통계 |
| `/analytics/rerank_impact` | GET | 재순위화 효과 측정 |
| `/analytics/failure_rate` | GET | 실패율 분석 |
| `/analytics/failed_queries` | GET | 실패 쿼리 Top N |
| `/analytics/performance_trends` | GET | 성능 트렌드 (일별) |
| `/analytics/user_satisfaction` | GET | 사용자 만족도 |
| `/analytics/alerts` | GET | 품질 알림 체크 |
| `/analytics/recent_logs` | GET | 최근 검색 로그 |

### 4.3 검색 모드

#### A. Keyword 검색 (크레딧 무료)
- document_pipeline SmartSearch API (`localhost:8100/webhook/smartsearch`) 호출
- MongoDB 직접 검색 결과 반환

#### B. Semantic 검색 (크레딧 소비)

```
[쿼리 입력]
     ↓
[1] 크레딧 체크 (user_id, 2000 토큰 예상)
     ↓
[2] 쿼리 분석 (gpt-4o-mini)
     → query_type: entity | concept | mixed
     → entities: ["고유명사"]
     → concepts: ["일반 개념"]
     → metadata_keywords: ["검색 키워드"]
     ↓
[3] 고객명 자동 매칭 + 관계 확장 (customer_relationships)
     ↓
[4] 하이브리드 검색 (query_type에 따라 전략 선택)
     ├─ Entity 검색 (MongoDB 메타데이터, 가중치 60%)
     │   └─ 파일명 완벽매칭 +10.0 / 부분매칭 +2.0 / tags +0.3
     └─ Vector 검색 (Qdrant 코사인 유사도, 가중치 40%)
         └─ owner_id 필터 + doc_id 필터 (고객별)
     ↓
[5] Cross-Encoder 재순위화 (상위 50개)
     └─ 파일명 매칭 강도에 따라 가중치 차등 적용
     ↓
[6] LLM 답변 생성 (상위 5개 문서 컨텍스트)
     └─ max_tokens=500, temperature=0.1
     ↓
[7] 검색 로그 저장 + 토큰 추적
```

### 4.4 주요 상수

| 항목 | 값 |
|------|-----|
| 최대 top_k | 100 |
| 재순위화 대상 | 상위 50개 |
| LLM 컨텍스트 문서 수 | 5개 |
| LLM max_tokens | 500 |
| temperature | 0.1 |
| AI 모델 캐시 TTL | 60초 |
| 하이브리드 가중치 | Entity 60% / Vector 40% |

---

## 5. 연동 구조

### 5.1 프론트엔드 → RAG API

```
프론트엔드 (React)
  ↓ fetch('https://tars.giize.com/search_api')
  ↓ nginx 역프록시
  ↓ http://localhost:8000/search
  ↓ aims_rag_api (Docker)
```

- **검색 서비스**: `searchService.ts` → `SEARCH_API_URL = 'https://tars.giize.com/search_api'`
- **결과 보강**: Qdrant 결과의 `doc_id`로 MongoDB에서 추가 정보(meta, ocr, status) 병합
- **UI 컴포넌트**: `DocumentSearchView` → `DocumentSearchContext`

### 5.2 MCP 도구 → RAG API

| 도구명 | 파일 | 기능 |
|--------|------|------|
| `search_documents_semantic` | `aims_mcp/src/tools/rag.ts` | 키워드/시맨틱 검색 |
| `unified_search` | `aims_mcp/src/tools/unified_search.ts` | 문서+고객+계약 통합 검색 |

- RAG API URL: `process.env.RAG_API_URL || 'http://localhost:8000'`

### 5.3 서비스 간 통신

```
aims_rag_api (:8000) ──→ aims_api (:3010)      크레딧 체크, AI 모델 설정, 토큰 로깅
aims_rag_api (:8000) ──→ Qdrant (:6333)         벡터 검색
aims_rag_api (:8000) ──→ document_pipeline (:8100)  키워드 검색 (SmartSearch)
aims_rag_api (:8000) ──→ MongoDB (:27017)       메타데이터 검색, 로깅
full_pipeline.py     ──→ OpenAI API             임베딩 생성
full_pipeline.py     ──→ Qdrant (:6333)         벡터 저장
full_pipeline.py     ──→ aims_api (:3010)       크레딧 체크, 토큰 로깅
```

---

## 6. 데이터 격리 및 보안

| 항목 | 방식 |
|------|------|
| 설계사 격리 | `owner_id` 필터 (Qdrant + MongoDB 모든 검색에 필수 적용) |
| 고객 격리 | `customer_id` 필터 (선택, 고객 관계 확장 포함) |
| 내부 API 인증 | `x-api-key` 헤더 (aims_api 통신용) |
| API 키 관리 | `~/.env.shared` 중앙 관리 |

---

## 7. 모니터링 및 품질 관리

### 7.1 검색 로그 (`aims_analytics.search_logs`)
- 쿼리, 사용자, 검색 모드, 쿼리 분석 결과
- 검색 결과 (doc_ids, scores)
- 성능 지표 (분석/검색/재순위화/LLM 시간)
- 사용자 피드백 (클릭, 만족도)

### 7.2 토큰 추적 (`aims_analytics.ai_token_usage`)
- 임베딩 토큰 (prompt_tokens만, completion_tokens=0)
- 채팅 토큰 (prompt + completion)
- source별 분류 (`doc_embedding`, `rag_api`)

### 7.3 알림 임계값

| 지표 | 임계값 | 심각도 |
|------|--------|--------|
| 실패율 | > 20% | WARNING |
| 평균 점수 | < 0.3 | WARNING |
| 응답 시간 | > 5초 | WARNING |
| 반복 실패 쿼리 | >= 3회 | WARNING |

---

## 8. 크레딧 정책

| 구분 | 체크 시점 | 소비량 |
|------|-----------|--------|
| 문서 임베딩 | 파이프라인 처리 전 | 페이지 × 3.75 크레딧 |
| RAG 검색 (semantic) | 검색 요청 시 | ~1 크레딧 (2000 토큰 예상) |
| RAG 검색 (keyword) | - | 무료 |

- **Fail-closed**: 크레딧 API 오류 시 처리 보류 (안전 우선)
- **credit_pending**: 크레딧 부족 → 매월 1일 자동 재처리

---

## 9. Gini 품질 검증 결과

### QUALITY GATE: FAIL

| # | 심각도 | 이슈 | 위치 |
|---|--------|------|------|
| 1 | **Critical** | Qdrant points_count=0 — MongoDB에 done=220건이나 Qdrant에 벡터 없음. semantic 검색이 빈 결과 반환 중일 가능성 | `save_to_qdrant.py` (uuid ID), `rag_search.py:55` |
| 2 | **Critical** | `/search` 엔드포인트 인증 미들웨어 없음 — user_id를 클라이언트가 직접 지정 | `rag_search.py:183` |
| 3 | **Major** | API 키 소스코드 하드코딩 (`N8N_WEBHOOK_API_KEY`) | `full_pipeline.py:24` |
| 4 | **Major** | Qdrant 청크 삭제 로직 없음 — 문서 재처리 시 기존 청크 잔존 | `save_to_qdrant.py` 전체 |
| 5 | **Major** | `text.find(chunk)` 오프셋 부정확성 — 동일 텍스트 반복 시 첫 위치만 반환 | `split_text_into_chunks.py:34` |
| 6 | **Major** | Qdrant 클라이언트(1.15.1)/서버(v1.9.0) 버전 불일치 → `check_compatibility=False`로 억제 | `save_to_qdrant.py:22` |
| 7 | **Major** | 핵심 파이프라인 자동화 테스트 부재 | `backend/embedding/` 전체 |
| 8 | **Major** | Qdrant-MongoDB 데이터 정합성 자동 검증 없음 | 운영 전반 |

---

## 10. 개선 권고사항 (우선순위 순)

### 즉시 조치

1. **Qdrant 데이터 복구 및 ID 체계 개선**
   - `docembed.status: done` 문서를 `pending`으로 초기화 후 파이프라인 재실행
   - 포인트 ID를 `uuid4()`에서 `chunk_id` 기반 결정적 UUID로 변경 (동일 청크 = 동일 ID)
   - 재처리 시 기존 청크 삭제 로직 추가

2. **RAG API 인증 강화**
   - nginx 레벨에서 JWT 검증 후 `user_id`를 헤더로 주입
   - 또는 RAG API에 인증 미들웨어 추가

3. **API 키 하드코딩 제거**
   - `N8N_WEBHOOK_API_KEY`, `INTERNAL_API_KEY` fallback → `.env.shared`로 이관

### 중기 개선

4. **Qdrant 버전 통일** (클라이언트 ↔ 서버)
5. **임베딩 배치 처리** (청크별 개별 호출 → 배치 호출)
6. **재순위화 모델 한국어 특화** (ms-marco는 영문 기반)
7. **Qdrant-MongoDB 정합성 헬스체크** (크론으로 주기적 검증)
8. **배치 크기 제한** (대량 누적 시 크론 실행 시간 제어)

### 장기 개선

9. **자동화 테스트 구축** (임베딩 파이프라인 단위 테스트)
10. **청킹 전략 다양화** (문서 유형별 적응형 청킹)
11. **검색 가중치 동적 조정** (쿼리 타입에 따라 Entity/Vector 비율 변경)

---

## 11. 파일 구조 참조

```
backend/
├── embedding/
│   ├── full_pipeline.py              # 메인 오케스트레이터 (크론 1분)
│   ├── extract_text_from_mongo.py    # MongoDB 텍스트 추출
│   ├── split_text_into_chunks.py     # 청킹 (1500/150)
│   ├── create_embeddings.py          # OpenAI 임베딩 생성
│   ├── save_to_qdrant.py            # Qdrant 벡터 저장
│   └── process_credit_pending.py    # 크레딧 재처리 (매월 1일)
│
├── api/
│   ├── aims_rag_api/                 # RAG 검색 API (Docker, :8000)
│   │   ├── rag_search.py            # 메인 FastAPI 서버 + LLM 답변
│   │   ├── query_analyzer.py        # 쿼리 의도 분석 (gpt-4o-mini)
│   │   ├── hybrid_search.py         # 하이브리드 검색 엔진
│   │   ├── reranker.py              # Cross-Encoder 재순위화
│   │   ├── token_tracker.py         # AI 토큰 추적
│   │   ├── search_logger.py         # 검색 로그 저장
│   │   ├── quality_analyzer.py      # 품질 분석
│   │   ├── alert_system.py          # 알림 시스템
│   │   └── system_logger.py         # 시스템 로그
│   │
│   ├── aims_mcp/src/tools/
│   │   ├── rag.ts                   # MCP RAG 검색 도구
│   │   └── unified_search.ts       # MCP 통합 검색 도구
│   │
│   └── document_pipeline/           # 문서 처리 (PM2, :8100)
│
frontend/aims-uix3/src/
├── services/searchService.ts        # RAG API 호출
├── components/DocumentViews/
│   └── DocumentSearchView/          # 검색 UI
└── contexts/DocumentSearchContext   # 검색 상태 관리
```
