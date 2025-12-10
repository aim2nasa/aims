# 디스크 할당량 기능 구현 보고서

## 구현 현황

| Phase | 항목 | 상태 |
|-------|------|------|
| 1 | storageQuotaService.js | ✅ 완료 |
| 1 | API 엔드포인트 | ✅ 완료 |
| 1 | 업로드 쿼터 체크 | ✅ 완료 |
| 2 | aims-uix3 DataTab | ✅ 완료 |
| 3 | aims-admin Dashboard | ✅ 완료 |
| 3 | aims-admin UsersPage | ✅ 완료 |
| 4 | 마이그레이션 스크립트 | ✅ 완료 |

---

## 티어 시스템

| Tier | 할당량 | 대상 |
|------|--------|------|
| free_trial | 5GB | 무료체험 |
| standard | 30GB | 일반 (기본) |
| premium | 50GB | 프리미엄 |
| vip | 100GB | VIP |
| admin | 무제한 | 관리자 |

---

## 저장 구조

```
/data/files/users/{userId}/
└── YYYY/MM/{timestamp}_{random}.{ext}
```

**쿼터 계산**: `files.meta.size_bytes` 합계 (ownerId 기준)

---

## 생성/수정된 파일

### Backend
- `lib/storageQuotaService.js` - 스토리지 쿼터 서비스 (신규)
- `routes/storage-routes.js` - API 라우트 (신규)
- `routes/personal-files-routes.js` - 업로드 시 쿼터 체크 추가
- `server.js` - 스토리지 라우트 등록, users API에 스토리지 정보 추가
- `migrations/add_storage_quota.js` - 마이그레이션 스크립트 (신규)

### aims-uix3
- `services/userService.ts` - getMyStorageInfo() 추가
- `features/AccountSettings/AccountSettingsView.tsx` - 데이터 탭에 StorageQuotaBar
- `features/AccountSettings/AccountSettingsView.css` - 스토리지 관련 스타일

### aims-admin
- `features/dashboard/api.ts` - getStorageOverview() 추가
- `pages/DashboardPage/DashboardPage.tsx` - 스토리지 현황 섹션 추가
- `pages/DashboardPage/DashboardPage.css` - 티어 배지 스타일
- `features/auth/types.ts` - UserStorage 인터페이스 추가
- `pages/UsersPage/UsersPage.tsx` - 스토리지 열 추가
- `pages/UsersPage/UsersPage.css` - 스토리지 셀 스타일

---

## API 엔드포인트

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/users/me/storage` | 내 스토리지 | 로그인 |
| GET | `/api/admin/users/:id/storage` | 사용자 스토리지 | Admin |
| PUT | `/api/admin/users/:id/quota` | 티어 변경 | Admin |
| GET | `/api/admin/storage/overview` | 전체 통계 | Admin |

---

## 마이그레이션 실행

```bash
cd backend/api/aims_api
node migrations/add_storage_quota.js
```

**수행 작업:**
1. 일반 사용자: `storage.tier='standard'`, `quota_bytes=30GB`
2. 관리자: `storage.tier='admin'`, `quota_bytes=-1` (무제한)
3. 기존 파일 사용량 계산 및 `used_bytes` 업데이트

---

## 구현 확인 방법

### Backend API 테스트

```bash
# 서버 접속
ssh tars.giize.com

# 1. 내 스토리지 정보 조회
curl -s -H "Authorization: Bearer {JWT_TOKEN}" \
  "http://localhost:3010/api/users/me/storage" | python3 -m json.tool

# 2. 전체 스토리지 통계 (관리자)
curl -s -H "Authorization: Bearer {ADMIN_TOKEN}" \
  "http://localhost:3010/api/admin/storage/overview" | python3 -m json.tool

# 3. 특정 사용자 스토리지 (관리자)
curl -s -H "Authorization: Bearer {ADMIN_TOKEN}" \
  "http://localhost:3010/api/admin/users/{USER_ID}/storage" | python3 -m json.tool

# 4. 사용자 목록에 스토리지 포함 확인
curl -s -H "Authorization: Bearer {ADMIN_TOKEN}" \
  "http://localhost:3010/api/admin/users?limit=5" | python3 -m json.tool
```

### Frontend 확인

| 앱 | 위치 | 확인 항목 |
|----|------|----------|
| aims-uix3 | 계정 설정 → 데이터 탭 | StorageQuotaBar (사용량/할당량/티어) |
| aims-admin | 대시보드 | 스토리지 현황 섹션 (전체 사용량, 경고/위험 사용자) |
| aims-admin | 사용자 관리 | 스토리지 열 (사용량, 티어 배지) |

### MongoDB 확인

```javascript
// users 컬렉션 storage 필드 확인
db.users.findOne({}, { name: 1, storage: 1 })

// 티어별 사용자 수
db.users.aggregate([
  { $group: { _id: "$storage.tier", count: { $sum: 1 } } }
])
```
