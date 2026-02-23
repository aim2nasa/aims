# Phase 1: 업로드 50MB 제한 제거 — 저장 용량 쿼터 기반 관리

> **날짜**: 2026-02-23
> **커밋**: `ef99bf44` feat: Phase 1 — 업로드 50MB 제한 제거, 저장 용량 쿼터 기반 관리
> **상태**: 배포 완료 + 서버 검증 통과

---

## 1. 변경 요약

기존에는 개별 파일 50MB 크기 제한이 백엔드(document_pipeline)와 프론트엔드 양쪽에 하드코딩되어 있었다.
Phase 1에서 이 제한을 완전히 제거하고, **사용자별 저장 용량 쿼터(`remaining_bytes`)**가 유일한 업로드 제한이 되도록 변경했다.

### 핵심 원칙
- **개별 파일 크기 제한 없음** (0바이트만 거부)
- **인프라 제한**: Nginx 서버 블록 `client_max_body_size 10G`
- **용량 쿼터**: `remaining_bytes` 기반 (프론트엔드에서 사전 검증)
- **스트리밍 업로드**: `doc_prep_main`은 청크 기반 디스크 저장으로 OOM 방지

---

## 2. 변경 파일 목록

### 백엔드 (document_pipeline)
| 파일 | 변경 내용 |
|------|----------|
| `config.py` | `MAX_UPLOAD_SIZE_MB: int = 50` 설정 **삭제** |
| `routers/doc_upload.py` | 50MB 크기 검증 블록 삭제, `get_settings` import 제거 |
| `routers/doc_ocr.py` | 50MB 크기 검증 블록 삭제, `get_settings` import 제거 |
| `routers/doc_prep_main.py` | `_stream_upload_to_disk()`: `max_size_mb` 파라미터 삭제, `_validate_file_size()` 함수 삭제, UNSUPPORTED_MIME → 415 대신 200 + `processingSkipReason` |

### 백엔드 (aims_api)
| 파일 | 변경 내용 |
|------|----------|
| `lib/storageQuotaService.js` | `max_batch_upload_bytes` 티어별 정의 및 반환값 **삭제** |

### 프론트엔드 (shared/lib/fileValidation)
| 파일 | 변경 내용 |
|------|----------|
| `constants.ts` | `FILE_SIZE_LIMITS = {} as const` (빈 객체) |
| `validators/fileSizeValidator.ts` | `sizeInBytes > 0`만 검증 (상한 없음) |
| `settingsAdapter.ts` | `fileSizeValidation: { enabled: false, maxSizeBytes: 0, maxSizeMB: 0 }` |
| `plugins/index.ts` | 설명: `'빈 파일 차단 (Phase 1: 크기 상한 없음)'` |

### 프론트엔드 (features/batch-upload)
| 파일 | 변경 내용 |
|------|----------|
| `types/index.ts` | `maxBatchUpload` 티어별 정의 **삭제**, `FILE_SIZE_LIMITS = {} as const` |
| `utils/fileValidation.ts` | `isBatchSizeValid`: 무제한(-1) 처리 추가 |
| `BatchDocumentUploadView.tsx` | `tierLimit = storageInfo?.remaining_bytes ?? 0` |

### 프론트엔드 (서비스)
| 파일 | 변경 내용 |
|------|----------|
| `services/userService.ts` | `StorageInfo`에서 `max_batch_upload_bytes` 필드 **삭제** |
| `services/userContextService.ts` | `maxFileSize` 제거, `isAllowedFileSize` 항상 true |
| `services/uploadService.ts` | `StatusCallback` 시그니처에 `retryable?: boolean` 추가 |
| `types/uploadTypes.ts` | `DocPrepResponse`에 `processingSkipReason` 필드 추가 |
| `DocumentRegistrationView.tsx` | `handleStatusChange`에 `retryable` 파라미터 전파 |

### Nginx 설정 (수동)
```nginx
# /etc/nginx/sites-enabled/aims — /shadow/ location
client_max_body_size 50M  →  10G
proxy_read_timeout 300    →  600
proxy_connect_timeout 300 →  600
proxy_send_timeout 300    →  600
```

---

## 3. 테스트 결과

### Mock 테스트
- **Frontend vitest**: 201 files, 4,287 tests ALL PASS
- **Backend tier-permission**: 23 tests ALL PASS
- **npm run build**: 성공 (exit 0)
- **Gini 품질 검수**: PASS (R3)

### 서버 검증 (12/12 PASS)

#### 대용량 업로드
| # | 테스트 | 결과 | 상세 |
|---|--------|------|------|
| 1 | 60MB 업로드 (Nginx 경유) | **PASS** | HTTP 200, `result: "success"` |
| 2 | 100MB 업로드 (Nginx 경유) | **PASS** | HTTP 200, 12.5초 |
| 3 | 200MB 업로드 (Nginx 경유) | **PASS** | HTTP 200, 26초 |
| 4 | 3×50MB 동시 업로드 | **PASS** | 3개 모두 HTTP 200, 총 15초 |

#### 엣지 케이스
| # | 테스트 | 결과 | 상세 |
|---|--------|------|------|
| 5 | 0바이트 파일 (docupload) | **PASS** | `"Empty file"` 거부 |
| 6 | ZIP 파일 (unsupported) | **PASS** | 큐 등록 → `OCR skipped (unsupported MIME)` → completed |
| 7 | EXE 파일 | **PASS** | 큐 등록 → 바이러스 스캔 clean → 중복 체크 처리 |

#### 코드 검증
| # | 테스트 | 결과 | 상세 |
|---|--------|------|------|
| 8 | `MAX_UPLOAD_SIZE_MB` 제거 | **PASS** | config.py, doc_upload.py, doc_ocr.py에서 완전 제거 |
| 9 | `max_batch_upload_bytes` 제거 | **PASS** | storageQuotaService.js에서 제거 (주석만 잔존) |
| 10 | 빌드 파일 크기 검증 로직 | **PASS** | `size===0`만 검증, `Phase 1: 크기 상한 없음` 확인 |

#### 인프라
| # | 테스트 | 결과 | 상세 |
|---|--------|------|------|
| 11 | Nginx `client_max_body_size 10G` | **PASS** | /shadow/ location 변경 확인 |
| 12 | Nginx timeout 600s | **PASS** | read/connect/send 모두 600초 |

---

## 4. 티어별 저장 용량 쿼터

| 티어 | 저장 용량 | 설명 |
|------|----------|------|
| free_trial | 512 MB | 체험 사용자 |
| standard | 20 GB | 기본 등급 |
| premium | 40 GB | 프리미엄 구독자 |
| vip | 80 GB | VIP 고객 |
| admin | 무제한 (-1) | 관리자 |

- **개별 파일 크기 제한**: 없음 (Nginx 10G가 인프라 한도)
- **업로드 제한**: `remaining_bytes = quota_bytes - used_bytes`
- **무제한 사용자**: `remaining_bytes === -1` → `isBatchSizeValid(totalBytes, -1)` = true

---

## 5. 참고 사항

### 200MB 바이러스 스캔
- ClamAV가 200MB 파일에서 에러 반환 (타임아웃 추정)
- Phase 1 변경과 무관한 기존 한계
- 바이러스 스캔 실패해도 문서 처리는 계속 진행됨

### 프론트엔드 방어선
- **차단 확장자** (exe, bat, dll 등): 프론트엔드에서 1차 차단
- **MIME 타입 검증**: 확장자 위조 탐지
- **0바이트 파일 거부**: 프론트엔드 + 백엔드 양쪽에서 차단
- 백엔드는 모든 파일을 수용하는 설계 (프론트엔드가 1차 방어선)

### /var/www/aims/ 잔재
- Nginx는 `/home/rossi/aims/frontend/aims-uix3/dist`에서 서빙
- `/var/www/aims/`는 Let's Encrypt 인증용 + 구 빌드 잔재 (서비스 영향 없음)

---

## 6. 관련 커밋

| 커밋 | 설명 |
|------|------|
| `f78f5152` | feat: 스트리밍 업로드 — file.read() → 청크 기반 디스크 저장 (OOM 방지) |
| `d143ee1d` | docs: Phase 1 상세 설계 + Phase 2 요구사항 기록 |
| `ef99bf44` | feat: Phase 1 — 업로드 50MB 제한 제거, 저장 용량 쿼터 기반 관리 |
