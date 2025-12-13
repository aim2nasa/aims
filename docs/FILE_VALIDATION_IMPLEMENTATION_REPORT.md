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
- **시작일시**: 2025-12-13
- **상태**: 구현 완료 (배포 대기)
- **구현 내용**:
  - [x] 서버에 ClamAV 설치 (tars.giize.com)
    - ClamAV 1.4.3/27848 설치 완료
    - clamav-daemon 정상 실행 중
  - [x] security-routes.js 백엔드 API 구현
    - GET /api/security/scan-status: ClamAV 상태 확인
    - POST /api/security/scan-file: 파일 바이러스 검사 (multipart/form-data)
    - POST /api/security/scan-buffer: Base64 인코딩 파일 검사
  - [x] virusScanApi.ts 프론트엔드 연동
    - getScanStatus(): ClamAV 상태 확인 (1분 캐시)
    - isScanAvailable(): 사용 가능 여부 확인
    - scanFile(): 단일 파일 스캔
    - scanFiles(): 배치 파일 스캔
  - [x] virusScanUtils.ts 유틸리티 함수
    - getInfectedFiles(): 감염 파일 필터링
    - getScanSummary(): 스캔 결과 요약
- **테스트 결과**:
  - [x] virusScanApi.test.ts 통과 (10개 테스트)
  - [ ] EICAR 테스트 파일로 감지 테스트 (배포 후 테스트)
  - [x] 전체 회귀 테스트 통과 (123개)
- **커밋 해시**: (배포 후 커밋)
- **완료일시**: -

---

## 6. ClamAV 설치 및 운용 가이드

### 6.1 설치 (Ubuntu/Debian)

```bash
# ClamAV 및 데몬 설치
sudo apt-get update
sudo apt-get install clamav clamav-daemon

# 바이러스 DB 수동 업데이트 (최초 1회)
# freshclam 서비스가 자동 실행되므로 수동 실행은 선택사항
sudo systemctl stop clamav-freshclam  # 서비스 중지 후
sudo freshclam                         # 수동 업데이트
sudo systemctl start clamav-freshclam # 서비스 재시작
```

### 6.2 서비스 관리

```bash
# 데몬 시작/중지/상태
sudo systemctl start clamav-daemon
sudo systemctl stop clamav-daemon
sudo systemctl status clamav-daemon

# DB 업데이트 서비스 (자동 실행됨)
sudo systemctl status clamav-freshclam
```

### 6.3 설치 확인

```bash
# ClamAV 버전 및 DB 버전 확인
clamscan --version
# 출력 예: ClamAV 1.4.3/27848/Fri Dec 12 18:26:04 2025
#         버전/DB버전/DB빌드날짜

# DB 파일 확인
ls -la /var/lib/clamav/
# 필수 파일: daily.cvd, main.cvd, bytecode.cvd
```

### 6.4 명령줄 스캔 테스트

```bash
# 단일 파일 스캔
clamscan /path/to/file.pdf

# 디렉토리 스캔
clamscan -r /path/to/directory/

# 감염 파일만 출력 (빠른 확인)
clamscan --infected /path/to/file
```

### 6.5 EICAR 테스트 파일

바이러스 검사 기능 테스트용 무해한 테스트 파일:

```bash
# EICAR 테스트 파일 생성
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt

# 스캔 테스트 (감염으로 탐지되어야 함)
clamscan /tmp/eicar.txt
# 예상 출력: /tmp/eicar.txt: Eicar-Signature FOUND

# 테스트 후 삭제
rm /tmp/eicar.txt
```

### 6.6 트러블슈팅

| 문제 | 원인 | 해결 |
|------|------|------|
| `freshclam` 실행 시 lock 에러 | freshclam 서비스가 이미 실행 중 | 서비스가 DB를 업데이트 중이므로 기다리거나, 서비스 중지 후 수동 실행 |
| `clamav-daemon` 시작 안됨 | DB 파일 미존재 | `freshclam`으로 DB 다운로드 후 재시도 |
| DB 버전이 0으로 표시 | DB 로드 실패 | `/var/lib/clamav/` 권한 확인 및 DB 파일 존재 확인 |

### 6.7 운영 권장사항

1. **DB 자동 업데이트**: `clamav-freshclam` 서비스가 자동으로 DB를 업데이트함 (기본 1시간마다)
2. **메모리 사용량**: clamd 데몬은 약 1GB 메모리 사용 (DB 로드 시)
3. **로그 위치**: `/var/log/clamav/`
4. **설정 파일**:
   - clamd: `/etc/clamav/clamd.conf`
   - freshclam: `/etc/clamav/freshclam.conf`

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
| virusScanApi.test.ts | ✅ 완료 | 10/10 |

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
- **총 테스트**: 123개
- **통과**: 123개
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

---

## 7. 🔴 Phase 7: 검증 로직 불일치 버그 수정

### 7.1 발견 일시
- **발견일**: 2025-12-14
- **발견 경위**: 사용자가 동일 파일 재업로드 시 중복 체크가 되지 않음을 보고

### 7.2 정밀 비교표: 새 문서 등록 vs 문서 일괄등록

| 검증 단계 | 새 문서 등록 | 문서 일괄등록 | 비고 |
|-----------|:------------:|:------------:|------|
| **1. 확장자 검증** (위험 확장자 차단) | ✅ `shared/lib/fileValidation` | ✅ `batch-upload/utils/fileValidation` | **둘 다 있음** (다른 모듈) |
| **2. 파일 크기 검증** (50MB) | ✅ | ✅ | **둘 다 있음** |
| **3. MIME 타입 검증** (확장자 위조 탐지) | ✅ | ❌ **없음** | **일괄등록에 누락!** |
| **4. 스토리지 용량 검사** | ✅ `checkStorageWithInfo` | ✅ `checkStorageWithInfo` | **둘 다 있음** (동일 모듈) |
| **5. 바이러스 검사** (ClamAV) | ✅ `uploadService.ts` | ✅ `batchUploadApi.ts` | **둘 다 있음** |
| **6. 중복 파일 검사** (SHA-256 해시) | ❌ **없음** | ✅ `duplicateChecker.ts` | **새 문서 등록에 누락!** |

### 7.3 발견된 버그 2건

| # | 기능 | 누락된 검증 | 파일 |
|---|------|------------|------|
| **1** | 새 문서 등록 | 중복 파일 검사 | `DocumentRegistrationView.tsx` |
| **2** | 문서 일괄등록 | MIME 타입 검증 | `batch-upload/utils/fileValidation.ts` (자체 모듈 사용 중) |

### 7.4 원인 분석

**일괄등록**은 `shared/lib/fileValidation` 공통 모듈이 **아닌** 자체 `batch-upload/utils/fileValidation.ts`를 사용 중:
- 공통 모듈: 확장자 + 크기 + **MIME**
- 자체 모듈: 확장자 + 크기만 (MIME 없음)

두 기능이 **서로 다른 검증 모듈**을 사용하고 있어서 검증 로직이 불일치함.

### 7.5 수정 계획

| # | 대상 | 수정 내용 |
|---|------|----------|
| 1 | `DocumentRegistrationView.tsx` | 중복 파일 검사 추가 (`duplicateChecker.ts` 재사용) |
| 2 | `BatchDocumentUploadView.tsx` | 공통 모듈 `validateFiles()` 사용으로 전환 (MIME 검증 포함) |

### 7.6 수정 상태
- **시작일시**: 2025-12-14
- **상태**: ✅ 완료
- **구현 내용**:
  - [x] 새 문서 등록에 중복 파일 검사 추가 (`DocumentRegistrationView.tsx`)
    - `duplicateChecker.ts` 재사용 (SHA-256 해시 기반)
    - 고객 선택 시 기존 파일 해시 조회 후 중복 검사
    - 중복 발견 시 경고 로그 + 업로드 건너뜀
  - [x] 문서 일괄등록에 MIME 타입 검증 추가 (`batch-upload/utils/fileValidation.ts`)
    - 자체 모듈 → 공통 모듈(`@/shared/lib/fileValidation`) 사용으로 전환
    - 하위 호환성 유지 (기존 export 그대로)
- **테스트 결과**:
  - [x] typecheck 통과
- **커밋 해시**: (사용자 승인 후 커밋)
- **완료일시**: 2025-12-14

### 7.7 수정 후 비교표

| 검증 단계 | 새 문서 등록 | 문서 일괄등록 |
|-----------|:------------:|:------------:|
| **1. 확장자 검증** | ✅ | ✅ |
| **2. 파일 크기 검증** (50MB) | ✅ | ✅ |
| **3. MIME 타입 검증** | ✅ | ✅ ← 추가됨 |
| **4. 스토리지 용량 검사** | ✅ | ✅ |
| **5. 바이러스 검사** (ClamAV) | ✅ | ✅ |
| **6. 중복 파일 검사** (SHA-256) | ✅ ← 추가됨 | ✅ |

---

## 8. Phase 8: 파일 검증 로직 완전 통합

### 8.1 배경
Phase 7에서 버그를 수정했으나, 여전히 두 기능이 **서로 다른 모듈**을 사용하고 있어 100% 동일한 검증 결과를 보장할 수 없는 구조적 문제가 있었음.

### 8.2 목표
**같은 파일 → 100% 동일한 검증 결과** (바이러스 검사 제외)

### 8.3 개선 전 구조

```
새 문서 등록 (DocumentRegistrationView)
├── @/shared/lib/fileValidation (확장자, 크기, MIME)
├── @/shared/lib/fileValidation/storageChecker (스토리지)
└── @/features/batch-upload/utils/duplicateChecker (중복) ← 별도 모듈

문서 일괄등록 (BatchDocumentUploadView)
├── batch-upload/utils/fileValidation (re-export) ← 별도 모듈
├── @/shared/lib/fileValidation/storageChecker (스토리지)
└── @/features/batch-upload/utils/duplicateChecker (중복) ← 별도 모듈
```

### 8.4 개선 후 구조

```
공통 검증 모듈 (@/shared/lib/fileValidation)
├── validateFile() - 확장자, 크기, MIME
├── checkStorageWithInfo() - 스토리지
└── checkDuplicateFile() - 중복 ← 이동 완료!

새 문서 등록 → @/shared/lib/fileValidation 직접 사용
문서 일괄등록 → @/shared/lib/fileValidation 직접 사용
batch-upload/utils/* → 하위 호환성 re-export만
```

### 8.5 수정 파일

| # | 파일 | 작업 |
|---|------|------|
| 1 | `@/shared/lib/fileValidation/duplicateChecker.ts` | 신규 생성 (기존 코드 이동) |
| 2 | `@/shared/lib/fileValidation/index.ts` | duplicateChecker export 추가 |
| 3 | `batch-upload/utils/duplicateChecker.ts` | 공통 모듈 re-export로 변경 |
| 4 | `batch-upload/hooks/useBatchUpload.ts` | 공통 모듈 직접 import |
| 5 | `DocumentRegistrationView.tsx` | 공통 모듈 직접 import |

### 8.6 동일성 테스트 결과

테스트 파일: `@/shared/lib/fileValidation/__tests__/validationParity.test.ts`

```
✓ 파일 검증 동일성 테스트 (38 tests) 7ms
  ✓ 상수 동일성
    ✓ BLOCKED_EXTENSIONS가 완전히 동일해야 함
    ✓ ALLOWED_DOCUMENT_EXTENSIONS가 완전히 동일해야 함
  ✓ 유틸리티 함수 동일성
    ✓ getFileExtension 결과가 동일해야 함 (7 cases)
    ✓ isBlockedExtension 결과가 동일해야 함 (7 cases)
    ✓ isFileSizeValid 결과가 동일해야 함 (5 cases)
  ✓ validateFile 결과 동일성
    ✓ 유효한 파일: 양쪽 모두 valid=true (4 cases)
    ✓ 차단 확장자: 양쪽 모두 valid=false (3 cases)
    ✓ 크기 초과: 양쪽 모두 valid=false (2 cases)
  ✓ duplicateChecker 함수 동일성
    ✓ getUniqueFileName이 동일한 함수여야 함
    ✓ getUniqueFileName 결과 동일 (4 cases)
  ✓ 통합 시나리오 동일성
    ✓ 동일한 파일 세트에 대해 validateFiles 결과가 동일해야 함
    ✓ MIME 타입 불일치 파일에 대해 양쪽 모두 동일하게 처리해야 함
  ✓ 모듈 참조 동일성
    ✓ batch-upload/duplicateChecker는 shared 모듈을 re-export해야 함

Test Files  1 passed (1)
     Tests  38 passed (38)
```

### 8.7 최종 비교표

| 검증 단계 | 새 문서 등록 | 문서 일괄등록 | 사용 모듈 | 동일성 |
|-----------|:------------:|:------------:|-----------|:------:|
| **1. 확장자 검증** (위험 확장자 차단) | ✅ | ✅ | `@/shared/lib/fileValidation` | ✅ 동일 |
| **2. 파일 크기 검증** (50MB) | ✅ | ✅ | `@/shared/lib/fileValidation` | ✅ 동일 |
| **3. MIME 타입 검증** (확장자 위조 탐지) | ✅ | ✅ | `@/shared/lib/fileValidation` | ✅ 동일 |
| **4. 스토리지 용량 검사** | ✅ | ✅ | `@/shared/lib/fileValidation` | ✅ 동일 |
| **5. 바이러스 검사** (ClamAV) | ✅ | ✅ | 각 View 업로드 서비스 | ⚠️ 별도 |
| **6. 중복 파일 검사** (SHA-256 해시) | ✅ | ✅ | `@/shared/lib/fileValidation` | ✅ 동일 |

### 8.8 Import 경로 비교

| 함수 | 새 문서 등록 | 문서 일괄등록 |
|------|-------------|---------------|
| `validateFile` | `@/shared/lib/fileValidation` | `@/shared/lib/fileValidation` |
| `checkStorageWithInfo` | `@/shared/lib/fileValidation` | `@/shared/lib/fileValidation` |
| `checkDuplicateFile` | `@/shared/lib/fileValidation` | `@/shared/lib/fileValidation` |
| `getCustomerFileHashes` | `@/shared/lib/fileValidation` | `@/shared/lib/fileValidation` |

### 8.9 동일성 테스트 상세 결과

```
✓ 38 tests passed

상수 동일성:
  ✅ BLOCKED_EXTENSIONS === (참조 동일)
  ✅ ALLOWED_DOCUMENT_EXTENSIONS === (참조 동일)

함수 동일성:
  ✅ getFileExtension === (참조 동일)
  ✅ isBlockedExtension === (참조 동일)
  ✅ isFileSizeValid === (참조 동일)
  ✅ checkDuplicateFile === (참조 동일)
  ✅ getUniqueFileName === (참조 동일)

검증 결과 동일성:
  ✅ 유효한 파일 → 양쪽 valid=true
  ✅ 차단 확장자 → 양쪽 valid=false, reason=blocked_extension
  ✅ 크기 초과 → 양쪽 valid=false, reason=size_exceeded
  ✅ MIME 불일치 → 양쪽 동일 처리
```

### 8.10 결론

**같은 파일 → 100% 동일한 검증 결과** (바이러스 검사 제외)

바이러스 검사를 제외한 모든 검증이 **동일한 공통 모듈**(`@/shared/lib/fileValidation`)을 사용하여 100% 동일한 결과를 보장합니다.

---

## 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2025-12-13 | 보고서 초기 작성 | Claude Code |
| 2025-12-13 | Phase 1-3.5 완료 (acdec6a0) | Claude Code |
| 2025-12-13 | Phase 4 완료 (0890b2b8) | Claude Code |
| 2025-12-13 | Phase 5 완료 (140699a0) | Claude Code |
| 2025-12-14 | Phase 7 버그 발견 및 문서화 | Claude Code |
| 2025-12-14 | Phase 8 모듈 통합 및 동일성 테스트 완료 | Claude Code |
