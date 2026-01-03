# E11000 Duplicate Key Error 분석 및 해결

> 작성일: 2026-01-04
> 최종 수정: 2026-01-04
> 상태: 해결됨 (v2 - 고객별 중복 허용)

## 비즈니스 규칙 (중요!)

| 시나리오 | 허용 여부 |
|----------|-----------|
| 같은 고객에게 동일 파일 중복 등록 | ❌ 금지 |
| 다른 고객에게 동일 파일 등록 | ✅ 허용 |
| 다른 설계사가 동일 파일 등록 | ✅ 허용 |

**핵심**: 동일 파일(file_hash)은 **같은 고객**에게만 중복 불가

---

## 문제 현상

파일 업로드 시 MongoDB E11000 duplicate key error 발생:
```
E11000 duplicate key error collection: docupload.files
index: unique_owner_file_hash
dup key: { ownerId: "...", meta.file_hash: "2f1729..." }
```

### 증상
- 동일 파일 재업로드 시 E11000 에러
- 메타데이터(size_bytes, mime, extension) 누락
- 0B 파일 표시, TXT/OCR 문제
- **다른 고객에게 같은 파일 등록 불가** (잘못된 제약)

---

## 근본 원인

### 1. MongoDB Unique 인덱스 (v1 - 잘못된 설계)
```javascript
// ❌ 문제: ownerId + file_hash만으로 유니크 → 다른 고객에게 같은 파일 등록 불가
{
  key: { ownerId: 1, 'meta.file_hash': 1 },
  name: 'unique_owner_file_hash',
  unique: true,
  partialFilterExpression: { 'meta.file_hash': { '$type': 'string' } }
}
```

### 2. n8n 워크플로우 순서 문제
```
DocUpload → Save OwnerId → DocMeta → Update Meta
            ↓
            새 문서 INSERT (file_hash 없음)
                          ↓
                          file_hash 계산
                                    ↓
                                    file_hash UPDATE 시도 → E11000!
```

### 3. 프론트엔드 중복 체크 누락

| 업로드 경로 | 중복 체크 |
|-------------|-----------|
| DocumentRegistrationView | ✅ checkSystemDuplicate() 적용 |
| **ChatPanel (AI 어시스턴트)** | ❌ **없음** |
| BatchDocumentUploadView | ✅ 적용 |

**ChatPanel을 통한 업로드 시 중복 체크 없이 n8n으로 전송 → Update Meta에서 E11000 발생**

---

## 장애 시나리오

```
[기존 문서] _id: 69534c0f, file_hash: "2f1729..."
                    ↓
[사용자] 같은 파일 AI 어시스턴트로 업로드
                    ↓
[프론트엔드] 중복 체크 없음 → 업로드 진행
                    ↓
[n8n] Save OwnerId → 새 문서 INSERT (file_hash 없음)
                    ↓
[n8n] Update Meta → file_hash: "2f1729..." 설정 시도
                    ↓
[MongoDB] E11000! (이미 같은 ownerId + file_hash 존재)
                    ↓
[결과] 메타데이터 없는 불완전 문서 생성
```

---

## 해결 방법

### v2 해결책: 고객별 중복 허용 (2026-01-04)

#### 1. MongoDB 인덱스 변경

```javascript
// 기존 인덱스 삭제
db.files.dropIndex("unique_owner_file_hash");

// 새 인덱스 생성: ownerId + customerId + file_hash
db.files.createIndex(
  { ownerId: 1, customerId: 1, "meta.file_hash": 1 },
  {
    name: "unique_owner_customer_file_hash",
    unique: true,
    partialFilterExpression: { "meta.file_hash": { "$type": "string" } }
  }
);
```

#### 2. 백엔드 API 수정

**파일: `backend/api/aims_api/server.js`**

```javascript
// POST /api/documents/check-hash
const { fileHash, customerId } = req.body;

const query = {
  ownerId: userId,
  'meta.file_hash': fileHash
};

// customerId로 범위 제한 (같은 고객 내에서만 중복 체크)
if (customerId) {
  query.customerId = customerId;
} else {
  query.customerId = null;  // 미분류 문서
}

const existingDoc = await files.findOne(query);
```

#### 3. 프론트엔드 수정

**파일: `frontend/aims-uix3/src/shared/lib/fileValidation/duplicateChecker.ts`**

```typescript
// customerId 파라미터 추가
export async function checkSystemDuplicate(
  file: File,
  customerId?: string | null
): Promise<SystemDuplicateResult> {
  const fileHash = await calculateFileHash(file)

  const response = await api.post('/api/documents/check-hash', {
    fileHash,
    customerId: customerId || null  // 고객 ID 전달
  })
  // ...
}
```

**파일: `frontend/aims-uix3/src/services/DocumentService.ts`**

```typescript
static async uploadDocument(file: File, metadata?: Partial<CreateDocumentData>) {
  // 🔴 해당 고객에게 파일 해시 중복 검사 (E11000 에러 방지)
  const duplicateResult = await checkSystemDuplicate(file, metadata?.customerId);
  if (duplicateResult.isDuplicate && duplicateResult.existingDocument) {
    const existing = duplicateResult.existingDocument;
    const errorMessage = existing.customerName
      ? `이미 등록된 파일입니다. (고객: ${existing.customerName}, 파일: ${existing.fileName})`
      : `이미 등록된 파일입니다. (파일: ${existing.fileName})`;
    throw new Error(errorMessage);
  }
  // 이후 바이러스 검사 및 업로드 진행...
}
```

**파일: `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx`**

```typescript
// 고객 ID 전달
const systemDupResult = await checkSystemDuplicate(file, customerFileCustomer?._id)
```

### 수정 후 동작

```
[사용자] 고객A에게 파일 업로드 시도
         ↓
[프론트엔드] checkSystemDuplicate(file, 고객A_ID) 호출
         ↓
[백엔드] POST /api/documents/check-hash { fileHash, customerId: 고객A_ID }
         ↓
         ├─ 고객A에 같은 파일 있음 → isDuplicate: true → 업로드 차단
         └─ 고객A에 같은 파일 없음 → isDuplicate: false → 업로드 진행
         ↓
[결과] 같은 고객만 중복 차단, 다른 고객은 허용
```

---

## 검증

### v2 테스트 결과 (2026-01-04)

**테스트 시나리오**: 동일한 4개 AR파일을 서로 다른 고객(곽승철, 캐치업코리아)에게 등록

| 파일명 | hash | 곽승철 | 캐치업코리아 |
|--------|------|--------|--------------|
| 정부균보유계약현황202508.pdf | 7ff4e828 | ✅ | ✅ |
| 신상철보유계약현황2025081.pdf | 2f1729e1 | ✅ | ✅ |
| 김보성보유계약현황202508.pdf | 1dc13ca5 | ✅ | ✅ |
| 안영미annual report202508.pdf | 9e9d09c1 | ✅ | ✅ |

**검증 결과**:
- ✅ 동일 파일 → 다른 고객 등록 성공
- ✅ file_hash 정상 저장
- ✅ size_bytes 정상 저장
- ✅ E11000 에러 없음
- ✅ 메타데이터 누락 없음

### 기존 테스트 결과

| 테스트 | 결과 |
|--------|------|
| DB 삭제-재업로드 사이클 | ✅ 통과 |
| E11000 문제 재현 시뮬레이션 | ✅ 성공 |
| 중복 체크 해결 검증 | ✅ 성공 |
| 단위 테스트 4개 | ✅ 통과 |

### 테스트 파일
- `backend/api/aims_api/tests/test_delete_reupload_cycle.js`
- `backend/api/aims_api/tests/test_e11000_simulation.js`
- `frontend/aims-uix3/src/services/__tests__/DocumentService.duplicate-check.test.ts`

---

## 교훈

1. **모든 업로드 경로에 중복 체크 적용 필수**
   - 새 업로드 경로 추가 시 반드시 `checkSystemDuplicate()` 호출

2. **n8n 워크플로우 순서 주의**
   - INSERT 전에 중복 체크하는 것이 이상적
   - 현재는 프론트엔드에서 사전 차단으로 해결

3. **Unique 인덱스 에러 처리**
   - E11000 에러 발생 시 메타데이터 누락 → 불완전 문서 생성
   - 프론트엔드 사전 차단이 가장 좋은 UX 제공

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `DocumentService.ts` | 업로드 전 중복 체크 (customerId 전달) |
| `duplicateChecker.ts` | checkSystemDuplicate(file, customerId) 구현 |
| `DocumentRegistrationView.tsx` | 고객 ID 전달하여 중복 체크 |
| `server.js` | POST /api/documents/check-hash API (customerId 지원) |
| MongoDB `files` 컬렉션 | `unique_owner_customer_file_hash` 인덱스 |

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-04 | v1 | 최초 작성 - 시스템 전체 중복 체크 |
| 2026-01-04 | v2 | 고객별 중복 허용 - 인덱스 및 API 수정 |
