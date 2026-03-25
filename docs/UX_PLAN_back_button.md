# UX Plan: 조건부 "돌아가기" 버튼 도입

> **작성자**: Dana (UX Design Advisor)
> **작성일**: 2026-03-26
> **상태**: 기획 확정 (Dana + Sora 리뷰 반영 v2)

---

## 1. 문제 정의

페이지 간 이동 후 이전 페이지로 돌아가는 방법이 브라우저 뒤로가기뿐이다.
SPA에서 브라우저 뒤로가기는 예측 불가능할 때가 많아 사용자에게 불안감을 준다.

## 2. 설계 원칙: 조건부 표시

**이전 페이지가 있을 때만** "돌아가기" 버튼을 표시한다.

이것은 iOS Navigation Controller가 20년간 사용해온 검증된 패턴이다:
- 사이드바에서 직접 진입 → Back 버튼 없음
- 다른 페이지에서 링크를 타고 진입 → Back 버튼 표시

### 왜 항상 표시하면 안 되는가

- 사이드바에서 직접 진입한 사용자에게 "돌아가기"가 보이면 "어디로 돌아가지?" 혼란 발생
- 사이드바와 중복되어 인지 부하 증가
- 목적지가 불명확한 네비게이션 요소는 해가 됨

### 왜 조건부가 적절한가

- 고객 상세에서 문서함 클릭, AI 어시스턴트 링크 클릭 등 사이드바가 아닌 경로로 이동하는 경우가 실제로 많음 (Sora 설계사 확인)
- 이 경우 "원래 있던 곳으로 돌아가기"가 자연스러운 흐름
- 스크롤 위치, 검색 상태 등 이전 페이지 맥락을 보존할 수 있음

---

## 3. 현재 구현 현황

### 이미 Back 버튼이 있는 페이지 (5개) — 변경 불필요

| 페이지 | view key | 비고 |
|--------|----------|------|
| 고객 상세 | `customers-full-detail` | 리스트에서 드릴다운 |
| 상세 문서검색 | `documents-search` | 검색 결과 → 상세 흐름 |
| 고객 문서 분류함 | `customer-document-explorer` | 고객 상세에서 드릴다운 |
| 공지사항 | `help-notice` | 도움말에서 드릴다운 |
| 1:1 문의 | `help-inquiry` | 도움말에서 드릴다운 |

### 조건부 Back 버튼 추가 대상 (23개)

나머지 모든 페이지에 **조건부** Back 버튼을 도입한다.
사이드바에서 직접 진입하면 표시되지 않고, 다른 페이지에서 링크를 타고 진입하면 표시된다.

---

## 4. 조건부 표시 로직

### 판단 기준

"앱 내에서 다른 페이지를 경유하여 현재 페이지에 도달했는가?"

```tsx
// history에 AIMS 내부 이전 페이지가 있는지 판단
const hasPreviousPage = window.history.length > 1 && document.referrer.includes(window.location.origin)
```

### 구현 패턴

```tsx
// 모든 페이지의 헤더에 조건부 BackButton
titleAccessory={
  hasPreviousPage ? (
    <BackButton
      onClick={handleBack}
      tooltipContent="이전 페이지로 돌아가기"
    />
  ) : null
}
```

### history fallback 처리

직접 URL로 접근한 경우 `history.back()`이 앱 밖으로 나갈 수 있다:

```tsx
const handleBack = () => {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    navigateTo('customers-all')  // fallback: 기본 페이지로 이동
  }
}
```

---

## 5. Layout Shift 방지

버튼이 나타났다 사라졌다 하면 콘텐츠 위치가 밀린다.

**해결**: 기존 BackButton은 헤더 우측 상단 `titleAccessory`에 배치되므로, 버튼 유무에 따라 메인 콘텐츠 영역이 밀리지 않음. 현재 구조 그대로 사용 가능.

---

## 6. 배치 규칙

| 항목 | 규칙 |
|------|------|
| 위치 | 페이지 헤더 우측 상단 (titleAccessory) |
| 라벨 | "돌아가기" (기본값) |
| 아이콘 | chevron.left (SF Symbol) |
| 툴팁 | "이전 페이지로 돌아가기" |
| 동작 | `window.history.back()` (fallback: 부모 페이지) |

---

## 7. 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| 각 뷰 컴포넌트 (23개) | 조건부 BackButton 추가 |
| 또는 공통 레이아웃 컴포넌트 | 한 곳에서 조건부 BackButton 처리 (권장) |

**권장 구현**: 각 뷰에 개별 추가하지 않고, 공통 레이아웃/헤더 컴포넌트에서 한 번만 처리하여 23개 파일 수정을 최소화한다.

---

*Dana - AIMS UX Design Advisor*
