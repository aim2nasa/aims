# SSE 아키텍처 조사 보고서

**작성일**: 2026-01-13
**작성자**: Claude Code
**목적**: HTTP/1.1 동시 연결 제한 문제 해결을 위한 SSE 통합 구조 검증

---

## 1. 배경

### 1.1 문제 상황
- HTTP/1.1은 동일 도메인당 최대 6개 동시 연결 제한
- 고객 상세 페이지에서 3개의 개별 SSE 연결 사용 (Documents, AR, CR)
- 멀티탭 사용 시 연결 고갈로 API 타임아웃 발생

### 1.2 해결 방안
- 3개의 개별 SSE를 1개의 통합 SSE로 병합
- SharedWorker를 통한 멀티탭 연결 공유
- Safari 폴백 지원

---

## 2. 아키텍처 개요

### 2.1 연결 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (Browser)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │ DocumentsTab │   │AnnualReportTab│   │CustomerReviewTab │        │
│  └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘        │
│         │                  │                     │                   │
│         └──────────────────┼─────────────────────┘                   │
│                            ▼                                         │
│                 ┌─────────────────────┐                             │
│                 │   useCustomerSSE    │  ← 통합 SSE 훅              │
│                 └──────────┬──────────┘                             │
│                            ▼                                         │
│                 ┌─────────────────────┐                             │
│                 │ useSSESubscription  │                             │
│                 └──────────┬──────────┘                             │
│                            ▼                                         │
│                 ┌─────────────────────┐                             │
│                 │  sseWorkerClient    │                             │
│                 └──────────┬──────────┘                             │
│                            ▼                                         │
│         ┌──────────────────┴──────────────────┐                     │
│         ▼                                      ▼                     │
│  ┌─────────────────┐                  ┌─────────────────┐           │
│  │  SharedWorker   │  (Chrome, Edge)  │   EventSource   │ (Safari)  │
│  │ (sse-shared-    │                  │   (Polyfill)    │           │
│  │  worker.ts)     │                  │                 │           │
│  └────────┬────────┘                  └────────┬────────┘           │
│           └────────────────┬───────────────────┘                    │
│                            ▼                                         │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             │ SSE Connection
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Backend (aims_api)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │         /api/customers/:customerId/stream (통합 SSE)         │    │
│  │                                                              │    │
│  │  Events:                                                     │    │
│  │  - connected        : 연결 성공                              │    │
│  │  - document-change  : 문서 연결/해제                         │    │
│  │  - document-status-change : 문서 처리 상태 변경              │    │
│  │  - ar-change        : Annual Report 상태 변경                │    │
│  │  - cr-change        : Customer Review 상태 변경              │    │
│  │  - ping             : Keep-alive (30초)                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SSE Client Maps                           │    │
│  │                                                              │    │
│  │  customerCombinedSSEClients : 통합 SSE 클라이언트            │    │
│  │  customerDocSSEClients      : 문서 SSE (레거시)              │    │
│  │  arSSEClients               : AR SSE (레거시)                │    │
│  │  crSSEClients               : CR SSE (레거시)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 이벤트 브로드캐스트 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Event Broadcast Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  notifyCustomerDocSubscribers(customerId, event, data)               │
│         │                                                            │
│         ├──▶ customerDocSSEClients.get(customerId)  [레거시]         │
│         │                                                            │
│         └──▶ notifyCustomerCombinedSubscribers()    [통합] ✅        │
│                                                                      │
│  notifyARSubscribers(customerId, event, data)                        │
│         │                                                            │
│         ├──▶ arSSEClients.get(customerId)           [레거시]         │
│         │                                                            │
│         └──▶ notifyCustomerCombinedSubscribers()    [통합] ✅        │
│                                                                      │
│  notifyCRSubscribers(customerId, event, data)                        │
│         │                                                            │
│         ├──▶ crSSEClients.get(customerId)           [레거시]         │
│         │                                                            │
│         └──▶ notifyCustomerCombinedSubscribers()    [통합] ✅        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 파일별 상세 분석

### 3.1 백엔드

#### server.js (aims_api)

| 라인 | 구성요소 | 설명 |
|------|----------|------|
| 372 | `customerCombinedSSEClients` | 통합 SSE 클라이언트 Map |
| 381-391 | `notifyCustomerCombinedSubscribers()` | 통합 SSE 브로드캐스트 함수 |
| 7201-7250 | `/api/customers/:customerId/stream` | 통합 SSE 엔드포인트 |
| 295-308 | `notifyCustomerDocSubscribers()` | 문서 변경 → 개별 + 통합 SSE 전송 |
| 321-340 | `notifyARSubscribers()` | AR 변경 → 개별 + 통합 SSE 전송 |
| 353-366 | `notifyCRSubscribers()` | CR 변경 → 개별 + 통합 SSE 전송 |

### 3.2 프론트엔드

#### useCustomerSSE.ts (통합 SSE 훅)

```typescript
// 핵심 구현
const { isConnected, disconnect, reconnect } = useSSESubscription({
  streamKey: customerId ? `customer:${customerId}:combined` : '',
  endpoint: customerId ? `/api/customers/${customerId}/stream` : '',
  enabled: enabled && !!customerId,
  onEvent: handleEvent,  // document-change, ar-change, cr-change 처리
  onConnect: handleConnect,
  onError: handleError
})
```

#### sse-shared-worker.ts (SharedWorker)

| 라인 | 이벤트 타입 | 용도 |
|------|-------------|------|
| 129-138 | `connected` | 연결 성공 |
| 162-169 | `document-change` | 문서 연결/해제 |
| 171-179 | `document-status-change` | 문서 처리 상태 |
| 181-192 | `ar-change` | Annual Report 변경 |
| 194-202 | `cr-change` | Customer Review 변경 |

#### 탭 컴포넌트 사용 현황

| 파일 | 라인 | 사용 훅 | 콜백 |
|------|------|---------|------|
| DocumentsTab.tsx | 318-322 | `useCustomerSSE` | `onRefreshDocuments` |
| AnnualReportTab.tsx | 162-166 | `useCustomerSSE` | `onRefreshAR` |
| CustomerReviewTab.tsx | 113-117 | `useCustomerSSE` | `onRefreshCR` |

---

## 4. 연결 수 비교

### 4.1 변경 전 (개별 SSE)

| 연결 | 엔드포인트 | 탭 |
|------|-----------|-----|
| 1 | `/api/customers/:id/documents/stream` | DocumentsTab |
| 2 | `/api/customers/:id/annual-reports/stream` | AnnualReportTab |
| 3 | `/api/customers/:id/customer-reviews/stream` | CustomerReviewTab |
| 4 | `/api/documents/status-list/stream` | 전역 (DocumentStatusProvider) |
| 5 | 기타 API 요청 | - |

**총 SSE 연결: 3개 (고객당) + 1개 (전역) = 4개**

### 4.2 변경 후 (통합 SSE)

| 연결 | 엔드포인트 | 탭 |
|------|-----------|-----|
| 1 | `/api/customers/:customerId/stream` | 모든 탭 공유 |
| 2 | `/api/documents/status-list/stream` | 전역 (DocumentStatusProvider) |
| 3 | 기타 API 요청 | - |

**총 SSE 연결: 1개 (고객당) + 1개 (전역) = 2개**

### 4.3 개선 효과

| 항목 | 변경 전 | 변경 후 | 개선율 |
|------|---------|---------|--------|
| 고객당 SSE 연결 | 3개 | 1개 | **-67%** |
| HTTP/1.1 연결 사용 | 5개 | 3개 | **-40%** |
| 멀티탭 2개 | 10개 | 6개 | **-40%** |

---

## 5. Safari 호환성

### 5.1 SharedWorker 미지원 브라우저 대응

```typescript
// sseWorkerClient.ts
class SSEWorkerClient {
  constructor() {
    this.isSupported = typeof SharedWorker !== 'undefined'

    if (this.isSupported) {
      this.initWorker()  // SharedWorker 사용
    } else {
      // Safari: EventSource 직접 사용 (폴백)
      console.warn('[SSE-Client] SharedWorker not supported, using polyfill')
    }
  }
}
```

### 5.2 폴백 동작 방식

| 브라우저 | 연결 방식 | 멀티탭 공유 |
|----------|-----------|-------------|
| Chrome, Edge, Firefox | SharedWorker | ✅ 공유 |
| Safari, iOS Safari | EventSource (폴백) | ❌ 탭별 개별 연결 |

---

## 6. 레거시 호환성

### 6.1 유지되는 개별 SSE 엔드포인트

| 엔드포인트 | 상태 | 비고 |
|-----------|------|------|
| `/api/customers/:id/documents/stream` | 유지 | 레거시 호환 |
| `/api/customers/:id/annual-reports/stream` | 유지 | 레거시 호환 |
| `/api/customers/:id/customer-reviews/stream` | 유지 | 레거시 호환 |

### 6.2 미사용 프론트엔드 파일

| 파일 | 상태 | 권장 조치 |
|------|------|----------|
| `useAnnualReportSSE.ts` | 미사용 | 추후 삭제 가능 |
| `useCustomerReviewSSE.ts` | 미사용 | 추후 삭제 가능 |

---

## 7. 검증 결과

### 7.1 백엔드 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| 통합 SSE 엔드포인트 | ✅ 정상 | `/api/customers/:customerId/stream` |
| 이벤트 브로드캐스트 | ✅ 정상 | 개별 + 통합 SSE 모두 전송 |
| Keep-alive | ✅ 정상 | 30초 간격 ping |
| 연결 정리 | ✅ 정상 | 클라이언트 종료 시 자동 정리 |

### 7.2 프론트엔드 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| useCustomerSSE 훅 | ✅ 정상 | 모든 탭에서 사용 |
| SharedWorker | ✅ 정상 | 모든 이벤트 타입 등록 |
| Safari 폴백 | ✅ 정상 | EventSource 직접 사용 |
| 재연결 로직 | ✅ 정상 | 최대 5회 재시도 |

### 7.3 테스트 결과

```
Test Files: 187 passed, 1 skipped (188)
Tests: 4031 passed, 8 skipped (4039)
```

---

## 8. 결론

### 8.1 요약

SSE 통합 구조가 **정상적으로 구현**되어 HTTP/1.1 동시 연결 제한 문제가 해결되었습니다.

### 8.2 핵심 성과

1. **연결 수 감소**: 고객당 3개 → 1개 SSE 연결
2. **레거시 호환**: 기존 개별 SSE 엔드포인트 유지
3. **브라우저 호환**: SharedWorker + Safari 폴백
4. **안정성**: 자동 재연결, Keep-alive 구현

### 8.3 향후 권장사항

1. 미사용 레거시 파일 (`useAnnualReportSSE.ts`, `useCustomerReviewSSE.ts`) 정리 검토
2. Safari 사용자 비율에 따라 폴백 성능 모니터링
3. HTTP/2 전환 시 SSE 연결 제한 완화 가능

---

## 부록: 관련 파일 목록

### 백엔드
- `backend/api/aims_api/server.js` - SSE 엔드포인트 및 브로드캐스트 함수

### 프론트엔드
- `frontend/aims-uix3/src/shared/hooks/useCustomerSSE.ts` - 통합 SSE 훅
- `frontend/aims-uix3/src/shared/hooks/useSSESubscription.ts` - SSE 구독 관리
- `frontend/aims-uix3/src/shared/lib/sseWorkerClient.ts` - SharedWorker 클라이언트
- `frontend/aims-uix3/src/workers/sse-shared-worker.ts` - SharedWorker 구현
- `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/DocumentsTab.tsx`
- `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx`
- `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/CustomerReviewTab.tsx`
