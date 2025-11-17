# 내 파일 관리 MongoDB 스키마

## 저장 위치

- **데이터베이스**: `docupload`
- **컬렉션**: `personal_files`

## 스키마 구조

### 폴더 문서
```javascript
{
  _id: ObjectId("..."),
  userId: "user123",                    // 사용자 ID
  name: "내 폴더",                       // 폴더 이름
  type: "folder",                       // 타입 (폴더)
  parentId: ObjectId("...") | null,     // 부모 폴더 ID (null이면 루트)
  createdAt: ISODate("2025-01-01"),
  updatedAt: ISODate("2025-01-01"),
  isDeleted: false                      // 소프트 삭제 플래그
}
```

### 파일 문서
```javascript
{
  _id: ObjectId("..."),
  userId: "user123",
  name: "문서.pdf",                     // 원본 파일명
  type: "file",                         // 타입 (파일)
  mimeType: "application/pdf",          // MIME 타입
  size: 1024000,                        // 파일 크기 (bytes)
  storagePath: "/data/files/users/user123/myfiles/문서-1234567890.pdf",  // 물리적 저장 경로
  parentId: ObjectId("...") | null,
  createdAt: ISODate("2025-01-01"),
  updatedAt: ISODate("2025-01-01"),
  isDeleted: false
}
```

## 물리적 파일 저장

**서버 경로**: `/data/files/users/{userId}/myfiles/`

예시: 사용자 `user123`의 파일은 `/data/files/users/user123/myfiles/` 디렉토리에 저장

## 인덱스

| 인덱스 | 필드 | 용도 |
|--------|------|------|
| 복합 인덱스 | `{ userId: 1, parentId: 1, isDeleted: 1 }` | 폴더 탐색 |
| 복합 인덱스 | `{ userId: 1, type: 1, isDeleted: 1 }` | 타입별 조회 |
| 복합 인덱스 | `{ userId: 1, name: 1, isDeleted: 1 }` | 이름 중복 검사 |
| 단일 인덱스 | `{ createdAt: 1 }` | 날짜 정렬 |
| 텍스트 인덱스 | `{ name: "text" }` | 전문 검색 |

## 주요 특징

- **계층 구조**: `parentId`로 폴더/파일 트리 구현
- **소프트 삭제**: `isDeleted` 플래그로 복구 가능
- **사용자 격리**: 모든 쿼리에 `userId` 포함
- **메타데이터 분리**: MongoDB에 메타데이터, 파일시스템에 실제 파일

## API 엔드포인트

- `GET /api/personal-files/folders` - 루트 폴더 조회
- `GET /api/personal-files/folders/:folderId` - 특정 폴더 조회
- `POST /api/personal-files/folders` - 폴더 생성
- `POST /api/personal-files/upload` - 파일 업로드
- `PUT /api/personal-files/:itemId/rename` - 이름 변경
- `DELETE /api/personal-files/:itemId` - 삭제
- `PUT /api/personal-files/:itemId/move` - 이동
- `GET /api/personal-files/:fileId/download` - 다운로드
- `GET /api/personal-files/search` - 검색

## 관련 파일

- **백엔드 라우트**: `backend/api/aims_api/routes/personal-files-routes.js`
- **프론트엔드 서비스**: `frontend/aims-uix3/src/services/personalFilesService.ts`
- **프론트엔드 컴포넌트**: `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/`
