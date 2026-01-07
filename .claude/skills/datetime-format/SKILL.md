---
name: datetime-format
description: AIMS 날짜/시간 형식 표준. 날짜 표시, 시간 포맷팅, Date 관련 작업 시 자동 사용
---

# AIMS 날짜/시간 형식 표준

이 스킬은 AIMS 프로젝트의 날짜/시간 표시 규칙을 적용합니다.

## 표준 형식

| 유형 | 형식 | 예시 |
|------|------|------|
| 날짜+시간 | `YYYY.MM.DD HH:mm:ss` | `2025.01.07 18:35:32` |
| 날짜만 | `YYYY.MM.DD` | `2025.01.07` |
| 시간만 | `HH:mm:ss` | `18:35:32` |
| 시간 (초 없음) | `HH:mm` | `18:35` |

## 규칙

| 항목 | 값 |
|------|-----|
| 시간제 | 24시간제 |
| 날짜 구분자 | 점(`.`) |
| 시간대 | KST (한국 표준시) |

## 금지 형식

| 금지 | 이유 |
|------|------|
| `2025-01-07` | 하이픈 구분자 사용 금지 |
| `2025/01/07` | 슬래시 구분자 사용 금지 |
| `01/07/2025` | MM/DD/YYYY 형식 금지 |
| `오후 6:35` | 12시간제 금지 |

## 유틸리티 함수

**위치**: `@/shared/lib/timeUtils`

```typescript
import { formatDate, formatDateTime } from '@/shared/lib/timeUtils'

// 날짜만
formatDate(new Date())  // "2025.01.07"

// 날짜 + 시간
formatDateTime(new Date())  // "2025.01.07 18:35:32"
```

## 직접 포맷팅 시

유틸리티 함수를 사용할 수 없는 경우:

```typescript
// 날짜 + 시간
const formatDateTime = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
}

// 날짜만
const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}.${month}.${day}`
}
```

## 위반 예시와 수정

### 위반 1: 하이픈 구분자
```typescript
/* 잘못됨 */
const date = '2025-01-07'

/* 올바름 */
const date = '2025.01.07'
```

### 위반 2: 12시간제 사용
```typescript
/* 잘못됨 */
const time = date.toLocaleTimeString('ko-KR', { hour12: true })
// "오후 6:35:32"

/* 올바름 */
const time = formatDateTime(date)
// "2025.01.07 18:35:32"
```

### 위반 3: toLocaleDateString 직접 사용
```typescript
/* 잘못됨 - 브라우저마다 형식 다름 */
const dateStr = new Date().toLocaleDateString()

/* 올바름 */
import { formatDate } from '@/shared/lib/timeUtils'
const dateStr = formatDate(new Date())
```

## 서버 응답 처리

MongoDB/API에서 받은 날짜 문자열 변환:

```typescript
import { formatDateTime } from '@/shared/lib/timeUtils'

// ISO 문자열을 AIMS 형식으로
const isoDate = '2025-01-07T09:35:32.000Z'
const formatted = formatDateTime(new Date(isoDate))
// "2025.01.07 18:35:32" (KST)
```

## 테이블/리스트 표시 예시

```tsx
// 테이블 셀
<td>{formatDateTime(item.createdAt)}</td>

// 상세 정보
<span className="text-secondary">
  등록일: {formatDate(item.registeredAt)}
</span>

// 로그/이력
<div className="log-entry">
  [{formatDateTime(log.timestamp)}] {log.message}
</div>
```
