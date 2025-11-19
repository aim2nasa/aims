# 내 파일 페이지 깜빡임 해결

## 문제 요약

내 파일(Personal Files) 페이지에서 5초마다 폴링할 때 변경사항이 없어도 화면이 깜빡이는 문제 발생.

문서 라이브러리는 깜빡임이 없지만, 내 파일은 동일한 데이터임에도 리렌더링되어 UX 저하.

## 문제 진단

### Playwright 테스트로 정밀 분석

15초 동안 DOM Mutation Observer로 측정:

**수정 전:**
- 총 DOM 변경: **36회**
- 렌더링 횟수: **6회** (5초마다 2회씩)
- 패턴: `childList` 변경 (노드 제거 → 추가)

**수정 후:**
- 총 DOM 변경: **0회**
- 렌더링 횟수: **0회**
- ✅ 깜빡임 완전 제거

### 테스트 코드 (참고용)

```typescript
// tests/flicker-analysis.spec.ts
test('내 파일 페이지 DOM 변경 추적', async ({ page }) => {
  await page.goto('http://localhost:5181')

  // 내 파일 페이지 열기
  const profileButton = page.locator('button[aria-label="프로필 메뉴"]')
  if (await profileButton.count() > 0) {
    await profileButton.click()
    await page.waitForTimeout(500)
  }
  await page.click('text=내 파일')
  await page.waitForTimeout(2000)

  // DOM 변경 추적 (15초)
  const mutationData = await page.evaluate(() => {
    return new Promise((resolve) => {
      let totalMutations = 0
      const filesList = document.querySelector('.files-list, .file-list-row, .files-content')

      const observer = new MutationObserver((mutations) => {
        totalMutations += mutations.length
      })

      observer.observe(filesList, {
        childList: true,
        subtree: true,
        attributes: true
      })

      setTimeout(() => {
        observer.disconnect()
        resolve({ totalMutations })
      }, 15000)
    })
  })

  // 기대값: 15초 동안 10회 미만 DOM 변경
  expect(mutationData.totalMutations).toBeLessThan(10)
})
```

## 근본 원인 3가지

### 1. 타입 불일치로 인한 캐시 무효화

**문제:**
```typescript
const docSize = doc.fileSize || doc.file_size || doc.size || 0  // string 가능!
if (item.size !== docSize) {  // number !== string → 항상 true!
  item = createNew()  // 매번 새 객체 생성
}
```

백엔드에서 `fileSize`가 문자열로 오는 경우, 캐시 비교 시 타입 불일치로 **항상 다르다고 판단**.

**해결:**
```typescript
const rawSize = doc.fileSize || doc.file_size || doc.size || 0
const docSize = typeof rawSize === 'string' ? parseInt(rawSize, 10) : rawSize
```

### 2. 폴링마다 loading 상태 업데이트

**문제:**
```typescript
const loadFolderContents = async (folderId) => {
  setLoading(true)   // ← 5초마다 실행
  // ... 데이터 로드
  setLoading(false)  // ← 깜빡임 유발
}

setInterval(() => loadFolderContents(folderId), 5000)
```

5초마다 `setLoading(true)` → `setLoading(false)` → 리렌더링 → DOM 변경

**해결:**
```typescript
const loadFolderContents = async (folderId, options?: { silentRefresh?: boolean }) => {
  // 폴링 중에는 loading 상태 변경하지 않음
  if (!options?.silentRefresh) {
    setLoading(true)
  }
  // ...
  if (!options?.silentRefresh) {
    setLoading(false)
  }
}

setInterval(() => {
  loadFolderContents(folderId, { silentRefresh: true })
}, 5000)
```

### 3. 문서 상태 변경 미감지

**문제:**
```typescript
// name과 size만 비교
if (item.name !== docName || item.size !== docSize) {
  item = createNew()
}
```

OCR 완료, AR 완료 등 **문서 처리 상태**가 변경되어도 감지하지 못함.

**해결:**
```typescript
const docStatus = doc.status || doc.overallStatus
const docProgress = doc.progress

const hasChanged =
  item.name !== docName ||
  item.size !== docSize ||
  item.document?.status !== docStatus ||
  item.document?.overallStatus !== docStatus ||
  item.document?.progress !== docProgress

if (hasChanged) {
  item = createNew()
}
```

## 적용된 해결책

### 파일 변환 캐시 시스템

```typescript
// 🍎 문서 → 파일 아이템 변환 캐시 (깜빡임 방지)
const docToFileItemCache = useRef<Map<string, PersonalFileItem>>(new Map())

// 🍎 폴더 시스템 아이템 캐시 (깜빡임 방지)
const folderItemCache = useRef<Map<string, PersonalFileItem>>(new Map())
```

### 변경 감지 및 객체 재사용

```typescript
setCurrentFolderItems(prev => {
  const prevMap = new Map(prev.map(item => [item._id, item]))

  const mergedItems = finalItems.map(newItem => {
    const existingItem = prevMap.get(newItem._id)

    if (!existingItem) return newItem

    // 변경 감지
    if (
      existingItem.name !== newItem.name ||
      existingItem.size !== newItem.size ||
      existingItem.updatedAt !== newItem.updatedAt
    ) {
      return newItem
    }

    // 변경 없으면 기존 객체 재사용 (참조 유지 → React 리렌더링 스킵)
    return existingItem
  })

  // 모든 항목이 재사용되었으면 기존 배열 유지
  const allReused = mergedItems.every(item => prevMap.get(item._id) === item)
  return allReused ? prev : mergedItems
})
```

### Silent Refresh 패턴

```typescript
// 사용자 액션: loading UI 표시
loadFolderContents(folderId)

// 폴링: loading UI 없이 조용히 업데이트
loadFolderContents(folderId, { silentRefresh: true })
```

## 최종 수정 파일

### PersonalFilesView.tsx

**주요 변경:**
1. Line 218-221: 캐시 시스템 추가 (useRef)
2. Line 224-228: `silentRefresh` 옵션 추가
3. Line 285-322: 문서 변환 캐시 로직 (타입 정규화 + 상태 감지)
4. Line 326-360: 변경 감지 및 참조 유지
5. Line 378-379: lastUpdated 단순화 (문서 라이브러리와 동일)
6. Line 463-466: 폴링 시 loading 상태 변경 방지
7. Line 536: 폴링에 silentRefresh 전달

## 검증 방법

### 1. 수동 테스트
```bash
# 개발 서버 실행
cd frontend/aims-uix3
npm run dev

# 브라우저에서 확인:
# 1. 내 파일 페이지 열기
# 2. 5초간 관찰 - 깜빡임 없음
# 3. 화면 상단 "최근 업데이트" 시간이 5초마다 갱신됨
# 4. 파일 목록은 변하지 않음
```

### 2. Playwright 자동 테스트
```bash
cd frontend/aims-uix3
npx playwright test flicker-analysis.spec.ts

# 기대 결과:
# ✅ 총 DOM 변경: 0회
# ✅ 렌더링 횟수: 0회
# ✅ 2 passed
```

### 3. 개발자 도구 확인
```javascript
// 브라우저 콘솔에서:
// 5초마다 폴링 로그 확인
// "📁 loadFolderContents(null): ..."
// "✅ 모든 항목 재사용 → 기존 배열 유지"
```

## 문서 라이브러리와 비교

| 항목 | 문서 라이브러리 | 내 파일 (수정 전) | 내 파일 (수정 후) |
|-----|--------------|----------------|----------------|
| 폴링 주기 | 5초 | 5초 | 5초 |
| DOM 변경 (15초) | 0회 | 36회 | **0회** ✅ |
| 렌더링 횟수 | 0회 | 6회 | **0회** ✅ |
| 캐시 전략 | Provider | 없음 | useRef Map ✅ |
| 변경 감지 | O | X | **O** ✅ |
| Silent Refresh | O | X | **O** ✅ |

## 핵심 교훈

### React 성능 최적화의 골든 룰

1. **객체 참조 유지** (`===` 비교로 리렌더링 스킵)
   ```typescript
   // ❌ 나쁜 예
   setState([...items])  // 항상 새 배열

   // ✅ 좋은 예
   setState(prev => changed ? newItems : prev)  // 변경 시에만
   ```

2. **캐시 비교 시 타입 정규화**
   ```typescript
   // ❌ 나쁜 예
   if (item.size !== doc.size)  // string vs number

   // ✅ 좋은 예
   const size = typeof doc.size === 'string' ? parseInt(doc.size) : doc.size
   ```

3. **폴링은 조용하게 (Silent Refresh)**
   ```typescript
   // ❌ 나쁜 예
   setInterval(() => {
     setLoading(true)  // UI 깜빡임
     fetch()
     setLoading(false)
   })

   // ✅ 좋은 예
   setInterval(() => {
     fetch({ silent: true })  // 조용히 업데이트
   })
   ```

## 관련 문서

- [CONFIGURATION_CANDIDATES.md](./CONFIGURATION_CANDIDATES.md) - 폴링 주기 등 설정값 후보
- [DocumentStatusProvider.tsx](../frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx) - 문서 라이브러리 참조 구현
- [PersonalFilesView.tsx](../frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx) - 최종 수정 코드

## 성능 지표

### Before (수정 전)
- 폴링당 DOM 변경: 12회 (remove + add)
- 15초 총 DOM 변경: 36회
- 불필요한 리렌더링: 매 폴링마다

### After (수정 후)
- 폴링당 DOM 변경: 0회
- 15초 총 DOM 변경: 0회
- 리렌더링: 데이터 실제 변경 시에만

### 개선 효과
- **DOM 변경 100% 감소** (36회 → 0회)
- **리렌더링 100% 감소** (6회 → 0회)
- **UX 깜빡임 완전 제거**
- **배터리/CPU 사용량 절감**

## 향후 적용 사항

이 패턴을 다른 실시간 업데이트 뷰에도 적용:
- 문서 검색 뷰
- 고객 관리 뷰
- 지역별 고객 뷰
- 관계도 뷰

모든 폴링 화면에 Silent Refresh + 캐시 + 변경 감지 패턴 적용 권장.
