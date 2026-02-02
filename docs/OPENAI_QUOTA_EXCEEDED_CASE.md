# OpenAI API 크레딧 소진으로 인한 임베딩 실패 케이스

> **발생일**: 2026-02-02
> **영향 범위**: Qdrant 벡터 임베딩 전체 중단
> **근본 원인**: OpenAI API 크레딧 소진 (`OPENAI_QUOTA_EXCEEDED`)

---

## 1. 증상

- Qdrant `docembed` 컬렉션에 포인트가 **0개** (임베딩이 전혀 저장되지 않음)
- `full_pipeline.py` cron이 매분 실행되지만 **"0개의 문서를 처리할 준비"** 반복
- 문서 업로드/처리는 정상 동작 (document_pipeline은 임베딩과 무관)

---

## 2. 진단 과정

### 2-1. Qdrant 상태 확인

```bash
# 컨테이너 상태 — 정상 (Up 2 weeks)
docker ps | grep qdrant

# 컬렉션 존재 확인 — 정상
curl -s http://localhost:6333/collections
# → {"result":{"collections":[{"name":"docembed"}]},"status":"ok"}

# 포인트 수 확인 — 0개 (문제!)
curl -s http://localhost:6333/collections/docembed | python3 -m json.tool
# → "points_count": 0, "indexed_vectors_count": 0
```

### 2-2. aims_rag_api 로그

```
✅ [Startup] Qdrant 컬렉션 'docembed' 확인 완료 (포인트: 0개)
```
- 서비스 자체는 정상 기동, 단지 데이터가 없을 뿐

### 2-3. Cron 로그 (`/home/rossi/cron.log`)

```
[2026-02-02 21:05:05] 시작
총 0개의 문서를 처리할 준비가 완료되었습니다.
[2026-02-02 21:05:05] 끝
```
- 매분 실행되지만 처리할 문서 0개

### 2-4. MongoDB 통계 (근본 원인 발견)

```bash
docker exec aims-rag-api python3 -c "
from pymongo import MongoClient
client = MongoClient('mongodb://172.17.0.1:27017')
db = client['docupload']
col = db['files']
print('Total:', col.count_documents({}))
print('Has text:', col.count_documents({'\$or': [{'meta.full_text': {'\$exists': True}}]}))
print('Embed failed:', col.count_documents({'docembed.status': 'failed'}))
print('Embed done:', col.count_documents({'docembed.status': 'done'}))
"
```

**결과:**
| 항목 | 값 |
|------|-----|
| 총 문서 | 3 |
| full_text 있음 | 3 |
| **embed failed** | **3** |
| embed done | 0 |

### 2-5. 실패 상세 (MongoDB `docembed` 필드)

```json
{
  "status": "failed",
  "error_code": "OPENAI_QUOTA_EXCEEDED",
  "error_message": "OpenAI API 크레딧이 소진되었습니다. https://platform.openai.com/account/billing 에서 크레딧을 충전해주세요.",
  "failed_at": "2026-02-02T11:54:29.283208+00:00"
}
```

3개 문서 모두 동일 에러:
- `안영미_AR_2026-01-30.pdf` → 11:54 실패
- `안영미_CRS_무배당 변액연금보험...pdf` → 11:55 실패
- `안영미_CRS_무배당 변액유니버셜...pdf` → 11:56 실패

---

## 3. 근본 원인 분석

**두 가지 문제가 겹침:**

### 문제 1: OpenAI API 크레딧 소진
- 임베딩 모델 `text-embedding-3-small` 호출 시 `429 Quota Exceeded` 반환
- `create_embeddings.py`가 이를 `OPENAI_QUOTA_EXCEEDED`로 분류하여 `docembed.status = "failed"` 기록

### 문제 2: failed 문서 재시도 로직 부재
- `full_pipeline.py`의 처리 대상 쿼리:
  ```python
  {'$or': [
      {'docembed.status': {'$exists': False}},
      {'docembed.status': 'pending'}
  ]}
  ```
- `"failed"` 상태는 쿼리에 포함되지 않아 **영원히 재시도되지 않음**
- 크레딧 충전 후에도 수동으로 status를 리셋하지 않으면 처리 불가

---

## 4. 해결 절차

### Step 1: OpenAI 크레딧 충전

https://platform.openai.com/account/billing 에서 결제 확인/충전

### Step 2: 실패한 문서 status 리셋

```bash
ssh rossi@100.110.215.65 'docker exec aims-rag-api python3 -c "
from pymongo import MongoClient
client = MongoClient(\"mongodb://172.17.0.1:27017\")
db = client[\"docupload\"]
result = db.files.update_many(
    {\"docembed.status\": \"failed\"},
    {\"\$set\": {\"docembed.status\": \"pending\"}}
)
print(f\"Reset {result.modified_count} docs to pending\")
"'
```

### Step 3: 자동 재처리 확인

리셋 후 1분 내에 cron이 자동으로 `full_pipeline.py` 실행:
```bash
# cron 로그 모니터링
ssh rossi@100.110.215.65 'tail -f /home/rossi/cron.log'
```

정상이면:
```
총 3개의 문서를 처리할 준비가 완료되었습니다.
--- 문서 ID: xxx 처리 시작 ---
[TokenLog] 임베딩 토큰 로깅 완료: xxx tokens
```

### Step 4: Qdrant 포인트 확인

```bash
ssh rossi@100.110.215.65 'curl -s http://localhost:6333/collections/docembed | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Points: {d[\"result\"][\"points_count\"]}\")"'
```

---

## 5. 아키텍처 참고

### 임베딩 파이프라인 흐름

```
문서 업로드
    ↓
document_pipeline (PM2, port 8100)
    → 텍스트 추출, OCR, CRS/AR 감지
    → MongoDB files.meta.full_text 저장
    → 임베딩은 하지 않음!
    ↓
full_pipeline.py (cron, 매 1분)
    → MongoDB에서 full_text 있고 docembed.status 없거나 pending인 문서 탐색
    → OpenAI text-embedding-3-small로 벡터 생성
    → Qdrant docembed 컬렉션에 저장
    → MongoDB files.docembed.status = "done" 업데이트
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/embedding/full_pipeline.py` | 임베딩 오케스트레이션 (cron 매분 실행) |
| `backend/embedding/extract_text_from_mongo.py` | MongoDB에서 텍스트 추출 |
| `backend/embedding/split_text_into_chunks.py` | 텍스트 → 1500자 청크 분할 |
| `backend/embedding/create_embeddings.py` | OpenAI API로 벡터 생성 |
| `backend/embedding/save_to_qdrant.py` | Qdrant에 벡터 저장 |

### Cron 설정

```cron
*/1 * * * * flock -n /tmp/full_pipeline.lock -c '... cd /home/rossi/aims/backend/embedding && /home/rossi/aims/venv/bin/python full_pipeline.py >> /home/rossi/cron.log 2>&1 ...'
```

### MongoDB docembed 필드 상태값

| status | 의미 | 파이프라인 동작 |
|--------|------|----------------|
| (필드 없음) | 아직 처리 안 됨 | 처리 대상 |
| `pending` | 처리 대기 | 처리 대상 |
| `done` | 임베딩 완료 | 스킵 |
| `skipped` | 텍스트 없어서 스킵 | 스킵 |
| `failed` | 실패 | **스킵 (재시도 안 됨!)** |

---

## 6. 향후 개선 사항

### 6-1. failed 문서 자동 재시도

`full_pipeline.py`의 쿼리에 `"failed"` 상태도 포함하되, 재시도 횟수 제한 필요:

```python
# 현재 (재시도 안 됨)
{'$or': [
    {'docembed.status': {'$exists': False}},
    {'docembed.status': 'pending'}
]}

# 개선안 (failed도 재시도, 단 3회까지)
{'$or': [
    {'docembed.status': {'$exists': False}},
    {'docembed.status': 'pending'},
    {'$and': [
        {'docembed.status': 'failed'},
        {'docembed.retry_count': {'$lt': 3}}
    ]}
]}
```

### 6-2. 크레딧 소진 알림

- `OPENAI_QUOTA_EXCEEDED` 발생 시 즉시 알림 (Slack/Email)
- 반복 실패 감지 시 cron 자체를 일시 중지하여 불필요한 API 호출 방지

### 6-3. 크레딧 잔액 모니터링

- aims_health_monitor에 OpenAI 크레딧 잔액 체크 추가
- 잔액이 임계치 이하일 때 사전 경고

---

## 7. 빠른 참조 명령어

```bash
# Qdrant 포인트 수 확인
ssh rossi@100.110.215.65 'curl -s http://localhost:6333/collections/docembed | python3 -m json.tool | grep points_count'

# MongoDB 임베딩 실패 문서 확인
ssh rossi@100.110.215.65 'docker exec aims-rag-api python3 -c "
from pymongo import MongoClient
c = MongoClient(\"mongodb://172.17.0.1:27017\")
for d in c.docupload.files.find({\"docembed.status\": \"failed\"}, {\"upload.originalName\": 1, \"docembed\": 1}):
    print(d.get(\"upload\",{}).get(\"originalName\",\"?\"), \"→\", d.get(\"docembed\",{}).get(\"error_code\",\"?\"))
"'

# 실패 문서 일괄 리셋
ssh rossi@100.110.215.65 'docker exec aims-rag-api python3 -c "
from pymongo import MongoClient
c = MongoClient(\"mongodb://172.17.0.1:27017\")
r = c.docupload.files.update_many({\"docembed.status\": \"failed\"}, {\"\$set\": {\"docembed.status\": \"pending\"}})
print(f\"Reset {r.modified_count} docs\")
"'

# Cron 실시간 로그
ssh rossi@100.110.215.65 'tail -f /home/rossi/cron.log'

# full_pipeline 수동 실행
ssh rossi@100.110.215.65 'cd ~/aims/backend/embedding && /home/rossi/aims/venv/bin/python full_pipeline.py'
```
