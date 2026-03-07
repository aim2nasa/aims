# 태그(Tag) 기능 제거 작업 보고서

**작업일**: 2026-03-08
**브랜치**: main
**작업자**: Claude (AI Assistant)

---

## 1. 배경 및 목적

AIMS 문서 분류 체계가 `document_type` 기반으로 전환 완료되면서, GPT가 생성하던 태그(tags) 기능이 더 이상 필요하지 않게 되었습니다.

**제거 목적:**
- GPT-4o-mini 태그 추출 프롬프트 제거 → **AI 크레딧 절감**
- 사용되지 않는 dead code 정리 → 코드베이스 간소화
- 불필요한 API 응답 필드 제거 → 네트워크 페이로드 감소

---

## 2. 작업 범위 (3단계)

### Step 1: 프론트엔드 서비스 레이어 dead code 제거
**커밋**: `589ec768`

| 파일 | 변경 내용 |
|------|----------|
| `services/DocumentService.ts` | `DOCUMENT_TAGS` 엔드포인트, `getDocumentTags()`, `mostUsedTags` 통계 제거 |
| `services/customerService.ts` | `CUSTOMER_TAGS` 엔드포인트, `getCustomersByTags()`, `getCustomerTags()`, `totalTags`/`mostUsedTags` 통계 제거 |
| `entities/document/api.ts`, `index.ts` | `getDocumentTags` re-export 제거 |
| `entities/customer/api.ts`, `index.ts` | `getCustomersByTags`, `getCustomerTags` re-export 제거 |
| `services/index.ts` | `getCustomersByTags`, `getCustomerTags` re-export 제거 |
| `services/__tests__/DocumentService.test.ts` | `getDocumentTags` 테스트, `mostUsedTags` assertion 제거 |
| `services/__tests__/customerService.test.ts` | `getCustomersByTags`, `getCustomerTags` 테스트, 통계 관련 mock 제거 |

### Step 2: 백엔드 API 응답에서 tags 필드 제거
**커밋**: `556fdc68`

| 파일 | 변경 내용 |
|------|----------|
| `aims_api/routes/documents-routes.js` | 문서 목록, 문서 상세, 문서 검색 응답에서 `tags: doc.tags \|\| []` 제거 (3곳) |
| `aims_api/routes/customers-routes.js` | 고객 생성 시 초기 객체에서 `tags: []` 제거 |

### Step 3: 문서 파이프라인 태그 추출 기능 제거
**커밋**: `f502c468`

| 파일 | 변경 내용 |
|------|----------|
| `openai_service.py` | GPT 프롬프트에서 tags 포맷 제거, `TAG_NORMALIZATION` 사전 제거, `_normalize_tags()` 제거, `extract_tags()` 제거, 반환값에서 tags 제거 |
| `doc_prep_main.py` | `tags` 변수 및 `"meta.tags"` MongoDB 업데이트 제거 |
| `ocr_worker.py` | `tags` 변수, `"ocr.tags"` 업데이트, 반환값에서 tags 제거 |
| `smart_search.py` | 검색 필드에서 `"ocr.tags"`, `"meta.tags"` 제거 |
| `models/document.py` | `SummaryResponse`, `MetaResponse`, `OCRResponse`에서 `tags` 필드 제거 |
| `doc_summary.py` | 응답에서 `tags` 제거 |
| `tests/test_openai_service.py` | `TestExtractTags` 클래스 전체 제거, 태그 관련 assertion 제거 |
| `tests/test_doc_prep_main.py` | `meta.tags` assertion 제거, mock 데이터에서 tags 제거 (6곳) |

---

## 3. 의도적으로 유지한 코드 (태그 관련 잔존 코드)

아래 코드는 의도적으로 유지되었으며, 제거 대상이 아닙니다.

### 3-1. `DocumentSchema.tags` / `CustomerSchema.tags` (Zod 스키마)

백엔드 MongoDB에 기존 문서/고객 데이터의 `tags` 필드가 이미 저장되어 있습니다. Zod 스키마에서 해당 필드를 제거하면 DB 조회 시 파싱 에러가 발생할 수 있으므로, `.default([])` 처리와 함께 스키마 호환성을 위해 유지합니다.

### 3-2. `DocumentService.ts`의 `tags: []` 수동 조립 (4곳)

`DocumentService.ts`에서 API 응답을 수동으로 Document 객체로 조립하는 4곳에서 `tags: []`를 명시합니다. TypeScript의 `Document` 타입이 `tags` 필드를 필수로 요구하기 때문에, 이를 제거하면 타입 에러가 발생합니다.

### 3-3. AR/CRS `$addToSet: {"tags": "AR/CRS"}` (시스템 분류 마커)

`doc_prep_main.py`에서 AR/CRS 문서 감지 시 `$addToSet: {"tags": "AR/CRS"}`로 태그를 추가합니다. 이것은 GPT가 생성하는 키워드 태그가 아닌 **시스템 분류 마커**로, 문서 파이프라인 내부에서 AR/CRS 처리 상태를 추적하는 데 사용됩니다. 태그 추출 기능과 무관하므로 유지합니다.

### 3-4. `classifyDocument(tags, summary, filename)` 함수 시그니처

문서 분류 함수가 첫 번째 인자로 `tags`를 받습니다. 기존에 업로드된 문서는 `meta.tags`에 GPT가 생성한 태그가 저장되어 있어 이를 분류 힌트로 활용합니다. 새로 업로드되는 문서는 빈 배열(`[]`)이 전달되며, 이 경우 `summary`와 `filename` 기반으로 정상 분류됩니다.

### 3-5. 테스트 mock 데이터의 `tags: []` (~30곳)

프론트엔드 테스트 파일 전반에 걸쳐 mock 문서/고객 객체에 `tags: []`가 포함되어 있습니다. `Document`/`Customer` 타입의 필수 필드이므로, 제거 시 타입 에러가 발생합니다. 스키마에서 `tags` 필드가 완전히 제거될 때 일괄 정리할 수 있습니다.

---

## 4. 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| 프론트엔드 빌드 (`npm run build`) | 성공 (exit code 0) |
| 프론트엔드 테스트 (`vitest`) | **4,407 passed**, 8 skipped |
| 백엔드 테스트 (`pytest`) | **73 passed** |
| Gini 품질 검수 | 3회 실행, 모두 **PASS** |

---

## 5. 커밋 이력 (최신순)

```
f502c468 refactor: 문서 파이프라인에서 태그 추출 기능 제거 (AI 크레딧 절감)
556fdc68 refactor: 백엔드 API 응답에서 tags 필드 제거
589ec768 refactor: 서비스 레이어에서 태그 관련 dead code 제거
47065255 fix: 테스트 mock에 누락된 훅 함수 3개 추가
ee31a0d7 refactor: 고객별 문서함에서 태그 기반 분류 기능 전체 제거
```

---

## 6. 효과 요약

- **삭제된 코드**: ~1,100줄
- **AI 크레딧 절감**: 문서당 GPT 태그 추출 프롬프트 1회 제거
- **API 페이로드 감소**: 문서 목록/상세/검색 응답에서 tags 배열 제거
- **코드 복잡도 감소**: TAG_NORMALIZATION 사전(보험사 매핑), normalize/extract 로직 제거
- **향후 유지보수 부담 감소**: 태그 관련 엔드포인트 5개, 서비스 메서드 4개 제거
