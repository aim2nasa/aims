# 내 파일 (Personal Files) 개발 계획서

## 📋 프로젝트 개요

Google Drive와 유사한 개인 파일 관리 시스템을 AIMS 플랫폼에 구축하여, 사용자들이 자신의 문서와 파일을 효율적으로 관리할 수 있도록 지원합니다.

**목표**: 보험 설계사들이 고객 관련 문서를 체계적으로 정리하고 빠르게 접근할 수 있는 개인 파일 시스템 구축

## 🎯 현재 상태 (2025-01-17)

### ✅ 완료된 항목 (1단계: UI 프로토타입)

- [x] "내 파일" 메뉴 항목 추가 (녹색 폴더 아이콘)
- [x] PersonalFilesView 컴포넌트 생성
- [x] Google Drive 스타일 2단 레이아웃
  - 좌측: 폴더 트리 네비게이션
  - 우측: 파일/폴더 목록
- [x] UI 요소 구현
  - Breadcrumb 네비게이션
  - 검색창
  - List/Grid 뷰 토글
  - 폴더 확장/축소 기능
  - 파일 액션 버튼 (업로드, 새 폴더, 삭제)
- [x] Mock 데이터로 프로토타입 동작 확인

**파일 위치**:
- `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx`
- `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.css`
- `frontend/aims-uix3/src/components/CustomMenu/CustomMenu.tsx` (메뉴 추가)
- `frontend/aims-uix3/src/App.tsx` (라우팅 추가)

### ❌ 미완료 항목

- [ ] 백엔드 API 설계 및 구현
- [ ] MongoDB 스키마 설계
- [ ] 파일 업로드/다운로드 기능
- [ ] 실제 파일 시스템 연동
- [ ] 폴더 생성/삭제/이동 기능
- [ ] 파일 미리보기
- [ ] 권한 관리
- [ ] 공유 기능
- [ ] 검색 기능 (백엔드 연동)
- [ ] 드래그 앤 드롭
- [ ] 파일 버전 관리

---

## 🏗️ 전체 개발 단계

### 1단계: UI 프로토타입 ✅ (완료)
- Google Drive 스타일 레이아웃
- Mock 데이터로 화면 구성
- 기본 상호작용 (폴더 열기/닫기, 뷰 전환)

### 2단계: 백엔드 기반 구축 (예정)
- MongoDB 컬렉션 설계
- Node.js API 엔드포인트 구현
- 파일 저장소 구조 설계
- 사용자별 루트 폴더 자동 생성

### 3단계: 파일 업로드/다운로드
- 파일 업로드 API (multipart/form-data)
- 파일 메타데이터 저장
- 파일 다운로드 API
- 진행률 표시 UI

### 4단계: 폴더 관리
- 폴더 생성/삭제/이름 변경
- 폴더 이동 (드래그 앤 드롭)
- 폴더 구조 동기화

### 5단계: 검색 및 필터링
- 파일명 검색
- 파일 타입 필터
- 날짜 범위 검색
- 전체 텍스트 검색 (OCR 결과 연동)

### 6단계: 고급 기능
- 파일 미리보기 (PDF, 이미지, 텍스트)
- 파일 공유 (링크 생성)
- 권한 관리 (읽기/쓰기/삭제)
- 파일 버전 관리
- 휴지통 기능

---

## 🎨 핵심 기능 명세

### 📁 폴더 관리

**기능**:
- 폴더 생성 (이름, 부모 폴더)
- 폴더 이름 변경
- 폴더 이동 (드래그 앤 드롭)
- 폴더 삭제 (휴지통 이동)
- 폴더 복원 (휴지통에서)
- 폴더 영구 삭제

**UI**:
- 좌측 트리 네비게이션
- 우클릭 컨텍스트 메뉴
- Breadcrumb 네비게이션

### 📄 파일 관리

**기능**:
- 파일 업로드 (단일/다중)
- 파일 다운로드
- 파일 이름 변경
- 파일 이동
- 파일 복사
- 파일 삭제
- 파일 미리보기

**지원 파일 타입**:
- 문서: PDF, DOC, DOCX, TXT, HWP
- 이미지: JPG, PNG, GIF, WEBP
- 압축: ZIP, RAR
- 기타: XLS, XLSX, PPT, PPTX

### 🔍 검색 및 필터

**검색 기준**:
- 파일명
- 파일 타입
- 업로드 날짜
- 파일 크기
- 태그 (향후)

**정렬**:
- 이름 (오름차순/내림차순)
- 날짜 (최신순/오래된 순)
- 크기 (큰 것부터/작은 것부터)
- 타입

### 👁️ 미리보기

**지원 형식**:
- PDF: PDF Viewer 컴포넌트 재사용
- 이미지: Image Viewer 컴포넌트 재사용
- 텍스트: BaseViewer 컴포넌트 재사용

**기능**:
- 모달로 미리보기 표시
- 이전/다음 파일 네비게이션
- 확대/축소
- 다운로드 버튼

### 🔐 권한 관리 (향후)

**권한 레벨**:
- 소유자: 모든 권한
- 편집자: 읽기/쓰기/삭제
- 뷰어: 읽기만

**공유**:
- 링크 생성 (유효기간 설정)
- 사용자별 권한 설정
- 공유 해제

---

## 🛠️ 기술 스택

### Frontend
- **Framework**: React 18 + TypeScript
- **UI**: CSS Modules, Apple Design System
- **상태 관리**: useState, useCallback, useMemo
- **파일 업로드**: FormData, axios (진행률 표시)
- **드래그 앤 드롭**: HTML5 Drag and Drop API

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **파일 처리**: multer (파일 업로드)
- **인증**: JWT (기존 AIMS 인증 시스템 활용)

### Database
- **MongoDB**: 파일/폴더 메타데이터
- **파일 저장소**:
  - 로컬 파일 시스템 (개발)
  - MinIO/S3 (프로덕션, 향후)

### Storage Structure
```
/aims/data/personal-files/
  /{userId}/
    /{fileId}.{ext}
```

---

## 📊 데이터베이스 스키마

### Collection: `personal_files`

```javascript
{
  _id: ObjectId,
  userId: String,           // 사용자 ID (aims.users._id)
  name: String,            // 파일/폴더명
  type: String,            // 'file' | 'folder'
  mimeType: String,        // 'application/pdf', 'image/jpeg', etc. (파일만)
  size: Number,            // 파일 크기 (bytes, 파일만)
  parentId: ObjectId,      // 부모 폴더 ID (null이면 루트)
  path: String,            // 실제 파일 경로 (파일만)
  isDeleted: Boolean,      // 휴지통 여부
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date,         // 삭제 시간 (복원용)

  // 메타데이터
  metadata: {
    uploadedBy: String,    // 업로드한 사용자 이름
    description: String,   // 파일 설명
    tags: [String],        // 태그 (향후)
  },

  // 권한 (향후)
  permissions: {
    owner: String,         // 소유자 userId
    shared: [
      {
        userId: String,
        permission: String  // 'view' | 'edit'
      }
    ]
  },

  // 버전 관리 (향후)
  version: Number,
  versions: [
    {
      versionNumber: Number,
      path: String,
      size: Number,
      createdAt: Date,
      createdBy: String
    }
  ]
}
```

**인덱스**:
```javascript
db.personal_files.createIndex({ userId: 1, parentId: 1 })
db.personal_files.createIndex({ userId: 1, name: "text" })
db.personal_files.createIndex({ userId: 1, type: 1 })
db.personal_files.createIndex({ userId: 1, isDeleted: 1 })
```

---

## 🔌 API 설계

### Base URL
```
http://tars.giize.com:3010/api/personal-files
```

### Endpoints

#### 1. 폴더 목록 조회
```http
GET /api/personal-files/folders/:folderId?
```

**Query Parameters**:
- `folderId` (optional): 폴더 ID (없으면 루트)

**Response**:
```json
{
  "success": true,
  "data": {
    "currentFolder": {
      "_id": "folder123",
      "name": "고객 문서",
      "parentId": null
    },
    "items": [
      {
        "_id": "file123",
        "name": "계약서.pdf",
        "type": "file",
        "mimeType": "application/pdf",
        "size": 1024000,
        "createdAt": "2025-01-15T10:30:00Z"
      },
      {
        "_id": "folder456",
        "name": "2024년",
        "type": "folder",
        "itemCount": 15,
        "createdAt": "2025-01-10T09:00:00Z"
      }
    ],
    "breadcrumbs": [
      { "_id": null, "name": "내 파일" },
      { "_id": "folder123", "name": "고객 문서" }
    ]
  }
}
```

#### 2. 파일 업로드
```http
POST /api/personal-files/upload
Content-Type: multipart/form-data
```

**Body**:
```
file: <binary>
folderId: <string> (optional)
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "file789",
    "name": "document.pdf",
    "type": "file",
    "size": 2048000,
    "path": "/aims/data/personal-files/user123/file789.pdf"
  }
}
```

#### 3. 폴더 생성
```http
POST /api/personal-files/folders
Content-Type: application/json
```

**Body**:
```json
{
  "name": "새 폴더",
  "parentId": "folder123"
}
```

#### 4. 파일/폴더 삭제
```http
DELETE /api/personal-files/:itemId
```

#### 5. 파일/폴더 이동
```http
PUT /api/personal-files/:itemId/move
Content-Type: application/json
```

**Body**:
```json
{
  "targetFolderId": "folder456"
}
```

#### 6. 파일/폴더 이름 변경
```http
PUT /api/personal-files/:itemId/rename
Content-Type: application/json
```

**Body**:
```json
{
  "newName": "새로운 이름.pdf"
}
```

#### 7. 파일 다운로드
```http
GET /api/personal-files/:fileId/download
```

**Response**: Binary file stream

#### 8. 검색
```http
GET /api/personal-files/search?q=계약서&type=file&from=2025-01-01&to=2025-01-31
```

#### 9. 휴지통 목록
```http
GET /api/personal-files/trash
```

#### 10. 복원
```http
PUT /api/personal-files/:itemId/restore
```

---

## 📁 파일 구조

```
frontend/aims-uix3/src/
  components/
    DocumentViews/
      PersonalFilesView/
        PersonalFilesView.tsx          # 메인 컴포넌트 ✅
        PersonalFilesView.css          # 스타일 ✅
        FileList.tsx                   # 파일 목록 (향후)
        FolderTree.tsx                 # 폴더 트리 (향후)
        FileUploader.tsx               # 업로드 컴포넌트 (향후)
        FilePreview.tsx                # 미리보기 (향후)
  services/
    personalFilesService.ts            # API 호출 서비스 (향후)
  types/
    personalFiles.ts                   # 타입 정의 (향후)

backend/api/aims_api/
  routes/
    personalFiles.js                   # 라우트 정의 (향후)
  controllers/
    personalFilesController.js         # 컨트롤러 (향후)
  middleware/
    fileUpload.js                      # multer 설정 (향후)
  utils/
    fileStorage.js                     # 파일 저장소 유틸 (향후)
```

---

## 🚀 개발 일정 (예상)

### 2단계: 백엔드 기반 구축 (3일)
- [ ] MongoDB 스키마 생성
- [ ] 기본 CRUD API 구현
- [ ] 파일 저장소 구조 설정
- [ ] 사용자별 루트 폴더 자동 생성 로직

### 3단계: 파일 업로드/다운로드 (5일)
- [ ] multer 설정 및 업로드 API
- [ ] 파일 메타데이터 저장
- [ ] 다운로드 API
- [ ] Frontend 업로드 UI (진행률 표시)
- [ ] Frontend 다운로드 기능

### 4단계: 폴더 관리 (3일)
- [ ] 폴더 생성/삭제 API
- [ ] 폴더 이동 API
- [ ] Frontend 폴더 관리 UI
- [ ] 드래그 앤 드롭 구현

### 5단계: 검색 및 필터링 (2일)
- [ ] 검색 API 구현
- [ ] Frontend 검색 UI
- [ ] 필터 및 정렬 기능

### 6단계: 고급 기능 (7일)
- [ ] 파일 미리보기
- [ ] 휴지통 기능
- [ ] 권한 관리
- [ ] 공유 기능
- [ ] 버전 관리

**총 예상 기간**: 약 20일 (개발자 1명 기준)

---

## 🔒 보안 고려사항

### 인증 및 권한
- JWT 토큰 검증 (기존 AIMS 인증 시스템 활용)
- 사용자는 자신의 파일만 접근 가능
- 공유된 파일은 권한 레벨에 따라 접근 제어

### 파일 업로드 제한
- 최대 파일 크기: 100MB (설정 가능)
- 허용 파일 타입: PDF, 이미지, 문서, 압축파일
- 바이러스 스캔 (향후)

### 파일 저장소
- 파일명 중복 방지 (UUID 사용)
- 경로 탐색 공격 방지
- 파일 시스템 권한 설정

---

## 📈 향후 확장 가능성

1. **AI 기반 자동 분류**
   - 업로드된 파일을 자동으로 분류 (기존 doctag 모듈 활용)
   - 고객별 자동 폴더 생성

2. **OCR 연동**
   - 업로드된 이미지/PDF에서 텍스트 추출 (기존 dococr 모듈 활용)
   - 전체 텍스트 검색 지원

3. **문서 라이브러리 통합**
   - 문서 라이브러리의 파일을 "내 파일"로 복사/이동
   - 양방향 동기화

4. **클라우드 스토리지 연동**
   - Google Drive, Dropbox 연동
   - 외부 저장소에 백업

5. **협업 기능**
   - 실시간 공동 편집 (향후)
   - 댓글 및 피드백

---

## 📚 참고 문서

- [Google Drive 인터페이스 가이드](https://developers.google.com/drive/api/guides/about-sdk)
- [AIMS 문서 관리 시스템](../README.md)
- [AIMS 디자인 시스템](../frontend/aims-uix3/CSS_SYSTEM.md)
- [Apple HIG - File Management](https://developer.apple.com/design/human-interface-guidelines/file-management)

---

## 📝 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 2025-01-17 | 0.1.0 | 초안 작성, 1단계 UI 프로토타입 완료 | Claude |

---

## 💡 개발 시 주의사항

### CLAUDE.md 준수
- ✅ CSS 하드코딩 금지 (CSS 변수 사용)
- ✅ 최소한 수정 원칙 준수
- ✅ 커밋 전 사용자 승인 필수
- ✅ 아이콘 크기: 16px 이하 (CALLOUT 기준)

### 성능 최적화
- 대용량 파일 업로드: 청크 업로드 고려
- 폴더 트리: 가상 스크롤링 (항목 많을 때)
- 파일 목록: 페이지네이션 또는 무한 스크롤
- 썸네일: Lazy loading

### 사용자 경험
- 업로드/다운로드 진행률 표시
- 드래그 앤 드롭 시각적 피드백
- 에러 처리 및 사용자 알림
- 반응형 디자인 (모바일 지원)

---

**문서 버전**: 0.1.0
**최종 수정일**: 2025-01-17
**다음 검토일**: 2단계 개발 시작 전
