# 고객 상세 문서 탭 — 툴바 UX 레이아웃 정비

- **일자**: 2026-04-11
- **작업 유형**: feature 수정 개발 (UX 레이아웃 재배치)
- **프로세스**: Compact Fix
- **브랜치**: `feat/document-tab-toolbar-ux`

---

## 1. 배경

직전 작업(`feat/customer-doc-tab-tree-filter`)에서 분류 드롭다운을 드릴다운 트리로 교체한 뒤, 사용자가 같은 문서 탭 툴바의 다른 요소들(검색창, 검색 모달 트리거, 문서 분류함 버튼) 배치가 어색하다고 지적. UX 전문가(Dana)에게 분석을 의뢰한 결과 5가지 이슈 발견.

---

## 2. Dana 진단 — 5가지 이슈

| # | 심각도 | 이슈 |
|---|--------|------|
| 1 | Major | 문서 섹션 검색창이 계약 섹션과 위치 불일치 (Spatial Consistency 위반) |
| 2 | Major | 돋보기(문서 내용 검색) 모달 버튼이 검색 input과 Focus 확장 사이에 끼어 검색 그룹 경계 모호 |
| 3 | Major | "문서 분류함" 버튼이 분류 필터와 혼재 — 사실은 다른 페이지로 이동하는 네비게이션인데 필터로 오인 |
| 4 | Critical(원칙) | 📂 이모지 사용 — AIMS Apple 디자인 원칙 위반 |
| 5 | Minor | 모바일 헤더에 돋보기/분류함 부재 (데스크톱과 불일치) |

---

## 3. 합의된 새 레이아웃

### CFD 데스크톱 — 문서 섹션 타이틀

```
[📄 문서 N] [분류 드릴다운 트리]    [🔍검색✕][🔎] │ [⤢][📁]
   left          center                  right-search       right-nav
```

| 영역 | 요소 | 역할 |
|------|------|------|
| Left | 아이콘 + "문서" + 카운트 배지 | 섹션 식별 |
| Center (flex:1) | 분류 드릴다운 트리 | 현재 화면 내 필터 조작 |
| Right-Search | `[검색 input][돋보기 모달 버튼]` 한 pill 컨테이너 | 얕은(파일명)→깊은(본문) 검색 |
| Right-Nav | `[Focus 확대][문서 분류함]` 묶음 (사이에 미세 divider) | 뷰 전환 (현재 페이지 확장 / 외부 페이지 이동) |

### CFD 모바일 헤더

데스크톱과 동일 검색 pill 적용. 문서 분류함 버튼은 모바일에서 생략(메인 메뉴로 진입 가능).

### 일반 컨텍스트 (CustomerDetailView)

`.document-category-filter-bar`를 `flex justify-between` 구조로:
- 좌측: 분류 드릴다운 트리
- 우측: 문서 분류함 버튼 (아이콘-only + Tooltip)

---

## 4. 합의 사항 (Dana 권장안 전체 채택)

| Q | 결정 |
|---|------|
| Q1. 돋보기 위치 | 검색 input 오른쪽, 같은 pill 내부 |
| Q2. 문서 분류함 위치 | Focus 확대 버튼 오른쪽 최외곽 |
| Q3. 분류함 버튼 모양 | 아이콘-only + Tooltip ("문서 분류함 열기") |
| Q4. 모바일 헤더 | 데스크톱과 동일 pill 통일 |
| Q5. 포탈 계약 변경 | 수용 — DocumentsTab의 `filterBarContent`에서 "문서 분류함" 분리, CFD가 자체 렌더 |

---

## 5. 수정 범위 (예상)

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/aims-uix3/src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.tsx` (1004~1021, 1467~1525) | 검색 + 돋보기를 pill 컨테이너로 묶기. 문서 분류함을 nav 그룹에 자체 렌더. 모바일 헤더에도 pill 적용 |
| `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/DocumentsTab.tsx` (1208~1220) | "문서 분류함" 버튼을 `filterBarContent` 포탈에서 분리. 일반 컨텍스트는 `.document-category-filter-bar` 우측에 자체 렌더(아이콘-only). 부모 콜백 수신 추가 |
| `DocumentsTab.layout.css` | filter bar `space-between`, expand-btn 아이콘-only 스타일, 이모지 제거 |
| `DocumentsTab.cfd-overrides.css` | 포탈 슬롯 안에는 분류 트리만 |
| `CustomerFullDetailView.css` (또는 module) | `.customer-full-detail__doc-search-group` (검색 pill), `.customer-full-detail__nav-group` (Focus + 분류함 묶음) 신규 클래스 |

### 변경 없음 (절대 안 건드림)

- 분류 트리 컴포넌트 (`DocumentCategoryFilter.tsx`) — 직전 작업 결과물 보존
- 백엔드
- 다른 섹션(계약/보고서)의 검색·Focus 버튼 — 본 작업은 문서 섹션만

---

## 6. 검증 계획 (Phase 3)

| 시나리오 | 기대 |
|---------|------|
| CFD 데스크톱 진입 | 문서 섹션 타이틀에 순서대로 [문서 N][분류트리][검색pill][Focus][분류함] 노출 |
| 검색 input에 입력 | clear 버튼 노출, 돋보기 모달 버튼은 그대로 옆에 |
| 돋보기 모달 버튼 클릭 | 문서 내용 검색 모달 열림 |
| 문서 분류함 버튼 클릭 | documents-explorer 화면으로 이동 |
| Focus 확대 버튼 클릭 | 섹션 풀뷰 토글 |
| 일반 컨텍스트(CustomerDetailView) 진입 | 분류 트리 좌측, 분류함 버튼 우측에 (아이콘-only) |
| 모바일 헤더 (CFD 모바일 패널) | 검색 pill 적용 |
| 이모지 📂 grep | 결과 0건 |
| Tab 키보드 네비게이션 | 검색→돋보기→Focus→분류함 순서 정상 |

---

## 7. 결정 이력

- **2026-04-11**: 사용자 피드백 → Dana UX 분석 → 5가지 이슈 + 5가지 결정 권장안 → 사용자 "전부 권장안 채택" → 본 보고서 + Phase 0 진행
