# 1:1 문의 관리 시스템

## 개요

AIMS의 1:1 문의 시스템은 **사용자(aims-uix3)**와 **관리자(aims-admin)** 간의 실시간 소통을 지원합니다.

```
┌─────────────────┐                    ┌─────────────────┐
│   aims-uix3     │◄──── 실시간 ────►│   aims-admin    │
│   (사용자 앱)    │      알림         │   (관리자 앱)    │
└─────────────────┘                    └─────────────────┘
         │                                      │
         └──────────────┬───────────────────────┘
                        ▼
              ┌─────────────────┐
              │   aims_api      │
              │   (백엔드)       │
              └─────────────────┘
```

---

## 주요 기능

| 기능 | 사용자 (aims-uix3) | 관리자 (aims-admin) |
|------|-------------------|-------------------|
| 문의 등록 | O | - |
| 메시지 작성 | O | O |
| 상태 변경 | - | O |
| 문의 삭제 | - | O |
| 실시간 알림 | O | O |

---

## 알림(Notification) 시스템

### SSE란?

**SSE (Server-Sent Events)**는 서버가 클라이언트에게 실시간으로 데이터를 보내는 기술입니다.

```
일반적인 방식 (Polling):
클라이언트 ──► "새 알림 있어?" ──► 서버
클라이언트 ◄── "없어" ◄────────── 서버
클라이언트 ──► "새 알림 있어?" ──► 서버  (계속 반복...)
클라이언트 ◄── "있어!" ◄───────── 서버

SSE 방식:
클라이언트 ──► "알림 구독할게" ──► 서버
                                    │ (연결 유지)
클라이언트 ◄── "새 알림!" ◄──────┘ (필요할 때만 전송)
```

**장점:**
- 서버 부하 감소 (불필요한 요청 없음)
- 즉각적인 알림 전달
- 구현이 간단함

---

## 알림 흐름 상세

### 1. 사용자가 문의 등록할 때

```
[aims-uix3]                    [aims_api]                    [aims-admin]
    │                              │                              │
    │──► POST /api/inquiries ─────►│                              │
    │                              │                              │
    │◄── 문의 생성 완료 ◄──────────│                              │
    │                              │                              │
    │                              │──► SSE: 'new-inquiry' ──────►│
    │                              │                              │
    │                              │                      [알림 배지 +1]
```

**코드 위치:** `backend/api/aims_api/routes/inquiries-routes.js` (614행)

```javascript
// 관리자들에게 새 문의 알림 전송
notifyAdmins('new-inquiry', {
  inquiryId: inquiryId.toString(),
  userId: userId,
  userName: user.name,
  title: title
});
```

---

### 2. 관리자가 답변할 때

```
[aims-admin]                   [aims_api]                    [aims-uix3]
    │                              │                              │
    │──► POST /admin/.../messages ►│                              │
    │                              │                              │
    │◄── 답변 등록 완료 ◄──────────│                              │
    │                              │                              │
    │                              │──► SSE: 'new-message' ──────►│
    │                              │                              │
    │                              │                      [알림 배지 +1]
```

**코드 위치:** `backend/api/aims_api/routes/inquiries-routes.js` (1140행)

```javascript
// 해당 사용자에게 새 답변 알림 전송
notifyUser(inquiry.userId, 'new-message', {
  inquiryId: id,
  title: inquiry.title
});
```

---

### 3. 관리자가 상태 변경할 때

```
[aims-admin]                   [aims_api]                    [aims-uix3]
    │                              │                              │
    │──► PUT /admin/.../status ───►│                              │
    │                              │                              │
    │◄── 상태 변경 완료 ◄──────────│                              │
    │                              │                              │
    │                              │──► SSE: 'status-changed' ───►│
    │                              │                              │
    │                              │                      [알림 배지 +1]
```

---

## SSE 연결 구조

### 백엔드 (aims_api)

```javascript
// SSE 클라이언트 저장소
const sseClients = {
  users: new Map(),    // userId → Set<연결>
  admins: new Set(),   // Set<연결>
};
```

**엔드포인트:**
- 사용자용: `GET /api/inquiries/notifications/stream`
- 관리자용: `GET /api/admin/inquiries/notifications/stream`

### 프론트엔드 (aims-uix3 / aims-admin)

두 앱 모두 `useInquiryNotifications` 훅을 사용합니다.

```typescript
// 사용자 앱 예시
const { unreadCount, markAsRead, isConnected } = useInquiryNotifications(true);

// unreadCount: 미확인 알림 개수 (배지에 표시)
// markAsRead: 문의 읽음 처리
// isConnected: SSE 연결 상태
```

---

## SSE 이벤트 종류

| 이벤트 | 발생 시점 | 대상 | 데이터 |
|--------|----------|------|--------|
| `connected` | SSE 연결 성공 | 양쪽 | `{ userId, timestamp }` |
| `init` | 연결 직후 | 양쪽 | `{ count, ids }` (미확인 개수/목록) |
| `new-inquiry` | 새 문의 등록 | 관리자 | `{ inquiryId, userName, title }` |
| `new-message` | 새 메시지 | 양쪽 | `{ inquiryId, title }` |
| `status-changed` | 상태 변경 | 사용자 | `{ inquiryId, status }` |
| `ping` | 30초마다 | 양쪽 | `{ timestamp }` (연결 유지용) |

---

## 미확인(Unread) 판단 로직

### 사용자 입장
> "관리자가 답변했는데 내가 아직 안 읽은 문의"

```
마지막 관리자 메시지 시간 > 사용자가 마지막으로 읽은 시간
     (lastAdminMessageAt)         (userLastReadAt)
```

### 관리자 입장
> "사용자가 메시지를 보냈는데 아직 안 읽은 문의"

```
마지막 사용자 메시지 시간 > 관리자가 마지막으로 읽은 시간
     (lastUserMessageAt)         (adminLastReadAt)
```

---

## 파일 구조

```
frontend/
├── aims-uix3/                          # 사용자 앱
│   └── src/
│       ├── components/InquiryView/     # 문의 화면
│       ├── entities/inquiry/api.ts     # API 호출
│       └── shared/hooks/
│           └── useInquiryNotifications.ts  # 알림 훅
│
├── aims-admin/                         # 관리자 앱
│   └── src/
│       ├── pages/InquiriesPage/        # 문의 목록
│       ├── pages/InquiryDetailPage/    # 문의 상세
│       ├── features/inquiries/api.ts   # API 호출
│       └── shared/hooks/
│           └── useInquiryNotifications.ts  # 알림 훅

backend/
└── api/aims_api/
    └── routes/inquiries-routes.js      # API + SSE 서버
```

---

## 연결 안정성

### 자동 재연결

SSE 연결이 끊어지면 **5초 후 자동 재연결**을 시도합니다.

```typescript
eventSource.onerror = () => {
  // 5초 후 재연결
  setTimeout(() => {
    connectSSE();
  }, 5000);
};
```

### Keep-Alive

서버는 **30초마다 ping 이벤트**를 전송하여 연결을 유지합니다.

```javascript
setInterval(() => {
  sendSSE(res, 'ping', { timestamp: new Date() });
}, 30000);
```

---

## 중복 알림 방지

관리자 앱에서는 중복 알림을 방지하기 위해 **처리된 이벤트 ID를 추적**합니다.

```typescript
const processedEventIdsRef = useRef<Set<string>>(new Set());

// 이미 처리된 이벤트면 무시
if (processedEventIdsRef.current.has(data.inquiryId)) {
  return;
}
// 처리됨으로 표시
processedEventIdsRef.current.add(data.inquiryId);
```

---

## 요약

1. **사용자**가 문의를 등록하면 → **관리자**에게 실시간 알림
2. **관리자**가 답변하면 → **사용자**에게 실시간 알림
3. SSE를 사용하여 서버 → 클라이언트로 즉시 알림 전송
4. 연결 끊김 시 자동 재연결
5. 중복 알림 방지 로직 내장
