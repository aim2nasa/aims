# CSS flex-wrap vs Grid 레이아웃 이슈 (초성 필터 버튼 3줄 문제)

## 날짜
2026-02-16

## 증상
- **관계별 고객보기**에서 초성 필터 버튼이 3줄로 표시됨 (Galaxy Note 9, 360x740)
- **전체 문서 보기**, **지역별 고객보기**에서는 동일 뷰포트에서 2줄로 정상 표시
- 모두 동일한 공유 컴포넌트 `InitialFilterBar` 사용

## 실패한 시도 (3회)
1. **CSS 오버라이드 (높은 specificity)** - 관계별 뷰 전용 CSS에서 `min-width`, `gap` 조정 → 실패
2. **DOM 구조 변경** - InitialFilterBar를 스크롤 컨테이너 밖으로 이동 → 실패
3. **부모 overflow-y 제거** - `.center-pane-view__content`의 `overflow-y: hidden` 설정 → 실패

## 근본 원인

### flex-wrap의 한계
`flex-wrap: wrap`은 **가용 너비에 의존**하여 줄바꿈을 결정한다.

```
가용 너비 270px 이상 → 한 줄에 10개 → 2줄 (10+9) ✓
가용 너비 260px 이하 → 한 줄에 8~9개 → 3줄 (8+8+3) ✗
```

### 뷰별 DOM 깊이 차이
```
[전체 문서 보기] - 2줄 정상
  .center-pane-view__content (padding: 8px, overflow-y: auto, scrollbar: 6px)
    └ InitialFilterBar ← 직접 자식, 최대 너비 확보

[관계별 고객보기] - 3줄 버그
  .center-pane-view__content (padding: 8px, overflow-y: auto)
    └ .relationship-view__content (display: flex)
      └ .relationship-tree (padding: 2px, overflow-y: auto, scrollbar: 6px)
        └ InitialFilterBar ← 2단계 중첩, 추가 padding+scrollbar로 너비 감소
```

관계별 뷰는 `.relationship-tree`의 padding(4px)과 scrollbar(6px)로 인해 가용 너비가 약 10px 줄어들면서, 한 줄에 10개가 들어가지 못하고 8~9개로 줄어 3줄이 됨.

### 이론과 실제의 괴리
이론적 계산으로는 10개/줄이 가능하지만, 실제로는 브라우저 렌더링 엔진의 서브픽셀 반올림, box-model 계산 차이, Tooltip 래퍼(`<div class="tooltip-trigger">`) 등의 미세한 차이가 누적되어 결과가 달라짐.

## 해결: CSS Grid `repeat(10, 1fr)`

```css
/* 변경 전: flex-wrap (가용 너비 의존) */
.initial-filter-bar__initials {
  flex-wrap: wrap;
  overflow-x: visible;
  gap: 2px;
}

/* 변경 후: CSS Grid (너비 무관, 10칼럼 강제) */
.initial-filter-bar__initials {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  overflow-x: visible;
  gap: 2px;
}

/* Tooltip 래퍼가 그리드 셀을 채우도록 */
.initial-filter-bar__initials > .tooltip-trigger {
  display: flex;
}

.initial-filter-bar__initial {
  width: 100%;
  min-width: 0;
  height: 24px;
  font-size: 11px;
  padding: 0;
}
```

### 왜 Grid가 확실한가
| 속성 | flex-wrap | CSS Grid |
|------|-----------|----------|
| 칼럼 수 결정 | 가용 너비 ÷ 아이템 크기 (유동적) | `repeat(10, 1fr)` (고정) |
| 부모 scrollbar 영향 | 받음 (너비 감소 → 칼럼 수 변동) | 받지 않음 (항상 10칼럼) |
| DOM 깊이 영향 | 받음 (중첩될수록 너비 감소) | 받지 않음 |
| 결과 예측 가능성 | 낮음 | 높음 |

### 결과
| 초성 타입 | Grid 결과 |
|-----------|-----------|
| 한글 (19개) | 2줄 (10+9) |
| 영문 (26개) | 3줄 (10+10+6) |
| 숫자 (10개) | 1줄 |

## 교훈

1. **"가용 너비 기반 줄바꿈"은 불안정하다** - DOM 깊이, scrollbar, padding이 뷰마다 다르면 같은 컴포넌트도 다르게 렌더링됨
2. **칼럼 수가 고정이면 Grid를 써라** - `repeat(N, 1fr)`은 너비와 무관하게 N칼럼을 보장
3. **이론적 계산을 과신하지 마라** - 브라우저 렌더링의 서브픽셀 처리, Tooltip 래퍼 등 계산에 잡히지 않는 요소가 있다
4. **같은 컴포넌트가 다른 뷰에서 다르게 보이면** → 부모 컨테이너의 DOM 구조/CSS 차이를 의심할 것

## 관련 파일
- `frontend/aims-uix3/src/shared/ui/InitialFilterBar/InitialFilterBar.css` (수정됨)
- `frontend/aims-uix3/src/shared/ui/Tooltip.tsx` (tooltip-trigger 래퍼 구조)
- `frontend/aims-uix3/src/components/CenterPaneView/CenterPaneView.css` (부모 컨테이너)

## 관련 커밋
- `6e806c75` - 최초 480px 2줄 그리드 도입 (flex-wrap 방식)
