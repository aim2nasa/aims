# AIMS Frontend Design Guide

> AIMS 프론트엔드 개발을 위한 통일된 디자인 시스템 가이드라인

## 0. Design Philosophy (디자인 철학)

### 기본 철학
- **UX**: 최고의 사용자 경험을 제공하여 업무를 쉽고 빠르게 처리할 수 있게 한다.
- **간결함**: 불필요한 시각적 요소 제거, 핵심 정보 중심.
- **일관성**: 색상/폰트/레이아웃 통일.
- **확장성**: 고객 수백, 수천 명 데이터를 다뤄도 UI가 무너지지 않도록.
- **가시성**: 에러·상태를 즉시 알 수 있도록 강조.

### 디자인 지향점
- **애플의 디자인 철학**: 기능성과 아름다움의 완벽한 조화
- **미니멀리즘**: 복잡한 보험 업무를 단순하고 직관적으로
- **세련된 인터페이스**: 아름답고도 전문적인 사용자 경험

> 💡 모든 디자인 결정은 "사용자가 더 빠르고 정확하게 업무를 처리할 수 있는가?"를 기준으로 판단한다.

## 1. Color System (색상 체계)

### Primary Colors (주요 색상)
```
Primary Blue: #3b82f6 (메인 브랜드 색상)
Secondary Blue: #0ea5e9 (보조 브랜드 색상) 
Ant Design Blue: #1890ff (Ant Design 기본 파란색)
```

### Text Colors (텍스트 색상)
```
Primary Text:   #111827 (제목, 중요한 텍스트)
Secondary Text: #4b5563 (일반 텍스트)
Tertiary Text:  #6b7280 (보조 텍스트, 설명)
Disabled Text:  #9ca3af (비활성, 연한 텍스트)
```

### Status Colors (상태 색상)
```
Success: #10b981 (성공, 완료)
Warning: #f59e0b (경고, 대기)
Error:   #ef4444 (에러, 실패)
Info:    #3b82f6 (정보, 처리중)
```

### Background & Border (배경 및 테두리)
```
Background Primary:   #ffffff (메인 배경)
Background Secondary: #f9fafb (카드, 패널 배경)
Background Tertiary:  #f5f5f5 (입력 필드, 비활성 영역)

Border Light:  #f0f0f0 (연한 테두리)
Border Medium: #e5e7eb (일반 테두리)
Border Dark:   #d9d9d9 (진한 테두리)
```

## 2. Typography (타이포그래피)

### Font Sizes (폰트 크기)
```
xs:   10px (버튼 라벨, 보조 정보)
sm:   12px (캡션, 메타 정보)
base: 14px (기본 텍스트) ⭐ 기본값
lg:   16px (중요한 텍스트, 숫자)
xl:   18px (소제목)
xxl:  20px (페이지 제목)
```

### Font Weights (폰트 굵기)
```
normal:    400 (기본 텍스트)
medium:    500 (중요도 중간)
semibold:  600 (소제목, 버튼)
bold:      700 (제목, 강조)
```

### Line Height (줄 높이)
```
tight:  1.2 (제목용)
normal: 1.4 (일반 텍스트)
loose:  1.6 (긴 텍스트)
```

## 3. Spacing System (여백 체계)

### 4px 기준 배수 시스템
```
xs:  4px  (아이콘 간격, 최소 여백)
sm:  8px  (버튼 패딩, 작은 여백)
md:  12px (테이블 셀, 일반 패딩)
lg:  16px (카드 패딩, 섹션 여백)
xl:  24px (컨테이너 패딩, 큰 섹션 간격)
xxl: 32px (페이지 레벨 여백)
```

## 4. Component Standards (컴포넌트 표준)

### Buttons (버튼)
```
Primary Button:
- Background: #3b82f6
- Text: #ffffff
- Height: 32px (기본), 40px (large)
- Padding: 8px 16px
- Border-radius: 6px

Secondary Button:
- Background: transparent
- Border: 1px solid #d9d9d9
- Text: #4b5563
- Height: 32px (기본)
- Padding: 8px 16px

Small Button:
- Height: 24px
- Padding: 4px 8px
- Font-size: 12px
```

### Input Fields (입력 필드)
```
Default Input:
- Height: 32px
- Padding: 8px 12px
- Border: 1px solid #d9d9d9
- Border-radius: 6px
- Font-size: 14px

Disabled Input:
- Background: #f5f5f5
- Border: 1px solid #d9d9d9
- Color: #9ca3af
```

### Cards (카드)
```
Default Card:
- Background: #ffffff
- Border: 1px solid #e5e7eb
- Border-radius: 8px
- Padding: 16px
- Box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)
```

### Tables (테이블)
```
Table Header:
- Background: #f9fafb
- Border-bottom: 1px solid #e5e7eb
- Padding: 8px 12px
- Font-size: 12px
- Font-weight: 500
- Color: #6b7280
- Text-transform: uppercase
- Letter-spacing: 0.05em

Table Cell:
- Padding: 8px 12px
- Border-bottom: 1px solid #f0f0f0
- Font-size: 14px
```

### Status Badges (상태 배지)
```
Success Badge:
- Background: #dcfce7
- Color: #10b981
- Border-radius: 4px
- Padding: 4px 8px
- Font-size: 12px

Error Badge:
- Background: #fee2e2
- Color: #ef4444

Warning Badge:
- Background: #fef3c7
- Color: #f59e0b

Info Badge:
- Background: #dbeafe
- Color: #3b82f6
```

## 5. Layout Rules (레이아웃 규칙)

### Container (컨테이너)
```
Max-width: 1200px (데스크톱)
Padding: 24px (좌우 여백)
Margin: 0 auto (중앙 정렬)
```

### Responsive Breakpoints (반응형 브레이크포인트)
```
Mobile:  < 768px
Tablet:  768px - 1024px
Desktop: > 1024px

특별 브레이크포인트:
- 1300px: 텍스트 표시/숨김 기준
- 1200px: 컴팩트 모드 기준
```

### Grid System (그리드)
```
12-column grid 사용
Gutter: 16px (컬럼 간격)
```

## 6. Animation & Transitions (애니메이션)

### Transition Duration (전환 시간)
```
Fast:   150ms (호버 효과)
Normal: 250ms (기본 전환)
Slow:   350ms (복잡한 애니메이션)
```

### Easing Functions (이징 함수)
```
Default: ease-out
Smooth:  cubic-bezier(0.4, 0, 0.2, 1)
```

## 7. Usage Examples (사용 예시)

### CSS Variables 활용
```css
:root {
  /* Colors */
  --color-primary: #3b82f6;
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-success: #10b981;
  --color-error: #ef4444;
  
  /* Typography */
  --font-size-xs: 10px;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
}
```

### React 컴포넌트 예시
```jsx
// 표준 버튼 컴포넌트
const Button = ({ variant = 'primary', size = 'default', children, ...props }) => {
  const styles = {
    backgroundColor: variant === 'primary' ? 'var(--color-primary)' : 'transparent',
    color: variant === 'primary' ? '#ffffff' : 'var(--color-text-primary)',
    height: size === 'large' ? '40px' : '32px',
    padding: size === 'small' ? '4px 8px' : '8px 16px',
    fontSize: size === 'small' ? '12px' : '14px',
    border: variant === 'secondary' ? '1px solid #d9d9d9' : 'none',
    borderRadius: '6px',
    fontWeight: '500'
  };
  
  return <button style={styles} {...props}>{children}</button>;
};
```

## 8. Implementation Guidelines (구현 가이드라인)

### 우선순위
1. **기존 컴포넌트 리팩토링**: DocumentStatusDashboard부터 시작
2. **공통 컴포넌트 생성**: Button, Input, Card 등
3. **CSS Variables 도입**: 하드코딩된 값들을 변수로 교체
4. **Ant Design 테마 커스터마이징**: 일관된 색상 체계 적용

### 점진적 적용 방법
1. 새로운 기능 개발시 이 가이드라인 적용
2. 기존 컴포넌트는 수정할 때마다 점진적으로 가이드라인 적용
3. CSS Variables를 먼저 정의하고 하나씩 교체

### 주의사항
- 하드코딩된 색상값 (#3b82f6 등) 사용 금지 → CSS Variables 사용
- 임의의 폰트 크기 사용 금지 → 정의된 크기만 사용
- 4px 배수가 아닌 여백 사용 금지 → 정의된 spacing 값 사용

---

**마지막 업데이트**: 2025-09-01  
**작성자**: Claude (기존 코드 분석 기반)