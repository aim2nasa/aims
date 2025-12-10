# 설계사 등급 시스템

설계사별 스토리지 할당량을 관리하는 티어 시스템입니다.

---

## 티어 정의

| Tier ID | 표시명 | 저장공간 | 대상 |
|---------|--------|----------|------|
| `free_trial` | 무료체험 | 5GB | 체험 사용자 |
| `standard` | 일반 | 30GB | 기본 등급 (신규 가입 시) |
| `premium` | 프리미엄 | 50GB | 프리미엄 구독자 |
| `vip` | VIP | 100GB | VIP 고객 |
| `admin` | 관리자 | 무제한 | 시스템 관리자 |

---

## 저장공간 계산 기준

- **저장 경로**: `/data/files/users/{userId}/YYYY/MM/`
- **DB 컬렉션**: `files` (고객 문서 + 내 보관함 통합)
- **계산 필드**: `files.meta.size_bytes` 합계 (ownerId 기준)
- **관리자**: `role === 'admin'`이면 자동으로 무제한 적용

---

## 사용량 경고 레벨

| 사용률 | 상태 | UI 표시 |
|--------|------|---------|
| 0~79% | 정상 | 파란색 프로그레스 바 |
| 80~94% | 경고 | 주황색 프로그레스 바 + "용량 부족 주의" |
| 95~100% | 위험 | 빨간색 프로그레스 바 + "용량 초과 위험" |

---

## 할당량 초과 시 동작

**하드 리밋 정책**
- 할당량 초과 시 업로드 즉시 차단
- 에러 메시지: "저장 공간이 부족합니다. 파일을 삭제하거나 용량을 업그레이드하세요."
- 관리자는 제한 없음

---

## Users 컬렉션 스키마

```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  role: String,  // 'admin' | 'user'
  storage: {
    tier: String,         // 'free_trial' | 'standard' | 'premium' | 'vip' | 'admin'
    quota_bytes: Number,  // 할당량 (bytes), -1 = 무제한
    used_bytes: Number,   // 캐싱된 사용량 (실시간 계산과 병행)
    updated_at: Date      // 마지막 티어 변경일
  }
}
```

---

## API 엔드포인트

### 1. 내 스토리지 조회
```
GET /api/users/me/storage
Authorization: Bearer {token}

Response:
{
  "tier": "standard",
  "tierName": "일반",
  "quota_bytes": 32212254720,
  "used_bytes": 5368709120,
  "remaining_bytes": 26843545600,
  "usage_percent": 17,
  "is_unlimited": false
}
```

### 2. 특정 사용자 스토리지 조회 (관리자)
```
GET /api/admin/users/:id/storage
Authorization: Bearer {admin_token}
```

### 3. 사용자 티어 변경 (관리자)
```
PUT /api/admin/users/:id/quota
Authorization: Bearer {admin_token}
Content-Type: application/json

Body:
{
  "tier": "premium"
}

Response:
{
  "success": true,
  "tier": "premium",
  "quota_bytes": 53687091200
}
```

### 4. 전체 스토리지 통계 (관리자)
```
GET /api/admin/storage/overview
Authorization: Bearer {admin_token}

Response:
{
  "total_users": 50,
  "total_used_bytes": 268435456000,
  "total_files": 1234,
  "tier_distribution": {
    "free_trial": 5,
    "standard": 40,
    "premium": 3,
    "vip": 1,
    "admin": 1
  },
  "users_over_80_percent": 3,
  "users_over_95_percent": 1
}
```

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `backend/api/aims_api/lib/storageQuotaService.js` | 스토리지 쿼터 서비스 |
| `backend/api/aims_api/routes/storage-routes.js` | 스토리지 API 라우트 |
| `frontend/aims-uix3/src/features/batch-upload/components/StorageQuotaBar.tsx` | 사용량 표시 컴포넌트 |
| `frontend/aims-admin/src/pages/UsersPage/UsersPage.tsx` | 관리자 사용자 목록 |
