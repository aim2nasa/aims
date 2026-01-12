# Annual Report 재시도 상태 표시 구현

> 작성일: 2026-01-12
> 상태: 검토 필요

## 요구사항

AR 문서 파싱 진행 상황을 사용자에게 명확히 표시:

| 상태 | 표시 형식 | 예시 |
|------|----------|------|
| 처리 중 (1차) | `{소유주} AR [1/3]` | 홍길동 AR [1/3] |
| 처리 중 (2차) | `{소유주} AR [2/3]` | 홍길동 AR [2/3] |
| 처리 중 (3차) | `{소유주} AR [3/3]` | 홍길동 AR [3/3] |
| 성공 | `{소유주} AR` | 홍길동 AR |
| 실패 (3회 후) | `{소유주} AR [error]` + 재시도 버튼 | 홍길동 AR [error] |

## 현재 구현 (v1 - 문제 있음)

### 수정 파일

1. **AnnualReportTab.tsx** (line 941-953)
```tsx
<div className="row-owner">
  <span className="owner-name">{report.customer_name || '-'} AR</span>
  {/* 처리 중/대기 중: [1/3] 형식 */}
  {(isProcessing || isPending) && (
    <span className="retry-count">
      [{report.retry_count || 1}/3]
    </span>
  )}
  {/* 실패: [error] 표시 */}
  {isError && (
    <span className="retry-count retry-count--error">[error]</span>
  )}
</div>
```

2. **AnnualReportTab.css** (line 397-436)
```css
/* 소유주 칼럼 내부 구조 */
.row-owner {
  display: flex;
  align-items: center;
  gap: 4px;
}

.row-owner .owner-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 재시도 횟수 표시 [1/3] */
.row-owner .retry-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-ios-text-secondary-light);
  background-color: var(--color-ios-fill-tertiary-light);
  padding: 1px 4px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 실패 상태 [error] */
.row-owner .retry-count--error {
  color: var(--color-ios-system-red);
  background-color: rgba(255, 59, 48, 0.12);
  font-weight: 600;
}
```

### 백엔드 데이터 흐름

1. **큐 관리자** (`queue_manager.py`)
   - `retry_count` 필드로 재시도 횟수 추적 (0~3)
   - 3회 실패 시 `failed` 상태

2. **파싱 워커** (`main.py:177`)
   - 실패 시 `files.ar_retry_count` 필드 업데이트
   ```python
   db["files"].update_one(
       {"_id": file_id},
       {"$set": {"ar_retry_count": retry_count}}
   )
   ```

3. **API 응답** (`RawAnnualReportData`)
   - `retry_count?: number` - 재시도 횟수 (1~3)
   - `status?: 'completed' | 'error' | 'processing' | 'pending'`

## 문제점

(사용자 피드백 대기)

---

## 개선안

(문제점 파악 후 작성 예정)
