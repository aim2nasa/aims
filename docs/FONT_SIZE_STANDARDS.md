# AIMS UIX3 폰트 사이즈 표준 (Font Size Standards)

> **목적**: 전체 시스템의 일관된 폰트 사이즈 규칙 정의
> **원칙**: 페이지마다 제각각이 아닌, 요소 유형별 통일된 규칙

---

## 📏 기준점

**LeftPane (CustomMenu)**이 AIMS UIX3 전체 폰트 체계의 기준점입니다.

```
기준 크기:
- 메인 메뉴: 13px (var(--font-size-footnote))
- 서브메뉴: 13px (var(--font-size-footnote))
- 뱃지/힌트: 12px (var(--font-size-caption-1))
```

**모든 페이지는 이 기준과 시각적 조화를 이루어야 합니다.**

---

## 🎯 전체 시스템 통일 규칙

### 1️⃣ 입력 요소 (Interactive Elements)

**모든 페이지에서 동일하게 적용**

| 요소 | 폰트 사이즈 | CSS 변수 | 이유 |
|------|----------|---------|------|
| **입력 필드** (input, textarea) | **13px** | `var(--font-size-footnote)` | 가독성 + LeftPane 조화 |
| **버튼** (button) | **13px** | `var(--font-size-footnote)` | 터치 영역 + 일관성 |
| **링크** (a, clickable) | **13px** | `var(--font-size-footnote)` | 상호작용 요소 통일 |
| **드롭다운/셀렉트** | **13px** | `var(--font-size-footnote)` | 입력 필드와 동일 |
| **토글/체크박스 라벨** | **13px** | `var(--font-size-footnote)` | 입력 요소 통일 |

**예외 없음**: 모든 페이지의 모든 입력 요소는 13px

---

### 2️⃣ 텍스트 요소 (Text Content)

**정보 계층에 따른 크기**

| 요소 유형 | 폰트 사이즈 | CSS 변수 | 사용 예시 |
|----------|----------|---------|----------|
| **본문 텍스트** | **13px** | `var(--font-size-footnote)` | 일반 텍스트, 설명, 내용 |
| **라벨** (label) | **13px** | `var(--font-size-footnote)` | 필드명, 항목명 |
| **테이블 내용** | **13px** | `var(--font-size-footnote)` | 데이터 행 |
| **테이블 헤더** | **12px** | `var(--font-size-caption-1)` | 컬럼명 (보조 정보) |
| **보조 정보** | **12px** | `var(--font-size-caption-1)` | 날짜, 시간, 파일크기, 메타데이터 |
| **작은 라벨/뱃지** | **11px** | `var(--font-size-caption-2)` | 문서타입, 카테고리, 상태 뱃지 |

**핵심**: 본문은 13px, 보조는 12px, 뱃지는 11px

---

### 3️⃣ 구조 요소 (Structural Elements)

**페이지 구조를 나타내는 요소**

| 요소 | 폰트 사이즈 | CSS 변수 | 스타일 |
|------|----------|---------|--------|
| **섹션 제목** | **12px** | `var(--font-size-caption-1)` | 대문자 + `letter-spacing: 0.08em` |
| **탭** | **13px** | `var(--font-size-footnote)` | 일반 텍스트와 동일 |
| **툴팁** | **12px** | `var(--font-size-caption-1)` | 보조 정보 |
| **페이지 타이틀** | **15px** | `var(--font-size-subheadline)` | 중요 제목 강조 |

**섹션 제목**: 대문자 + letter-spacing으로 차별화, 크기는 12px 고정

---

### 4️⃣ 네비게이션 요소

**메뉴, 탭, 브레드크럼 등**

| 요소 | 폰트 사이즈 | CSS 변수 |
|------|----------|---------|
| **메인 메뉴** (LeftPane) | **13px** | `var(--font-size-footnote)` |
| **서브 메뉴** | **13px** | `var(--font-size-footnote)` |
| **탭** | **13px** | `var(--font-size-footnote)` |
| **브레드크럼** | **13px** | `var(--font-size-footnote)` |

---

### 5️⃣ 아이콘/심볼 크기 (Icons & Symbols)

**정확한 크기만 사용**

| 용도 | 크기 | CSS 변수 | 사용 예시 |
|------|------|---------|----------|
| **일반 아이콘** | **13px** | `SFSymbolSize.CAPTION_1` | 텍스트 인라인 아이콘 |
| **메뉴 아이콘** | **16px** | `SFSymbolSize.CALLOUT` | LeftPane 메뉴 (최대 크기) |
| **대형 심볼** | **24px** | `var(--font-size-large-symbol)` | 페이지네이션, 액션 버튼 |
| **특대형 아이콘** | **32px** | `var(--font-size-xlarge-symbol)` | 모달 아이콘 |
| **초대형 아이콘** | **48px** | `var(--font-size-xxlarge-symbol)` | Empty State |
| **이모지** | **64px** | `var(--font-size-xxxlarge-symbol)` | 대형 상태 표시 |

**중요**: 문서 타입 아이콘은 24px (DocumentLibraryView 기준)

---

## 🚫 금지 사항

### 1. 하드코딩 절대 금지

```css
/* ❌ 절대 금지 */
.text {
  font-size: 14px;
}

/* ✅ 올바른 방법 */
.text {
  font-size: var(--font-size-footnote);
}
```

### 2. 페이지별 독자적 크기 정의 금지

```css
/* ❌ 잘못된 예: 페이지마다 다른 크기 */
.page-a .button { font-size: 14px; }
.page-b .button { font-size: 13px; }
.page-c .button { font-size: 15px; }

/* ✅ 올바른 예: 모든 페이지 동일 */
.button {
  font-size: var(--font-size-footnote); /* 13px - 전체 시스템 통일 */
}
```

### 3. 제목/헤더 폰트 크기 (정확한 값만 사용)

**각 크기별 정확한 사용처 규정**

| 폰트 사이즈 | 정확한 사용처 | CSS 변수 | 사용 예시 |
|----------|------------|---------|----------|
| **15px** | 페이지 메인 타이틀 | `var(--font-size-subheadline)` | AccountSettingsView 페이지 제목, DocumentLibraryView 상단 타이틀 |
| **16px** | 모달 헤더 제목 | `var(--font-size-callout)` | DraggableModal 제목, 확인 다이얼로그 제목 |
| **17px** | 콘텐츠 영역 헤드라인 | `var(--font-size-headline)` | 대시보드 섹션 제목, 리포트 헤더 |
| **20px** | 중요 섹션 구분 제목 | `var(--font-size-title-3)` | 설정 그룹 타이틀, 위젯 헤더 |
| **22px** | 대형 컨테이너 헤더 | `var(--font-size-title-2)` | 풀페이지 리포트 제목, 전체화면 대시보드 헤더 |
| **28px** | 랜딩/웰컴 페이지 타이틀 | `var(--font-size-title-1)` | 로그인 페이지 제목, 온보딩 헤더 |
| **34px** | 특수 목적 초대형 제목 | `var(--font-size-large-title)` | 마케팅 랜딩, Empty State 메시지 |

**절대 규칙**:
- **일반 본문/입력 요소는 13px만 사용** (위 제목 크기 사용 금지)
- 위 표에 명시된 용도 외 사용 금지
- 제목에도 하드코딩 금지, 반드시 CSS 변수 사용

---

## ✅ 접근성 필수 기준

### WCAG 2.1 AA 준수

| 요소 | 정확한 크기 | 용도 |
|------|----------|------|
| **본문 텍스트** | **13px** | 일반 콘텐츠 (var(--font-size-footnote)) |
| **버튼/링크** | **13px** | 상호작용 요소 (터치 영역 44x44px) |
| **테이블 헤더** | **12px** | 컬럼명 (var(--font-size-caption-1)) |
| **뱃지** | **11px** | 상태 표시 (var(--font-size-caption-2)) |

**대비율**: 4.5:1 이상 필수

**금지**: 10px 이하 사용 절대 금지

---

## 📋 전체 폰트 크기 요약 (AIMS UIX3 전용)

### 허용된 폰트 크기 전체 목록

| 크기 | CSS 변수 | 용도 | 사용 예시 |
|------|---------|------|----------|
| **11px** | `var(--font-size-caption-2)` | 뱃지/힌트 | 상태 뱃지, 카테고리 태그 |
| **12px** | `var(--font-size-caption-1)` | 보조 정보 | 테이블 헤더, 날짜/시간, 메타데이터 |
| **13px** | `var(--font-size-footnote)` | **기본 크기** | 본문, 입력, 버튼, 링크, 라벨 |
| **15px** | `var(--font-size-subheadline)` | 페이지 제목 | 섹션 타이틀 |
| **16px** | `var(--font-size-callout)` | 대형 제목 | 모달 헤더 |
| **17px** | `var(--font-size-headline)` | 헤드라인 | 페이지 메인 제목 |
| **20px** | `var(--font-size-title-3)` | 타이틀 3 | 중요 섹션 제목 |
| **22px** | `var(--font-size-title-2)` | 타이틀 2 | 대형 헤더 |
| **28px** | `var(--font-size-title-1)` | 타이틀 1 | 특대 헤더 |
| **34px** | `var(--font-size-large-title)` | 특대 타이틀 | 랜딩 페이지 |

### 아이콘/심볼 크기

| 크기 | CSS 변수 | 용도 |
|------|---------|------|
| **13px** | `SFSymbolSize.CAPTION_1` | 인라인 아이콘 |
| **16px** | `SFSymbolSize.CALLOUT` | 메뉴 아이콘 |
| **24px** | `var(--font-size-large-symbol)` | 액션 버튼, 페이지네이션 |
| **32px** | `var(--font-size-xlarge-symbol)` | 모달 아이콘 |
| **48px** | `var(--font-size-xxlarge-symbol)` | Empty State |
| **64px** | `var(--font-size-xxxlarge-symbol)` | 이모지 |

**위 목록 외 크기 사용 절대 금지!**

---

## 📐 CSS 변수 정의 (tokens.css Line 203-229)

### 폰트 사이즈 - iOS 기반 변수 (우선 사용)

```css
--font-size-caption-2: 0.6875rem;   /* 11px */
--font-size-caption-1: 0.75rem;     /* 12px */
--font-size-footnote: 0.8125rem;    /* 13px */
--font-size-subheadline: 0.9375rem; /* 15px */
--font-size-callout: 1rem;          /* 16px */
--font-size-body: 1.0625rem;        /* 17px */
--font-size-headline: 1.0625rem;    /* 17px */
--font-size-title-3: 1.25rem;       /* 20px */
--font-size-title-2: 1.375rem;      /* 22px */
--font-size-title-1: 1.75rem;       /* 28px */
--font-size-large-title: 2.125rem;  /* 34px */
```

### 폰트 사이즈 - 별칭 변수 (하위 호환용)

```css
--font-size-xs: var(--font-size-caption-1);   /* 12px */
--font-size-sm: var(--font-size-footnote);    /* 13px */
--font-size-base: var(--font-size-callout);   /* 16px */
--font-size-lg: var(--font-size-title-3);     /* 20px */
--font-size-xl: var(--font-size-title-2);     /* 22px */
--font-size-2xl: var(--font-size-title-1);    /* 28px */
--font-size-3xl: var(--font-size-large-title); /* 34px */
```

---

## 🔤 폰트 패밀리 (Font Family) 규정

### 기본 원칙

**모든 텍스트는 애플 시스템 폰트를 우선 사용합니다.**

### 폰트 패밀리 변수 (tokens.css Line 172-189)

```css
/* 🍎 시스템 폰트 (기본) */
--font-family-system: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

/* 🍎 디스플레이 폰트 (제목/강조) */
--font-family-display: 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

/* 🍎 텍스트 폰트 (본문) */
--font-family-text: 'SF Pro Text', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

/* 🍎 모노스페이스 폰트 (코드/데이터) */
--font-family-mono: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;

/* 🍎 주 폰트 (별칭) */
--font-family-primary: var(--font-family-system);
```

### 사용 규칙 - 정확한 용도별 폰트 지정

#### 1️⃣ 입력 요소 (Interactive Elements)

| 요소 | 폰트 패밀리 | CSS 변수 |
|------|----------|---------|
| **입력 필드** (input, textarea) | SF Pro Text | `var(--font-family-text)` |
| **버튼** (button) | SF Pro Text | `var(--font-family-text)` |
| **링크** (a, clickable) | SF Pro Text | `var(--font-family-text)` |
| **드롭다운/셀렉트** | SF Pro Text | `var(--font-family-text)` |
| **토글/체크박스 라벨** | SF Pro Text | `var(--font-family-text)` |

#### 2️⃣ 텍스트 요소 (Text Content)

| 요소 | 폰트 패밀리 | CSS 변수 |
|------|----------|---------|
| **본문 텍스트** | SF Pro Text | `var(--font-family-text)` |
| **라벨** (label) | SF Pro Text | `var(--font-family-text)` |
| **테이블 내용** | SF Pro Text | `var(--font-family-text)` |
| **테이블 헤더** | SF Pro Text | `var(--font-family-text)` |
| **보조 정보** (날짜/시간/메타) | SF Pro Text | `var(--font-family-text)` |
| **작은 라벨/뱃지** | SF Pro Text | `var(--font-family-text)` |

#### 3️⃣ 구조 요소 (Structural Elements)

| 요소 | 폰트 패밀리 | CSS 변수 |
|------|----------|---------|
| **섹션 제목** (12px) | SF Pro Text | `var(--font-family-text)` |
| **탭** (13px) | SF Pro Text | `var(--font-family-text)` |
| **툴팁** (12px) | SF Pro Text | `var(--font-family-text)` |
| **페이지 타이틀** (15px) | SF Pro Display | `var(--font-family-display)` |

#### 4️⃣ 제목/헤더 (Headers & Titles)

| 요소 | 크기 | 폰트 패밀리 | CSS 변수 |
|------|------|----------|---------|
| **페이지 메인 타이틀** | 15px | SF Pro Display | `var(--font-family-display)` |
| **모달 헤더** | 16px | SF Pro Display | `var(--font-family-display)` |
| **헤드라인** | 17px | SF Pro Display | `var(--font-family-display)` |
| **타이틀 3** | 20px | SF Pro Display | `var(--font-family-display)` |
| **타이틀 2** | 22px | SF Pro Display | `var(--font-family-display)` |
| **타이틀 1** | 28px | SF Pro Display | `var(--font-family-display)` |
| **특대 타이틀** | 34px | SF Pro Display | `var(--font-family-display)` |

#### 5️⃣ 네비게이션 요소

| 요소 | 폰트 패밀리 | CSS 변수 |
|------|----------|---------|
| **메인 메뉴** (LeftPane) | SF Pro Text | `var(--font-family-text)` |
| **서브 메뉴** | SF Pro Text | `var(--font-family-text)` |
| **탭** | SF Pro Text | `var(--font-family-text)` |
| **브레드크럼** | SF Pro Text | `var(--font-family-text)` |

#### 6️⃣ 특수 요소

| 요소 | 폰트 패밀리 | CSS 변수 |
|------|----------|---------|
| **코드 블록** | SF Mono | `var(--font-family-mono)` |
| **숫자 데이터** (ID, 금액) | SF Mono | `var(--font-family-mono)` |
| **날짜/시간** (ISO 형식) | SF Mono | `var(--font-family-mono)` |

#### 핵심 원칙

**13px 이하 = SF Pro Text**
- 모든 본문, 입력, 버튼, 라벨, 테이블, 뱃지

**15px 이상 = SF Pro Display**
- 모든 제목, 헤더, 타이틀

**코드/숫자 = SF Mono**
- 기술 데이터, 코드 블록, 정형 숫자

### 적용 예시

```css
/* ✅ 올바른 방법 - CSS 변수 사용 */
.text {
  font-family: var(--font-family-system);
}

/* ✅ iOS 스타일 직접 지정 (CSS 변수 없을 때만) */
.text {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}

/* ❌ 절대 금지 - 커스텀 폰트 하드코딩 */
.text {
  font-family: "Helvetica", Arial, sans-serif;
}
```

### 폰트 렌더링 최적화

**모든 텍스트 요소에 필수 적용:**

```css
.text {
  font-family: var(--font-family-system);

  /* 🍎 애플 표준 텍스트 렌더링 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

### 금지 사항

1. **❌ 웹 폰트 로딩 금지**: Google Fonts, Adobe Fonts 등 외부 폰트 금지
2. **❌ 커스텀 폰트 금지**: 시스템 폰트 외 사용 금지
3. **❌ 하드코딩 금지**: CSS 변수 사용 필수

---

## 🎨 적용 원칙

### 1. 일관성 (Consistency)

**같은 유형의 요소는 페이지와 무관하게 동일한 크기**

- 모든 입력 필드 = 13px
- 모든 날짜/시간 = 12px
- 모든 버튼 = 13px
- 모든 뱃지 = 11px

### 2. 계층성 (Hierarchy)

**정보 중요도에 따른 3단계 크기**

```
제목/강조 (15px)
  ↓
본문/입력 (13px)
  ↓
보조정보 (12px)
  ↓
뱃지/라벨 (11px)
```

### 3. LeftPane 기준 준수

**모든 크기는 LeftPane(13px)과 조화**

| 크기 | 용도 | 정확한 값 |
|------|------|----------|
| **13px** | 일반 콘텐츠 | 본문, 입력, 버튼, 링크 |
| **12px** | 보조 정보 | 테이블 헤더, 메타데이터 |
| **11px** | 뱃지/힌트 | 상태, 카테고리 |
| **15px** | 페이지 제목 | 섹션 타이틀 |
| **16px+** | 특수 제목 | 모달, 헤더 (표 참조) |

---

## 📝 개발자 체크리스트

새로운 컴포넌트/페이지 개발 시 필수 확인:

### 폰트 크기 (Font Size)
- [ ] 모든 입력 요소가 **정확히 13px**인가?
- [ ] 모든 버튼이 **정확히 13px**인가?
- [ ] 테이블 헤더가 **정확히 12px**인가?
- [ ] 뱃지가 **정확히 11px**인가?
- [ ] font-size CSS 변수를 사용했는가? (하드코딩 절대 금지)
- [ ] 같은 유형의 요소가 다른 페이지와 **정확히 동일한 크기**인가?
- [ ] 제목은 정확한 크기(15px/16px/17px/20px/22px/28px/34px)만 사용했는가?

### 폰트 패밀리 (Font Family)
- [ ] 모든 입력/버튼/본문이 **SF Pro Text** (`var(--font-family-text)`)인가?
- [ ] 15px 이상 제목이 **SF Pro Display** (`var(--font-family-display)`)인가?
- [ ] 코드/숫자 데이터가 **SF Mono** (`var(--font-family-mono)`)인가?
- [ ] font-family CSS 변수를 사용했는가? (하드코딩 절대 금지)
- [ ] 외부 웹 폰트를 로딩하지 않았는가? (Google Fonts 등 금지)

---

## 🔍 검증 방법

### 1. 시각적 검증
- LeftPane과 나란히 비교
- 페이지 간 동일 요소 크기 비교

### 2. 코드 검증
```bash
# 하드코딩 검사
grep -r "font-size: [0-9]" src/
```

### 3. 접근성 검증
- 본문 최소 13px 확인
- 대비율 4.5:1 확인

---

## 🔗 관련 문서

- [CLAUDE.md](../CLAUDE.md) - 하드코딩 금지 규칙
- [tokens.css](../frontend/aims-uix3/src/shared/design/tokens.css) - CSS 변수 정의 (Line 203-228)

---

**최종 업데이트**: 2025-11-08
**버전**: 2.0 (규칙 중심으로 전면 개정)
**검증**: tokens.css 기준
