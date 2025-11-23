# OCR 장애 트러블슈팅 가이드

**작성일**: 2025-11-24
**최종 수정**: 2025-11-24

## 목차
1. [문제 증상](#문제-증상)
2. [원인 분석](#원인-분석)
3. [해결 방법](#해결-방법)
4. [검증 방법](#검증-방법)
5. [예방 조치](#예방-조치)
6. [관련 시스템 구조](#관련-시스템-구조)

---

## 문제 증상

### 사용자 관찰 증상
- 파일 업로드 후 OCR 처리 상태가 "대기 중"에서 멈춤
- 진행률이 60%에서 더 이상 진행되지 않음
- 15분 이상 대기해도 상태 변화 없음

### MongoDB 데이터 확인
```json
{
  "_id": "69233159577550ec7a968e88",
  "stages": {
    "upload": { "status": "completed" },
    "meta": { "status": "completed" },
    "ocr_prep": { "status": "completed" },
    "ocr": {
      "status": "pending",        // ← 멈춤
      "message": "대기 중",
      "timestamp": null            // ← 시작 안됨
    }
  },
  "currentStage": 3,
  "overallStatus": "processing",
  "progress": 60
}
```

### 시스템 로그
```bash
# Redis Consumer Group 에러
NOGROUP No such key 'ocr_stream' or consumer group 'ocr_consumer_group'

# n8n OCRWorker 에러
NodeOperationError: This operation expects the node's input data to contain
a binary file 'data', but none was found [item 0]
```

---

## 원인 분석

### 근본 원인

**Redis Consumer Group이 존재하지 않아 OCRWorker가 작업을 받을 수 없었습니다.**

### 시스템 흐름

```
┌─────────────┐
│ 프론트엔드   │
│ 파일 업로드  │
└──────┬──────┘
       │
       ↓
┌─────────────────┐
│ DocPrepMain     │  ✅ 정상
│ (n8n webhook)   │
├─────────────────┤
│ 1. 파일 저장     │  ✅ /data/files/users/dev-user/...
│ 2. MongoDB 저장  │  ✅ _id, meta 생성
│ 3. Redis Publish │  ✅ ocr_stream에 메시지 추가
└──────┬──────────┘
       │
       ↓ XADD (Redis Streams)
┌─────────────────┐
│ Redis Streams   │
│ ocr_stream      │
└──────┬──────────┘
       │
       ↓ XREADGROUP (Consumer Group 필요!)
┌─────────────────┐
│ OCRWorker       │  ❌ 실패
│ (n8n workflow)  │
├─────────────────┤
│ Consumer Group  │  ❌ 없음!
│ 'ocr_consumer_  │
│  group'         │
└─────────────────┘
```

### 상세 원인

1. **Redis Consumer Group 미생성**
   - `ocr_consumer_group`이 초기화되지 않음
   - OCRWorker가 XREADGROUP 명령 실행 시 NOGROUP 에러 발생

2. **OCRWorker 메시지 수신 실패**
   - Consumer Group 없으면 메시지를 읽을 수 없음
   - 작업이 Redis Streams에 쌓이기만 하고 처리되지 않음

3. **연쇄 영향**
   - OCR 시작 불가 → 타임스탬프 null
   - 문서 상태 "pending"에서 멈춤
   - 사용자에게 "대기 중" 무한 표시

---

## 해결 방법

### 1단계: Redis Consumer Group 생성

```bash
# tars 서버 SSH 접속
ssh tars.giize.com

# Consumer Group 생성
redis-cli XGROUP CREATE ocr_stream ocr_consumer_group 0 MKSTREAM
```

**명령 설명:**
- `ocr_stream`: Redis Stream 이름
- `ocr_consumer_group`: Consumer Group 이름
- `0`: 처음부터 메시지 읽기 (ID 0부터)
- `MKSTREAM`: Stream이 없으면 자동 생성

**성공 응답:**
```
OK
```

### 2단계: n8n 재시작

```bash
# n8n 컨테이너 재시작 (Consumer Group 설정 적용)
docker restart n8n-docker-n8n-1

# 재시작 확인 (30초 대기)
docker ps | grep n8n
```

### 3단계: 기존 대기 중인 작업 처리

Consumer Group이 생성되고 n8n이 재시작되면, Redis Streams에 쌓여있던 모든 메시지가 자동으로 처리됩니다.

---

## 검증 방법

### 1. Consumer Group 상태 확인

```bash
redis-cli XINFO GROUPS ocr_stream
```

**정상 응답 예시:**
```
name
ocr_consumer_group
consumers
1                    # ← OCRWorker가 연결됨
pending
0                    # ← 대기 중인 메시지 없음
last-delivered-id
1763914757458-0
entries-read
20
lag
0
```

### 2. 새 파일 업로드 테스트

```bash
# 테스트 파일 업로드
curl -s "https://n8nd.giize.com/webhook/docprep-main" \
  -X POST \
  -F "file=@/path/to/test.jpg" \
  -F "userId=dev-user"

# 응답: {"ocr":{"status":"queued","queued_at":"..."}}
```

**즉시 처리 확인:**
```bash
# 3초 후 MongoDB 확인
sleep 3
mongosh mongodb://localhost:27017/docupload --eval \
  "db.files.find().sort({_id:-1}).limit(1).forEach(doc =>
    print('status:', doc.ocr?.status, 'started:', doc.ocr?.started_at)
  )"
```

**정상 결과:**
```
status: running
started: 2025-11-24T01:24:11.180+09:00   # ← 0.5초 이내 시작
```

### 3. Redis Streams 메시지 확인

```bash
# 최근 5개 메시지 확인
redis-cli XRANGE ocr_stream - + COUNT 5
```

**정상 메시지 구조:**
```
1763914074725-0
file_id
69233159577550ec7a968e88      # ← _id 있음
file_path
/data/files/users/dev-user/2025/11/251123160753_yrf6cw5z.jpg
doc_id
69233159577550ec7a968e88      # ← doc_id 있음
queued_at
2025-11-24T01:07:54.711+09:00
```

### 4. n8n 워크플로우 상태 확인

n8n UI (https://n8nd.giize.com) 접속:
1. **OCRWorker** 워크플로우 클릭
2. **Executions** 탭 확인
3. 최근 실행 이력이 "Success" 상태인지 확인

---

## 예방 조치

### 1. 시스템 초기화 스크립트 작성

**파일**: `backend/scripts/init-redis-consumer-groups.sh`

```bash
#!/bin/bash
# Redis Consumer Groups 자동 생성 스크립트

echo "🔧 Redis Consumer Groups 초기화 시작..."

# OCR Consumer Group
redis-cli XGROUP CREATE ocr_stream ocr_consumer_group 0 MKSTREAM 2>&1 | grep -v "BUSYGROUP"

# 향후 추가될 Consumer Groups
# redis-cli XGROUP CREATE docembed_stream docembed_consumer_group 0 MKSTREAM 2>&1 | grep -v "BUSYGROUP"
# redis-cli XGROUP CREATE tagging_stream tagging_consumer_group 0 MKSTREAM 2>&1 | grep -v "BUSYGROUP"

echo "✅ Consumer Groups 초기화 완료"

# 상태 확인
echo ""
echo "📊 현재 Consumer Groups:"
redis-cli XINFO GROUPS ocr_stream 2>/dev/null || echo "ocr_stream: (생성됨)"
```

**실행 권한 부여:**
```bash
chmod +x backend/scripts/init-redis-consumer-groups.sh
```

### 2. 시스템 재시작 시 자동 실행

**systemd 서비스 또는 Docker Compose 추가:**

```yaml
# docker-compose.yml에 init 서비스 추가
services:
  redis-init:
    image: redis:alpine
    depends_on:
      - redis
    command: >
      sh -c "
        sleep 5 &&
        redis-cli -h redis XGROUP CREATE ocr_stream ocr_consumer_group 0 MKSTREAM ||
        echo 'Consumer group already exists'
      "
    restart: "no"
```

### 3. 모니터링 알림 설정

**체크 항목:**
- Redis Consumer Group의 `lag` 값 (0이어야 함)
- Redis Consumer Group의 `pending` 값 (0에 가까워야 함)
- n8n OCRWorker 실행 실패율

**알림 조건:**
```bash
# Prometheus/Grafana 알림 예시
redis_stream_consumer_lag{stream="ocr_stream"} > 10
```

### 4. 주기적 헬스체크

**cron job 등록:**
```bash
# 매시간 Consumer Group 상태 확인
0 * * * * /path/to/check-consumer-groups.sh
```

**check-consumer-groups.sh 예시:**
```bash
#!/bin/bash
LAG=$(redis-cli XINFO GROUPS ocr_stream | grep -A1 "^lag$" | tail -1)

if [ "$LAG" -gt 10 ]; then
  echo "⚠️  OCR Consumer Group lag: $LAG (임계값 초과)" | mail -s "AIMS OCR 경고" admin@example.com
fi
```

---

## 관련 시스템 구조

### 파일 경로

| 컴포넌트 | 경로 | 설명 |
|---------|------|------|
| 업로드된 파일 | `/data/files/users/{userId}/{YYYY}/{MM}/{filename}` | 실제 파일 저장 위치 |
| n8n 워크플로우 | `n8n UI → DocPrepMain` | 파일 수신 및 처리 |
| n8n 워크플로우 | `n8n UI → OCRWorker` | OCR 처리 |
| MongoDB | `docupload.files` | 문서 메타데이터 |
| Redis Streams | `ocr_stream` | OCR 작업 큐 |

### API 엔드포인트

| 엔드포인트 | 용도 | 메서드 |
|-----------|------|--------|
| `https://n8nd.giize.com/webhook/docprep-main` | 파일 업로드 | POST |
| `http://tars.giize.com:3010/api/documents/:id/status` | 문서 상태 조회 | GET |

### Docker 컨테이너

```bash
# n8n 컨테이너 확인
docker ps | grep n8n

# 로그 확인
docker logs -f n8n-docker-n8n-1

# 재시작
docker restart n8n-docker-n8n-1
```

---

## 참고 자료

- [Redis Streams 공식 문서](https://redis.io/docs/data-types/streams/)
- [Redis Consumer Groups](https://redis.io/docs/manual/data-types/streams-tutorial/)
- [n8n Workflows](https://docs.n8n.io/workflows/)

---

## 변경 이력

| 날짜 | 작성자 | 변경 내용 |
|------|--------|----------|
| 2025-11-24 | Claude | 초안 작성 (Redis Consumer Group 장애 해결) |
