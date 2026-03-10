# 검색 UX 전수 개선 작업

> 작업일: 2026-03-11
> 상태: **Phase 1 준비 중 — 새 세션에서 시작 예정**

---

## 배경

고객별 문서함(DocumentExplorerView)에서 검색창이 있지만 백엔드가 `search` 파라미터를 무시하는 심각한 UX 버그를 발견·수정함 (커밋 `18757781`).

동일 패턴의 UX 문제가 다른 검색 기능에도 있는지 전수 조사한 결과:
- **백엔드 search 무시 버그**: DocumentExplorerView 외에는 없음 (모두 정상 처리)
- **프론트엔드 UX 이슈**: 7건 MAJOR, 3건 MINOR 발견

---

## 발견된 이슈 목록

| # | 심각도 | 이슈 | 해당 뷰 | 상태 |
|---|--------|------|---------|------|
| 1 | MAJOR | 검색어 하이라이트 미구현 | QuickSearch | ⬜ TODO |
| 2 | MAJOR | 검색어 하이라이트 미구현 | DocumentLibraryView | ⬜ TODO |
| 3 | MAJOR | 검색어 하이라이트 미구현 | PersonalFilesView | ⬜ TODO |
| 4 | MAJOR | 검색어 하이라이트 미구현 | AllCustomersView | ⬜ TODO |
| 5 | MAJOR | 검색어 하이라이트 미구현 | ContractAllView | ⬜ TODO |
| 6 | MAJOR | 빈 결과 메시지 부적절 ("문서가 없습니다" → 검색 맥락 필요) | DocumentLibraryView | ⬜ TODO |
| 7 | MAJOR | 빈 결과 메시지 부적절 | PersonalFilesView | ⬜ TODO |
| 8 | MAJOR | 검색 초기화 불완전 (X 버튼 없음 + 빈 검색어 시 미복귀) | PersonalFilesView | ⬜ TODO |
| 9 | MAJOR | placeholder 거짓 약속 ("고객, 문서 검색..." → 실제 고객만) | QuickSearch | ⬜ TODO |
| 10 | MAJOR | 검색 범위 불명확 ("파일 검색" → 어떤 필드?) | PersonalFilesView | ⬜ TODO |
| 11 | MINOR | 빈 결과 메시지 맥락 부족 | ContractAllView | ⬜ TODO |
| 12 | MINOR | 빈 결과 메시지 맥락 부족 | RelationshipView | ⬜ TODO |
| 13 | MINOR | 검색 대상 필드 안내 부족 | AllCustomersView | ⬜ TODO |

---

## 정상 확인된 검색 기능 (수정 불필요)

| 뷰 | 하이라이트 | 빈 결과 | 초기화 | placeholder | 판정 |
|----|-----------|---------|--------|-------------|------|
| DocumentExplorerView | ✅ highlightText | ✅ | ✅ X버튼 | ✅ 모드별 | PASS (이번 세션에서 수정 완료) |
| DocumentSearchView | ✅ highlightKeywords | ✅ 가이드 포함 | ✅ 리셋 버튼 | ✅ | PASS (검색 전용, 완성도 높음) |
| RelationshipView | ✅ highlightSearchQuery | ⚠ MINOR | ✅ X버튼 | ✅ "고객 이름 검색..." | PASS (Minor만) |

---

## 에이전트 배분 계획

### Phase 1: 공통 기반 (순차, 직접 수행)
- [ ] 공통 `highlightText` 유틸리티를 `shared/lib/highlightText.tsx`로 추출
- 소스: DocumentExplorerView의 기존 `highlightText` 함수
- DocumentExplorerView는 추출된 유틸리티를 import하도록 변경
- escapeRegex 처리 필수
- query가 빈 문자열이면 원본 text 그대로 반환

### Phase 2: 병렬 구현 (Alex × 3)

**Alex A — QuickSearch**
- [ ] placeholder 수정 ("고객, 문서 검색..." → "고객 검색...")  [이슈 #9]
- [ ] 검색어 하이라이트 적용 (공통 유틸리티 사용) [이슈 #1]

**Alex B — PersonalFilesView (MAJOR 4건 집중)**
- [ ] 검색 초기화: X 버튼 추가 + 빈 검색어 시 폴더 복귀 [이슈 #8]
- [ ] 검색어 하이라이트 적용 [이슈 #3]
- [ ] 빈 결과 메시지: "'{검색어}'에 대한 검색 결과가 없습니다" [이슈 #7]
- [ ] placeholder 개선: "파일 검색" → "파일명으로 검색" [이슈 #10]

**Alex C — DocumentLibrary + AllCustomers + ContractAll**
- [ ] DocumentLibraryView: 하이라이트 + 빈 결과 메시지 [이슈 #2, #6]
- [ ] AllCustomersView: 하이라이트 + placeholder 개선 [이슈 #4, #13]
- [ ] ContractAllView: 하이라이트 + 빈 결과 메시지 [이슈 #5, #11]
- [ ] (보너스) RelationshipView: 빈 결과 메시지 [이슈 #12]

### Phase 3: 코드 검수 (Gini)
- [ ] 전체 변경 코드 품질/보안/정합성 검증

### Phase 4: 브라우저 검증 (E2E Tester)
- [ ] 각 뷰별 검색 → 하이라이트 표시 확인
- [ ] 빈 결과 메시지 확인
- [ ] PersonalFiles 검색 초기화 동작 확인

---

## 공통 유틸리티 설계

### `shared/lib/highlightText.tsx`

```tsx
import React from 'react'

/**
 * 검색어 매칭 부분을 <mark>로 감싸는 공통 유틸리티
 * 사용: highlightText("보험금 청구서.pdf", "보험") → <><mark>보험</mark>금 청구서.pdf</>
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text
  // escapeRegex 처리
  const escaped = query.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? <mark key={i}>{part}</mark> : part
      )}
    </>
  )
}
```

---

## 관련 파일 경로

### 수정 대상 프론트엔드 파일
| 뷰 | 파일 경로 |
|----|----------|
| QuickSearch | `frontend/aims-uix3/src/components/QuickSearch/QuickSearch.tsx` |
| DocumentLibraryView | `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx` |
| PersonalFilesView | `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx` |
| AllCustomersView | `frontend/aims-uix3/src/features/customer/views/AllCustomersView/AllCustomersView.tsx` |
| ContractAllView | `frontend/aims-uix3/src/components/ContractViews/ContractAllView.tsx` |
| RelationshipView | `frontend/aims-uix3/src/components/CustomerViews/CustomerRelationshipView/CustomerRelationshipView.tsx` |

### 참조 구현 (이미 하이라이트 구현된 뷰)
| 뷰 | 함수명 | 방식 |
|----|--------|------|
| DocumentExplorerView | `highlightText` (DocumentExplorerTree 내부) | `<mark>` 태그, escapeRegex |
| DocumentSearchView | `highlightKeywords` | `<mark>` 태그 |
| RelationshipView | `highlightSearchQuery` | CSS `.search-highlight` 클래스 |

---

## 작업 로그

### 2026-03-11 (현재 세션)
- [x] 문제 발견: DocumentExplorerView 백엔드 search 무시
- [x] 백엔드 수정: `explorer-tree` 엔드포인트에 search 처리 추가
- [x] Gini 검수: Major 3건 발견 → 수정 (escapeRegex 헬퍼, searchFilter, nameMatched)
- [x] 커밋 + 푸시: `18757781`
- [x] 전수 조사: 탐색 에이전트 + UX 에이전트 병렬 실행
- [x] 결과: 백엔드 동일 버그 없음, 프론트엔드 UX 이슈 10건 발견
- [x] 보고서 작성: 이 문서
- [ ] **다음**: 새 세션에서 Phase 1부터 시작
