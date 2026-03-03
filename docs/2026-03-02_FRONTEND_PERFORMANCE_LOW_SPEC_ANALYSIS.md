# 프론트엔드 저사양 PC 성능 이슈 — 심층 분석 보고서

> **작성일**: 2026-03-02
> **발견 환경**: 송유미 데스크탑 (DESKTOP-DSRK1TG, 이하 "S")
> **영향 범위**: 저사양 클라이언트 전반 (문서 탐색기 > 전체문서보기)
> **분석 방법**: 3개 독립 분석 (직접 탐색 + Alex 아키텍트 + Gini 품질 검증)

---

## 1. 이슈 요약

aims.giize.com에 S에서 접속했을 때, **전체문서보기** 및 **문서 탐색기** 화면이 개발 PC(wondercastle) 대비 현저히 느린 현상이 확인됨.

서버 부하는 정상(CPU 3%, 요청/초 0.3, 에러율 0%)이므로 **클라이언트 사이드 렌더링 성능 문제**로 판단.

---

## 2. S(송유미 PC) 하드웨어 사양

| 항목 | 사양 | 비고 |
|------|------|------|
| CPU | Intel Core i5-4590T @ 2.00GHz | 2014년, 저전력 35W (T 모델) |
| RAM | 8GB DDR3 | 현재 기준 부족 |
| GPU | Intel HD Graphics 4600 (113MB) | 10년 전 내장 그래픽 |
| 저장소 | 466GB HDD + 119GB SSD | OS가 HDD에 있을 가능성 |
| OS | Windows 64비트 | |

**핵심**: JS 파싱 속도가 최신 PC 대비 3~5배 느리고, DDR3 메모리 대역폭도 병목.

---

## 3. 번들 & 빌드 현황

| 파일 | 크기 | 설명 |
|------|------|------|
| `index-BDNhoZw6.js` | 586 KB | 메인 번들 (React + vendors + 앱 코드 혼합) |
| `pdf.worker.min.mjs` | 1,011 KB | PDF.js 워커 |
| `ProductSearchModal-*.js` | 426 KB | 상품 검색 모달 |
| `pdf-*.js` | 343 KB | PDF 유틸리티 |
| CSS (단일 파일) | 1,343 KB | 223개 CSS 파일 합본 (75,589줄) |
| **총 dist** | **6.2 MB** | gzip 전 기준, 74개 JS 청크 |

### 빌드 설정 이슈 (`vite.config.ts`)

- `cssCodeSplit: false` — **1.3MB CSS 단일 파일** (render-blocking)
- `manualChunks` 미설정 — vendor 코드와 앱 코드 미분리
- `chunkSizeWarningLimit: 1000` — 경고 기준 의도적으로 높임

### 현재 적용된 최적화

- React.lazy + Suspense (26개 뷰 컴포넌트 지연 로드)
- 74개 JS 청크 (코드 스플릿)
- useMemo / useCallback 부분 적용
- 서버사이드 검색/필터링
- DocumentLibraryView 페이지네이션

---

## 4. S에서의 예상 성능 영향

| 시나리오 | 예상 소요시간 | 원인 |
|----------|-------------|------|
| 초기 페이지 로드 | 2~4초 | 586KB 메인번들 + 1.3MB CSS 파싱 |
| 문서 탐색기 진입 | 5~10초+ | 10,000개 문서 API + DOM 렌더링 |
| 문서 탐색기 트리 펼침 | 프리징 | 수백 개 DOM 노드 즉시 생성 |
| 전체문서보기 (15개) | 1~2초 | 페이지네이션 덕분에 양호 |
| 전체문서보기 (100개) | 3~5초 | DOM 100개 + 연관 UI |
| PDF 뷰어 | 3~5초 | 1MB 워커 로드 |

---

## 5. 심층 분석: Critical 이슈 (5건)

> 3개 분석에서 교차 확인된 핵심 병목. 모두 수정 필요.

### C1. 문서 탐색기 10,000개 전체 로드 + 가상화 없음

**파일**: `DocumentExplorerView.tsx:226`

```tsx
<DocumentStatusProvider initialItemsPerPage={10000}>
```

- 10,000개 문서를 한 번에 API 요청 → 클라이언트 메모리 적재 (15~25MB)
- 가상화 라이브러리 없음 (`react-virtual`, `react-window` 등 미설치)
- 트리 전체를 recursive `renderNode()`로 DOM 생성
- 문서당 6개 DOM 노드 × 10,000개 = **60,000+ DOM 노드**
- 보이는 항목: ~20~50개 → **렌더 낭비 200배**

### C2. `flushSync`로 마우스 이동마다 동기 강제 렌더링

**파일**: `DocumentExplorerTree.tsx:245, 266`

```tsx
// mouseEnter마다 동기 강제 렌더링
flushSync(() => { forceHoverUpdate() })

// mouseMove에서도 hover 누락 시 동일 패턴
if (needsFlush) { flushSync(() => { forceHoverUpdate() }) }
```

- `flushSync`는 React의 batching을 무력화 → 즉각 동기 DOM 업데이트
- 마우스 이동 = 초당 50~60 이벤트 → 동기 렌더 50회/초
- 저사양 CPU에서 메인 스레드 블로킹 → UI 프리징

### C3. 트리 노드 함수가 React.memo 없는 일반 함수

**파일**: `DocumentExplorerTree.tsx:291, 376, 445`

```tsx
// 컴포넌트 내부 일반 함수 — 매 렌더마다 전체 트리 재순회
const renderGroupNode = (node, level) => { ... }
const renderDocumentNode = (node, level) => { ... }
const renderNode = (node, level) => { ... }
```

- React 컴포넌트가 아닌 일반 함수 → `React.memo` 적용 불가
- 부모 리렌더 시 전체 트리 JSX 재생성 (변경 없는 노드 포함)

### C4. DocumentStatusList 전체 행 재렌더 + IIFE 패턴

**파일**: `DocumentStatusList.tsx:678~, 1211`

```tsx
// React.memo 없이 전체 documents.map 매번 재생성
{documents.map((document, index) => {
  {(() => { /* PDF 배지 계산 */ })()}   // IIFE 1
  {(() => { /* 바이러스 배지 */ })()}    // IIFE 2
  {(() => { /* 파일명 표시 */ })()}      // IIFE 3
})}
```

- 행 단위 `React.memo` 컴포넌트 없음 → 어떤 상태 변경이든 **전체 행 재렌더**
- 행마다 IIFE 3~5개 실행 → 매 렌더마다 재실행
- `extractFilename()` 같은 함수가 한 행에서 3회 이상 중복 호출

### C5. App.tsx God Component (2,687줄)

**파일**: `App.tsx`

| 항목 | 수량 |
|------|------|
| 코드 줄 수 | 2,687 |
| `useState` | 26개 |
| `useEffect` | 19개 |
| `useMemo`/`useCallback` | 32개 |

- 어떤 state든 하나 변경 → App 전체 리렌더 → 모든 자식 연쇄 리렌더
- SSE 이벤트(document-progress) 수신 시 연쇄 반응
- `useLayoutStore` (Zustand)가 존재하지만 App.tsx에서 미사용 (중복 관리)

---

## 6. 심층 분석: Major 이슈 (8건)

### M1. `fetchCustomerTypesInBackground` N+1 API 호출

**파일**: `DocumentStatusProvider.tsx:250-265`

```tsx
// customer_type 없는 고객마다 개별 API 호출
await Promise.all(
  Array.from(customerIdsToFetch).map(customerId =>
    fetch(`/api/customers/${customerId}`)
  )
)
```

50명 → 동시 50개 HTTP 요청. 저사양 PC에서 네트워크 포화 + CPU 급증.

### M2. CSS 1.3MB render-blocking 단일 파일

**파일**: `vite.config.ts:124` — `cssCodeSplit: false`

- 223개 CSS 파일(75,589줄)이 하나로 합쳐짐
- 어떤 뷰를 보든 전체 CSS 파싱 필요 (실제 사용: 10~25%)
- S에서 파싱에만 200~500ms

### M3. `hasProcessingDocuments` — `useMemo` 미적용

**파일**: `DocumentStatusProvider.tsx:461-465`

```tsx
// 매 렌더마다 전체 documents 배열 순회 (useMemo 없음)
const hasProcessingDocuments = documents.some(doc => { ... })
```

### M4. SSE 이벤트마다 API 이중 호출

**파일**: `useDocumentStatusListSSE.ts:68-73, 93-96`

- `document-list-change` → 즉시 상태 업데이트 + 300ms 후 API 재호출
- `document-progress` → 추가 3000ms 후 또 재호출
- SSE 재연결 시 즉시 `fetchDocuments` 호출
- 재연결 빈번 시 API 호출 폭탄

### M5. DocumentStatusProvider 이중 마운트

**파일**: `DocumentLibraryView.tsx:986, 1027`

```tsx
// 메인 Provider
<DocumentStatusProvider ...>
  <DocumentLibraryContent />
</DocumentStatusProvider>

// 모달용 Provider (열릴 때마다 추가 생성)
{isDocumentLinkModalVisible && (
  <DocumentStatusProvider ...>  <!-- 두 번째 인스턴스! -->
    <DocumentLinkModalWrapper />
  </DocumentStatusProvider>
)}
```

모달 열릴 때마다 별도 API 호출 + SSE 연결 생성.

### M6. 초기 로드 시 API 8~10개 + SSE 3개 동시

- API: users, currentUser, customers, documents/status, health, statistics, 알림 등
- SSE: `documents:status-list`, `inquiry:notifications`, `user-account`
- HTTP/1.1 동시 연결 6개 제한에 SSE 3개 상시 점유 → 나머지 API 큐잉

### M7. `applyQuickFilter` 내 문서마다 `new Date()` 반복 생성

**파일**: `useDocumentExplorerTree.ts:188-191`

필터 호출마다 문서 수만큼 `new Date()` 객체 생성.

### M8. Context state cascade 리렌더

**파일**: `DocumentStatusProvider.tsx:661-700`

```tsx
const state = useMemo(() => ({
  documents, filteredDocuments, selectedDocument, isLoading, /* ...15개 필드 */
}), [documents, filteredDocuments, /* ...15개 의존성 */])
```

ANY 의존성 변경 → state 객체 재생성 → 모든 소비자 리렌더 (선택적 구독 불가).

---

## 7. 심층 분석: Minor 이슈 (4건)

| # | 이슈 | 파일:라인 |
|---|------|----------|
| m1 | `formatDateTime`, `getDocName` 함수 `useCallback` 없이 매 렌더마다 재생성 | DocumentExplorerTree.tsx:347, 360 |
| m2 | Production console.log 3개 (DEV 가드 없음) — 정렬 클릭마다 실행 | DocumentStatusProvider.tsx:580-588 |
| m3 | CSS `filter: saturate() contrast()` 폴더 아이콘 500개 — GPU 재합성 유발 | DocumentExplorerTree CSS |
| m4 | 성능 측정 수단 전무 (React Profiler, performance.mark 미사용) | 프로젝트 전반 |

---

## 8. Alex 아키텍트 분석 요약

| 분석 영역 | 핵심 발견 | 영향 |
|-----------|----------|------|
| **CSS 번들** | 1.3MB 단일 파일, render-blocking | FCP(First Contentful Paint) 200~500ms 지연 |
| **App.tsx** | 2,687줄 God Component, useState 26개 | 모든 상태 변경이 전체 앱 리렌더 유발 |
| **메인 번들** | 586KB, vendor 미분리 | S에서 파싱 500~1000ms |
| **초기 API** | 8~10개 API + SSE 3개 동시 | HTTP/1.1 병목, 초기 로드 지연 |
| **CSS 효과** | animation/transition 1,100회, box-shadow/filter 570회 | 저사양 GPU 프레임 드랍 |

> **Alex 결론**: P0(CSS 코드스플릿)과 P1(App.tsx 분해)만 수행해도 **체감 60~70% 개선** 예상.

---

## 9. Gini 품질 검증 결과

```
GINI QUALITY GATE: FAIL (성능)
```

| # | 심각도 | 이슈 | 파일:라인 |
|---|--------|------|----------|
| 1 | Critical | 트리 노드 일반 함수 → 매 렌더 전체 재순회, React.memo 불가 | DocumentExplorerTree.tsx:291,376 |
| 2 | Critical | flushSync 마우스마다 동기 강제 렌더 → 메인스레드 블로킹 | DocumentExplorerTree.tsx:245,266 |
| 3 | Critical | 정렬 console.log 3개 DEV 가드 없음 | DocumentStatusProvider.tsx:580-588 |
| 4 | Critical | initialItemsPerPage=10000 전체 메모리 적재 | DocumentExplorerView.tsx:226 |
| 5 | Critical | DocumentStatusList React.memo 없음 + IIFE 3~5개/행 | DocumentStatusList.tsx:678~ |
| 6 | Major | hasProcessingDocuments useMemo 미적용 | DocumentStatusProvider.tsx:461 |
| 7 | Major | applyQuickFilter 문서마다 new Date() | useDocumentExplorerTree.ts:188 |
| 8 | Major | SSE 이벤트마다 API 이중 호출 | useDocumentStatusListSSE.ts:68,93 |
| 9 | Major | DocumentStatusProvider 이중 마운트 (모달) | DocumentLibraryView.tsx:986,1027 |
| 10 | Major | fetchCustomerTypes N+1 HTTP 요청 | DocumentStatusProvider.tsx:250 |
| 11 | Major | extractFilename 한 행 3회 중복 호출 | DocumentStatusList.tsx:784,786,838 |

---

## 10. 개선 방안 (우선순위순)

### P0 — 즉시 수정 (코드 변경 최소, 효과 즉시)

| # | 조치 | 난이도 | 예상 효과 |
|---|------|--------|-----------|
| 1 | `cssCodeSplit: false` → `true` (vite.config.ts 1줄) | 극소 | FCP -40~60% |
| 2 | `initialItemsPerPage` 10000 → 500 축소 | 극소 | 탐색기 로드 -80% |
| 3 | `flushSync` 제거 → `requestAnimationFrame` throttle | 소 | hover 시 프리징 해소 |
| 4 | production console.log 제거 (DEV 가드 추가) | 극소 | 정렬 시 불필요 비용 제거 |
| 5 | `hasProcessingDocuments`를 `useMemo`로 래핑 | 극소 | 매 렌더 배열 순회 제거 |

### P1 — 구조 개선 (중간 작업량, 체감 효과 큼)

| # | 조치 | 난이도 | 예상 효과 |
|---|------|--------|-----------|
| 6 | `manualChunks`로 vendor 번들 분리 | 소 | 메인 번들 -60%, 캐시 효율 |
| 7 | DocumentStatusList 행을 `React.memo` 컴포넌트로 분리 | 중 | 리스트 리렌더 -90% |
| 8 | renderGroupNode/renderDocumentNode → 독립 컴포넌트 + React.memo | 중 | 트리 리렌더 -90% |
| 9 | fetchCustomerTypes 배치 API (`/api/customers/batch`) | 중 (BE) | N+1 → 1개 요청 |

### P2 — 아키텍처 개선 (대규모, 근본 해결)

| # | 조치 | 난이도 | 예상 효과 |
|---|------|--------|-----------|
| 10 | App.tsx useState 26개 → useLayoutStore(Zustand) 이관 | 대 | 앱 전체 리렌더 해소 |
| 11 | `@tanstack/react-virtual` 도입 (트리 + 리스트) | 중~대 | DOM 노드 60,000 → ~100 |
| 12 | DocumentStatusProvider Context 분할 (data/actions/ui) | 대 | cascade 리렌더 해소 |

### P3 — 추가 최적화

| # | 조치 | 난이도 | 예상 효과 |
|---|------|--------|-----------|
| 13 | 초기 API 통합 엔드포인트 (`/api/init`) | 중 (BE) | 초기 API 8~10 → 1~2 |
| 14 | SSE 이중 호출 제거 (debounce 통합) | 소 | 불필요 API 호출 제거 |
| 15 | DocumentStatusProvider 이중 마운트 제거 | 소 | 모달 시 중복 API/SSE 제거 |

---

## 11. 결론

> **S가 느린 건 맞지만, "S에서만 느린 게 아니라 S에서 드러난 것"이다.**

3개 독립 분석의 공통 결론:

1. **문서 탐색기의 10,000개 전체 로드 + 가상화 없음**이 가장 심각한 병목
2. **flushSync, React.memo 부재, Context cascade**가 복합적으로 작용
3. **CSS 1.3MB render-blocking + 586KB 메인 번들**이 초기 로드 지연
4. **App.tsx God Component**가 모든 상태 변경을 전체 앱 리렌더로 증폭

P0 항목 5개만 수정해도 S에서 체감 성능이 **50~70% 개선**될 것으로 예상.
P1~P2까지 진행하면 wondercastle과 유사한 수준에 근접 가능.

---

## 12. 종합 의견 (3개 분석 교차 검증)

### 분석 관점별 핵심 진단

**직접 탐색 (렌더링 경로 추적)**
> 문서 탐색기가 DOM 60,000+개를 한 번에 그리면서 가상화가 전혀 없다. 보이는 건 50개인데 10,000개를 렌더한다 — **낭비 200배**. 이게 S에서 프리징의 직접 원인이다.

**Alex (아키텍트 관점)**
> 렌더링 문제 이전에 **초기 로드 자체가 느리다**. CSS 1.3MB가 render-blocking이고, 메인 번들 586KB에 vendor가 섞여 있어 캐시도 안 된다. App.tsx가 2,687줄짜리 God Component라서 SSE 이벤트 하나에 전체 앱이 리렌더된다.

**Gini (품질 검증 관점)**
> 코드 레벨에서 성능 안티패턴이 **Critical 5건, Major 8건** 발견됐다. `flushSync`로 마우스 이동마다 동기 렌더를 강제하고, 리스트 행에 React.memo가 없고, 한 행에서 같은 함수를 3번 중복 호출한다.

### 3개 분석 공통 지적 (교차 확인 완료)

| 순위 | 문제 | 위치 | 왜 문제인가 |
|------|------|------|------------|
| **1** | 문서 탐색기 10,000개 전체 로드 | `DocumentExplorerView.tsx:226` | DOM 60,000+개 생성, 메모리 15~25MB, S에서 5~10초+ |
| **2** | `flushSync` 마우스마다 동기 렌더 | `DocumentExplorerTree.tsx:245` | 초당 50회 동기 렌더 → 메인스레드 블로킹 |
| **3** | 트리/리스트에 React.memo 전무 | `DocumentExplorerTree.tsx`, `DocumentStatusList.tsx` | 상태 하나 바뀌면 전체 재렌더 |
| **4** | CSS 1.3MB 단일 파일 | `vite.config.ts:124` | 모든 페이지에서 render-blocking |
| **5** | App.tsx God Component | `App.tsx` (2,687줄, useState 26개) | 모든 상태 변경 → 전체 앱 리렌더 |

### Alex만 추가 지적한 문제

| 문제 | 왜 문제인가 |
|------|------------|
| 메인 번들 586KB에 vendor 혼합 | 앱 코드 변경마다 vendor 캐시도 무효화 |
| 초기 API 8~10개 + SSE 3개 동시 | HTTP/1.1 6개 제한에 SSE 3개 상시 점유 → API 큐잉 |
| CSS animation/transition 1,100회, box-shadow 570회 | S의 HD 4600에서 프레임 드랍 |

### Gini만 추가 지적한 문제

| 문제 | 위치 | 왜 문제인가 |
|------|------|------------|
| `hasProcessingDocuments` useMemo 없음 | `DocumentStatusProvider.tsx:461` | 매 렌더마다 전체 배열 순회 |
| `fetchCustomerTypes` N+1 API 호출 | `DocumentStatusProvider.tsx:250` | 고객 50명 → 동시 50개 HTTP |
| DocumentStatusProvider 이중 마운트 | `DocumentLibraryView.tsx:986,1027` | 모달 열 때 중복 API+SSE |
| SSE 이벤트마다 API 이중 호출 | `useDocumentStatusListSSE.ts:68` | 불필요한 API 호출 폭탄 |
| `extractFilename` 한 행 3회 중복 | `DocumentStatusList.tsx:784,786,838` | 동일 함수 반복 실행 |
| production console.log 3개 | `DocumentStatusProvider.tsx:580-588` | DEV 가드 없이 매번 실행 |

### 최종 판단

**가장 큰 병목 2가지**는 명확하다:
1. **문서 탐색기 10,000개 전체 로드** — 이것만 고쳐도 S에서 탐색기 프리징이 사라짐
2. **CSS 1.3MB render-blocking** — `cssCodeSplit: false` 한 줄 바꾸면 초기 로드 대폭 개선

나머지는 "있으면 좋지만 S 체감에 큰 차이를 만드는가?"를 기준으로 취사선택 가능.
App.tsx God Component는 효과는 크지만 작업량도 커서 별도 판단 필요.

---

## 13. 성능 자동 측정 시스템

> 개선 전/후를 정량적으로 자동 측정하기 위한 벤치마크 시스템.
> Playwright v1.55.1 + CDP(Chrome DevTools Protocol) 기반.

### 13.1. 아키텍처

```
frontend/aims-uix3/tests/performance/
├── perf-helpers.ts         # 측정 유틸리티 (CDP, DOM, 메모리, FPS 등)
├── thresholds.ts           # 임계값 정의 (PASS/WARN/FAIL 기준)
├── perf-benchmark.spec.ts  # 메인 벤치마크 테스트 (5개 시나리오)
└── perf-report.ts          # 결과 JSON+MD 리포트 생성
```

실행: `npx playwright test --project=performance`
결과: `test-results/perf-benchmark.json` + `test-results/perf-benchmark.md`

### 13.2. 자동 측정 항목

**A. 초기 로드 지표 (PerformanceObserver)**

| 지표 | 측정 방법 | 의미 |
|------|----------|------|
| FCP | `paint` 엔트리 | 첫 콘텐츠 표시 |
| LCP | `largest-contentful-paint` 옵저버 | 주요 콘텐츠 완료 |
| TBT | `longtask` 옵저버 (50ms 초과분 합산) | 메인스레드 블로킹 총 시간 |
| CLS | `layout-shift` 옵저버 | 레이아웃 밀림 |
| Navigation Timing | `performance.getEntriesByType('navigation')` | TTFB, DOM 로드 등 |

**B. 런타임 지표 (CDP + page.evaluate)**

| 지표 | 측정 방법 |
|------|----------|
| DOM 노드 수 | `document.querySelectorAll('*').length` |
| JS Heap 사용량 | CDP `Performance.getMetrics` |
| 레이아웃 횟수/시간 | CDP `LayoutCount`, `LayoutDuration` |
| 스크립트 실행 시간 | CDP `ScriptDuration` |
| 이벤트 리스너 수 | CDP `JSEventListeners` |

**C. 인터랙션 지표 (시나리오 기반)**

| 지표 | 측정 방법 |
|------|----------|
| 뷰 전환 시간 | `performance.mark()` → 메뉴 클릭 ~ 뷰 visible |
| 스크롤 FPS | `requestAnimationFrame` 카운팅 |
| 메모리 누수 | 뷰 전환 5회 반복 → heap 증가량 |

### 13.3. 벤치마크 시나리오 5개

1. **초기 페이지 로드** — 로그인 후 메인 UI까지 FCP/LCP/TBT/CLS/DOM/Heap
2. **문서 보관함 전환** — 메뉴 클릭 → 뷰 로드 완료 시간 + DOM 노드 수
3. **전체 고객 뷰 전환** — 메뉴 클릭 → 뷰 로드 완료 시간 + DOM 노드 수
4. **스크롤 FPS** — 리스트/테이블 스크롤 중 프레임 드랍 측정
5. **메모리 누수 감지** — 3개 뷰를 5회 반복 전환 → heap 증가량

### 13.4. 임계값 (초기값 — 첫 실행 후 실측 기반 조정)

| 지표 | WARN | FAIL |
|------|------|------|
| DOM 노드 | 1,500 | 3,000 |
| JS Heap (MB) | 50 | 100 |
| FCP (ms) | 1,500 | 3,000 |
| LCP (ms) | 2,500 | 4,000 |
| TBT (ms) | 200 | 600 |
| CLS | 0.1 | 0.25 |
| 뷰 전환 (ms) | 500 | 1,500 |
| 스크롤 FPS | 45 | 30 |
| 메모리 증가 (MB) | 30 | 50 |

### 13.5. Before 측정 결과

> 벤치마크 첫 실행 후 여기에 기록 예정.

---

## 14. 성능 개선 작업 이력

### 2026-03-02: P0 + P1 구현 완료

#### 1단계 커밋 (dd79e707) — P0 #1, #2

| # | 조치 | 변경 파일 | 변경 내용 |
|---|------|----------|-----------|
| P0 #1 | CSS 코드스플릿 활성화 | `vite.config.ts` | `cssCodeSplit: false` → `true` |
| P0 #2 | 문서 탐색기 페이지 크기 축소 | `DocumentExplorerView.tsx` | `initialItemsPerPage` 10000 → 500 |

**빌드 결과**:
- CSS: 1.3MB 단일 파일 → 48개 뷰별 CSS (메인 467KB + 뷰별 0.2~151KB)
- `@layer` 순서 선언 정상 유지 확인

#### 2단계 커밋 (484667e6) — P0 #3, #4, #5

| # | 조치 | 변경 파일 | 변경 내용 |
|---|------|----------|-----------|
| P0 #3 | flushSync 제거 → rAF throttle | `DocumentExplorerTree.tsx` | mouseEnter: flushSync → forceHoverUpdate, mouseMove: rAF throttle (프레임당 최대 1회) |
| P0 #4 | production console.log 제거 | `DocumentStatusProvider.tsx` | 정렬 핸들러 내 console.log 3개 삭제 |
| P0 #5 | hasProcessingDocuments useMemo | `DocumentStatusProvider.tsx` | `documents.some(...)` → `useMemo(() => documents.some(...), [documents])` |

**테스트 결과**: 122개 테스트 ALL PASS (8개 테스트 파일)

#### 3단계 커밋 (5269aba4) — P1 #6, #7, #8

| # | 조치 | 변경 파일 | 변경 내용 |
|---|------|----------|-----------|
| P1 #6 | vendor 번들 분리 | `vite.config.ts` | `manualChunks`: vendor-react(185KB), vendor-tanstack(35KB), vendor-state(3KB) 분리 |
| P1 #7 | DocumentStatusList 행 React.memo | `DocumentStatusList.tsx` | `DocumentStatusRow` memo 컴포넌트 추출, per-row boolean 변환(isSelected/isUpdating/isRetrying) |
| P1 #8 | DocumentExplorerTree React.memo | `DocumentExplorerTree.tsx` | `DocumentNode`/`GroupNode`/`TreeNode` memo 컴포넌트 추출, `formatDateTime`/`getDocName` 순수함수 추출 |

**빌드 결과**:
- 메인 번들: 588KB → 364KB (-38%), vendor 캐시 분리
- 순환 참조 경고: 없음
- lazy 청크(pdf.js, ProductSearchModal 등): 영향 없음

#### 번들 크기 변화 요약

| 항목 | Before | After | 변화 |
|------|--------|-------|------|
| CSS (초기 로드) | 1,343KB (단일) | ~467KB (메인) + 뷰별 온디맨드 | **-65%** |
| 메인 JS 번들 | 588KB (vendor 혼합) | 364KB (앱 코드만) | **-38%** |
| vendor-react | (메인에 포함) | 185KB (별도 캐시) | 업데이트 시 재다운로드 불필요 |
| vendor-tanstack | (메인에 포함) | 35KB (별도 캐시) | 업데이트 시 재다운로드 불필요 |
| 문서 탐색기 DOM | 60,000+ (10,000개 로드) | ~3,000 (500개 로드) | **-95%** |
| hover 동기 렌더 | 50회/초 (flushSync) | 0회/초 (rAF throttle) | **-100%** |
| 리스트 행 리렌더 | 전체 행 (memo 없음) | 변경된 행만 (React.memo) | **-90%+** |
| 트리 노드 리렌더 | 전체 트리 (함수 재호출) | 변경된 노드만 (React.memo) | **-90%+** |

#### 미적용 항목

| # | 조치 | 사유 | 우선순위 |
|---|------|------|----------|
| **P0-NEW-1** | **limit=10000 → 서버사이드 페이지네이션** | S 실측: 서버 응답 12.83s + 다운로드 1.2min. 화면에 15개만 표시하면서 10,000건 전체 요청. 대상: `status`, `customers` API. **응답 32MB — S 체감 로딩의 단일 최대 병목** | **최우선** |
| **P0-NEW-2** | **geocode API 호출 최적화** | W 실측: geocode 건별 호출 6.47s × N건 (지역별 고객 보기). 주소→좌표 변환을 건별 API 호출 → 배치 호출 또는 좌표 캐싱으로 전환 필요 | **최우선** |
| P1 #9 | fetchCustomerTypes 배치 API | 백엔드 API 추가 필요 (별도 작업) | 중 |
| P2 #10 | App.tsx Zustand 이관 | 대규모 리팩토링, 별도 판단 필요 | 낮 |
| P2 #11 | react-virtual 도입 | 가상화 라이브러리 도입, 별도 작업 | 중 |
| P2 #12 | Context 분할 | 대규모 리팩토링, 별도 판단 필요 | 낮 |
| P3 #13~15 | SSE/API 최적화 | 후속 작업으로 검토 | 낮 |

---

### S(송유미 PC) 실환경 테스트 계획

> 배포 후 S에서 직접 측정하여 Before/After 비교

#### 테스트 시나리오

| # | 시나리오 | 측정 방법 | Before 예상 | After 목표 |
|---|---------|----------|------------|-----------|
| 1 | 초기 페이지 로드 (캐시 없음) | DevTools Network → Load 시간 | 2~4초 | 1~2초 |
| 2 | 초기 페이지 로드 (캐시 있음) | DevTools Network → Load 시간 | 2~4초 | 0.5~1초 (vendor 캐시) |
| 3 | 문서 탐색기 진입 | 메뉴 클릭 → 트리 표시까지 | 5~10초+ (프리징) | 1~2초 |
| 4 | 탐색기 트리 hover | 마우스 이동 시 끊김 여부 | 프리징/끊김 | 즉시 반응 |
| 5 | 전체문서보기 정렬 클릭 | 칼럼 헤더 클릭 → 정렬 완료 | 0.5~1초 | 즉시 |
| 6 | 문서 보관함 스크롤 | 리스트 스크롤 시 버벅임 | 약간 버벅임 | 부드러움 |

#### 측정 도구
- Chrome DevTools → Network 탭 (Disable cache 체크/해제)
- Chrome DevTools → Performance 탭 (CPU 4x slowdown으로 S 시뮬레이션 대체 가능)
- 체감 측정 (프리징 여부, 반응 속도)

#### 테스트 결과 (2026-03-03 측정)

**측정 조건**: Chrome DevTools Network 탭, Disable cache 체크, Ctrl+Shift+R 강력 새로고침
**측정 지표**: DOMContentLoaded (HTML+CSS+JS 파싱 완료 시점)

##### 페이지별 DOMContentLoaded 비교

| # | 페이지 | W (고사양) | S (저사양) | 배율 | 비고 |
|---|--------|-----------|-----------|------|------|
| 1 | 상세 문서검색 | 143ms | 3.7s | 26x | DOMContentLoaded 기준 |
| 2 | 전체 고객 보기 | 238ms | 2.91s | 12x | DOMContentLoaded 기준. 화면 완전 표시는 훨씬 느림 |
| 3 | 지역별 고객 보기 | 248ms | 2.79s | 11x | DOMContentLoaded 기준. 화면 완전 표시는 훨씬 느림 |
| 4 | 문서 현황 | - | - | - | 측정 예정 |
| 5 | 고객 상세 | - | - | - | 측정 예정 |
| 6 | 법인 계약 탭 | - | - | - | 측정 예정 |

##### W(고사양) vs S(저사양) 하드웨어

| | W (wondercastle) | S (송유미 PC) |
|---|---|---|
| CPU | i7 (최신) | i5-4590T @ 2.0GHz (2014) |
| RAM | 32GB DDR5 | 8GB DDR3 |
| GPU | 전용 GPU | Intel HD 4600 (내장) |

##### 분석
- S의 DOMContentLoaded 3~4초는 **CPU의 JS 파싱+실행 속도**가 병목 (네트워크 아님)
- 26배 차이는 하드웨어 세대 차이(DDR3 vs DDR5, 2014 vs 최신 CPU)로 인한 것
- 추가 개선 여지: 코드 스플리팅(lazy loading), react-virtual(가상 스크롤)로 JS 파싱량 자체를 줄이는 것이 S에 가장 효과적

##### [핵심 발견] limit=10000 API 병목 (전체 고객 보기)

전체 고객 보기 페이지에서 DOMContentLoaded(2.91s) 이후에도 화면이 완전히 뜨기까지 **훨씬 더 오래 걸리는 현상** 확인.

**원인**: `status?page=1&limit=10000` API 요청의 Timing 분석 (S 실측):

| 단계 | 시간 | 설명 |
|------|------|------|
| Queueing | 5.59ms | 정상 |
| Stalled | 11.25ms | 정상 |
| Request sent | 0.38ms | 정상 |
| **Waiting for server response** | **12.83s** | 서버가 10,000건 조회+직렬화 |
| **Content Download** | **1.2 min** | 거대한 JSON 응답 다운로드 |
| **합계** | **1.4 min** | |

**근본 원인**: 화면에 15개만 표시하면서 `limit=10000`으로 전체 데이터를 한 번에 요청하는 구조.
- 서버: 10,000건 MongoDB 조회+JSON 직렬화 → 13초
- 네트워크: 수십 MB JSON 전송 → 1.2분 (S의 네트워크/CPU 파싱 속도)
- 클라이언트: JSON 파싱 + React 렌더링 → 추가 수초

**영향받는 API** (S 실측):
- `status?page=1&limit=10000&sort=uploadTime_...` — **32,778 KB (32MB)**, 1.2 min (DocumentStatusService)
- `customers?page=1&limit=10000&status=all` — 고객 목록

**핵심**: `status` API가 **모든 페이지 진입 시 글로벌로 호출**됨 (DocumentStatusService).
어떤 페이지를 가든 이 32MB API 1건이 S를 1.4분간 묶어두는 구조.
→ DOMContentLoaded(2~4초)와 무관하게 **실제 체감 로딩은 1분 이상**.

##### W vs S 병목 지점 차이 (지역별 고객 보기 기준)

| API | W (고사양) | S (저사양) | 비고 |
|-----|-----------|-----------|------|
| `status?limit=10000` (32MB) | 5.15s | **1.2 min (72s)** | 같은 API, PC 성능 차이로 14배 |
| `geocode` (1.3KB × N건) | **6.47s** (W 병목) | geocode 이전에 이미 멈춤 | 지도 좌표 변환, 건별 호출 |
| DOMContentLoaded | 660ms | 2.79s | |
| Load | 669ms | - | |

- **W**: CPU/네트워크가 빨라 32MB도 5초에 처리 → geocode 다건 호출(6.47s)이 오히려 병목
- **S**: 32MB 처리에 1.2분(72초) 소요 → geocode까지 도달 전에 이미 체감 지연 발생
- 결론: **같은 API라도 PC 성능에 따라 병목 지점이 달라짐**. S 개선의 핵심은 status API 데이터량 축소.

**개선 방안**: `limit=10000` → 서버사이드 페이지네이션(limit=100~500)으로 전환 시 극적 개선 예상.
이 작업은 프론트엔드 CSS/번들 최적화와 별개의 **API 데이터량 최적화** 영역임.

---

### S 실환경 테스트 최종 결론 (2026-03-03)

#### 주범: `/api/documents/status?page=1&limit=10000&sort=uploadTime_desc`

```
GET /api/documents/status?page=1&limit=10000
- 응답 크기: 32,778 KB (32MB)
- W 응답 시간: 5.15s
- S 응답 시간: 1.2 min (72s)
- 호출 주체: DocumentStatusService (글로벌 — 모든 페이지 진입 시 호출)
```

**이 API 하나가 S 체감 속도의 80% 이상을 결정함.**

- 모든 페이지(상세 문서검색, 전체 고객 보기, 지역별 고객 보기 등)에서 동일하게 호출
- DOMContentLoaded(2~4초)는 빠르게 완료되지만, 이 API 응답 완료까지 화면 데이터 미표시
- 프론트엔드 최적화(CSS 분할, vendor 분리, React.memo)는 DOMContentLoaded에만 효과
- **실제 체감 개선을 위해서는 이 API의 데이터량 축소가 필수**

#### 개선 우선순위 재정리

| 순위 | 작업 | 예상 효과 (S 기준) |
|------|------|-------------------|
| **1** | `status` API: limit=10000 → 서버사이드 페이지네이션 | 1.2min → 수초 (체감 **10배 이상** 개선) |
| **2** | `customers` API: limit=10000 → 서버사이드 페이지네이션 | 추가 개선 |
| **3** | geocode 배치/캐싱 | 지역별 고객 보기 지도 로딩 개선 |
| 4 | react-virtual, Context 분할 등 | DOMContentLoaded 추가 단축 |
