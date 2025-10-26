# 🎨 AIMS UIX3 타이포그래피 사용 가이드

**버전**: 1.0.0
**최종 수정일**: 2025-10-26
**목적**: 프로젝트 전역에서 일관된 타이포그래피 적용

---

## 🎯 핵심 개념

### 문제점: 지금까지 왜 일관성이 없었나?

```css
/* ❌ 잘못된 방법: 각 컴포넌트마다 제각각 */

/* RelationshipsTab.css */
.relationships-title {
  font-size: var(--font-size-subheadline); /* 15px */
}

/* DocumentsTab.css */
.documents-title {
  font-size: var(--font-size-footnote); /* 13px - 다름! */
}

/* AnnualReportTab.css */
.annual-report-title {
  font-size: var(--font-size-callout); /* 16px - 또 다름! */
}
```

**결과**: 같은 "탭 제목"인데 페이지마다 크기가 다름!

### 해결책: 공용 타이포그래피 클래스

```css
/* ✅ 올바른 방법: 모든 탭이 동일한 클래스 사용 */

/* RelationshipsTab.css */
.relationships-title {
  /* 폰트 크기 정의 삭제! */
}

/* HTML에서 */
<h2 className="typography-tab-title">관계 정보</h2>
<h2 className="typography-tab-title">문서</h2>
<h2 className="typography-tab-title">Annual Report</h2>
```

**결과**: 모든 탭 제목이 자동으로 동일한 크기 (15px, semibold)!

---

## 📚 사용 가능한 타이포그래피 클래스

### Tier 1: 제목 (15px)

| 클래스 | 용도 | 예시 |
|--------|------|------|
| `typography-page-title` | 페이지 제목 | "고객 전체보기" |
| `typography-section-title` | 섹션 제목 | "고객 관계 현황" |
| `typography-modal-title` | 모달 제목 | "고객 정보 수정" |
| `typography-tab-title` | 탭 제목 | "관계 정보", "문서", "상담 이력" |

**특징**:
- 15px (iOS Subheadline)
- Font Weight: 600 (Semibold)
- 가장 큰 텍스트

### Tier 2: 본문 (13px)

| 클래스 | 용도 | 예시 |
|--------|------|------|
| `typography-body` | 일반 본문 | 일반 텍스트 |
| `typography-body-emphasis` | 강조 본문 | 중요한 정보 |
| `typography-input` | 입력 필드 | 검색창, 텍스트 입력 |
| `typography-button` | 버튼 텍스트 | "저장", "취소" |
| `typography-message` | 메시지 | 안내 문구 |
| `typography-error` | 에러 메시지 | 경고, 오류 |
| `typography-count` | 카운트 표시 | "총 18개 (개인 18, 법인 0)" |

**특징**:
- 13px (iOS Footnote)
- Font Weight: 400 (Regular) 또는 500 (Medium)
- 메인 컨텐츠

### Tier 3: 보조 정보 (12px)

| 클래스 | 용도 | 예시 |
|--------|------|------|
| `typography-table-header` | 테이블 헤더 | "이름", "전화번호" (UPPERCASE) |
| `typography-label` | 폼 레이블 | 입력 필드 라벨 |
| `typography-tooltip` | 툴팁 | 도움말 텍스트 |
| `typography-placeholder` | 플레이스홀더 | 입력 힌트 |

**특징**:
- 12px (iOS Caption 1)
- Font Weight: 400-600
- 보조 정보

### Tier 4: 미세 정보 (11px)

| 클래스 | 용도 | 예시 |
|--------|------|------|
| `typography-caption` | 일반 캡션 | 작은 안내 문구 |
| `typography-metadata` | 메타데이터 | 파일 크기, 수정일 |
| `typography-table-cell` | 테이블 셀 | 생년월일, 전화번호, 이메일 |
| `typography-badge` | 뱃지/태그 | 상태, 카테고리 |

**특징**:
- 11px (iOS Caption 2)
- Font Weight: 400 (Regular)
- 가장 작은 텍스트

### Tier 5: 심볼 (24px+)

| 클래스 | 크기 | 용도 |
|--------|------|------|
| `typography-symbol-large` | 24px | 아이콘 |
| `typography-symbol-xlarge` | 32px | 큰 아이콘 |
| `typography-symbol-xxlarge` | 48px | 특대형 아이콘 |
| `typography-symbol-xxxlarge` | 64px | 이모지 |
| `typography-symbol-jumbo` | 80px | 특대형 이모지 |

**특징**:
- Font Weight: 300 (Light)
- 텍스트가 아닌 시각적 요소

### 특수 조합

| 클래스 | 용도 |
|--------|------|
| `typography-empty-title` | 빈 상태 제목 |
| `typography-empty-message` | 빈 상태 메시지 |
| `typography-link` | 링크 |
| `typography-label-strong` | 강조 레이블 |

---

## 🚀 실전 적용 예시

### 예시 1: 탭 컴포넌트

**Before (잘못된 방법)**:
```tsx
// RelationshipsTab.tsx
<div className="relationships-tab">
  <h2 className="relationships-title">관계 정보</h2>
  <p className="relationships-empty">등록된 관계가 없습니다.</p>
</div>

// RelationshipsTab.css
.relationships-title {
  font-size: var(--font-size-subheadline);
  font-weight: 600;
}

.relationships-empty {
  font-size: var(--font-size-footnote);
  color: var(--color-text-tertiary);
}
```

**After (올바른 방법)**:
```tsx
// RelationshipsTab.tsx
<div className="relationships-tab">
  <h2 className="typography-tab-title">관계 정보</h2>
  <p className="typography-empty-message">등록된 관계가 없습니다.</p>
</div>

// RelationshipsTab.css
/* 폰트 크기/두께 정의 삭제! typography.css 클래스 사용 */
/* 레이아웃/색상 등만 정의 */
```

### 예시 2: 테이블 컴포넌트

**Before**:
```tsx
<table>
  <thead>
    <tr>
      <th className="custom-header">이름</th>
      <th className="custom-header">전화번호</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="custom-cell">홍길동</td>
      <td className="custom-cell-small">010-1234-5678</td>
    </tr>
  </tbody>
</table>

// CSS
.custom-header { font-size: 12px; font-weight: 600; }
.custom-cell { font-size: 13px; }
.custom-cell-small { font-size: 11px; }
```

**After**:
```tsx
<table>
  <thead>
    <tr>
      <th className="typography-table-header">이름</th>
      <th className="typography-table-header">전화번호</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="typography-body">홍길동</td>
      <td className="typography-table-cell">010-1234-5678</td>
    </tr>
  </tbody>
</table>

// CSS에서 폰트 크기 정의 삭제!
```

### 예시 3: 빈 상태 UI

**Before**:
```tsx
<div className="empty-state">
  <div className="empty-icon">📄</div>
  <h3 className="empty-title">문서가 없습니다</h3>
  <p className="empty-message">첫 문서를 업로드해보세요.</p>
</div>

// CSS
.empty-icon { font-size: 48px; }
.empty-title { font-size: 15px; font-weight: 600; }
.empty-message { font-size: 13px; color: #999; }
```

**After**:
```tsx
<div className="empty-state">
  <div className="typography-symbol-xxlarge">📄</div>
  <h3 className="typography-empty-title">문서가 없습니다</h3>
  <p className="typography-empty-message">첫 문서를 업로드해보세요.</p>
</div>

// CSS에서 폰트 관련 삭제!
```

---

## 🔧 마이그레이션 체크리스트

기존 컴포넌트를 타이포그래피 시스템으로 전환할 때:

### 1단계: CSS 파일에서 폰트 크기 제거

```css
/* ❌ 삭제할 것 */
.my-component-title {
  font-size: var(--font-size-subheadline);
  font-weight: 600;
  color: var(--color-text-primary);  /* 이건 유지 */
}

/* ✅ 수정 후 */
.my-component-title {
  /* font-size, font-weight 삭제 */
  color: var(--color-text-primary);  /* 색상은 유지 가능 */
}
```

### 2단계: JSX/TSX에서 클래스 추가

```tsx
/* Before */
<h2 className="my-component-title">제목</h2>

/* After */
<h2 className="typography-tab-title my-component-title">제목</h2>
```

### 3단계: 불필요한 CSS 클래스 제거

폰트 크기/두께만 정의하는 클래스는 삭제 가능:

```css
/* ❌ 이런 클래스는 삭제 */
.title { font-size: 15px; font-weight: 600; }
.body-text { font-size: 13px; }
.small-text { font-size: 11px; }

/* ✅ 대신 typography-* 클래스 사용 */
```

---

## 📋 빠른 참조표

| 원하는 것 | 사용할 클래스 |
|-----------|---------------|
| 페이지 제목 | `typography-page-title` |
| 탭 제목 | `typography-tab-title` |
| 모달 제목 | `typography-modal-title` |
| 일반 본문 | `typography-body` |
| 검색 입력 | `typography-input` |
| 버튼 텍스트 | `typography-button` |
| 테이블 헤더 | `typography-table-header` |
| 테이블 셀 | `typography-table-cell` |
| 작은 안내 문구 | `typography-caption` |
| 에러 메시지 | `typography-error` |
| 빈 상태 | `typography-empty-title` + `typography-empty-message` |
| 아이콘 (24px) | `typography-symbol-large` |
| 이모지 (64px) | `typography-symbol-xxxlarge` |

---

## ✅ 장점

### 1. 자동 일관성
- 모든 탭의 제목이 **자동으로** 같은 크기
- 개발자가 신경 쓰지 않아도 일관성 유지

### 2. 유지보수 용이
- FONT_RULES 변경 시 **한 곳만** 수정 (typography.css)
- 모든 페이지에 자동 적용

### 3. 개발 속도 향상
- 폰트 크기 고민 불필요
- 적절한 클래스 선택만 하면 됨

### 4. 코드 간결화
- 컴포넌트별 CSS에서 폰트 정의 삭제
- CSS 파일 크기 감소

---

## 🚫 금지 사항

### ❌ 절대 하지 마세요

```css
/* ❌ 컴포넌트 CSS에서 폰트 크기 정의 */
.my-component {
  font-size: 13px;
  font-size: var(--font-size-footnote);  /* 이것도 금지! */
}

/* ❌ 인라인 스타일로 폰트 크기 */
<div style={{ fontSize: '13px' }}>텍스트</div>

/* ❌ 각 탭마다 다른 제목 크기 */
.tab1-title { font-size: 15px; }
.tab2-title { font-size: 13px; }  /* 일관성 파괴! */
```

### ✅ 대신 이렇게

```tsx
/* ✅ typography 클래스 사용 */
<div className="typography-body">텍스트</div>

/* ✅ 모든 탭 동일한 클래스 */
<h2 className="typography-tab-title">탭 1</h2>
<h2 className="typography-tab-title">탭 2</h2>
```

---

## 🎯 요약

1. **폰트 크기는 typography.css에만 정의**
2. **컴포넌트 CSS에서는 폰트 크기 정의 금지**
3. **HTML/JSX에서 적절한 typography-* 클래스 사용**
4. **모든 탭, 모달, 페이지는 동일한 규칙 따름**

**결과**: 프로젝트 전체가 자동으로 일관된 타이포그래피 유지!

---

## 📞 문의

타이포그래피 시스템 관련 질문이나 새로운 클래스 추가가 필요한 경우:
- `typography.css` 파일 참조
- `FONT_RULES.md` 문서 확인
- 프로젝트 관리자에게 문의
