# 프론트엔드 저사양 PC 성능 이슈 분석

> **작성일**: 2026-03-02
> **발견 환경**: 송유미 데스크탑 (DESKTOP-DSRK1TG)
> **영향 범위**: 저사양 클라이언트 전반 (문서 탐색기 > 전체문서보기)

---

## 1. 이슈 요약

aims.giize.com에 송유미 데스크탑(이하 S)에서 접속했을 때, **전체문서보기** 및 **문서 탐색기** 화면이 개발 PC(wondercastle) 대비 현저히 느린 현상이 확인됨.

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

## 3. 프론트엔드 코드 분석

### 3.1. 문서 탐색기 (DocumentExplorerView) — 심각

| 항목 | 현재 값 | 문제점 |
|------|---------|--------|
| `initialItemsPerPage` | **10,000** | 만 개의 문서를 한 번에 로드 |
| 가상화 (Virtual Scrolling) | **미적용** | DOM에 전체 노드 렌더링 |
| 렌더링 방식 | Recursive `renderNode()` | 트리 전체를 DOM에 생성 |

**관련 파일:**
- `frontend/aims-uix3/src/components/DocumentViews/DocumentExplorerView/DocumentExplorerView.tsx`
- `frontend/aims-uix3/src/components/DocumentViews/DocumentExplorerView/DocumentExplorerTree.tsx`
- `frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx`

```tsx
// DocumentExplorerView.tsx — 현재 구조
<DocumentStatusProvider
  searchQuery=""
  fileScope="excludeMyFiles"
  initialItemsPerPage={10000}  // ← 10,000개 한 번에 로드
>
  <DocumentExplorerContent ... />
</DocumentStatusProvider>
```

```tsx
// DocumentExplorerTree.tsx — 가상화 없이 전체 렌더링
{nodes.map((node) => renderNode(node, 0))}
```

### 3.2. 전체문서보기 (DocumentLibraryView) — 상대적 양호

| 항목 | 현재 값 | 상태 |
|------|---------|------|
| 페이지네이션 | 15개/페이지 (기본) | 적용됨 |
| 페이지 옵션 | 10/15/20/50/100 | 100개 선택 시 느려질 수 있음 |
| 가상화 | 미적용 | 페이지 내 DOM 전체 렌더링 |

**관련 파일:**
- `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx`

### 3.3. 가상화 라이브러리 현황

`package.json`에 `react-virtual`, `@tanstack/react-virtual`, `react-window` 등 **가상화 라이브러리 없음**. 모든 리스트/트리를 실제 DOM으로 렌더링.

---

## 4. 번들 사이즈 분석

### 4.1. 주요 번들

| 파일 | 크기 | 설명 |
|------|------|------|
| `pdf.worker.min.mjs` | 1,011 KB | PDF.js 워커 (PDF 열 때 로드) |
| `index-BDNhoZw6.js` | 573 KB | 메인 번들 (React + vendors + 앱 코드) |
| `ProductSearchModal-*.js` | 426 KB | 상품 검색 모달 |
| `pdf-*.js` | 343 KB | PDF 유틸리티 |
| CSS (단일 파일) | 1,300 KB | 전체 스타일 (코드 스플릿 안됨) |
| **총 dist** | **6.2 MB** | gzip 전 기준 |

### 4.2. 빌드 설정 이슈 (vite.config.ts)

- `cssCodeSplit: false` — CSS 단일 파일로 묶임 (1.3MB)
- `chunkSizeWarningLimit: 1000` — 경고 기준 높여놓음
- vendor chunk 분리 미설정 (`manualChunks` 없음)
- 74개 JS 청크로 코드 스플릿은 되어 있으나, 메인 번들(573KB)에 vendor 포함

### 4.3. 현재 적용된 최적화

- React.lazy + Suspense (26개 뷰 컴포넌트 지연 로드)
- useMemo / useCallback 부분 적용
- 서버사이드 검색/필터링
- DocumentLibraryView 페이지네이션

### 4.4. 미적용 최적화

- Virtual Scrolling (가상화)
- Vendor chunk 분리
- CSS 코드 스플릿
- PDF.js / xlsx 지연 로드
- React.memo 강화

---

## 5. S에서의 예상 성능 영향

| 시나리오 | 예상 소요시간 | 원인 |
|----------|-------------|------|
| 초기 페이지 로드 | 2~4초 | 573KB 메인번들 파싱 (2GHz CPU) |
| 문서 탐색기 진입 | 5~10초+ | 10,000개 문서 API 응답 + DOM 렌더링 |
| 문서 탐색기 트리 펼침 | 프리징 | 수백 개 DOM 노드 한 번에 생성 |
| 전체문서보기 (15개) | 1~2초 | 페이지네이션 덕분에 양호 |
| 전체문서보기 (100개) | 3~5초 | DOM 100개 + 연관 UI 렌더링 |
| PDF 뷰어 | 3~5초 | 1MB 워커 로드 + 렌더링 |

---

## 6. 개선 방안 (우선순위순)

### P0 (긴급) — 문서 탐색기 성능 개선

**방안 A**: `initialItemsPerPage` 축소 + 서버사이드 페이지네이션
```tsx
// 10,000 → 500 또는 적정값으로 축소
<DocumentStatusProvider initialItemsPerPage={500}>
```

**방안 B**: `@tanstack/react-virtual` 도입으로 보이는 영역만 렌더링
- 트리 노드 가상화
- collapsed 상태 노드는 DOM에서 제거

### P1 (권장) — 번들 최적화

- Vite `manualChunks`로 vendor 분리 (react, react-dom, tanstack-query)
- `cssCodeSplit: true` 활성화
- PDF.js / xlsx를 필요 시점에만 dynamic import

### P2 (선택) — 컴포넌트 최적화

- DocumentRow, TreeNode에 `React.memo` 적용
- 불필요한 리렌더링 방지

---

## 7. 결론

> **S가 느린 건 맞지만, "S에서만 느린 게 아니라 S에서 드러난 것"이다.**

문서 탐색기가 10,000개를 DOM에 한 번에 그리는 구조는 어떤 저사양 PC에서든 문제가 된다. wondercastle의 빠른 CPU가 가리고 있었을 뿐이며, 실제 사용자(설계사) 환경을 고려하면 **반드시 개선이 필요**하다.
