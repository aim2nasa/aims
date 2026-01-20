---
name: ui-components
description: AIMS UI 컴포넌트 사용 규칙. 툴팁, 모달, 버튼 등 UI 작성 시 자동 사용
---

# AIMS UI 컴포넌트 사용 규칙

이 스킬은 AIMS 프로젝트의 UI 컴포넌트 사용 규칙을 적용합니다.

## 1. 툴팁 (Tooltip)

### 필수 규칙
**모든 툴팁은 AIMS 스타일 Tooltip 컴포넌트 사용**

| 금지 | 사용 |
|------|------|
| HTML `title` 속성 | `@/shared/ui/Tooltip` 컴포넌트 |
| 브라우저 기본 툴팁 | AIMS 커스텀 툴팁 |

### 올바른 사용법
```tsx
import { Tooltip } from '@/shared/ui/Tooltip';

// 올바름
<Tooltip content="검증된 주소">
  <span className="icon">...</span>
</Tooltip>

// 잘못됨 - title 속성 사용 금지
<span title="검증된 주소" className="icon">...</span>
```

## 2. 모달 (Modal)

### 필수 규칙
| 용도 | 컴포넌트 |
|------|----------|
| 기본 모달 | `@/shared/ui/Modal` |
| 드래그/리사이즈 모달 | `@/shared/ui/DraggableModal` |
| 확인 대화상자 | `AppleConfirmModal` + `useAppleConfirmController` |

**금지**: HTML `<dialog>`, Portal 직접 구현, ESC 핸들링 직접 구현

## 3. 버튼 (Button)

### 필수 규칙
| 금지 | 사용 |
|------|------|
| HTML `<button>` 직접 사용 | `@/shared/ui/Button` 컴포넌트 |

### Button variants
| variant | 용도 |
|---------|------|
| `primary` | 주요 액션 |
| `secondary` | 보조 액션 |
| `ghost` | 투명 배경 |
| `destructive` | 삭제/위험 액션 |
| `link` | 링크 스타일 |

### 예시
```tsx
import { Button } from '@/shared/ui/Button';

<Button variant="primary" onClick={handleSave}>저장</Button>
<Button variant="destructive" onClick={handleDelete}>삭제</Button>
```

## 4. 닫기 버튼 (CloseButton)

### 필수 규칙
모달/패널 닫기 버튼은 `@/shared/ui/CloseButton` 사용

```tsx
import { CloseButton } from '@/shared/ui/CloseButton';

<CloseButton onClick={onClose} ariaLabel="닫기" />
```

## 5. 아이콘 (SFSymbol)

### 필수 규칙
| 용도 | 컴포넌트 |
|------|----------|
| Apple SF Symbols | `SFSymbol` 컴포넌트 |
| 커스텀 아이콘 | 직접 SVG (`fill="currentColor"`) |

### SFSymbol 사용 예시
```tsx
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol';

<SFSymbol name="person.fill" size={SFSymbolSize.Body} weight={SFSymbolWeight.Regular} />
```

## 위반 예시와 수정

### 위반 1: title 속성 사용
```tsx
// 잘못됨
<span title="미검증 주소">?</span>

// 올바름
<Tooltip content="미검증 주소">
  <span>?</span>
</Tooltip>
```

### 위반 2: HTML button 직접 사용
```tsx
// 잘못됨
<button onClick={handleClick}>저장</button>

// 올바름
<Button variant="primary" onClick={handleClick}>저장</Button>
```
