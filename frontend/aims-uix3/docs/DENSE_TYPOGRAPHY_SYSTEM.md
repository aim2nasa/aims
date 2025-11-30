# AIMS Dense Typography System

> **AIMS UIX3 표준 타이포그래피 시스템**
>
> 이 문서는 CustomerFullDetailView에서 검증된 Dense Typography Scale을 AIMS 프로젝트 전체의 표준으로 정의합니다.

## 📐 Dense Typography Scale

| 용도 | 크기 | 변수 | font-weight |
|------|------|------|-------------|
| **섹션 제목** | 13px | `--font-title` | 600 (semibold) |
| **테이블 데이터** | 12px | `--font-body` | 400 (normal) |
| **테이블 헤더** | 11px | `--font-header` | 600 (semibold) |
| **보조 텍스트** | 11px | `--font-caption` | 400 (normal) |
| **페이지네이션/배지** | 10px | `--font-micro` | 400 (normal) |

## 🎨 폰트 패밀리

```css
--font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
```

iOS/macOS에서는 SF Pro Text, Windows에서는 Segoe UI, 기타 환경에서는 시스템 sans-serif가 자동 적용됩니다.

## ⚖️ 폰트 굵기

**2단계만 사용합니다:**

| 용도 | 값 | 변수 |
|------|-----|------|
| 일반 텍스트 | 400 | `--weight-normal` |
| 헤더/제목 | 600 | `--weight-semibold` |

> ⚠️ **500 (medium) 사용 금지**: 시각적 일관성을 위해 400과 600만 사용

## 📋 적용 규칙

### 1. 섹션 제목 (13px, semibold)

```css
.section-title {
  font-size: var(--font-title);      /* 13px */
  font-weight: var(--weight-semibold); /* 600 */
}
```

**적용 대상:**
- 카드/섹션 제목 (예: "고객 정보", "보험 계약", "문서", "Annual Report")
- 모달 제목
- 페이지 서브 타이틀

### 2. 테이블 데이터 (12px, normal)

```css
.table-cell {
  font-size: var(--font-body);       /* 12px */
  font-weight: var(--weight-normal); /* 400 */
}
```

**적용 대상:**
- 테이블 데이터 셀 (이름, 날짜, 금액 등)
- 입력 필드 값
- 일반 본문 텍스트
- 라벨/값 쌍의 값 부분

### 3. 테이블 헤더 (11px, semibold)

```css
.table-header {
  font-size: var(--font-header);     /* 11px */
  font-weight: var(--weight-semibold); /* 600 */
  color: var(--color-text-tertiary);
}
```

**적용 대상:**
- 테이블 컬럼 헤더 (상품명, 계약일, 증권번호 등)
- 라벨/값 쌍의 라벨 부분
- 유형 배지 (개인, 법인 등)

### 4. 페이지네이션/배지 (10px)

```css
.pagination {
  font-size: var(--font-micro);      /* 10px */
}

.status-badge {
  font-size: var(--font-micro);      /* 10px */
  font-weight: var(--weight-normal); /* 400 */
}
```

**적용 대상:**
- 페이지네이션 컨트롤 (1/2, 자동(7) 등)
- 상태 배지 (납입중, 정상, 완료 등)
- 카운트 배지 (10, 25 등)

## 🔧 CSS 변수 정의

컴포넌트 최상위에 다음 변수들을 정의합니다:

```css
.your-component {
  /* 폰트 패밀리 */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;

  /* 폰트 크기 - Dense Typography Scale */
  --font-title: 13px;      /* 섹션 제목 */
  --font-body: 12px;       /* 테이블 데이터 (기본) */
  --font-header: 11px;     /* 테이블 헤더 */
  --font-caption: 11px;    /* 보조 텍스트 */
  --font-micro: 10px;      /* 페이지네이션/배지 */

  /* 폰트 굵기 */
  --weight-normal: 400;    /* 일반 텍스트 */
  --weight-semibold: 600;  /* 헤더/제목 */

  /* 기존 변수 호환 매핑 */
  --font-size-footnote: var(--font-title);
  --font-size-caption-1: var(--font-body);
  --font-size-caption-2: var(--font-header);
}
```

## 🎯 컴포넌트별 적용 예시

### CustomerFullDetailView (참조 구현)

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 고객 정보                                    [13px/600] │
├─────────────────────────────────────────────────────────────┤
│  이름      곽승철       생년월일   1969.12.07               │
│  [11px]   [12px]       [11px]    [12px]                     │
│                                                             │
│  관계 유형    관련 고객    등록일           가족 삭제        │
│  [11px/600]  [11px/600]   [11px/600]       [11px/600]       │
│  ─────────────────────────────────────────────────────────  │
│  🟡 자녀     윤서현       2025.11.30 12:36:18    🗑️         │
│  [12px]     [12px]       [12px]                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  📋 보험 계약                                         [10]  │
├─────────────────────────────────────────────────────────────┤
│  상품명        계약일      증권번호    보험료    납입상태   │
│  [11px/600]   [11px/600]  [11px/600]  [11px]    [11px]     │
│  ─────────────────────────────────────────────────────────  │
│  무배당저축   2024.01.19  0013059999  300,000원  납입중    │
│  [12px]      [12px]       [12px]      [12px]     [10px]    │
│                                                             │
│  자동(7) ▼                                      1 / 2  ◀ ▶ │
│  [10px]                                         [10px]      │
└─────────────────────────────────────────────────────────────┘
```

## ⚠️ 주의사항

### 1. CSS 우선순위

컴포넌트 CSS가 나중에 로드되어 덮어쓸 수 있으므로, **3개 이상 클래스 체인**으로 우선순위를 확보합니다:

```css
/* ❌ 우선순위 낮음 - 덮어씌워질 수 있음 */
.contract-product {
  font-size: var(--font-body);
}

/* ✅ 우선순위 높음 - 안전하게 적용 */
.customer-full-detail .customer-full-detail__section-content--contracts .contract-product {
  font-size: var(--font-body);
  font-weight: var(--weight-normal);
}
```

### 2. font-weight 500 사용 금지

기존 컴포넌트에 `font-weight: 500`이 있으면 **반드시 400 또는 600으로 변경**합니다:

```css
/* ❌ 잘못된 예 */
.contract-product {
  font-weight: 500;
}

/* ✅ 올바른 예 */
.contract-product {
  font-weight: var(--weight-normal); /* 400 */
}
```

### 3. 하드코딩 금지

픽셀 값을 직접 사용하지 않고 반드시 CSS 변수를 사용합니다:

```css
/* ❌ 잘못된 예 */
.table-cell {
  font-size: 12px;
}

/* ✅ 올바른 예 */
.table-cell {
  font-size: var(--font-body);
}
```

## 📁 참조 파일

- **구현 예시**: `src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.css`
- **전역 타이포그래피**: `src/shared/styles/typography.css`
- **CSS 변수 정의**: `src/styles/variables.css`

## 📜 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2025-12-01 | 1.0.0 | 최초 작성 - CustomerFullDetailView 기준 |

---

**작성자**: Claude Code
**최종 수정**: 2025-12-01
