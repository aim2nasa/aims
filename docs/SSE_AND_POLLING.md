# SSE와 폴링 가이드

## SSE (Server-Sent Events) 란?

### 개념

SSE는 서버에서 클라이언트로 **단방향 실시간 데이터 전송**을 위한 웹 기술입니다.

### 폴링 vs SSE 비교

**폴링 (Polling)**
```
클라이언트: "새 데이터 있어?" → 서버: "없어"
클라이언트: "새 데이터 있어?" → 서버: "없어"
클라이언트: "새 데이터 있어?" → 서버: "없어"
클라이언트: "새 데이터 있어?" → 서버: "있어! 여기"
```
→ 클라이언트가 주기적으로 서버에 요청 (예: 5초마다)

**SSE (Server-Sent Events)**
```
클라이언트: "연결할게, 새 거 있으면 알려줘"
서버: (연결 유지 중...)
서버: (데이터 생기면) "새 데이터 왔어!"
서버: (또 생기면) "또 왔어!"
```
→ 서버가 데이터 발생 시 즉시 클라이언트에 푸시

---

### 비유

| 방식 | 비유 |
|------|------|
| **폴링** | 5분마다 우체통 확인하러 나가기 |
| **SSE** | 집에서 기다리면 우체부가 초인종 누름 |

---

### 장단점 비교

| 항목 | 폴링 | SSE |
|------|------|-----|
| 서버 부하 | 높음 (매번 요청) | 낮음 (연결 1회) |
| 실시간성 | 낮음 (최대 N초 지연) | 높음 (즉시) |
| 네트워크 트래픽 | 많음 | 적음 |
| 구현 난이도 | 쉬움 | 중간 |
| 연결 방식 | 매번 새로 연결 | 연결 유지 |
| 브라우저 지원 | 모든 브라우저 | 대부분 지원 (IE 제외) |

---

### SSE vs WebSocket

| 항목 | SSE | WebSocket |
|------|-----|-----------|
| 통신 방향 | 단방향 (서버→클라이언트) | 양방향 |
| 프로토콜 | HTTP | WS (별도 프로토콜) |
| 재연결 | 자동 지원 | 직접 구현 필요 |
| 사용 사례 | 알림, 피드, 실시간 업데이트 | 채팅, 게임, 협업 도구 |

---

## AIMS에서의 SSE 사용

### 현재 SSE 적용 기능: 1:1 문의

```
┌─────────────────┐         SSE          ┌─────────────────┐
│   aims-uix3     │ ◄──────────────────► │                 │
│   (사용자)       │                      │   aims_api      │
└─────────────────┘                      │   (백엔드)       │
                                         │                 │
┌─────────────────┐         SSE          │                 │
│   aims-admin    │ ◄──────────────────► │                 │
│   (관리자)       │                      └─────────────────┘
└─────────────────┘
```

### SSE 엔드포인트

| 대상 | 엔드포인트 | 용도 |
|------|-----------|------|
| 사용자 | `/api/inquiries/notifications/stream` | 답변 알림 |
| 관리자 | `/api/inquiries/admin/notifications/stream` | 새 문의/메시지 알림 |

### SSE 이벤트 종류

| 이벤트 | 발신 → 수신 | 설명 |
|--------|------------|------|
| `connected` | 서버 → 클라이언트 | 연결 성공 |
| `init` | 서버 → 클라이언트 | 초기 미읽음 count, ids |
| `new-inquiry` | 서버 → 관리자 | 새 문의 등록 |
| `new-message` | 서버 → 양쪽 | 새 메시지 (답변/추가질문) |
| `status-changed` | 서버 → 사용자 | 문의 상태 변경 |
| `ping` | 서버 → 클라이언트 | Keep-alive (30초) |

### 관련 파일

| 파일 | 설명 |
|------|------|
| `frontend/aims-uix3/src/shared/hooks/useInquiryNotifications.ts` | 사용자용 SSE 훅 |
| `frontend/aims-admin/src/shared/hooks/useInquiryNotifications.ts` | 관리자용 SSE 훅 |
| `backend/api/aims_api/routes/inquiries-routes.js` | 백엔드 SSE 엔드포인트 |

---

## 폴링 사용 페이지 현황

### 실시간 폴링 (UI에 토글 버튼 있음)

사용자가 켜고 끌 수 있는 실시간 업데이트 기능

| 페이지 | 파일 | 주기 | 용도 |
|--------|------|------|------|
| 전체 문서보기 | `src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx` | 5초 | 문서 목록 갱신 |
| 내 문서 | `src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx` | 5초 | 폴더 내용 갱신 |
| 문서 처리 상태 | `src/providers/DocumentStatusProvider.tsx` | 5초 | 처리 상태 갱신 |

### 백그라운드 폴링 (토글 없음)

자동으로 동작하는 백그라운드 폴링

| 페이지 | 파일 | 주기 | 용도 |
|--------|------|------|------|
| 고객 상세 > 문서 탭 | `src/features/customer/views/CustomerDetailView/tabs/DocumentsTab.tsx` | 10초 | 문서 목록 갱신 |
| 고객 상세 > 연보 탭 | `src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx` | 가변 | pending 문서 확인 |

### 1회성 폴링 (작업 완료 대기)

특정 작업 완료를 기다리는 일시적 폴링

| 페이지 | 파일 | 용도 |
|--------|------|------|
| 문서 등록 | `src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx` | 업로드 후 처리 완료 대기 |

### 시스템용 (UI 무관)

| 파일 | 주기 | 용도 |
|------|------|------|
| `src/utils/appleConfirm.ts` | 100ms | 모달 DOM 상태 확인 |
| `src/hooks/useDynamicType.js` | 2초 | 시스템 텍스트 크기 감지 |

---

## SSE 적용 검토 대상

현재 폴링 방식을 SSE로 전환하면 효율성이 개선될 수 있는 페이지:

| 페이지 | 현재 | SSE 전환 시 이점 |
|--------|------|-----------------|
| 전체 문서보기 | 5초 폴링 | 문서 업로드/변경 즉시 반영 |
| 내 문서 | 5초 폴링 | 파일 변경 즉시 반영 |
| 문서 처리 상태 | 5초 폴링 | OCR 완료 즉시 알림 |
| 고객 상세 > 문서 탭 | 10초 폴링 | 문서 변경 즉시 반영 |

### SSE 전환 시 고려사항

1. **서버 리소스**: SSE 연결 유지에 따른 서버 메모리 사용
2. **연결 관리**: 브라우저 탭 비활성화 시 연결 해제/재연결 처리
3. **에러 핸들링**: 네트워크 불안정 시 재연결 로직
4. **확장성**: 다수 사용자 동시 접속 시 연결 관리

---

## SSE 전환 작업 계획

### 전환 대상 (우선순위 순)

| 우선순위 | 페이지 | 파일 | 주기 | 위험도 | 상태 |
|:---:|--------|------|------|:---:|:---:|
| 1 | 고객상세 > 문서탭 | `CustomerDetailView/tabs/DocumentsTab.tsx` | SSE | 🟢 낮음 | ✅ 완료 |
| 2 | 고객상세 > 연보탭 | `CustomerDetailView/tabs/AnnualReportTab.tsx` | SSE | 🟢 낮음 | ✅ 완료 |
| 3 | 내 문서 | `PersonalFilesView.tsx` | 5초 | 🟡 중간 | ⬜ 대기 |
| 4 | 문서 등록 | `DocumentRegistrationView.tsx` | 5초 | 🟡 중간 | ⬜ 대기 |
| 5 | 문서 처리 현황 | `DocumentStatusProvider.tsx` | 5초 | 🔴 높음 | ⬜ 대기 |

**상태 범례**: ⬜ 대기 | 🔄 진행중 | ✅ 완료 | ❌ 취소

### 우선순위 근거

1. **고립도**: 변경 범위가 좁을수록 안전
2. **의존성**: 다른 컴포넌트에 영향 적을수록 우선
3. **복잡도**: 로직이 단순할수록 먼저
4. **학습 효과**: 작은 것부터 경험 축적 후 큰 것 진행

---

### 전환 작업 로그

#### 1. 고객상세 > 문서탭 ✅
- **완료일**: 2025-12-19
- **변경**: 10초 폴링 → SSE 실시간
- **파일**:
  - `server.js`: SSE 엔드포인트 (`/api/customers/:id/documents/stream`)
  - `useCustomerDocumentsSSE.ts`: SSE 훅
  - `DocumentsTab.tsx`: 폴링 코드 제거, SSE 훅 사용

#### 2. 고객상세 > 연보탭 ✅
- **완료일**: 2025-12-19
- **변경**: 조건부 폴링 → SSE 실시간
- **트리거**: AR 파싱 완료/실패 시 Python API가 aims_api webhook 호출
- **파일**:
  - `server.js`: SSE 엔드포인트 (`/api/customers/:id/annual-reports/stream`), webhook 엔드포인트 (`/api/webhooks/ar-status-change`)
  - `useAnnualReportSSE.ts`: SSE 훅 (ref 패턴으로 안정적인 연결 유지)
  - `AnnualReportTab.tsx`: 폴링 코드 제거, SSE 훅 사용
  - `annual_report_api/services/db_writer.py`: AR 저장 완료 시 webhook 호출
  - `annual_report_api/services/queue_manager.py`: AR 파싱 실패 시 webhook 호출
- **특이사항**:
  - AR 파싱은 별도 Python API에서 처리되므로 webhook 패턴 사용
  - Vite 개발 서버 SSE 프록시 설정 추가 (`vite.config.ts`)

---

## 코드 예시

### 클라이언트 (React)

```typescript
// SSE 연결
const eventSource = new EventSource('/api/notifications/stream?token=xxx');

// 이벤트 리스너
eventSource.addEventListener('new-message', (e) => {
  const data = JSON.parse(e.data);
  console.log('새 메시지:', data);
});

// 연결 종료
eventSource.close();
```

### 서버 (Node.js/Express)

```javascript
app.get('/api/notifications/stream', (req, res) => {
  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 이벤트 전송 함수
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 연결 성공 알림
  sendEvent('connected', { timestamp: new Date() });

  // Keep-alive (30초마다)
  const pingInterval = setInterval(() => {
    sendEvent('ping', { timestamp: new Date() });
  }, 30000);

  // 연결 종료 시 정리
  req.on('close', () => {
    clearInterval(pingInterval);
  });
});
```

---

## 참고 자료

- [MDN - Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [MDN - EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
