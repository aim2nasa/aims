# 좀비 상태 및 n8n DB 잠금 오류 - 근본 원인 분석 및 해결

**작성일**: 2026-01-03
**작성자**: Claude Code
**상태**: 해결됨

---

## 문제 요약

### 발생 현상
1. **좀비 상태**: aims-api 컨테이너가 health check는 통과하지만 실제 API 요청에는 응답하지 않음
2. **n8n DB 잠금 오류**: `Error: in prepare, database is locked (5)` 반복 발생 (4시간 동안 15회)
3. **CPU 사용량 급증**: 19:40 이후 30%대로 상승

### 영향
- 프론트엔드에서 "⌛ 생각 시간이 초과되었습니다" 에러 발생
- 사용자 서비스 중단

---

## 근본 원인

### 핵심 문제: `execSync`를 사용한 SQLite 직접 쿼리

**문제 코드 위치**: `backend/api/aims_api/server.js:5370-5376`

```javascript
// ❌ 문제의 코드 (제거됨)
const n8nDbPath = '/n8n_data/database.sqlite';
const { execSync } = require('child_process');
const query = `SELECT id, name, active, updatedAt FROM workflow_entity...`;
const output = execSync(`sqlite3 "${n8nDbPath}" "${query}"`, { encoding: 'utf8' });
```

### 왜 문제인가?

| 문제 | 설명 | 결과 |
|------|------|------|
| **동기 차단** | `execSync`는 Node.js 이벤트 루프를 완전히 차단 | 모든 요청 처리 중단 |
| **DB 잠금 충돌** | n8n이 쓰기 중일 때 SQLite 읽기 시도 | `database is locked` 오류 |
| **긴 대기 시간** | SQLite 잠금 대기 시 수십 초 블로킹 가능 | API 타임아웃 |

### 장애 시나리오 (재현)

```
1. 관리자가 Admin 대시보드 접속
2. /api/admin/dashboard API 호출
3. n8n 워크플로우 상태 조회를 위해 execSync 실행
4. n8n이 워크플로우 실행 중 (SQLite 쓰기 잠금)
5. execSync가 DB 잠금 해제 대기 (이벤트 루프 차단)
6. 다른 모든 API 요청 응답 불가 → 좀비 상태
7. health check는 이미 진행 중인 요청이 없으므로 통과
8. 결국 타임아웃으로 오류 반환, 하지만 이미 서비스 지연 발생
```

---

## 해결 방법

### 적용된 수정

**n8n REST API 사용으로 교체**:

```javascript
// ✅ 수정된 코드
const n8nApiKey = process.env.N8N_API_KEY;
if (n8nApiKey) {
  const n8nResponse = await axios.get('http://localhost:5678/api/v1/workflows', {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
    timeout: 5000  // 5초 타임아웃
  });
  // ... 워크플로우 필터링
}
```

### 개선 효과

| 항목 | 이전 | 이후 |
|------|------|------|
| 이벤트 루프 | 차단됨 | 비동기, 차단 없음 |
| DB 잠금 | 발생 가능 | 발생 불가 (API 사용) |
| 오류 처리 | 프로세스 중단 위험 | 우아한 실패 (warn 로그) |
| 타임아웃 | 무제한 (execSync) | 5초 제한 |

---

## 추가 예방 조치

### 1. Deep Health Check 추가

좀비 상태를 30초 내에 감지할 수 있도록 `/api/health/deep` 엔드포인트 추가:

```javascript
app.get('/api/health/deep', async (req, res) => {
  // MongoDB ping + 실제 쿼리 수행
  await db.admin().ping();
  await db.collection('files').findOne({}, { maxTimeMS: 3000 });
  res.json({ status: 'healthy' });
});
```

### 2. Docker HEALTHCHECK 추가

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health/deep || exit 1
```

### 3. 배포 이벤트 기록

배포 스크립트에서 restart-initiated, restart-completed 이벤트를 DB에 기록하여 추적 가능.

---

## 교훈

### 1. 동기 작업 금지

> **Node.js에서 `execSync`, `readFileSync` 등 동기 함수는 이벤트 루프를 차단합니다.**
>
> 서버 코드에서는 반드시 비동기 버전(`exec`, `readFile`)을 사용하거나,
> 외부 서비스는 REST API를 통해 접근해야 합니다.

### 2. SQLite 직접 접근 금지

> **다른 서비스의 SQLite 데이터베이스를 직접 쿼리하면 안 됩니다.**
>
> - 잠금 충돌 발생 위험
> - 스키마 변경 시 호환성 문제
> - 트랜잭션 무결성 훼손 가능
>
> 항상 해당 서비스가 제공하는 API를 사용해야 합니다.

### 3. Health Check의 한계

> **단순 ping 기반 health check는 좀비 상태를 감지하지 못합니다.**
>
> 실제 비즈니스 로직을 수행하는 "deep health check"가 필요합니다.

---

## 관련 파일

| 파일 | 변경 내용 |
|------|----------|
| `backend/api/aims_api/server.js` | SQLite 직접 쿼리 → n8n REST API |
| `backend/api/aims_api/server.js` | `/api/health/deep` 엔드포인트 추가 |
| `backend/api/aims_api/Dockerfile` | HEALTHCHECK 추가 |
| `backend/api/aims_api/deploy_aims_api.sh` | 이벤트 기록 기능 |
| `backend/api/aims_api/lib/serviceHealthMonitor.js` | deep check 사용 |

---

## 커밋 이력

1. `4176909a` - feat: 서비스 모니터링 시스템 근본적 개선
2. (예정) - fix: n8n SQLite 직접 쿼리를 REST API로 교체

---

## 검증 방법

```bash
# 1. Deep health check 테스트
curl http://localhost:3010/api/health/deep

# 2. n8n DB 잠금 오류 확인 (없어야 함)
docker logs aims-api --since 1h 2>&1 | grep -i "database is locked"

# 3. Admin 대시보드 워크플로우 표시 확인
# aims.giize.com/admin → 워크플로우 상태 정상 표시
```
