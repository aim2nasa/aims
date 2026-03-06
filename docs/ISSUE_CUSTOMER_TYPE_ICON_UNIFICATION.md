# 이슈: 개인/법인 고객 타입 아이콘 통일

## 상태: OPEN

## 문제

개인/법인 고객 유형을 표시하는 아이콘이 화면마다 제각각이다.
같은 의미(개인 고객, 법인 고객)를 나타내는 아이콘은 앱 전체에서 통일되어야 한다.

### 기준 아이콘 (전체 고객 보기)

| 유형 | SVG | 색상 | 크기 |
|------|-----|------|------|
| 개인 | 원형 배경 + 사람 실루엣 | `var(--color-icon-blue)` | 16x16 |
| 법인 | 원형 배경 + 건물 | `var(--color-icon-orange)` | 16x16 |

```tsx
// 개인
<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
  <circle cx="10" cy="10" r="10" opacity="0.2" />
  <circle cx="10" cy="7" r="3" />
  <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
</svg>

// 법인
<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
  <circle cx="10" cy="10" r="10" opacity="0.2" />
  <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
</svg>
```

### CSS 색상 클래스

```css
.customer-icon--personal { color: var(--color-icon-blue); }
.customer-icon--corporate { color: var(--color-icon-orange); }
```

## 현황 분석

### 기준 SVG 아이콘을 사용하는 화면 (정상)

- AllCustomersView (전체 고객 보기)
- CustomerDetailView (고객 상세)
- CustomerFullDetailView (고객 전체 상세)
- RegionalTreeView (지역별 고객)
- CustomerRelationshipView (관계별 고객)
- QuickSearch (빠른 검색)
- RecentCustomers (최근 검색 고객)
- DocumentStatusList (문서 상태 목록)
- DocumentSearchView (상세 문서검색)
- ExcelRefiner (엑셀 정제 결과)
- CustomMenu (커스텀 메뉴)
- DocumentContentSearchModal (간편 문서검색) - 2026-03-06 수정 완료

### SFSymbol 또는 다른 방식을 사용하는 화면 (통일 필요)

- CustomerSelectorModal: `building.2.fill` SFSymbol 사용
- DocumentExplorerView: `person.fill` / `building.2.fill` SFSymbol 사용
- DocumentExplorerToolbar: `person.fill` SFSymbol 사용

## 해결 방안

1. **공용 컴포넌트 추출**: `CustomerTypeIcon` 컴포넌트를 만들어 모든 곳에서 재사용
2. props: `type: '개인' | '법인'`, `size?: number` (기본 16)
3. 기존 inline SVG를 모두 공용 컴포넌트로 교체
4. SFSymbol 기반 아이콘도 동일 SVG로 교체

## 우선순위

중간 - UX 일관성 이슈. 기능에는 영향 없으나 디자인 통일성 저해.

## 작성일

2026-03-06
