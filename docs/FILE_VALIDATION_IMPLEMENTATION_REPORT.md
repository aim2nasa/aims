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

## 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2025-12-13 | 보고서 초기 작성 | Claude Code |
| 2025-12-13 | Phase 1-3.5 완료 (acdec6a0) | Claude Code |
| 2025-12-13 | Phase 4 완료 (0890b2b8) | Claude Code |
| 2025-12-13 | Phase 5 완료 (140699a0) | Claude Code |
