# AR 파일 매핑 모달 Flex 레이아웃 문제

## 문제 현상

테이블이 모달의 전체 높이를 채우지 않고, 테이블과 warning 메시지 사이에 큰 빈 공간이 발생함.

```
┌─────────────────────────────────┐
│ AR 파일 매핑 확인          [X] │  ← Header
├─────────────────────────────────┤
│ [검색] [필터]      미매핑 3개   │  ← Toolbar
├─────────────────────────────────┤
│ □ 파일명     AR고객명  매핑고객 │  ← Table Header
│ □ AR_김보성...  김보성   선택   │
│ □ AR_김보성...  김보성   선택   │
│ □ 김보성보유...  김보성   선택   │
│ □ 신상철보유...  신상철   신상철 │
│ □ 안영미annual  안영미   안영미 │
│ □ 정부군보유...  정부군   정부군 │
├─────────────────────────────────┤
│                                 │  ← 빈 공간 (문제!)
│                                 │
│                                 │
├─────────────────────────────────┤
│ ⚠️ 3개 파일의 고객 매핑이 필요  │  ← Warning
├─────────────────────────────────┤
│              [취소] [6개 등록]  │  ← Footer
└─────────────────────────────────┘
```

## 기대 동작

```
┌─────────────────────────────────┐
│ AR 파일 매핑 확인          [X] │
├─────────────────────────────────┤
│ [검색] [필터]      미매핑 3개   │
├─────────────────────────────────┤
│ □ 파일명     AR고객명  매핑고객 │
│ □ AR_김보성...  김보성   선택   │
│ □ AR_김보성...  김보성   선택   │
│ □ 김보성보유...  김보성   선택   │
│ □ 신상철보유...  신상철   신상철 │
│ □ 안영미annual  안영미   안영미 │
│ □ 정부군보유...  정부군   정부군 │
│ (테이블이 남은 공간 전체 차지)  │  ← 빈 공간 = 테이블 배경
│ (스크롤 가능)                   │
│                                 │
├─────────────────────────────────┤
│ ⚠️ 3개 파일의 고객 매핑이 필요  │
├─────────────────────────────────┤
│              [취소] [6개 등록]  │
└─────────────────────────────────┘
```

## DOM 구조

```
.draggable-modal (position: fixed, width/height 인라인)
├── .draggable-modal__header (flex-shrink: 0)
├── .draggable-modal__content (flex: 1 1 0)
│   └── .batch-ar-modal__content (flex: 1 1 0)
│       ├── .ar-file-table (flex: 1 1 0)
│       │   ├── .ar-file-table__toolbar (flex-shrink: 0)
│       │   └── .ar-file-table__table-container (flex: 1 1 0) ← 확장 안됨!
│       │       └── table
│       └── .batch-ar-modal__warning (flex-shrink: 0)
└── .draggable-modal__footer (flex-shrink: 0)
```

## 시도한 해결책

### 1. CSS 수정 (실패)
```css
.ar-file-table__table-container {
  flex-grow: 1;
  flex-shrink: 1;
  flex-basis: 0;
  min-height: 0;
}
```
- 결과: 적용 안됨 (Vite HMR 캐싱 문제 의심)

### 2. CSS `flex: 1 1 auto` → `flex: 1 1 0` (실패)
```css
.draggable-modal__content {
  flex: 1 1 0;  /* auto에서 0으로 변경 */
}
```
- 결과: 적용 안됨

### 3. 인라인 스타일 추가 (실패)
```tsx
<div style={{ flex: '1 1 0', minHeight: 0, height: '100%' }}>
```
- 모든 레벨에 인라인 스타일 추가
- 결과: 여전히 적용 안됨

### 4. 콘솔에서 직접 스타일 적용 (성공!)
```javascript
document.querySelector('.ar-file-table__table-container').style.cssText =
  'flex: 1 1 0; min-height: 0; overflow: auto; border: 2px solid red;';
```
- 결과: 테이블 컨테이너가 확장됨 (빨간 테두리로 확인)

## 핵심 의문

**콘솔에서 직접 스타일 적용하면 작동하는데, 코드의 인라인 스타일은 왜 안 되는가?**

가능한 원인:
1. React가 인라인 스타일을 렌더링하지 않음?
2. 다른 CSS가 더 높은 우선순위로 덮어씀?
3. HMR이 코드 변경을 반영하지 않음?
4. 브라우저 캐시?

## 디버깅 필요

1. DevTools에서 `.ar-file-table__table-container` 요소 선택
2. Styles 탭에서 인라인 스타일이 있는지 확인
3. Computed 탭에서 실제 적용된 flex 값 확인
4. 인라인 스타일이 취소선으로 표시되는지 확인 (다른 CSS에 의해 덮어쓰임)

## 참고: ExcelRefiner (정상 작동)

ExcelRefiner는 모달이 아닌 페이지 레벨에서 동일한 패턴 사용:
```css
.excel-refiner {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.excel-refiner__main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
```

차이점:
- ExcelRefiner: 페이지 레벨, 부모가 viewport height
- AR Modal: DraggableModal 내부, 부모가 인라인 스타일로 고정 height
