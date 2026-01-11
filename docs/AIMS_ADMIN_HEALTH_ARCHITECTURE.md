# AIMS Admin 헬스 모니터링 아키텍처

## 개요

AIMS Admin의 시스템 상태 페이지는 **두 개의 독립된 데이터 소스**에서 정보를 수집합니다.
이 구조는 aims_api 장애 시에도 서비스 상태 모니터링이 가능하도록 설계되었습니다.

---

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AIMS Admin (Frontend)                        │
│                     SystemHealthPage.tsx                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐          ┌─────────────────────┐          │
│  │   healthMonitorClient│          │     apiClient       │          │
│  │   (3012 전용)        │          │   (3010 전용)       │          │
│  └──────────┬──────────┘          └──────────┬──────────┘          │
│             │                                 │                     │
└─────────────┼─────────────────────────────────┼─────────────────────┘
              │                                 │
              ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│  aims_health_monitor    │       │       aims_api          │
│       (3012)            │       │        (3010)           │
│                         │       │                         │
│  - 서비스 상태 (10개)   │       │  - 서버 리소스          │
│  - 포트 현황            │       │  - 실시간 메트릭        │
│  - 상태 변경 이력       │       │  - n8n 워크플로우       │
│  - 다운타임 통계        │       │  - 대시보드 통계        │
│                         │       │                         │
│  [독립 PM2 프로세스]    │       │  [메인 백엔드 서비스]   │
└───────────┬─────────────┘       └───────────┬─────────────┘
            │                                 │
            │    ┌────────────────────┐       │
            └───▶│     MongoDB        │◀──────┘
                 │   (27017)          │
                 │                    │
                 │ - service_health_  │
                 │   logs (이력)      │
                 │ - system_metrics   │
                 │   (리소스)         │
                 └────────────────────┘
```

---

## 왜 이 구조인가?

### 기존 문제점

```
┌─────────────────────────────────┐
│         aims_api (3010)         │
│  ┌───────────────────────────┐  │
│  │  serviceHealthMonitor.js  │  │  ← 감시자가 피감시자 안에 있음
│  └───────────────────────────┘  │
└─────────────────────────────────┘
              │
              ▼
    aims_api 죽으면 → 모니터링도 죽음 → 장애 감지 불가
```

### 해결책: 독립 모니터링 프로세스

```
aims_health_monitor (3012)  ←── 완전히 분리된 프로세스
         │
         ├──▶ aims_api (3010)     ← 외부에서 헬스체크
         ├──▶ aims_mcp (3011)
         ├──▶ aims_rag_api (8000)
         ├──▶ ... (10개 서비스)
         │
         ▼
    어떤 서비스가 죽어도 모니터링은 계속 동작
```

---

## 데이터 소스 매핑

### aims_health_monitor (3012)에서 가져오는 데이터

| UI 섹션 | API 엔드포인트 | 설명 |
|---------|---------------|------|
| 서비스 동작 요약 | `/api/health/current` | healthy/unhealthy 카운트 |
| Tier 1/2/3 서비스 상태 | `/api/health/current` | 개별 서비스 상태 |
| 포트 현황 | `/api/ports` | 10개 포트 listening/closed |
| 상태 변경 이력 | `/api/health/history` | down/recovered 이벤트 로그 |

### aims_api (3010)에서 가져오는 데이터

| UI 섹션 | API 엔드포인트 | 설명 |
|---------|---------------|------|
| 서버 리소스 | `/api/admin/metrics/current` | CPU, 메모리, 디스크 |
| 리소스 히스토리 차트 | `/api/admin/metrics/history` | 시간별 리소스 추이 |
| 실시간 모니터링 | `/api/admin/metrics/realtime` | 부하지수, 동시접속 |
| n8n 워크플로우 | `/api/admin/dashboard` | 워크플로우 활성화 상태 |

---

## Graceful Degradation (우아한 성능 저하)

aims_api가 다운되어도 시스템 상태 페이지는 **부분적으로 동작**합니다.

### aims_api 정상 시
```
┌────────────────────────────────────────────────────────────┐
│ 서비스 동작: ● 10/10 정상                                  │
├────────────────────────────────────────────────────────────┤
│ 서버 리소스: CPU 45% | 메모리 62% | 디스크 38%             │
│ 실시간 모니터링: 부하지수 0.35 (정상)                      │
│ Tier 1: ● mongodb ● qdrant                                │
│ Tier 2: ● aims_api ● aims_rag_api ...                     │
│ n8n 워크플로우: 5/5 활성화                                 │
│ 포트 현황: 10/10 listening                                 │
└────────────────────────────────────────────────────────────┘
```

### aims_api 다운 시
```
┌────────────────────────────────────────────────────────────┐
│ 서비스 동작: ● 9/10 정상                                   │
├────────────────────────────────────────────────────────────┤
│ 서버 리소스: aims_api(3010) 복구 후 표시됩니다             │
│ 실시간 모니터링: aims_api 연결 필요                        │
│ Tier 1: ● mongodb ● qdrant                                │
│ Tier 2: ○ aims_api ● aims_rag_api ...  ← 빨간색 표시      │
│ n8n 워크플로우: aims_api(3010) 복구 후 표시됩니다          │
│ 포트 현황: 9/10 listening (3010 closed)                    │
└────────────────────────────────────────────────────────────┘
```

**핵심**: 서비스 상태와 포트 현황은 aims_health_monitor(3012)에서 가져오므로 **항상 표시됨**

---

## 주요 파일

### Frontend

| 파일 | 역할 |
|------|------|
| `src/pages/SystemHealthPage/SystemHealthPage.tsx` | 메인 UI 컴포넌트 |
| `src/features/dashboard/api.ts` | API 호출 함수 정의 |
| `src/shared/api/apiClient.ts` | HTTP 클라이언트 (apiClient, healthMonitorClient) |
| `.env.development` | 개발 환경 URL 설정 |
| `.env.production` | 프로덕션 URL 설정 |

### Backend (aims_health_monitor)

| 파일 | 역할 |
|------|------|
| `src/index.ts` | Express 서버 진입점 |
| `src/config.ts` | 모니터링 대상 서비스 목록 |
| `src/monitor.ts` | 60초 주기 헬스체크 로직 |
| `src/healthChecker.ts` | HTTP/TCP 헬스체크 구현 |
| `src/api/handlers.ts` | API 엔드포인트 핸들러 |
| `src/db.ts` | MongoDB 독립 연결 |

---

## 환경 변수

### Development (.env.development)
```
VITE_API_BASE_URL=https://aims.giize.com
VITE_HEALTH_MONITOR_URL=http://100.110.215.65:3012
```

### Production (.env.production)
```
VITE_API_BASE_URL=https://aims.giize.com
VITE_HEALTH_MONITOR_URL=https://tars.giize.com/health-monitor
```

**Production 참고**: Nginx 프록시를 통해 `/health-monitor` → `localhost:3012` 라우팅

---

## 동기화 메커니즘

서비스 상태가 변경되면 모든 섹션이 **동시에 업데이트**됩니다.

```typescript
// SystemHealthPage.tsx
const prevAimsApiStatus = useRef<boolean | null>(null);

useEffect(() => {
  if (prevAimsApiStatus.current !== isAimsApiHealthy) {
    prevAimsApiStatus.current = isAimsApiHealthy;
    // 모든 관련 쿼리 즉시 갱신
    queryClient.invalidateQueries({ queryKey: ['admin'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['health-monitor'], refetchType: 'all' });
  }
}, [isAimsApiHealthy, queryClient]);
```

**동작**:
1. aims_health_monitor가 aims_api 상태 변경 감지
2. Frontend가 `isAimsApiHealthy` 변경 감지
3. 모든 관련 쿼리 캐시 무효화 → 동시 refetch
4. UI 전체 동기화 업데이트

---

## 모니터링 대상 서비스 (10개)

| 서비스 | 포트 | 체크 방식 | 헬스 엔드포인트 |
|--------|------|----------|----------------|
| aims_api | 3010 | HTTP | `/api/health/deep` |
| aims_mcp | 3011 | HTTP | `/health` |
| aims_rag_api | 8000 | HTTP | `/health` |
| pdf_proxy | 8002 | HTTP | `/health` |
| annual_report_api | 8004 | HTTP | `/health` |
| pdf_converter | 8005 | HTTP | `/health` |
| document_pipeline | 8100 | HTTP | `/health` |
| n8n | 5678 | HTTP | `/healthz` |
| qdrant | 6333 | TCP | - |
| mongodb | 27017 | TCP | - |

---

## 배포

### aims_health_monitor 배포
```bash
ssh rossi@100.110.215.65 'cd ~/aims/backend/api/aims_health_monitor && ./deploy_aims_health_monitor.sh'
```

### aims_admin 배포 (포함된 변경사항 반영)
```bash
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'
```

---

## 트러블슈팅

### Q: 서비스 상태가 표시되지 않음
1. aims_health_monitor 실행 확인: `pm2 list | grep aims-health-monitor`
2. 헬스체크: `curl http://localhost:3012/health`
3. 로그 확인: `pm2 logs aims-health-monitor`

### Q: 포트 현황이 업데이트 안 됨
- 10초마다 자동 갱신됨
- 강제 갱신: 새로고침 버튼 클릭 (forceHealthCheck 호출)

### Q: aims_api 다운인데 서버 리소스가 표시됨
- React Query 캐시에 이전 데이터가 남아있을 수 있음
- `isAimsApiHealthy` 상태 확인 → unavailable 메시지 표시되어야 함

---

## 관련 문서

- [INDEPENDENT_HEALTH_MONITOR.md](./INDEPENDENT_HEALTH_MONITOR.md) - aims_health_monitor 상세 문서
- [NETWORK_SECURITY_ARCHITECTURE.md](./NETWORK_SECURITY_ARCHITECTURE.md) - 네트워크 보안 구조
