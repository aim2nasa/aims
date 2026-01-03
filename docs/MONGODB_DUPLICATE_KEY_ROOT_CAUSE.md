# MongoDB Duplicate Key 오류 - 근본 원인 분석 및 해결

**작성일**: 2026-01-03
**작성자**: Claude Code
**상태**: 해결됨

---

## 문제 요약

### 발생 현상
- n8n 로그에서 `E11000 duplicate key error` 반복 발생 (24시간 동안 19회)
- 오류 메시지: `Plan executor error during findAndModify :: caused by :: E11000 duplicate key error collection: docupload.files index: unique_owner_file_hash`

### 영향받는 사용자
- 곽승철 (aim2nasa@gmail.com) - ownerId: `694f9415a0f94f0a13f49894`
- 동일 파일을 여러 번 업로드 시도 시 오류 발생

---

## 근본 원인

### 워크플로우 순서 문제

**n8n `DocPrepMain` 워크플로우 흐름:**

```
1. DocUpload Request    → 파일을 서버에 저장
2. Save OwnerId         → MongoDB에 새 문서 INSERT (file_hash 없음)
3. DocMeta Request      → 파일 메타데이터 추출 (file_hash 계산)
4. Update Meta          → file_hash를 문서에 UPDATE
```

### 문제 시나리오

```
[시나리오: 동일 파일 재업로드]

1. 사용자가 파일 A 업로드 (최초)
   → 문서 1 생성: { ownerId: "xxx", meta.file_hash: "abc123" }

2. 사용자가 파일 A 다시 업로드 시도
   → Save OwnerId: 문서 2 생성 { ownerId: "xxx" } (file_hash 아직 없음)
   → DocMeta: file_hash 계산 = "abc123"
   → Update Meta: 문서 2에 file_hash: "abc123" 설정 시도

3. ❌ unique_owner_file_hash 인덱스 위반!
   → 문서 1에 이미 (ownerId: "xxx", file_hash: "abc123") 존재
   → E11000 duplicate key error
```

### 왜 이 순서가 문제인가?

| 단계 | 현재 동작 | 문제점 |
|------|----------|--------|
| Save OwnerId | 무조건 새 문서 INSERT | file_hash 없이 생성하므로 unique 체크 우회 |
| Update Meta | file_hash UPDATE | 이미 같은 조합이 있으면 unique 위반 |

### MongoDB 인덱스 정보

```javascript
{
  "key": { "ownerId": 1, "meta.file_hash": 1 },
  "name": "unique_owner_file_hash",
  "unique": true,
  "partialFilterExpression": {
    "meta.file_hash": { "$type": "string" }
  }
}
```

- `partialFilterExpression`: `meta.file_hash`가 string 타입일 때만 unique 적용
- Save OwnerId 시점: file_hash가 없으므로 unique 체크 안 됨
- Update Meta 시점: file_hash 추가 시 unique 체크됨 → 충돌!

---

## 해결 방안

### 방안 1: 워크플로우 순서 변경 (권장)

**현재:**
```
DocUpload → Save OwnerId → DocMeta → Update Meta
```

**변경 후:**
```
DocUpload → DocMeta (file_hash 계산) → 중복 체크 → Save OwnerId or Skip → Update Meta
```

**구현 방법:**
1. n8n UI에서 `DocPrepMain` 워크플로우 편집
2. `DocMeta Request` 노드를 `Save OwnerId` 앞으로 이동
3. 새 노드 추가: "Check Duplicate" (MongoDB findOne)
4. IF 노드 추가: 중복이면 기존 문서 사용, 아니면 새 문서 생성

### 방안 2: Save OwnerId를 UPSERT로 변경

**현재 Save OwnerId 노드:**
```json
{
  "operation": "insert",
  "collection": "files",
  "fields": "ownerId,customerId"
}
```

**변경 후:**
```json
{
  "operation": "findOneAndUpdate",
  "collection": "files",
  "updateKey": "ownerId,meta.file_hash",
  "fields": "ownerId,customerId",
  "options": { "upsert": true }
}
```

**문제점:** Save OwnerId 시점에는 file_hash가 없으므로 이 방법 적용 불가

### 방안 3: Update Meta에서 에러 핸들링

**n8n 노드 설정 수정:**
```json
{
  "name": "Update Meta in MongoDB",
  "onError": "continueRegularOutput",
  "alwaysOutputData": true
}
```

**추가 노드:**
- IF 노드: duplicate key 오류 감지
- MongoDB findOne: 기존 문서 조회
- MongoDB deleteOne: 새로 생성된 문서 삭제 (file_hash 없는)

### 방안 4: 프론트엔드 중복 체크 강화

**현재 흐름:**
1. 프론트엔드에서 file_hash 계산
2. `/api/files/check-duplicate` API 호출
3. 중복 아니면 업로드 진행

**강화 방안:**
- 중복 체크 API 호출을 필수로 만들기
- 중복 체크 없이 업로드 시도 시 서버에서 거부
- 레이스 컨디션 방지를 위한 락 메커니즘 추가

---

## 권장 해결 순서

### 1단계: 즉시 적용 (임시)
- Update Meta 노드에 `onError: continueRegularOutput` 설정
- 오류 발생 시에도 워크플로우 중단 방지

### 2단계: 단기 해결 (1주일 내)
- n8n 워크플로우 순서 변경
- DocMeta를 먼저 호출하여 file_hash 확보
- 중복 체크 후 조건부 문서 생성

### 3단계: 장기 해결 (프론트엔드)
- 업로드 전 중복 체크 강제화
- 서버에서 중복 체크 없는 업로드 거부
- 중복 파일 시 기존 문서 ID 반환

---

## n8n 워크플로우 수정 가이드

### Update Meta 노드 수정 (즉시 적용 가능)

n8n UI에서:
1. `DocPrepMain` 워크플로우 열기
2. `Update Meta in MongoDB` 노드 선택
3. Settings → "Continue On Fail" 활성화

### 중복 체크 노드 추가 (권장)

새 노드 추가:
```
노드 이름: Check Existing File
타입: MongoDB
Operation: findOne
Collection: files
Query: {
  "ownerId": "{{ $json.ownerId }}",
  "meta.file_hash": "{{ $json.body.file_hash }}"
}
```

IF 노드 추가:
```
조건: {{ $json._id }} 가 존재하면
  → 기존 문서 사용 (Skip Save OwnerId)
그렇지 않으면
  → Save OwnerId 실행
```

---

## 모니터링

### 오류 확인 명령어
```bash
# n8n 로그에서 duplicate key 오류 확인
docker logs n8n-docker-n8n-1 --since 24h 2>&1 | grep "E11000 duplicate key"

# 오류 건수 확인
docker logs n8n-docker-n8n-1 --since 24h 2>&1 | grep -c "E11000 duplicate key"
```

### 정상 상태
- duplicate key 오류: 0건/일
- 또는 오류 발생 시에도 워크플로우가 정상 완료

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| n8n `DocPrepMain` 워크플로우 | 문서 업로드 메인 처리 |
| `backend/n8n_flows/DocPrepMain.json` | 워크플로우 JSON 백업 |
| `frontend/*/fileValidation/duplicateChecker.ts` | 프론트엔드 중복 체크 |
| `backend/api/aims_api/server.js:820-860` | `/api/files/check-duplicate` API |

---

## 요약

> **근본 원인**: n8n 워크플로우가 file_hash 없이 먼저 문서를 생성하고,
> 나중에 file_hash를 업데이트하는 순서 때문에 unique 인덱스 충돌 발생

> **해결책**: 워크플로우 순서를 변경하여 file_hash 계산 후 중복 체크,
> 그 다음 조건부로 문서 생성

---

## 적용된 해결책 (2026-01-03)

### 1. Update Meta 노드 - Continue On Fail 설정
```javascript
// n8n SQLite에서 직접 수정
node.continueOnFail = true;
```
- 오류 발생 시에도 워크플로우 중단 방지

### 2. 중복 처리 노드 추가
n8n `DocPrepMain` 워크플로우에 3개 노드 추가:

| 노드 | 타입 | 역할 |
|------|------|------|
| Is Duplicate Error? | IF | duplicate key 오류 감지 |
| Find Existing Document | MongoDB findOne | 기존 문서 조회 |
| Delete Orphan Document | MongoDB delete | 불완전한 새 문서 삭제 |

### 수정된 워크플로우 흐름
```
Update Meta in MongoDB
    ↓
Is Duplicate Error?
    ├── true (중복) → Find Existing Document → Delete Orphan → Respond
    └── false (정상) → Respond
```

### 효과
- Duplicate key 오류 발생 시에도 워크플로우 정상 완료
- 불완전한 문서(file_hash 없는) 자동 삭제
- 기존 문서 ID로 응답하여 데이터 무결성 유지

---

## 검증 방법

```bash
# 1. n8n 로그에서 duplicate key 오류 확인 (오류 발생해도 워크플로우 완료)
docker logs n8n-docker-n8n-1 --since 1h 2>&1 | grep -A2 "E11000 duplicate key"

# 2. 불완전한 문서(file_hash 없는) 확인 (0건이어야 함)
mongosh docupload --eval "db.files.countDocuments({'meta.file_hash': {'\$exists': false}})"

# 3. 워크플로우 노드 확인
sqlite3 /home/rossi/n8n-docker/n8n_data/database.sqlite \
  "SELECT json_extract(nodes, '$[*].name') FROM workflow_entity WHERE name='DocPrepMain'" \
  | grep -o "Is Duplicate Error\|Find Existing Document\|Delete Orphan Document"
```

---

## 완료된 작업

- [x] n8n `Update Meta` 노드에 "Continue On Fail" 설정
- [x] 중복 처리 노드 3개 추가 (Is Duplicate Error?, Find Existing Document, Delete Orphan Document)
- [x] n8n 재시작 및 변경사항 적용
- [ ] 프론트엔드 중복 체크 강제화 (향후 개선)
