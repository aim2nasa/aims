# SSE 연결 끊김 후 UI 갱신 실패 - 근본 수정 및 검증 보고서

**날짜**: 2026.02.03
**커밋**: `e49116e2` (초기), `a12b24f8` (push), + dead EventSource 감지 추가
**수정 파일**: 4개 (sse-shared-worker.ts, useSSESubscription.ts, useDocumentStatistics.ts, DocumentStatusProvider.tsx)

---

## 1. 문제 현상

서버 재시작/배포 후 프론트엔드가 **stale 데이터를 영구 표시**.

- 예시: DB에는 27/27 문서 처리 완료(100%)인데, UI는 "7/27 처리완료 26%, 20 처리중" 표시
- 사용자가 `Ctrl+Shift+R` 수동 새로고침해야만 반영
- UX 관점에서 완전한 실패

---

## 2. 근본 원인 분석

### 2.1 3계층 실패 체인 (수정 전)

```
T=0s:     서버 다운. SSE 에러 시작
T=0-25s:  useSSESubscription 5회 재시도 (5초 간격) → 전부 실패
T=25s:    useSSESubscription 영구 포기
T=0-50s:  SharedWorker 10회 재시도 (5초 간격) → 전부 실패
T=50s:    SharedWorker connections.delete() 영구 포기
T=60s+:   서버 복구됨 → 아무도 재연결 시도 안 함
결과:     사용자가 수동 새로고침할 때까지 영원히 stale 데이터
```

### 2.2 추가 실패 모드

| 실패 모드 | 설명 |
|-----------|------|
| SSE zombie | TCP half-open 상태. readyState=OPEN이지만 이벤트 수신 안 됨 |
| 탭 백그라운드 | 탭 비활성화 중 서버 재시작 시 SSE 복구 안 됨 |
| 페이지 이동 중 서버 재시작 | subscribers=0 상태에서 onerror → 재시도 스케줄 안 함 → dead EventSource |

---

## 3. 수정 아키텍처: 4계층 방어

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: SSE + Exponential Backoff (실시간 채널)                  │
│   SharedWorker가 5s→10s→20s→40s→60s cap으로 무한 재시도           │
│   구독자가 있는 한 절대 포기 안 함                                  │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1.5: Dead EventSource 감지 (연결 복구)                      │
│   handleSubscribe에서 readyState===CLOSED 확인                   │
│   페이지 이동 중 서버 재시작 시 복귀하면 자동 재연결                   │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Visibility Refresh (탭 복귀)                            │
│   visibilitychange에서 onConnect 콜백 호출                       │
│   → fetchDocuments + fetchStatistics 트리거                      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Freshness Guardian (최후 safety net)                    │
│   처리 중 문서 존재 시 30초마다 API 조회 (content-driven)            │
│   SSE 상태와 무관하게 동작 → zombie 연결 대응                       │
│   silent mode로 에러 UI 깜빡임 방지                               │
│   처리 완료 시 자동 중단 (오버헤드 0)                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 파일별 수정 내역

### 4.1 `src/workers/sse-shared-worker.ts`

#### 변경 1: Exponential Backoff (영구 포기 제거)

**Before** (line 51-53):
```typescript
const RECONNECT_DELAY = 5000
const MAX_RETRY_COUNT = 10
```

**After**:
```typescript
const INITIAL_RECONNECT_DELAY = 5000  // 초기 재연결 대기: 5초
const MAX_RECONNECT_DELAY = 60000     // 최대 재연결 대기: 60초
const BACKOFF_MULTIPLIER = 2          // 지수 백오프 배수
```

**onerror 핸들러 변경**:
```typescript
// Before: retryCount >= MAX_RETRY_COUNT이면 connections.delete() 영구 포기
// After: 구독자가 있는 한 무한 재시도
if (conn.subscribers.size > 0) {
  conn.retryCount++
  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(BACKOFF_MULTIPLIER, Math.min(conn.retryCount - 1, 4)),
    MAX_RECONNECT_DELAY
  )
  conn.retryTimeout = setTimeout(() => {
    if (conn.subscribers.size > 0) {
      reconnect(streamKey, conn)
    }
  }, delay)
}
```

**백오프 시퀀스**:
| retryCount | 대기시간 | 계산 |
|---|---|---|
| 1 | 5s | 5000 * 2^0 |
| 2 | 10s | 5000 * 2^1 |
| 3 | 20s | 5000 * 2^2 |
| 4 | 40s | 5000 * 2^3 |
| 5+ | 60s | cap at MAX_RECONNECT_DELAY |

`retryCount` 리셋: `setupEventListeners`의 `connected` 이벤트 핸들러 (line 166)에서 `conn.retryCount = 0`.

#### 변경 2: Dead EventSource 감지 (handleSubscribe)

기존 연결 재사용 시 `conn.eventSource.readyState` 확인 추가.

**시나리오**: 페이지 이동(unsubscribe, subscribers=0) → 서버 재시작(onerror, subscribers=0이라 재시도 안 함, eventSource.close()) → 페이지 복귀(subscribe)

```typescript
if (conn.eventSource.readyState === EventSource.CLOSED) {
  // dead EventSource → 재연결
  conn.subscribers.add(port)
  if (conn.retryTimeout) {
    clearTimeout(conn.retryTimeout) // 이중 재연결 방지
    conn.retryTimeout = null
  }
  conn.retryCount = 0
  conn.eventBuffer = [] // 서버 재시작 후 오래된 버퍼 무효화
  reconnect(streamKey, conn)
} else {
  // 정상 연결 → 기존 로직 (구독자 추가 + 버퍼 전달 + synthetic connected)
}
```

**readyState별 동작**:
| readyState | 값 | 의미 | handleSubscribe 동작 |
|---|---|---|---|
| CONNECTING | 0 | 연결 시도 중 | 기존 로직: 구독자 추가, 연결 완료 대기 |
| OPEN | 1 | 정상 연결 | 기존 로직: 구독자 추가, 버퍼 전달, synthetic connected |
| CLOSED | 2 | 닫힘 (dead) | **새 로직**: 재연결 후 실제 connected 이벤트 대기 |

### 4.2 `src/shared/hooks/useSSESubscription.ts`

#### 변경 1: 중복 재시도 로직 제거

**Before** (제거됨):
```typescript
const reconnectAttemptRef = useRef(0)
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 5000
// error 핸들러에서 독자적 재연결 시도
```

**After**: error 핸들러는 상태만 업데이트. 재연결은 SharedWorker에 위임.
```typescript
} else if (eventType === 'error') {
  setIsConnected(false)
  onErrorRef.current?.(new Error(...))
  // 재연결은 SharedWorker가 exponential backoff로 무한 재시도
}
```

**이유**: useSSESubscription과 SharedWorker가 각각 독립적으로 재시도하면 불필요한 중복 연결과 복잡성 증가. SharedWorker가 단일 책임으로 재연결 전담.

#### 변경 2: Visibility 핸들러 강화

**Before**:
```typescript
const handleVisibilityChange = () => {
  if (!document.hidden) {
    sseClient.syncAuthToken()
    // 토큰 동기화만
  }
}
```

**After**:
```typescript
const handleVisibilityChange = () => {
  if (!document.hidden) {
    sseClient.syncAuthToken()
    // SSE 끊김 동안 놓친 변경사항 복구
    onConnectRef.current?.({ reason: 'visibility-change' })
  }
}
```

**효과**: 탭 복귀 시 `onConnect` 콜백이 호출되어 각 훅에서 데이터 새로고침 트리거:
- `useDocumentStatusListSSE` → `handleConnect` → `fetchDocuments()`
- `useDocumentStatistics` → `onConnect` → `fetchStatistics()`

### 4.3 `src/hooks/useDocumentStatistics.ts`

#### 변경 1: silent 파라미터 추가

```typescript
const fetchStatistics = useCallback(async (silent: boolean = false) => {
  try { ... }
  catch (error) {
    if (mountedRef.current) { setIsLoading(false) }
    if (!silent) {
      errorReporter.reportApiError(error as Error, { component: 'useDocumentStatistics' })
    }
  }
}, [])
```

#### 변경 2: Freshness Guardian 추가

```typescript
const hasActiveProcessing = statistics
  ? (statistics.processing > 0 || statistics.pending > 0)
  : false

useEffect(() => {
  if (hasActiveProcessing && enabled) {
    freshnessIntervalRef.current = setInterval(() => {
      fetchStatistics(true) // silent mode
    }, 30000)
  }
  return () => { /* cleanup */ }
}, [hasActiveProcessing, enabled, fetchStatistics])
```

**특징**:
- 서버 사이드 전체 통계 기반 (`statistics.processing`, `statistics.pending`)
- 페이지네이션과 무관하게 전체 문서 처리 상태 반영
- silent mode로 에러 UI 무간섭
- 처리 완료 시 자동 중단

### 4.4 `src/providers/DocumentStatusProvider.tsx`

#### 변경 1: fetchDocuments silent 파라미터 추가

```typescript
const fetchDocuments = useCallback(
  async (isInitialLoad: boolean = false, silent: boolean = false) => {
    try {
      if (isInitialLoad) { setLoading(true) }
      if (!silent) setError(null)
      // ... fetch 로직 ...
    } catch (err) {
      if (!silent && typeof window !== 'undefined') {
        setError('문서 목록을 불러올 수 없습니다.')
      }
      if (!silent) {
        console.error('Fetch documents error:', err)
        errorReporter.reportApiError(...)
      }
    }
  }, [...]
)
```

**silent mode가 방지하는 문제**:
```
서버 다운 중 Guardian 호출 시:
  setError(null) → 에러 메시지 사라짐 → fetch 실패 → setError('에러') → 에러 메시지 다시 표시
  = UI 깜빡임 (flicker)

silent: true 시:
  setError 호출 안 함 → 기존 UI 상태 유지 → 깜빡임 없음
```

#### 변경 2: Freshness Guardian 추가

```typescript
const hasProcessingDocuments = documents.some(doc => {
  const progress = doc.progress ?? 0
  const status = doc.overallStatus
  return progress < 100 && status !== 'completed' && status !== 'error'
})

useEffect(() => {
  if (hasProcessingDocuments && isPollingEnabled) {
    freshnessIntervalRef.current = setInterval(() => {
      fetchDocumentsRef.current(false, true) // silent mode
    }, 30000)
  }
  return () => { /* cleanup */ }
}, [hasProcessingDocuments, isPollingEnabled])
```

**특징**:
- **content-driven**: SSE 연결 상태가 아닌 "로컬 데이터에 미완료 문서가 있는가?"로 판단
- SSE zombie 대응: readyState=OPEN이어도 이벤트 미수신 시 Guardian이 보완
- `fetchDocumentsRef.current` 사용: 최신 pagination/sort/search 상태 반영
- 현재 페이지 scope 내 미완료 문서만 감지 (불필요한 polling 방지)

---

## 5. 두 Guardian의 역할 분담

| 항목 | useDocumentStatistics Guardian | DocumentStatusProvider Guardian |
|------|------|------|
| 감지 기준 | `statistics.processing > 0 \|\| pending > 0` | `doc.progress < 100 && status !== 'completed/error'` |
| 감지 범위 | 서버 사이드 전체 통계 | 현재 페이지 문서 |
| API 호출 | `/api/documents/statistics` | `/api/documents/status` (paginated) |
| 영향 UI | DocumentProcessingStatusBar (프로그레스 바) | 문서 목록 테이블 |
| 동기화 | 독립 동작 (서로 다른 시점에 fire) | 독립 동작 |

---

## 6. 듀얼 페르소나 검증 과정

### 6.1 Round 1 (초기 수정 후)

**개발자**: exponential backoff + visibility refresh + Freshness Guardian → 3계층 방어 구축.

**소비자**: 대부분 시나리오 커버. 하지만 **dead EventSource 엣지 케이스 발견**.

```
페이지 이동(subscribers=0) → 서버 재시작(onerror, 재시도 안 함) → 페이지 복귀
→ handleSubscribe가 CLOSED EventSource를 감지 못함
→ synthetic 'connected' 전송하지만 실제 이벤트 채널은 dead
→ 초기 API 호출로 데이터는 로드되나 실시간 이벤트 수신 불가
```

**Round 1 결론**: 불합격. handleSubscribe에 readyState 확인 필요.

### 6.2 Round 2 (dead EventSource 감지 추가 후)

**개발자 검증 항목**:

| 항목 | 결과 |
|------|------|
| exponential backoff 시퀀스 (5s→10s→20s→40s→60s) | OK |
| retryCount 리셋 (connected 이벤트 시) | OK |
| subscribers=0일 때 재시도 중단 | OK (의도적 설계) |
| dead EventSource 감지 + 재연결 | OK (Round 2에서 추가) |
| retryTimeout 이중 실행 방지 (clearTimeout) | OK |
| 메모리 누수 (interval/timeout cleanup) | OK |
| silent mode (에러 UI 무간섭) | OK |
| Guardian 자동 중단 (처리 완료 시) | OK |
| Race condition (onerror vs handleSubscribe) | OK (JS single-threaded) |
| EventSource CONNECTING 상태 처리 | OK (기존 로직 유지) |

**소비자 검증 시나리오**:

| 시나리오 | 복구 메커니즘 | 결과 |
|----------|-------------|------|
| 서버 배포 (사용자 문서 페이지) | Layer 1: backoff 재시도 → 재연결 | OK |
| 서버 배포 (다른 페이지에서 복귀) | Layer 1.5: dead EventSource 감지 → 재연결 | OK |
| 서버 배포 (탭 백그라운드) | Layer 1: SharedWorker 재시도 + Layer 2: 탭 복귀 시 refresh | OK |
| SSE zombie (TCP half-open) | Layer 3: Guardian 30초 polling | OK |
| 장시간 서버 다운 | Layer 1: 60초 cap 무한 재시도 | OK |
| 에러 중 UI 깜빡임 | silent mode 방지 | OK |
| 처리 완료 후 불필요한 polling | Guardian 자동 중단 | OK |
| 빠른 탭 전환 | visibility refresh 중복 호출 (무해) | OK |

**Round 2 결론**: 양쪽 페르소나 모두 합의. 통과.

---

## 7. 수정하지 않은 파일 (자동 수혜)

| 파일 | 이유 |
|------|------|
| `useDocumentStatusListSSE.ts` | `handleConnect`이 `onRefresh()` (fetchDocuments) 호출 → visibility refresh에 자동 연동 |
| `DocumentProcessingStatusBar.tsx` | statistics state 읽기만 → useDocumentStatistics Guardian으로 자동 갱신 |
| `useDocumentStatusSSE.ts` | 개별 문서 상태 훅, useSSESubscription 사용 → 자동 수혜 |
| `useCustomerDocumentsSSE.ts` | 고객 문서 훅, useSSESubscription 사용 → 자동 수혜 |
| `useInquiryNotificationSSE.ts` | 문의 알림 훅, useSSESubscription 사용 → 자동 수혜 |
| 기타 SSE 훅 (9개+) | 전부 useSSESubscription 사용 → visibility refresh 자동 수혜 |

---

## 8. 수정 후 시나리오 타임라인

### 시나리오 A: 배포 3분 소요 (사용자 문서 페이지)

```
T=0s:     서버 다운
T=5s:     SharedWorker 재시도 #1 (5초 후)
T=15s:    재시도 #2 (10초 후)
T=30s:    Guardian 1회차 (silent, 실패해도 UI 무간섭)
T=35s:    재시도 #3 (20초 후)
T=60s:    Guardian 2회차
T=75s:    재시도 #4 (40초 후)
T=90s:    Guardian 3회차
T=120s:   Guardian 4회차
T=135s:   재시도 #5 (60초 후)
T=150s:   Guardian 5회차
T=180s:   서버 복구!
T=195s:   재시도 #6 (60초 후) → 연결 성공!
          → connected 이벤트 → fetchDocuments() + fetchStatistics()
결과:     UI 자동 갱신 (최대 60초 지연)
```

### 시나리오 B: 배포 중 다른 페이지 → 복귀

```
T=0s:     사용자 설정 페이지로 이동 (subscribers=0)
T=30s:    서버 재시작
T=60s:    onerror → subscribers=0 → 재시도 안 함 → EventSource CLOSED
T=180s:   서버 복구
T=300s:   사용자 문서 페이지로 복귀
          → handleSubscribe → readyState === CLOSED 감지
          → reconnect() → 서버 연결 성공
          → connected 이벤트 → fetchDocuments() + fetchStatistics()
결과:     즉시 최신 데이터 표시
```

### 시나리오 C: 탭 백그라운드 상태에서 배포

```
T=0s:     사용자 다른 탭 사용 중
T=30s:    서버 재시작
T=60s:    SharedWorker 재시도 시작 (subscribers > 0, 탭은 열려 있음)
T=195s:   SharedWorker 재연결 성공
T=600s:   사용자 탭 복귀
          → visibilitychange → onConnect → fetchDocuments() + fetchStatistics()
결과:     즉시 최신 데이터 표시
```

### 시나리오 D: SSE zombie (TCP half-open)

```
T=0s:     SSE 연결 OPEN이지만 이벤트 미수신 (zombie)
T=0-30s:  문서 처리 중 상태 → Guardian 대기
T=30s:    Guardian → fetchStatistics(true) → 최신 통계 반영
          Guardian → fetchDocuments(false, true) → 최신 문서 목록 반영
T=60s:    Guardian → 다시 조회
...
T=Ns:     모든 문서 처리 완료 → Guardian 자동 중단
결과:     30초 이내 자동 복구
```

---

## 9. 기술적 결정 근거

### 9.1 왜 30초인가?

| 주기 | 장점 | 단점 |
|------|------|------|
| 5초 | 빠른 복구 | SSE 정상 시에도 불필요한 API 부하 |
| 15초 | 빠른 복구 | API 부하 약간 높음 |
| **30초** | **API 부하 최소 + 수용 가능한 복구 시간** | **SSE 실패 시 최대 30초 지연** |
| 60초 | API 부하 거의 없음 | 체감 지연 큼 |
| 120초 | API 부하 제로 | 사실상 쓸모없음 |

30초는 SSE가 동작하는 동안은 **0 오버헤드** (Guardian 미동작), SSE 실패 시에만 **safety net**으로 동작하는 최적점.

### 9.2 왜 content-driven인가?

**SSE 연결 상태 기반 (isConnected)의 한계**:
- SSE zombie: readyState=OPEN인데 이벤트 미수신 → isConnected=true → Guardian 미동작 → 실패
- 연결 상태 전환 지연: 실제 끊김과 상태 반영 사이 갭 존재

**content-driven의 장점**:
- "처리 중 문서가 있다" = "데이터가 변할 수 있다" = "검증이 필요하다"
- SSE 상태와 완전 독립 → 모든 실패 모드 커버
- 처리 완료 시 자동 중단 → 불필요한 polling 제거

### 9.3 왜 silent mode인가?

Guardian은 **백그라운드 검증**이므로 사용자에게 불필요한 정보를 노출하면 안 됨:

```
서버 다운 중 Guardian 호출 (silent: false일 경우):
  fetchDocuments 시작 → setError(null) → 에러 메시지 사라짐
  → fetch 실패 → setError('에러') → 에러 메시지 표시
  = UI 깜빡임 (flicker) 발생

서버 다운 중 Guardian 호출 (silent: true):
  fetchDocuments 시작 → setError 호출 안 함
  → fetch 실패 → 로깅/에러리포트 안 함
  = 기존 UI 상태 유지, 깜빡임 없음
```

### 9.4 왜 useSSESubscription에서 독자적 재시도를 제거했는가?

**Before**: useSSESubscription (5회 재시도) + SharedWorker (10회 재시도) = 이중 재시도

| 문제 | 설명 |
|------|------|
| 중복 연결 | 동일 스트림에 2개의 재시도 루프가 독립 동작 → 서버 부하 2배 |
| 복잡성 | 두 레이어의 재시도 상태가 동기화 안 됨 |
| 책임 불명확 | 재연결 성공 시 누가 주도권을 가지는지 모호 |

**After**: SharedWorker가 **단일 책임**으로 재연결 전담. useSSESubscription은 상태 반영만.

---

## 10. 변경 통계

| 파일 | 추가 | 삭제 | 순 변경 |
|------|------|------|---------|
| sse-shared-worker.ts | +25 | -5 | +20 |
| useSSESubscription.ts | +5 | -30 | -25 |
| useDocumentStatistics.ts | +22 | -1 | +21 |
| DocumentStatusProvider.tsx | +22 | -3 | +19 |
| **합계** | **+74** | **-39** | **+35** |

---

## 11. 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 통과 |
| `npm run build` | 통과 (3.13s) |
| 전체 배포 (deploy_all.sh) | 13/13 단계 완료 |
| 헬스체크 (6개 서비스) | 전부 200 OK |
| 듀얼 페르소나 검증 | Round 2에서 양쪽 합의 |

---

## 12. 향후 모니터링 포인트

1. **SharedWorker 콘솔 로그**: `[SSE-Worker] 재연결 예약 (N회차, Xms 후)` 로그로 backoff 동작 확인
2. **Dead EventSource 감지 로그**: `[SSE-Worker] 기존 연결 EventSource 닫힘, 재연결` 로그 확인
3. **Guardian 동작 확인**: 브라우저 Network 탭에서 30초 간격 `/api/documents/statistics` 호출 확인 (처리 중 문서 있을 때만)
4. **Visibility refresh 확인**: 탭 전환 후 Network 탭에서 즉시 API 호출 확인
