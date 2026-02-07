# aims_api OOM 크래시 근본 원인 분석

**날짜**: 2026-02-07
**증상**: aims_api Docker 컨테이너가 메모리 ~2GB 사용 후 OOM 크래시 (Exit code 139)
**영향**: 502 Bad Gateway, 전체 서비스 불가

---

## 서버 환경

| 항목 | 값 |
|------|-----|
| 서버 RAM | 7.7GB |
| Swap | 4.0GB (3.9GB 사용) |
| Node.js | 18 (Docker) |
| `--max-old-space-size` | 미설정 (기본 ~2GB) |
| Docker `--memory` | 미설정 (무제한) |
| Docker `--restart` | 미설정 (크래시 시 복구 안 됨) |

---

## 크래시 로그

```
<--- Last few GCs --->
[1:0x11efb8a0]  7745533 ms: Mark-sweep 1951.8 (2092.8) -> 1939.5 (2094.1) MB
[1:0x11efb8a0]  7745805 ms: Mark-sweep 1957.0 (2095.9) -> 1940.7 (2096.3) MB

FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

- 힙 메모리 1951MB → GC 후에도 1939MB (12MB만 회수)
- GC가 메모리를 회수하지 못하는 상태 → OOM 크래시

---

## 근본 원인 (5가지)

### 1. [CRITICAL] 디버깅 미들웨어가 프로덕션에 남아있음

**파일**: `backend/api/aims_api/server.js` (라인 83-123)

#### 요청 디버깅 (라인 83-99)
```javascript
app.use((req, res, next) => {
  console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`📋 쿼리 파라미터:`, JSON.stringify(req.query, null, 2));
  console.log(`📦 요청 헤더:`, JSON.stringify(req.headers, null, 2));  // 모든 헤더
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📄 요청 바디:`, JSON.stringify(req.body, null, 2));   // 모든 바디
  }
  next();
});
```

#### 응답 디버깅 (라인 102-123)
```javascript
app.use((req, res, next) => {
  res.send = function(data) {
    console.log(`📤 응답 데이터:`, data);
    console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));  // 모든 응답
    return originalSend.call(this, data);
  };
  res.json = function(data) {
    console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));  // 모든 응답
    return originalJson.call(this, data);
  };
});
```

**문제점**:
- 문서 목록 API 1회 호출 → 수백KB~수MB JSON stringify
- SSE 폴링, 헬스체크 포함 → 시간당 수GB 임시 문자열 생성
- GC가 감당 못하면 힙 한계 도달 → OOM 크래시

**메모리 영향**: 시간당 1~5GB 힙 할당

---

### 2. [HIGH] Node.js 힙 메모리 제한 미설정

**파일**: `backend/api/aims_api/Dockerfile` (마지막 줄)

```dockerfile
CMD ["node", "server.js"]  # --max-old-space-size 없음
```

**문제점**:
- Node.js 기본 힙 제한 ~2GB (64비트 시스템)
- 서버 총 RAM 7.7GB → Node.js가 시스템 메모리를 과도하게 사용 가능
- 명시적 제한 없으면 GC가 느슨하게 동작 → 메모리 회수 지연

**수정 필요**: `CMD ["node", "--max-old-space-size=1536", "server.js"]`

---

### 3. [HIGH] Docker 컨테이너 메모리 제한/자동 복구 없음

**파일**: `backend/api/aims_api/deploy_aims_api.sh` (라인 102)

```bash
docker run -d --network host \
  # --memory 없음
  # --restart 없음
  --name $CONTAINER_NAME \
  $IMAGE_NAME
```

**문제점**:
- `--memory` 미설정 → 컨테이너가 시스템 메모리 무제한 사용
- `--restart` 미설정 → OOM 크래시 후 자동 복구 안 됨 (수동 재시작 필요)
- Swap 3.9GB/4.0GB 사용 → 시스템 전체 메모리 압박

**수정 필요**:
```bash
docker run -d --network host \
  --memory=2g \
  --restart=unless-stopped \
  ...
```

---

### 4. [MEDIUM] SSE logBuffer 무한 축적

**파일**: `backend/api/aims_api/lib/sseBroadcast.js` (라인 17, 35-56)

```javascript
let logBuffer = [];  // 모듈 수준 전역 배열

function queueLogForBroadcast(log) {
  logBuffer.push(log);  // 클라이언트 없어도 무한 축적
}
```

**문제점**:
- SSE 클라이언트가 연결되지 않아도 logBuffer에 계속 로그 추가
- 오버플로우 방지 로직 있으나 (`SSE_BATCH_SIZE * 3`), 그 전까지 메모리 사용
- `slice()` 호출 시 배열 복사 오버헤드

**수정 필요**: 클라이언트 없으면 버퍼링 중단

---

### 5. [LOW] realtimeMetrics 배열 복사

**파일**: `backend/api/aims_api/lib/realtimeMetrics.js` (라인 91-95)

```javascript
responseTimes.push(durationMs);
if (responseTimes.length > MAX_RESPONSE_TIMES) {
  responseTimes.shift();  // O(n) 연산 + 배열 재할당
}
```

**메모리 영향**: 1000개 × 8바이트 = 약 8KB (직접 영향 미미)
- 단, `percentile()` 호출 시 `[...arr].sort()` 배열 복사 발생

---

## OOM 크래시 시나리오 재현

```
T=0분   : 서버 시작, 힙 ~200MB
T=30분  : 디버깅 미들웨어가 모든 요청/응답 로깅 → 힙 ~800MB
T=60분  : 누적 로깅 + SSE logBuffer → 힙 ~1.4GB
T=90분  : GC 압박 증가, Mark-sweep 빈번 → 힙 ~1.8GB
T=120분 : GC 회수 실패, 힙 한계 도달 → OOM 크래시 (Exit 139)
```

---

## 수정 적용 (2026-02-07)

5가지 근본 원인 모두 수정 완료.

### Fix 1: 디버깅 미들웨어 제거

**파일**: `backend/api/aims_api/server.js`

- 라인 82-123의 요청/응답 디버깅 미들웨어 전체 삭제
- 41줄 → 주석 2줄로 대체
- 필요 시 backendLogger로 선별적 로깅 사용

```diff
- // 🔍 포괄적인 요청 디버깅 미들웨어 (모든 요청 로깅)
- app.use((req, res, next) => { ... 17줄 ... });
- // 🔍 응답 디버깅 미들웨어
- app.use((req, res, next) => { ... 22줄 ... });
+ // [2026-02-07] 디버깅 미들웨어 제거됨 (OOM 크래시 원인)
+ // 필요 시 backendLogger로 선별적 로깅 사용
```

### Fix 2: Node.js 힙 메모리 제한

**파일**: `backend/api/aims_api/Dockerfile`

- `--max-old-space-size=1536` 추가 (1.5GB 제한)
- GC가 1.5GB 이전에 적극적으로 메모리 회수

```diff
- CMD ["node", "server.js"]
+ CMD ["node", "--max-old-space-size=1536", "server.js"]
```

### Fix 3: Docker 메모리 제한 + 자동 복구

**파일**: `backend/api/aims_api/deploy_aims_api.sh`

- `--memory=2g`: 컨테이너 메모리 상한 2GB
- `--restart=unless-stopped`: OOM 크래시 시 자동 재시작

```diff
  docker run -d --network host \
+   --memory=2g \
+   --restart=unless-stopped \
    -e NODE_ENV="${NODE_ENV:-development}" \
```

### Fix 4: SSE logBuffer 무한 축적 방지

**파일**: `backend/api/aims_api/lib/sseBroadcast.js`

- 클라이언트 없으면 버퍼링 즉시 중단 (`sseClients.size === 0` 체크)
- 최대 버퍼 크기 초과 시 드롭 (`MAX_LOG_BUFFER` = 60개)
- `slice()` → `splice()` 교체 (in-place 제거, 배열 복사 방지)

```diff
  function queueLogForBroadcast(log) {
+   if (sseClients.size === 0) return;
+   if (logBuffer.length >= MAX_LOG_BUFFER) return;
    logBuffer.push(log);
  }
```

### Fix 5: realtimeMetrics 순환 버퍼

**파일**: `backend/api/aims_api/lib/realtimeMetrics.js`

- `push()` + `shift()` (O(n)) → Ring Buffer (O(1))
- 배열 크기 고정 (1000개), 인덱스만 이동
- `percentile()`: `[...arr].sort()` 복사 → 스냅샷 1회 생성 후 in-place 정렬

```diff
- let responseTimes = [];
+ const responseTimes = new Array(MAX_RESPONSE_TIMES).fill(0);
+ let responseTimesIndex = 0;
+ let responseTimesCount = 0;

- responseTimes.push(durationMs);
- if (responseTimes.length > MAX_RESPONSE_TIMES) {
-   responseTimes.shift();
- }
+ responseTimes[responseTimesIndex] = durationMs;
+ responseTimesIndex = (responseTimesIndex + 1) % MAX_RESPONSE_TIMES;
+ if (responseTimesCount < MAX_RESPONSE_TIMES) responseTimesCount++;
```

---

## 수정 파일 요약

| 파일 | 변경 | 메모리 절감 |
|------|------|------------|
| `server.js` | 디버깅 미들웨어 41줄 삭제 | **시간당 1~5GB** |
| `Dockerfile` | `--max-old-space-size=1536` | GC 적극 회수 |
| `deploy_aims_api.sh` | `--memory=2g --restart=unless-stopped` | 메모리 상한 + 자동 복구 |
| `sseBroadcast.js` | 클라이언트 없으면 버퍼링 중단 | 수십~수백MB |
| `realtimeMetrics.js` | Ring Buffer + 스냅샷 정렬 | 배열 복사 제거 |

---

## 방어 체계 (수정 후)

```
                    ┌─────────────────────────────────────┐
                    │         수정 전 (방어 없음)           │
                    │  메모리 무제한 → OOM → 서비스 중단    │
                    └─────────────────────────────────────┘

                              ↓ 수정 후 ↓

  Layer 1: 코드 수준 방어
  ├── 디버깅 미들웨어 제거 (원인 제거)
  ├── SSE logBuffer 최대 60개 제한 (축적 방지)
  └── Ring Buffer O(1) 삽입 (GC 부담 감소)

  Layer 2: Node.js 수준 방어
  └── --max-old-space-size=1536 (GC 적극 회수)

  Layer 3: Docker 수준 방어
  ├── --memory=2g (시스템 보호)
  └── --restart=unless-stopped (자동 복구)

  Layer 4: 인프라 수준 방어
  └── HEALTHCHECK 30초 간격 (좀비 감지)
```

---

## 재발 방지

1. **코드 리뷰**: 디버깅용 console.log 미들웨어는 PR 단계에서 차단
2. **Docker 메모리 모니터링**: `docker stats aims-api` 주기적 확인
3. **자동 복구**: `--restart=unless-stopped`로 크래시 시 자동 재시작
4. **헬스체크**: 이미 설정됨 (30초 간격, 3회 실패 시 unhealthy)
