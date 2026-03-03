# API 성능 최적화 보고서 — limit=10000 제거 + 응답 경량화

> **작성일**: 2026-03-03
> **관련 분석**: `2026-03-02_FRONTEND_PERFORMANCE_LOW_SPEC_ANALYSIS.md`
> **목표**: S(저사양 PC) 체감 속도를 1.2분 → 수초로 개선

---

## 1. 문제 정의

### S 실환경 측정 결과 (2026-03-03)

| API | 응답 크기 | W 시간 | S 시간 |
|-----|----------|--------|--------|
| `status?limit=10000` | 32,778 KB (32MB) | 5.15s | **1.2 min (72s)** |
| `customers?limit=10000` | 수백 KB | 빠름 | 2.91s DOMContentLoaded + 추가 대기 |

### 근본 원인

1. **Status API**: 응답에 `meta.full_text`, `ocr.full_text` (문서 전문 텍스트, 건당 수 MB) 포함
2. **Customers API**: `limit=10000`으로 전체 고객을 한 번에 로드 → 클라이언트 필터/검색/정렬

### 영향

- `DocumentStatusService`가 **모든 페이지 진입 시 글로벌 호출**
- 어떤 페이지를 가든 32MB API 1건이 S를 1분 이상 묶어둠
- CSS 분할, React.memo 등 프론트엔드 최적화 효과가 이 API 때문에 체감 불가

---

## 2. 최적화 계획

### Phase 1: Status API 응답 경량화

**변경 파일**: `backend/api/aims_api/routes/documents-routes.js`

| 항목 | 변경 내용 |
|------|----------|
| 응답 매핑 | `meta`, `ocr`, `upload` 전체 객체 → 필요 필드만 선택, full_text 제외 |
| MongoDB 쿼리 | find → aggregation, `$project`로 full_text DB 레벨 제외 |
| badgeType | `doc.meta?.full_text` 직접 체크 → `_hasMetaText` boolean 사용 |
| console.log | 매 요청마다 실행되는 디버그 로그 제거 |

### Phase 2: Customers API 서버사이드 전환

**변경 파일**: `customers-routes.js`, `AllCustomersView.tsx`, `CustomerSelectorModal.tsx`, `CustomerDocument.ts`

| 항목 | 변경 내용 |
|------|----------|
| 백엔드 | `sort`, `initial`(초성) 파라미터 추가, 통계 API 추가 |
| 프론트엔드 | 클라이언트 필터/정렬/페이지네이션 → 서버사이드 위임 |
| limit | 10000 → 페이지당 15~100 |

---

## 3. Phase 1 실행

### 3-1. Before 측정

> 구현 전 현재 상태 측정 (서버 로컬 `localhost:3010`, 네트워크 변수 제거)
> 유저: `aim2nasa@gmail.com` (695cfe26..., 문서 2,080건 보유)

**API 응답 크기/시간:**

| limit | 응답 크기 | 서버 응답 시간 |
|-------|----------|--------------|
| 15 | 89 KB | 0.045s |
| 100 | 1,193 KB (1.19 MB) | 0.123s |
| 500 | 7,067 KB (7.07 MB) | 0.338s |
| **10000** | **32,741 KB (32.74 MB)** | **1.129s** |

**full_text 크기 분석 (limit=10000, 2,080건):**

| 필드 | 크기 | 보유 문서 수 | 전체 대비 비율 |
|------|------|------------|--------------|
| `meta.full_text` | 44.16 MB | 2,007건 | **81.5%** |
| `ocr.full_text` | 1.32 MB | 92건 | 2.4% |
| `meta.summary` | 1.38 MB | - | 2.5% |
| 기타 필드 | ~7.3 MB | - | 13.6% |
| **합계** | **~54 MB** (JSON) | | 100% |

> `full_text`가 전체 응답의 **87.9%**를 차지.
> 이를 제거하면 32MB → 약 3~4MB로 감소 예상 (-90%).

### 3-2. 구현 변경 내역

**백엔드** (`backend/api/aims_api/routes/documents-routes.js`):

1. **MongoDB aggregation `$addFields` + `$project`**: 모든 쿼리 파이프라인(7개) 끝에 추가
   - `_hasMetaText`: meta.full_text 존재 여부 boolean
   - `_hasOcrText`: ocr.full_text 존재 여부 boolean
   - `$project: { 'meta.full_text': 0, 'ocr.full_text': 0 }` — DB 레벨 제거
2. **일반 find 쿼리 → aggregation 변환**: status/filename 정렬도 aggregation 통일
3. **badgeType 계산**: `doc.meta?.full_text` → `doc._hasMetaText` 플래그 사용
4. **응답 매핑**: meta/ocr/upload 전체 객체 → 필요 필드만 선택
   - `meta`: mime, size_bytes, pdf_pages, meta_status, summary, created_at
   - `ocr`: status, confidence, done_at
   - `upload`: originalName, uploaded_at, destPath, convPdfPath, conversion_status
5. **API 응답에 `_hasMetaText`, `_hasOcrText` 불린 추가**: 프론트엔드 호환용
6. **디버그 console.log/console.error 6건 제거**

**프론트엔드** (최소 변경 — 호환 대응):

1. `DocumentStatusService.extractProgress()`: `_hasMetaText` 플래그로 progress 75% 판정 유지
2. `DocumentStatusService.analyzeProcessingPath()`: `_hasMetaText` 플래그로 `meta_fulltext` 경로 판정 유지
3. `DocumentProcessingModule.extractSummary()`: `_hasMetaText` 플래그로 meta summary 경로 선택 유지
4. `DocumentProcessingModule.getProcessingStatus()`: `_hasMetaText`/`_hasOcrText` 플래그로 상태 판정 유지

### 3-3. After 측정

> 동일 조건 (서버 로컬, 동일 유저, 동일 limit)

**API 응답 크기/시간:**

| limit | Before 크기 | After 크기 | 감소율 | Before 시간 | After 시간 | 시간 감소 |
|-------|------------|-----------|--------|------------|-----------|----------|
| 15 | 89 KB | **27 KB** | **-70%** | 0.045s | 0.075s | - |
| 100 | 1,193 KB | **190 KB** | **-84%** | 0.123s | 0.098s | -20% |
| 500 | 7,067 KB | **1,056 KB** | **-85%** | 0.338s | 0.174s | -49% |
| **10000** | **32,741 KB** | **4,415 KB** | **-87%** | 1.129s | 0.432s | **-62%** |

**데이터 정합성 검증:**

| 항목 | Before | After | 일치 |
|------|--------|-------|------|
| 문서 수 | 2,080 | 2,080 | ✅ |
| TXT badge | 2,007 | 2,007 | ✅ |
| OCR badge | 71 | 71 | ✅ |
| BIN badge | 2 | 2 | ✅ |
| `_hasMetaText=true` | - | 2,007 | ✅ (Before의 meta.full_text 보유 수와 일치) |
| `_hasOcrText=true` | - | 92 | ✅ (Before의 ocr.full_text 보유 수와 일치) |
| full_text in response | 2,007+92 | **0** | ✅ (완전 제거) |

### 3-4. 빌드/테스트 검증

- `npm run build`: ✅ 성공
- `npm run test`: ✅ 4,389 tests passed (207 test files)