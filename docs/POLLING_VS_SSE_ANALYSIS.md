# 전체문서보기 페이지: 폴링 vs SSE 분석

> 작성일: 2026-01-06
> 목적: 폴링 → SSE 전환 가능성 및 권장사항 분석

## 1. 현재 폴링 구현 분석

### 위치
- **주요 파일**: `frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx`
- **컨트롤러**: `frontend/aims-uix3/src/controllers/useDocumentStatusController.ts`
- **UI 컴포넌트**: `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx`

### 현재 폴링 방식

**DocumentStatusProvider.tsx (라인 376-385):**
```typescript
// 🔄 하이브리드 방식: 폴링(진행률) + SSE(완료 알림)
// - 5초 폴링: 처리 중인 문서의 진행률 업데이트 (0% → 30% → 60% → 100%)
// - SSE: 완료 시 즉시 반영 (폴링 대기 없이)
useEffect(() => {
  if (!isPollingEnabled) return

  const intervalId = setInterval(() => {
    fetchDocumentsRef.current(false)
    checkApiHealthRef.current()
  }, 5000) // 5초마다 폴링

  return () => clearInterval(intervalId)
}, [isPollingEnabled])
```

### 핵심 특징
| 항목 | 값 |
|------|-----|
| 폴링 주기 | 5초 (setInterval) |
| 폴링 활성화 토글 | UI에서 제어 가능 |
| API 호출 | `/api/documents/status` |
| 상태 관리 | `isPollingEnabled` state |

---

## 2. 기존 SSE 인프라 분석

### 백엔드 SSE 엔드포인트

**server.js (라인 8240-8281):**
```javascript
/**
 * 문서 목록 실시간 업데이트 SSE 스트림 (DocumentStatusProvider용)
 * @route GET /api/documents/status-list/stream
 */
app.get('/api/documents/status-list/stream', authenticateJWTWithQuery, (req, res) => {
  const userId = req.user?.id || req.query.userId

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  if (!documentListSSEClients.has(userId)) {
    documentListSSEClients.set(userId, new Set())
  }
  documentListSSEClients.get(userId).add(res)

  sendSSE(res, 'connected', {
    status: 'connected',
    timestamp: utcNowISO()
  })

  // Ping 유지 (30초)
  const pingInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() })
  }, 30000)

  // 연결 종료 처리
  res.on('close', () => {
    clearInterval(pingInterval)
    documentListSSEClients.get(userId)?.delete(res)
  })
})
```

### 프론트엔드 SSE 훅 인프라

**useDocumentStatusListSSE.ts:**
```typescript
export function useDocumentStatusListSSE(
  onRefresh: () => void,
  options: UseDocumentStatusListSSEOptions = {}
) {
  const { enabled = true, onDocumentChange } = options

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<DocumentListChangeEvent>({
    streamKey: 'documents:status-list',
    endpoint: '/api/documents/status-list/stream',
    enabled,
    onEvent: handleEvent,
    onConnect: handleConnect,
    onError: handleError
  })
}
```

**useSSESubscription.ts 특징:**
- SharedWorker 기반으로 여러 탭에서 단일 SSE 연결 공유
- EventSource 폴백 지원 (Safari 등)
- Page Visibility API로 탭 비활성화 시 자동 연결 해제
- 수동 재연결 함수 제공

### 이미 구현된 SSE 스트림

| 엔드포인트 | 용도 |
|-----------|------|
| `/api/customers/:id/documents/stream` | 고객 문서 실시간 업데이트 |
| `/api/documents/:documentId/status/stream` | 개별 문서 처리 상태 |
| `/api/documents/status-list/stream` | **문서 목록 실시간 업데이트** |
| `/api/customers/:id/annual-reports/stream` | Annual Report 업데이트 |
| `/api/users/:userId/account/stream` | 사용자 계정 변경 알림 |

---

## 3. DocumentStatusProvider에서의 SSE 사용 현황

**DocumentStatusProvider.tsx (라인 325-331):**
```typescript
// 🔄 SSE 훅 사용
useDocumentStatusListSSE(
  () => {
    fetchDocumentsRef.current(false)
    checkApiHealthRef.current()
  },
  { enabled: isPollingEnabled }
)
```

**현황:**
- SSE 훅이 이미 통합되어 있음
- 동시에 5초 폴링도 실행 중 (라인 376-385)
- **하이브리드 방식**: SSE(즉시 반영) + 폴링(진행률 추적)

---

## 4. SSE 전환 시 고려사항

### A. 연결 관리

| 항목 | 현재 상태 | 비고 |
|------|---------|------|
| 연결 방식 | SharedWorker + 폴백 | 멀티탭 최적화 ✅ |
| 재연결 | 자동 (5초 딜레이) | 통합 구현됨 ✅ |
| 탭 비활성화 | 자동 해제/재연결 | Page Visibility API ✅ |
| 인증 | JWT 토큰 자동 동기화 | 안전함 ✅ |

### B. 다중 문서 상태 업데이트

**현재 SSE 이벤트 구조 (server.js):**
```javascript
const eventData = {
  type: changeType, // 'uploaded', 'deleted', 'status-changed'
  documentId,
  documentName,
  status,
  timestamp: utcNowISO()
}
notifyDocumentListSubscribers(userId, 'document-list-change', eventData)
```

**프론트엔드 처리 (useDocumentStatusListSSE.ts):**
```typescript
const handleEvent = useCallback((eventType: string, data: unknown) => {
  if (eventType === 'document-list-change') {
    const eventData = data as DocumentListChangeEvent
    onDocumentChangeRef.current?.(eventData)

    // 300ms 딜레이: MongoDB write → read 완료 보장
    setTimeout(() => {
      onRefreshRef.current()
    }, 300)
  }
}, [])
```

### C. 메모리/리소스 관리

**SharedWorker 장점:**
- 멀티탭: 단일 SSE 연결 (HTTP 연결 제한 회피)
- 메모리: 각 탭에서 개별 유지하는 것보다 효율적
- CPU: 단일 이벤트 루프에서 처리

**현재 구현의 최적화:**
- Fingerprint 기반 변경 감지 (DocumentStatusProvider.tsx 라인 190-214)
- 불필요한 리렌더링 방지
- Ref 기반 콜백으로 메모리 누수 방지

---

## 5. 폴링 vs SSE 비교

| 항목 | 폴링 (현재) | SSE |
|------|------------|-----|
| **서버 부하** | 5초마다 API 호출 (높음) | 이벤트 발생 시만 전송 (낮음) |
| **네트워크** | 불필요한 요청 많음 | 필요할 때만 데이터 전송 |
| **실시간성** | 최대 5초 딜레이 | 즉시 반영 |
| **안정성** | 단순, 실패해도 다음 폴링 | 연결 끊김 시 재연결 필요 |
| **브라우저 호환** | 100% | 99%+ (IE11 제외) |

### 실제 시나리오

```
문서 업로드 후 처리 완료까지 2초 소요 시:

폴링: 업로드 → [5초 대기] → 완료 표시 (체감 7초)
SSE:  업로드 → 완료 표시 (체감 2초)
```

---

## 6. 폴링 → SSE 완전 전환 가능성 평가

### ✅ 가능한 이유

1. **SSE 인프라 완성**
   - `/api/documents/status-list/stream` 엔드포인트 이미 구현
   - SharedWorker 기반 안정적인 연결 관리

2. **이벤트 기반 알림 체계**
   - 백엔드에서 문서 변경 시 SSE 이벤트 자동 발생
   - 프론트엔드에서 이벤트 수신 시 즉시 새로고침

3. **진행률도 SSE로 전송 중**
   - `_notify_progress()` → SSE webhook 호출
   - MongoDB 업데이트 + SSE 이벤트 동시 발생

4. **Page Visibility API 통합**
   - 탭 비활성화 시 자동 연결 해제 (리소스 절감)
   - 탭 활성화 시 자동 재연결

### ⚠️ 주의사항

| 문제 | 해결 방안 |
|------|---------|
| 진행률 실시간 업데이트 | SSE 진행 이벤트 이미 구현됨 |
| 오래된 이벤트 손실 | 초기 로드 시 1회 API 호출 유지 |
| 브라우저 호환성 | EventSource 폴백 구현됨 |
| 초당 높은 변경률 | 이벤트 배칭/스로틀링 고려 |

---

## 7. 결론 및 권장사항

### 현재 상태 문제점

```
현재: 하이브리드 (SSE + 5초 폴링 동시 실행)
     ↓
SSE:    문서 추가/삭제/상태변경 → 즉시 반영
폴링:   진행률 업데이트 → 5초마다 확인 (중복)
```

**문제점**: `_notify_progress()`가 이미 SSE webhook을 호출하고 있어서, **폴링이 사실상 불필요한 중복**

### 권장: SSE 단독 사용

**이유:**
1. 인프라 이미 완성됨
2. 진행률 SSE 이벤트도 발생 중
3. 서버 부하 60-70% 감소 예상
4. 사용자 체감 속도 향상

### 전환 시 필요한 작업

| 작업 | 난이도 | 설명 |
|------|--------|------|
| DocumentStatusProvider에서 폴링 제거 | 낮음 | `setInterval` 코드 제거 |
| SSE 이벤트에서 진행률 처리 추가 | 낮음 | `document-progress` 이벤트 핸들링 |
| 초기 로드 시 1회 API 호출 유지 | 없음 | 이미 구현됨 |

---

## 8. 파일 위치 요약

### 프론트엔드

| 경로 | 역할 |
|------|------|
| `frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx` | SSE 훅 + 폴링 통합 |
| `frontend/aims-uix3/src/shared/hooks/useDocumentStatusListSSE.ts` | 문서 목록 SSE 훅 |
| `frontend/aims-uix3/src/shared/hooks/useSSESubscription.ts` | 범용 SSE 구독 훅 |
| `frontend/aims-uix3/src/shared/lib/sseWorkerClient.ts` | SharedWorker 클라이언트 |
| `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx` | UI 컴포넌트 |

### 백엔드

| 경로 | 역할 |
|------|------|
| `backend/api/aims_api/server.js` (라인 8240-8281) | SSE 스트림 엔드포인트 |
| `backend/api/aims_api/server.js` (라인 407-424) | 문서 목록 SSE 클라이언트 관리 |
| `backend/api/aims_api/server.js` (라인 8288-8320) | 문서 목록 변경 알림 처리 |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 진행률 SSE webhook 호출 |
