# AIMS RAG 검색 답변 품질 영향 요소 분석

> **작성일**: 2026-03-13
> **분석 방법**: Alex(임베딩 파이프라인) + Alex(검색/답변 생성) + Gini(프론트엔드/API/인프라) 3-agent 교차 검증
> **분석 범위**: 임베딩 생성 → Qdrant 저장 → 검색 → 재순위화 → LLM 답변 생성 → 프론트엔드 전체

---

## 1. 전체 파이프라인 흐름

### 1-1. 임베딩 파이프라인 (오프라인, 크론 매 1분)

```
MongoDB (files 컬렉션)
  → 텍스트 추출 (meta.full_text > ocr.full_text > text.full_text)
    → 청킹 (RecursiveCharacterTextSplitter, 1500자/150자 overlap)
      → 임베딩 (OpenAI text-embedding-3-small, 1536차원)
        → Qdrant 저장 (docembed 컬렉션, Cosine, preview 240자)
          → MongoDB 상태 업데이트 (docembed.status: done)
```

### 1-2. 검색 파이프라인 (온라인)

```
프론트엔드
  → POST https://tars.giize.com/search_api
    → nginx proxy_pass → aims_rag_api (localhost:8000, uvicorn)
      ├─ 1단계: 쿼리 의도 분석 (gpt-4o-mini)
      ├─ 2단계: 고객명 자동 매칭 + 관계 확장
      ├─ 3단계: 하이브리드 검색 (MongoDB + Qdrant)
      ├─ 4단계: Cross-Encoder 재순위화 (ms-marco-MiniLM-L-12-v2)
      ├─ 5단계: LLM 답변 생성 (gpt-4.1-nano, 상위 5개 문서)
      ├─ 6단계: 검색 로그 저장 (aims_analytics.search_logs)
      └─ 7단계: AI 토큰 사용량 추적

  → enrichment (per result)
      ├─ GET /api/documents/{docId}/status (aims_api :3010)
      └─ GET /api/customers/{customerId} (aims_api :3010)
```

---

## 2. 답변 품질 영향 요소 상세

### 2-1. LLM 컨텍스트 — 가장 큰 품질 병목

LLM 답변은 `generate_answer_with_llm()` (`rag_search.py:334-338`)에서 생성된다:

```python
for i, result in enumerate(search_results):
    payload = result.get('payload', result)
    preview = payload.get('preview', '')        # ← 이것이 LLM 입력의 전부
    original_name = payload.get('original_name', '알 수 없는 문서')
    context += f"--- 문서 조각 {i+1} (출처: {original_name}) ---\n{preview}\n\n"
```

**preview 길이가 검색 모드마다 다르다:**

| 검색 모드 | preview 출처 | 길이 | LLM 최대 컨텍스트 (5개) |
|-----------|-------------|------|------------------------|
| Entity 검색 | MongoDB `full_text[:500]` | 500자 | ~2,500자 |
| Vector 검색 | Qdrant payload `chunk['text'][:240]` | **240자** | **~1,200자** |
| Hybrid 검색 | 혼합 | 240~500자 | ~1,200~2,500자 |

**문제**: 청크 원문은 최대 1,500자인데, 벡터 검색 시 **240자(16%)만 LLM에 전달**된다.
핵심 정보가 240자 이후에 있으면 LLM이 답변을 생성할 수 없다.

### 2-2. RAG 답변 생성 모델

| 설정 | 실제 값 | 위치 |
|------|---------|------|
| **현재 모델** | `gpt-4.1-nano` | DB: `system_settings.ai_models.rag.model` |
| fallback | `gpt-3.5-turbo` | `rag_search.py:190,198` (API 조회 실패 시) |
| max_tokens | **500** | `rag_search.py:358` |
| temperature | **0.1** | `rag_search.py:359` |
| LLM_CONTEXT_LIMIT | **5개** 문서만 | `rag_search.py:534` |
| 모델 캐시 TTL | 60초 | `rag_search.py:116` |

`gpt-4.1-nano`는 가장 경량 모델로 추론 능력이 제한적이다.
`max_tokens=500`이라 복잡한 질문에 답변이 잘릴 수 있다.

### 2-3. 시스템 프롬프트 (전문)

```
너는 보험 설계사를 지원하는 AI 어시스턴트로, 주어진 문서 내용과 고객 관계 정보를 바탕으로
사용자의 질문에 대해 친절하고 명확하게 답변해야 해. 고객 관계 정보가 제공되면 이를 참고하여
답변하되, 제공된 정보에 없는 내용은 추가하거나 추측하지 마.
```

**문제점:**
- 답변 형식/구조에 대한 가이드 없음
- 보험 도메인 전문 지식 주입 없음
- "정보가 부족할 때" 행동 지침이 "추측하지 마" 한 줄뿐
- 한국어 존댓말/경어 지시 없음

### 2-4. 쿼리 의도 분석

| 설정 | 값 |
|------|-----|
| 모델 | `gpt-4o-mini` |
| temperature | 0.1 |
| 응답 형식 | `json_object` |

**출력 필드:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `query_type` | `entity` / `concept` / `mixed` | 검색 전략 결정 |
| `entities` | `List[str]` | 고유명사 (사람, 회사, 문서명) |
| `concepts` | `List[str]` | 일반 개념/주제 |
| `metadata_keywords` | `List[str]` | 파일명/태그 검색용 키워드 |

**핵심**: 의도 분류가 틀리면 완전히 다른 검색 전략이 적용된다.

| query_type | 검색 전략 | 비고 |
|-----------|-----------|------|
| entity | 메타데이터만 (MongoDB) | 파일명/태그 매칭 |
| concept | 벡터만 (Qdrant) | 의미 유사도 |
| mixed | 하이브리드 (메타 60% + 벡터 40%) | |
| 고객 관계 확장 시 | **강제 하이브리드** | customer_ids > 1이면 |

오류 시 fallback: `query_type="concept"`, 쿼리를 `split()`하여 concepts/metadata_keywords에 넣음.

### 2-5. 하이브리드 검색 엔진

#### 메타데이터 검색 (`_entity_search`)

**MongoDB 쿼리 필터:**
```python
{
    "ownerId": user_id,
    "$or": [
        {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
        {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
        {"meta.tags": {"$in": search_terms}},
        {"meta.summary": {"$regex": regex_pattern, "$options": "i"}},
        {"ocr.tags": {"$in": search_terms}},
        {"ocr.summary": {"$regex": regex_pattern, "$options": "i"}}
    ]
}
```

- `search_terms`는 `metadata_keywords` 사용 (없으면 `entities`)
- `.limit(top_k * 2)`로 여유 확보

**점수 계산 공식:**
```
base_score = 텍스트 내 검색어 출현 횟수 × 0.1 (originalName + full_text)

파일명 매칭:
  - 모든 검색어가 파일명에 포함: +10.0
  - 일부만 포함: +2.0 × (매칭 비율)

태그 매칭:
  - meta.tags 또는 ocr.tags에 검색어 포함: +0.3
```

**preview 생성 (entity 검색 전용):**
```python
preview = (meta.full_text or '')[:500] or (ocr.full_text or '')[:500] or summary
```

#### 벡터 검색 (`_vector_search`)

- 임베딩 모델: `text-embedding-3-small`
- Qdrant 필터: `owner_id` 필수
- `customer_ids` 있으면 MongoDB에서 doc_id 목록 조회 후 Qdrant `MatchAny` 필터
- limit: `customer_ids` 있을 때 `max(top_k, len(doc_ids) * 5)`, 없으면 `top_k`
- 문서별 중복 제거: 동일 doc_id의 최고 점수 청크만 유지
- **preview는 Qdrant payload에 저장된 240자 사용**

#### 하이브리드 검색 (`_hybrid_search`)

```
메타데이터 검색: 점수 × 0.6
벡터 검색:      점수 × 0.4
양쪽 모두 매칭: 합산 (0.6 × entity + 0.4 × vector)
```

각 검색은 `top_k * 2`개씩 가져와서 병합.

#### 고객명 자동 매칭 (`resolve_customer_from_entities`)

```
1순위: 정확 매칭 — personal_info.name == entity (active, 해당 설계사 소유)
2순위: 부분 매칭 — $regex (2글자 이상, 결과 정확히 1건일 때만)
```

#### 고객 관계 확장

`customer_relationships` 컬렉션 양방향 조회 → 관련 고객 ID 수집
→ `search_customer_ids = [기준 고객] + [관련 고객들]`
→ 강제 하이브리드 검색 (벡터 검색 병행)

### 2-6. Cross-Encoder 재순위화

| 설정 | 실제 값 |
|------|---------|
| 모델 | `cross-encoder/ms-marco-MiniLM-L-12-v2` |
| max_length | 512 토큰 |
| 입력 텍스트 | `payload.preview[:500]` |
| RERANK_LIMIT | 50개 (초과분은 재순위화 미적용) |

**최종 점수 계산 공식:**
```python
normalized = 1.0 / (1.0 + exp(-raw_score))   # sigmoid: 0~1

if original_score >= 5.0:    # 파일명 완벽 매칭 → 절대 우선
    final = original × 2.0 + normalized
elif original_score >= 2.0:  # 파일명 일부 매칭 → 균형
    final = original + normalized × 2.0
else:                        # 의미 검색 위주
    final = original × 0.5 + normalized × 5.0
```

50개 초과 결과: 최하위 재순위화 점수에서 0.001씩 감소시켜 뒤에 배치.

### 2-7. 임베딩 파이프라인 상세

| 항목 | 실제 값 | 위치 |
|------|---------|------|
| 임베딩 모델 | `text-embedding-3-small` | `create_embeddings.py` |
| 벡터 차원 | 1536 | |
| chunk_size | 1,500자 | `split_text_into_chunks.py:3` |
| chunk_overlap | 150자 (10%) | `split_text_into_chunks.py:3` |
| 분할기 | `RecursiveCharacterTextSplitter` | LangChain, 기본 구분자 `["\n\n", "\n", " ", ""]` |
| length_function | `len` (문자 수) | |
| 배치 처리 | **없음** — 청크 1개씩 개별 API 호출 | |
| 텍스트 전처리 | **없음** — `\r\n`, 불필요 공백 그대로 | |
| 크론 주기 | `*/1 * * * *` (매 1분, flock 동시실행 방지) | |
| 최대 재시도 | 3회 | |
| 현재 벡터 수 | **985개** | |
| HNSW indexed | **0개** (임계값 20,000 미달 → 전수 스캔) | |

### 2-8. Qdrant Payload 구조

| 필드 | 값/설명 | 비고 |
|------|---------|------|
| `chunk_id` | `{doc_id}_{index}` | 결정적 UUID5 |
| `doc_id` | MongoDB ObjectId 문자열 | 검색 필터용 |
| `owner_id` | 설계사 ID | 소유자 격리 |
| `original_name` | 업로드 원본 파일명 | |
| `mime` | MIME 타입 | |
| `text_source` | `meta` / `ocr` | 텍스트 출처 |
| `uploaded_at` | ISO 형식 | |
| `offset` | 원본 텍스트 내 시작 위치 | |
| `size` | 청크 문자 수 | |
| `preview` | `chunk['text'][:240]` — **240자** | LLM 컨텍스트용 |
| **`customer_id`** | **없음!** | full_pipeline 인라인 코드에서 미포함 |

**주의**: `customer_id`가 Qdrant에 없으므로, 고객별 벡터 검색 시 MongoDB에서 doc_id를 먼저 조회한 후 Qdrant를 `doc_id` MatchAny로 필터링하는 우회 방식 사용 중.

### 2-9. 텍스트 추출 우선순위

```
1순위: meta.full_text (strip 후 비어있지 않으면)
2순위: ocr.full_text
3순위: text.full_text
```

`full_pipeline.py`에서는 `extract_text_from_mongo.py`를 호출하지 않고 동일한 로직을 인라인으로 구현.
단, 인라인 코드에서 `customer_id`를 메타데이터에 포함하지 않는 차이가 있음.

---

## 3. 인프라 이슈

| # | 심각도 | 이슈 | 위치 |
|---|--------|------|------|
| 1 | **Critical** | aims_rag_api **PM2 미등록** — root로 직접 실행 중, 서버 재부팅 시 미복구, `deploy_all.sh`에 미포함 | 서버 프로세스 |
| 2 | **Critical** | nginx 설정에 **RAG_API_KEY 평문 하드코딩** (백업 파일 포함 다수 위치 노출) | `/etc/nginx/sites-enabled/tars` |
| 3 | **Major** | 프론트엔드→검색 API 호출에 **JWT 인증 없음** — 크레딧 소비 우회 가능 | `searchService.ts:70` |
| 4 | **Major** | 검색 결과 **N+1 enrichment** — 결과 N개 × 2회 API 호출 (`/documents/{id}/status` + `/customers/{id}`) | `searchService.ts:87-136` |
| 5 | **Major** | `SEARCH_API_URL`이 외부 도메인 `tars.giize.com` **하드코딩** — `API_CONFIG.BASE_URL` 미사용 | `searchService.ts:17` |
| 6 | **Minor** | `getDocumentDetails()` 데드코드 — 어디서도 호출되지 않음 | `searchService.ts:249-276` |
| 7 | **Minor** | `top_k` 미전송 (semantic 모드) → 백엔드가 최대 500개 전체 반환 후 전부 enrichment | `DocumentSearchProvider.tsx` |

---

## 4. 품질 영향도 종합 순위

### 4-1. 답변 품질 직접 영향 (높음 → 낮음)

| 순위 | 항목 | 현재 값 | 문제점 | 심각도 |
|------|------|---------|--------|--------|
| **1** | 벡터검색 preview 길이 | 240자 | 청크 1,500자 중 16%만 LLM에 전달. 핵심 정보 유실 | **Critical** |
| **2** | RAG 모델 | `gpt-4.1-nano` | 최경량 모델, 추론 능력 제한적 | **Critical** |
| **3** | 시스템 프롬프트 | 1문장 | 답변 형식/도메인 지식/불확실성 처리 가이드 없음 | **Major** |
| **4** | max_tokens | 500 | 복잡한 질문에 답변 잘림 | **Major** |
| **5** | LLM 컨텍스트 수 | 5개 | 관련 문서가 6번째 이후면 미반영 | **Major** |
| **6** | 텍스트 전처리 없음 | `\r\n` 그대로 | 노이즈가 임베딩/LLM 품질 저하 | **Moderate** |
| **7** | 쿼리 의도 오분류 | entity/concept/mixed | 틀리면 완전히 다른 검색 전략 적용 | **Moderate** |
| **8** | 하이브리드 가중치 고정 | 60:40 | concept 질문에서도 entity 가중치가 더 높음 | **Minor** |
| **9** | Qdrant에 customer_id 없음 | 우회 조회 | 고객별 벡터 검색 시 추가 MongoDB 조회 필요 | **Minor** |
| **10** | 임베딩 모델 | 3-small | 3-large(3072차원)보다 정밀도 낮음 | **Minor** |

### 4-2. 인프라/보안 영향

| 순위 | 항목 | 심각도 |
|------|------|--------|
| 1 | PM2 미등록 (재부팅 시 서비스 중단) | Critical |
| 2 | nginx API 키 평문 노출 | Critical |
| 3 | JWT 인증 없는 검색 API | Major |
| 4 | N+1 enrichment 패턴 | Major |
| 5 | URL 하드코딩 | Major |

---

## 5. 개선 권고안

### 5-1. 즉시 적용 가능 (코드 1~2줄 수정)

| # | 항목 | 현재 | 권고 | 수정 위치 |
|---|------|------|------|-----------|
| 1 | RAG 모델 | `gpt-4.1-nano` | `gpt-4.1-mini` 이상 | DB: `system_settings.ai_models.rag.model` |
| 2 | max_tokens | 500 | 1000~2000 | `rag_search.py:358` |
| 3 | LLM_CONTEXT_LIMIT | 5 | 8~10 | `rag_search.py:534` |

### 5-2. 단기 개선 (코드 수정)

| # | 항목 | 현재 | 권고 | 수정 위치 |
|---|------|------|------|-----------|
| 4 | Qdrant preview 길이 | 240자 | 800~1500자 (청크 전체) | `save_to_qdrant.py` payload 생성부 + 재임베딩 |
| 5 | 시스템 프롬프트 | 1문장 | 도메인 전문 프롬프트 + 답변 형식 가이드 | `rag_search.py:341-345` |
| 6 | 텍스트 전처리 | 없음 | `\r\n` → `\n`, 연속 공백 정리 | `split_text_into_chunks.py` 또는 `full_pipeline.py` |
| 7 | PM2 등록 | 미등록 | PM2 등록 + `deploy_all.sh` 추가 | 서버 인프라 |

### 5-3. 중기 개선 (아키텍처 변경)

| # | 항목 | 권고 | 비고 |
|---|------|------|------|
| 8 | Qdrant에 customer_id 추가 | payload에 customer_id 포함 | 전체 재임베딩 필요 |
| 9 | N+1 enrichment 해소 | 배치 API (`POST /api/documents/batch-status`) | aims_api 수정 |
| 10 | JWT 인증 추가 | 검색 API에 인증 헤더 적용 | searchService.ts + nginx |
| 11 | 임베딩 모델 업그레이드 | `text-embedding-3-large` (3072차원) | 전체 재임베딩 + Qdrant 재생성 |

---

## 6. 설정값 요약 (Quick Reference)

```
=== 임베딩 파이프라인 ===
임베딩 모델:          text-embedding-3-small (1536차원)
chunk_size:           1,500자
chunk_overlap:        150자 (10%)
분할기:               RecursiveCharacterTextSplitter
Qdrant preview:       240자
Qdrant 거리 메트릭:   Cosine
현재 벡터 수:         985개
크론 주기:            매 1분

=== 검색 파이프라인 ===
쿼리 분석 모델:       gpt-4o-mini (temperature 0.1)
하이브리드 가중치:    메타데이터 60% / 벡터 40%
Reranker 모델:        cross-encoder/ms-marco-MiniLM-L-12-v2 (max_length 512)
RERANK_LIMIT:         50개

=== LLM 답변 생성 ===
RAG 모델:             gpt-4.1-nano (DB 설정)
fallback 모델:        gpt-3.5-turbo
max_tokens:           500
temperature:          0.1
LLM_CONTEXT_LIMIT:    5개 문서

=== 인프라 ===
aims_rag_api 포트:    8000 (uvicorn, PM2 미등록)
nginx 프록시:         /search_api → localhost:8000/search
프론트엔드 URL:       https://tars.giize.com/search_api (하드코딩)
```

---

## 7. 텍스트 노이즈 vs 실제 품질 병목 — 심층 교차 검증

> **검증일**: 2026-03-13
> **검증 방법**: Alex(기술분석) + Gini(실증 테스트) + PM(ROI 분석) 3-agent 교차 검증
> **배경**: "원본 텍스트에 노이즈가 많아서 RAG 품질이 나쁘다 → AI 정제 필요" 가설 검증

### 7-1. 텍스트 노이즈 정량 측정 결과

임베딩 완료 문서 220건의 원본 텍스트를 정량 분석:

| 확장자 | 문서수 | 비율 | 평균 텍스트 | 평균 노이즈 | 주된 노이즈 원인 |
|--------|-------|------|-----------|-----------|-----------------|
| pdf | 139 | 63% | 6,683자 | 4.3% | 반복 헤더/푸터 |
| xlsx | 40 | 18% | 1,775자 | 23.9% | 탭 문자, 빈 셀 |
| xls | 6 | 3% | 4,605자 | 24.9% | 탭 문자, 빈 셀 |
| pptx | 12 | 5% | 1,351자 | 0.7% | 낮음 |
| hwp | 9 | 4% | 9,669자 | 0.2% | 낮음 (일부 깨진 문자) |
| docx | 6 | 3% | 4,192자 | 12.0% | 탭 문자 |

**노이즈 최악 사례:**
- `급여대장.xlsx`: 62% 노이즈 (텍스트의 52.8%가 탭 문자)
- `캐치업코리아-증권&입금내역.pdf`: 39.7% (동일 보험 약관 문구 13회 반복)
- `김보성님운전자보험청약서.pdf`: 12.3% (헤더 "☎ 031-901-3555..." 12회 반복)

### 7-2. 가설 검증 — "텍스트 노이즈가 RAG 품질의 주범인가?"

#### 결론: 부분적으로만 맞음. 주범은 아님.

3개 에이전트가 독립적으로 분석한 결과, 모두 같은 결론에 도달:

**(1) 임베딩 모델은 탭/공백 노이즈에 강건하다 (Alex 분석)**

text-embedding-3-small은 Transformer 기반이라:
- `\t\t\t\t`를 BPE 토크나이저가 1~2개 토큰으로 압축
- self-attention이 의미 있는 토큰에 자연스럽게 높은 가중치 부여
- 연속 공백 20개 vs 1개 → cosine similarity 0.95 이상 (거의 동일)

즉, Excel의 "52.8% 탭 문자"는 벡터에 생각보다 적은 영향.

**(2) 실제 검색은 지금도 작동하고 있다 (Gini 실증 테스트)**

서버에서 실제 검색 수행 결과:
- `"보험료"` 검색 → xlsx 파일 `캐치업2022.08보험 가입현황.xlsx`에서 **정확한 정보 반환**
  (달러경영인종신 보험료 2,710.80 USD, 운전자보험 2,500,000원 등)
- `"낙마 사고"` 검색 실패 → 텍스트 노이즈 문제가 아닌 **관련 문서 자체가 없음**

**(3) PDF 반복 헤더만 실제 문제 (3개 에이전트 합의)**

- 반복 헤더/푸터는 의미 있는 토큰이라 모델이 무시 못함
- 청크 1500자 중 상당 부분을 헤더가 차지하면 **의미 밀도가 실제로 저하**
- 단, 이것은 규칙 기반 중복 라인 탐지로 해결 가능 (AI 불필요)

### 7-3. 실제 품질 병목 — 우선순위 순 (3개 에이전트 합의)

| 순위 | 원인 | 영향도 | 텍스트 정제로 해결? |
|------|------|--------|-------------------|
| **1** | **preview 240자 제한** — 청크 1,500자 중 16%만 LLM에 전달 | **최대 (+25~35%)** | X |
| **2** | **168건(43%) no_text 스킵** — jpg 83건, 스캔PDF 63건 임베딩 안 됨 | **최대** | X |
| **3** | **gpt-4.1-nano** — 최경량 모델로 답변 생성 | 높음 (+15~20%) | X |
| **4** | **시스템 프롬프트 1문장** — 답변 형식/도메인 가이드 없음 | 높음 (+15~20%) | X |
| **5** | **max_tokens 500** — 답변 잘림 | 중간 (+10~15%) | X |
| 6 | PDF 반복 헤더/푸터 | 중간 (+5~8%) | O (규칙 기반) |
| 7 | Excel 탭 노이즈 | **낮음** | 불필요 (이미 검색 잘 됨) |

> **PM 핵심 지적**: "아무리 검색이 정확해도 LLM에 16%밖에 전달하지 않으면 나머지 84%에 있는 답은 나올 수 없습니다. 정제된 노이즈 없는 텍스트를 240자 주는 것보다, 노이즈가 약간 있더라도 1,500자 전체를 주는 것이 훨씬 유리합니다."

### 7-4. "AI 텍스트 정제" 방안 평가

#### 장점
- Excel 테이블을 자연어로 변환 가능 (탭 범벅 → 구조화된 문장)
- OCR 오류 보정 가능
- 비용 자체는 낮음 (GPT-4o-mini 기준 220건 전체 ~$0.56)

#### 리스크 (Alex + Gini 합의)

**환각(Hallucination) — 보험 도메인에서 치명적:**
- "보험료 월 185,000원" → AI가 "180,000원"으로 변환할 위험
- "계약일 2024.03.15" → "2024.03.05"로 날짜 전위 가능
- RAG가 "정확한 듯 보이지만 틀린 정보"를 반환 → 설계사가 고객에게 잘못된 정보 전달

**정보 손실:**
- AI가 "비핵심"으로 판단한 정보 삭제 시 → 해당 키워드 검색에서 영구 미검출
- "정보가 있는데 못 찾는 것"보다 "정보를 삭제해서 아예 없는 것"이 더 나쁨

**기존 동작 파괴 (Gini Critical):**
- 현재 xlsx 검색이 **정상 작동 중** → 정제 적용 시 A/B 비교 없이 진행하면 기존 검색이 망가질 수 있음

### 7-5. 개선 로드맵 (3개 에이전트 합의)

#### Phase 1 — 즉시 시행 (1일 이내, 비용 거의 없음)

| 작업 | 위치 | 소요 | 효과 |
|------|------|------|------|
| PM2 등록 + deploy_all.sh 포함 | 서버 인프라 | 30분 | 가용성 확보 |
| max_tokens 500 → 1,500 | `rag_search.py:358` | 15분 | +10~15% |
| LLM_CONTEXT_LIMIT 5 → 8 | `rag_search.py:534` | 15분 | +5~10% |
| 시스템 프롬프트 개선 | `rag_search.py:341-345` | 1시간 | +15~20% |

예상 누적 효과: **+20~25%**

#### Phase 2 — 단기 (3~5일, 핵심 품질 개선)

| 작업 | 위치 | 소요 | 효과 |
|------|------|------|------|
| **preview 240 → 청크 전체 저장** | `save_to_qdrant.py` | 1시간 | **+25~35% (단일 최고)** |
| 전체 문서 재임베딩 | `full_pipeline.py` | 실행 대기 | Phase 2 전제 |
| 규칙 기반 텍스트 전처리 | `split_text_into_chunks.py` | 3시간 | +5~8% |
| nginx API 키 평문 제거 | 서버 nginx 설정 | 1시간 | 보안 Critical |

예상 누적 효과: **+45~55%**

#### Phase 3 — 중기 (2~3주, 선택적)

| 작업 | 소요 | 비고 |
|------|------|------|
| JWT 인증 추가 | 1일 | 크레딧 우회 방지 |
| N+1 enrichment → 배치 API | 1일 | 응답 속도 |
| Qdrant에 customer_id 추가 | 반일 + 재임베딩 | MongoDB 우회 제거 |
| RAG 모델 nano → mini | 15분 | 비용 3~5배 증가 검토 |
| AI 텍스트 정제 (Excel 우선) | 3~5일 | **Phase 2 완료 후 ROI 재측정하여 결정** |

### 7-6. Gini Quality Gate 결과

```
GINI QUALITY GATE: FAIL (텍스트 정제 단독 시행)

실패 사유:
1. Critical — 현재 정상 작동 중인 xlsx 검색에 부작용 가능
2. Major   — 근본 원인(43% no_text 스킵, preview 16% 전달)을 해결하지 않음
3. Major   — 정제 전/후 품질 비교 메트릭(Ground Truth) 미정의
4. Major   — "낙마 사고" 품질 저하 원인이 노이즈가 아닌 문서 부재

권고: Phase 1~2 선행 → 효과 측정 → AI 정제 ROI 재판단
```

---

## 8. 관련 파일 경로

| 구분 | 파일 |
|------|------|
| 임베딩 파이프라인 | `backend/embedding/full_pipeline.py` |
| 텍스트 추출 | `backend/embedding/extract_text_from_mongo.py` |
| 청킹 | `backend/embedding/split_text_into_chunks.py` |
| 임베딩 생성 | `backend/embedding/create_embeddings.py` |
| Qdrant 저장 | `backend/embedding/save_to_qdrant.py` |
| RAG 검색 API | `backend/api/aims_rag_api/rag_search.py` |
| 쿼리 분석 | `backend/api/aims_rag_api/query_analyzer.py` |
| 하이브리드 검색 | `backend/api/aims_rag_api/hybrid_search.py` |
| 재순위화 | `backend/api/aims_rag_api/reranker.py` |
| 토큰 추적 | `backend/api/aims_rag_api/token_tracker.py` |
| 검색 로깅 | `backend/api/aims_rag_api/search_logger.py` |
| 프론트엔드 검색 | `frontend/aims-uix3/src/services/searchService.ts` |
| 검색 UI | `frontend/aims-uix3/src/contexts/DocumentSearchProvider.tsx` |
