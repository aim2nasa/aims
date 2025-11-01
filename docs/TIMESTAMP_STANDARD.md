# AIMS Timestamp 표준 가이드

## 현재 문제점

### 1. 손상된 데이터
```json
{
  "upload.uploaded_at": "2025-11-01T16:17:21.143xxx"  // ❌ 파싱 불가
}
```

### 2. 형식 혼용
| 위치 | 형식 | 예시 | 문제 |
|------|------|------|------|
| n8n upload | 손상 | `2025-11-01T16:17:21.143xxx` | ❌ 파싱 실패 |
| Python meta | UTC (Z 없음) | `2025-11-01T07:17:21.131Z` | ⚠️ 표준 아님 |
| Python OCR | KST | `2025-11-01T16:17:22.015+09:00` | ⚠️ UTC 아님 |
| Node.js | UTC | `2025-11-01T07:17:21.143Z` | ✅ 올바름 |

### 3. 발생하는 문제
- 프론트엔드에서 파싱 오류 (`NaN`)
- 정렬/필터링 실패
- 시간 계산 오류 (9시간 차이)

---

## 통일 표준

### 기본 원칙
```
✅ 저장: UTC (ISO 8601)
✅ 표시: 한국 시간 (KST)
✅ 형식: YYYY-MM-DDTHH:mm:ss.sssZ
✅ 정밀도: 밀리초 3자리
```

### 예시
```javascript
// 저장 (모든 시스템)
"2025-11-01T07:17:21.143Z"

// 표시 (프론트엔드)
"2025. 11. 1. 오후 4:17"
```

---

## 구현 방법

### 1. n8n 워크플로우

**현재 (DocPrepMain.json)**
```json
{
  "value": "={{ $now.format('yyyy-MM-dd\\'T\\'HH:mm:ss.SSSxxx') }}"
}
```

**수정**
```json
{
  "value": "={{ $now.toISO() }}"
}
```

---

### 2. Python 백엔드

**공통 유틸리티 생성**
```python
# src/shared/time_utils.py
from datetime import datetime, timezone

def utc_now_iso() -> str:
    """현재 UTC 시간을 ISO 8601 형식으로 반환"""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
```

**사용 예시**
```python
# ❌ 기존
"uploaded_at": datetime.now()

# ✅ 수정
from src.shared.time_utils import utc_now_iso
"uploaded_at": utc_now_iso()
```

---

### 3. Node.js 백엔드

**공통 유틸리티 생성**
```javascript
// backend/api/aims_api/lib/timeUtils.js
function utcNowISO() {
  return new Date().toISOString();
}

module.exports = { utcNowISO };
```

**사용 예시**
```javascript
// ❌ 기존
const timestamp = new Date().toISOString();

// ✅ 수정
const { utcNowISO } = require('./lib/timeUtils');
const timestamp = utcNowISO();
```

---

### 4. 프론트엔드 (React/TypeScript)

**공통 유틸리티 생성**
```typescript
// frontend/aims-uix3/src/shared/lib/timeUtils.ts

/**
 * ISO 8601 timestamp를 한국 시간으로 포맷팅
 */
export function formatDateTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 시간';

    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (e) {
    return '잘못된 시간';
  }
}

/**
 * 날짜만 포맷팅
 */
export function formatDate(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 날짜';

    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (e) {
    return '잘못된 날짜';
  }
}
```

**사용 예시**
```typescript
// ❌ 기존
{new Date(report.created_at).toLocaleString('ko-KR')}

// ✅ 수정
import { formatDateTime } from '@/shared/lib/timeUtils'
{formatDateTime(report.created_at)}
```

---

## 적용 순서

### Phase 1: 긴급 수정 (즉시)
1. **n8n `uploaded_at` 수정**
   - `DocPrepMain.json` Line 871 수정
   - `$now.toISO()` 사용

2. **손상된 데이터 정리**
   ```javascript
   // fix_damaged_timestamps.js
   const fixed = uploadedAt.replace(/xxx$/, 'Z');
   ```

### Phase 2: 유틸리티 생성 (1주일)
1. `src/shared/time_utils.py` 생성
2. `backend/api/aims_api/lib/timeUtils.js` 생성
3. `frontend/aims-uix3/src/shared/lib/timeUtils.ts` 생성

### Phase 3: 점진적 적용 (2주일)
1. 새 코드부터 유틸리티 함수 사용
2. 기존 코드는 리팩토링 시 교체

---

## 체크리스트

### n8n 워크플로우
- [ ] `uploaded_at` → `$now.toISO()` 수정
- [ ] `queued_at` → `$now.toISO()` 수정
- [ ] 손상된 데이터 정리 스크립트 실행

### Python 백엔드
- [ ] `time_utils.py` 생성
- [ ] `datetime.now()` → `utc_now_iso()` 교체
- [ ] `datetime.utcnow().isoformat()` → `utc_now_iso()` 교체

### Node.js 백엔드
- [ ] `timeUtils.js` 생성
- [ ] 일관된 `utcNowISO()` 사용

### 프론트엔드
- [ ] `timeUtils.ts` 생성
- [ ] `toLocaleString()` → `formatDateTime()` 교체
- [ ] `toLocaleDateString()` → `formatDate()` 교체

---

## 금지 사항

### ❌ 절대 사용 금지
```python
# Python
datetime.now()                    # 타임존 없음
datetime.now().isoformat()        # 타임존 없음
```

```javascript
// JavaScript (표시용 제외)
new Date().toLocaleString()       # 일관성 없음
```

```json
// n8n
$now.format('...')                # 커스텀 형식 금지
```

### ✅ 항상 사용
```python
# Python
from src.shared.time_utils import utc_now_iso
timestamp = utc_now_iso()
```

```javascript
// Node.js
const { utcNowISO } = require('./lib/timeUtils');
const timestamp = utcNowISO();
```

```typescript
// TypeScript
import { formatDateTime } from '@/shared/lib/timeUtils'
const display = formatDateTime(timestamp)
```

---

## FAQ

### Q1. 왜 UTC로 저장하나요?
**A.** 글로벌 표준이며 타임존 계산이 정확합니다. 표시할 때만 로컬 타임존으로 변환합니다.

### Q2. 기존 KST 데이터는 어떻게 하나요?
**A.** 점진적으로 UTC로 변환합니다. 새 데이터부터 UTC를 사용하고, 기존 데이터는 읽을 때 변환합니다.

### Q3. MongoDB에 Date 객체로 저장해도 되나요?
**A.** 가능하지만 ISO 8601 문자열 권장. 문자열이 디버깅과 데이터 교환에 유리합니다.

### Q4. 밀리초가 필요한가요?
**A.** 네. 문서 처리 순서와 성능 측정에 필요합니다. 3자리로 충분합니다.

---

## 참고

### ISO 8601 형식
```
YYYY-MM-DDTHH:mm:ss.sssZ

2025-11-01T07:17:21.143Z
│   │  │  │  │  │  │   └─ UTC (필수)
│   │  │  │  │  │  └───── 밀리초 (3자리)
│   │  │  │  │  └──────── 초
│   │  │  │  └─────────── 분
│   │  │  └────────────── 시간 (24시)
│   │  └───────────────── 일
│   └──────────────────── 월
└──────────────────────── 년
```

### 타임존 표기
```
Z                   = UTC
+09:00              = KST (한국 표준시)
+00:00              = UTC (명시적)
없음                = ❌ 금지! (타임존 불명확)
```
