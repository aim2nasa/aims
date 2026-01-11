# AIMS 독립 헬스 모니터링 서비스

## 개요

**aims_health_monitor**는 AIMS 시스템의 모든 서비스를 독립적으로 모니터링하는 서비스입니다.

### 왜 필요한가?

기존 아키텍처의 치명적 결함:
```
┌─────────────────────────────────────┐
│           aims_api (3010)           │
│  ┌─────────────────────────────────┐│
│  │   serviceHealthMonitor.js       ││  ← 감시자가 피감시자 안에 있음
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
         ↓ aims_api 죽으면
    모니터링도 죽음 → 장애 감지 불가
```

### 해결 아키텍처
```
┌──────────────────────┐     ┌──────────────────┐
│  aims_health_monitor │────▶│    aims_api      │
│   (독립 프로세스)    │     │     (3010)       │
│   포트: 3012         │     └──────────────────┘
│   PM2 관리           │────▶ [모든 서비스 헬스체크]
└──────────────────────┘
         │
         ▼
┌──────────────────────┐
│     AIMS Admin       │  ← 직접 3012 호출 (aims_api 우회)
└──────────────────────┘
```

---

## 서비스 정보

| 항목 | 값 |
|------|-----|
| 서비스명 | aims-health-monitor |
| 포트 | 3012 |
| 프로세스 관리 | PM2 |
| 위치 | `backend/api/aims_health_monitor/` |
| 체크 간격 | 60초 |
| MongoDB 컬렉션 | `service_health_logs` |

---

## 모니터링 대상 (10개 서비스)

| 서비스 | 포트 | 헬스 엔드포인트 | 체크 방식 |
|--------|------|-----------------|-----------|
| aims_api | 3010 | `/api/health/deep` | HTTP |
| aims_mcp | 3011 | `/health` | HTTP |
| aims_rag_api | 8000 | `/health` | HTTP |
| pdf_proxy | 8002 | `/health` | HTTP |
| annual_report_api | 8004 | `/health` | HTTP |
| pdf_converter | 8005 | `/health` | HTTP |
| document_pipeline | 8100 | `/health` | HTTP |
| n8n | 5678 | `/healthz` | HTTP |
| qdrant | 6333 | - | TCP |
| mongodb | 27017 | - | TCP |

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 자체 헬스체크 |
| GET | `/api/health/current` | 모든 서비스 현재 상태 |
| GET | `/api/health/check` | 강제 헬스체크 실행 |
| GET | `/api/health/history` | 상태 변경 이력 |
| GET | `/api/health/stats` | 다운타임 통계 |
| GET | `/api/ports` | 포트 현황 |
| DELETE | `/api/health/history` | 이력 삭제 |

### 사용 예시

```bash
# 현재 상태 조회
curl http://localhost:3012/api/health/current

# 강제 헬스체크 실행
curl http://localhost:3012/api/health/check

# 상태 변경 이력 조회
curl http://localhost:3012/api/health/history?limit=50

# 다운타임 통계 (30일)
curl http://localhost:3012/api/health/stats?days=30

# 포트 현황
curl http://localhost:3012/api/ports
```

---

## 배포

### 배포 스크립트
```bash
# 서버에서 직접 실행
cd /home/rossi/aims/backend/api/aims_health_monitor && ./deploy_aims_health_monitor.sh

# 로컬에서 SSH로 실행
ssh rossi@100.110.215.65 'cd ~/aims/backend/api/aims_health_monitor && ./deploy_aims_health_monitor.sh'
```

### 상태 확인
```bash
# PM2 상태
pm2 list | grep aims-health-monitor

# 헬스체크
curl http://localhost:3012/health

# 전체 서비스 상태
curl http://localhost:3012/api/health/current
```

---

## Nginx 설정 (Production)

Admin 프론트엔드가 HTTPS로 health_monitor에 접근하려면 Nginx 프록시 설정이 필요합니다.

`/etc/nginx/sites-available/tars` 파일에 다음 location 블록을 추가:

```nginx
# 독립 헬스 모니터 서비스 프록시
location /health-monitor/ {
    proxy_pass http://localhost:3012/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60;

    # CORS 헤더
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;

    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, DELETE, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' 0;
        return 204;
    }
}
```

설정 후 Nginx 재시작:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Admin 프론트엔드 설정

### 환경변수

**Development (`.env.development`):**
```
VITE_HEALTH_MONITOR_URL=http://100.110.215.65:3012
```

**Production (`.env.production`):**
```
VITE_HEALTH_MONITOR_URL=https://tars.giize.com/health-monitor
```

### API 클라이언트

`frontend/aims-admin/src/shared/api/apiClient.ts`:
```typescript
export const healthMonitorClient = new ApiClient(HEALTH_MONITOR_URL);
```

`frontend/aims-admin/src/features/dashboard/api.ts`:
- `getHealthCurrent()` - 현재 서비스 상태 조회
- `forceHealthCheck()` - 강제 헬스체크 실행
- `getPorts()` - 포트 현황 조회
- `getHealthHistory()` - 상태 변경 이력 조회
- `getHealthStats()` - 다운타임 통계 조회
- `clearHealthHistory()` - 이력 삭제

---

## 구현 완료 상황

### Phase 1: 서비스 구조 생성 ✅
- [x] 폴더 구조 생성
- [x] package.json
- [x] tsconfig.json
- [x] ecosystem.config.js

### Phase 2: 핵심 기능 ✅
- [x] config.ts (서비스 목록)
- [x] db.ts (MongoDB 연결)
- [x] healthChecker.ts (HTTP/TCP 체크)
- [x] monitor.ts (주기적 모니터링)

### Phase 3: API 엔드포인트 ✅
- [x] routes.ts
- [x] handlers.ts
- [x] index.ts (Express 서버)

### Phase 4: 배포 설정 ✅
- [x] deploy_aims_health_monitor.sh
- [x] 서버 배포 완료

### Phase 5: Admin 연동 ✅
- [x] healthMonitorClient 추가
- [x] API 함수 수정 (getHealthCurrent, getPorts, getHealthHistory, getHealthStats, clearHealthHistory)
- [x] 환경변수 추가 (.env.development, .env.production)

### Phase 6: 기존 코드 정리
- [x] aims_api 코드는 백워드 호환성 위해 유지

### 남은 작업
- [ ] Nginx 프록시 설정 (sudo 필요)
- [ ] Admin UI 검증

---

## 트러블슈팅

### 서비스가 시작되지 않을 때
```bash
# PM2 로그 확인
pm2 logs aims-health-monitor --lines 50

# 포트 사용 확인
lsof -i :3012
```

### MongoDB 연결 실패
```bash
# MongoDB 상태 확인
systemctl status mongod

# 연결 테스트
mongo tars:27017/docupload --eval "db.stats()"
```

### TypeScript 빌드 오류
```bash
# node_modules 재설치
cd ~/aims/backend/api/aims_health_monitor
rm -rf node_modules dist
npm install
npm run build
```

---

## 파일 구조

```
backend/api/aims_health_monitor/
├── package.json
├── tsconfig.json
├── ecosystem.config.js       # PM2 설정
├── deploy_aims_health_monitor.sh
├── nginx_location.conf       # Nginx 설정 스니펫
├── src/
│   ├── index.ts              # Express 서버 + 메인
│   ├── config.ts             # 서비스 목록 + 설정
│   ├── db.ts                 # MongoDB 독립 연결
│   ├── healthChecker.ts      # HTTP/TCP 헬스체크
│   ├── monitor.ts            # 주기적 모니터링
│   └── api/
│       ├── routes.ts         # Express 라우터
│       └── handlers.ts       # API 핸들러
└── dist/                     # 컴파일 결과
```
