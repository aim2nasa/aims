# AIMS Admin 프론트엔드 구축 보고서

**작성일**: 2025-12-08
**작업자**: Claude Sonnet 4.5
**프로젝트**: AIMS Admin (관리자 전용 대시보드)

---

## 📋 프로젝트 개요

### 목적
AIMS UIX3 서비스를 모니터링 및 제어하는 관리자 전용 웹 애플리케이션 구축

### 주요 요구사항
- aims-uix3와 완전 분리된 별도 프로젝트
- 동일한 MongoDB 데이터베이스 공유 (docupload)
- 동일한 백엔드 API 서버 공유 (포트 3010, 8000)
- admin 권한을 가진 사용자만 접근 가능
- 시스템 통계, 사용자 관리 기능 제공

### 배포 정보
- **프론트엔드 URL**: https://admin.aims.giize.com
- **개발 포트**: 5178
- **백엔드 API**: https://aims.giize.com/api
- **Python API**: https://tars.giize.com:8000

---

## 🏗️ 아키텍처 결정사항

### 1. 프로젝트 구조
**결정**: `frontend/aims-admin/` 별도 프로젝트

**이유**:
- aims-uix3와 완전 분리 (보안)
- 독립 배포 및 롤백 가능
- 독립적인 번들 최적화
- 관리자 전용 기능 격리

### 2. 기술 스택
**결정**: aims-uix3와 동일 스택 사용

**선택한 스택**:
- React 18 + TypeScript
- Vite (빌드 도구)
- TanStack Query (서버 상태 관리)
- Zustand (전역 상태 관리)
- React Router v6
- CSS Variables (Apple Design System)

**이유**:
- 공통 컴포넌트 재사용 가능
- 학습 곡선 제로
- 일관된 코드베이스 유지

### 3. 인증 방식
**결정**: JWT 토큰 공유 + role='admin' 체크

**구현**:
- 카카오 OAuth 재사용 (기존 인증 시스템)
- JWT 토큰에서 role 확인
- admin이 아니면 403 페이지로 리다이렉트

### 4. 배포 전략
**개발 환경**:
- 포트: 5178
- URL: http://localhost:5178

**프로덕션 환경**:
- 도메인: admin.aims.giize.com (서브도메인)
- 서버 경로: `/home/rossi/aims/frontend/aims-admin/dist/`
- 배포 방식: Nginx 정적 파일 서빙
- SSL: Let's Encrypt (2026-03-08까지 유효)

---

## 🛠️ 구현 내용

### Phase 1: 프로젝트 초기 설정

**커밋**: `5a505762` - feat: aims-admin 프로젝트 초기 설정

```bash
# 프로젝트 생성
cd d:/aims/frontend
npm create vite@latest aims-admin -- --template react-ts
cd aims-admin
npm install

# 의존성 설치
npm install react-router-dom @tanstack/react-query zustand jwt-decode
```

**주요 설정**:
- `vite.config.ts`: 포트 5178, path alias (@/*)
- `tsconfig.app.json`: baseUrl 및 paths 설정
- `.env.development`, `.env.production`: 환경 변수

### Phase 2: CSS 시스템 및 공통 UI 컴포넌트

**커밋**: `362b7eeb` - feat: CSS 변수 시스템 및 공통 UI 컴포넌트 구축

**구현 컴포넌트**:
- `Button`: primary, secondary, ghost, destructive variants
- `Modal`: Portal 기반 모달 (ESC 키 지원)
- `StatCard`: 통계 카드 (제목, 값, 부제목)
- `Table`: 제네릭 테이블 컴포넌트

**CSS 시스템**:
```css
/* Apple Design System 기반 */
--color-primary: #007aff;
--color-background: #f5f5f7;
--color-text: #1d1d1f;
--font-size-base: 13px;
--border-radius: 8px;
```

### Phase 3: 인증 시스템

**커밋**: `666c1215` - feat: 인증 시스템 구현 (JWT + 관리자 권한 체크)

**구현 파일**:
- `src/features/auth/types.ts`: User, AuthResponse 타입 정의
- `src/shared/store/authStore.ts`: Zustand + persist middleware
- `src/features/auth/ProtectedRoute.tsx`: 관리자 권한 체크 HOC
- `src/pages/LoginPage/LoginPage.tsx`: 카카오 로그인 페이지
- `src/pages/UnauthorizedPage/UnauthorizedPage.tsx`: 403 페이지

**authStore 구조**:
```typescript
interface AuthState {
  token: string | null;
  user: User | null;
  isAdmin: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}
```

**ProtectedRoute 로직**:
```typescript
export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
};
```

### Phase 4: 앱 구조 및 라우팅

**커밋**: `3fa5973b` - feat: 앱 구조 및 라우팅 연결

**구현**:
- `src/App.tsx`: 헤더, 사이드바, 메인 레이아웃
- `src/app/router.tsx`: React Router 설정
- `src/app/queryClient.ts`: TanStack Query 설정

**라우트 구조**:
```
/login              - 로그인 페이지
/unauthorized       - 권한 없음 (403)
/                   - ProtectedRoute
  /dashboard        - 대시보드
  /users            - 사용자 관리
```

### Phase 5: 대시보드 페이지

**커밋**: `33f4e5d0` - feat: 대시보드 페이지 구현

**기능**:
- 시스템 통계: 전체 사용자, 활성 사용자, 고객 수, 문서 수, 계약 수
- 문서 처리 현황: OCR 대기, 임베딩 대기, 처리 실패
- 시스템 상태: Node.js API, Python API, MongoDB, Qdrant

**API 엔드포인트**: `GET /api/admin/dashboard`

### Phase 6: 사용자 관리 페이지

**커밋**: `6e7ce256` - feat: 사용자 목록 페이지 구현

**기능**:
- 전체 사용자 목록 조회
- 검색 (이름, 이메일)
- 필터링 (역할, OCR 권한)
- 페이지네이션 (50개/페이지)

**API 엔드포인트**: `GET /api/admin/users?page=1&limit=50&search=김&role=user`

### Phase 7: 백엔드 API 구현

**커밋**: `5c2f51f4` - feat: 관리자 대시보드 및 사용자 목록 API 구현

**구현 API**:

1. **GET /api/admin/dashboard**
```javascript
{
  stats: { totalUsers, activeUsers, totalCustomers, totalDocuments, totalContracts },
  processing: { ocrQueue, embedQueue, failedDocuments },
  health: { nodeApi, pythonApi, mongodb, qdrant }
}
```

2. **GET /api/admin/users**
```javascript
{
  users: [...],
  pagination: { total, page, limit, totalPages }
}
```

**파일**: `backend/api/aims_api/server.js` (lines 3365-3503)

### Phase 8: TypeScript 오류 수정

**커밋**:
- `df607833` - fix: TypeScript import 및 경로 수정
- `978bfb52` - fix: TypeScript verbatimModuleSyntax 오류 수정

**해결한 문제**:
- Router import 경로 오류 (`./App` → `../App`)
- `import type` 적용 (PropsWithChildren, ReactNode, ButtonHTMLAttributes, User)
- apiClient.ts HeadersInit 타입 오류 → `Record<string, string>`

### Phase 9: admin.aims.giize.com 지원 추가

**커밋**: `0a35da86` - feat: admin.aims.giize.com 지원 추가

**백엔드 수정**:

1. **CORS 설정** (`server.js`)
```javascript
const ALLOWED_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',  // 신규 추가
  'http://localhost:5177',
  'http://localhost:5178',
  // ...
];
```

2. **카카오 OAuth 리다이렉트** (`routes/auth.js`)
```javascript
const ALLOWED_REDIRECT_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',  // 신규 추가
  'http://localhost:5177',
  'http://localhost:5178',
  // ...
];
```

3. **로그인 콜백 경로 통일**
```javascript
// 변경 전: /auth/callback
// 변경 후: /login
res.redirect(`${frontendUrl}/login?token=${token}`);
```

---

## 🚀 배포 과정

### 1. 서버에 프로젝트 복사

```bash
cd d:/aims/frontend
scp -r aims-admin rossi@tars.giize.com:/home/rossi/aims/frontend/
```

### 2. 서버에서 빌드

```bash
ssh tars.giize.com
cd /home/rossi/aims/frontend/aims-admin
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 3. Nginx 설정

**파일**: `/etc/nginx/sites-available/admin-aims`

```nginx
server {
    listen 80;
    server_name admin.aims.giize.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.aims.giize.com;

    ssl_certificate /etc/letsencrypt/live/admin.aims.giize.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.aims.giize.com/privkey.pem;

    root /home/rossi/aims/frontend/aims-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. SSL 인증서 발급

```bash
sudo cp /tmp/admin-aims-http /etc/nginx/sites-available/admin-aims
sudo ln -sf /etc/nginx/sites-available/admin-aims /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d admin.aims.giize.com
```

**인증서 정보**:
- 발급일: 2025-12-08
- 만료일: 2026-03-08
- 경로: `/etc/letsencrypt/live/admin.aims.giize.com/`

### 5. API 서버 재시작

```bash
cd /home/rossi/aims/backend/api/aims_api
./deploy_aims_api.sh
```

---

## 🐛 주요 이슈 및 해결방법

### Issue 1: Vite Module Resolution Error
**문제**: `The requested module '/src/features/auth/types.ts' does not provide an export named 'User'`

**해결**:
1. Vite 캐시 삭제: `rm -rf node_modules/.vite dist .vite`
2. zustand-persist 제거 (Zustand v5는 내장 persist 사용)
3. types.ts 파일 재생성 (CRLF → LF)
4. 모든 타입 import를 `import type` 구문으로 변경

### Issue 2: Kakao Login Redirect
**문제**: 카카오 로그인 후 `aims.giize.com`으로 리다이렉트됨

**원인**: 백엔드의 허용 리다이렉트 목록에 admin 도메인 없음

**해결**:
- `routes/auth.js`의 `ALLOWED_REDIRECT_ORIGINS`에 추가
- OAuth state 파라미터로 리다이렉트 URL 전달

### Issue 3: 403 Forbidden (권한 없음)
**문제**: 로그인 성공했지만 403 에러

**원인**: 로그인한 사용자의 role이 'user'

**해결**:
```bash
ssh tars.giize.com
mongosh docupload --eval "db.users.updateOne(
  {_id: ObjectId('692319ceca93bbee80bd227c')},
  {\$set: {role: 'admin'}}
)"
```

### Issue 4: CORS Error
**문제**: `admin.aims.giize.com`에서 API 호출 시 CORS 에러

**원인**: `server.js`의 CORS 설정이 `aims.giize.com`만 허용

**해결**:
```javascript
const ALLOWED_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',  // 추가
  // ...
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### Issue 5: TypeScript Build Errors
**문제**: `npm run build` 시 TypeScript 컴파일 에러

**원인**: `verbatimModuleSyntax` 옵션으로 인한 type-only import 요구

**해결**:
```typescript
// 변경 전
import { PropsWithChildren } from 'react';

// 변경 후
import type { PropsWithChildren } from 'react';
```

**적용 파일**:
- ProtectedRoute.tsx
- Button.tsx
- Modal.tsx
- authStore.ts
- LoginPage.tsx
- UsersPage.tsx
- users/api.ts

---

## 📊 프로젝트 통계

### 커밋 수
- 프론트엔드: 7개 커밋
- 백엔드: 2개 커밋
- 수정 커밋: 2개
- **총 11개 커밋**

### 파일 수
**프론트엔드** (`frontend/aims-admin/`):
- 컴포넌트: 12개
- 페이지: 4개
- API: 2개
- 스토어: 1개
- 설정 파일: 6개

**백엔드 수정**:
- `server.js`: CORS 설정
- `routes/auth.js`: OAuth 리다이렉트

### 코드 라인 수 (추정)
- TypeScript/TSX: ~2,000 lines
- CSS: ~1,200 lines
- JavaScript (backend): ~150 lines

---

## ✅ 검증 완료 사항

### 기능 검증
- ✅ 카카오 로그인 정상 작동
- ✅ admin 권한 체크 정상 작동
- ✅ 대시보드 데이터 로드 성공
  - 시스템 통계: 사용자 3명, 고객 26명, 문서 31개, 계약 19개
  - 처리 현황: 모두 정상 (대기/실패 없음)
  - 시스템 상태: 모든 서비스 Healthy
- ✅ 사용자 관리 페이지 정상 작동
  - 목록 조회, 검색, 필터링 정상
  - 역할 및 OCR 권한 표시 정상

### 배포 검증
- ✅ https://admin.aims.giize.com 접속 성공
- ✅ SSL 인증서 정상 작동
- ✅ API 통신 정상 (CORS 해결)
- ✅ OAuth 리다이렉트 정상

### 보안 검증
- ✅ admin 권한 없는 사용자 접근 차단 (403)
- ✅ 미인증 사용자 로그인 페이지로 리다이렉트
- ✅ JWT 토큰 검증 정상 작동

---

## 📝 향후 개선 사항

### Phase 2: 사용자 관리 강화 (계획)
- [ ] 사용자 상세 모달
- [ ] OCR 권한 토글 기능
- [ ] 역할 변경 기능
- [ ] 사용자 활성화/비활성화
- [ ] 로그인 이력 조회

### Phase 3: 데이터 관리 (계획)
- [ ] 문서 처리 현황 상세
- [ ] 문서 재처리 기능
- [ ] 고객 데이터 검색/수정
- [ ] 삭제된 데이터 복원

### 보안 강화 (Phase 4+)
- [ ] IP 화이트리스트
- [ ] 2FA (이중 인증)
- [ ] 감사 로그 (모든 관리 작업 기록)
- [ ] Rate Limiting

### 성능 최적화
- [ ] React.lazy() + Suspense (코드 스플리팅)
- [ ] 가상화 테이블 (react-window)
- [ ] TanStack Query 캐싱 최적화

---

## 🔗 참고 문서

### 관련 문서
- [CSS_SYSTEM.md](../frontend/aims-uix3/CSS_SYSTEM.md) - CSS 시스템 가이드
- [SECURITY_ROADMAP.md](./SECURITY_ROADMAP.md) - 보안 로드맵
- [Plan File](../C:/Users/rossi/.claude/plans/delegated-drifting-fiddle.md) - 원본 계획 문서

### 외부 문서
- [React 공식 문서](https://react.dev)
- [TanStack Query](https://tanstack.com/query/latest)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Vite](https://vitejs.dev)

---

## 📞 운영 정보

### 접속 정보
- **URL**: https://admin.aims.giize.com
- **권한**: admin role 필요
- **인증**: 카카오 OAuth (aims-uix3와 동일)

### 서버 정보
- **서버**: tars.giize.com
- **경로**: `/home/rossi/aims/frontend/aims-admin/`
- **Nginx 설정**: `/etc/nginx/sites-available/admin-aims`

### 배포 스크립트
```bash
#!/bin/bash
# /home/rossi/aims/frontend/aims-admin/deploy.sh

cd /home/rossi/aims/frontend/aims-admin
npm run build
sudo systemctl reload nginx
echo "✅ AIMS Admin deployed successfully"
```

### 백엔드 API
- **Node.js API**: http://localhost:3010 (포트)
- **Python API**: http://localhost:8000 (포트)
- **배포 스크립트**: `/home/rossi/aims/backend/api/aims_api/deploy_aims_api.sh`

---

## 📜 라이선스 및 저작권

**프로젝트**: AIMS (Agent Intelligent Management System)
**소유자**: aim2nasa
**개발**: Claude Sonnet 4.5 (Anthropic)
**일자**: 2025-12-08

---

**문서 버전**: 1.0.0
**최종 수정**: 2025-12-08 23:30 KST
