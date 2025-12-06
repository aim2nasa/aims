# 고객 문서 일괄등록 기능 구현 계획

**작성일**: 2025-12-05
**최종 수정**: 2025-12-05
**상태**: 설계 완료

---

## 1. 개요

### 1.1 목적
경력 보험설계사가 기존 PC에 고객명별로 정리된 대량의 문서를 AIMS로 손쉽게 마이그레이션할 수 있는 기능 제공

### 1.2 핵심 컨셉
- 폴더명 = 고객명 (100% 일치 시에만 자동 연결)
- 폴더 선택 → 매핑 미리보기 → 검증 → 업로드 → 결과 확인

---

## 2. 요구사항

### 2.1 기능 요구사항

| 항목 | 설명 |
|------|------|
| 폴더 선택 | 사용자가 고객명 폴더들을 선택 (드래그앤드롭 또는 폴더 선택) |
| 자동 매핑 | 폴더명과 DB 고객명 100% 일치 시 자동 연결 |
| 중첩 폴더 | 허용 (하위 폴더 구조 유지) |
| 중복 파일 | Windows 탐색기 방식 문의 (덮어쓰기/건너뛰기/둘다유지) |
| 진행률 표시 | 전체 진행률, 현재 파일, 예상 남은 시간, 업로드 속도 |
| 업로드 내역 | 성공/실패 파일 목록 확인 가능 (30일 보관) |

### 2.2 보안 요구사항

| 항목 | 설명 | 결정 |
|------|------|------|
| 확장자 차단 | exe, bat, cmd, ps1, vbs, js, msi, dll, scr, com 등 | ✅ 적용 |
| MIME 타입 검증 | 서버에서 확장자 위조 탐지 | ✅ 적용 |
| 바이러스 검사 | 서버 측 ClamAV 검사 | ✅ 적용 |
| 단일 파일 제한 | 50MB | ✅ 적용 |

**보안 검사 방식**: 확장자 차단 (클라이언트) + ClamAV 바이러스 검사 (서버) 병행

### 2.3 설계사 등급 시스템

**설계사 등급별 저장 한도** (고객이 아닌 설계사에 적용):

| 등급 | 최대 저장량 | 배치 업로드 한도 | 기간 제한 | 비고 |
|------|------------|-----------------|----------|------|
| 무료체험 | 5GB | 100MB | 30일 | 신규 가입 기본 |
| 일반 | 30GB | 500MB | 무제한 | 유료 기본 |
| 프리미엄 | 50GB | 1GB | 무제한 | |
| VIP | 100GB | 2GB | 무제한 | |

### 2.4 무료체험 등급 정책

| 항목 | 정책 |
|------|------|
| 기간 | 가입 후 30일 |
| 저장량 | 5GB |
| 배치 업로드 | 100MB/회 |
| 기능 제한 | 없음 (모든 기능 사용 가능) |
| 만료 시 | 읽기 전용 모드 (새 업로드 불가, 기존 문서 열람 가능) |
| 용량 초과 시 | 추가 업로드 불가, 기존 문서 유지 |
| 유료 전환 시 | 즉시 제한 해제 |

---

## 3. 제약조건 검증 계층

```
[1단계: 클라이언트 사전 검증]
├── 단일 파일 ≤ 50MB
├── 배치 총합 ≤ 설계사 등급별 한도
├── 위험 확장자 차단
└── 폴더-고객 매핑 100% 일치 여부

[2단계: 서버 업로드 중 검증]
├── 설계사 총 할당량 잔여 확인
├── MIME 타입 검증
├── ClamAV 바이러스 검사
└── 무료체험 기간 만료 여부 확인
```

---

## 4. UX 플로우

### 4.1 전체 흐름

```
[1. 폴더 선택]
    ├── 드래그앤드롭 영역
    └── "폴더 선택" 버튼

[2. 매핑 미리보기]
    ├── ✅ 매칭됨: 폴더명 → 고객명 (자동 연결)
    ├── ❌ 미매칭: 폴더명 (일치 고객 없음 - 제외)
    └── ⚠️ 제외 파일: 크기 초과, 위험 확장자

[3. 중복 파일 처리] (해당 시)
    └── Windows 스타일 대화상자
        ├── 덮어쓰기
        ├── 건너뛰기
        └── 둘 다 유지 (이름 변경)

[4. 업로드 진행]
    ├── 전체 진행률 바
    ├── 현재 파일명
    ├── 업로드 속도 (MB/s)
    ├── 예상 남은 시간
    └── 일시정지/취소 버튼

[5. 완료 요약]
    ├── 성공: N개 (XX MB)
    ├── 실패: M개 (재시도 버튼)
    ├── 건너뜀: K개
    └── 상세 내역 보기
```

### 4.2 업로드 실패 처리 (Google Drive/Naver MyBox 참고)

| 상황 | 처리 |
|------|------|
| 네트워크 오류 | 자동 재시도 3회 → 실패 목록에 추가 |
| 서버 오류 | 즉시 실패 목록에 추가 |
| 할당량 초과 | 즉시 중단 + 모달 안내 |
| 바이러스 감지 | 해당 파일 제외 + 경고 표시 |
| 무료체험 만료 | 즉시 중단 + 업그레이드 안내 모달 |
| 부분 성공 | 완료 요약에서 "실패 파일 재시도" 버튼 제공 |

---

## 5. 데이터 모델

### 5.1 설계사 등급 컬렉션 (신규)

**컬렉션명**: `agent_tiers`

```typescript
interface AgentTier {
  _id: ObjectId
  name: string                  // '무료체험', '일반', '프리미엄', 'VIP'
  maxStorageBytes: number       // 5GB, 30GB, 50GB, 100GB
  maxBatchUploadBytes: number   // 100MB, 500MB, 1GB, 2GB
  trialDays: number | null      // 30 (무료체험) or null (유료)
  isDefault: boolean            // 신규 가입 시 기본 등급 여부
  createdAt: Date
  updatedAt: Date
}
```

**초기 데이터**:
```javascript
[
  { name: '무료체험', maxStorageBytes: 5*1024*1024*1024, maxBatchUploadBytes: 100*1024*1024, trialDays: 30, isDefault: true },
  { name: '일반', maxStorageBytes: 30*1024*1024*1024, maxBatchUploadBytes: 500*1024*1024, trialDays: null, isDefault: false },
  { name: '프리미엄', maxStorageBytes: 50*1024*1024*1024, maxBatchUploadBytes: 1024*1024*1024, trialDays: null, isDefault: false },
  { name: 'VIP', maxStorageBytes: 100*1024*1024*1024, maxBatchUploadBytes: 2*1024*1024*1024, trialDays: null, isDefault: false }
]
```

### 5.2 설계사 저장량 추적 (기존 users 컬렉션 확장)

```typescript
// users 컬렉션에 추가
interface UserStorageInfo {
  tierId: ObjectId           // agent_tiers 참조
  tierStartedAt: Date        // 현재 등급 시작일 (무료체험 만료 계산용)
  usedStorageBytes: number   // 현재 사용량
  lastCalculatedAt: Date     // 마지막 계산 시점
}
```

### 5.3 업로드 배치 이력 (신규)

**컬렉션명**: `upload_batches`
**보관 기간**: 30일 (TTL 인덱스 적용)

```typescript
interface UploadBatch {
  _id: ObjectId
  userId: ObjectId
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalFiles: number
  successCount: number
  failedCount: number
  skippedCount: number
  totalBytes: number
  uploadedBytes: number
  folders: Array<{
    folderName: string
    customerId: ObjectId | null
    matched: boolean
    fileCount: number
  }>
  failedFiles: Array<{
    filename: string
    folderName: string
    reason: string  // 'size_exceeded', 'blocked_extension', 'virus_detected', 'network_error', etc.
  }>
  createdAt: Date
  completedAt: Date | null
  expiresAt: Date  // TTL 인덱스용 (createdAt + 30일)
}
```

---

## 6. API 설계

### 6.1 고객명 일괄 조회
```
POST /api/customers/batch-lookup
Body: { names: string[] }
Response: { matches: { [name: string]: Customer | null } }
```

### 6.2 할당량 확인
```
GET /api/users/me/storage
Response: {
  tier: {
    name: string,
    maxStorage: number,
    maxBatchUpload: number,
    trialDays: number | null
  },
  used: number,
  remaining: number,
  tierStartedAt: Date,
  trialExpiresAt: Date | null,  // 무료체험인 경우
  isTrialExpired: boolean
}
```

### 6.3 배치 업로드 시작
```
POST /api/documents/batch-upload/start
Body: {
  folders: Array<{ name: string, customerId: string, fileCount: number }>
  totalBytes: number
}
Response: {
  batchId: string,
  allowed: boolean,
  reason?: string  // 'quota_exceeded', 'trial_expired', etc.
}
```

### 6.4 파일 업로드 (개별)
```
POST /api/documents/batch-upload/:batchId/file
Body: FormData (file, customerId, relativePath)
Response: {
  success: boolean,
  documentId?: string,
  error?: string,
  scanResult?: { clean: boolean, threat?: string }  // ClamAV 결과
}
```

### 6.5 배치 완료
```
POST /api/documents/batch-upload/:batchId/complete
Response: { summary: UploadBatch }
```

### 6.6 배치 이력 조회
```
GET /api/documents/batch-upload/history
Response: { batches: UploadBatch[] }  // 최근 30일
```

---

## 7. 차단 확장자 목록

```typescript
const BLOCKED_EXTENSIONS = [
  // 실행 파일
  'exe', 'com', 'bat', 'cmd', 'msi', 'scr',
  // 스크립트
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
  'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
  // 라이브러리
  'dll', 'sys', 'drv',
  // 기타
  'lnk', 'pif', 'application', 'gadget', 'hta', 'cpl',
  'msc', 'jar', 'reg'
]
```

---

## 8. 구현 워크플로우

### 작업 원칙
- 각 단계마다 100% 기능 증명을 위한 테스트 작성
- `npm test`에서 모든 테스트 통과 필수
- 테스트 검증 완료 후 커밋
- CLAUDE.md 규칙 준수

### 메뉴 위치
- **파일**: `src/components/CustomMenu/CustomMenu.tsx`
- **위치**: "고객·계약 일괄등록" (`contracts-import`) 메뉴 바로 아래

---

## 9. 구현 단계

### Phase 1: 기반 구조 (Frontend 유틸리티)

#### 1.1 타입 정의
- [ ] `src/features/batch-upload/types/index.ts`
  - `AgentTier`, `UploadBatch`, `FileValidationResult`, `FolderMapping` 인터페이스

#### 1.2 파일 검증 유틸리티
- [ ] `src/features/batch-upload/utils/fileValidation.ts`
  - 차단 확장자 상수 정의
  - `isBlockedExtension(filename)` 함수
  - `isFileSizeValid(size)` 함수 (50MB 제한)
  - `validateBatchSize(files, tierLimit)` 함수

**테스트**: `fileValidation.test.ts`
- 차단 확장자 검증 (exe, bat, dll 등)
- 허용 확장자 통과 (pdf, doc, jpg 등)
- 파일 크기 검증 (50MB 초과 차단)
- 배치 크기 검증 (등급별 한도)

#### 1.3 고객명 매칭 유틸리티
- [ ] `src/features/batch-upload/utils/customerMatcher.ts`
  - `matchFolderToCustomer(folderName, customers)` 함수
  - 100% 정확 일치만 허용 (trim, case-sensitive)

**테스트**: `customerMatcher.test.ts`
- 정확 일치 매칭
- 부분 일치 거부
- 공백 트림 처리
- 대소문자 구분

### Phase 2: 프론트엔드 UI

| 작업 | 설명 |
|------|------|
| 메뉴 추가 | CustomMenu.tsx에 "고객 문서 일괄등록" 메뉴 |
| 라우트 추가 | App.tsx에 `/batch-upload` 라우트 |
| 페이지 생성 | BatchDocumentUploadView 컴포넌트 |
| 폴더 선택 | FolderDropZone 컴포넌트 |
| 매핑 미리보기 | MappingPreview 컴포넌트 |

**테스트**: `FolderDropZone.test.tsx`, `MappingPreview.test.tsx`

### Phase 3: 업로드 로직

| 작업 | 설명 |
|------|------|
| 업로드 Hook | useBatchUpload.ts - 상태 관리, 진행률, 재시도 |
| API 클라이언트 | batchUploadApi.ts - 고객명 조회, 배치 업로드 |
| 진행률 UI | UploadProgress.tsx, UploadSummary.tsx |

**테스트**: `useBatchUpload.test.ts`

### Phase 4: 중복 처리 & 완성

| 작업 | 설명 |
|------|------|
| 중복 다이얼로그 | DuplicateDialog.tsx - 덮어쓰기/건너뛰기/둘다유지 |
| Storage Quota | StorageQuotaBar.tsx - 사용량/최대 용량 표시 |

**테스트**: `DuplicateDialog.test.tsx`

### Phase 5: 보안 강화 (Backend)

| 작업 | 설명 |
|------|------|
| DB 스키마 | agent_tiers, upload_batches 컬렉션 생성 |
| ClamAV 설치 | 서버에 ClamAV 데몬 설치 및 설정 |
| ClamAV 연동 | 업로드 파일 실시간 검사 |
| MIME 검증 | 서버에서 확장자 위조 탐지 |
| 할당량 강제 | 업로드 중 실시간 확인 |

---

## 10. 수정 대상 파일

### Frontend (신규)
- `src/features/batch-upload/BatchDocumentUploadView.tsx`
- `src/features/batch-upload/components/FolderDropZone.tsx`
- `src/features/batch-upload/components/MappingPreview.tsx`
- `src/features/batch-upload/components/UploadProgress.tsx`
- `src/features/batch-upload/components/DuplicateDialog.tsx`
- `src/features/batch-upload/components/UploadSummary.tsx`
- `src/features/batch-upload/components/StorageQuotaBar.tsx`
- `src/features/batch-upload/hooks/useBatchUpload.ts`
- `src/features/batch-upload/api/batchUploadApi.ts`
- `src/features/batch-upload/utils/fileValidation.ts`

### Frontend (수정)
- `src/App.tsx` - 라우트 추가
- `src/components/LeftPane/LeftPane.tsx` - 메뉴 추가

### Backend (신규)
- `routes/batch-upload-routes.js`
- `services/batchUploadService.js`
- `services/storageQuotaService.js`
- `services/clamavService.js`

### Backend (수정)
- `server.js` - 라우트 등록

---

## 11. 테스트 계획

### 11.1 단위 테스트
- [ ] 확장자 검증 로직
- [ ] 파일 크기 검증 로직
- [ ] 고객명 매칭 로직
- [ ] 할당량 계산 로직
- [ ] 무료체험 만료 계산 로직

### 11.2 통합 테스트
- [ ] 폴더 선택 → 매핑 → 업로드 전체 플로우
- [ ] 중복 파일 처리
- [ ] 네트워크 오류 재시도
- [ ] 할당량 초과 시 중단
- [ ] ClamAV 바이러스 감지 시 처리
- [ ] 무료체험 만료 시 차단

### 11.3 E2E 테스트
- [ ] 실제 폴더 업로드 시나리오
- [ ] 대용량 배치 (100+ 파일) 업로드
- [ ] 등급별 제한 테스트

---

## 12. 진행 상황

**최종 업데이트**: 2025-12-06

| 단계 | 상태 | 비고 |
|------|------|------|
| 요구사항 정의 | ✅ 완료 | |
| 기술 검토 | ✅ 완료 | |
| 상세 설계 | ✅ 완료 | |
| Phase 1 구현 | ✅ 완료 | 기반 구조 (52개 테스트 통과) |
| Phase 2 구현 | ✅ 완료 | UI 컴포넌트 (모든 테스트 통과) |
| Phase 3 구현 | ✅ 완료 | 업로드 로직 (7개 테스트 통과) |
| Phase 4 구현 | ✅ 완료 | 중복 처리 & 완성 (모든 테스트 통과) |
| Phase 5 구현 | ❌ 미완료 | **Backend API 미구현** |
| 통합 테스트 | ⏳ 대기 | Backend 완료 후 진행 |

---

### Phase 1 구현 결과 (2025-12-05)

#### 생성된 파일
- `src/features/batch-upload/types/index.ts` - 타입 정의
- `src/features/batch-upload/utils/fileValidation.ts` - 파일 검증 유틸리티
- `src/features/batch-upload/utils/customerMatcher.ts` - 고객명 매칭 유틸리티

#### 테스트 파일
- `src/features/batch-upload/utils/__tests__/fileValidation.test.ts` (29개 테스트)
- `src/features/batch-upload/utils/__tests__/customerMatcher.test.ts` (23개 테스트)

#### 테스트 결과
- Phase 1 테스트: 52개 통과 ✅

---

### Phase 2 구현 결과 (2025-12-06)

#### 생성된 파일
- `src/features/batch-upload/BatchDocumentUploadView.tsx` - 메인 페이지
- `src/features/batch-upload/components/FolderDropZone.tsx` - 폴더 선택 UI
- `src/features/batch-upload/components/MappingPreview.tsx` - 매핑 미리보기
- `src/features/batch-upload/components/FolderDropZone.css`
- `src/features/batch-upload/components/MappingPreview.css`
- `src/features/batch-upload/BatchDocumentUploadView.css`

#### 수정된 파일
- `src/components/CustomMenu/CustomMenu.tsx` - "문서 일괄등록" 메뉴 추가
- `src/App.tsx` - `batch-document-upload` 라우트 추가

#### 테스트 파일
- `src/features/batch-upload/__tests__/FolderDropZone.test.tsx` (10개 테스트)
- `src/features/batch-upload/__tests__/MappingPreview.test.tsx` (12개 테스트)

#### 테스트 결과
- FolderDropZone: 10개 통과 ✅
- MappingPreview: 12개 통과 ✅
- **batch-upload 전체: 92개 테스트 통과 ✅**

#### 테스트 수정 이력 (2025-12-06)
- `c1bb7e40`: MappingPreview 테스트 React key 중복 경고 해결
- `1d1d861d`: FolderDropZone 테스트 UI 변경에 맞춰 수정

---

### Phase 3 구현 결과 (2025-12-06)

#### 생성된 파일
- `src/features/batch-upload/hooks/useBatchUpload.ts` - 업로드 상태 관리
- `src/features/batch-upload/api/batchUploadApi.ts` - API 클라이언트
- `src/features/batch-upload/components/UploadProgress.tsx` - 진행률 UI
- `src/features/batch-upload/components/UploadSummary.tsx` - 완료 요약 UI
- `src/features/batch-upload/components/UploadProgress.css`
- `src/features/batch-upload/components/UploadSummary.css`

#### 테스트 파일
- `src/features/batch-upload/hooks/__tests__/useBatchUpload.test.ts` (7개 테스트)

#### 테스트 결과
- useBatchUpload: 7개 통과 ✅

---

### Phase 4 구현 결과 (2025-12-06)

#### 생성된 파일
- `src/features/batch-upload/components/DuplicateDialog.tsx` - 중복 파일 처리 UI
- `src/features/batch-upload/components/StorageQuotaBar.tsx` - 할당량 표시
- `src/features/batch-upload/components/DuplicateDialog.css`
- `src/features/batch-upload/components/StorageQuotaBar.css`

#### 테스트 파일
- `src/features/batch-upload/__tests__/DuplicateDialog.test.tsx`

#### 테스트 결과
- DuplicateDialog: 테스트 존재 ✅

---

### Phase 5 (Backend) 미완료 항목

#### 필요한 파일 (미생성)
- `backend/api/aims_api/routes/batch-upload-routes.js` ❌
- `backend/api/aims_api/services/batchUploadService.js` ❌
- `backend/api/aims_api/services/storageQuotaService.js` ❌
- `backend/api/aims_api/services/clamavService.js` ❌

#### 필요한 API 엔드포인트 (미구현)
- `POST /api/customers/batch-lookup` - 고객명 일괄 조회 ❌
- `GET /api/users/me/storage` - 할당량 확인 ❌
- `POST /api/documents/batch-upload/start` - 배치 시작 ❌
- `POST /api/documents/batch-upload/:batchId/file` - 파일 업로드 ❌
- `POST /api/documents/batch-upload/:batchId/complete` - 배치 완료 ❌
- `GET /api/documents/batch-upload/history` - 배치 이력 조회 ❌

#### DB 스키마 (미생성)
- `agent_tiers` 컬렉션 (설계사 등급) ❌
- `upload_batches` 컬렉션 (업로드 배치 이력) ❌
- `users` 컬렉션 확장 (tierId, usedStorageBytes 필드) ❌

#### 보안 인프라 (미구현)
- ClamAV 설치 및 설정 ❌
- MIME 타입 검증 로직 ❌

---

### 현재 이슈

| 번호 | 이슈 | 심각도 | 상태 |
|------|------|--------|------|
| 1 | MappingPreview 테스트 6개 실패 (React key 중복) | 낮음 | ✅ **해결됨** (c1bb7e40) |
| 2 | FolderDropZone 테스트 10개 실패 (UI 변경) | 낮음 | ✅ **해결됨** (1d1d861d) |
| 3 | Backend API 전체 미구현 | **높음** | **차단** |
| 4 | DB 스키마 미생성 | 높음 | 대기 |
| 5 | ClamAV 보안 검사 미연동 | 중간 | 대기 |

**현재 상태**: **Frontend 완성 (모든 테스트 통과)**, Backend 전체 미구현으로 기능 동작 불가

---

## 13. 결정된 사항 요약

| 항목 | 결정 |
|------|------|
| 바이러스 검사 | ClamAV 도입 + 확장자 차단 병행 |
| 업로드 이력 보관 | 30일 (TTL 인덱스) |
| 신규 가입 기본 등급 | 무료체험 (30일, 5GB) |
| 무료체험 만료 시 | 읽기 전용 모드 |
| 폴더-고객 매칭 | 100% 정확 일치만 허용 |
| 중복 파일 처리 | Windows 탐색기 방식 (덮어쓰기/건너뛰기/둘다유지) |
| 중첩 폴더 | 허용 |
