# 설계서: 페이지네이션 UX 개선

**일자:** 2026-03-28
**영역:** 프론트엔드 (공용 Pagination 컴포넌트)
**제안:** Dana (UX Designer)

---

## 1. 현재 문제

### 1-1. 260페이지 탐색 불가능

현재 페이지네이션: `[드롭다운] ... [<] 1 / 260 [>]`

- 이전(`<`), 다음(`>`) 두 버튼만 존재
- 130페이지로 이동하려면 129번 클릭 필요 — 사실상 사용 불가
- 처음/마지막 이동 수단 없음
- 직접 페이지 번호 입력 불가

### 1-2. 10개 화면에서 동일 코드 복붙

페이지네이션이 각 컴포넌트에 인라인으로 구현되어 있음:

| 화면 | 파일 |
|------|------|
| 전체 문서 보기 | `DocumentLibraryView.tsx` |
| 문서 현황 | `DocumentStatusTable.tsx` |
| 전체 고객 | `AllCustomersView.tsx` |
| 전체 계약 | `ContractAllView.tsx` |
| 고객 문서 탭 | `DocumentsTab.tsx` |
| 고객 계약 탭 | `ContractsTab.tsx` |
| AR 탭 | `AnnualReportTab.tsx` |
| CRS 탭 | `CustomerReviewTab.tsx` |
| AR 배치 모달 | `ArFileTable.tsx` |
| CRS 배치 모달 | `CrFileTable.tsx` |

공용 CSS(`shared/ui/Pagination/Pagination.css`)만 제공, 컴포넌트 없음.

---

## 2. 개선 설계

### 2-1. 레이아웃

```
[드롭다운]     « ‹  [ 1 ] / 260  › »
```

| 요소 | 기호 | 기능 | aria-label |
|------|------|------|------------|
| 처음으로 | `«` (U+00AB) | 1페이지로 이동 | "첫 페이지" |
| 이전 | `‹` (U+2039) | 이전 페이지 (현재와 동일) | "이전 페이지" |
| 페이지 번호 | `1` | 클릭 → input 전환, 직접 입력 | "페이지 번호 입력" |
| 구분자 + 총 페이지 | `/ 260` | 읽기 전용 | - |
| 다음 | `›` (U+203A) | 다음 페이지 (현재와 동일) | "다음 페이지" |
| 마지막으로 | `»` (U+00BB) | 마지막 페이지로 이동 | "마지막 페이지" |

### 2-2. 페이지 번호 직접 입력 (Progressive Disclosure)

macOS Finder "폴더로 이동", PDF 뷰어 페이지 입력과 동일한 멘탈 모델.

**기본 상태:**
- 숫자는 텍스트로 보임 (현재와 동일한 외관)
- 호버 시 커서 `text` + 미세한 배경색 변화로 "클릭 가능" 암시

**편집 상태:**
1. 숫자 클릭 → input 필드로 전환 (inline editing)
2. 기존 숫자가 선택된 상태로 표시
3. 원하는 페이지 번호 입력
4. Enter 또는 blur → 해당 페이지로 이동
5. 범위 밖 숫자 → 가장 가까운 유효 값으로 clamping (예: 300 입력 → 260)
6. ESC → 편집 취소, 원래 값 복원

### 2-3. 버튼 비활성화 규칙

| 현재 페이지 | `«` | `‹` | `›` | `»` |
|------------|-----|-----|-----|-----|
| 1 (첫 페이지) | disabled | disabled | enabled | enabled |
| 2~259 (중간) | enabled | enabled | enabled | enabled |
| 260 (마지막) | enabled | enabled | disabled | disabled |

### 2-4. 키보드 단축키

| 단축키 | 기능 | 근거 |
|--------|------|------|
| `←` (Left Arrow) | 이전 페이지 | 직관적 방향 매핑 |
| `→` (Right Arrow) | 다음 페이지 | 직관적 방향 매핑 |
| `Home` | 첫 페이지 | OS 표준 |
| `End` | 마지막 페이지 | OS 표준 |

**가드 조건:** `document.activeElement`가 `INPUT`, `TEXTAREA`, `SELECT`일 때는 단축키 비활성화.

---

## 3. 공용 Pagination 컴포넌트

### 3-1. 컴포넌트 추출

`shared/ui/Pagination/Pagination.tsx` 생성.

```typescript
interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  variant?: 'default' | 'compact'  // compact: 처음/마지막 버튼 생략
}
```

### 3-2. Compact 모드

고객 상세 탭(RightPane)은 공간이 제한적이고 totalPages가 보통 10 이하.

- `variant="compact"`: 처음/마지막 버튼 생략, 페이지 번호 클릭 입력은 유지
- `variant="default"` (기본값): 전체 버튼 표시

### 3-3. 10개 화면 통합

모든 화면에서 인라인 페이지네이션 JSX를 `<Pagination />` 컴포넌트로 교체.

---

## 4. CSS 추가 사항

기존 `Pagination.css`에 최소한 추가:

```css
/* 페이지 번호 클릭 가능 상태 */
.pagination-current--editable {
  cursor: text;
  border-radius: 4px;
  padding: 0 var(--spacing-1);
  transition: background-color 0.15s ease;
}

.pagination-current--editable:hover {
  background-color: var(--color-bg-tertiary);
}

/* 페이지 번호 입력 모드 */
.pagination-input {
  width: 40px;
  text-align: center;
  font-size: inherit;
  font-weight: 600;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-primary-400);
  border-radius: 4px;
  padding: 0 var(--spacing-1);
  outline: none;
}
```

처음/마지막 버튼은 기존 `.pagination-button` 스타일 재사용.

---

## 5. 구현 우선순위

| 순위 | 항목 | 심각도 |
|------|------|--------|
| 1 | 공용 Pagination 컴포넌트 추출 + 처음/마지막 버튼 | Critical |
| 2 | 페이지 번호 클릭-입력 기능 | Major |
| 3 | 키보드 단축키 (←/→/Home/End) | Minor |
| 4 | 10개 화면 컴포넌트 교체 | 1번과 동시 진행 |

1번과 2번은 같이 진행 권장 — 컴포넌트 추출하면서 동시에 기능 추가.

---

## 6. 영향 범위

| 대상 | 영향 |
|------|------|
| 기존 페이지네이션 UX | 개선 — 4버튼 + 직접 입력 |
| 10개 화면 | 공용 컴포넌트로 통합 (코드 중복 제거) |
| 향후 유지보수 | 한 곳 수정으로 전체 반영 |
| 모바일/반응형 | compact 모드로 대응 |
