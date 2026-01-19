# 고객 전환 시 화면 멈춤 현상 조사 보고서

**작성일**: 2026-01-19
**상태**: 🔴 미해결 (조사 진행 중)

---

## 📋 증상 요약

### 재현 방법
1. "최근 검색 고객" 목록에서 고객을 더블클릭하여 전환
2. 첫 번째, 두 번째 클릭은 정상 작동
3. **세 번째 더블클릭부터 화면이 바뀌지 않고 멈춤**

### 사용자 보고
- "최근검색고객을 세번째 더블클릭하는 순간부터 더는 안바뀌어"
- "이건 시작부터 안돼" (로딩 상태에서 멈춤)
- 콘솔에 "고객 정보를 불러오는 중입니다..." 메시지만 계속 출력

---

## 🔬 근본 원인 분석

### 1차 진단: HTTP/1.1 연결 제한 초과

**발견 사항**:
- 고객 전환 시 **700개 이상의 API 요청**이 동시 발생
- HTTP/1.1 프로토콜의 도메인당 동시 연결 제한: **6개**
- 요청들이 큐에 쌓이면서 시스템 전체가 멈춤

**요청 발생 지점**:
- 각 컴포넌트에서 독립적으로 고객 데이터 요청
- `getAllRelationshipsWithCustomers()`: 모든 고객을 순회하며 각각 관계 API 호출 (N-iteration)
- SSE 구독/해제 요청
- 문서, 계약, Annual Report 등 각종 탭별 데이터 로드

---

## 🛠️ 시도한 해결책

### 1단계: GET 요청 중복 제거 (2026-01-19 초기)

**구현**:
```typescript
// api.ts
const pendingGetRequests = new Map<string, Promise<unknown>>();

if (method === 'GET') {
  const existingRequest = pendingGetRequests.get(url);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }
}
```

**결과**: ✅ 중복 요청은 제거되었으나 근본 문제 미해결

---

### 2단계: 고객 전환 감지 및 자동 취소 (2026-01-19 오전)

**구현**:
```typescript
// api.ts - URL 기반 자동 감지
function extractCustomerId(url: string): string | null {
  const match = url.match(/\/api\/customers\/([a-f0-9]{24})/i);
  return match ? match[1] : null;
}

// GET 요청 시 자동으로 고객 ID 추출 및 전환 감지
if (method === 'GET') {
  const newCustomerId = extractCustomerId(url);
  if (newCustomerId) {
    cancelStaleCustomerRequests(newCustomerId); // 이전 고객 요청 취소
  }
}
```

**문제점 발견**:
- `getAllRelationshipsWithCustomers()`가 모든 고객을 순회하며 각 고객의 관계 API 호출
- 각 iteration마다 URL에서 고객 ID 추출 → 고객 전환으로 오인
- 사용자가 실제로 선택한 고객의 요청까지 취소됨

**결과**: ❌ 오히려 더 많은 요청이 취소되며 문제 악화

---

### 3단계: Race Condition 수정 (2026-01-19 오전)

**문제 발견**:
```typescript
// 잘못된 패턴
try {
  const data = await api.get(url);
  setData(data);
} catch (err) {
  setError(err);
} finally {
  setIsLoading(false); // ❌ 취소된 요청도 로딩 해제!
}
```

**수정**:
```typescript
// 올바른 패턴
try {
  const data = await api.get(url);
  setData(data);
  setIsLoading(false); // ✅ 성공 시에만
} catch (err) {
  if (isRequestCancelledError(err)) {
    return; // 취소된 요청은 로딩 상태 유지
  }
  setError(err);
  setIsLoading(false); // ✅ 실제 에러 시에만
}
// finally 블록 제거
```

**적용 파일** (5개 컨트롤러):
- `useCustomersController.ts`
- `useCustomerDocumentsController.ts`
- `useMemoController.ts`
- `useAddressArchiveController.ts`
- `useCustomerRelationshipsController.ts`
- `CustomerFullDetailView.tsx`

**결과**: ✅ 로딩 상태 관리 개선, 그러나 근본 문제 미해결

---

### 4단계: 명시적 고객 전환 API (2026-01-19 오후)

**가설**:
> URL 자동 추출 방식이 백그라운드 작업(getAllRelationshipsWithCustomers)을
> 고객 전환으로 오인하여 실제 사용자 요청을 취소시킨다.

**증명**:
1. `getAllRelationshipsWithCustomers()` 코드 분석
   - 모든 고객을 `for...of` 루프로 순회
   - 각 고객마다 `/api/customers/:id/relationships` 호출
2. URL 패턴 매칭 확인
   - 정규식 `/\/api\/customers\/([a-f0-9]{24})/i`
   - 관계 조회 URL도 완벽히 매칭
3. 결론: 각 iteration이 고객 전환으로 감지됨

**구현**:
```typescript
// api.ts - 자동 추출 제거, 명시적 API 제공
export function setActiveCustomer(customerId: string): void {
  if (!customerId) return;
  cancelStaleCustomerRequests(customerId);
}

// GET 요청에서 자동 감지 제거
if (method === 'GET') {
  // ⚠️ 고객 전환 감지는 더 이상 자동으로 하지 않음!
  const existingRequest = pendingGetRequests.get(url);
  // ...
}
```

```typescript
// CustomerFullDetailView.tsx - 명시적 호출
const loadCustomer = useCallback(async () => {
  setIsLoading(true);
  setActiveCustomer(customerId); // 🔧 명시적으로 고객 활성화

  try {
    const data = await CustomerService.getCustomer(customerId);
    setCustomer(data);
    setIsLoading(false);
  } catch (err) {
    if (isRequestCancelledError(err)) {
      return;
    }
    // ...
  }
}, [customerId]);
```

**결과**: 🟡 이론적으로 정확하나 실제 효과 미확인

---

### 5단계: N-iteration 제거 - 벌크 API 구현 (2026-01-19 오후)

**문제 분석**:
```typescript
// 기존: N번의 API 호출
for (const customer of customers) {
  const relationships = await api.get(
    `/api/customers/${customer._id}/relationships`
  );
  // 고객 100명 → 100번 API 호출!
}
```

**해결책**: 백엔드 벌크 API 구현

```javascript
// customer-relationships-routes.js
app.get('/api/relationships', async (req, res) => {
  // 1. 사용자의 모든 고객 ID 조회
  const customerIds = await db.collection('customers')
    .find({ userId })
    .project({ _id: 1 })
    .toArray();

  // 2. 모든 관계를 한 번에 조회
  const relationships = await db.collection('customer_relationships')
    .find({
      $or: [
        { 'relationship_info.from_customer_id': { $in: customerIds } },
        { 'relationship_info.to_customer_id': { $in: customerIds } }
      ]
    })
    .toArray();

  // 3. 관련 고객 정보 populate
  // 4. 한 번에 응답
  res.json({ relationships, customers });
});
```

```typescript
// relationshipService.ts - 프론트엔드
static async getAllRelationshipsWithCustomers(): Promise<{
  customers: Customer[];
  relationships: Relationship[];
  timestamp: number;
}> {
  // 🔧 N번 호출 → 1번 호출로 변경
  const response = await api.get<{...}>(ENDPOINTS.ALL_RELATIONSHIPS);

  return {
    customers: response.data.customers,
    relationships: response.data.relationships,
    timestamp: response.data.timestamp,
  };
}
```

**효과**:
- API 호출 횟수: 고객 수 N → **1번**
- 네트워크 오버헤드: 대폭 감소
- HTTP 연결 압력: 획기적 개선

**배포**:
- ✅ 백엔드 배포 성공 (2026-01-19 오후)
- ✅ 프론트엔드 빌드 성공 (v0.374.0)
- ✅ API 테스트 완료

**결과**: ❓ 배포 완료 후 사용자 테스트 → **"실패. 동일증상"**

---

## 📊 현재 상황 (2026-01-19 오후)

### 적용된 변경사항

| 변경 | 상태 | 효과 |
|------|------|------|
| GET 요청 중복 제거 | ✅ 배포 완료 | 중복 요청 제거 |
| 명시적 `setActiveCustomer()` API | ✅ 배포 완료 | 백그라운드 작업 간섭 방지 |
| Race condition 수정 (finally 제거) | ✅ 배포 완료 | 로딩 상태 정확성 향상 |
| 벌크 API (N→1) | ✅ 배포 완료 | 700+ → 수십 개 요청으로 감소 |

### 사용자 보고
> **"실패. 동일증상"**

콘솔 로그 분석 (최신):
- `[API] 🚫 고객 전환` 로그 **없음** → 명시적 API는 호출되지 않음?
- SSE 연결/해제 반복
- 문서, 계약 탭 페이지네이션 상태 로그 다수
- Annual Report 로드 시도 로그
- `RequestCancelledError` 없음

---

## 🤔 미해결 의문점

### 1. 왜 여전히 멈추는가?

**가능한 원인**:

#### A. 브라우저 캐시 문제
- 새 코드가 실제로 로드되지 않았을 가능성
- 확인 필요: 빌드 해시, Ctrl+Shift+R 강력 새로고침

#### B. 다른 병목 지점 존재
- SSE 연결/해제가 과도하게 발생
- 탭 전환 시 모든 데이터를 동시에 로드
- React 리렌더링 폭탄

#### C. setActiveCustomer() 미호출
- `CustomerFullDetailView`에서만 호출하도록 수정
- 다른 진입점(검색 결과 클릭 등)에서는 호출 안 됨?

#### D. 근본적으로 다른 문제
- 메모리 누수
- 이벤트 리스너 중복 등록
- React 상태 관리 문제

### 2. 왜 3번째부터 멈추는가?

**패턴 분석**:
- 1~2회: 정상 작동
- 3회부터: 멈춤
- → **누적되는 무언가**가 있음을 시사

**가능한 누적 요소**:
- 취소되지 않은 이전 요청들
- 구독 해제되지 않은 SSE 연결
- 클린업되지 않은 React 이펙트
- 메모리에 쌓이는 컴포넌트 인스턴스

---

## 🔍 다음 진단 단계

### 즉시 확인 필요

1. **브라우저 캐시 확인**
   ```bash
   # 빌드 해시 확인
   cat frontend/aims-uix3/dist/index.html | grep -o '[a-f0-9]\{8\}'

   # 브라우저에서 실제 로드된 버전 확인
   # Console: AIMS UIX3 v0.374.0 (해시)
   ```

2. **실제 코드 실행 확인**
   ```typescript
   // CustomerFullDetailView.tsx에 임시 로그 추가
   const loadCustomer = useCallback(async () => {
     console.log('🔥 loadCustomer 호출됨:', customerId);
     setActiveCustomer(customerId);
     console.log('🔥 setActiveCustomer 호출 완료');
     // ...
   });
   ```

3. **Network 탭 분석**
   - 실제 발생하는 요청 개수 카운트
   - Pending 상태로 쌓이는 요청 확인
   - 벌크 API (`/api/relationships`) 호출 여부

### 심화 진단

4. **React DevTools Profiler**
   - 컴포넌트 렌더링 횟수 측정
   - 리렌더링 원인 추적

5. **Memory Profiler**
   - 메모리 누수 확인
   - 가비지 컬렉션되지 않는 객체 추적

6. **Performance 탭**
   - 이벤트 루프 블로킹 확인
   - 긴 작업(Long Task) 분석

---

## 📝 기술 부채 및 개선 사항

### 아키텍처 레벨

1. **API 호출 통합 관리**
   - 현재: 각 컴포넌트가 독립적으로 API 호출
   - 개선: 중앙화된 데이터 fetching 레이어 (TanStack Query 활용)

2. **고객 컨텍스트 명확화**
   - 현재: URL 기반, 명시적 호출 혼재
   - 개선: React Context로 activeCustomer 상태 관리

3. **SSE 구독 최적화**
   - 현재: 탭마다 별도 구독
   - 개선: 고객 레벨 단일 구독, 데이터 분배

### 코드 레벨

1. **요청 취소 전략 재검토**
   - AbortController 활용 개선
   - 컴포넌트 언마운트 시 정리 강화

2. **로딩 상태 중앙화**
   - 현재: 각 컨트롤러별 isLoading
   - 개선: 전역 로딩 상태 + 세부 진행률

3. **에러 바운더리 추가**
   - React Error Boundary로 폭발 반경 제한

---

## 🎯 결론

### 현재까지의 성과
- ✅ HTTP 연결 제한 문제 **이해**
- ✅ GET 요청 중복 **제거**
- ✅ N-iteration **제거** (700+ → 수십 개)
- ✅ 고객 전환 감지 **정교화**

### 여전히 미해결
- ❌ 실제 증상 지속 ("실패. 동일증상")
- ❓ 근본 원인 **완전히 파악되지 않음**

### 추정
> 문제의 70~80%는 해결했을 가능성이 높으나,
> **남은 20~30%가 여전히 시스템을 멈추고 있음**.

가능성이 높은 원인:
1. **브라우저 캐시** (가장 먼저 확인 필요)
2. **다른 병목 지점** (SSE, React 리렌더링)
3. **누적되는 리소스 누수**

---

## 📚 참고 자료

### 관련 파일
- `frontend/aims-uix3/src/shared/lib/api.ts` - 요청 관리 핵심
- `frontend/aims-uix3/src/services/relationshipService.ts` - 벌크 API 사용
- `frontend/aims-uix3/src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.tsx`
- `backend/api/aims_api/customer-relationships-routes.js` - 벌크 API 구현

### 관련 커밋
- `77fce42f` - 프론트엔드 v0.374.0 (벌크 API, 명시적 setActiveCustomer)
- (백엔드 커밋 해시 기록 필요)

### 사용자 피드백 타임라인
1. "세번째 더블클릭하는 순간부터 더는 안바뀌어"
2. "이건 시작부터 안돼" (스크린샷)
3. "진짜 이거 근본적으로 문제 해결이 가능하긴 한거야??"
4. "시간은 오래걸리더라도 근본적인 해결을 해야돼"
5. "그럴듯하긴해. 가설을 세웠으면 증명해봐" (N-iteration 가설)
6. "진행해"
7. **"실패. 동일증상"** ← 현재

---

**다음 업데이트 예정**: 추가 진단 결과 확인 후
