# AIMS 문서 업로드 처리 흐름 분석

> 작성일: 2026-01-06
> 목적: 대량 문서 업로드 요청 처리 현황 파악 및 개선 방향 검토
> 상태: 현황 분석 완료, 구현 시기 미정

---

## 목차

1. [개요](#1-개요)
2. [현재 아키텍처](#2-현재-아키텍처)
3. [프론트엔드 분석](#3-프론트엔드-분석)
4. [백엔드 분석 (aims_api)](#4-백엔드-분석-aims_api)
5. [n8n 워크플로우 분석](#5-n8n-워크플로우-분석)
6. [FastAPI (document_pipeline) 분석](#6-fastapi-document_pipeline-분석)
7. [Shadow Mode 분석](#7-shadow-mode-분석)
8. [병목 지점 분석](#8-병목-지점-분석)
9. [현재 시스템 평가](#9-현재-시스템-평가)
10. [개선 방안](#10-개선-방안)
11. [핵심 파일 목록](#11-핵심-파일-목록)
12. [결론](#12-결론)

---

## 1. 개요

### 1.1 분석 목적

AIMS 시스템의 문서 업로드 처리 흐름을 프론트엔드부터 백엔드까지 전체 분석하여:
- 대량 요청 시 시스템 부하(CPU/메모리)를 최소화
- DB 또는 파일시스템을 활용한 큐잉으로 순차 처리 구조 설계
- 효율적인 리소스 관리 방안 수립

### 1.2 분석 범위

| 영역 | 대상 |
|------|------|
| 프론트엔드 | `aims-uix3` (React + TypeScript) |
| 백엔드 API | `aims_api` (Node.js + Express) |
| 워크플로우 | `n8n` (워크플로우 자동화) |
| Python API | `document_pipeline` (FastAPI) |
| 메시지 큐 | Redis Stream |
| 데이터베이스 | MongoDB |

---

## 2. 현재 아키텍처

### 2.1 전체 처리 흐름도

```
┌─────────────────────────────────────────────────────────────────────┐
│  프론트엔드 (React)                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  uploadQueueRef (메모리)  ←── 최대 3개 병렬 업로드              ││
│  │  - 배치: useBatchUpload.ts                                       ││
│  │  - 개별: uploadService.ts                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│                              ▼                                       │
│             POST /shadow/docprep-main (multipart/form-data)         │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Nginx Reverse Proxy                                                 │
│  /shadow/* → document_pipeline:8100                                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  document_pipeline (FastAPI :8100) - Shadow Mode                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  ServiceMode: N8N | FASTAPI | SHADOW (현재)                     ││
│  │                                                                  ││
│  │  SHADOW Mode:                                                    ││
│  │  ├─ asyncio.gather로 n8n + FastAPI 병렬 호출                    ││
│  │  ├─ 응답 비교 후 불일치 시 MongoDB 기록                         ││
│  │  └─ n8n 응답 반환 (기본)                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────┐
│  n8n (워크플로우 :5678)      │   │  FastAPI (직접 처리)                 │
│  ┌─────────────────────────┐│   │  ┌─────────────────────────────────┐│
│  │  DocPrepMain            ││   │  │  doc_prep_main.py               ││
│  │  ├─ DocUpload           ││   │  │  ├─ 파일 저장                   ││
│  │  ├─ DocMeta             ││   │  │  ├─ 메타데이터 추출             ││
│  │  └─ Redis Stream enqueue││   │  │  └─ Redis Stream enqueue        ││
│  └─────────────────────────┘│   │  └─────────────────────────────────┘│
│                             │   │                                     │
│  ┌─────────────────────────┐│   │  ┌─────────────────────────────────┐│
│  │  OCRWorker (5초 폴링)   ││   │  │  OCR Worker (동일 Redis 큐)     ││
│  │  - COUNT 1 (순차 처리)  ││   │  │  - 단일 워커                     ││
│  │  - 단일 워커 (worker-1) ││   │  └─────────────────────────────────┘│
│  └─────────────────────────┘│   │                                     │
└─────────────────────────────┘   └─────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  aims_api (Node.js :3010)                                            │
│  POST /api/webhooks/document-processing-complete                     │
│  ├─ overallStatus 업데이트                                          │
│  ├─ SSE 알림 발송 (3채널)                                           │
│  └─ Qdrant 동기화                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 저장 위치

| 구간 | 저장 위치 | 지속성 | 설명 |
|------|----------|--------|------|
| 프론트엔드 큐 | `uploadQueueRef` (useRef) | ❌ 휘발성 | 브라우저 새로고침 시 손실 |
| 배치 세션 | sessionStorage | ⚠️ 탭 유지 | Preview만 복원, 파일 내용 없음 |
| 업로드된 파일 | 디스크 (`/data/files/`) | ✅ 영구 | 실제 파일 저장 |
| 문서 메타데이터 | MongoDB (`files` 컬렉션) | ✅ 영구 | 문서 정보 저장 |
| OCR 대기열 | Redis Stream (`ocr_stream`) | ✅ 영구 | OCR 처리 큐 |
| 중복 검사 해시 | `customerHashCacheRef` (useRef) | ❌ 휘발성 | 세션 중 캐싱 |

---

## 3. 프론트엔드 분석

### 3.1 업로드 시스템 종류

AIMS 프론트엔드에는 **두 가지 업로드 시스템**이 존재:

| 시스템 | 파일 | 용도 | 특징 |
|--------|------|------|------|
| **배치 업로드** | `features/batch-upload/hooks/useBatchUpload.ts` | 폴더 기반 다중 고객 문서 일괄 등록 | 폴더명=고객명 자동 매칭 |
| **개별 업로드** | `DocumentRegistrationView/services/uploadService.ts` | 단일 고객 문서 등록 | 고객 수동 선택 |

### 3.2 배치 업로드 상세 분석

#### 3.2.1 파일 구조

```
features/batch-upload/
├── BatchDocumentUploadView.tsx          # 메인 UI 컨테이너
├── hooks/
│   └── useBatchUpload.ts               # 핵심 상태 관리 (업로드 큐 + 중복 검사)
├── api/
│   └── batchUploadApi.ts               # API 클라이언트
├── components/
│   ├── FolderDropZone.tsx              # 폴더 드래그앤드롭 UI
│   ├── MappingPreview.tsx              # 폴더-고객 매칭 확인 UI
│   ├── UploadProgress.tsx              # 실시간 진행률 표시
│   └── UploadSummary.tsx               # 완료 요약
├── utils/
│   ├── customerMatcher.ts              # 폴더명과 고객명 자동 매칭
│   └── fileValidation.ts               # 파일 검증
└── types/
    └── index.ts                         # 타입 정의
```

#### 3.2.2 처리 흐름 (4단계)

```
1️⃣ SELECT 단계: 폴더 선택
   └─> FolderDropZone에서 폴더 드래그/선택
   └─> 파일을 폴더별로 그룹화

2️⃣ PREVIEW 단계: 매칭 확인
   └─> 폴더명 ↔ 고객명 자동 매칭 (100% 정확 일치)
   └─> 사용자가 수동으로 수정 가능
   └─> 스토리지 용량/배치 한도 체크

3️⃣ UPLOAD 단계: 실제 업로드
   └─> useBatchUpload Hook이 큐 관리
   └─> 최대 3개 병렬 업로드
   └─> 중복 검사 + 바이러스 검사
   └─> 진행률 실시간 표시

4️⃣ COMPLETE 단계: 완료 요약
   └─> 성공/실패/건너뜀 통계
   └─> 실패한 파일만 재시도 가능
```

#### 3.2.3 동시 업로드 처리 코드

**useBatchUpload.ts 핵심 로직**:

```typescript
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_RETRY_COUNT = 3;

const processQueue = useCallback(async (mappings: FolderMapping[]) => {
  // 1️⃣ 파일 상태 초기화
  const initialFiles: FileUploadState[] = [];
  mappings.forEach(mapping => {
    mapping.files.forEach(file => {
      initialFiles.push({
        fileId: generateFileId(),
        fileName: file.name,
        folderName: mapping.folderName,
        customerId: mapping.customerId,
        status: 'pending',
        progress: 0,
        retryCount: 0
      });
    });
  });

  // 2️⃣ 고객별 해시 캐시 미리 로드 (중복 검사용)
  const customerIds = [...new Set(initialFiles.map(f => f.customerId))];
  await Promise.all(
    customerIds.map(customerId => getCustomerFileHashes(customerId))
  );

  // 3️⃣ 동시 업로드 처리 (최대 3개 병렬)
  const activeUploads: Promise<void>[] = [];

  for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
    activeUploads.push(processNextFile());  // 워커 시작
  }

  await Promise.all(activeUploads);
}, [...]);
```

**processNextFile 워커 로직**:

```typescript
const processNextFile = async () => {
  while (true) {
    // ✓ 취소/일시정지 확인
    if (isCancelled || isPaused) break;

    // ✓ 다음 파일 가져오기 (race condition 방지)
    const nextFile = uploadQueueRef.current.find(
      f => f.status === 'pending' && f.retryCount < MAX_RETRY_COUNT
    );
    if (!nextFile) return;

    nextFile.status = 'checking';  // 즉시 상태 변경

    // ✓ 중복 파일 검사 (SHA-256 해시 기반)
    const duplicateResult = await checkDuplicateFile(file, existingHashes);

    if (duplicateResult.isDuplicate) {
      // → 사용자에게 결정 대기 (skip/replace)
      const action = await waitForDuplicateDecision(duplicateInfo);
      if (action === 'skip') {
        nextFile.status = 'skipped';
        continue;
      }
    }

    // ✓ 바이러스 검사 (ClamAV)
    const scanResult = await scanFile(file);
    if (scanResult.infected) {
      nextFile.status = 'failed';
      nextFile.error = `🛡️ 바이러스 감지: ${scanResult.virusName}`;
      continue;  // 바이러스는 재시도 안 함
    }

    // ✓ 실제 업로드
    const result = await uploadSingleFile(nextFile, file);

    if (result.success) {
      nextFile.status = 'completed';
      // 해시 캐시 업데이트
      customerHashCacheRef.current.get(customerId).push({
        documentId: result.fileId,
        fileName: file.name,
        fileHash: duplicateResult.newFileHash
      });
    } else {
      // 일반 에러: 재시도
      nextFile.retryCount++;
      if (nextFile.retryCount < MAX_RETRY_COUNT) {
        nextFile.status = 'pending';
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        nextFile.status = 'failed';
      }
    }
  }
};
```

#### 3.2.4 병렬 처리 메커니즘

```
[워커 1] [워커 2] [워커 3]
   ↓        ↓        ↓
[큐] ← processNextFile() ← uploadQueueRef
   ↓        ↓        ↓
[파일1]  [파일2]  [파일3]  [파일4] [파일5] ...
업로드   업로드   업로드   대기    대기

특징:
- uploadQueueRef: 업로드할 파일 상태 배열
- abortControllersRef: 각 파일의 XMLHttpRequest 취소 제어
- Race condition 방지: nextFile.status = 'checking' 즉시 변경
```

#### 3.2.5 진행 상태 관리

```typescript
interface BatchUploadProgress {
  state: 'idle' | 'uploading' | 'paused' | 'completed' | 'cancelled';
  totalFolders: number;
  completedFolders: number;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  currentFolder?: string;
  currentFile?: string;
  overallProgress: number;        // 0-100
  folders: FolderUploadState[];   // 폴더별 진행 상황
  files: FileUploadState[];       // 파일별 상태 (500개 파일도 관리)
  startedAt?: Date;
  completedAt?: Date;
  duplicateState: DuplicateState;
}
```

#### 3.2.6 세션 상태 보존

```typescript
// sessionStorage 자동 저장 (미리보기 단계에서)
const saved: SerializedState = {
  step: 'preview',
  customers: [...],
  folderMappingsMetadata: [
    {
      folderName: "홍길동",
      customerId: "123",
      customerName: "홍길동",
      matched: true,
      fileCount: 3,
      totalSize: 512000,
      serializedFiles: [  // File 객체 대신 메타데이터만
        { name: "계약서.pdf", size: 200000, webkitRelativePath: "홍길동/계약서.pdf" }
      ]
    }
  ],
  expandedPaths: ["홍길동"],
  savedAt: "2025-01-06T10:30:00.000Z"
};

sessionStorage.setItem('aims-batch-upload-state', JSON.stringify(saved));

// 새로고침 후 복원:
// - 메타데이터로 가짜 File 객체 생성 (isPlaceholder: true)
// - Preview 화면만 복원 가능 (실제 파일 내용 없으므로 업로드 불가)
// - 사용자가 "폴더 다시 선택"해야 업로드 진행 가능
```

### 3.3 개별 업로드 상세 분석

#### 3.3.1 UploadService 클래스

```typescript
export class UploadService {
  // 1️⃣ 상태 관리
  private activeUploads = new Map<string, AbortController>();  // 진행 중인 업로드
  private uploadQueue: UploadFile[] = [];                      // 대기 중인 파일
  private isProcessing = false;                                // 큐 처리 중 여부

  // 2️⃣ 콜백 관리 (owner별 단일 콜백 - HMR 중복 방지)
  private progressCallbacks = new Map<string, ProgressCallback>();
  private statusCallbacks = new Map<string, StatusCallback>();

  // 3️⃣ 파일 큐에 추가
  async queueFiles(files: UploadFile[]): Promise<void> {
    this.uploadQueue.push(...files);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  // 4️⃣ 큐 처리 (동시 3개 제한)
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
      // 동시 업로드 제한 확인
      while (
        this.activeUploads.size < 3 &&  // 최대 3개 병렬
        this.uploadQueue.length > 0
      ) {
        const file = this.uploadQueue.shift()!;
        this.uploadFile(file);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  // 5️⃣ 개별 파일 업로드
  private async uploadFile(uploadFile: UploadFile): Promise<void> {
    // a) 바이러스 검사
    const scanResult = await scanFile(uploadFile.file);
    if (scanResult.infected) {
      this.statusCallbacks.forEach(cb =>
        cb(uploadFile.id, 'error', `🛡️ 바이러스 감지: ${scanResult.virusName}`)
      );
      return;
    }

    // b) FormData 생성
    const formData = UserContextService.createFormData(uploadFile.file);
    if (uploadFile.customerId) {
      formData.append('customerId', uploadFile.customerId);
    }

    // c) 진행률 추적 XHR 업로드
    const result = await this.uploadWithProgress(
      formData,
      uploadFile.id,
      controller.signal
    );

    // d) 응답 분석 및 SSE 알림
    if (result.success) {
      this.notifyDocumentUploaded(customerId, documentId, fileName);
    }
  }

  // 6️⃣ 진행률 추적 (XHR 사용)
  private uploadWithProgress(
    formData: FormData,
    fileId: string,
    signal: AbortSignal
  ): Promise<DocPrepResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // 진행률 이벤트
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          this.progressCallbacks.forEach(cb => cb({
            fileId,
            progress,
            loaded: event.loaded,
            total: event.total
          }));
        }
      });

      xhr.open('POST', uploadConfig.endpoints.upload);
      xhr.timeout = 5 * 60 * 1000;  // 5분
      xhr.send(formData);
    });
  }
}
```

### 3.4 프론트엔드 엔드포인트 설정

**userContextService.ts**:

```typescript
export const uploadConfig = {
  endpoints: {
    // 항상 Shadow Mode 경유 업로드 (n8n + FastAPI 병렬 비교, n8n 응답 반환)
    upload: 'https://aims.giize.com/shadow/docprep-main'
  },
  maxFileSize: 50 * 1024 * 1024,  // 50MB
  allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.hwp', '.jpg', '.png', ...],
  blockedExtensions: ['.exe', '.dll', '.bat', '.cmd', '.sh', '.ps1', ...]
};
```

### 3.5 보안 기능

| 기능 | 구현 | 설명 |
|------|------|------|
| 파일 크기 제한 | `validateFile()` | 50MB 제한 |
| 확장자 검증 | `validateFile()` | 위험 확장자 차단 (.exe, .dll 등) |
| MIME 타입 검증 | `validateFile()` | 확장자 위조 탐지 |
| 중복 검사 | `checkDuplicateFile()` | SHA-256 해시 기반 |
| 바이러스 검사 | `scanFile()` | ClamAV 연동 |

### 3.6 두 시스템 비교

| 기능 | 배치 업로드 | 개별 업로드 |
|------|----------|---------|
| **사용 시나리오** | 여러 고객의 문서 대량 등록 | 단일 고객의 문서 등록 |
| **폴더 구조** | 필수 (폴더 = 고객) | 선택사항 |
| **고객 매칭** | 자동 (폴더명으로) | 수동 (드롭다운) |
| **동시 업로드** | 3개 병렬 | 3개 병렬 |
| **중복 검사** | SHA-256 해시 | 미포함 |
| **바이러스 검사** | ClamAV | ClamAV |
| **상태 보존** | sessionStorage | 메모리 |
| **재시도** | 최대 3회 (바이러스 제외) | 미포함 |
| **일시정지/재개** | ✓ | ✗ |
| **취소 기능** | ✓ | ✓ |

---

## 4. 백엔드 분석 (aims_api)

### 4.1 주요 API 엔드포인트

| 엔드포인트 | 메서드 | 용도 | 인증 |
|-----------|--------|------|------|
| `/api/n8n/docprep` | POST | n8n 프록시 (문서 업로드) | JWT |
| `/api/n8n/smartsearch` | POST | Shadow Mode 검색 프록시 | JWT |
| `/api/customers/:id/documents` | POST | 고객에 문서 연결 | JWT |
| `/api/webhooks/document-processing-complete` | POST | OCR 완료 콜백 | API Key |
| `/api/personal-files/upload` | POST | 개인 파일 업로드 | x-user-id |
| `/api/documents/check-hash` | POST | 해시 중복 검사 | JWT |
| `/api/documents/status-list/stream` | GET | SSE 문서 목록 스트림 | JWT |
| `/api/documents/:id/status-stream` | GET | SSE 개별 문서 스트림 | JWT |
| `/api/customers/:id/documents/stream` | GET | SSE 고객 문서 스트림 | JWT |

### 4.2 파일 저장 경로 구조

```
/data/files/
├── users/
│   └── {userId}/
│       └── YYYY/
│           └── MM/
│               └── {timestamp}_{random}.{ext}   # 문서 파일
│       └── myfiles/                              # 개인 파일 저장소
│           ├── file1.docx
│           └── ...
├── documents/
│   └── {documentId}/
│       ├── original.docx     # 원본 파일
│       └── converted.pdf     # PDF 변환 결과
└── inquiries/                # 문의 첨부파일
    └── {inquiryId}/
        └── attachments/
```

### 4.3 Multer 저장 설정

```javascript
// 개인 파일 (diskStorage 사용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user.userId;
    const storagePath = `/data/files/users/${userId}/myfiles`;
    cb(null, storagePath);
  },
  filename: (req, file, cb) => {
    // UTF-8 인코딩 변환 (한글 깨짐 방지)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }  // 100MB 제한
});

// PDF 변환용 (memoryStorage 사용 - 프록시)
const upload = multer({ storage: multer.memoryStorage() });
```

### 4.4 n8n 프록시 코드

**server.js (라인 10625-10645)**:

```javascript
const N8N_INTERNAL_URL = 'http://localhost:5678';
const DOCUMENT_PIPELINE_URL = 'http://localhost:8100';

// 문서 업로드 프록시
app.post('/api/n8n/docprep', authenticateJWT, async (req, res) => {
  console.log(`[n8n Proxy] docprep 요청 - userId: ${req.user.userId}`);

  const response = await axios.post(
    `${N8N_INTERNAL_URL}/webhook/docprep-main`,
    {
      ...req.body,
      userId: req.user.userId
    },
    { timeout: 120000 }  // 2분 타임아웃
  );

  res.json(response.data);
});

// Smart Search 프록시 (Shadow Mode)
app.post('/api/n8n/smartsearch', authenticateJWT, async (req, res) => {
  const response = await axios.post(
    `${DOCUMENT_PIPELINE_URL}/shadow/smart-search`,
    {
      ...req.body,
      userId: req.user.userId
    }
  );

  res.json(response.data);
});
```

### 4.5 문서 처리 완료 웹훅

**server.js (라인 8003-8260)**:

```javascript
app.post('/api/webhooks/document-processing-complete', async (req, res) => {
  const { document_id, status, owner_id, ocr_full_text, ocr_confidence } = req.body;

  // API Key 인증 (n8n에서 호출)
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8') {
    return res.status(401).json({ success: false, error: '인증 실패' });
  }

  // 문서 조회
  const doc = await db.collection('files').findOne({ _id: new ObjectId(document_id) });

  // overallStatus 결정
  // 임베딩까지 완료되어야 'completed' 처리
  let newOverallStatus = 'processing';

  if (doc.docembed && (doc.docembed.status === 'done' || doc.docembed.status === 'skipped')) {
    newOverallStatus = 'completed';
  }

  // DB 업데이트
  await db.collection('files').updateOne(
    { _id: new ObjectId(document_id) },
    {
      $set: {
        overallStatus: newOverallStatus,
        'ocr.full_text': ocr_full_text,
        'ocr.confidence': ocr_confidence,
        'ocr.done_at': new Date().toISOString()
      }
    }
  );

  // SSE 알림 발송 (3채널)
  // 1. documentStatusSSEClients - 개별 문서 진행 상황
  // 2. documentListSSEClients - 사용자의 문서 목록 변경
  // 3. customerDocSSEClients - 고객에 연결된 문서 변경
  await notifyDocumentStatusChange(document_id, owner_id, newOverallStatus);

  res.json({ success: true, message: 'SSE 알림이 전송되었습니다.' });
});
```

### 4.6 고객 문서 연결 + PDF 변환

```javascript
app.post('/api/customers/:id/documents', async (req, res) => {
  const { id } = req.params;
  const { document_id, notes } = req.body;

  // 1. 중복 파일 검사
  const newFileHash = document.meta?.file_hash;
  const duplicateDoc = await db.collection('files').findOne({
    _id: { $in: existingDocIds },
    'meta.file_hash': newFileHash
  });

  // 2. 문서 연결
  await db.collection('customers').updateOne(
    { _id: new ObjectId(id) },
    { $push: { documents: { document_id, upload_date: new Date(), notes } } }
  );

  // 3. PDF 변환 트리거 (Office 문서인 경우)
  const pdfResult = await triggerPdfConversionIfNeeded(document);

  // 4. Qdrant 동기화 (벡터DB)
  await syncQdrantCustomerRelation(document_id, id);

  // 5. AR 파싱 큐 추가
  await db.collection('ar_parse_queue').updateOne(
    { file_id: new ObjectId(document_id) },
    { $setOnInsert: queueDoc },
    { upsert: true }
  );

  res.json({
    success: true,
    message: '문서가 고객에게 연결되었습니다.',
    pdf_conversion: pdfResult
  });
});

// PDF 변환 트리거
async function triggerPdfConversionIfNeeded(document) {
  // 변환 가능 여부 확인
  if (!pdfConversionService.isConvertible(originalName)) {
    return 'not_required';  // PDF, 이미지 등은 변환 불필요
  }

  // 상태 업데이트: pending
  await db.collection('files').updateOne(
    { _id: document._id },
    { $set: { 'upload.conversion_status': 'pending' } }
  );

  // 백그라운드 변환 시작 (비동기 - await 없음)
  convertDocumentInBackground(document._id, destPath);

  return 'triggered';
}
```

### 4.7 동시 요청 처리 방식

**현재**: Job Queue 없이 직접 비동기 처리

```javascript
// 백그라운드 PDF 변환 (await 없음)
convertDocumentInBackground(document._id, destPath);

// → 문제점: 대량 요청 시 버퍼링 없이 모두 즉시 처리 시도
// → 서버 과부하 위험
```

---

## 5. n8n 워크플로우 분석

### 5.1 워크플로우 목록

| 워크플로우 | 트리거 | 역할 | 실행 방식 |
|-----------|--------|------|----------|
| **DocPrepMain** | Webhook `/docprep-main` | 입구점, 전체 조율 | HTTP 요청 |
| **DocUpload** | Webhook `/docupload` | 파일 수신 및 저장 | DocPrepMain에서 호출 |
| **DocMeta** | Webhook `/docmeta` | 메타데이터 추출 | DocPrepMain에서 호출 |
| **DocOCR** | Webhook `/dococr` | OCR 처리 (Upstage API) | OCRWorker에서 호출 |
| **OCRWorker** | Schedule (5초) | Redis 큐 폴링 OCR 처리 | 스케줄 트리거 |
| **DocSummary** | Webhook `/docsummary` | AI 요약 생성 (GPT-4) | DocOCR에서 호출 |
| **SmartSearch** | Webhook `/smartsearch` | 문서 검색 | 프론트엔드 요청 |
| **ErrorLogger** | Error Trigger | 에러 로깅 | 모든 워크플로우 에러 |

### 5.2 DocPrepMain 처리 흐름

```
사용자 업로드
    ↓
[DocPrepMain] (Webhook: /docprep-main)
    ├─ 병렬 처리 시작
    │
    ├─ 1️⃣ DocUpload (Webhook: /docupload)
    │   └─ 파일 저장: /data/files/users/{userId}/YYYY/MM/{timestamp}_{random}.{ext}
    │
    ├─ 2️⃣ Extract OwnerId & Save to MongoDB
    │   └─ files.{ownerId, customerId} 저장
    │
    ├─ 3️⃣ Connect to Customer (API)
    │   └─ POST /api/customers/{customerId}/documents
    │
    ├─ 4️⃣ DocMeta (Webhook: /docmeta)
    │   └─ enhanced_file_analyzer.js 실행
    │   └─ 파일 메타데이터 추출
    │
    └─ 5️⃣ OCR 분기
        ├─ [지원하지 않는 MIME] → 경고 + 종료
        ├─ [text/plain] → 즉시 텍스트 추출 + 저장
        └─ [PDF/이미지] → Redis Stream에 enqueue
```

### 5.3 OCR 처리 흐름 (OCRWorker)

```
[DocPrepMain]
    │
    ▼
Redis Stream XADD (ocr_stream)
    │ {
    │   file_id: "document_id",
    │   file_path: "/data/files/...",
    │   owner_id: "userId",
    │   queued_at: "2025-01-06T12:05:30.000Z"
    │ }
    │
    ▼ (5초마다 폴링)
[OCRWorker]
    ├─ 1. XREADGROUP GROUP ocr_consumer_group worker-1 COUNT 1 BLOCK 5000
    ├─ 2. 페이지 수 계산
    ├─ 3. OCR 한도 확인 (quota API)
    │      └─ 한도 초과 시: status = "quota_exceeded"
    ├─ 4. DocOCR 호출 (Webhook: /dococr)
    │      └─ Upstage API로 OCR 처리
    ├─ 5. DocSummary 호출 (Webhook: /docsummary)
    │      └─ OpenAI GPT-4로 요약 생성
    ├─ 6. MongoDB 업데이트
    │      └─ ocr.status, ocr.full_text, ocr.summary
    └─ 7. Redis 메시지 삭제 (XACK + XDEL)
```

### 5.4 OCR 워커 설정 (병목 지점)

```bash
# 현재 설정
redis-cli XREADGROUP GROUP ocr_consumer_group worker-1 COUNT 1 BLOCK 5000 STREAMS ocr_stream ">"
```

| 설정 | 값 | 의미 | 문제점 |
|------|-----|------|--------|
| Consumer Group | `ocr_consumer_group` | 메시지 추적용 | - |
| Consumer ID | `worker-1` | **단일 워커** | 확장성 제한 |
| COUNT | `1` | **한번에 1개만 처리** | 병목 |
| BLOCK | `5000` | 5초 대기 | - |

**결과**: OCR은 **순차 처리** (동시에 1개씩만) → 100개 문서 시 약 2시간 소요

### 5.5 에러 처리 및 재시도

| 워크플로우 | 에러 처리 | 재시도 | 상태 저장 |
|-----------|--------|------|---------|
| **DocUpload** | 400/500 응답 후 종료 | ❌ 없음 | `files.error` |
| **DocMeta** | 400/500 응답 후 종료 | ❌ 없음 | `files.error` |
| **DocOCR** | Upstage API 실패 → 정규화 | ❌ 없음 | `files.ocr.error` |
| **OCRWorker** | 에러 기록 후 Redis 삭제 | ❌ 없음 | `files.ocr.status=error` |
| **DocSummary** | 요약 실패해도 진행 | ❌ 없음 | `files.ocr.summary=null` |

**문제점**: n8n 설정이 `continueOnFail: true`로 되어 있어 에러 무시

### 5.6 문서 상태 흐름

```
초기 상태
  ↓
[업로드 완료] → upload.uploaded_at 저장
  ↓
[메타 추출 완료] → meta.* 저장
  ↓
분기:
  ├─ 지원하지 않는 MIME → 경고 후 종료
  ├─ text/plain → 즉시 텍스트 추출 후 종료
  └─ PDF/이미지 → ocr.status = "queued"
      ↓
    [Redis Queue] → ocr.queued_at 저장
      ↓
    [OCR 시작] → ocr.status = "running", ocr.started_at
      ↓
    [OCR 결과]
      ├─ 성공 → ocr.status = "done", ocr.done_at, ocr.full_text
      ├─ 한도 초과 → ocr.status = "quota_exceeded"
      └─ 실패 → ocr.status = "error", ocr.failed_at
      ↓
    [요약 생성] → meta.summary, meta.tags (별도 진행)
      ↓
    [완료] → overallStatus = "completed" → SSE 알림
```

---

## 6. FastAPI (document_pipeline) 분석

### 6.1 서비스 구조

```
document_pipeline/
├── main.py                          # FastAPI 앱 진입점
├── config.py                        # 설정 관리
├── middleware/
│   └── shadow_mode.py               # Shadow Mode 미들웨어
├── routers/
│   ├── shadow_router.py             # Shadow 라우터 + 모드 관리
│   ├── doc_prep_main.py             # 문서 처리 오케스트레이터
│   ├── doc_upload.py                # 파일 업로드
│   ├── doc_meta.py                  # 메타데이터 추출
│   ├── doc_ocr.py                   # OCR 처리
│   └── smart_search.py              # 검색
├── services/
│   ├── meta_service.py              # 메타데이터 서비스
│   ├── ocr_service.py               # OCR 서비스
│   └── storage_service.py           # 파일 저장 서비스
└── workers/
    └── ocr_worker.py                # OCR 백그라운드 워커
```

### 6.2 doc_prep_main.py

```python
@router.post("/docprep-main")
async def doc_prep_main(
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    source_path: Optional[str] = Form(None),
    shadow: bool = False,  # Shadow mode 플래그
    shadow_saved_name: Optional[str] = Form(None),
    shadow_created_at: Optional[str] = Form(None),
):
    """
    문서 처리 오케스트레이터

    Flow:
    1. MongoDB에 문서 생성
    2. 파일 저장
    3. 메타데이터 추출
    4. MIME 타입별 라우팅
       - PDF/이미지 → Redis 큐에 추가
       - 텍스트 → 즉시 처리
    """

    # Shadow mode: 문서 생성 없이 응답 시뮬레이션
    if shadow:
        logger.info(f"[SHADOW] Processing file for comparison (no DB write)")
        meta_result = await MetaService.extract_metadata(tmp_path)
        # n8n 값으로 교체
        meta_result["filename"] = shadow_saved_name
        return response_simulation

    # 일반 모드: 실제 처리
    # 1. 파일 저장
    saved_path = await StorageService.save_file(file, userId)

    # 2. MongoDB 문서 생성
    doc_id = await create_document(userId, customerId, saved_path)

    # 3. 메타데이터 추출
    meta = await MetaService.extract_metadata(saved_path)

    # 4. OCR 필요 여부 판단 후 Redis 큐 추가
    if requires_ocr(meta.mime_type):
        await enqueue_ocr(doc_id, saved_path)

    return {
        "success": True,
        "documentId": str(doc_id),
        "fileName": file.filename,
        "filePath": saved_path
    }
```

---

## 7. Shadow Mode 분석

### 7.1 서비스 모드

**shadow_mode.py**:

```python
class ServiceMode(Enum):
    """서비스 모드"""
    N8N = "n8n"           # n8n만 사용
    FASTAPI = "fastapi"   # FastAPI만 사용
    SHADOW = "shadow"     # 병렬 비교 모드 (현재)

class ShadowMode:
    """Shadow Mode 상태 관리 (싱글톤)"""
    service_mode: ServiceMode = ServiceMode.SHADOW  # 현재 운영 모드
```

### 7.2 Shadow Mode 동작

```python
async def shadow_call(
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> dict:
    """서비스 모드에 따라 호출 라우팅"""

    mode = ShadowMode.service_mode

    if mode == ServiceMode.N8N:
        # n8n만 호출
        response, elapsed_ms, status = await _call_n8n(
            client, workflow, request_data, files
        )
        return response

    elif mode == ServiceMode.FASTAPI:
        # FastAPI만 호출 (shadow=false)
        response, elapsed_ms, status = await _call_fastapi(
            client, workflow, request_data, files, shadow=False
        )
        return response

    else:  # SHADOW mode (현재)
        # 병렬 호출 및 비교
        return await _shadow_call_internal(...)
```

### 7.3 병렬 호출 및 비교

```python
async def _shadow_call_internal(
    client: httpx.AsyncClient,
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> dict:
    """
    n8n과 FastAPI를 병렬 호출

    Flow:
    1. asyncio.gather로 동시 호출
    2. 응답 비교 (compare_responses)
    3. n8n 응답 반환
    4. 불일치 시 MongoDB에 기록
    """

    # 병렬 호출
    n8n_task = asyncio.create_task(
        _call_n8n(client, workflow, request_data, files)
    )
    fastapi_task = asyncio.create_task(
        _call_fastapi(client, workflow, request_data, files, shadow=True)
    )

    # 병렬 실행
    results = await asyncio.gather(n8n_task, fastapi_task, return_exceptions=True)

    n8n_response, n8n_elapsed, n8n_status = results[0]
    fastapi_response, fastapi_elapsed, fastapi_status = results[1]

    # n8n 실패 시 FastAPI fallback
    if n8n_status == "error":
        if fastapi_status == "success":
            logger.warning(f"[SHADOW] n8n failed, using FastAPI fallback")
            return fastapi_response

    # 응답 비교
    if fastapi_status == "success":
        is_match, diffs = compare_responses(workflow, n8n_response, fastapi_response)

        if not is_match:
            # 불일치 DB 기록
            await _handle_mismatch(
                workflow, n8n_response, fastapi_response, diffs
            )

    # n8n 응답 반환 (기본)
    return n8n_response
```

### 7.4 모드 관리 엔드포인트

**shadow_router.py**:

```python
@router.get("/service-mode")
async def get_service_mode():
    """현재 서비스 모드 조회"""
    return {
        "mode": ShadowMode.service_mode.value,
        "available_modes": ["n8n", "fastapi", "shadow"]
    }

@router.post("/service-mode")
async def set_service_mode(request: ServiceModeRequest):
    """서비스 모드 변경 (런타임)"""
    new_mode = ServiceMode(request.mode)
    ShadowMode.service_mode = new_mode
    logger.info(f"[SHADOW] Service mode changed to: {new_mode.value}")
    return {"success": True, "mode": new_mode.value}
```

### 7.5 전환 판단 기준

```python
SWITCH_CRITERIA = {
    "min_calls": 100,              # 최소 100회 호출
    "match_rate_threshold": 99.0,  # 99% 이상 일치
    "error_rate_threshold": 1.0,   # 1% 이하 오류
    "observation_days": 7,         # 7일 관측
}
```

### 7.6 n8n vs FastAPI 비교

| 항목 | n8n | FastAPI |
|------|-----|---------|
| **처리 방식** | 워크플로우 노드 체인 | Python 코드 직접 실행 |
| **메모리 사용** | 노드당 버퍼링 | 스트리밍 가능 |
| **동시성** | 워크플로우당 1 실행 | asyncio 기반 동시 처리 |
| **확장성** | 워크플로우 복제 필요 | 워커 프로세스 추가 가능 |
| **모니터링** | n8n UI | 커스텀 로깅/메트릭 |
| **디버깅** | 노드별 로그 | Python 스택 트레이스 |
| **현재 상태** | SHADOW 모드로 병렬 호출 | SHADOW 모드로 병렬 호출 |

---

## 8. 병목 지점 분석

### 8.1 프론트엔드 병목

```
동시 업로드 제한: MAX_CONCURRENT_UPLOADS = 3
└─ 100개 파일 업로드 시 → 최소 34회 순차 처리 필요
└─ 각 파일 평균 3초 가정 → 약 100초 (1.7분)

메모리 큐 문제:
└─ uploadQueueRef는 useRef로 관리 (메모리)
└─ 브라우저 충돌/새로고침 시 업로드 상태 손실
└─ 복구 메커니즘 없음
```

### 8.2 백엔드 병목

```
Shadow Mode (현재):
├─ n8n + FastAPI 병렬 호출 → 2배 리소스 사용
├─ 각 요청이 즉시 처리 (버퍼링 없음)
├─ Rate limiting 없음
└─ 대량 요청 시 서버 부하 급증

OCR Worker:
├─ Redis XREADGROUP COUNT 1 (한번에 1개만)
├─ Consumer: worker-1 (단일 워커)
├─ Upstage API 호출당 ~5-30초 소요
└─ 100개 문서 OCR → 순차 처리 → 약 1-2시간
```

### 8.3 리소스 사용량 예측

| 시나리오 | CPU | 메모리 | 디스크 I/O | 예상 처리 시간 |
|---------|-----|--------|-----------|--------------|
| 10개 파일 동시 | 낮음 | 낮음 | 보통 | ~30초 |
| 100개 파일 동시 | **높음** | **높음** | **높음** | ~10분 (업로드) + ~2시간 (OCR) |
| 1000개 파일 동시 | **과부하** | **OOM 위험** | **병목** | ~2시간 (업로드) + ~20시간+ (OCR) |

### 8.4 처리 시간 분석

| 단계 | 평균 시간 | 병목 요소 |
|------|---------|----------|
| 파일 업로드 (프론트→서버) | 1-5초/파일 | 네트워크 대역폭, 파일 크기 |
| 메타 추출 | 200-1000ms | 파일 타입 분석 |
| OCR (Redis 대기) | 0-60초 | 큐 길이 |
| OCR 처리 (Upstage) | 5-30초 | API 응답 시간 |
| 요약 생성 (OpenAI) | 2-10초 | API 응답 시간 |
| **총합** | **7-100초/파일** | OCR 큐 길이 |

---

## 9. 현재 시스템 평가

### 9.1 강점

1. **프론트엔드 동시 업로드 제한** (MAX_CONCURRENT_UPLOADS = 3)
   - 브라우저 리소스 보호
   - 네트워크 과부하 방지
   - 사용자 경험 유지

2. **Redis Stream 기반 OCR 큐**
   - 메시지 영구 저장 (서버 재시작에도 안전)
   - Consumer Group으로 메시지 추적
   - Acknowledgment 메커니즘으로 손실 방지

3. **Shadow Mode로 안전한 전환 준비**
   - n8n → FastAPI 점진적 마이그레이션
   - 실시간 호환성 검증
   - 불일치 시 자동 기록 및 모니터링

4. **파일 검증 및 보안**
   - SHA-256 중복 검사
   - ClamAV 바이러스 검사
   - MIME 타입 검증 (확장자 위조 탐지)

5. **SSE 기반 실시간 알림**
   - 3채널 분리 (문서/목록/고객)
   - 처리 진행 상황 실시간 업데이트

### 9.2 약점

1. **프론트엔드 큐가 메모리 기반**
   - 브라우저 새로고침/충돌 시 업로드 상태 손실
   - 복구 메커니즘 없음
   - sessionStorage는 Preview 단계만 복원

2. **백엔드에 요청 버퍼링 없음**
   - 대량 요청 시 서버 과부하
   - Rate limiting 없음
   - 모든 요청 즉시 처리 시도

3. **OCR 단일 워커**
   - 대량 문서 처리 시 심각한 병목
   - Redis Consumer Group이 worker-1만 사용
   - 확장성 제한

4. **Shadow Mode 리소스 낭비**
   - n8n + FastAPI 동시 호출로 2배 리소스 사용
   - 전환 완료 전까지 지속
   - 서버 부하 증가

5. **재시도 메커니즘 부재 (n8n)**
   - API 실패 시 자동 복구 없음
   - 수동 재처리 필요
   - 에러 발생 시 사용자 개입 필요

---

## 10. 개선 방안

### 10.1 Option A: 프론트엔드 IndexedDB 큐

**개요**: 브라우저의 IndexedDB를 활용하여 업로드 큐 영속화

```typescript
// 현재: 메모리 기반
const uploadQueueRef = useRef<FileUploadState[]>([])

// 개선: IndexedDB 영속화
import { openDB } from 'idb'

const db = await openDB('aims-upload', 1, {
  upgrade(db) {
    db.createObjectStore('upload-queue', { keyPath: 'fileId' })
  }
})

// 큐에 추가
await db.put('upload-queue', {
  fileId: 'uuid',
  fileName: 'document.pdf',
  customerId: '123',
  status: 'pending',
  file: file,  // File 객체도 저장 가능
  createdAt: new Date()
})

// 새로고침 후 복원
const pendingFiles = await db.getAll('upload-queue')
const toResume = pendingFiles.filter(f => f.status === 'pending')
```

**장점**:
- 프론트엔드만 수정, 백엔드 변경 없음
- 브라우저 새로고침 후에도 큐 유지
- 재시작 시 pending 상태 파일 자동 재개

**단점**:
- 여전히 클라이언트 의존
- File 객체 저장 시 용량 제한

### 10.2 Option B: MongoDB 기반 업로드 큐

**개요**: 서버 사이드에서 MongoDB 컬렉션으로 업로드 큐 관리

```javascript
// 새 컬렉션: upload_queue
{
  _id: ObjectId,
  userId: "user_id",
  customerId: "customer_id",
  fileName: "document.pdf",
  fileSize: 1024000,
  tempPath: "/tmp/uploads/abc123.pdf",  // 임시 디스크 저장
  status: "pending" | "processing" | "completed" | "failed",
  priority: 1,  // 우선순위 (낮을수록 먼저)
  retryCount: 0,
  maxRetries: 3,
  error: null,
  createdAt: ISODate,
  startedAt: ISODate,
  completedAt: ISODate
}

// 인덱스
db.upload_queue.createIndex({ status: 1, priority: 1, createdAt: 1 })
db.upload_queue.createIndex({ userId: 1, status: 1 })
```

**처리 흐름**:

```
┌─────────────────────────────────────────────────────────────────┐
│  프론트엔드                                                      │
│  POST /api/upload/queue                                         │
│  - multipart/form-data로 파일 전송                              │
│  - 즉시 응답 (큐에 등록됨)                                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  aims_api                                                        │
│  1. 파일을 /tmp/uploads/{uuid}.{ext}에 임시 저장                │
│  2. upload_queue 컬렉션에 문서 생성 (status: pending)           │
│  3. 즉시 응답: { queueId, position, estimatedTime }            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Upload Worker (별도 프로세스)                                   │
│  - 5초마다 upload_queue 폴링                                     │
│  - status=pending 문서 중 priority 낮은 순으로 처리             │
│  - 동시 처리 수 제한 (예: 5개)                                   │
│  - 처리 완료 시 status=completed, 임시 파일 삭제               │
│  - 실패 시 retryCount++, 3회 초과 시 status=failed             │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  SSE 알림                                                        │
│  - 큐 위치 변경 시 알림                                          │
│  - 처리 시작/완료/실패 시 알림                                   │
└─────────────────────────────────────────────────────────────────┘
```

**장점**:
- 서버 재시작에도 안전
- 모니터링 용이 (MongoDB 쿼리로 큐 상태 확인)
- 우선순위/재시도 제어 가능

**단점**:
- 임시 파일 관리 필요
- 복잡도 증가
- 디스크 공간 관리 필요

### 10.3 Option C: Redis BullMQ

**개요**: Redis 기반 전문 Job Queue 라이브러리 활용

```javascript
import { Queue, Worker, QueueScheduler } from 'bullmq'

const connection = { host: 'localhost', port: 6379 }

// 큐 생성
const uploadQueue = new Queue('document-upload', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }
  }
})

// 스케줄러 (지연/재시도 관리)
const scheduler = new QueueScheduler('document-upload', { connection })

// 워커 (별도 프로세스)
const worker = new Worker('document-upload', async (job) => {
  const { tempPath, userId, customerId, fileName } = job.data

  // 진행률 업데이트
  await job.updateProgress(10)

  // 문서 처리 로직
  const result = await processDocument(tempPath, userId, customerId)

  await job.updateProgress(100)
  return result
}, {
  connection,
  concurrency: 5,  // 동시 5개 처리
  limiter: {
    max: 10,
    duration: 1000  // 초당 10개 제한
  }
})

// 이벤트 핸들러
worker.on('completed', (job, result) => {
  // SSE 알림 발송
})

worker.on('failed', (job, err) => {
  // 에러 로깅 + SSE 알림
})
```

**장점**:
- 재시도/우선순위/동시성 제어 내장
- 지연 실행 (delayed jobs) 지원
- 대시보드 (Bull Board) 제공
- 고성능 (Redis 기반)

**단점**:
- 추가 의존성 (bullmq 패키지)
- 운영 복잡도 증가
- Redis 설정 필요

### 10.4 Option D: OCR 워커 다중화

**개요**: 기존 Redis Stream Consumer Group에 워커 추가

```bash
# 현재: 단일 워커
redis-cli XREADGROUP GROUP ocr_consumer_group worker-1 COUNT 1 ...

# 개선: 다중 워커
pm2 start ocr-worker.js --name "ocr-worker-1"
pm2 start ocr-worker.js --name "ocr-worker-2"
pm2 start ocr-worker.js --name "ocr-worker-3"

# 각 워커가 다른 consumer ID 사용
# worker-1, worker-2, worker-3
```

**장점**:
- 기존 구조 유지
- 즉시 적용 가능
- n8n 워크플로우 변경 최소화

**단점**:
- OCR API 비용 증가 (Upstage 과금)
- 외부 API rate limit 주의
- 워커 관리 복잡도

### 10.5 권장 구현 순서

#### Phase 1: 즉시 개선 (1-2일)
1. **OCR 워커 다중화** (Option D)
   - pm2로 워커 2-3개 실행
   - Redis Consumer Group 자동 분배

2. **프론트엔드 IndexedDB 큐** (Option A)
   - 업로드 상태 브라우저 저장
   - 새로고침 후 자동 재개

#### Phase 2: 중기 개선 (1주)
3. **FastAPI 단독 모드 전환**
   - Shadow Mode 종료
   - 리소스 사용량 50% 절감

4. **서버 사이드 업로드 큐** (Option B)
   - MongoDB 기반 큐 구현
   - 백그라운드 워커 개발

#### Phase 3: 장기 개선
5. **배치 처리 API**
   - 여러 파일을 한번에 처리하는 API
   - ZIP 업로드 → 서버에서 해제

6. **모니터링 대시보드**
   - 큐 상태 실시간 확인
   - 처리 통계 시각화

---

## 11. 핵심 파일 목록

### 11.1 프론트엔드

| 파일 | 역할 |
|------|------|
| `features/batch-upload/BatchDocumentUploadView.tsx` | 배치 업로드 메인 UI |
| `features/batch-upload/hooks/useBatchUpload.ts` | 배치 업로드 큐 관리 |
| `features/batch-upload/api/batchUploadApi.ts` | 배치 업로드 API 클라이언트 |
| `features/batch-upload/utils/customerMatcher.ts` | 폴더명-고객명 매칭 |
| `features/batch-upload/utils/fileValidation.ts` | 파일 검증 |
| `DocumentRegistrationView/services/uploadService.ts` | 개별 업로드 서비스 |
| `DocumentRegistrationView/services/userContextService.ts` | 엔드포인트 설정 |
| `shared/lib/fileValidation/` | 공통 파일 검증 모듈 |
| `shared/lib/fileValidation/virusScanApi.ts` | ClamAV 연동 |

### 11.2 백엔드 (aims_api)

| 파일 | 역할 |
|------|------|
| `server.js` | 메인 서버, 프록시 라우팅, 웹훅 |
| `routes/personal-files-routes.js` | 개인 파일 업로드 |
| `middleware/auth.js` | JWT/API Key 인증 |
| `services/pdfConversionService.js` | PDF 변환 |
| `services/storageQuotaService.js` | 스토리지 할당량 |

### 11.3 백엔드 (document_pipeline)

| 파일 | 역할 |
|------|------|
| `main.py` | FastAPI 메인 앱 |
| `config.py` | 설정 관리 |
| `middleware/shadow_mode.py` | Shadow Mode 구현 |
| `routers/shadow_router.py` | Shadow 라우터 + 모드 관리 |
| `routers/doc_prep_main.py` | 문서 처리 오케스트레이터 |
| `services/meta_service.py` | 메타데이터 서비스 |

### 11.4 n8n 워크플로우

| 파일 | 역할 |
|------|------|
| `DocPrepMain.json` | 입구점 및 전체 조율 |
| `DocUpload.json` | 파일 수신 및 저장 |
| `DocMeta.json` | 메타데이터 추출 |
| `DocOCR.json` | OCR 처리 (Upstage) |
| `OCRWorker.json` | Redis Stream OCR 폴링 |
| `DocSummary.json` | AI 요약 생성 (GPT-4) |
| `SmartSearch.json` | 문서 검색 |
| `ErrorLogger.json` | 에러 로깅 |

---

## 12. 결론

### 12.1 현재 상태 요약

| 구간 | 현재 방식 | 지속성 | 문제점 |
|------|----------|--------|--------|
| 프론트엔드 큐 | 메모리 (useRef) | ❌ 휘발성 | 브라우저 충돌 시 손실 |
| 배치 세션 | sessionStorage | ⚠️ 탭 유지 | Preview만 복원 |
| 백엔드 처리 | 즉시 처리 (버퍼링 없음) | - | 대량 요청 시 과부하 |
| OCR 큐 | Redis Stream | ✅ 영구 | 단일 워커 병목 |
| 서비스 모드 | Shadow (n8n+FastAPI 병렬) | - | 2배 리소스 사용 |

### 12.2 최종 결정 사항 (2026-01-06)

#### 핵심 결정

| 항목 | 결정 | 비고 |
|------|------|------|
| **기본 서비스 모드** | `SERVICE_MODE=FASTAPI` | FastAPI 단독 운영 |
| **큐잉 적용 대상** | FastAPI에만 적용 | n8n에는 적용 안함 |
| **n8n 상태** | OFF (기본) | 제거하지 않음, 옵션으로 유지 |
| **Shadow Mode** | OFF | 리소스 50% 절감 |

#### 운영 모드 설정

```python
# document_pipeline/middleware/shadow_mode.py
SERVICE_MODE = ServiceMode.FASTAPI  # 기본값 (권장)

# 필요시 전환 가능한 옵션:
# SERVICE_MODE = ServiceMode.N8N      # n8n 단독 (백업 옵션)
# SERVICE_MODE = ServiceMode.SHADOW   # 병렬 비교 (마이그레이션 검증용)
```

#### 이 결정의 근거

1. **리소스 최적화**
   - Shadow Mode(n8n+FastAPI 병렬)는 2배의 리소스 사용
   - FastAPI 단독 운영으로 50% 이상 리소스 절감

2. **단순화**
   - 단일 처리 경로로 디버깅 및 모니터링 용이
   - n8n 워크플로우 동기화 부담 제거

3. **확장성**
   - FastAPI 코드 기반으로 큐잉 로직 구현 용이
   - MongoDB 큐 + 워커 패턴 적용 가능

4. **유연성 유지**
   - n8n은 완전히 제거하지 않고 백업 옵션으로 유지
   - 필요시 환경변수 변경만으로 n8n 모드 전환 가능

### 12.3 권장 개선 방향

**목표**: 대규모 요청 시 순차 처리로 시스템 부하(CPU/메모리) 제한

**큐잉 구현 (FastAPI에만 적용)**:

1. **MongoDB 기반 업로드 큐** 도입
   - 서버 사이드에서 요청 버퍼링
   - 동시 처리 수 제한으로 부하 제어
   - 재시도 및 실패 처리 체계화

2. **OCR 워커 다중화** (선택적)
   - 병렬 처리로 대량 문서 처리 속도 개선
   - API 비용과 rate limit 고려 필요

### 12.4 다음 단계

- 구현 시기: 미정
- 추가 검토 필요 사항:
  - MongoDB 큐 스키마 상세 설계
  - 워커 프로세스 관리 방안 (pm2, systemd 등)
  - 모니터링 및 알림 체계

---

## 참고 자료

- [N8N_TO_FASTAPI_MIGRATION.md](./N8N_TO_FASTAPI_MIGRATION.md) - n8n → FastAPI 마이그레이션 계획
- [NETWORK_SECURITY_ARCHITECTURE.md](./NETWORK_SECURITY_ARCHITECTURE.md) - 네트워크 보안 아키텍처
- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- [BullMQ Documentation](https://docs.bullmq.io/)
