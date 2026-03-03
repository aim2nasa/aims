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

### 3-5. 커밋

- **커밋**: `a7a10e4b` — `perf: Phase 1 — Status API 응답 경량화 (full_text 제외, -87%)`
- **배포**: 13/13 단계 완료

---

## 4. Phase 2 실행 — Customers API 서버사이드 전환

### 4-1. Before 측정 (서버 로컬)

| limit | 응답 크기 | 서버 응답 시간 |
|-------|----------|--------------|
| 15 | 7,900 B | 0.011s |
| 100 | 52,185 B | 0.020s |
| **10000** | **2,650,727 B (2.65 MB)** | **0.251s** |

### 4-2. 구현 변경 내역

**백엔드** (`customers-routes.js`):
- `sort` 파라미터 추가 (18개 정렬 기준: name/birth/gender/phone/email/address/type/status/created × asc/desc)
- `initial` 파라미터 추가 (한글 초성 ㄱ-ㅎ + 영문 A-Z + 숫자 0-9 필터)
- `stats` 통계 응답 추가 (activePersonal/activeCorporate/inactivePersonal/inactiveCorporate)
- `Promise.all` 병렬 쿼리 (customers + totalCount + stats)

**프론트엔드**:
- `AllCustomersView.tsx`: 클라이언트 필터/정렬/페이지네이션 체인 제거 → 서버사이드 위임
- `CustomerSelectorModal.tsx`: `limit=10000` → `limit=100` + 서버사이드 검색/초성필터
- `CustomerDocument.ts`: `refresh()` 기본 limit 10000 → 100

### 4-3. After 측정 (서버 로컬)

| 파라미터 | 응답 크기 | 서버 응답 시간 |
|---------|----------|--------------|
| limit=15 (기본 페이지) | **7,900 B** | **0.011s** |
| limit=15 + sort=name_asc | 7,800 B | 0.013s |
| limit=15 + initial=ㄱ | 7,200 B | 0.012s |
| limit=15 + search=김보성 | 1,200 B | 0.008s |

**개선율**: limit=10000 (2.65MB) → limit=15 (7.9KB) = **-99.7%**

### 4-4. 검증

- `npm run build`: ✅ 성공
- `npm run test`: ✅ 4,389 tests passed
- API 기능 (sort/initial/search/stats): ✅ 모두 정상
- 정렬: MongoDB `.sort().skip().limit()` — 전체 데이터 정렬 후 페이지네이션 적용 확인

### 4-5. 커밋

- **커밋**: `b889c3b8` — `perf: Phase 2 — Customers API 서버사이드 전환 (limit=10000 제거, -99.7%)`
- **배포**: 13/13 단계 완료, v0.1.41

---

## 5. Phase 3 실행 — 비활성 뷰 API 호출 제거 (visible 가드)

### 5-1. 문제 발견

Phase 2 배포 후 S PC 실측에서 **모든 페이지에서 동일한 heavy API 호출 발생** 확인:

| 불필요 API | 소스 컴포넌트 | 크기 |
|-----------|-------------|------|
| `customers?limit=10000` | CustomerRegionalView | ~2.7 MB |
| `customers?limit=10000` | CustomerRelationshipView | ~2.7 MB |
| `customers?limit=1000` | CustomerManagementView | ~0.9 MB |
| `customers?limit=1000` | QuickActionsView | ~0.9 MB |
| `status?limit=10000` | DocumentManagementView | ~4.2 MB |
| `relationships` | CustomerRelationshipView, CustomerManagementView | ~0.8 MB |
| `contracts?limit=1000` | ContractManagementView | ~0.3 MB |
| **합계** | | **~10.3 MB** |

### 5-2. 근본 원인

`App.tsx`가 **모든 뷰를 동시에 마운트**하고 `visible` prop으로 CSS 숨김만 적용:

```tsx
// App.tsx 라인 1676-1797 — 모든 뷰가 항상 마운트
<CustomerRegionalView visible={activeDocumentView === 'customers-regional'} />
<CustomerRelationshipView visible={activeDocumentView === 'customers-relationship'} />
<QuickActionsView visible={activeDocumentView === 'quick-actions'} />
// ... 24개 뷰 모두 동시 마운트
```

→ 비활성 뷰도 마운트 시 `useQuery`/`useEffect`에서 API 호출 → 매 페이지 로드 시 ~10.3MB 낭비

### 5-3. 수정 내역 (6개 컴포넌트)

| 컴포넌트 | 수정 | 제거된 낭비 API |
|---------|------|---------------|
| DocumentManagementView | `useQuery` x2에 `enabled: visible` | statistics + status(10000건) |
| CustomerManagementView | `useQuery` x2에 `enabled: visible` | customers(1000) + relationships |
| ContractManagementView | `useQuery` x1에 `enabled: visible` | contracts(1000) |
| QuickActionsView | `useQuery` x3에 `enabled: visible` | customers(1000) + statistics + contracts |
| CustomerRegionalView | `useEffect`에 `if (!visible) return` + deps에 visible 추가 | customers(10000) |
| CustomerRelationshipView | `useEffect`에 `if (!visible) return` + deps에 visible 추가 | customers(10000) + relationships |

### 5-4. S PC 실측 — Before/After 비교

> Before: Phase 2 배포 직후 (비활성 뷰 API 미제어)
> After: Phase 3 배포 후 (visible 가드 적용)

| 페이지 | Before 전송량 | After 전송량 | 전송량 개선 | Before Finish | After Finish | 속도 개선 |
|--------|-------------|------------|-----------|--------------|-------------|----------|
| 전체 고객 보기 | ~10.3 MB | **4.2 MB** | **-59%** | ~30s+ | **14.10s** | **-53%** |
| 지역별 고객 보기 | ~10.3 MB | **8.2 MB** | **-20%** | **72s** | **33.81s** | **-53%** |
| 관계별 고객 보기 | ~10.3 MB | **7.7 MB** | **-25%** | **38.05s** | **24.09s** | **-37%** |
| 전체 문서 보기 | **20.9 MB** | **5.1 MB** | **-76%** | **72s** | **14.55s** | **-80%** |
| 문서 탐색기 | **14.5 MB** | **7.6 MB** | **-48%** | **30.14s** | **18.05s** | **-40%** |
| 상세 문서검색 | **14.5 MB** | **4.2 MB** | **-71%** | **30.14s** | **34.34s** | 유사 |
| 고객 전체보기 | **14.7 MB** | **5.1 MB** | **-65%** | **33.08s** | **13.35s** | **-60%** |

**평균 전송량 -52%, 평균 Finish -46% 개선**

### 5-5. 검증

- `npm run build`: ✅ 성공
- `npm run test`: ✅ 4,389 tests passed (207 test files)

### 5-6. 커밋

- **커밋**: `c36d4b29` — `perf: Phase 3 — 비활성 뷰 API 호출 제거 (visible 가드 추가)`
- **배포**: 13/13 단계 완료

---

## 6. 전체 최적화 종합 (최초 → Phase 3 After)

### 최초 상태 vs Phase 3 After — S PC 실측

| 페이지 | 최초 전송량 | Phase 3 전송량 | 전송량 개선 | 최초 Finish | Phase 3 Finish | 속도 개선 |
|--------|-----------|--------------|-----------|------------|---------------|----------|
| 전체 고객 보기 | ~42 MB+ | **4.2 MB** | **-90%** | ~2 min+ | **14.10s** | **-88%** |
| 지역별 고객 보기 | ~42 MB+ | **8.2 MB** | **-80%** | ~2 min+ | **33.81s** | **-72%** |
| 관계별 고객 보기 | ~42 MB+ | **7.7 MB** | **-82%** | ~2 min+ | **24.09s** | **-80%** |
| 전체 문서 보기 | ~53 MB+ | **5.1 MB** | **-90%** | ~2.5 min+ | **14.55s** | **-90%** |
| 문서 탐색기 | ~46 MB+ | **7.6 MB** | **-83%** | ~2 min+ | **18.05s** | **-85%** |
| 상세 문서검색 | ~46 MB+ | **4.2 MB** | **-91%** | ~2 min+ | **34.34s** | **-71%** |
| 고객 전체보기 | ~46 MB+ | **5.1 MB** | **-89%** | ~2 min+ | **13.35s** | **-89%** |

> 최초 상태: Phase 1 전 Status API 32MB + 비활성 뷰 customers 10000 + relationships 등 모두 합산

### 3 Phase 요약

| Phase | 커밋 | 핵심 변경 | 핵심 효과 |
|-------|------|---------|----------|
| **Phase 1** | `a7a10e4b` | Status API full_text 제거 | 32MB → 4.2MB (**-87%**) |
| **Phase 2** | `b889c3b8` | Customers API 서버사이드 전환 | 2.65MB → 7.9KB (**-99.7%**) |
| **Phase 3** | `c36d4b29` | 비활성 뷰 API 호출 제거 | 매 페이지 ~10.3MB 낭비 제거 (**-52%**) |

### 남은 최적화 기회

| 항목 | 현재 | 가능한 개선 | 우선순위 |
|------|------|-----------|---------|
| 지역별 고객 보기 geocode | 고객별 geocode API 수백 건 | 좌표 캐싱 (DB 저장) | 중 |
| 문서 탐색기 SSE 폴링 | 434 요청/18초 | SSE 연결 최적화, 폴링 간격 조정 | 중 |
| JS 번들 | 4~5 MB (정적) | 추가 코드 스플리팅, 트리 쉐이킹 | 하 |
| 지역/관계 뷰 limit=10000 | 전체 로드 필수 | 점진적 로딩 (가상 스크롤) | 하 |