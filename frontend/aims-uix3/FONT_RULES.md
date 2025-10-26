# AIMS UIX3 폰트 및 폰트 사이즈 규정

**버전**: 1.0.0
**최종 수정일**: 2025-10-26
**기준 페이지**: 전체보기 (AllCustomersView)

---

## 🎯 핵심 원칙

### 1. **폰트 패밀리 통일**
모든 페이지는 **Apple San Francisco 폰트**를 사용합니다.

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
```

### 2. **시각적 계층 (Visual Hierarchy) 규칙**
**제목 > 본문 > 보조 정보 순서로 폰트 크기가 작아집니다.**

- **페이지 제목**: 15px (iOS Subheadline) - 가장 큼
- **본문/메인 컨텐츠**: 13px (iOS Footnote) - 중간
- **보조 정보**: 12px (iOS Caption 1) - 작음
- **미세 정보**: 11px (iOS Caption 2) - 가장 작음

### 3. **CSS 변수 우선 사용**
하드코딩된 px 값 대신 CSS 변수를 **필수**로 사용합니다.

### 4. **접근성 준수**
- WCAG 2.1 AA 기준: 본문 텍스트 최소 12px 이상
- 테이블 헤더 최소 12px 이상

---

## 📏 용도별 폰트 사이즈 규정

### **Tier 1: 페이지 제목** (15px)

| 용도 | 폰트 크기 | CSS 변수 | 사용 예시 |
|------|----------|----------|-----------|
| 페이지 제목 | 15px | `var(--font-size-subheadline)` | CenterPaneView 제목, BaseViewer 제목 |
| 섹션 제목 | 15px | `var(--font-size-subheadline)` | "고객 관계 현황", "문서 목록" |
| 모달 제목 | 15px | `var(--font-size-subheadline)` | 확인 모달, 상세 정보 모달 |

**폰트 두께**: `font-weight: 600` (Semibold)

---

### **Tier 2: 본문 및 메인 컨텐츠** (13px)

| 용도 | 폰트 크기 | CSS 변수 | 사용 예시 |
|------|----------|----------|-----------|
| 검색 입력 | 13px | `var(--font-size-footnote)` | 검색창 입력 필드 |
| 결과 카운트 | 13px | `var(--font-size-footnote)` | "총 18개 (개인 18, 법인 0)" |
| 에러 메시지 | 13px | `var(--font-size-footnote)` | 에러 알림, 경고 메시지 |
| 로딩 텍스트 | 13px | `var(--font-size-footnote)` | "고객 목록을 불러오는 중..." |
| 빈 상태 메시지 | 13px | `var(--font-size-footnote)` | "등록된 고객이 없습니다" |
| 테이블 메인 데이터 | 13px | `var(--font-size-footnote)` | 고객 이름, 주요 정보 |
| 페이지네이션 정보 | 13px | `var(--font-size-footnote)` | "1 / 2" |
| 버튼 텍스트 | 13px | `var(--font-size-footnote)` | "저장", "취소", "확인" |

**폰트 두께**:
- 일반 텍스트: `font-weight: 400` (Regular)
- 강조 텍스트: `font-weight: 500` (Medium)

---

### **Tier 3: 보조 정보** (12px)

| 용도 | 폰트 크기 | CSS 변수 | 사용 예시 |
|------|----------|----------|-----------|
| 테이블 헤더 | 12px | `var(--font-size-caption-1)` | "이름", "생년월일", "전화번호" (UPPERCASE) |
| 드롭다운 옵션 | 12px | `var(--font-size-caption-1)` | 정렬 옵션, 필터 옵션 |
| 툴팁 | 12px | `var(--font-size-caption-1)` | 도움말, 힌트 |
| 플레이스홀더 | 12px | `var(--font-size-caption-1)` | 입력 필드 힌트 |

**폰트 두께**:
- 헤더: `font-weight: 600` (Semibold)
- 일반: `font-weight: 400` (Regular)

---

### **Tier 4: 미세 정보** (11px)

| 용도 | 폰트 크기 | CSS 변수 | 사용 예시 |
|------|----------|----------|-----------|
| 테이블 보조 데이터 | 11px | `var(--font-size-caption-2)` | 생년월일, 성별, 전화번호, 이메일, 주소 |
| 상태 텍스트 | 11px | `var(--font-size-caption-2)` | 고객 유형, 고객 상태 |
| 등록일 표시 | 11px | `var(--font-size-caption-2)` | "2025.10.26" |
| 메타데이터 | 11px | `var(--font-size-caption-2)` | 파일 크기, 수정일 |

**폰트 두께**: `font-weight: 400` (Regular)

---

### **Tier 5: 대형 인터랙티브 심볼** (24px)

| 용도 | 폰트 크기 | CSS 변수 | 사용 예시 |
|------|----------|----------|-----------|
| 페이지네이션 화살표 | 24px | - | "‹" "›" (Large and Clear) |
| 아이콘 (대형) | 24px | - | 네비게이션 화살표, 모달 닫기 |

**폰트 두께**: `font-weight: 300` (Light)
**용도**: 시각적 심볼, 인터랙티브 요소 (텍스트 아님)

---

## 🎨 폰트 두께 (Font Weight) 가이드

```css
--font-weight-light: 300;       /* 대형 심볼, 화살표 */
--font-weight-regular: 400;     /* 일반 텍스트, 데이터 */
--font-weight-medium: 500;      /* 강조 텍스트, 라벨 */
--font-weight-semibold: 600;    /* 헤더, 중요 정보 */
```

---

## 📋 전체보기 페이지 폰트 매핑

### 구조별 폰트 크기

```
페이지 제목 (15px, Semibold) ← 가장 큼
├─ 검색 영역
│  └─ 검색 입력 (13px, Regular)
│
├─ 결과 헤더
│  ├─ 결과 카운트 (13px, Medium)
│  └─ 정렬 드롭다운 (12px, Regular)
│
├─ 테이블
│  ├─ 컬럼 헤더 (12px, UPPERCASE, Semibold) ← 개선됨
│  └─ 데이터 행
│     ├─ 고객 이름 (13px, Regular) ← 메인 데이터
│     ├─ 생년월일 (11px, Regular)
│     ├─ 성별 (11px, Medium)
│     ├─ 전화번호 (11px, Regular)
│     ├─ 이메일 (11px, Regular)
│     ├─ 주소 (11px, Regular)
│     ├─ 유형 (11px, Medium)
│     ├─ 상태 (11px, Medium)
│     └─ 등록일 (11px, Regular)
│
└─ 페이지네이션
   ├─ 화살표 (24px, Light) ← 심볼
   └─ 페이지 정보 (13px, Medium)
```

### 시각적 계층 요약
```
15px (제목) > 13px (본문) > 12px (보조) > 11px (미세) > 24px (심볼)
   ▲            ▲            ▲            ▲         ▲
  가장 큼       중간         작음        가장 작음   심볼
```

---

## ✅ 준수 체크리스트

모든 페이지 개발 시 다음을 확인하세요:

- [ ] 페이지 제목은 15px (subheadline, semibold)
- [ ] 본문/메인 컨텐츠는 13px (footnote)
- [ ] 테이블 헤더는 12px (caption-1, UPPERCASE)
- [ ] 보조 정보는 11-12px
- [ ] 모든 폰트 크기는 CSS 변수 사용 (하드코딩 금지)
- [ ] 폰트 패밀리는 SF Pro Text (Apple System Font)
- [ ] 적절한 font-weight 적용 (400/500/600)
- [ ] WCAG 접근성 기준 준수 (12px 이상)

---

## 🚫 금지 사항

### 절대 사용 금지

```css
/* ❌ 본문에서 16px 이상 사용 금지 (제목 제외) */
font-size: 16px;  /* 본문에서 사용 금지 */
font-size: var(--font-size-callout);  /* 16px - 본문 금지 */
font-size: var(--font-size-body);     /* 17px - 본문 금지 */
font-size: var(--font-size-lg);       /* 20px - 본문 금지 */

/* ❌ 하드코딩된 px 값 사용 금지 */
font-size: 13px;  /* ❌ var(--font-size-footnote) 사용 */
font-size: 15px;  /* ❌ var(--font-size-subheadline) 사용 */

/* ❌ 폰트 패밀리 하드코딩 금지 */
font-family: "Arial";
font-family: "Helvetica";
font-family: "Roboto";

/* ❌ 10px 이하 사용 금지 (접근성 위반) */
font-size: 9px;
font-size: 10px;
```

### 예외 허용

다음 경우에만 규정 외 크기 허용:
1. **대형 심볼/아이콘**: 24px 이상 (페이지네이션 화살표, 모달 아이콘 등)
2. **특수 디자인 요구사항**: 사용자 명시적 요청 + UX 근거 명확한 경우

---

## 🔄 기존 코드 마이그레이션

### Before (위반 사례)
```css
.page-title {
  font-size: 13px;  /* ❌ 제목이 본문과 같음 (계층 없음) */
  font-family: "Helvetica";  /* ❌ 하드코딩 */
}

.customer-name {
  font-size: 15px;  /* ❌ 하드코딩 px 사용 */
}

.table-header {
  font-size: 10px;  /* ❌ 접근성 위반 (12px 이상 필요) */
}
```

### After (올바른 사용)
```css
.page-title {
  font-size: var(--font-size-subheadline);  /* ✅ 15px - 제목 */
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-weight: 600;  /* Semibold */
}

.customer-name {
  font-size: var(--font-size-footnote);  /* ✅ 13px - 본문 */
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-weight: 400;  /* Regular */
}

.table-header {
  font-size: var(--font-size-caption-1);  /* ✅ 12px - 접근성 준수 */
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-weight: 600;  /* Semibold */
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
```

---

## 📊 CSS 변수 참조

프로젝트에서 사용 가능한 폰트 크기 CSS 변수:

```css
/* iOS Dynamic Type 호환 */
--font-size-caption-2: 0.6875rem;  /* 11px - iOS Caption 2 */
--font-size-caption-1: 0.75rem;    /* 12px - iOS Caption 1 */
--font-size-footnote: 0.8125rem;   /* 13px - iOS Footnote ✅ 기본값 */
--font-size-subheadline: 0.9375rem; /* 15px - iOS Subheadline */
--font-size-callout: 1rem;          /* 16px - iOS Callout */
--font-size-body: 1.0625rem;        /* 17px - iOS Body */
```

**권장 매핑**:
- 페이지 제목: `var(--font-size-subheadline)` (15px)
- 메인 컨텐츠: `var(--font-size-footnote)` (13px)
- 보조 정보: `var(--font-size-caption-1)` (12px)
- 미세 정보: `var(--font-size-caption-2)` (11px)

---

## 🎯 Summary

| 레벨 | 폰트 크기 | CSS 변수 | 용도 | 예시 |
|------|----------|----------|------|------|
| **제목** | 15px | `--font-size-subheadline` | 페이지/섹션 제목 | "고객 전체보기" |
| **본문** | 13px | `--font-size-footnote` | 검색, 주요 데이터 | 고객 이름, "총 18개" |
| **보조** | 12px | `--font-size-caption-1` | 테이블 헤더, 툴팁 | "이름", "전화번호" |
| **미세** | 11px | `--font-size-caption-2` | 상세 메타데이터 | 전화번호, 이메일 |
| **심볼** | 24px | - | 대형 인터랙티브 | "‹" "›" |

**핵심 규칙**:
- ✅ 제목(15px) > 본문(13px) > 보조(12px) > 미세(11px)
- ✅ 모든 폰트는 CSS 변수 사용
- ✅ WCAG 접근성 준수 (12px 이상)
- ✅ Apple SF Pro Text 폰트 패밀리

---

## 📞 문의

폰트 규정 관련 질문이나 예외 승인이 필요한 경우 프로젝트 관리자에게 문의하세요.
