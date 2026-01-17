# AIMS 크레딧 관리 현황 조사 보고서

> 작성일: 2026-01-17 (재조사)
> 목적: AI 사용처별 크레딧 관리 상태 정확히 파악

---

## 1. AI 사용처 전체 맵핑

### 1.1 AI 사용처 요약 테이블

| AI 사용처 | AI 종류 | 크레딧 체크 | 토큰 기록 | 심각도 |
|----------|---------|:----------:|:--------:|:------:|
| **AI 어시스턴트 (Chat)** | Anthropic Claude | ✅ | ✅ | - |
| **문서 요약 (Summary)** | OpenAI gpt-4o-mini | ❌ | ❌ | 🔴 |
| **OCR** | Upstage API (AI 아님) | ❌ | 페이지만 | 🟡 |
| **Annual Report 파싱** | pdfplumber_table (AI 아님) | N/A | N/A | - |
| **Customer Review 파싱** | pdfplumber_table (AI 아님) | N/A | N/A | - |
| **RAG 쿼리 임베딩** | OpenAI embedding | ❌ | ❌ | 🟡 |
| **문서 청크 임베딩** | OpenAI embedding | ❌ | ❌ | 🔴 |

> **참고**: Annual Report와 Customer Review 파서는 설정 가능 (`openai` | `pdfplumber` | `pdfplumber_table` | `upstage`)
> 현재 운영 설정: `pdfplumber_table` (AI 미사용)

---

## 2. 상세 분석

### 2.1 ✅ 크레딧 관리가 되는 곳: AI 어시스턴트 (Chat)

**위치**: `backend/api/aims_api/server.js` (line 11410)

```javascript
const creditCheck = await checkCreditBeforeAI(db, analyticsDb, userId);
if (!creditCheck.allowed) {
  res.write(`data: ${JSON.stringify({
    type: 'credit_exceeded',
    ...
  })}\n\n`);
}
```

- **크레딧 체크**: `checkCreditBeforeAI()` 호출
- **토큰 기록**: `aims_analytics.ai_token_usage` 컬렉션에 기록
- **UI 피드백**: `CreditExceededDialog` 표시

---

### 2.2 ❌ 문서 요약 (Summary) - 크레딧 체크 없음

**경로**:
```
문서 업로드 → OCR 완료 → Summary 생성 (AI)
```

**파일**: `backend/api/document_pipeline/routers/doc_ocr.py` (line 84-88)

```python
if ocr_result.get("full_text"):
    try:
        summary, tags = await openai_service.summarize_text(ocr_result["full_text"])
    except Exception as e:
        logger.warning(f"Summary generation failed: {e}")
```

**AI 호출**: `backend/api/document_pipeline/services/openai_service.py`

```python
response = await client.chat.completions.create(
    model="gpt-4o-mini",  # ← AI 사용
    messages=[...],
    max_tokens=max_length,
    temperature=0.3
)
```

**문제점**:
- OCR 후 자동으로 AI 요약 실행
- 크레딧 체크 없음
- 토큰 기록 없음

---

### 2.3 ⚠️ OCR - Upstage API (AI 아님)

**경로**:
```
문서 업로드 → Upstage OCR API → MongoDB 저장
```

**파일**: `backend/api/document_pipeline/services/upstage_service.py`

**현황**:
- OCR은 **Upstage API** 사용 (OpenAI AI가 아님, 별도 유료 서비스)
- 페이지 수는 `files.ocr.page_count`에 기록됨
- `creditService.js`에서 OCR 페이지 수를 크레딧으로 환산 (`CREDIT_RATES.OCR_PER_PAGE = 2`)
- **하지만**: OCR 실행 전 크레딧 체크 없음 (사후 집계만)

---

### 2.4 ✅ Annual Report / Customer Review 파싱 - AI 미사용 (현재 설정)

**파서 설정 (aims_api /api/settings/ai-models)**:

| 항목 | 현재 설정 | AI 사용 |
|-----|----------|:------:|
| Annual Report | `parser: "pdfplumber_table"` | ❌ |
| Customer Review | `parser: "pdfplumber_table"` | ❌ |

**선택 가능한 파서 종류**:
- `openai` - OpenAI API 사용 (AI 비용 발생)
- `pdfplumber` - pdfplumber 라이브러리 (AI 없음)
- `pdfplumber_table` - pdfplumber 테이블 추출 (AI 없음) ← **현재 설정**
- `upstage` - Upstage API (별도 비용)

**파서 코드 위치**:
- `parser.py` - OpenAI 파서 (설정에서 "openai" 선택 시)
- `cr_parser.py` - pdfplumber 파서 (설정에서 "pdfplumber*" 선택 시)

**결론**: 현재는 pdfplumber_table을 사용하므로 **AI 비용 없음**

---

### 2.5 ❌ RAG 쿼리 임베딩 - 크레딧 체크 없음

**파일**: `backend/api/aims_rag_api/hybrid_search.py` (line 171-183)

```python
response = self.openai_client.embeddings.create(
    input=query,
    model="text-embedding-3-small"  # ← AI 사용
)
query_vector = response.data[0].embedding
# 🔥 Phase 4: 임베딩 응답 저장 (토큰 추적용)
self.last_embedding_response = response  # 저장만 하고 기록 안함
```

**문제점**:
- 검색할 때마다 embedding API 호출
- 크레딧 체크 없음
- 토큰 기록 없음 (변수에만 저장)

---

### 2.6 ❌ 문서 청크 임베딩 - 크레딧 체크 없음

**파일**: `backend/embedding/create_embeddings.py`

```python
response = client.embeddings.create(
    input=chunk['text'],
    model="text-embedding-3-small",  # ← AI 사용
    encoding_format="float"
)
chunk['embedding'] = response.data[0].embedding
```

**흐름**:
```
문서 텍스트 추출 → 청크 분할 → 각 청크 임베딩 → Qdrant 저장
```

**문제점**:
- 문서당 여러 청크 → 여러 번 API 호출
- 크레딧 체크 없음
- 토큰 기록 없음

---

## 3. 크레딧 환산 기준

**파일**: `backend/api/aims_api/lib/creditService.js`

```javascript
const CREDIT_RATES = {
  OCR_PER_PAGE: 2,        // OCR 1페이지 = 2 크레딧
  AI_PER_1K_TOKENS: 0.5   // AI 1K 토큰 = 0.5 크레딧
};
```

---

## 4. 크레딧 저장소

| DB | 컬렉션 | 저장 정보 | 상태 |
|----|--------|----------|:----:|
| `docupload` | `files` | OCR 페이지 수 (`ocr.page_count`) | ✅ 기록됨 |
| `aims_analytics` | `ai_token_usage` | AI 토큰 사용량 | ⚠️ Chat만 기록 |

---

## 5. 문제 요약

### 5.1 크레딧 체크 없음 (사전 체크)

| 사용처 | 심각도 | 영향 |
|--------|:------:|------|
| 문서 요약 (Summary) | 🔴 | OCR 후 자동 AI 호출 |
| 문서 청크 임베딩 | 🔴 | 문서당 수십 번 API 호출 |
| RAG 쿼리 임베딩 | 🟡 | 검색마다 API 호출 |
| OCR | 🟡 | 사후 집계만 (사전 체크 없음) |

> **참고**: Annual Report/Customer Review 파싱은 현재 pdfplumber_table 설정으로 AI 미사용

### 5.2 토큰 기록 없음 (사후 추적)

- **기록되는 것**: Chat API 토큰, OCR 페이지 수
- **기록 안 되는 것**: Summary 토큰, Embedding 토큰

---

## 6. 현재 크레딧 계산 로직

`creditService.js::getCycleCreditsUsed()`:

```javascript
const totalCredits = ocrUsage.credits + aiUsage.credits;
```

**문제**:
- `aiUsage`는 `aims_analytics.ai_token_usage`에서 집계
- Chat API만 기록 → **다른 AI 사용량 누락**

---

## 7. 개선 권고안

### 7.1 우선순위 1 (긴급) 🔴

1. **문서 요약**: 요약 전 크레딧 체크 + 토큰 기록 추가
2. **문서 임베딩**: 임베딩 전 크레딧 체크 + 토큰 기록 추가

> **참고**: Annual Report 파싱은 현재 pdfplumber_table 사용으로 AI 비용 없음 (설정이 openai로 변경되면 크레딧 체크 필요)

### 7.2 우선순위 2 (중요) 🟡

4. **OCR**: 업로드 전 예상 크레딧 체크
5. **RAG 쿼리 임베딩**: 토큰 기록 추가 (체크는 선택)

### 7.3 토큰 기록 통합

모든 AI 호출에서 `aims_analytics.ai_token_usage`에 기록하도록 통합:

```javascript
// 기록 형식 통합
{
  user_id: string,
  timestamp: Date,
  source: "chat" | "summary" | "annual_report" | "embedding_doc" | "embedding_query",
  model: string,
  prompt_tokens: number,
  completion_tokens: number,
  total_tokens: number
}
```

---

## 8. 관련 파일 경로

### 크레딧 관리

| 파일 | 설명 |
|-----|------|
| `backend/api/aims_api/lib/creditService.js` | 크레딧 계산/체크 |
| `backend/api/aims_api/server.js` | Chat API 크레딧 체크 |

### AI 사용 (크레딧 체크 없음)

| 파일 | AI 종류 | 현재 사용 |
|-----|---------|:--------:|
| `backend/api/document_pipeline/routers/doc_ocr.py` | Summary 호출 | ✅ |
| `backend/api/document_pipeline/services/openai_service.py` | Summary (gpt-4o-mini) | ✅ |
| `backend/api/aims_rag_api/hybrid_search.py` | 쿼리 임베딩 | ✅ |
| `backend/embedding/create_embeddings.py` | 문서 임베딩 | ✅ |

### AI 미사용 (현재 설정)

| 파일 | AI 종류 | 현재 설정 |
|-----|---------|----------|
| `backend/api/annual_report_api/services/parser.py` | AR 파싱 (OpenAI) | ❌ pdfplumber_table 사용 |
| `backend/api/annual_report_api/services/cr_parser.py` | CR 파싱 (pdfplumber) | ✅ pdfplumber_table 사용 |

---

## 9. 결론

**현재 상태**:
- ✅ AI 어시스턴트: 크레딧 관리 완료
- ✅ Annual Report/Customer Review 파싱: pdfplumber_table 사용 (AI 비용 없음)
- ❌ 문서 요약 (Summary): 크레딧 체크 없음
- ❌ 문서/쿼리 임베딩: 크레딧 체크 없음

**AI 비용 발생 지점 (크레딧 체크 없음)**:
1. 문서 요약 - OpenAI gpt-4o-mini
2. 문서 청크 임베딩 - OpenAI text-embedding-3-small
3. RAG 쿼리 임베딩 - OpenAI text-embedding-3-small

**권고**:
- 문서 요약/임베딩에 토큰 기록 추가 (사후 추적)
- 고비용 작업에 사전 크레딧 체크 추가
