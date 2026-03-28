# 전체 문서 데이터 SSoT 구조 설계안

> 작성일: 2026-03-27 | 최종 수정: 2026-03-28 | 작성: Alex | 리뷰: Alex, Gini, Claude
> 상태: Phase 1~3 완료, Phase 4~5 미착수

## 1. 개요

### 목표

**"전체 문서 보기" 페이지에서 어떤 칼럼을 클릭하든 정확하게 정렬이 동작하게 한다.**

### 원인

정렬이 깨지는 근본 원인은 동일한 데이터가 DB의 여러 위치에 중복 저장되어 있고,
**정렬 파이프라인이 참조하는 필드**와 **화면에 표시되는 필드**가 서로 다른 소스를 바라보기 때문이다.

### 해법

8개 칼럼 각각에 대해 DB 저장 위치 · API 반환 패턴 · 정렬 참조 필드 · 화면 표시 필드를 전수 조사하고,
SSoT(Single Source of Truth)를 확립하여 **정렬과 표시가 반드시 동일한 소스를 참조하도록 통합**한다.

### 완료 기준

> 8개 칼럼 모두에 대해: **정렬 파이프라인이 참조하는 값 = 화면에 표시되는 값** (동일 소스)

### 검증 방법 (PASS 조건)

**코드 리뷰만으로는 PASS가 아니다. 실제 데이터로 증명해야 한다.**

모든 칼럼에 대해 오름차순/내림차순 정렬을 실행하고, 반환된 데이터가 실제로 정확하게 정렬되어 있는지 검증한다.

| 단계 | 내용 | 도구 |
|------|------|------|
| 1 | 코드 리뷰: 정렬 소스 = 표시 소스 동일 확인 | grep, 코드 읽기 |
| 2 | **실제 API 호출**: 8개 칼럼 × 2방향(asc/desc) = 16회 정렬 요청 | curl / Playwright |
| 3 | **데이터 검증**: 반환된 데이터가 해당 칼럼 값 기준으로 정확히 정렬되어 있는지 확인 | 자동화 테스트 |
| 4 | **엣지 케이스**: null/빈값 문서가 기대 위치(맨 뒤)에 있는지 확인 | 자동화 테스트 |

> Phase 5 완료 후 이 검증을 통과해야 최종 PASS.

### 분석 대상 API 엔드포인트 (3개)

| # | 엔드포인트 | 용도 | 파일:라인 |
|---|-----------|------|----------|
| A | `GET /api/documents` | 전체 문서 보기 (레거시) | `documents-routes.js:332` |
| B | `GET /api/documents/status` | 전체 문서 보기 (V2, 주력) | `documents-routes.js:~1220` |
| C | `GET /api/customers/:id/documents` | 고객별 문서 | `customers-routes.js:2471` |

### `meta` 필드의 현재 역할

`meta`는 **파이프라인 중간 처리 결과 컨테이너**이다.
파이프라인이 메타데이터를 추출하면 `meta.*`에 저장하고, 일부 필드는 top-level로 승격(복사)된다.

현재 `meta`에 저장되는 주요 데이터:
- `meta.mime` — MIME 타입 (SSoT)
- `meta.size_bytes` — 파일 크기 (SSoT)
- `meta.filename` — 원본 파일명 (upload.originalName과 중복)
- `meta.extension` — 확장자 (meta.mime에서 유도 가능)
- `meta.full_text` — 추출 텍스트 (SSoT, 파이프라인 전용)
- `meta.summary` — AI 요약 (SSoT)
- `meta.document_type` — AI 분류 결과 (**top-level과 이중 저장, 문제**)
- `meta.meta_status` — 메타 추출 상태 (SSoT)
- `meta.pdf_pages` — PDF 페이지 수 (SSoT)
- EXIF 정보 (`meta.width`, `meta.height`, `meta.date_taken` 등)

---

## 2. 칼럼별 SSoT 현황 진단

### 2-1. 유형 (AR/CRS 뱃지)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `is_annual_report` (top-level, Boolean), `is_customer_review` (top-level, Boolean) |
| **API 반환** | `doc.is_annual_report`, `doc.is_customer_review` — 직접 반환 |
| **정렬 참조** | 직접 정렬 없음 (docType 정렬 시 `$switch`로 참조) |
| **화면 표시** | `doc.is_annual_report`, `doc.is_customer_review` — 직접 참조 |
| **fallback 패턴** | 없음 |
| **진단** | **SSoT 확립됨** |

두 플래그 모두 top-level에만 저장되고, 모든 코드가 동일 필드를 참조한다.

---

### 2-2. 파일명

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | (1) `upload.originalName` — 원본 파일명, (2) `displayName` — AI/사용자 별칭, (3) `meta.filename` — 파이프라인 추출 파일명 |
| **API 반환** | A: `filename: doc.upload?.originalName`, `displayName: doc.displayName` / B,C: `originalName: doc.upload?.originalName`, `displayName: doc.displayName` |
| **정렬 참조** | A: `upload.originalName`만 참조 (SSoT 위반) / B: `$ifNull: ['$displayName', '$upload.originalName']` (화면 표시와 일치) |
| **화면 표시** | `filenameMode === 'display'`이면 displayName 우선, 아니면 originalName |
| **fallback 패턴** | 프론트엔드 `extractFilenameFromRaw()`: `raw.upload.originalName` → `raw.meta.filename` fallback |

**진단: 부분적 SSoT 위반**

| 문제 | 심각도 | 설명 |
|------|--------|------|
| `meta.filename`과 `upload.originalName` 이중 저장 | **중** | `meta.filename`은 파이프라인에서 `original_name`을 그대로 저장. `upload.originalName`과 항상 동일한 값 |
| API A의 filename 정렬이 `upload.originalName`만 참조 | **낮** | API A는 레거시이고, API B가 주력. API B는 displayName을 우선 사용하여 화면과 일치 |

---

### 2-3. 문서유형 (document_type)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | (1) `document_type` (top-level) — 의도된 SSoT, (2) `meta.document_type` — 파이프라인 중간 저장 |
| **API 반환** | **8곳 모두** `doc.document_type || doc.meta.document_type || null` fallback 패턴 |
| **정렬 참조** | `$ifNull: ['$document_type', '$meta.document_type']` (임시 조치 적용 후) |
| **화면 표시** | API fallback 결과를 그대로 표시 |
| **연관 필드** | `document_type_auto` (동일한 이중 저장 패턴), `document_type_confidence` (고객 문서 API에서만 fallback) |

**진단: SSoT 위반 (가장 심각)**

이미 `DOCUMENT_TYPE_FIELD_INCONSISTENCY.md`에 상세 분석 완료.
- 레거시 파이프라인(`_step_update_meta_to_db`)이 `meta.document_type`만 저장하고 top-level을 누락
- top-level이 null인 문서 749건 (33%)
- 정렬과 표시가 다른 소스를 바라봄

---

### 2-4. 크기 (fileSize)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `meta.size_bytes` (유일) |
| **API 반환** | `fileSize: doc.meta?.size_bytes` — 한 곳에서만 읽음 |
| **정렬 참조** | `$toLong: '$meta.size_bytes'` — 동일 필드 참조 |
| **화면 표시** | `DocumentUtils.formatFileSize()` — API 응답의 fileSize 사용 |
| **fallback 패턴** | 없음 |
| **진단** | **SSoT 확립됨** |

---

### 2-5. 타입 (확장자/MIME)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `meta.mime` (SSoT), `meta.extension` (파이프라인 저장, API에서 미사용) |
| **API 반환** | `mimeType: doc.meta?.mime` |
| **정렬 참조** | `$split: ['$upload.originalName', '.']`로 확장자 추출 (mime이 아닌 파일명에서 유도) |
| **화면 표시** | `DocumentUtils.getFileExtension(doc.mimeType)` — mime에서 확장자 유도 |
| **fallback 패턴** | 없음 |

**진단: 부분적 SSoT 위반 (경미) + badgeType 정렬 버그 (심각)**

| 문제 | 심각도 | 설명 |
|------|--------|------|
| 정렬은 `upload.originalName`에서 확장자 추출, 표시는 `meta.mime`에서 유도 | **낮** | 대부분 일치하지만, 확장자가 누락/변경된 파일명은 불일치 가능 |
| `meta.extension` 미활용 중복 | **최소** | 파이프라인이 저장하지만 API/프론트엔드에서 사용하지 않음 |
| **`badgeType` 정렬 파이프라인이 존재하지 않는 `$metadata.mimetype` 참조** | **높음** | `documents-routes.js:1544`에서 BIN 판별 Level 2가 `$metadata.mimetype`을 참조하지만, 실제 DB 필드는 `$meta.mime`이다. 항상 빈 문자열을 반환하여 압축/오디오/비디오/실행 파일의 BIN 분류가 무효화됨 |

---

### 2-6. 업로드 날짜

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `upload.uploaded_at` (SSoT), `createdAt` (MongoDB 자동 생성, 백업) |
| **API 반환** | B,C: `uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at)` / A: `uploadTime: doc.upload?.uploaded_at || doc.createdAt` |
| **정렬 참조** | `$toDate: '$upload.uploaded_at'` — 동일 필드 참조 |
| **화면 표시** | API 응답의 uploadedAt/uploadTime 사용 |
| **fallback 패턴** | API A에서만 `doc.createdAt` fallback |

**진단: SSoT 확립됨 (경미한 fallback 1곳)**

API A(레거시)에서 `createdAt` fallback이 있으나, `upload.uploaded_at`이 없는 문서는 사실상 존재하지 않음.
정렬과 표시가 동일 필드(`upload.uploaded_at`)를 바라보므로 실질적 문제 없음.

---

### 2-7. 상태 (status/overallStatus)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `overallStatus` (top-level, 캐시), `progress`/`progressStage` (파이프라인 실시간), 각 서브 객체의 상태 (`meta.meta_status`, `ocr.status`, `docembed.status`) |
| **API 반환** | `prepareDocumentResponse()` 또는 `analyzeDocumentStatus()`로 계산하여 `overallStatus`, `progress`, `uiStages` 반환 |
| **정렬 참조** | `overallStatus` (top-level 캐시 필드) 직접 정렬 |
| **화면 표시** | API가 계산한 `overallStatus`, `progress` 사용 |

**진단: SSoT 확립됨 (설계적으로 올바름)**

`overallStatus`는 **캐시 필드**로, 각 서브 상태에서 계산된다.
API B에서는 매 조회 시 `prepareDocumentResponse()`로 재계산하고, 변경이 있으면 DB에 `bulkWrite`로 동기화한다.
이것은 이중 저장이 아니라 **성능 최적화를 위한 정당한 캐시**이다.

- 정렬: `overallStatus` (캐시) 사용 — 정상 (매 조회 시 동기화됨)
- 표시: 계산된 값 사용 — 정상

---

### 2-8. 연결된 고객 (customer_relation)

| 항목 | 내용 |
|------|------|
| **DB 저장 위치** | `customerId` (top-level, ObjectId — SSoT), `customer_relation` (DB에 저장되지 않음, API에서 동적 생성) |
| **API 반환** | 모든 API에서 `customerId`로 customers 컬렉션을 lookup하여 `customer_relation` 객체를 동적 구성 |
| **정렬 참조** | `$lookup`으로 `customers` 컬렉션과 join, `personal_info.name`으로 정렬 |
| **화면 표시** | `customer_relation.customer_name` (API 동적 생성) |
| **fallback 패턴** | 없음 |
| **진단** | **SSoT 확립됨** |

`customerId`가 SSoT이고, 고객명은 항상 customers 컬렉션에서 실시간으로 가져온다.
`customer_relation`은 DB에 저장되지 않으므로 이중 저장 문제 없음.

> 참고: `customers.documents[]` 배열이 레거시로 남아 있지만,
> 이미 `customers-routes.js:2496`에서 "Single Source of Truth: files.customerId로 직접 조회"로 전환 완료.

---

## 3. 문제 요약

### 수정 필요 (SSoT 위반)

| # | 칼럼 | 문제 | 심각도 | 사용자 영향 |
|---|------|------|--------|-----------|
| 1 | **문서유형** | `document_type` vs `meta.document_type` 이중 저장. 8곳 fallback. 정렬 불일치 | **높음** | 정렬 시 순서 뒤섞임 |
| 2 | **문서유형(부속)** | `document_type_auto` vs `meta.document_type_auto` 이중 저장. 5곳 fallback | **중간** | 기능에는 영향 미미 |
| 3 | **타입(badgeType)** | `badgeType` 정렬 파이프라인이 `$metadata.mimetype`(존재하지 않는 필드) 참조. BIN 분류 무효화 | **높음** | 압축/오디오/비디오/실행 파일 정렬 오류 |
| 4 | **파일명** | `meta.filename`이 `upload.originalName`과 중복 저장 | **낮음** | 사용자 영향 없음 |
| 5 | **타입(확장자)** | 정렬은 파일명에서 추출, 표시는 MIME에서 유도. 불일치 가능 | **낮음** | 극히 드문 경우만 |

### 수정 불필요 (SSoT 확립됨)

| 칼럼 | 비고 |
|------|------|
| 유형 (AR/CRS 뱃지) | top-level 플래그만 사용, 이중 저장 없음 |
| 크기 | `meta.size_bytes` 단일 소스 |
| 업로드 날짜 | `upload.uploaded_at` 단일 소스 (레거시 API에 경미한 fallback 1곳) |
| 상태 | 계산 + 캐시 패턴, 매 조회 시 동기화 |
| 연결된 고객 | `customerId` SSoT + 동적 lookup |

---

## 4. SSoT 구조 설계 (수정 대상)

### 4-1. 문서유형 (document_type) — 최우선

> 상세 분석: `docs/DOCUMENT_TYPE_FIELD_INCONSISTENCY.md`

#### SSoT 선정: `document_type` (top-level)

**이유:**
- 통계, CRUD, AR/CRS 플래그 등 모든 비즈니스 로직이 top-level 사용
- 정렬 파이프라인이 top-level 참조
- `meta.document_type`은 파이프라인 중간 결과일 뿐

#### 수정 계획

**Phase 1: 파이프라인 쓰기 경로 교체 (원인 제거) — 가장 중요**

`meta.document_type`에 쓰는 **7곳 전부**에서 해당 라인을 **삭제**하고,
대신 top-level `document_type`에 쓰도록 **교체**한다.
"추가"가 아니라 "교체"이다. 두 곳에 쓰고 동기화하는 것은 SSoT 위반이므로 금지.

| # | 파일:라인 | 경로 | 변경 내용 |
|---|----------|------|----------|
| W1 | `doc_prep_main.py:1446` | 레거시 파이프라인 | `meta.document_type` 라인 삭제, top-level 교체 |
| W2 | `doc_prep_main.py:2352` | xPipe 파이프라인 | 동일 |
| W3 | `adapter.py:497` | AR 분류 | 동일 |
| W4 | `adapter.py:561` | CRS 분류 | 동일 |
| W5 | `pdf_conversion_worker.py:306,341` | PDF 변환 | 동일 |
| W6 | `ocr_worker.py:323` | OCR 처리 | 동일 |
| W7 | `reclassify_from_db.py:348` | 재분류 | 동일 |

```python
# 예시: doc_prep_main.py _step_update_meta_to_db

# 기존 (잘못된 구조 — meta에만 저장):
meta_update = {
    "meta.filename": ctx.meta_result.get("filename"),
    "meta.extension": ctx.meta_result.get("extension"),
    "meta.document_type": ctx.ai_document_type,   # ← 이 라인 삭제!
    "meta.confidence": ctx.ai_confidence,
    ...
}

# 수정 (올바른 구조 — top-level에 직접 저장):
meta_update = {
    "meta.filename": ctx.meta_result.get("filename"),
    "meta.extension": ctx.meta_result.get("extension"),
    # "meta.document_type" 삭제됨 — top-level이 SSoT
    "meta.confidence": ctx.ai_confidence,
    ...
    # top-level에 직접 쓰기
    "document_type": ctx.ai_document_type or "general",
    "document_type_auto": True,
}
```

> **핵심:** `meta.document_type`은 더 이상 쓰지 않는다. 7곳 모두 동일한 패턴으로 교체.

**Phase 1 연동 테스트 (W1~W7과 같은 커밋에 포함 — CI 깨짐 방지)**

Phase 1에서 `meta.document_type` 쓰기를 제거하면, 해당 필드를 assert하는 테스트 3개가 즉시 깨진다.
반드시 W1~W7과 **같은 커밋**에 아래 수정을 포함해야 한다.

| # | 파일 | 라인 | 변경 내용 | 연동 |
|---|------|------|----------|------|
| T-P1-1 | `test_insurance_adapter_hooks.py` | 246 | `assert fields["meta.document_type"] == "annual_report"` → `assert fields["document_type"] == "annual_report"` | W3/W4 |
| T-P1-2 | `test_insurance_adapter_hooks.py` | 333 | `assert fields["meta.document_type"] == "customer_review"` → `assert fields["document_type"] == "customer_review"` | W3/W4 |
| T-P1-3 | `test_characterization_process_pipeline.py` | 248 | `assert set_data["meta.document_type"] == "general"` → `assert set_data["document_type"] == "general"` | W1 |
| T-P1-4 | `test_pipeline_e2e.py` | 68,70 | `"meta.document_type": {"$exists": True, "$nin": ["general", None]}` → `"document_type"` (top-level) 존재 검증으로 교체 | Phase 1 전체 |

> **주의:** 이 테스트들은 Phase 1의 쓰기 경로 변경과 직접 연동된다.
> 코드 변경만 커밋하고 테스트 수정을 누락하면 CI가 깨지므로, 반드시 같은 커밋에 포함한다.

**Phase 2: 기존 데이터 마이그레이션**

```javascript
// document_type이 null이고 meta.document_type에 값이 있는 문서 → top-level로 복사
db.files.updateMany(
  { document_type: null, 'meta.document_type': { $ne: null } },
  [{ $set: {
    document_type: '$meta.document_type',
    document_type_auto: { $ifNull: ['$document_type_auto', { $ifNull: ['$meta.document_type_auto', false] }] },
    document_type_confidence: { $ifNull: ['$document_type_confidence', { $ifNull: ['$meta.confidence', null] }] }
  }}]
)
```

**Phase 3: fallback 코드 제거 + 임베딩 파이프라인 읽기 경로 수정**

**3-A. API/프론트엔드 fallback 제거 (8+5곳)**

| 파일:라인 | 변경 전 | 변경 후 |
|----------|--------|--------|
| `documentStatusHelper.js:92` | `doc.document_type \|\| (doc.meta && doc.meta.document_type) \|\| null` | `doc.document_type \|\| null` |
| `documents-routes.js:681` | 동일 fallback | `doc.document_type \|\| null` |
| `documents-routes.js:966` | 동일 fallback | `doc.document_type \|\| null` |
| `documents-routes.js:1021` | `document_type: { $ifNull: ['$document_type', { $ifNull: ['$meta.document_type', null] }] }` | `document_type: { $ifNull: ['$document_type', null] }` |
| `documents-routes.js:1622` | `$ifNull: ['$document_type', '$meta.document_type']` | `'$document_type'` |
| `documents-routes.js:1888` | 동일 fallback | `doc.document_type \|\| null` |
| `documents-routes.js:3450` | `doc.document_type \|\| (doc.meta && doc.meta.document_type) \|\| 'unspecified'` | `doc.document_type \|\| 'unspecified'` |
| `customers-routes.js:2564` | 동일 fallback | `doc.document_type \|\| null` |

`document_type_auto` fallback도 동일하게 5곳 제거.

**3-B. 임베딩 파이프라인 읽기 경로 수정 (3곳)**

| 파일:라인 | 변경 전 | 변경 후 |
|----------|--------|--------|
| `backend/embedding/reembed_all.py:81` | `doc.get('meta', {}).get('document_type', 'general')` | `doc.get('document_type', 'general')` |
| `backend/embedding/reembed_all.py:108` | `{'$ifNull': ['$meta.document_type', 'general']}` | `{'$ifNull': ['$document_type', 'general']}` |
| `backend/embedding/full_pipeline.py:563` | `doc_data.get('meta', {}).get('document_type', 'general')` | `doc_data.get('document_type', 'general')` |

이 3곳은 `meta.document_type`만 읽고 있으므로, Phase 1에서 `meta.document_type` 쓰기를 제거한 후
반드시 top-level `document_type`을 읽도록 수정해야 한다.

> **연쇄 해소:** `reembed_all.py:184`와 `split_text_into_chunks.py:93`은 R14/R16에서 전달하는 `meta` dict의 `document_type` 키를 읽는 구조이므로, R14/R16이 top-level에서 값을 가져오도록 수정되면 **자동으로 올바른 값을 참조**하게 된다. 별도 수정 불필요.

**3-B-2. 테스트 수정 대상 (Phase 3 이후)**

| 파일:라인 | 변경 내용 |
|----------|----------|
| `backend/embedding/tests/test_chunk_by_doc_type.py:145` | `_make_doc()` fixture가 `doc['meta']['document_type']`으로 테스트 데이터 구성 → Phase 3 이후 top-level `doc['document_type']`으로 변경 필요 |

**3-C. 정렬 파이프라인 `$ifNull` 제거 (1곳)**

정렬 파이프라인의 `$ifNull: ['$document_type', '$meta.document_type']`은 **제거**한다.
SSoT가 확립되면 불필요하고, 남겨두면 "두 곳을 봐도 된다"는 잘못된 전례가 된다.

**Phase 4: DB 필드 정리 ($unset)**

Phase 1~3 완료 후 코드에서 `meta.document_type`을 더 이상 읽지도 쓰지도 않으므로,
안정화 기간을 거친 뒤 DB에서 불필요한 필드를 `$unset`으로 제거한다.

```javascript
// Phase 4: 안정화 후 실행 — meta 내 document_type 관련 필드 제거
db.files.updateMany(
  { 'meta.document_type': { $exists: true } },
  { $unset: {
    'meta.document_type': '',
    'meta.document_type_auto': '',
    'meta.document_type_confidence': ''
  }}
)
```

> **주의:** `meta.confidence`는 AI 분류 신뢰도로 별도 용도이므로 제거 대상이 아니다.
> Phase 4는 Phase 1~3 완료 후 최소 1주 이상 안정적으로 운영된 것을 확인한 뒤 실행한다.

---

### 4-2. 파일명 (meta.filename 중복)

#### SSoT 선정: `upload.originalName` (이미 SSoT)

`meta.filename`은 파이프라인이 `original_name`을 그대로 복사하는 것이므로 항상 `upload.originalName`과 동일하다.

#### 수정 계획

**중복 제거는 보류한다.**

이유:
- `meta.filename`은 파이프라인 내부에서만 사용되고, API에서는 `upload.originalName`을 SSoT로 사용
- 프론트엔드의 `extractFilenameFromRaw()` fallback은 방어적 코드로, 실제로 트리거되는 경우가 없음
- 파이프라인이 `meta.filename`을 저장하는 것은 메타데이터 추출 결과의 일부로 자연스러움
- 제거 시 파이프라인 코드 수정 필요하나, 실질적 사용자 가치 없음

**권장 조치:** 프론트엔드 `extractFilenameFromRaw()`의 `meta.filename` fallback에 주석으로 "방어 코드: upload.originalName이 항상 존재하므로 도달하지 않음" 명시.

---

### 4-3. badgeType 정렬 MIME 경로 오류 — 즉시 수정

> Gini 품질 검증에서 발견 (2026-03-28)

#### 현황

`documents-routes.js`에서 `metadata.mimetype`(존재하지 않는 필드)을 참조하는 곳이 **2곳** 있다.

| # | 위치 | 용도 | 영향 |
|---|------|------|------|
| 1 | `:1544` | 정렬 파이프라인 (aggregate `$in`) | BIN 판별 Level 2 항상 무효화 → 정렬 부정확 |
| 2 | `:2169` | 통계 집계 (JavaScript `isBinaryMimeType()`) | badgeType 분포 카운트에서 BIN 누락 |

올바른 경로는 두 곳 모두 `meta.mime`이다.

```javascript
// :1544 — 정렬 파이프라인 (aggregate)
// 현재 (버그): { $toLower: { $ifNull: ["$metadata.mimetype", ""] } }
// 수정:        { $toLower: { $ifNull: ["$meta.mime", ""] } }

// :2169 — 통계 집계 (JavaScript)
// 현재 (버그): isBinaryMimeType(doc.metadata?.mimetype)
// 수정:        isBinaryMimeType(doc.meta?.mime)
```

**영향:** 압축(zip, rar 등), 오디오, 비디오, 실행 파일이 BIN으로 분류되지 않고 Level 3~5로 넘어감.
이는 SSoT 작업과 별개로 기존부터 존재하던 버그이나, 정렬 정확성에 직접 영향을 미치므로 함께 수정한다.

#### 수정 계획

| # | 파일:라인 | 변경 내용 |
|---|----------|----------|
| B1 | `documents-routes.js:1544` | `$metadata.mimetype` → `$meta.mime` (정렬 파이프라인) |
| B2 | `documents-routes.js:2169` | `doc.metadata?.mimetype` → `doc.meta?.mime` (통계 집계) |

---

### 4-4. 타입 정렬 소스 불일치 (확장자 vs MIME)

#### 현황

- **표시:** `meta.mime`에서 확장자 유도 (`DocumentUtils.getFileExtension`)
- **정렬:** `upload.originalName`에서 마지막 `.` 이후를 확장자로 추출

#### 수정 계획

**수정하지 않는다.**

이유:
- MIME 타입과 파일 확장자는 본질적으로 다른 데이터 (MIME은 내용 분석 결과, 확장자는 파일명의 일부)
- 사용자 관점에서 "타입별 정렬"은 확장자 기준이 더 직관적 (파일명에 보이는 것으로 정렬)
- 화면 표시도 결국 MIME에서 유도한 확장자 문자열이므로, 대부분의 경우 동일
- 불일치가 발생하는 경우: 확장자가 없거나 잘못된 파일 → 극히 드묾

---

### 4-5. 정렬 Regression 테스트 추가 — 필수

> Gini 품질 검증에서 지적 (2026-03-28): CLAUDE.md "기능 수정 시 regression 테스트 필수" 위반

Phase 1~3에서 `meta.document_type` 쓰기 방지 단언(negative assert)은 있으나,
**정렬 동작 자체**를 검증하는 자동화 테스트가 없다.

#### 테스트 시나리오

| # | 시나리오 | 검증 내용 |
|---|---------|----------|
| S1 | `document_type`=null 문서 정렬 | `docType_asc` 시 미지정 문서가 맨 뒤에 위치 |
| S2 | AR/CRS 문서 정규화 정렬 | `is_annual_report=true` 문서가 `annual_report` 라벨로 정렬에 참여 |
| S3 | SSoT 단일 소스 검증 | `meta.document_type`에 값이 있고 top-level `document_type`이 null인 문서가 있어도, 정렬이 top-level만 참조 |
| S4 | badgeType BIN 분류 | `meta.mime`이 `application/zip`인 문서가 `badgeType_asc` 정렬 시 BIN으로 분류 |

#### 파일

```
backend/api/aims_api/__tests__/regression-2026-03-28-ssot-sort.test.js
```

---

## 5. `meta` 필드의 역할 재정의

### 정의

> **`meta`는 파이프라인 처리 결과를 저장하는 중간 컨테이너이다.**
> 최종적으로 표시/정렬에 사용되는 데이터가 `meta`에만 있으면 안 된다 (SSoT 위반).
> 반드시 top-level 필드로 승격되어야 한다.

### `meta`에 담아야 하는 것 (파이프라인 결과)

| 필드 | 설명 | SSoT 여부 |
|------|------|----------|
| `meta.mime` | MIME 타입 | SSoT (유일한 저장소) |
| `meta.size_bytes` | 파일 크기 | SSoT (유일한 저장소) |
| `meta.full_text` | 추출 텍스트 | SSoT (파이프라인 전용) |
| `meta.summary` | AI 요약 | SSoT (유일한 저장소) |
| `meta.meta_status` | 메타 추출 상태 | SSoT (유일한 저장소) |
| `meta.pdf_pages` | PDF 페이지 수 | SSoT (유일한 저장소) |
| `meta.file_hash` | 파일 해시 | SSoT (중복 탐지용) |
| `meta.created_at` | 메타 추출 시각 | SSoT (유일한 저장소) |
| EXIF 필드들 | 이미지 메타데이터 | SSoT (유일한 저장소) |

### `meta`에 담으면 안 되는 것 (이미 top-level에 SSoT가 있는 데이터)

| 필드 | SSoT 위치 | 조치 |
|------|----------|------|
| `meta.document_type` | `document_type` (top-level) | Phase 1에서 쓰기 제거, Phase 4에서 DB $unset |
| `meta.document_type_auto` | `document_type_auto` (top-level) | Phase 1에서 쓰기 제거, Phase 4에서 DB $unset |
| `meta.document_type_confidence` | `document_type_confidence` (top-level) | Phase 1에서 쓰기 제거, Phase 4에서 DB $unset |

> **참고:** `meta.confidence`는 AI 분류 신뢰도(confidence score)로 `document_type_confidence`와는 별도 용도이다. 제거 대상이 아님.

### `meta`에 있어도 무방한 것 (중복이지만 무해)

| 필드 | SSoT 위치 | 이유 |
|------|----------|------|
| `meta.filename` | `upload.originalName` | 파이프라인 결과의 일부, API에서 미사용 |
| `meta.extension` | 없음 (유도 가능) | API에서 미사용, 저장만 됨 |
| `meta.length` | 없음 | `meta.full_text.length`와 동일, 편의용 |

---

## 6. 마이그레이션 전략

### 실행 순서 (의존성 고려)

```
Phase 1: 파이프라인 쓰기 경로 교체 (7곳) + 연동 테스트 (4곳) — 같은 커밋
    ↓
Phase 2: 기존 데이터 마이그레이션 (749건 top-level 동기화)
    ↓
Phase 3: 읽기 경로 정리 (API fallback 13곳 + 임베딩 3곳 + 정렬 $ifNull 1곳 + projection 1곳 = 18곳, 테스트 1곳)
    ↓
Phase 4: DB 필드 정리 (meta.document_type 등 $unset) — 안정화 후 실행
```

### Phase 간 안전성

- Phase 1만 적용: 신규 문서는 top-level에만 저장. 기존 문서는 fallback으로 커버 → **안전**
- Phase 1+2 적용: 모든 문서가 top-level에 값 보유. fallback은 아직 존재하나 트리거되지 않음 → **안전**
- Phase 1+2+3 적용: fallback 및 meta 읽기 경로 제거. 모든 코드가 top-level만 참조 → **안전**
- Phase 4: 코드에서 `meta.document_type`을 읽지도 쓰지도 않으므로 DB 정리해도 → **안전**
  - Phase 3 이후 최소 1주 안정화 기간 필요

### 롤백 계획

- Phase 1: 파이프라인 코드 revert (meta.document_type 쓰기 복원)
- Phase 2: 마이그레이션 전 스냅샷 필수 (단, top-level에 값을 쓴 것이므로 기존 데이터 손상 없음)
- Phase 3: fallback 코드 revert (Phase 2가 완료되었으면 사실상 불필요)
- Phase 4: $unset은 비가역적이므로 반드시 컬렉션 백업 후 실행

---

## 7. 리스크 분석

| 리스크 | 확률 | 영향 | 완화 방안 |
|--------|------|------|----------|
| 마이그레이션 시 `meta.document_type` 값이 잘못된 문서 존재 | 중 | 중 | 마이그레이션 전 `meta.document_type` 값 분포 조회, 유효하지 않은 값 필터링 |
| AR/CRS 문서가 마이그레이션으로 덮어써짐 | 낮 | 높 | 마이그레이션 조건에 `document_type: null` 포함 → AR/CRS는 이미 top-level 저장되어 있으므로 해당 없음 |
| Phase 3 이전에 파이프라인이 `meta.document_type`만 쓰는 새 경로 추가 | 낮 | 중 | Phase 1 커밋 메시지에 "모든 파이프라인 경로는 top-level document_type 필수" 명시 |
| Phase 4 `$unset` 시 외부 시스템이 `meta.document_type` 참조 | 낮 | 중 | Phase 3까지 완료 후 코드 전수 검색으로 참조 없음 확인. 컬렉션 백업 후 실행 |

---

## 8. 변경 파일 요약

### Phase 1: 파이프라인 쓰기 경로 교체 (7곳) + 연동 테스트 (4곳)

| # | 파일 | 라인 | 설명 |
|---|------|------|------|
| W1 | `doc_prep_main.py` | 1446 | 레거시 파이프라인 |
| W2 | `doc_prep_main.py` | 2352 | xPipe 파이프라인 |
| W3 | `adapter.py` | 497 | AR 분류 |
| W4 | `adapter.py` | 561 | CRS 분류 |
| W5 | `pdf_conversion_worker.py` | 306,341 | PDF 변환 |
| W6 | `ocr_worker.py` | 323 | OCR 처리 |
| W7 | `reclassify_from_db.py` | 348 | 재분류 |
| T-P1-1 | `test_insurance_adapter_hooks.py` | 246 | W3/W4 연동 테스트 |
| T-P1-2 | `test_insurance_adapter_hooks.py` | 333 | W3/W4 연동 테스트 |
| T-P1-3 | `test_characterization_process_pipeline.py` | 248 | W1 연동 테스트 |
| T-P1-4 | `test_pipeline_e2e.py` | 68,70 | Phase 1 전체 연동 e2e 테스트 |

### Phase 3: 읽기 경로 정리 (18곳 + 테스트 1곳)

| # | 파일 | 라인 | 설명 |
|---|------|------|------|
| R1-R6 | API fallback 6곳 | — | `doc.document_type \|\| doc.meta.document_type` → `doc.document_type` |
| R7 | `documents-routes.js` | 1021 | 내 파일 aggregate 프로젝션의 `$ifNull` fallback 제거 |
| R8 | `documents-routes.js` | 3450 | ZIP 다운로드 카테고리 분류 fallback 제거 |
| R9-R13 | `document_type_auto` fallback 5곳 | — | 동일 패턴 |
| R14 | `reembed_all.py` | 81 | `meta.document_type` 읽기 → top-level 교체 |
| R15 | `reembed_all.py` | 108 | dry-run 통계 aggregation `$ifNull` → top-level 교체 |
| R16 | `full_pipeline.py` | 563 | `meta.document_type` 읽기 → top-level 교체 |
| R17 | 정렬 `$ifNull` | — | `$ifNull` 제거 |
| R18 | `reclassify_from_db.py` | 261 | MongoDB projection에서 `"meta.document_type": 1` 제거 (top-level `document_type`은 260라인에서 이미 projection됨) |
| T1 | `test_chunk_by_doc_type.py` | 145 | `_make_doc()` fixture: `doc['meta']['document_type']` → `doc['document_type']` (top-level 기준으로 변경) |

### Phase 4: DB 필드 정리

| 대상 필드 | 조치 |
|----------|------|
| `meta.document_type` | `$unset` |
| `meta.document_type_auto` | `$unset` |
| `meta.document_type_confidence` | `$unset` |

> `meta.confidence`는 AI 분류 신뢰도(confidence score)로 별도 용도이므로 유지.

### Phase 5: badgeType MIME 경로 수정 + 정렬 regression 테스트 (같은 커밋)

> Gini 품질 검증 결과 추가 (2026-03-28)

| # | 파일 | 라인 | 설명 |
|---|------|------|------|
| B1 | `documents-routes.js` | 1544 | `$metadata.mimetype` → `$meta.mime` (정렬 파이프라인) |
| B2 | `documents-routes.js` | 2169 | `doc.metadata?.mimetype` → `doc.meta?.mime` (통계 집계) |
| T-S1 | `backend/api/aims_api/__tests__/regression-2026-03-28-ssot-sort.test.js` (신규) | — | docType 정렬: null 문서 맨 뒤 |
| T-S2 | 동일 | — | docType 정렬: AR/CRS 정규화 참여 |
| T-S3 | 동일 | — | SSoT 단일 소스: meta.document_type 무시 확인 |
| T-S4 | 동일 | — | badgeType 정렬: BIN MIME 분류 동작 확인 |

### Phase 6: 실데이터 정렬 검증 (최종 PASS 판정)

> Phase 5 완료 후 실행. 코드 리뷰만으로는 PASS가 아니다.

모든 칼럼에 대해 실제 API를 호출하여 정렬 정확성을 증명한다.

| # | 칼럼 | 검증 내용 |
|---|------|----------|
| V1 | 유형 (AR/CRS) | `badgeType_asc/desc` 정렬 후 BIN/TXT/OCR 순서 확인. **특히 `application/zip` 등 BIN MIME 문서가 BIN으로 분류되는지 확인** (Phase 5 B1 수정 효과 증명) |
| V2 | 파일명 | `filename_asc/desc` 정렬 확인. `filenameMode='display'`일 때 displayName 기준, `'original'`일 때 upload.originalName 기준 — **두 모드 각각 검증** |
| V3 | 문서유형 | `docType_asc/desc` 정렬 후 한글 라벨 가나다순 확인 + null 맨 뒤 |
| V4 | 크기 | `fileSize_asc/desc` 정렬 후 숫자 크기순 확인 |
| V5 | 타입(확장자) | `fileType_asc/desc` 정렬 후 확장자 알파벳순 확인 |
| V6 | 업로드 날짜 | `uploadDate_asc/desc` 정렬 후 시간순 확인 |
| V7 | 상태 | `status_asc/desc` 정렬 후 상태값 순서 확인 |
| V8 | 연결된 고객 | `customer_asc/desc` 정렬 후 고객명 가나다순 확인 + 미연결 맨 뒤 |

**검증 방법:** Playwright 또는 직접 API 호출로 실제 데이터를 받아, 인접한 두 행이 정렬 기준을 위반하지 않는지 자동 검증.
**결과 기록:** Section 9 테이블의 "실데이터 검증" 칼럼을 "✅ 통과" 또는 "❌ 실패 (사유)"로 업데이트.

---

## 9. 결론

### 목표 달성 현황

**목표: 전체 문서 보기에서 어떤 칼럼을 클릭하든 정확하게 정렬이 동작하게 한다.**

> 설계 경위: 초기에는 문서유형(`document_type`) 칼럼만 SSoT로 다루려 했으나,
> 이는 "모든 칼럼의 정렬 정확성"이라는 목표에 부합하지 않아 **8개 칼럼 전수 진단**으로 확장했다.

### 칼럼별 완료 기준 충족 여부

> 기준: 정렬 파이프라인이 참조하는 값 = 화면에 표시되는 값 (동일 소스)

| 칼럼 | 정렬 소스 = 표시 소스 | 상태 | 실데이터 검증 |
|------|:-------------------:|------|:------------:|
| 유형 (AR/CRS 뱃지) | ✅ | SSoT 확립됨 (수정 불필요) | 미실시 |
| 파일명 | ⚠️ | API A(레거시) 한정 불일치 — API B(주력)는 정상. API A는 `upload.originalName`만 정렬 참조하나 표시는 `displayName` 우선. 실질 영향은 API B 사용 시 없음 | 미실시 |
| **문서유형** | ✅ | **Phase 1~3에서 SSoT 확립 완료** | 미실시 |
| 크기 | ✅ | SSoT 확립됨 (수정 불필요) | 미실시 |
| **타입(badgeType)** | ❌ | **`$metadata.mimetype` 경로 오류 (2곳) — Phase 5에서 수정 예정** | 미실시 |
| 타입(확장자) | ⚠️ | 경미한 불일치 가능 (극히 드묾, 보류) | 미실시 |
| 업로드 날짜 | ✅ | SSoT 확립됨 (수정 불필요) | 미실시 |
| 상태 | ✅ | SSoT 확립됨 (수정 불필요) | 미실시 |
| 연결된 고객 | ✅ | SSoT 확립됨 (수정 불필요) | 미실시 |

> **최종 PASS 조건:** 코드 수정 완료 후, 위 9개 칼럼 전체에 대해 실제 API 호출로 정렬 정확성을 검증하고 "미실시" → "✅ 통과"로 업데이트해야 한다.

### 작업 진행 현황

**완료:**

- Phase 1: `meta.document_type` 쓰기 삭제 → top-level 교체 (7곳) + 연동 테스트 (4곳) ✅
- Phase 2: 기존 749건 데이터 마이그레이션 ✅
- Phase 3: fallback/읽기 경로 정리 (18곳) + 테스트 (1곳) ✅

**미착수:**

- Phase 4: DB `$unset`으로 `meta.document_type` 관련 필드 제거 (안정화 후)
- Phase 5: badgeType MIME 경로 수정 (`$metadata.mimetype` → `$meta.mime`, 2곳) + 정렬 regression 테스트 4건 (같은 커밋)
- Phase 6: 실데이터 정렬 검증 — 8개 칼럼 × 2방향(asc/desc) 전수 검증

**보류 (사용자 영향 없음):**

- 파일명 `meta.filename` 중복 (무해)
- 파일명 API A 레거시 정렬 불일치 (API B 주력 사용으로 실질 영향 없음)
- 타입 확장자 정렬 소스 차이 (무해, 극히 드문 경우만 불일치)

### 목표 달성 시점

Phase 5 완료 → Phase 6(실데이터 검증) 통과 시 **최종 PASS.**
코드 수정만으로는 완료가 아니며, 실제 데이터로 모든 칼럼 정렬 정확성이 증명되어야 한다.
