# iPad Safari 반응형 레이아웃 Lessons Learned

> **작성일**: 2026-01-08
> **문제**: iPad Safari에서 헤더가 잘리고 LeftPane footer가 안 보이는 현상
> **해결**: Flexbox + 100dvh 기반 레이아웃으로 완전 수정

---

## 1. iOS Safari 100vh 버그

### 문제
- `100vh`는 Safari URL 바를 **포함한** 높이를 반환
- 실제 뷰포트보다 약 44px~88px 더 큼 (URL 바 + 홈 인디케이터)
- 결과: 콘텐츠가 화면 밖으로 밀려남

### 해결
```css
/* 순서 중요: 폴백 먼저, 최신 표준 나중 */
height: -webkit-fill-available; /* Safari 15.4 미만 폴백 */
height: 100dvh; /* Safari 15.4+ (dynamic viewport height) */
```

### 핵심 개념
| 단위 | 설명 |
|------|------|
| `100vh` | URL 바 포함 전체 높이 (버그 원인) |
| `100dvh` | 동적 뷰포트 높이 - URL 바 상태에 따라 변함 |
| `100svh` | 작은 뷰포트 높이 - URL 바가 보일 때 기준 |
| `100lvh` | 큰 뷰포트 높이 - URL 바가 숨겨졌을 때 기준 |

---

## 2. CSS 변수 전파 문제

### 문제
```css
/* tokens.css */
--mainpane-height: calc(100vh - var(--header-height-base));
```
- 최상위에서 `100vh` 사용 → 모든 자식 요소에 버그 전파
- LeftPane, CenterPane 등이 모두 잘못된 높이 계산

### 해결
```css
@media (min-width: 1024px) and (max-width: 1366px) {
  :root {
    --header-height-base: 50px;
    --mainpane-height: calc(100dvh - 50px); /* 100vh → 100dvh */
  }
}
```

### 교훈
- **CSS 변수는 미디어쿼리에서 재정의 가능**
- 루트 변수가 잘못되면 전체 레이아웃에 영향
- 플랫폼별 변수 오버라이드로 해결

---

## 3. Flexbox로 Header 고정

### 문제
- `position: absolute` 기반 레이아웃에서 Header가 flex/grid 흐름에 참여 안 함
- iPad에서 Header가 화면 밖으로 밀림

### 해결
```css
.layout-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-main > header {
  flex-shrink: 0; /* 절대 축소 안됨 */
  height: 50px;
  min-height: 50px;
}
```

### 핵심
- `flex-shrink: 0` → 공간 부족해도 Header 축소 방지
- `min-height` + `max-height` 동시 설정 → 완벽한 고정 높이

---

## 4. 작업 방식 교훈

### ❌ 잘못된 접근
```
"헤더가 잘리네? 높이 60px → 50px로 줄여볼까?"
"그래도 안 되네? padding 줄여볼까?"
```
- 숫자만 바꾸는 "한번 해보고" 식 수정
- 근본 원인 파악 없이 증상만 치료

### ✅ 올바른 접근
```
1. 근본 원인 파악: iOS Safari 100vh 버그
2. 영향 범위 분석: CSS 변수 전파 경로 추적
3. 구조적 해결: Flexbox + 100dvh 기반 재설계
4. 검증: 실제 iPad에서 테스트
```

---

## 5. iPad 미디어쿼리 가이드

### 해상도 매핑
| 디바이스 | 가로 | 세로 | 미디어쿼리 |
|----------|------|------|-----------|
| iPad Mini | 1024px | 768px | `min-width: 1024px` |
| iPad 10.2" | 1080px | 810px | `max-width: 1366px` |
| iPad Air 11" | 1180px | 820px | `max-height: 850px` (세로 제한) |
| iPad Pro 11" | 1194px | 834px | |
| iPad Air 13" | 1229px | 832px | |
| iPad Pro 13" | 1366px | 1024px | |

### 권장 미디어쿼리
```css
/* iPad 전체 (가로 기준) */
@media (min-width: 1024px) and (max-width: 1366px) { }

/* iPad 세로 높이 제한 (Air 13" 832px 등) */
@media (min-width: 1024px) and (max-height: 850px) { }

/* iPad Mini 전용 */
@media (min-width: 1024px) and (max-width: 1100px) { }
```

---

## 6. 최종 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `layout.css` | iPad 미디어쿼리 + Flexbox + 100dvh 변수 |
| `Header.css` | iPad 50px 헤더 높이 |
| `components.css` | LeftPane footer 반응형 |
| `CustomerRegistrationView.css` | 폼 요소 압축 |

---

## 참고 자료

- [CSS Viewport Units (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)
- [The Large, Small, and Dynamic Viewport Units](https://web.dev/blog/viewport-units)
- Safari 15.4+ 릴리즈 노트: `dvh`, `svh`, `lvh` 지원 추가
