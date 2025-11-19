# 내 파일 시스템 아키텍처 및 동작 메커니즘

> **작성일**: 2025-11-20
> **버전**: 1.0.0
> **목적**: 내 파일 시스템의 이중 컬렉션 구조와 CRUD 작업 메커니즘 문서화

## 📋 목차

1. [개요](#개요)
2. [아키텍처 구조](#아키텍처-구조)
3. [컬렉션 상세 설명](#컬렉션-상세-설명)
4. [파일 타입 분류](#파일-타입-분류)
5. [CRUD 작업 메커니즘](#crud-작업-메커니즘)
6. [주의사항 및 함정](#주의사항-및-함정)
7. [트러블슈팅](#트러블슈팅)

---

## 개요

### 핵심 개념

**내 파일 시스템은 두 개의 독립적인 MongoDB 컬렉션을 논리적으로 연결하여 작동합니다.**

```
┌─────────────────────────────────────────────────────────┐
│                   내 파일 시스템                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐        ┌────────────────────┐    │
│  │  personal_files  │        │      files         │    │
│  │   컬렉션         │◄───────│    컬렉션          │    │
│  │                  │ folderId│                    │    │
│  │  폴더 계층 구조   │        │  실제 문서 파일     │    │
│  └──────────────────┘        └────────────────────┘    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 왜 이렇게 설계되었는가?

1. **기존 시스템과의 호환성**: `files` 컬렉션은 문서 라이브러리에서 사용 중
2. **관심사 분리**: 계층 구조 관리와 실제 파일 관리를 독립적으로 처리
3. **유연성**: 같은 문서를 여러 폴더에서 참조 가능 (folderId만 변경)

---

## 아키텍처 구조

### 전체 시스템 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│                        사용자 인터페이스                           │
│                    (내 파일 페이지 - UIX3)                         │
└────────────┬──────────────────────────────────┬──────────────────┘
             │                                  │
             ▼                                  ▼
┌────────────────────────┐        ┌────────────────────────────┐
│  Personal Files API    │        │   Documents API            │
│  /api/personal-files   │        │   /api/documents           │
└────────────┬───────────┘        └─────────────┬──────────────┘
             │                                  │
             ▼                                  ▼
┌────────────────────────┐        ┌────────────────────────────┐
│  personal_files        │        │  files                     │
│  컬렉션                │        │  컬렉션                    │
│                        │        │                            │
│  - 폴더                │◄───────│  folderId 필드로 연결       │
│  - 직접 업로드 파일     │        │                            │
└────────────────────────┘        └────────────────────────────┘
```

---

## 컬렉션 상세 설명

### 1. `personal_files` 컬렉션 (폴더 계층 구조)

**역할**: Google Drive처럼 폴더 트리 구조를 관리

**스키마**:
```javascript
{
  _id: ObjectId,
  userId: String,              // 사용자 ID
  name: String,                // 폴더/파일 이름
  type: 'folder' | 'file',     // 타입
  parentId: ObjectId | null,   // 부모 폴더 ID (null = 루트)
  mimeType: String,            // (파일만) MIME 타입
  size: Number,                // (파일만) 파일 크기
  storagePath: String,         // (파일만) 실제 파일 경로
  createdAt: Date,
  updatedAt: Date,
  isDeleted: Boolean,          // 소프트 삭제 플래그
  deletedAt: Date              // 삭제 시간
}
```

**특징**:
- ✅ 폴더 계층 구조 담당
- ✅ 직접 업로드한 파일 저장 (내 파일 페이지에서 업로드)
- ❌ 문서 라이브러리 파일은 여기에 **물리적으로 저장되지 않음**

### 2. `files` 컬렉션 (실제 문서 파일)

**역할**: 문서 라이브러리의 모든 문서 저장

**스키마**:
```javascript
{
  _id: ObjectId,
  ownerId: String,
  customerId: String,          // 문서 소유자
  folderId: ObjectId | null,   // 📌 personal_files 폴더와 논리적 연결
  upload: {
    originalName: String,
    destPath: String,
    uploaded_at: Date
  },
  meta: {
    filename: String,
    mime: String,
    size_bytes: Number,
    // ... OCR, 태그, 요약 등
  },
  overallStatus: String,
  // ... 기타 문서 처리 상태
}
```

**특징**:
- ✅ 문서 라이브러리의 모든 문서
- ✅ `folderId` 필드로 폴더에 **논리적으로만** 연결
- ✅ `personal_files`에 물리적 항목 없음
- ✅ `customerId === userId`인 문서만 내 파일로 표시

---

## 파일 타입 분류

### 내 파일에 표시되는 3가지 파일 타입

| 타입 | 저장 컬렉션 | `isLibraryDocument` | 특징 |
|------|------------|---------------------|------|
| 📁 **폴더** | `personal_files` | `false` | 계층 구조 |
| 📄 **직접 업로드 파일** | `personal_files` | `false` | 내 파일에서 업로드 |
| 📋 **문서 라이브러리 파일** | `files` | `true` | 문서 라이브러리에서 가져옴 |

### 판별 방법

**프론트엔드 (PersonalFilesView.tsx)**:
```typescript
// 문서 → PersonalFileItem 변환 시
const convertDocumentToFileItem = (doc: Document): PersonalFileItem => {
  return {
    _id: doc._id,
    name: doc.filename || '알 수 없는 파일',
    type: 'file',
    // ...
    isLibraryDocument: true,  // ✅ 핵심: 문서 라이브러리 파일임을 표시
    document: doc            // 원본 Document 정보 보존
  }
}
```

---

## CRUD 작업 메커니즘

### 1. 📂 폴더 생성

**API**: `POST /api/personal-files/folders`

**처리 과정**:
```
1. 사용자가 "새 폴더" 클릭
2. personal_files 컬렉션에 새 항목 추가
   {
     userId: "tester",
     name: "새 폴더",
     type: "folder",
     parentId: <현재 폴더 ID> or null
   }
3. UI 즉시 업데이트
```

**영향받는 컬렉션**:
- ✅ `personal_files`: 새 폴더 항목 추가
- ❌ `files`: 영향 없음

---

### 2. 📤 파일 업로드

#### 2-1. 내 파일 페이지에서 직접 업로드

**API**: `POST /api/personal-files/upload`

**처리 과정**:
```
1. 사용자가 파일 선택 및 업로드
2. 파일을 서버 디스크에 저장
3. personal_files 컬렉션에 항목 추가
   {
     userId: "tester",
     name: "example.pdf",
     type: "file",
     parentId: <현재 폴더 ID>,
     storagePath: "/data/files/users/tester/myfiles/example.pdf",
     mimeType: "application/pdf",
     size: 1024000
   }
```

**영향받는 컬렉션**:
- ✅ `personal_files`: 새 파일 항목 추가
- ❌ `files`: 영향 없음

#### 2-2. 문서 라이브러리에서 문서 등록

**API**: `POST /api/documents` (문서 라이브러리)

**처리 과정**:
```
1. 문서 등록 페이지에서 문서 업로드
2. files 컬렉션에 문서 추가
   {
     _id: ObjectId("..."),
     customerId: "tester",
     folderId: null,  // 초기에는 폴더 연결 없음
     upload: { ... },
     meta: { ... }
   }
3. OCR, 태그, 요약 등 처리 진행
```

**영향받는 컬렉션**:
- ❌ `personal_files`: 영향 없음 (물리적 항목 없음)
- ✅ `files`: 새 문서 추가

**내 파일에서 보이는 조건**:
- `customerId === userId` (본인 문서)
- `folderId`가 현재 폴더 ID와 일치

---

### 3. 🔀 파일/폴더 이동

#### 3-1. 폴더 또는 직접 업로드 파일 이동

**API**: `PUT /api/personal-files/:itemId/move`

**처리 과정**:
```
1. 사용자가 항목을 드래그하여 다른 폴더로 이동
2. personal_files 컬렉션에서 parentId 업데이트
   {
     _id: ObjectId("..."),
     parentId: <새 폴더 ID>  // 변경됨
   }
```

**영향받는 컬렉션**:
- ✅ `personal_files`: `parentId` 업데이트
- ❌ `files`: 영향 없음

#### 3-2. 문서 라이브러리 파일 이동

**API**: `PUT /api/personal-files/documents/:documentId/move`

**처리 과정**:
```
1. 사용자가 문서 라이브러리 파일을 폴더로 이동
2. files 컬렉션에서 folderId 업데이트
   {
     _id: ObjectId("..."),
     customerId: "tester",
     folderId: <새 폴더 ID>  // 변경됨
   }
3. personal_files에는 아무 영향 없음 (물리적 항목 없음)
```

**영향받는 컬렉션**:
- ❌ `personal_files`: 영향 없음
- ✅ `files`: `folderId` 업데이트

---

### 4. 🗑️ 파일/폴더 삭제 ⚠️ **핵심 주의사항**

#### 4-1. 폴더 삭제

**API**: `DELETE /api/personal-files/:itemId`

**처리 과정**:
```
1. 사용자가 폴더 삭제 확인
2. personal_files 컬렉션에서 소프트 삭제
   {
     isDeleted: true,
     deletedAt: new Date()
   }
3. 🔥 중요: 하위 폴더와 파일도 재귀적으로 소프트 삭제
4. 🔥 중요: 해당 폴더(및 하위 폴더)에 연결된 files 컬렉션 문서들도 모두 삭제
   - files.folderId가 삭제된 폴더 ID인 모든 문서 찾기
   - 각 문서에 대해 DELETE /api/documents/:id 호출
```

**백엔드 코드 (personal-files-routes.js:466-493)**:
```javascript
if (item.type === 'folder') {
  // 문서 라이브러리에서 연결된 문서 삭제
  const documentIds = await collectDocumentIdsFromFolder(db, userId, folderId);

  for (const docId of documentIds) {
    await axios.delete(`http://localhost:3010/api/documents/${docId}`);
  }

  // 하위 폴더들도 재귀적으로 소프트 삭제
  await deleteChildrenRecursively(collection, userId, folderId);
}
```

**영향받는 컬렉션**:
- ✅ `personal_files`: 소프트 삭제 (`isDeleted: true`)
- ✅ `files`: 연결된 문서들 **완전 삭제** (hard delete)

#### 4-2. 직접 업로드 파일 삭제

**API**: `DELETE /api/personal-files/:itemId`

**처리 과정**:
```
1. 사용자가 파일 삭제 확인
2. personal_files 컬렉션에서 소프트 삭제
3. 실제 파일 시스템에서 파일 삭제 (선택적)
```

**영향받는 컬렉션**:
- ✅ `personal_files`: 소프트 삭제
- ❌ `files`: 영향 없음

#### 4-3. 문서 라이브러리 파일 삭제 ⚠️ **가장 주의해야 할 부분**

**API**: `DELETE /api/documents/:id` (**NOT** `/api/personal-files/:id`)

**처리 과정**:
```
1. 사용자가 문서 라이브러리 파일 삭제 확인
2. ⚠️ 핵심: isLibraryDocument 플래그 확인
3. files 컬렉션에서 문서 완전 삭제 (hard delete)
4. 파일 시스템에서 실제 파일 삭제
5. Qdrant에서 임베딩 삭제
6. 고객 참조 정리 (customers.documents 배열에서 제거)
```

**프론트엔드 코드 (PersonalFilesView.tsx:809-820)**:
```typescript
const handleDeleteClick = useCallback(async () => {
  const itemToDelete = selectedItem;

  // ⚠️ 핵심: 파일 타입에 따라 다른 API 호출
  if (itemToDelete.isLibraryDocument) {
    // 문서 라이브러리 파일 → /api/documents/:id
    await api.delete(`/api/documents/${itemToDelete._id}`);
  } else {
    // 폴더 시스템 항목 → /api/personal-files/:id
    await personalFilesService.deleteItem(itemToDelete._id);
  }
}, [...]);
```

**영향받는 컬렉션**:
- ❌ `personal_files`: 영향 없음 (물리적 항목 없음)
- ✅ `files`: **완전 삭제** (hard delete)

**데이터 무결성**:
```
삭제 전:
  personal_files: 없음 (애초에 항목 없음)
  files:          존재

삭제 후:
  personal_files: 없음 (그대로 유지)
  files:          없음 (삭제됨)

✅ 무결성 유지됨!
```

---

## 주의사항 및 함정

### ⚠️ 함정 1: 삭제 API 혼동

**잘못된 코드**:
```typescript
// ❌ 모든 파일을 personal_files API로 삭제 시도
await personalFilesService.deleteItem(selectedItem._id);
```

**문제점**:
- 문서 라이브러리 파일은 `personal_files` 컬렉션에 없음
- 404 Not Found 에러 발생
- 파일이 삭제되지 않음

**올바른 코드**:
```typescript
// ✅ 파일 타입에 따라 다른 API 호출
if (itemToDelete.isLibraryDocument) {
  await api.delete(`/api/documents/${itemToDelete._id}`);
} else {
  await personalFilesService.deleteItem(itemToDelete._id);
}
```

### ⚠️ 함정 2: 폴더 이동 시 문서 처리

**문제 상황**:
폴더를 이동할 때 폴더 안의 문서 라이브러리 파일들은 어떻게 되는가?

**답변**:
```
1. 폴더 이동 시 personal_files.parentId만 변경
2. files 컬렉션의 folderId는 변경되지 않음
3. ✅ 문서들은 여전히 해당 폴더에 논리적으로 연결됨
4. UI에서는 폴더 계층을 따라가므로 정상 표시됨
```

### ⚠️ 함정 3: 계층 구조 조회

**잘못된 가정**:
"내 파일의 모든 항목은 `personal_files`에 있을 것이다"

**실제 구조**:
```typescript
// 폴더 내용 조회 시
const loadFolderContents = async (folderId: string | null) => {
  // 1. personal_files에서 폴더와 직접 업로드 파일 조회
  const folderItems = await personalFilesService.getFolderContents(folderId);

  // 2. files에서 customerId === userId이고 folderId 일치하는 문서 조회
  const myDocs = await DocumentStatusService.getRecentDocuments();
  const filteredDocs = myDocs.filter(doc =>
    doc.customerId === userId &&
    doc.folderId === folderId
  );

  // 3. 두 결과를 합쳐서 UI에 표시
  return [...folderItems, ...filteredDocs];
};
```

### ⚠️ 함정 4: 데이터 무결성 오해

**잘못된 가정**:
"문서 라이브러리 파일을 삭제하면 `personal_files`도 정리해야 한다"

**실제 구조**:
```
문서 라이브러리 파일은 애초에 personal_files에 물리적 항목이 없음!
→ 정리할 필요 없음
→ files 컬렉션에서만 삭제하면 끝
```

---

## 트러블슈팅

### 문제 1: 파일 삭제가 안 됨

**증상**: 우클릭 → 삭제 → 확인했는데 파일이 그대로 있음

**원인 진단**:
```bash
# 1. 브라우저 콘솔에서 로그 확인
🗑️ 삭제 시작: <파일명> <ID> isLibraryDocument: true
✅ 삭제 확인됨, API 호출 시작...
❌ DELETE http://.../api/personal-files/... 404 (Not Found)
```

**해결책**:
```typescript
// isLibraryDocument 플래그 확인
if (itemToDelete.isLibraryDocument) {
  // ✅ 올바른 API
  await api.delete(`/api/documents/${itemToDelete._id}`);
}
```

### 문제 2: 폴더 삭제 후 문서가 남아있음

**증상**: 폴더를 삭제했는데 문서 라이브러리에 파일이 남아있음

**원인**:
백엔드의 `collectDocumentIdsFromFolder` 함수가 제대로 작동하지 않음

**확인 방법**:
```bash
# 백엔드 로그 확인
🗑️ 폴더 삭제: X개의 연결된 문서 삭제 시작
✅ 문서 삭제 완료: <docId>
```

**해결책**:
백엔드 코드 검증 (personal-files-routes.js:560-591)

### 문제 3: 폴더 이동 후 파일이 안 보임

**증상**: 폴더를 이동했는데 안에 있던 파일들이 사라짐

**원인**:
문서 라이브러리 파일의 `folderId`가 자동으로 업데이트되지 않음

**해결책**:
```
현재는 의도된 동작입니다.
폴더를 이동해도 문서는 원래 폴더 ID를 유지합니다.
```

**향후 개선 방향**:
폴더 이동 시 하위 문서들의 `folderId`도 함께 업데이트

---

## 개발 체크리스트

### 새로운 기능 개발 시 반드시 확인

- [ ] 이 작업이 `personal_files`와 `files` 중 어느 컬렉션에 영향을 주는가?
- [ ] 두 컬렉션 모두 영향을 받는 경우 순서가 올바른가?
- [ ] 문서 라이브러리 파일의 경우 올바른 API를 호출하는가?
- [ ] 데이터 무결성이 유지되는가?
- [ ] 에러 처리가 제대로 되어 있는가?

### 삭제 기능 구현 시 체크리스트

- [ ] `isLibraryDocument` 플래그로 파일 타입 확인
- [ ] 문서 라이브러리 파일: `/api/documents/:id` DELETE
- [ ] 폴더/직접 업로드 파일: `/api/personal-files/:id` DELETE
- [ ] 폴더 삭제 시 하위 문서들도 삭제되는지 백엔드 확인
- [ ] 실제 데이터베이스에서 양쪽 컬렉션 모두 확인

---

## 참고 자료

- **백엔드 API**: `backend/api/aims_api/routes/personal-files-routes.js`
- **문서 API**: `backend/api/aims_api/server.js` (line 1234-1355)
- **프론트엔드**: `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx`
- **서비스**: `frontend/aims-uix3/src/services/personalFilesService.ts`

---

**마지막 업데이트**: 2025-11-20
**검증 완료**: ✅ 실제 데이터베이스 테스트 완료 (문서 ID: 691de8bc44f6eb919ecd4953)
