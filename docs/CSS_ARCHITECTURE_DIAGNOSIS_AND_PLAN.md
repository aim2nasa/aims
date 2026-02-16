# AIMS CSS/UI 구조 진단 및 개선 계획

> 작성일: 2026-02-16
> 분석 범위: 156개 CSS 파일, 75,262줄, git 최근 100개 커밋

## Context

AIMS 프론트엔드는 156개 CSS 파일, 75,262줄의 CSS로 구성되어 있다. UI 개선 작업마다 동일한 유형의 버그가 반복 발생하고 있으며 (git 이력상 최근 100개 커밋 중 60%가 CSS/UI fix), 이는 단순 실수가 아닌 **CSS 아키텍처의 구조적 결함**에서 비롯된다.

이 문서는 (1) 문제의 본질 진단 보고서와 (2) 단계별 개선 계획안을 포함한다.

---

# Part 1: 문제 진단 보고서

## 1. 핵심 문제: "수정해도 안 바뀌는" CSS

### 1-1. 부모 뷰의 자식 컴포넌트 CSS 강제 오버라이드

**AIMS에서 반복되는 가장 치명적인 구조적 결함.**

```css
/* [컴포넌트 CSS] (낮은 specificity) */
.customer-review-table-header {
  grid-template-columns: 7칼럼;     /* ← 이것은 무시됨 */
}

/* [부모 뷰 CSS] (높은 specificity) */
.customer-full-detail__section-content--report .customer-review-table-header {
  grid-template-columns: 6칼럼;     /* ← 이것이 실제 적용 */
}
```

- **동일 버그 2회 발생**: c273d276 (2026-02-07), 634648c5 (2026-02-14)
- **증상**: 칼럼 추가 후 마지막 칼럼이 2줄로 밀림
- **원인**: 컴포넌트 CSS만 수정하고 부모 뷰 CSS의 오버라이드를 수정하지 않음
- **영향 범위**: CustomerFullDetailView.css(2,943줄)가 내부 탭 컴포넌트 10개 이상의 스타일을 덮어씀

**왜 이 구조가 존재하는가?**

부모 뷰에서 자식 컴포넌트를 "컨텍스트에 맞게" 미세 조정하려다 생긴 패턴이다. 예를 들어 같은 테이블이 모달에서 사용될 때와 상세뷰에서 사용될 때 간격/높이가 달라야 하므로 부모에서 override한다. 그러나 이것이 **grid-template-columns 같은 핵심 레이아웃 속성까지 override**하면서 문제가 된다.

### 1-2. grid-template-columns의 다중 정의 (Single Source of Truth 부재)

하나의 테이블에 대해 grid-template-columns가 **최대 4곳**에서 정의된다:

```
1. .table-header { ... }                              ← 기본
2. .table-header:has(.checkbox) { ... }                ← 체크박스 있을 때
3. .parent-view .table-header { ... }                  ← 부모 뷰 오버라이드
4. .parent-view .table-header:has(.checkbox) { ... }   ← 부모 뷰 + 체크박스
```

칼럼 1개 추가 = 4곳 동시 수정 필요. 1곳이라도 빠지면 레이아웃 깨짐.

### 1-3. flex-wrap의 비결정적(Non-deterministic) 렌더링

```
[동일 컴포넌트 InitialFilterBar]
├── 전체 고객보기: 2줄 (10개/줄) ✅
├── 관계별 고객보기: 3줄 (8~9개/줄) ❌
└── 원인: 부모 DOM 깊이, scrollbar 유무, padding 차이 → 가용 너비 변동
```

- **커밋**: 89b61961 (2026-02-16)
- flex-wrap: wrap은 "남은 공간에 들어갈 만큼 배치"하므로 **부모 컨테이너의 미세한 너비 차이**에 따라 줄 수가 달라진다.

---

## 2. 구조적 원인: 왜 이런 문제가 반복되는가?

### 2-1. CSS Modules 미사용 (전역 BEM만으로 스코핑)

- CSS Modules: **0개** (`.module.css` 파일 없음)
- 모든 CSS가 전역 스코프 → BEM 네이밍만으로 충돌 방지에 의존
- BEM은 네이밍 충돌은 방지하지만, **specificity 충돌은 방지하지 못함**
- 부모 `.parent .child { }` 패턴이 자유롭게 사용 가능 → 오버라이드 지뢰밭

### 2-2. 거대 CSS 파일 (God Object 안티패턴)

| 파일 | 줄 수 | 역할 | git 수정 횟수 |
|------|-------|------|-------------|
| CustomerFullDetailView.css | **2,943** | 고객 상세뷰 + 내부 10개 탭 오버라이드 | **58회** |
| ExcelRefiner.css | 2,764 | 엑셀 정제 전체 | 66회 |
| DocumentSearchView.css | 2,496 | 문서 검색 전체 | 80회 |
| ChatPanel.css | 2,046 | AI 채팅 패널 (161개 하드코딩 색상) | - |
| AccountSettingsView.css | 1,944 | 계정 설정 | - |

- 하나의 파일이 너무 많은 자식 컴포넌트를 제어 → 수정 영향 범위 예측 불가

### 2-3. !important 103건 (specificity 전쟁의 흔적)

| 파일 | 건수 | 원인 |
|------|------|------|
| DocumentStatusList.css | ~15 | 부모 오버라이드를 다시 되돌리려는 시도 |
| AccountSettingsView.css | ~12 | 테마 강제 |
| AnnualReportModal.css | ~10 | 모달 z-index/상태 |
| 탭 CSS 파일들 (4개) | 각 ~8 | 부모 뷰 오버라이드 대항 |

- !important는 대부분 **"부모가 덮어쓴 스타일을 자식에서 되돌리려고"** 사용
- specificity 전쟁의 전형적 증상

### 2-4. 하드코딩 색상 862건 (tokens/theme 외)

| 파일 | 하드코딩 건수 |
|------|-------------|
| ChatPanel.css | 161 |
| CustomerRelationshipView.css | 52 |
| components.css (공용) | 40 |
| DocumentSearchView.css | 39 |
| 기타 | ~570 |

- 다크 테마 전환 시 이 862곳은 수동 대응 필요
- var(--color-*) 사용률은 높지만(11,677건), 하드코딩이 혼재

### 2-5. SKILL.md와 실제 구조의 불일치

- SKILL.md: "`src/styles/variables.css`에서만 색상 변수 정의"
- 실제: `src/styles/variables.css` **파일 없음** → `src/shared/design/tokens.css` + `theme.css`에 분산
- 개발 가이드와 실제 코드가 다르면 규칙 준수가 어려움

---

## 3. Git 이력이 보여주는 패턴

### 3-1. 커밋 유형 분포 (최근 100개)

```
CSS/UI fix     ██████████████████████████████████████████████████████████████ 60%
기능 추가(feat) █████████████████████████ 25%
리팩토링       ██████████ 10%
문서           █████ 5%
```

**UI fix가 전체의 60%를 차지** → 기능 개발 시간의 상당 부분이 CSS 수정에 소비됨

### 3-2. 반복 수정 파일 TOP 5

| 파일 | 수정 횟수 | 의미 |
|------|----------|------|
| tokens.css | 87 | 디자인 토큰 변경 빈번 (정상) |
| DocumentSearchView.css | 80 | 모바일 대응 반복 수정 |
| DocumentStatusList.css | 66 | 반응형 버그 반복 |
| ExcelRefiner.css | 66 | 칼럼/레이아웃 반복 |
| **CustomerFullDetailView.css** | **58** | **오버라이드 버그 진원지** |

### 3-3. 동일 버그의 반복 발생 사례

#### 변액리포트 테이블 "칼럼 밀림" 버그 (2회)

| 발생 | 커밋 | 증상 | 원인 |
|------|------|------|------|
| 1차 | c273d276 (2026-02-07) | 5→6칼럼 변경 후 상태 칼럼 2줄 | CustomerFullDetailView.css 미수정 |
| 2차 | 634648c5 (2026-02-14) | 6→7칼럼 변경 후 상태 칼럼 2줄 | 동일 원인 반복 |

#### 초성 필터 버튼 줄 수 불일치

| 발생 | 커밋 | 증상 | 원인 |
|------|------|------|------|
| 1차 | 89b61961 (2026-02-16) | 관계별 고객보기에서만 3줄 | flex-wrap의 가용 너비 의존성 |

### 3-4. 모바일 반응형 커밋 폭발 (2026-02 중순)

- 2주간 35개 이상의 모바일/반응형 fix 커밋 집중
- 증상: 가로 모드 전환, 화면 크기별 레이아웃 깨짐
- 원인: 초기 설계에서 모바일 고려 부족 → 사후 대응 비용 폭발

---

## 4. 잘 되어 있는 점 (긍정적 평가)

| 항목 | 점수 | 평가 |
|------|------|------|
| 디자인 토큰 시스템 (3-Level) | 9/10 | tokens.css → theme.css → component 구조 우수 |
| BEM 네이밍 일관성 | 9/10 | 클래스명 충돌 최소화 |
| CSS 변수 사용률 | 8/10 | 11,677건 var() 호출 (높은 비율) |
| 라이트/다크 테마 지원 | 8/10 | theme.css 분리 |
| 글로벌 태그 셀렉터 최소화 | 9/10 | index.css에만 3개 |

---

## 5. 문제의 본질 한 문장 요약

> **"컴포넌트 CSS의 독립성이 보장되지 않아, 부모 뷰가 자식 스타일을 임의로 덮어쓸 수 있고, 이를 추적할 수단이 없다."**

이것이 다음을 연쇄적으로 야기한다:

```
1. 컴포넌트 수정이 화면에 반영되지 않음 → 혼란
    ↓
2. 4곳 동시 수정 같은 암묵적 규칙 발생 → 누락 시 버그
    ↓
3. !important로 대항 → specificity 전쟁 → 더 복잡한 오버라이드
    ↓
4. 거대 파일에 모든 오버라이드 집중 → 수정 영향 예측 불가
    ↓
5. UI 수정 커밋이 전체의 60% → 기능 개발 생산성 저하
```

---

# Part 2: 단계별 개선 계획

## 전략: 점진적 CSS Modules 마이그레이션

**왜 CSS Modules인가?**

| 대안 | 장점 | 단점 (AIMS에서) |
|------|------|-----------------|
| **Tailwind** | 유틸리티 클래스, JSX에서 바로 확인 | 75K줄 전면 교체 필요, 마이그레이션 비용 과대 |
| **CSS-in-JS** | 완전한 스코핑, 동적 스타일 | 런타임 성능 오버헤드, 기존 패턴과 괴리 |
| **CSS Modules** | Vite 네이티브 지원, 스코핑 | 점진적 적용 가능, 파일명만 변경 |

CSS Modules를 선택한 이유:
- 기존 CSS를 **파일명만 `.module.css`로 변경**하여 점진적 적용 가능
- 스코핑으로 부모-자식 오버라이드 문제 **원천 차단**
- Vite가 빌드 시 자동으로 클래스명 해시 → 전역 충돌 불가

---

### Phase 0: 즉시 실행 - 현재 구조에서의 긴급 안정화 (1일)

**목적**: CSS Modules 전환 전, 지금 당장의 반복 버그를 방지하는 최소 조치

#### 0-1. grid-template-columns를 CSS 변수로 Single Source 만들기

현재 (문제):
```css
/* CustomerReviewTab.css */
.customer-review-table-header {
  grid-template-columns: minmax(50px,0.5fr) minmax(50px,0.5fr) 104px 163px minmax(80px,1fr) 72px 65px;
}

/* CustomerFullDetailView.css - 별도 정의로 덮어씀 */
.customer-full-detail__section-content--report .customer-review-table-header {
  grid-template-columns: ... 다른 값 ...;
}
```

개선 (Single Source):
```css
/* CustomerReviewTab.css - 유일한 칼럼 정의 */
.customer-review-table-header {
  --grid-cols: minmax(50px,0.5fr) minmax(50px,0.5fr) 104px 163px minmax(80px,1fr) 72px 65px;
  --grid-cols-checkbox: 28px var(--grid-cols);
  grid-template-columns: var(--grid-cols);
}
.customer-review-table-header:has(.header-checkbox) {
  grid-template-columns: var(--grid-cols-checkbox);
}

/* CustomerFullDetailView.css - grid-template-columns 오버라이드 삭제 */
.customer-full-detail__section-content--report .customer-review-table-header {
  gap: 6px;           /* 레이아웃 미세조정만 유지 */
  padding: 0 10px;
  /* grid-template-columns: 삭제 → 컴포넌트의 변수를 자동 상속 */
}
```

**효과**: 칼럼 추가 시 컴포넌트 CSS **1곳만 수정** (4곳 → 1곳)

#### 0-2. 모든 테이블 컴포넌트에 동일 패턴 적용

대상:
- `features/customer/views/CustomerDetailView/tabs/ContractsTab.css`
- `features/customer/views/CustomerDetailView/tabs/CustomerReviewTab.css`
- `features/customer/views/CustomerDetailView/tabs/AnnualReportTab.css`
- `features/customer/views/CustomerDetailView/tabs/DocumentsTab.css`
- 기타 grid-template-columns를 사용하는 테이블

#### 0-3. flex-wrap → CSS Grid 전환 감사

칼럼 수가 고정인 모든 flex-wrap 사용처를 `grid-template-columns: repeat(N, 1fr)`로 교체

---

### Phase 1: CSS 구조 감사 및 문서화 (2~3일)

#### 1-1. 부모-자식 오버라이드 전수 조사

모든 부모 뷰 CSS에서 자식 컴포넌트 클래스를 오버라이드하는 패턴을 조사하여 표로 정리:

| 부모 CSS 파일 | 오버라이드 대상 | 오버라이드 속성 | 필요 여부 |
|---|---|---|---|

#### 1-2. !important 103건 전수 조사 및 제거 계획

각 건에 대해:
- 왜 필요했는지 (어떤 specificity와 충돌?)
- 부모 오버라이드 제거로 해소 가능한지
- CSS 변수로 대체 가능한지

#### 1-3. 하드코딩 색상 862건 → CSS 변수 매핑표 작성

#### 1-4. CSS 규칙 문서 현행화

- `.claude/skills/css-rules/SKILL.md`의 variables.css 경로를 실제 구조와 동기화
- 부모-자식 오버라이드 금지 규칙 명문화

---

### Phase 2: 거대 CSS 파일 분할 (3~5일)

**대상**: 1,500줄 이상 CSS 파일 5개

#### 2-1. CustomerFullDetailView.css (2,943줄) 분할

```
현재:
  CustomerFullDetailView.css (2,943줄 - 모든 탭 오버라이드 포함)

분할 후:
  CustomerFullDetailView.css (~800줄 - 뷰 자체 레이아웃만)
  ├── 헤더, 네비게이션, 섹션 컨테이너
  └── 자식 컴포넌트 오버라이드 전면 삭제
```

#### 2-2. 기타 거대 파일 분할

| 파일 | 현재 | 목표 | 방법 |
|------|------|------|------|
| ExcelRefiner.css (2,764) | 1파일 | 3~4파일 | 섹션별 분리 (테이블/폼/프리뷰/모달) |
| DocumentSearchView.css (2,496) | 1파일 | 3파일 | 검색바/결과목록/필터 분리 |
| ChatPanel.css (2,046) | 1파일 | 3파일 | 입력영역/메시지목록/도구패널 분리 |
| AccountSettingsView.css (1,944) | 1파일 | 3파일 | 탭별 분리 |

---

### Phase 3: CSS Modules 점진적 도입 (1~2주)

#### 3-1. 파일럿: 가장 문제가 많았던 컴포넌트부터

**1순위**: CustomerReviewTab (변액리포트 테이블 - 2회 버그 발생)

변환 절차:
1. `CustomerReviewTab.css` → `CustomerReviewTab.module.css` 파일명 변경
2. TSX에서 `import styles from './CustomerReviewTab.module.css'`
3. `className="customer-review-table-header"` → `className={styles.tableHeader}`
4. **CustomerFullDetailView.css에서 해당 오버라이드 코드 삭제** (전역 클래스가 아니므로 매칭 불가)
5. 필요한 컨텍스트 미세조정은 CSS 변수나 props로 전달

**이 단계가 성공하면 "부모 뷰 오버라이드" 문제가 구조적으로 불가능해진다.**

#### 3-2. 확산 순서

```
Phase 3-1: 탭 컴포넌트 (5개)
  CustomerReviewTab, ContractsTab, AnnualReportTab, DocumentsTab, FamilyContractsTab

Phase 3-2: 테이블/리스트 컴포넌트
  DocumentStatusList, FileList

Phase 3-3: 뷰 컴포넌트
  DocumentSearchView, AllCustomersView, ...
```

#### 3-3. 전역 CSS로 유지할 파일 (변환하지 않음)

```
shared/design/tokens.css       ← 디자인 토큰 (전역 필수)
shared/design/theme.css        ← 테마 변수 (전역 필수)
shared/styles/layout.css       ← 3-pane 레이아웃 (전역 필수)
shared/styles/typography.css   ← 타이포그래피 기본 (전역 필수)
shared/styles/utilities.css    ← 유틸리티 클래스 (전역 필수)
index.css                      ← 리셋/초기화 (전역 필수)
```

---

### Phase 4: 자동화 방어선 구축 (2~3일)

#### 4-1. Stylelint 도입

```json
{
  "rules": {
    "color-no-hex": true,
    "declaration-no-important": true,
    "selector-max-compound-selectors": 3,
    "font-weight-notation": "numeric",
    "selector-no-qualifying-type": true
  }
}
```

#### 4-2. CI 빌드 시 CSS 검증

```json
{
  "scripts": {
    "lint:css": "stylelint 'src/**/*.css'",
    "prebuild": "npm run lint:css"
  }
}
```

#### 4-3. 부모 오버라이드 탐지 스크립트

같은 클래스명에 대한 grid-template-columns가 2개 이상 정의되면 경고

---

### Phase 5: 하드코딩 색상 정리 (1주)

#### 5-1. ChatPanel.css (161건) 우선 정리

#### 5-2. 나머지 700건 점진적 정리 (1일 1파일)

---

## 실행 우선순위 요약

| 순위 | Phase | 소요 | 효과 | 위험도 |
|------|-------|------|------|--------|
| **1** | Phase 0 (CSS 변수로 Single Source) | 1일 | **칼럼 버그 원천 차단** | 낮음 |
| **2** | Phase 1 (감사 및 문서화) | 2~3일 | 현황 파악, 규칙 현행화 | 없음 |
| **3** | Phase 2 (거대 파일 분할) | 3~5일 | 유지보수성 대폭 향상 | 중간 |
| **4** | Phase 3 (CSS Modules 도입) | 1~2주 | **근본적 해결** | 중간 |
| **5** | Phase 4 (자동화 방어선) | 2~3일 | 재발 방지 | 낮음 |
| **6** | Phase 5 (하드코딩 정리) | 1주 | 다크테마 완성도 | 낮음 |

---

## 검증 방법

각 Phase 완료 후:
1. `npm run build` 성공 확인
2. `npm run typecheck` 성공 확인
3. 주요 화면 육안 검증 (고객 상세뷰, 문서 검색, 변액리포트 탭, AI 채팅)
4. 브라우저 DevTools Computed 탭에서 의도하지 않은 스타일 상속 확인
5. 라이트/다크 테마 전환 확인

---

## 수정 대상 핵심 파일

| 파일 | 이유 |
|------|------|
| `features/customer/views/CustomerFullDetailView/CustomerFullDetailView.css` | 2,943줄, 오버라이드 진원지 |
| `features/customer/views/CustomerDetailView/tabs/CustomerReviewTab.css` | 2회 버그 발생 |
| `features/customer/views/CustomerDetailView/tabs/ContractsTab.css` | 테이블 칼럼 |
| `features/customer/views/CustomerDetailView/tabs/AnnualReportTab.css` | 테이블 칼럼 |
| `components/ChatPanel/ChatPanel.css` | 161건 하드코딩 |
| `components/DocumentViews/DocumentSearchView/DocumentSearchView.css` | 80회 수정 |
| `.claude/skills/css-rules/SKILL.md` | 경로 현행화 필요 |
| `shared/design/tokens.css`, `shared/design/theme.css` | 변수 정의 중앙화 |
