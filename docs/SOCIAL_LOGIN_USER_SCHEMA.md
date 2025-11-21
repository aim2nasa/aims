# AIMS 소셜 로그인 사용자 스키마 설계

## 개요

AIMS는 카카오, 네이버, 구글 소셜 로그인을 지원합니다.
사용자 고유 식별은 MongoDB `_id`를 사용하고, 소셜 로그인 ID는 연동 정보로 저장합니다.

---

## 사용자 스키마

```javascript
{
  // AIMS 내부 고유 식별자
  _id: ObjectId("691ff645c5a998887dfef5ce"),

  // 사용자 기본 정보
  name: "홍길동",                    // 표시용 이름 (필수)
  email: "hong@example.com",        // 이메일 (선택)
  avatarUrl: "https://...",         // 프로필 이미지 (선택)
  role: "user",                     // 권한: user, admin

  // 소셜 로그인 연동 정보
  kakaoId: 4581062564,              // 카카오 로그인 ID
  naverId: null,                    // 네이버 로그인 ID
  googleId: null,                   // 구글 로그인 ID

  // 메타 정보
  authProvider: "kakao",            // 최초 가입 방법
  profileCompleted: true,           // 프로필 설정 완료 여부
  createdAt: ISODate("2025-11-21"), // 가입일
  lastLogin: ISODate("2025-11-21")  // 최근 로그인
}
```

---

## 고유 식별자 설계

| 필드 | 용도 | 고유성 |
|------|------|--------|
| `_id` | AIMS 내부 식별자 | 전체 고유 |
| `kakaoId` | 카카오 로그인용 | 카카오 내 고유 |
| `naverId` | 네이버 로그인용 | 네이버 내 고유 |
| `googleId` | 구글 로그인용 | 구글 내 고유 |

**핵심**: `_id`가 AIMS 시스템 내 유일한 식별자

---

## 로그인 플로우

### 1. 최초 가입 (카카오 예시)

```
카카오 로그인 → kakaoId로 사용자 검색 → 없음 → 새 사용자 생성
                                              ↓
                                    프로필 설정 화면 표시
                                              ↓
                                    이름 입력 → 메인 화면
```

### 2. 기존 사용자 로그인

```
카카오 로그인 → kakaoId로 사용자 검색 → 있음 → JWT 발급 → 메인 화면
```

### 3. 계정 연동 (향후)

```
카카오로 로그인한 사용자 → 설정 → "네이버 연결" 클릭
                                    ↓
                         네이버 OAuth → naverId 저장
                                    ↓
                         이후 카카오/네이버 둘 다 로그인 가능
```

---

## 인덱스 설계

```javascript
// MongoDB 인덱스
db.users.createIndex({ kakaoId: 1 }, { unique: true, sparse: true });
db.users.createIndex({ naverId: 1 }, { unique: true, sparse: true });
db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true });
db.users.createIndex({ email: 1 }, { sparse: true });
```

- `sparse: true` - null 값은 인덱스에서 제외
- `unique: true` - 중복 방지

---

## 프로필 설정 플로우

### 최초 로그인 시

1. `profileCompleted: false`로 사용자 생성
2. 로그인 후 프로필 설정 모달 자동 표시
3. 이름 입력 후 `profileCompleted: true`로 업데이트
4. 메인 화면 진입

### 프로필 설정 모달

```
┌─────────────────────────────┐
│                             │
│   프로필을 설정해주세요       │
│                             │
│   이름: [____________]      │
│                             │
│        [시작하기]            │
│                             │
└─────────────────────────────┘
```

- 이름: 필수 (2-20자)
- 이메일: 선택 (나중에 계정 설정에서 추가)

---

## API 엔드포인트

### 프로필 업데이트

```
PUT /api/auth/profile
Authorization: Bearer {token}

{
  "name": "홍길동"
}

Response:
{
  "success": true,
  "user": {
    "_id": "691ff645c5a998887dfef5ce",
    "name": "홍길동",
    "profileCompleted": true
  }
}
```

### 사용자 정보 조회

```
GET /api/auth/me
Authorization: Bearer {token}

Response:
{
  "success": true,
  "user": {
    "_id": "691ff645c5a998887dfef5ce",
    "name": "홍길동",
    "email": null,
    "avatarUrl": null,
    "role": "user",
    "authProvider": "kakao",
    "profileCompleted": true
  }
}
```

---

## 보안 고려사항

1. **소셜 ID 노출 금지**: `kakaoId`, `naverId`, `googleId`는 API 응답에 포함하지 않음
2. **JWT에 최소 정보만 포함**: `_id`, `name`, `role`만 포함
3. **소셜 토큰 저장 안 함**: Access Token은 로그인 시에만 사용, 저장하지 않음

---

## 향후 확장

### 계정 연동 기능

- 하나의 AIMS 계정에 여러 소셜 로그인 연결
- "계정 설정" → "소셜 계정 연동" 메뉴

### 이메일 로그인 추가 (선택)

- 소셜 로그인 없이 이메일/비밀번호 로그인
- `passwordHash` 필드 추가
