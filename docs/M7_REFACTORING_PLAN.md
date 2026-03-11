# M-7 CustomMenu 데이터 이중 관리 리팩토링 계획 보고서

> 작성일: 2026-03-11 | **v3.5 — R7 Minor 5건 반영, 전 에이전트 만장일치 PASS**

---

## 0. 핵심 원칙

> **리팩토링 = 외부 동작 0% 변경, 내부 구조만 변경.**
> tooltipTitle 불일치 수정은 **별도 커밋(B)**으로 분리.

### 작업 분리

| 커밋 | 성격 | 동작 변경 |
|------|------|----------|
| **커밋 A: 순수 리팩토링** | 이중 데이터 → 단일 소스 + 변환 함수 | **없음 (0%)** |
| **커밋 B: tooltipTitle 통일** | 불일치 4건 수정 (간결한 collapsed 값으로 통일) | **있음 (의도적 개선)** |

---

## 1. 현황 분석

### 1.1 현재 데이터 구조 도식

```
menuItems useMemo (line 410~692)

[expanded 모드] — children 존재, flat 복제 없음
├── autoclicker         (단독, label='메트 PDF 자동 받기')
├── search-results?     (단독, 조건부)
├── quick-actions       (부모, children=[4개])
├── customers           (부모, children=[3개])
├── contracts?          (부모, isDevMode 조건부, children=[1개])
├── documents           (부모, children=[3개])
└── help                (부모, children=[4개])

[collapsed 모드] — 부모는 children:undefined, 자식이 flat으로 추가
├── autoclicker         (단독, label='')
├── search-results?     (단독, 조건부, label='')
├── quick-actions       (부모, children:undefined, label='')
├── documents-register  (flat 자식, label='')
├── customers-register  (flat 자식, label='')
├── contracts-import    (flat 자식, label='')
├── batch-document-upload (flat 자식, label='')
├── customers           (부모, children:undefined, label='')
├── customers-all       (flat 자식, label='')
├── customers-regional  (flat 자식, label='')
├── customers-relationship (flat 자식, label='')
├── contracts?          (부모, isDevMode, children:undefined, label='')
├── contracts-all?      (flat 자식, isDevMode)
├── documents           (부모, children:undefined, label='')
├── documents-explorer  (flat 자식, label='')
├── documents-search    (flat 자식, label='')
├── documents-library   (flat 자식, label='')
├── help                (부모, children:undefined, label='')
├── help-notice         (flat 자식, label='')
├── help-guide          (flat 자식, label='')
├── help-faq            (flat 자식, label='')
└── help-inquiry        (flat 자식, label='')
```

**핵심 구조**: collapsed에서 부모 항목은 **제거되지 않고** `children:undefined, label:''`로 유지됨. 자식만 flat으로 부모 뒤에 추가됨.

### 1.2 tooltipTitle 불일치 4건

| key | expanded (상세) | collapsed (간결) |
|-----|----------------|-----------------|
| `documents-register` | `'AR 업로드 시 고객 자동 추출/연결'` | `'고객·계약·문서 등록'` |
| `customers-register` | `'고객 정보를 직접 입력합니다'` | `'고객 수동등록'` |
| `documents-search` | `'상세 문서검색 페이지로 이동합니다'` | `'상세 문서검색'` |
| `help-guide` | `'기능별 사용 가이드'` | `'사용 가이드'` |

**커밋 B 통일 방향: collapsed 값(간결)을 정본으로 채택** (Sora 권고: 간결한 쪽이 직관적, "AR"은 사용자에게 외국어)

---

## 2. 리팩토링 설계 (커밋 A)

### 2.1 변환 함수 `flattenForCollapsed`

**파일 위치**: `src/components/CustomMenu/menuUtils.ts` (별도 파일, 순수 함수 단위 테스트 용이)

```typescript
import type { MenuItem } from './CustomMenu'

/**
 * collapsed=true: 부모는 children:undefined + label:''로 변환,
 *                 자식은 부모 바로 뒤에 flat으로 추가 + label:''
 * collapsed=false: 원본 그대로 반환
 */

// 커밋 A 전용: 현재 불일치를 보존하기 위한 override map
// 커밋 B에서 이 상수와 관련 로직을 삭제하여 통일 완료
const COLLAPSED_TOOLTIP_OVERRIDES: Record<string, string> = {
  'documents-register': '고객·계약·문서 등록',
  'customers-register': '고객 수동등록',
  'documents-search': '상세 문서검색',
  'help-guide': '사용 가이드',
}

export function flattenForCollapsed(
  items: MenuItem[],
  collapsed: boolean
): MenuItem[] {
  if (!collapsed) return items

  const result: MenuItem[] = []
  for (const item of items) {
    // 부모 항목: children 제거, label 빈 문자열
    result.push({
      ...item,
      children: undefined,
      label: '',
    })
    // 자식 항목: 부모 바로 뒤에 flat으로 추가
    if (item.children) {
      for (const child of item.children) {
        result.push({
          ...child,
          label: '',
          tooltipTitle: COLLAPSED_TOOLTIP_OVERRIDES[child.key] ?? child.tooltipTitle,
        })
      }
    }
  }
  return result
}
```

**설계 결정 근거**:
- 부모 항목은 collapsed에서도 **배열에 유지** (현재 동작: L428 quick-actions는 항상 존재, `children: collapsed ? undefined : [...]`일 뿐)
- `COLLAPSED_TOOLTIP_OVERRIDES` 상수 Map으로 불일치 보존 → MenuItem interface 오염 없음 (Alex 권고)
- 별도 `menuUtils.ts` 파일로 분리 → 순수 함수 단위 테스트 가능 (Code Reviewer 권고)

### 2.2 menuItemsSource (정본 데이터)

```typescript
// collapsed 의존성 제거 — 항상 children 포함, label은 원래 값
const menuItemsSource: MenuItem[] = useMemo(() => [
  {
    key: 'autoclicker',
    icon: <span className="menu-icon-teal"><MenuIcons.AutoClicker /></span>,
    label: '메트 PDF 자동 받기',  // 항상 원래 값 (변환 함수가 collapsed 시 '' 처리)
    tooltipTitle: '메트 PDF 자동 받기',
  },
  ...(hasSearchResults ? [{
    key: 'search-results',
    icon: <MenuIcons.Search />,
    label: `검색 결과 (${searchResultsCount}개)`,  // 항상 원래 값
    tooltipTitle: `검색 결과 (${searchResultsCount}개)`,
  }] : []),
  {
    key: 'quick-actions',
    label: '빠른 작업',           // 항상 원래 값
    tooltipTitle: '빠른 작업',
    children: [                   // 항상 children 포함 (collapsed 무관)
      { key: 'documents-register', label: '고객·계약·문서 등록', tooltipTitle: 'AR 업로드 시 고객 자동 추출/연결', ... },
      // ... 나머지 자식들
    ]
  },
  // ... 나머지 부모+자식들
], [hasSearchResults, searchResultsCount, inquiryUnreadCount, noticeHasNew, isDevMode])
// ↑ collapsed 의존성 없음!

// 변환 적용
const menuItems = useMemo(() =>
  flattenForCollapsed(menuItemsSource, collapsed),
  [menuItemsSource, collapsed]
)
```

**단독 항목(autoclicker, search-results)의 label 처리**: 정본에서 원래 값을 유지하고, `flattenForCollapsed`에서 collapsed 시 `label: ''`로 일괄 변환. children 유무와 무관하게 모든 항목에 동일 로직 적용.

### 2.3 변경 범위

| 파일 | 변경 |
|------|------|
| `CustomMenu.tsx` L410~692 | menuItems useMemo → menuItemsSource + menuItems 2단계 |
| `CustomMenu.tsx` L202 MenuItem export | **변경 없음** (interface 수정 불필요) |
| **신규** `menuUtils.ts` | `flattenForCollapsed()` + `COLLAPSED_TOOLTIP_OVERRIDES`. `import type { MenuItem } from './CustomMenu'` 사용 (type-only import → 런타임 순환 없음, Code Reviewer R2 확인) |
| `navigationUtils.ts` | **변경 없음** (MenuItem 타입 optional 필드 추가 없으므로) |
| CSS | **변경 없음** |

### 2.4 Progressive Disclosure useEffect 호환성

useEffect(L359~407)는 `expandedKeys` state만 조작하고 `menuItems` 데이터와 직접 상호작용하지 않습니다. `collapsed` prop 변경 → useEffect → expandedKeys 변경 → navigableKeys 재계산 순서. 리팩토링은 menuItems 구조만 변경하므로 **영향 없음(None)**.

참고: useEffect 내 setTimeout 5개에 cleanup이 없는 것은 기존 버그이나, 리팩토링 범위 외. 별도 이슈로 관리.

---

## 3. 100% 동작 보증 테스트 계획

### 3.0 테스트 전략: 3중 검증

| 층 | 방법 | 검증 대상 | 도구 |
|----|------|----------|------|
| **L1: DOM 스냅샷** | 렌더링 후 DOM에서 `data-menu-key`, `aria-label`, 텍스트 추출 비교 | 구조, 속성, 순서 | vitest + @testing-library/react |
| **L2: 순수 함수 단위 테스트** | `flattenForCollapsed` 입출력 검증 | 변환 로직 정확성 | vitest |
| **L3: 시각적 회귀** | Playwright 스크린샷 비교 | 픽셀 레벨 유사성 | Playwright MCP |

### 3.1 테스트 파일 구조

```
src/components/CustomMenu/__tests__/
├── CustomMenu.dom-snapshot.test.tsx    (L1: DOM 렌더링 검증)
├── flattenForCollapsed.test.ts         (L2: 순수 함수 단위 테스트)
```

### 3.2 Mock 전략 (구체적 구현 포함)

```typescript
// ── 타이머 제어 (Progressive Disclosure setTimeout 대응) ──
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ── useDevModeStore (케이스별 교체 가능) ──
const mockDevMode = vi.fn(() => ({ isDevMode: false, toggleDevMode: vi.fn() }))
vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: (...args: any[]) => mockDevMode(...args)
}))
// 테스트 내에서: mockDevMode.mockReturnValue({ isDevMode: true, toggleDevMode: vi.fn() })

// ── useNavigation (반환 구조 명시) ──
vi.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({
    onKeyDown: vi.fn(),
    onWheel: vi.fn(),
    currentIndex: 0,
    canNavigateUp: false,
    canNavigateDown: true,
    tabIndex: 0,
  })
}))

// ── RecentCustomers (상대 경로 mock) ──
vi.mock('../RecentCustomers', () => ({
  default: () => null
}))

// ── Tooltip (children 투과, TypeScript 호환) ──
vi.mock('@/shared/ui/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

// ── SFSymbol: 전역 setup.ts에서 이미 mock (추가 불필요) ──

// ── console.log 억제 (Progressive Disclosure 노이즈 방지) ──
let consoleLogSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  consoleLogSpy.mockRestore()  // console.log spy만 복원 (다른 mock에 영향 없음)
})
```

### 3.3 L2: flattenForCollapsed 단위 테스트 (13개)

**파일**: `flattenForCollapsed.test.ts`

테스트 데이터는 실제 MenuItem과 동일 구조의 mock 데이터 사용 (ReactNode icon은 `'icon'` 문자열로 대체).

| # | 테스트 | 기대 결과 |
|---|--------|----------|
| 1 | collapsed=false → 원본 그대로 반환 | `result === items` (참조 동일) |
| 2 | collapsed=true, 단독 항목(children 없음) | `{ ...item, label: '' }`, tooltipTitle 원본 유지 |
| 3 | collapsed=true, 부모+자식 | 부모(`children:undefined, label:''`) + 자식(`label:''`) 순서대로 |
| 4 | collapsed=true, 결과 배열 순서 | 부모→자식1→자식2→다음부모→... 순서 |
| 5 | collapsed=true, COLLAPSED_TOOLTIP_OVERRIDES 적용 | override 키의 tooltipTitle이 map 값으로 교체 |
| 6 | collapsed=true, override 없는 자식 | tooltipTitle 원본 유지 |
| 7 | collapsed=true, 부모의 tooltipTitle | override 미적용 (부모는 map에 없으므로 원본 유지) |
| 8 | collapsed=true, 단독 항목의 동적 tooltipTitle 보존 | `search-results`의 `tooltipTitle`이 동적 원본 값(`검색 결과 (N개)`) 그대로 유지 (Gini R2 조건1) |
| 9 | 빈 배열 입력 | `[]` 반환 |
| 10 | children이 빈 배열인 부모 | 부모만 포함, 자식 없음 |
| 11 | 혼합: 단독 + 부모+자식 + 조건부 | 전체 순서와 값 정확 |
| 12 | 결과 배열 길이 = 단독 수 + 부모 수 + 자식 수 | 정확한 길이 |
| 13 | spread가 원본 객체를 변경하지 않음 | 원본 item의 children/label 미변경 |

### 3.4 L1: DOM 스냅샷 테스트 (12개)

**파일**: `CustomMenu.dom-snapshot.test.tsx`

렌더링 후 DOM에서 `[data-menu-key]` 요소를 수집하여 검증. **`toMatchSnapshot()` 사용하지 않음** — 명시적 `toEqual()` 기대값 사용 (스냅샷 갱신 위험 제거).

**타이머 처리**: 렌더링 후 `await act(async () => { vi.advanceTimersByTime(1200) })` 실행하여 Progressive Disclosure 완료 대기. React 18 배치 업데이트와의 호환을 위해 반드시 `async` 형태 사용. (대안: `vi.runAllTimersAsync()` — 동작 동등하나, `advanceTimersByTime(1200)`이 타이머 범위를 명시적으로 제어하므로 채택)

**vitest DEV mode 동작** (Gini R6 지적 반영):
- vitest 환경에서 `import.meta.env.DEV = true` → Progressive Disclosure useEffect의 5단계 setTimeout 모두 실행됨
- `vi.advanceTimersByTime(1200)` 후 `expandedKeys` 최종 상태: `['quick-actions', 'customers', 'contracts', 'documents', 'help']`
- `isDevMode=false`인 경우 `contracts` 키가 menuItems에 없으므로 expandedKeys에 포함되어도 렌더링 영향 없음 (무해)
- `console.log` 6건이 호출되므로 `vi.spyOn(console, 'log')` 억제 필수

| # | 테스트 | 기대 결과 |
|---|--------|----------|
| 1 | expanded: `data-menu-key` 순서 목록 | `['autoclicker', 'quick-actions', 'customers', 'documents', 'help']` (isDevMode=false) |
| 2 | expanded: 부모의 `aria-label` 값 | `{'quick-actions': '빠른 작업', 'customers': '고객', ...}` |
| 3 | expanded: 부모의 `aria-haspopup` 존재 | quick-actions, customers, documents, help에 `aria-haspopup="menu"` |
| 4 | expanded: sub-menu-container 내 자식 키 목록 | quick-actions→[doc-register, cust-register, contracts-import, batch-doc-upload] 등 |
| 5 | collapsed: `data-menu-key` 순서 목록 | `['autoclicker', 'quick-actions', 'documents-register', 'customers-register', ...]` 전체 flat 순서 |
| 6 | collapsed: 모든 항목의 `aria-label` 값 (리터럴) | `{'autoclicker': '메트 PDF 자동 받기', 'quick-actions': '빠른 작업', 'documents-register': '고객·계약·문서 등록', 'customers-register': '고객 수동등록', 'contracts-import': '엑셀 파일에서 고객 정보를 일괄 등록합니다', 'batch-document-upload': '폴더별로 정리된 문서를 고객에게 일괄 등록합니다', 'customers': '고객', 'customers-all': '모든 고객을 보여줍니다', 'customers-regional': '지역별로 고객을 분류하여 보여줍니다', 'customers-relationship': '가족 관계별로 고객을 분류하여 보여줍니다', 'documents': '문서', 'documents-explorer': '고객별로 문서를 모아 볼 수 있습니다', 'documents-search': '상세 문서검색', 'documents-library': '모든 문서를 보여줍니다', 'help': '도움말', 'help-notice': '공지사항', 'help-guide': '사용 가이드', 'help-faq': '자주 묻는 질문', 'help-inquiry': '1:1 문의'}` (isDevMode=false, noticeHasNew=false, inquiryUnreadCount=0 기준. 불일치 4건은 현재 collapsed 값 그대로) |
| 7 | collapsed: `.custom-menu-item-text` 요소 없음 | `{!collapsed && <span>}` 조건으로 span 자체가 렌더링되지 않으므로, `.custom-menu-item-text` 요소 개수 = 0 |
| 8 | collapsed: `aria-haspopup` 없음 | 어떤 항목에도 `aria-haspopup` 미존재 |
| 9 | isDevMode=true, expanded: contracts 부모+자식 존재 | contracts, contracts-all 키 존재, '계약' label |
| 10 | isDevMode=false: contracts 관련 키 미존재 | contracts, contracts-all 미존재 |
| 11 | expanded, noticeHasNew=true: help-notice badge 렌더링 | `.menu-item-badge--notice` 요소 존재, 텍스트 'N' (Alex R2 조건) |
| 12 | collapsed, noticeHasNew=true: help-notice의 aria-label 동적 변경 | `aria-label="공지사항 (새 글)"` (Code Reviewer R6 지적: collapsed 동적 tooltipTitle 검증) |

**기대값 하드코딩 원칙**: 모든 기대값은 테스트 코드에 리터럴로 명시. 동적 생성 금지.

### 3.5 getAllNavigableKeys 호환성 테스트 (4개)

**파일**: 기존 `navigationUtils.test.ts`에 추가

**입력 데이터 구성 원칙** (Gini R3 지적 반영):
- `navigationUtils.test.ts`는 CustomMenu에 의존하지 않아야 함 (단위 테스트 원칙)
- 테스트 파일 내에 `menuItemsSource`와 동등한 구조의 독립 mock 배열을 선언
- collapsed=true 케이스(#12, #15): `flattenForCollapsed(mockMenuItems, true)` 결과를 `getAllNavigableKeys`에 입력
- collapsed=false 케이스(#13, #14): `flattenForCollapsed(mockMenuItems, false)` = mockMenuItems 그대로 입력
- `getAllNavigableKeys(items, collapsed, expandedKeys)` 호출 시 `collapsed` 파라미터는 테스트 조건과 반드시 일치 (collapsed=true 케이스에서 `collapsed=true` 전달)
- 실제 CustomMenu.tsx의 메뉴 구조 변경 시 이 mock도 함께 업데이트 필요 (주석으로 명시)
- **Nav 기대값 도출 근거** (Gini R6 지적 반영): Section 2.2의 `menuItemsSource`는 의사 코드 수준이므로, Nav 기대값은 Phase 2에서 `menuItemsSource` 구현 완료 후 실제 코드의 항목 순서에서 도출한다. Phase 1에서는 현재 코드의 collapsed/expanded 출력을 기준으로 기대값을 검증하고, Phase 2 완료 후 기대값이 변경 없음을 확인한다.

| # | 조건 | 기대 반환 키 목록 (하드코딩) | 도출 근거 |
|---|------|---------------------------|----------|
| 12 | collapsed=true, isDevMode=false, hasSearchResults=false | `['autoclicker', 'quick-actions', 'documents-register', 'customers-register', 'contracts-import', 'batch-document-upload', 'customers', 'customers-all', 'customers-regional', 'customers-relationship', 'documents', 'documents-explorer', 'documents-search', 'documents-library', 'help', 'help-notice', 'help-guide', 'help-faq', 'help-inquiry']` | collapsed→모든 항목 flat, children:undefined→재귀 탐색 없음→전체 top-level key 순서대로 |
| 13 | expanded, expandedKeys=['quick-actions'], isDevMode=false | `['autoclicker', 'quick-actions', 'documents-register', 'customers-register', 'contracts-import', 'batch-document-upload', 'customers', 'documents', 'help']` | quick-actions만 expanded→자식4개 포함. customers/documents/help는 expandedKeys에 없으므로 자식 미포함 |
| 14 | expanded, expandedKeys=[], isDevMode=false | `['autoclicker', 'quick-actions', 'customers', 'documents', 'help']` | 모든 부모 닫힘→top-level만. 단독(autoclicker)+부모4개 |
| 15 | collapsed=true, isDevMode=true, hasSearchResults=false | `['autoclicker', 'quick-actions', 'documents-register', 'customers-register', 'contracts-import', 'batch-document-upload', 'customers', 'customers-all', 'customers-regional', 'customers-relationship', 'contracts', 'contracts-all', 'documents', 'documents-explorer', 'documents-search', 'documents-library', 'help', 'help-notice', 'help-guide', 'help-faq', 'help-inquiry']` | 12번 + contracts/contracts-all이 customers-relationship 뒤에 삽입 (isDevMode=true) |

### 3.6 L3: Playwright 시각적 회귀 테스트

```
절차:
1. 리팩토링 전: dev 서버 → expanded 스크린샷 → collapsed 스크린샷
   → D:\tmp\M7_before_expanded.png, D:\tmp\M7_before_collapsed.png
2. 리팩토링 후: dev 서버 → expanded 스크린샷 → collapsed 스크린샷
   → D:\tmp\M7_after_expanded.png, D:\tmp\M7_after_collapsed.png
3. 비교 기준: maxDiffPixels ≤ 50 (서브픽셀 안티앨리어싱, 커서 위치 등 허용)
4. 스크린샷 촬영 시점: 페이지 로드 후 1500ms 대기 (Progressive Disclosure 완료)
```

**0px이 아닌 이유** (Gini 지적 반영): 브라우저 서브픽셀 렌더링, 안티앨리어싱, 커서/포커스 상태 차이로 완전 동일은 비현실적. 50px 이내면 구조적 차이 없음으로 판단.

---

## 4. 실행 단계

### Phase 1: 기준 수집 + 테스트 작성

1. `menuUtils.ts` 파일 생성 (빈 파일, export만)
2. `__tests__/flattenForCollapsed.test.ts` 작성 (L2 13개)
3. `__tests__/CustomMenu.dom-snapshot.test.tsx` 작성 (L1 12개)
4. `navigationUtils.test.ts`에 호환성 케이스 4개 추가
5. **리팩토링 전 코드로 L1 테스트 ALL PASS 확인** (baseline)
   - L2는 `flattenForCollapsed` 함수가 아직 없으므로 Phase 2 이후 실행
6. L3: Playwright 스크린샷 before 캡처

### Phase 2: 순수 리팩토링 (커밋 A)

1. `menuUtils.ts`에 `flattenForCollapsed` + `COLLAPSED_TOOLTIP_OVERRIDES` 구현
2. `CustomMenu.tsx`: menuItems useMemo → menuItemsSource + menuItems 2단계 분리
3. 정본 데이터에서 `collapsed` 의존성 제거
4. useMemo 의존성 배열 정리 + eslint exhaustive-deps 확인

### Phase 3: 3중 검증

1. **L2**: `npx vitest run flattenForCollapsed` → 13개 ALL PASS
2. **L1**: `npx vitest run CustomMenu.dom-snapshot` → 12개 ALL PASS
3. **네비게이션**: `npx vitest run navigationUtils` → 기존 + 4개 ALL PASS
4. **빌드**: `npm run build` → 성공
5. **타입**: `npm run typecheck` → 성공
6. **전체**: `npx vitest run` → 기존 테스트 깨짐 없음
7. **L3**: Playwright 스크린샷 after 캡처 → before와 비교 (≤50px diff)

### Phase 4: Gini 검수

1. flattenForCollapsed 순수성, 타입 안전성
2. 29개(L2:13 + L1:12 + Nav:4) 테스트 커버리지
3. 엣지 케이스: isDevMode 전환, 동적 badge, 검색 결과 토글
4. ReactNode label(help-notice, help-inquiry) 보존 확인
5. 커밋 A 승인

### Phase 5: tooltipTitle 통일 (커밋 B)

1. `COLLAPSED_TOOLTIP_OVERRIDES` 상수 삭제 확인 (menuUtils.ts에서 완전 제거)
2. `flattenForCollapsed`에서 override 로직(`COLLAPSED_TOOLTIP_OVERRIDES[child.key] ??`) 삭제
3. 정본 데이터의 tooltipTitle을 collapsed 값(간결)으로 변경:
   - `documents-register`: `'고객·계약·문서 등록'`
   - `customers-register`: `'고객 수동등록'`
   - `documents-search`: `'상세 문서검색'`
   - `help-guide`: `'사용 가이드'`
4. L1 테스트 기대값 업데이트:
   - L1 #6: collapsed aria-label 중 불일치 4건의 값을 통일된 값으로 변경 (이미 collapsed 값이므로 실제로는 변경 없음)
   - L1 #2: expanded 부모의 aria-label — 변경 없음 (부모 tooltipTitle은 수정 대상 아님)
   - 참고: L1 #4(자식 키 목록)는 key만 검증하므로 tooltipTitle 변경에 영향 없음
5. ALL PASS 확인
6. Gini 검수 → 커밋 B

---

## 5. 리스크 및 롤백

### 5.1 리스크 (v2 리뷰 반영 재평가)

| 리스크 | 심각도 | 대응 | 비고 |
|--------|--------|------|------|
| ReactNode icon 참조 | **None** | spread는 참조 공유, 현재와 동일 | v2에서 Medium → 실제 위험 없음 |
| 항목 순서 변경 | High | L1 #5, L2 #4에서 순서 포함 검증 | |
| getAllNavigableKeys 비호환 | Medium | Nav #11~14에서 하드코딩 기대값으로 검증 | |
| Progressive Disclosure 비호환 | **None** | expandedKeys 로직은 menuItems와 독립적 | v2에서 Low → 실제 무관 |
| useMemo 의존성 누락 | High | eslint exhaustive-deps + L1 동적 props 테스트 | |
| setTimeout cleanup 미비 (기존 버그) | Low | 리팩토링 범위 외, vi.useFakeTimers()로 테스트 격리 | 별도 이슈 |
| L3 스크린샷 환경 차이 | Low | maxDiffPixels≤50, 동일 머신/브라우저, 1500ms 대기 | |

### 5.2 롤백 계획

- 커밋 전 `git stash`로 변경 보존
- L1/L2/L3/Nav 어느 하나라도 FAIL → `git checkout -- src/components/CustomMenu/`
- 2번 시도 실패 → git checkout 원복 후 재구현 (CLAUDE.md 규칙)
- **스냅샷 파일 없음**: `toMatchSnapshot()` 미사용, 모든 기대값이 리터럴이므로 스냅샷 롤백 문제 없음

### 5.3 100% 보증 체크리스트

커밋 A 승인 전 **모든 항목 PASS** 필수:

- [ ] L2 flattenForCollapsed 13개 ALL PASS
- [ ] L1 DOM 스냅샷 12개 ALL PASS
- [ ] Nav 호환성 4개 ALL PASS
- [ ] npm run build 성공
- [ ] npm run typecheck 성공
- [ ] npx vitest run 전체 기존 테스트 깨짐 없음
- [ ] L3 Playwright 스크린샷 diff ≤ 50px (expanded + collapsed)
- [ ] Gini 검수 PASS

---

## 6. v2 리뷰 이슈 해소 추적표

### CRITICAL (6건)

| ID | 이슈 | 발견자 | 해소 방법 | 상태 |
|----|------|--------|----------|------|
| C-1 | flattenForCollapsed가 부모도 push → 동작 변경? | Code Reviewer | **오진**: 현재 코드에서 부모는 collapsed에서도 항상 배열에 존재 (L428 확인). 변환 함수의 부모 push는 정확함. Section 1.1에 현행 구조 명시 | ✅ 해소 |
| C-2 | 테스트 #3 "키 집합 동일" 거짓 | Gini, Code Reviewer | **삭제**: expanded/collapsed의 top-level 키가 다르므로 이 테스트 제거. 대신 L1 #1(expanded 키 목록)과 L1 #5(collapsed 키 목록)으로 각각 검증 | ✅ 해소 |
| C-3 | setTimeout mock 전략 누락 | Gini, Code Reviewer | **추가**: Section 3.2에 `vi.useFakeTimers()` + `vi.advanceTimersByTime(1200)` + `vi.useRealTimers()` 명시. console.log 억제도 추가 | ✅ 해소 |
| C-4 | tooltipTitle 불일치 UX 혼란 | Sora | **커밋 B로 해소**: collapsed 값(간결)으로 통일. Section 4 Phase 5에 명시 | ✅ 해소 |
| C-5 | flattenForCollapsed 기대 동작 불완전 명세 | Gini | **추가**: Section 3.3에 L2 단위 테스트 12개 명세. 입출력 기대값 구체적으로 명시 | ✅ 해소 |
| C-6 | 단독 항목 label 처리 미명시 | Code Reviewer | **추가**: Section 2.2에 "정본에서 원래 값 유지, flattenForCollapsed에서 일괄 label:'' 변환" 명시 | ✅ 해소 |

### MAJOR (9건)

| ID | 이슈 | 발견자 | 해소 방법 | 상태 |
|----|------|--------|----------|------|
| M-1 | L2 #3 재귀 키 수집 필요 | Alex | **삭제**: 테스트 #3 자체를 제거하고 L1 #1/#5로 대체 | ✅ 해소 |
| M-2 | collapsedTooltipTitle → interface 오염 | Alex | **변경**: `COLLAPSED_TOOLTIP_OVERRIDES` 상수 Map 사용. MenuItem 타입 변경 없음 | ✅ 해소 |
| M-3 | useNavigation mock 반환 구조 미명시 | Gini | **추가**: Section 3.2에 onKeyDown, onWheel, currentIndex 등 전체 반환 구조 명시 | ✅ 해소 |
| M-4 | RecentCustomers mock 경로/영향 미분석 | Gini | **추가**: Section 3.2에 상대 경로(`'../RecentCustomers'`) mock 명시. `() => null`로 충분 (렌더링 차단) | ✅ 해소 |
| M-5 | L3 "0px" 비현실적 | Gini | **변경**: maxDiffPixels ≤ 50으로 수정. 이유 명시 | ✅ 해소 |
| M-6 | navigableKeys 기대값 미명시 | Gini | **추가**: Section 3.5에 4개 케이스 전체 키 목록 하드코딩 | ✅ 해소 |
| M-7 | isDevMode mock 교체 메커니즘 미명시 | Gini | **추가**: Section 3.2에 `mockDevMode.mockReturnValue()` 패턴 명시 | ✅ 해소 |
| M-8 | 롤백 시 스냅샷 처리 | Gini | **해소**: toMatchSnapshot() 미사용, 모든 기대값 리터럴. 스냅샷 파일 자체가 없음 | ✅ 해소 |
| M-9 | navigationUtils 타입 영향 | Code Reviewer | **해소**: MenuItem interface 변경 없으므로 영향 없음 | ✅ 해소 |
| M-10 | `import.meta.env.DEV` 환경에서 setTimeout 실행 + expandedKeys 최종 상태 미명시 | Gini R6 | **추가**: Section 3.4에 vitest DEV mode 동작, expandedKeys 최종 상태 `['quick-actions', 'customers', 'contracts', 'documents', 'help']` 명시 | ✅ 해소 |
| M-11 | `menuItemsSource` 의사 코드 수준 — Nav 기대값 도출 근거 불명확 | Gini R6 | **추가**: Section 3.5에 "Phase 2 구현 완료 후 실제 코드에서 도출" 원칙 명시 | ✅ 해소 |
| M-12 | collapsed + noticeHasNew=true 시 aria-label 검증 테스트 누락 | Code Reviewer R6 | **추가**: L1 #12 케이스 추가 (`aria-label="공지사항 (새 글)"` 검증) | ✅ 해소 |
| M-13 | `act(() => ...)` 동기 형태 → `await act(async () => ...)` 비동기 필요 | Code Reviewer R6 | **변경**: Section 3.4에 `await act(async () => ...)` 패턴으로 수정. React 18 배치 업데이트 호환 명시 | ✅ 해소 |

### MINOR (11건)

| ID | 이슈 | 해소 |
|----|------|------|
| collapsedTooltipTitle 부모 불필요 적용 | Map 방식으로 변경, 부모는 map에 없으므로 자동 미적용 |
| Progressive Disclosure에 contracts 불필요 포함 | 리팩토링 범위 외, 무해 (해당 키 없으면 무시됨) |
| 리스크 "Progressive Disclosure 비호환" → None | 리스크 표에서 None으로 수정 완료 |
| 테스트 #5 isDevMode 전제 미명시 | L1 #9/#10으로 분리하여 isDevMode 조건별 테스트 |
| ReactNode label #9 미커버 | L1 #4에서 sub-menu-container 내 자식 키로 간접 검증 |
| flattenForCollapsed 파일 위치 | menuUtils.ts로 분리 명시 |
| 스냅샷 --update 플래그 | toMatchSnapshot() 미사용으로 해소 |
| #12 expanded label '계약' 누락 | L1 #9에 isDevMode=true 케이스로 포함 |
| Tooltip mock TypeScript 호환 | Section 3.2에 구체적 mock 코드 명시 |
| console.log 테스트 노이즈 | Section 3.2에 vi.spyOn 억제 추가 |
| useEffect cleanup 기존 버그 | 리팩토링 범위 외 명시, 별도 이슈 |
| console.log spy 복원 코드 누락 | Section 3.2에 `beforeAll/afterAll` + `vi.restoreAllMocks()` 추가 (Gini R6) |
| Phase 5에 L1 #6 기대값 업데이트 미명시 | Phase 5 Step 4에 "L1 #6 collapsed aria-label 기대값도 변경" 추가 (Code Reviewer R6) |
| L1 querySelectorAll vs getByRole 혼용 | 사소함, 구현 시 주석으로 검증 방식 명시 (Gini R6) |
| contracts expandedKeys 동작 주석 없음 | isDevMode=false에서 contracts가 expandedKeys에 있어도 무해 — 테스트 주석으로 명시 (Gini R6) |
| L1 #6 aria-label 기대값 리터럴 미명시 | 19개 항목의 key:tooltipTitle 쌍을 L1 #6에 완전 열거 (Code Reviewer R7) |
| Tooltip mock `__esModule: true` 불필요 | vitest에서 불필요한 `__esModule: true` 제거 (Gini R7) |
| `vi.restoreAllMocks()` 범위 충돌 가능성 | `consoleLogSpy.mockRestore()`로 특정 spy만 복원하도록 변경 (Code Reviewer R7) |
| `vi.advanceTimersByTime` vs `vi.runAllTimersAsync` | 타이머 범위 명시적 제어를 위해 `advanceTimersByTime(1200)` 채택, 대안 주석 추가 (Gini R7) |
| Phase 5 Step 4 업데이트 대상 불명확 | L1 #6, #2, #4 각각의 영향 범위 구체적 명시 (Code Reviewer R7) |

---

## 진행 결과 로그

| 단계 | 상태 | 비고 |
|------|------|------|
| 계획 v1 | ✅ 완료 | 2026-03-11 |
| 계획 v2 (100% 보증) | ✅ 완료 | 2026-03-11 |
| 에이전트 리뷰 R1 | ✅ 완료 | Alex: COND PASS, Gini: FAIL, Sora: COND PASS, Code: COND PASS |
| 계획 v3 (리뷰 반영) | ✅ 완료 | CRITICAL 6건 + MAJOR 9건 + MINOR 11건 해소 |
| 에이전트 리뷰 R2 | ✅ 완료 | Alex: COND, Gini: COND, Sora: PASS, Code: COND |
| v3.1 수정 (R2 조건 5건) | ✅ 완료 | L2#8, L1#11, Nav 주석, 순환 의존, Phase5 체크 |
| 에이전트 리뷰 R3 | ✅ 완료 | Alex: PASS, Gini: FAIL(Major 1), Code: PASS, Sora: 불필요 |
| v3.2 수정 (R3 Gini Major) | ✅ 완료 | Nav 입력 데이터 구성 원칙 추가 + L2 수 표기 정정 |
| 에이전트 리뷰 R4 | ✅ 완료 | Gini: PASS (전원 PASS 달성) |
| 에이전트 리뷰 R5 | ✅ 완료 | Alex: PASS, Gini: PASS, Sora: PASS, Code: PASS — 만장일치 |
| v3.3 수정 (R5 Minor) | ✅ 완료 | L1 "10개"→"11개" 오타, L1#7 span 미렌더링 명시, Nav collapsed 파라미터 명시 |
| 에이전트 리뷰 R6 | ✅ 완료 | Alex: COND, Gini: COND(Major 2), Sora: PASS, Code: COND(Major 2) |
| v3.4 수정 (R6 Major 4건) | ✅ 완료 | DEV mode expandedKeys 명시, Nav 기대값 도출 근거, L1#12 collapsed badge 추가, async act 패턴, console.log 복원 |
| 에이전트 리뷰 R7 | ✅ 완료 | Alex: PASS, Gini: PASS, Sora: PASS, Code: COND(Minor 3) — 만장일치 PASS |
| v3.5 수정 (R7 Minor 5건) | ✅ 완료 | L1#6 리터럴 열거, __esModule 제거, spy 복원 범위, timer 대안 주석, Phase5 대상 명확화 |
| Phase 1: 기준 수집 | ⬜ 대기 | |
| Phase 2: 순수 리팩토링 (커밋 A) | ⬜ 대기 | |
| Phase 3: 3중 검증 | ⬜ 대기 | |
| Phase 4: Gini 검수 | ⬜ 대기 | |
| Phase 5: tooltipTitle 통일 (커밋 B) | ⬜ 대기 | |
