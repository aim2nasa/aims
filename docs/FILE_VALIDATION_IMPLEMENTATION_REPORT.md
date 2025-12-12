# 파일 업로드 검증 프로세스 공통화 구현 보고서

**작성일**: 2025-12-13
**작성자**: Claude Code
**상태**: Phase 1-5 완료 (Phase 6 예정)

---

## 1. 개요

### 1.1 목표
새문서등록과 문서일괄등록의 파일 검증 로직을 공통 모듈로 통합하고, 추가 보안 기능을 구현한다.

### 1.2 아키텍처 요구사항 (추가됨: 2025-12-13)
- **오픈 아키텍처**: 새로운 검사 기능이 쉽게 추가될 수 있는 구조
- **플러그인 구조**: 각 검증 기능이 플러그인처럼 쉽게 추가/삭제 가능
- **확장성**: 향후 새로운 검사 기능 정의 시 최소한의 코드 변경으로 통합 가능

### 1.3 배경
- 두 메뉴(새문서등록, 문서일괄등록)에 파일 업로드 기능이 각각 구현되어 있음
- 스토리지 제한 검사 로직이 중복 구현됨
- 추가 보안 기능(MIME 검증, 바이러스 검사) 필요

### 1.4 범위
| 기능 | 설명 | 상태 |
|------|------|------|
| 스토리지 제한 검사 | 기존 중복 코드 통합 | 예정 |
| MIME 타입 검증 | 확장자 위조 탐지 | 예정 |
| 단일 파일 50MB 제한 | 기존 기능 통합 | 예정 |
| 위험 확장자 차단 | exe, bat, dll, ps1 등 | 예정 |
| ClamAV 바이러스 검사 | 서버 측 검사 | 예정 |

---

## 2. 구현 계획

### 2.1 Phase별 목표

| Phase | 목표 | 예상 커밋 메시지 |
|-------|------|------------------|
| 0 | 보고서 초기화 | - |
| 1 | 확장자/크기 검증 공통 모듈 | feat(fileValidation): 확장자/크기 검증 공통 모듈 생성 |
| 2 | MIME 타입 검증 추가 | feat(fileValidation): MIME 타입 검증 추가 |
| 3 | 스토리지 검사 통합 | feat(fileValidation): 스토리지 검사 공통 모듈 통합 |
| **3.5** | **플러그인 아키텍처 전환** | **refactor(fileValidation): 플러그인 아키텍처로 전환** |
| 4 | DocumentRegistrationView 적용 | refactor(DocumentRegistration): 공통 파일 검증 모듈 적용 |
| 5 | BatchDocumentUploadView 적용 | refactor(BatchUpload): 공통 파일 검증 모듈 적용 |
| 6 | ClamAV 바이러스 검사 | feat(security): ClamAV 바이러스 검사 기능 추가 |

### 2.2 수정 대상 파일

#### 신규 생성 파일
```
frontend/aims-uix3/src/shared/lib/fileValidation/
├── types.ts
├── constants.ts
├── validators/
│   ├── extensionValidator.ts
│   ├── fileSizeValidator.ts
│   ├── mimeTypeValidator.ts
│   └── index.ts
├── storageChecker.ts
├── virusScanApi.ts
├── index.ts
└── __tests__/
    ├── extensionValidator.test.ts
    ├── fileSizeValidator.test.ts
    ├── mimeTypeValidator.test.ts
    ├── storageChecker.test.ts
    └── integration/
        ├── validators.test.ts
        └── pipeline.test.ts
```

#### 수정 파일
- `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx`
- `frontend/aims-uix3/src/features/batch-upload/BatchDocumentUploadView.tsx`
- `backend/api/aims_api/routes/security-routes.js` (신규)
- `backend/api/aims_api/server.js`

---

## 3. Phase별 진행 기록

### Phase 0: 보고서 초기화
- **시작일시**: 2025-12-13
- **상태**: 완료
- **내용**: 구현 보고서 파일 생성

---

### Phase 1: 기본 검증기 (확장자/크기)
- **시작일시**: 2025-12-13
- **상태**: 완료
- **구현 내용**:
  - [x] types.ts 생성 - 공통 타입 정의 (FileValidationResult, StorageCheckResult 등)
  - [x] constants.ts 생성 - BLOCKED_EXTENSIONS (29개), FILE_SIZE_LIMITS (50MB)
  - [x] validators/extensionValidator.ts 생성 - 확장자 검증
  - [x] validators/fileSizeValidator.ts 생성 - 파일 크기 검증
  - [x] validators/index.ts 생성 - 통합 validateFile() 함수
- **테스트 결과**:
  - [x] extensionValidator.test.ts 통과 (15개 테스트)
  - [x] fileSizeValidator.test.ts 통과 (10개 테스트)
  - [x] typecheck 통과
- **총 테스트**: 25개 통과 / 0개 실패
- **커밋 해시**: acdec6a0 (Phase 1-3.5 통합 커밋)
- **완료일시**: 2025-12-13

---

### Phase 2: MIME 타입 검증
- **시작일시**: 2025-12-13
- **상태**: 완료
- **구현 내용**:
  - [x] constants.ts에 EXTENSION_MIME_MAP, DANGEROUS_MIME_TYPES 추가
  - [x] validators/mimeTypeValidator.ts 생성
    - isDangerousMimeType(): 위험 MIME 타입 탐지
    - isExtensionMimeMatch(): 확장자-MIME 일치 검증
    - validateMimeType(): File 객체 검증
  - [x] validators/index.ts 업데이트 - validateFile()에 MIME 검증 통합
  - [x] ValidateFileOptions 인터페이스 추가 (checkMimeType 옵션)
- **테스트 결과**:
  - [x] mimeTypeValidator.test.ts 통과 (24개 테스트)
  - [x] integration/validators.test.ts 통과 (20개 테스트)
  - [x] Phase 1 회귀 테스트 통과 (25개 테스트)
  - [x] typecheck 통과
- **총 테스트**: 69개 통과 / 0개 실패
- **커밋 해시**: acdec6a0 (Phase 1-3.5 통합 커밋)
- **완료일시**: 2025-12-13

---

### Phase 3: 스토리지 검사 통합
- **시작일시**: 2025-12-13
- **상태**: 완료
- **구현 내용**:
  - [x] storageChecker.ts 생성
    - calculatePartialUpload(): 일부 업로드 가능 파일 계산
    - checkStorageWithInfo(): 스토리지 정보로 검사
    - checkStorageQuota(): API 호출 포함 검사
    - formatStorageCheckMessage(): 사용자 친화적 메시지 변환
  - [x] index.ts (파이프라인) 생성
    - validateFilesWithStorage(): 스토리지 포함 async 검증
    - validateFilesSync(): 스토리지 정보로 sync 검증
    - 모든 타입/상수/함수 통합 export
- **테스트 결과**:
  - [x] storageChecker.test.ts 통과 (14개 테스트)
  - [x] integration/pipeline.test.ts 통과 (13개 테스트)
  - [x] Phase 1, 2 회귀 테스트 통과 (69개 테스트)
  - [x] typecheck 통과
- **총 테스트**: 96개 통과 / 0개 실패
- **커밋 해시**: acdec6a0 (Phase 1-3.5 통합 커밋)
- **완료일시**: 2025-12-13

---

### Phase 3.5: 플러그인 아키텍처 전환
- **시작일시**: 2025-12-13
- **상태**: 완료
- **배경**:
  - 향후 새로운 검사 기능이 쉽게 추가될 수 있는 오픈 아키텍처 필요
  - 각 검증 기능이 플러그인처럼 쉽게 추가/삭제 가능해야 함
- **구현 내용**:
  - [x] types.ts에 FileValidator, ValidatorRegistrationOptions, PipelineExecutionOptions 인터페이스 추가
  - [x] ValidationPipeline.ts 클래스 구현
    - register(): 검증기 등록
    - unregister(): 검증기 해제
    - setEnabled(): 활성화/비활성화
    - validate(): 단일 파일 검증
    - validateFiles(): 배치 검증
    - clone(): 파이프라인 복제
  - [x] plugins/index.ts - 기존 검증기를 플러그인으로 래핑
    - extensionValidatorPlugin (priority: 10)
    - fileSizeValidatorPlugin (priority: 20)
    - mimeTypeValidatorPlugin (priority: 30)
  - [x] validators/index.ts 업데이트 - defaultPipeline 인스턴스 생성
  - [x] 하위 호환성 유지 - 기존 validateFile(), validateFiles() 함수 동작 그대로
- **신규 파일**:
  - `ValidationPipeline.ts`
  - `plugins/index.ts`
  - `__tests__/ValidationPipeline.test.ts`
- **테스트 결과**:
  - [x] ValidationPipeline.test.ts 통과 (17개 테스트)
  - [x] Phase 1, 2, 3 회귀 테스트 통과 (96개 테스트)
  - [x] typecheck 통과
- **총 테스트**: 113개 통과 / 0개 실패
- **커밋 해시**: acdec6a0
- **완료일시**: 2025-12-13

**사용 예시**:
```typescript
import { defaultPipeline, ValidationPipeline } from '@/shared/lib/fileValidation'

// 검증기 비활성화
defaultPipeline.setEnabled('mime', false)

// 커스텀 검증기 추가
defaultPipeline.register({
  name: 'myValidator',
  priority: 50,
  enabled: true,
  validate: (file) => {
    if (file.name.includes('secret')) {
      return { valid: false, file, reason: 'unknown', message: '비밀 파일 차단' }
    }
    return { valid: true, file }
  }
})

// 검증기 제거
defaultPipeline.unregister('mime')
```

---

### Phase 4: DocumentRegistrationView 적용
- **시작일시**: 2025-12-13
- **상태**: 완료
- **구현 내용**:
  - [x] DocumentRegistrationView.tsx 수정
    - validateFile() 공통 모듈 import
    - checkStorageWithInfo() 공통 모듈 import
    - 기존 스토리지 검사 중복 로직 제거
    - 파일 검증 오류 메시지 처리 (validation.message)
- **테스트 결과**:
  - [x] 빌드 성공
  - [x] typecheck 통과
  - [x] 관련 유닛테스트 통과 (17개)
- **커밋 해시**: 0890b2b8
- **완료일시**: 2025-12-13

---

### Phase 5: BatchDocumentUploadView 적용
- **시작일시**: 2025-12-13
- **상태**: 완료
- **구현 내용**:
  - [x] BatchDocumentUploadView.tsx 수정
    - checkStorageWithInfo() 공통 모듈 import
    - calculatePartialUpload() 공통 모듈 import
    - 기존 스토리지 검사 중복 로직 제거
    - 컴포넌트 내 calculatePartialUpload 함수 정의 제거
- **테스트 결과**:
  - [x] 빌드 성공
  - [x] typecheck 통과
  - [x] 관련 유닛테스트 통과 (10개)
- **커밋 해시**: 140699a0
- **완료일시**: 2025-12-13

---

### Phase 6: ClamAV 바이러스 검사 (마지막)
- **시작일시**: -
- **상태**: 예정
- **구현 내용**:
  - [ ] 서버에 ClamAV 설치
  - [ ] security-routes.js 백엔드 API 구현
  - [ ] virusScanApi.ts 프론트엔드 연동
  - [ ] 파이프라인에 바이러스 검사 추가
- **테스트 결과**:
  - [ ] virusScanApi.test.ts 통과
  - [ ] EICAR 테스트 파일로 감지 테스트
  - [ ] 전체 회귀 테스트
- **커밋 해시**: -
- **완료일시**: -

---

## 4. 테스트 결과 요약

### 4.1 유닛테스트 통과 현황
| 테스트 파일 | 상태 | 통과/실패 |
|------------|------|----------|
| extensionValidator.test.ts | ✅ 완료 | 15/15 |
| fileSizeValidator.test.ts | ✅ 완료 | 10/10 |
| mimeTypeValidator.test.ts | ✅ 완료 | 24/24 |
| storageChecker.test.ts | ✅ 완료 | 14/14 |
| ValidationPipeline.test.ts | ✅ 완료 | 17/17 |
| virusScanApi.test.ts | 예정 | - |

### 4.2 통합테스트 결과
| 테스트 파일 | 상태 | 통과/실패 |
|------------|------|----------|
| integration/validators.test.ts | ✅ 완료 | 20/20 |
| integration/pipeline.test.ts | ✅ 완료 | 13/13 |

### 4.3 빌드/Typecheck 결과
| 항목 | 상태 |
|-----|------|
| npm run typecheck | ✅ 통과 |
| npm run build | ✅ 통과 |

### 4.4 총 테스트 현황
- **총 테스트**: 113개
- **통과**: 113개
- **실패**: 0개

---

## 5. 최종 결과 (Phase 1-5)

### 5.1 구현 완료 기능 목록
- [x] 확장자 검증 - 29개 위험 확장자 차단
- [x] 파일 크기 검증 - 50MB 제한
- [x] MIME 타입 검증 - 확장자 위조 탐지
- [x] 스토리지 용량 검사 - 일부 업로드 계산 지원
- [x] 플러그인 아키텍처 - 동적 검증기 추가/제거
- [x] DocumentRegistrationView 적용
- [x] BatchDocumentUploadView 적용

### 5.2 성능/보안 개선 사항
- **코드 중복 제거**: 두 뷰에서 스토리지 검사 로직 통합
- **확장자 위조 탐지**: MIME 타입과 확장자 불일치 감지
- **플러그인 아키텍처**: 향후 검증 기능 추가 용이

### 5.3 향후 개선 계획
- [ ] Phase 6: ClamAV 바이러스 검사 (서버 ClamAV 설치 필요)

---

## 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2025-12-13 | 보고서 초기 작성 | Claude Code |
| 2025-12-13 | Phase 1-3.5 완료 (acdec6a0) | Claude Code |
| 2025-12-13 | Phase 4 완료 (0890b2b8) | Claude Code |
| 2025-12-13 | Phase 5 완료 (140699a0) | Claude Code |
