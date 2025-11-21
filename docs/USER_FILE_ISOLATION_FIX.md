# 사용자별 파일 폴더 분리 구조 개선

**작성일**: 2025-11-22
**상태**: 🚧 진행 중 (수정 완료, 검증 대기)
**우선순위**: 🔴 Critical

---

## 📋 문제 정의

### 발견된 버그

**곽승철**(`692028777ba88fd684f44bf2`)로 로그인하여 파일을 업로드했는데, 파일이 **tester 폴더**에 저장되는 문제 발견:

```bash
# 실제 저장된 경로 (❌ 잘못됨)
/data/files/users/tester/2025/11/251121222034_p74drome.pdf

# 올바른 경로 (✅ 정답)
/data/files/users/692028777ba88fd684f44bf2/2025/11/251121222034_p74drome.pdf
```

### MongoDB 문서 확인

```javascript
{
  _id: ObjectId('6920e5b244f6eb919ecd499e'),
  ownerId: '692028777ba88fd684f44bf2',  // ✅ 올바른 소유자
  customerId: ObjectId('6920d254458b635a6a6230cd'),
  upload: {
    originalName: '정부균보유계약현황202508.pdf',
    destPath: '/data/files/users/tester/2025/11/251121222034_p74drome.pdf'  // ❌ 잘못된 경로!
  }
}
```

**문제**: `ownerId`는 정상인데 `destPath`가 `tester`로 저장됨

---

## 🎯 올바른 파일 구조 (목표)

### 사용자별 폴더 분리

```
/data/files/users/
├── tester/                             # tester 계정 파일
│   ├── 2025/
│   │   ├── 11/
│   │   │   ├── 251121220134_a1b2c3d4.pdf
│   │   │   └── 251121220245_e5f6g7h8.jpg
│   │   └── 12/
│   └── myfiles/
│
├── 692028777ba88fd684f44bf2/            # 곽승철 계정 파일
│   ├── 2025/
│   │   ├── 11/
│   │   │   ├── 251121222034_p74drome.pdf
│   │   │   └── 251121223145_x9y8z7w6.pdf
│   │   └── 12/
│   └── myfiles/
│
└── 69056f9358084cf37501bf85/            # 다른 사용자 파일
    ├── 2025/
    └── myfiles/
```

### 구조 규칙

```
/data/files/users/{userId}/{year}/{month}/{timestamp}_{random}.{ext}
                   ^^^^^^   ^^^^   ^^^^^
                   ObjectId  YYYY    MM
```

**예시:**
- tester: `/data/files/users/tester/2025/11/251121220134_a1b2c3d4.pdf`
- 곽승철: `/data/files/users/692028777ba88fd684f44bf2/2025/11/251121222034_p74drome.pdf`

---

## 🔍 원인 분석

### 전체 플로우

1. ✅ **프론트엔드** (정상):
   ```typescript
   // AuthCallbackPage.tsx:48
   localStorage.setItem('aims-current-user-id', user._id); // '692028777ba88fd684f44bf2'

   // userContextService.ts:114
   formData.append('userId', '692028777ba88fd684f44bf2'); // ✅ ObjectId 전달
   ```

2. ✅ **DocPrepMain Webhook** (정상):
   ```javascript
   // $json.body.userId = '692028777ba88fd684f44bf2' ✅ 받음
   ```

3. ❌ **DocPrepMain → DocUpload 호출** (문제):
   ```json
   // DocPrepMain.json:27-38 (수정 전)
   {
     "bodyParameters": {
       "parameters": [
         { "name": "file", ... },
         { "name": "source_path", ... }
         // ❌ userId 파라미터 없음!
       ]
     }
   }
   ```

4. ❌ **DocUpload** (기본값 사용):
   ```javascript
   // DocUpload.json:40
   const userId = $('File Exist?').first().json.body.userId || 'tester';
   // body에 userId 없음 → 'tester' 사용 ❌

   // DocUpload.json:34
   const folder = `/data/files/users/${userId}/${yyyy}/${mm}`;
   // → `/data/files/users/tester/2025/11` ❌ 잘못된 경로!
   ```

---

## 🔧 수정 내용 (2025-11-22)

### 1. DocPrepMain.json 수정

**파일**: `backend/n8n_flows/DocPrepMain.json`
**라인**: 38-41 (신규 추가)

```json
{
  "bodyParameters": {
    "parameters": [
      {
        "parameterType": "formBinaryData",
        "name": "file",
        "inputDataFieldName": "file"
      },
      {
        "name": "source_path",
        "value": "={{ $json.body.source_path || \"\"}}"
      },
      {
        "name": "userId",
        "value": "={{ $json.body.userId || 'tester' }}"
      }
    ]
  }
}
```

**변경 사항**: userId 파라미터 추가 (`line 38-41`)

### 2. n8n 재시작

```bash
ssh tars.giize.com 'cd ~/n8n-docker && docker-compose restart'
# ✅ Restarting n8n-docker-n8n-1 ... done
```

---

## ⚠️ 검증 필요 (다음 작업)

### 1. 테스트 파일 업로드

**곽승철** 계정으로 로그인 후 테스트 파일 업로드:
1. UIX3에서 로그인 (곽승철 계정)
2. 문서 등록 화면에서 PDF 파일 업로드
3. 업로드 성공 확인

### 2. 파일 경로 검증

**MongoDB에서 최신 문서 경로 확인:**
```bash
ssh tars.giize.com 'mongosh docupload --quiet --eval "db.files.find({\"meta.created_by\": \"692028777ba88fd684f44bf2\"}).sort({_id: -1}).limit(1).forEach(d => print(JSON.stringify({filename: d.filename, destPath: d.upload.destPath, ownerId: d.ownerId}, null, 2)))"'
```

**기대 결과:**
```json
{
  "filename": "테스트파일.pdf",
  "destPath": "/data/files/users/692028777ba88fd684f44bf2/2025/11/251122xxxxxx_xxxxxxxx.pdf",
  "ownerId": "692028777ba88fd684f44bf2"
}
```

**검증 포인트:**
- ✅ `destPath`가 `/data/files/users/692028777ba88fd684f44bf2/...`로 시작하는가?
- ✅ `ownerId`와 `destPath`의 userId가 일치하는가?

### 3. 실제 파일 존재 확인

```bash
# MongoDB에서 조회한 destPath로 파일 확인
ssh tars.giize.com 'ls -lh /data/files/users/692028777ba88fd684f44bf2/2025/11/'

# 파일 수 확인
ssh tars.giize.com 'find /data/files/users/692028777ba88fd684f44bf2 -type f | wc -l'
```

### 4. tester 계정도 정상 동작 확인

**tester** 계정으로도 테스트:
```bash
# tester 폴더에 파일이 생성되는지 확인
ssh tars.giize.com 'ls -lh /data/files/users/tester/2025/11/ | tail -5'
```

---

## 📊 사용자별 폴더 분리의 장점

| 항목 | 사용자별 분리 ✅ | 통합 폴더 ❌ |
|------|----------------|-------------|
| **데이터 격리** | 완벽한 격리 | 파일 섞임 |
| **성능** | 폴더당 파일 수 적음 | 수백만 파일 집중 |
| **백업/복원** | 사용자별 선택 가능 | 전체만 가능 |
| **삭제** | `rm -rf users/{userId}` 한 번 | 파일 하나씩 찾아서 삭제 |
| **할당량 관리** | `du -sh users/{userId}` | 불가능 |
| **보안** | OS 레벨 권한 설정 가능 | 어려움 |
| **디버깅** | 해당 사용자 폴더만 확인 | 전체 검색 필요 |
| **GDPR 대응** | 사용자 탈퇴 시 즉시 완전 삭제 | 누락 가능성 높음 |

### 특히 중요한 이유

1. **GDPR/개인정보보호법 대응**
   - 사용자 탈퇴 시: `rm -rf /data/files/users/{userId}` 한 번으로 완전 삭제 ✅
   - 통합 폴더: DB 조회 → 파일 하나씩 삭제 → 누락 가능성 ❌

2. **파일시스템 성능**
   - 리눅스 ext4: 한 디렉토리에 수백만 파일 있으면 `ls`, `find` 매우 느려짐
   - 사용자별 분리: 각 폴더에 수천~수만 개만 → 빠른 속도 ✅

3. **운영 편의성**
   - "곽승철 님 파일 전체 백업" → `tar -czf kwak.tar.gz users/692028777ba88fd684f44bf2` ✅
   - 통합 폴더는 불가능 ❌

---

## 🔄 추가 확인 사항

### 1. 기존 잘못된 파일 마이그레이션

현재 곽승철 파일이 tester 폴더에 있을 수 있음:

```bash
# MongoDB에서 곽승철 파일 중 tester 경로에 저장된 것 찾기
mongosh docupload --quiet --eval '
  db.files.find({
    "ownerId": "692028777ba88fd684f44bf2",
    "upload.destPath": /\/users\/tester\//
  }).forEach(d => print(d._id, d.upload.destPath))
'
```

**발견되면 마이그레이션 필요:**
```bash
# 예: /data/files/users/tester/2025/11/file.pdf
#  → /data/files/users/692028777ba88fd684f44bf2/2025/11/file.pdf

# 1. 폴더 생성
mkdir -p /data/files/users/692028777ba88fd684f44bf2/2025/11

# 2. 파일 이동
mv /data/files/users/tester/2025/11/251121222034_p74drome.pdf \
   /data/files/users/692028777ba88fd684f44bf2/2025/11/

# 3. MongoDB 경로 업데이트
mongosh docupload --eval '
  db.files.updateOne(
    { _id: ObjectId("6920e5b244f6eb919ecd499e") },
    { $set: { "upload.destPath": "/data/files/users/692028777ba88fd684f44bf2/2025/11/251121222034_p74drome.pdf" } }
  )
'
```

### 2. DocUpload.json 코드 검토

**파일**: `backend/n8n_flows/modules/DocUpload.json`
**라인**: 40

현재 코드가 올바른지 확인:
```javascript
const userId = $('File Exist?').first().json.body.userId || 'tester';
```

**검증 포인트:**
- userId를 제대로 받아오는가?
- 기본값 'tester'가 적절한가?

### 3. 다른 업로드 경로 확인

DocPrepMain 외에 다른 업로드 경로가 있는지 확인:
- Personal Files 업로드
- 문서 직접 업로드
- 연간보고서 업로드

모든 경로에서 userId를 제대로 전달하는지 확인 필요.

---

## 📚 관련 문서

- [SOCIAL_LOGIN_USER_SCHEMA.md](SOCIAL_LOGIN_USER_SCHEMA.md) - 사용자 식별자 설계
- [DATA_ISOLATION_STATUS.md](DATA_ISOLATION_STATUS.md) - 데이터 격리 현황
- [PERSONAL_FILES_ARCHITECTURE.md](PERSONAL_FILES_ARCHITECTURE.md) - 내 파일 아키텍처

---

## ✅ 완료 체크리스트

- [x] DocPrepMain.json에 userId 파라미터 추가
- [x] n8n 재시작
- [ ] **테스트 파일 업로드 (곽승철 계정)**
- [ ] **MongoDB에서 경로 검증**
- [ ] **실제 파일 존재 확인**
- [ ] **tester 계정 정상 동작 확인**
- [ ] 기존 잘못된 파일 마이그레이션 (필요 시)
- [ ] 다른 업로드 경로 검증

---

## 📌 다음 작업 시 우선순위

1. **P0 (즉시)**: 테스트 파일 업로드 후 경로 검증
2. **P1 (긴급)**: 기존 잘못 저장된 파일 마이그레이션
3. **P2 (중요)**: 다른 업로드 경로 점검
4. **P3 (검토)**: 사용자별 할당량 모니터링 시스템 구축

---

**작성자**: Claude Code
**최종 수정**: 2025-11-22
