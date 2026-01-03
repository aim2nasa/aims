# SharedWorker SSE 통합

## 개요

멀티탭 환경에서 HTTP/1.1 동시 연결 제한(6개)으로 인한 API 블로킹 문제를 SharedWorker 기반 SSE 통합으로 해결.

**작업일**: 2026-01-04
**커밋**: `2b3cb80b`, `47acae30`

---

## 문제 원인

### HTTP/1.1 동시 연결 제한
- 브라우저는 동일 호스트에 대해 **6개의 동시 연결만 허용**
- SSE는 long-lived connection → 연결 제한에 직접 영향

### 기존 탭당 SSE 연결 수
| 위치 | SSE 훅 | 연결 수 |
|------|--------|--------|
| App.tsx | useInquiryNotifications | 1 |
| App.tsx | useUserAccountSSE | 1 |
| DocumentStatusProvider | useDocumentStatusListSSE | 1 |
| 고객상세 > 연간보고서 | useAnnualReportSSE | 1 |
| 고객상세 > 문서 | useCustomerDocumentsSSE | 1 |
| 고객상세 > 고객리뷰 | useCustomerReviewSSE | 1 |
| **합계** | | **최대 6개** |

**2개 탭 = 12개 연결 시도 → 6개 제한 초과 → API 블로킹**

---

## 해결 방안

### SharedWorker 기반 SSE 통합

모든 탭이 하나의 SharedWorker를 통해 SSE 연결 공유:

```
┌─────────┬─────────┬─────────┐
│  Tab A  │  Tab B  │  Tab C  │
└────┬────┴────┬────┴────┬────┘
     └─────────┼─────────┘
               ▼
┌─────────────────────────────┐
│       SharedWorker          │
│  SSE Connections (최대 6개) │
│  Subscription Registry      │
└─────────────────────────────┘
               ▼
┌─────────────────────────────┐
│    Backend SSE Endpoints    │
└─────────────────────────────┘
```

---

## 구현 파일

### 새로 생성
| 파일 | 설명 |
|------|------|
| `src/workers/sse-shared-worker.ts` | SharedWorker 본체 |
| `src/shared/lib/sseWorkerClient.ts` | 클라이언트 래퍼 (Safari 폴백 포함) |
| `src/shared/hooks/useSSESubscription.ts` | 공통 구독 훅 |

### 수정 (마이그레이션)
| 파일 | 설명 |
|------|------|
| `useDocumentStatusListSSE.ts` | SharedWorker 통합 |
| `useInquiryNotifications.ts` | SharedWorker 통합 |
| `useUserAccountSSE.ts` | SharedWorker 통합 |
| `useAnnualReportSSE.ts` | SharedWorker 통합 |
| `useCustomerDocumentsSSE.ts` | SharedWorker 통합 |
| `useCustomerReviewSSE.ts` | SharedWorker 통합 |
| `useDocumentStatusSSE.ts` | SharedWorker 통합 |
| `usePersonalFilesSSE.ts` | SharedWorker 통합 |

---

## 메시지 프로토콜

### Tab → Worker
```typescript
{ type: 'subscribe', payload: { streamKey, endpoint, params } }
{ type: 'unsubscribe', payload: { streamKey } }
{ type: 'disconnect' }  // 탭 종료 시
{ type: 'set-auth', payload: { token } }
{ type: 'ping' }
```

### Worker → Tab
```typescript
{ type: 'event', payload: { streamKey, eventType, data } }
{ type: 'connected', payload: { streamKey } }
{ type: 'error', payload: { streamKey, error } }
{ type: 'pong' }
```

---

## 스트림 키 규칙

```typescript
type StreamKey =
  | 'inquiry:notifications'
  | 'user:account:{userId}'
  | 'documents:status-list'
  | 'customer:{customerId}:annual-reports'
  | 'customer:{customerId}:documents'
  | 'customer:{customerId}:reviews'
  | 'document:{documentId}:status'
  | 'personal-files:{userId}'
```

---

## Safari 폴백

Safari는 SharedWorker 미지원 → 기존 EventSource 방식으로 자동 폴백

```typescript
// sseWorkerClient.ts 내부
constructor() {
  this.isSupported = typeof SharedWorker !== 'undefined'
  if (!this.isSupported) {
    console.log('[SSE-Client] SharedWorker not supported, using polyfill')
  }
}
```

---

## 결과

| 항목 | Before | After |
|------|--------|-------|
| 탭 2개 SSE 연결 | 12개 | 6개 (공유) |
| 탭 3개 SSE 연결 | 18개 | 6개 (공유) |
| HTTP 블로킹 | 발생 | 해결 |
| 탭 간 동기화 | 없음 | 자동 |

---

## 사용법

### 기본 사용
```typescript
import { useSSESubscription } from '@/shared/hooks/useSSESubscription'

const { isConnected, disconnect, reconnect } = useSSESubscription({
  streamKey: 'documents:status-list',
  endpoint: '/api/documents/status-list/stream',
  enabled: true,
  onEvent: (eventType, data) => {
    console.log('이벤트 수신:', eventType, data)
  },
  onConnect: () => console.log('연결됨'),
  onError: (error) => console.error('오류:', error)
})
```

### 파라미터 전달
```typescript
useSSESubscription({
  streamKey: `customer:${customerId}:documents`,
  endpoint: `/api/customers/${customerId}/documents/stream`,
  params: { includeDeleted: 'false' },
  enabled: !!customerId,
  onEvent: handleEvent
})
```

---

## 주의사항

1. **streamKey 고유성**: 동일한 streamKey는 연결을 공유함
2. **React StrictMode**: 개발 모드에서 Subscribe/Unsubscribe가 2회 실행되는 것은 정상
3. **인증 토큰**: `sseClient.syncAuthToken()`으로 자동 동기화
4. **Page Visibility**: 탭 비활성화 시 자동 연결 해제, 활성화 시 재연결
