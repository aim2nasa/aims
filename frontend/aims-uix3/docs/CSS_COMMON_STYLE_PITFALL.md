# CSS 공통 스타일 적용 시 주의사항

## 문제 상황 (2026-01-03)

연간보고서 탭과 고객리뷰 탭의 스타일을 공통화했는데, **폰트 크기가 여전히 다르게 보이는 문제** 발생.

### 증상
- 연간보고서 헤더: 11px (정상)
- 고객리뷰 헤더: 더 큰 폰트 (비정상)
- 두 탭 모두 "공통 스타일 적용됨"이라고 생각했으나 실제로는 달랐음

---

## 근본 원인

### 1. CSS 셀렉터에 클래스 누락

`CustomerFullDetailView.css`에서 폰트 크기를 강제 적용하는 셀렉터에 **Customer Review 전용 클래스들이 누락**되어 있었음.

```css
/* 기존 코드 - Annual Report만 포함 */
.customer-full-detail .section-content--report .header-owner,
.customer-full-detail .section-content--report .header-issue-date,
.customer-full-detail .section-content--report .annual-report-table__header-content {
  font-size: var(--font-header);  /* 11px */
}

/* 누락된 Customer Review 클래스들 */
.header-contractor      ❌ 누락
.header-policy-number   ❌ 누락
.header-product         ❌ 누락
.customer-review-table__header-content ❌ 누락
```

### 2. 왜 이런 문제가 발생했나?

| 원인 | 설명 |
|------|------|
| **다른 클래스명** | Annual Report는 `.header-owner`, Customer Review는 `.header-contractor` 사용 |
| **복사-붙여넣기 누락** | Annual Report 셀렉터를 작성할 때 Customer Review는 추가 안 함 |
| **테스트 부족** | 한 탭만 확인하고 다른 탭은 확인 안 함 |

---

## 해결 방법

### 수정된 코드

```css
/* 연간보고서 + 고객리뷰 헤더 통합 */
/* Annual Report */
.customer-full-detail .section-content--report .header-owner,
.customer-full-detail .section-content--report .header-issue-date,
.customer-full-detail .section-content--report .annual-report-table__header-content,
/* Customer Review - 추가! */
.customer-full-detail .section-content--report .header-contractor,
.customer-full-detail .section-content--report .header-policy-number,
.customer-full-detail .section-content--report .header-product,
.customer-full-detail .section-content--report .customer-review-table__header-content {
  font-size: var(--font-header);
  font-weight: 600;
}
```

---

## 예방 체크리스트

### 공통 스타일 작업 시 반드시 확인할 것

- [ ] **모든 대상 컴포넌트의 클래스명 확인**
  ```bash
  # 헤더 클래스 찾기
  grep -r "className.*header-" src/features/customer/views/

  # 행 클래스 찾기
  grep -r "className.*row-" src/features/customer/views/
  ```

- [ ] **셀렉터에 모든 클래스 포함 여부 확인**
  - 컴포넌트 A의 클래스: `.header-owner`, `.row-owner`
  - 컴포넌트 B의 클래스: `.header-contractor`, `.row-contractor`
  - → 둘 다 셀렉터에 있어야 함!

- [ ] **실제 화면에서 두 컴포넌트 비교 확인**
  - 개발자 도구 → Computed 탭에서 `font-size` 값 직접 비교

---

## 교훈

### 1. "공통 스타일"의 함정

공통 CSS 변수를 사용해도, **셀렉터에 클래스가 누락되면 적용 안 됨**.

```css
/* 변수는 공통이지만... */
--font-header: 11px;

/* 셀렉터에 없으면 소용없음! */
.header-contractor { }  /* font-size 미적용 → 브라우저 기본값 */
```

### 2. 클래스명 통일의 중요성

만약 처음부터 두 컴포넌트가 같은 클래스명을 사용했다면 이 문제는 없었음:

```tsx
// 이상적인 구조 (같은 클래스명)
<div className="table-header-cell">계약자</div>  // Annual Report
<div className="table-header-cell">계약자</div>  // Customer Review

// 현재 구조 (다른 클래스명)
<div className="header-owner">계약자</div>       // Annual Report
<div className="header-contractor">계약자</div>  // Customer Review
```

### 3. 디버깅 방법

문제 발생 시:

1. **개발자 도구 → Elements → Computed** 탭에서 실제 적용된 `font-size` 확인
2. **Styles** 탭에서 어떤 셀렉터가 적용되었는지 확인
3. 예상 셀렉터가 적용 안 되었다면 → 클래스명 누락 의심

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `CustomerFullDetailView.css` | 공통 스타일 정의 (폰트 크기 등) |
| `AnnualReportTab.css` | 연간보고서 기본 구조만 |
| `CustomerReviewTab.css` | 고객리뷰 기본 구조만 |

---

## 요약

> **"공통 스타일을 만들 때는 모든 대상 컴포넌트의 클래스명을 빠짐없이 셀렉터에 포함해야 한다."**

클래스명이 다르면 각각 추가해야 하고, 하나라도 누락되면 스타일이 적용되지 않는다.
