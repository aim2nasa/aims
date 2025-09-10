# AIMS Design System - Common Components

AIMS 디자인 가이드라인을 준수하는 공통 컴포넌트 라이브러리입니다.

## 사용법

```jsx
import { Button, Input, Card, Badge } from '@/components/common';

// Button 사용 예시
<Button variant="primary" size="large">확인</Button>

// Input 사용 예시  
<Input placeholder="이름을 입력하세요" allowClear />

// Card 사용 예시
<Card title="고객 정보" hoverable>
  <p>카드 내용</p>
</Card>

// Badge 사용 예시
<Badge status="success" text="완료" />
<Badge count={5}>알림</Badge>
```

## 컴포넌트 목록

### Button
- **Props**: variant, size, disabled, loading, icon, onClick 등
- **Variants**: primary, secondary, danger, success, ghost
- **Sizes**: small, default, large

### Input
- **Props**: size, status, prefix, suffix, allowClear, placeholder 등
- **Sizes**: small, default, large
- **Status**: error, warning, success

### Card
- **Props**: title, extra, bordered, hoverable, loading, size 등
- **Sizes**: small, default, large
- **Features**: 클릭 가능, 로딩 상태, 헤더/푸터

### Badge
- **Props**: status, size, count, dot, overflowCount 등
- **Types**: 카운트 배지, 상태 배지, 도트 배지
- **Status**: success, processing, error, warning, default

## 디자인 원칙

1. **CSS Variables 사용**: 모든 스타일은 CSS Variables 기반
2. **일관성**: 디자인 가이드라인 100% 준수
3. **접근성**: WAI-ARIA 지침 준수
4. **반응형**: 모든 브레이크포인트 지원

## 개발 가이드

새로운 공통 컴포넌트를 추가할 때:

1. `ComponentName.js` - 컴포넌트 구현
2. `ComponentName.css` - CSS Variables 기반 스타일
3. `index.js`에 export 추가
4. PropTypes 정의 필수
5. 접근성 고려 (role, tabIndex, aria-* 등)