# 인터랙션 가능한 텍스트 스타일

클릭 또는 더블클릭을 지원하는 텍스트 요소의 시각적 표시 규칙.

## 핵심 원칙

**"인터랙션 가능한가?"만 표시하고, 클릭 횟수는 툴팁으로 안내**

- 사용자가 알아야 할 것: "이게 클릭 가능한가?"
- 클릭 횟수(1회/2회)를 시각적으로 구분하지 않음
- 웹 관례와 macOS 패턴 따름

## 스타일 규칙

### 호버 시 표시
```css
.interactive-text {
  cursor: pointer;
  transition: all 0.15s ease;
}

.interactive-text:hover {
  text-decoration: underline;
  opacity: 0.8;
}
```

### 색상 규칙
| 상황 | 색상 | 의미 |
|------|------|------|
| 링크성 클릭 (네비게이션) | `var(--color-ios-blue)` | 다른 곳으로 이동 |
| 편집/변경 클릭 | 기본 텍스트 색상 유지 | 현재 데이터 수정 |

### 툴팁 필수
- 호버 시 구체적 동작 안내
- 형식: `"더블클릭: 상품 변경"`, `"클릭: 상세보기"`

## 적용 예시

### 고객명 (클릭 + 더블클릭)
```tsx
<span
  className="contract-customer--clickable"  // 파란색
  onClick={handleClick}
  onDoubleClick={handleDoubleClick}
>
  {customerName}
</span>
```

### 상품명 (더블클릭만)
```tsx
<Tooltip content="더블클릭: 상품 변경">
  <span
    className="contract-product--clickable"  // 기본 색상
    onDoubleClick={handleDoubleClick}
  >
    {productName}
  </span>
</Tooltip>
```

## CSS 클래스 패턴

```css
/* 클릭 가능 (파란색 + 밑줄) */
.xxx--clickable {
  cursor: pointer;
  color: var(--color-ios-blue);
  transition: all 0.15s ease;
}

.xxx--clickable:hover {
  text-decoration: underline;
  opacity: 0.8;
}

/* 편집 가능 (기본색 + 밑줄) */
.xxx--editable {
  cursor: pointer;
  transition: all 0.15s ease;
}

.xxx--editable:hover {
  text-decoration: underline;
  opacity: 0.8;
}
```

## 관련 컴포넌트
- `ContractAllView.tsx`: 고객명, 상품명
- `ExcelRefiner.tsx`: 상품명 셀
- `CustomerAllView.tsx`: 고객명
