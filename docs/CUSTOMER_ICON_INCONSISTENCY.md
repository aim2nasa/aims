# 고객 유형 아이콘 불일치 현황

> 조사일: 2026-03-29
> 기준 화면: 전체고객보기 (AllCustomersView)

## 기준 정의

| 고객 유형 | 아이콘 | 색상 | CSS 변수 |
|-----------|--------|------|----------|
| 개인 | 사람 (circle + head + body) | Blue | `--color-icon-blue: #007aff` |
| 법인 | 건물 (grid pattern) | Orange | `--color-icon-orange: #ff9500` |

## 일치하는 컴포넌트

| # | 파일 | 컴포넌트 |
|---|------|---------|
| 1 | `AllCustomersView.tsx` | 전체고객보기 (기준) |
| 2 | `CustomMenu.tsx` | 커스텀 메뉴 |
| 3 | `ExcelRefiner.tsx` | 엑셀 정제 |
| 4 | `CustomerDetailView.tsx` | 고객 상세 |
| 5 | `ContractAllView.tsx` | 전체 계약 보기 |
| 6 | `RecentCustomers.tsx` | 최근 고객 |

## 불일치 케이스

### 유형 1. 색상 CSS 미적용 (6건)

아이콘 SVG는 존재하나 색상 클래스가 정의되지 않아 부모 텍스트 색상을 상속.
개인/법인 색상 구분이 되지 않음.

| # | 파일 | 컴포넌트 |
|---|------|---------|
| 1 | `CustomerRelationshipView/CustomerRelationshipView.tsx` | 고객 관계 뷰 |
| 2 | `CustomerRegionalView/RegionalTreeView.tsx` | 지역별 뷰 |
| 3 | `DocumentExplorerView/DocumentExplorerTree.tsx` | 고객별 문서함 |
| 4 | `DocumentStatusView/components/DocumentStatusList.tsx` | 문서 상태 목록 |
| 5 | `CustomerFullDetailView/CustomerFullDetailView.tsx` | 고객 전체 상세 |
| 6 | `DocumentContentSearchModal/DocumentContentSearchModal.tsx` | 문서 내용 검색 모달 |

### 유형 2. 색상값 불일치 (1건)

Tailwind 하드코딩 색상을 사용하여 기준 CSS 변수와 다른 값.

| # | 파일 | 현재 색상 | 기준 색상 |
|---|------|----------|----------|
| 1 | `QuickSearch/QuickSearch.tsx` | Blue `#3b82f6` / Orange `#f97316` | Blue `#007aff` / Orange `#ff9500` |

## 수정 방향

모든 불일치 파일에 기준과 동일한 CSS 변수(`--color-icon-blue`, `--color-icon-orange`)를 적용.
