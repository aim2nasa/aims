# M-7 CustomMenu 데이터 이중 관리 리팩토링 계획 보고서

> 작성일: 2026-03-11 | 상태: **계획 완료, 실행 대기**

---

## 1. 현황 분석

### 1.1 현재 데이터 구조 도식

```
menuItems useMemo (line 410~692)
├── autoclicker                          [단독 - 이중관리 아님]
├── search-results (조건부)              [단독 - 이중관리 아님]
│
├── quick-actions (부모)
│   └── children: collapsed ? undefined : [4개]
├── ...(collapsed ? [4개 FLAT 복제] : [])
│
├── customers (부모)
│   └── children: collapsed ? undefined : [3개]
├── ...(collapsed ? [3개 FLAT 복제] : [])
│
├── contracts (부모, isDevMode 조건부)
│   └── children: collapsed ? undefined : [1개]
├── ...(collapsed && isDevMode ? [1개 FLAT 복제] : [])
│
├── documents (부모)
│   └── children: collapsed ? undefined : [3개]
├── ...(collapsed ? [3개 FLAT 복제] : [])
│
├── help (부모)
│   └── children: collapsed ? undefined : [4개]
└── ...(collapsed ? [4개 FLAT 복제] : [])
```

**총 15개 항목**이 expanded children + collapsed flat으로 이중 선언.

### 1.2 중복 항목 전수 비교 (tooltipTitle 불일치 검출)

| key | expanded tooltipTitle | collapsed tooltipTitle | 일치 |
|-----|----------------------|----------------------|------|
| `documents-register` | `'AR 업로드 시 고객 자동 추출/연결'` | `'고객·계약·문서 등록'` | **불일치** |
| `customers-register` | `'고객 정보를 직접 입력합니다'` | `'고객 수동등록'` | **불일치** |
| `contracts-import` | (동적, isDevMode 기반) | (동적, isDevMode 기반) | 일치 |
| `batch-document-upload` | `'폴더별로 정리된 문서를 고객에게 일괄 등록합니다'` | 동일 | 일치 |
| `customers-all` | `'모든 고객을 보여줍니다'` | 동일 | 일치 |
| `customers-regional` | `'지역별로 고객을 분류하여 보여줍니다'` | 동일 | 일치 |
| `customers-relationship` | `'가족 관계별로 고객을 분류하여 보여줍니다'` | 동일 | 일치 |
| `contracts-all` | `'모든 계약을 보여줍니다'` | 동일 | 일치 |
| `documents-explorer` | `'고객별로 문서를 모아 볼 수 있습니다'` | 동일 | 일치 |
| `documents-search` | `'상세 문서검색 페이지로 이동합니다'` | `'상세 문서검색'` | **불일치** |
| `documents-library` | `'모든 문서를 보여줍니다'` | 동일 | 일치 |
| `help-notice` | (동적, noticeHasNew 기반) | (동적, noticeHasNew 기반) | 일치 |
| `help-guide` | `'기능별 사용 가이드'` | `'사용 가이드'` | **불일치** |
| `help-faq` | `'자주 묻는 질문'` | 동일 | 일치 |
| `help-inquiry` | (동적, inquiryUnreadCount 기반) | (동적, inquiryUnreadCount 기반) | 일치 |

### 1.3 발견된 불일치 4건 (M-8급 버그)

1. **`documents-register`**: expanded 상세설명 vs collapsed 짧은이름
2. **`customers-register`**: expanded 상세설명 vs collapsed 짧은이름
3. **`documents-search`**: expanded `'상세 문서검색 페이지로 이동합니다'` vs collapsed `'상세 문서검색'`
4. **`help-guide`**: expanded `'기능별 사용 가이드'` vs collapsed `'사용 가이드'`

---

## 2. 리팩토링 설계

### 2.1 목표 구조

**Before (이중 관리)**:
```typescript
const menuItems = useMemo(() => [
  { key: 'parent', children: collapsed ? undefined : [child1, child2] },
  ...(collapsed ? [child1_copy, child2_copy] : []),  // 중복!
], [collapsed, ...])
```

**After (단일 소스 + 변환 함수)**:
```typescript
// 1. 정본 데이터: collapsed 무관, 항상 children 포함
const menuItemsSource = useMemo(() => [
  { key: 'parent', children: [child1, child2] },
], [hasSearchResults, searchResultsCount, inquiryUnreadCount, noticeHasNew, isDevMode])

// 2. 변환 함수: collapsed 상태에 따라 렌더링용 구조 생성
const menuItems = useMemo(() =>
  flattenForCollapsed(menuItemsSource, collapsed),
  [menuItemsSource, collapsed]
)
```

### 2.2 변환 함수

```typescript
function flattenForCollapsed(items: MenuItem[], collapsed: boolean): MenuItem[] {
  if (!collapsed) return items

  const result: MenuItem[] = []
  for (const item of items) {
    result.push({ ...item, children: undefined, label: '' })
    if (item.children) {
      for (const child of item.children) {
        result.push({ ...child, label: '' })
      }
    }
  }
  return result
}
```

### 2.3 변경 범위

| 파일 | 변경 |
|------|------|
| `CustomMenu.tsx` L410~692 | menuItems useMemo → 2단계 분리 |
| `CustomMenu.tsx` 신규 함수 | `flattenForCollapsed()` 추가 |
| CSS/navigationUtils | **변경 없음** |

---

## 3. Regression 테스트 계획

### 3.1 테스트 파일

```
src/components/CustomMenu/__tests__/CustomMenu.data-integrity.test.tsx
```

### 3.2 테스트 케이스 (12개)

#### A. 데이터 무결성 (6개)

| # | 검증 |
|---|------|
| 1 | expanded 모드에서 모든 메뉴 키 존재 |
| 2 | collapsed 모드에서 모든 메뉴 키 존재 |
| 3 | collapsed 모드에서 children이 없어야 함 |
| 4 | expanded 모드에서 부모가 올바른 수의 children 보유 |
| 5 | **tooltipTitle이 collapsed/expanded에서 동일** (M-8 방지 핵심) |
| 6 | isDevMode=true일 때 계약 섹션 포함 |

#### B. 렌더링 동작 (3개)

| # | 검증 |
|---|------|
| 7 | collapsed에서 label이 빈 문자열 |
| 8 | expanded에서 부모 label 정확 |
| 9 | hasSearchResults=true 시 search-results 존재 |

#### C. 네비게이션 호환성 (3개)

| # | 검증 |
|---|------|
| 10 | collapsed getAllNavigableKeys가 모든 flat key 포함 |
| 11 | expanded getAllNavigableKeys가 펼쳐진 섹션 자식만 포함 |
| 12 | isDevMode=false일 때 계약 키 제외 |

### 3.3 Mock 대상

- `useDevModeStore` (Zustand)
- `useNavigation` (hook)
- `RecentCustomers` (컴포넌트)
- `Tooltip` (컴포넌트)
- `SFSymbol` (이미 전역 mock 존재)

---

## 4. 실행 단계

### Phase 1: 테스트 작성 (리팩토링 전)
1. `__tests__/` 디렉토리 생성
2. 12개 테스트 케이스 작성
3. 현재 코드로 ALL PASS 확인 (baseline)

### Phase 2: 리팩토링 구현
1. `flattenForCollapsed` 함수 작성
2. menuItems useMemo 2단계 분리
3. tooltipTitle 불일치 4건 통일 (사용자 승인 후)
4. useMemo 의존성 배열 정리

### Phase 3: 테스트 실행 및 검증
1. `npx vitest run` → ALL PASS
2. `npm run build` → 빌드 성공
3. `npm run typecheck` → 타입 검증

### Phase 4: Gini 검수
1. 코드 품질 + 타입 안전성
2. 12개 테스트 커버리지
3. 엣지 케이스 (devMode 전환, 동적 badge, 검색 결과 토글)
4. 시각적 회귀 확인

---

## 5. 리스크 및 롤백

### 5.1 리스크

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| ReactNode label 변환 오류 | Medium | badge label 테스트로 커버 |
| getAllNavigableKeys 비호환 | Low | 기존 코드 분석 완료, flat 처리 가능 |
| Progressive Disclosure 비호환 | Low | expandedKeys 로직은 독립적 |
| tooltipTitle 통일 시 의도와 다른 값 | Medium | 사용자에게 개별 확인 |
| useMemo 의존성 누락 | High | eslint 경고 확인 |

### 5.2 롤백

- 2번 시도 실패 → `git checkout` 원복 후 재구현
- 테스트 파일은 유지 (추가만 했으므로)

### 5.3 tooltipTitle 불일치 해소 (사용자 결정 필요)

| 옵션 | 설명 |
|------|------|
| **A (권장)** | expanded 값(상세 설명)을 정본 채택 — collapsed tooltip이 유일한 정보 소스이므로 상세할수록 좋음 |
| B | collapsed 값(간결) 채택 |
| C | `collapsedTooltipTitle` 별도 필드 추가 (의도적 이중 관리) |

---

## 진행 결과 로그

| 단계 | 상태 | 비고 |
|------|------|------|
| 계획 수립 | ✅ 완료 | 2026-03-11 |
| Phase 1: 테스트 작성 | ⬜ 대기 | |
| Phase 2: 리팩토링 | ⬜ 대기 | |
| Phase 3: 테스트 검증 | ⬜ 대기 | |
| Phase 4: Gini 검수 | ⬜ 대기 | |
| 커밋 | ⬜ 대기 | |
