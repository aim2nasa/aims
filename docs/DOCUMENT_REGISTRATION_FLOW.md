# aims-uix3 문서 등록 처리 흐름

> 최종 검증일: 2025-12-17 (10회 반복 검증 완료 - 수정본)

## 핵심 포인트

**aims_api (Node.js 백엔드)는 문서 등록에 관여하지 않음!**
n8n이 파일 저장, 메타데이터 추출, DB 저장을 모두 직접 처리합니다.

## 전체 흐름도

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. 파일 선택 (FileUploadArea.tsx)                                    │
└────────────────────────┬─────────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. 검증 (프론트엔드)                                                  │
│     ├─ 파일 크기: 최대 50MB                                           │
│     └─ 바이러스 검사: ClamAV (활성화 시)                               │
└────────────────────────┬─────────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. 업로드 (uploadService.ts)                                         │
│     ├─ 엔드포인트: https://n8nd.giize.com/webhook/docprep-main       │
│     ├─ FormData: file, userId, customerId                             │
│     ├─ 병렬 처리: 최대 3개 동시                                        │
│     └─ JWT 인증: Authorization: Bearer                                │
└────────────────────────┬─────────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  4. nginx (n8nd.giize.com:443)                                        │
│     └─ proxy_pass → localhost:5678 (client_max_body_size 50M)        │
└────────────────────────┬─────────────────────────────────────────────┘
                         ▼
╔══════════════════════════════════════════════════════════════════════╗
║  5. n8n DocPrepMain 워크플로우 (/webhook/docprep-main)                ║
║     │                                                                ║
║     │  [동기 처리 - 클라이언트 응답 대기]                               ║
║     │                                                                ║
║     ├──► Save OwnerId (MongoDB INSERT)                               ║
║     │    └─ 새 문서 생성: ownerId, customerId                         ║
║     │                                                                ║
║     ├──► DocUpload Request (/webhook/docupload)                      ║
║     │    ├─ 임시 파일 저장 (/data/tmp/)                               ║
║     │    ├─ 경로 생성: /data/files/users/{userId}/YYYY/MM/           ║
║     │    ├─ mkdir + mv 실행                                          ║
║     │    └─ 응답: destPath, saveName, originalName                   ║
║     │                                                                ║
║     ├──► Save File Info (MongoDB UPDATE)                             ║
║     │    └─ upload.* 필드 추가                                        ║
║     │                                                                ║
║     ├──► DocMeta Request (/webhook/docmeta)                          ║
║     │    ├─ enhanced_file_analyzer.js 실행                           ║
║     │    ├─ 파일 메타데이터 추출 (MIME, 크기, 페이지 수)               ║
║     │    ├─ PDF 텍스트 추출 → meta.full_text                         ║
║     │    ├─ 파일 해시 계산 → meta.file_hash                          ║
║     │    └─ 응답: filename, extension, mime, size_bytes, pdf_pages   ║
║     │                                                                ║
║     ├──► Update Meta in MongoDB (MongoDB UPDATE)                     ║
║     │    └─ meta.* 필드 추가                                          ║
║     │                                                                ║
║     └──► OCR 큐잉 (Redis XADD) - full_text 없는 경우만                ║
║          ├─ Stream: ocr_stream                                       ║
║          ├─ Data: file_id, file_path, doc_id, owner_id, queued_at   ║
║          ├─ Update OCR Queue in MongoDB                              ║
║          └─ ocr.status = "queued", ocr.queued_at                     ║
║                                                                      ║
║     └──► HTTP 응답 반환 (클라이언트에게)                               ║
╚══════════════════════════════════════════════════════════════════════╝
                         │
                         │ (비동기 - 클라이언트 응답 후)
                         ▼
╔══════════════════════════════════════════════════════════════════════╗
║  6. OCRWorker (n8n 스케줄 워크플로우, 5초마다 폴링)                     ║
║     │                                                                ║
║     ├─ Redis XREADGROUP (ocr_stream)                                 ║
║     │    └─ Consumer Group: ocr_consumer_group, Consumer: worker-1  ║
║     │                                                                ║
║     ├─ Prepare OCR Binary (파일 읽기)                                 ║
║     │                                                                ║
║     ├─ Update OCR Running (MongoDB UPDATE)                           ║
║     │    └─ ocr.status = "running", ocr.started_at                   ║
║     │                                                                ║
║     ├─ DocOCR Request (/webhook/dococr)                              ║
║     │    ├─ Upstage AI OCR API 호출                                  ║
║     │    │    └─ https://api.upstage.ai/v1/document-digitization    ║
║     │    ├─ DocSummary Request (/webhook/docsummary)                 ║
║     │    │    ├─ GPT-4.1-mini (OpenAI) 사용                          ║
║     │    │    └─ 요약(summary) + 태그(tags) 생성                      ║
║     │    └─ 응답: full_text, confidence, summary, tags, num_pages   ║
║     │                                                                ║
║     ├─ 성공 시:                                                       ║
║     │    ├─ OCR Done (MongoDB UPDATE)                                ║
║     │    │    ├─ ocr.status = "done"                                 ║
║     │    │    ├─ ocr.full_text                                       ║
║     │    │    ├─ ocr.confidence                                      ║
║     │    │    ├─ ocr.summary                                         ║
║     │    │    ├─ ocr.tags[]                                          ║
║     │    │    └─ ocr.done_at                                         ║
║     │    └─ Redis XACK + XDEL (메시지 삭제)                           ║
║     │                                                                ║
║     └─ 실패 시:                                                       ║
║          ├─ Update OCR Error in MongoDB                              ║
║          │    ├─ ocr.status = "error"                                ║
║          │    └─ ocr.failed_at                                       ║
║          ├─ Log Final OCR Failure                                    ║
║          └─ Redis XACK + XDEL (메시지 삭제)                           ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 주요 설정값

| 항목 | 값 | 위치 |
|------|-----|------|
| 업로드 엔드포인트 | `https://n8nd.giize.com/webhook/docprep-main` | userContextService.ts:168 |
| 최대 파일 크기 | 50MB | userContextService.ts:182 |
| 최대 동시 업로드 | 3개 | userContextService.ts:181 |
| 파일 저장 경로 | `/data/files/users/{ownerId}/YYYY/MM/` | n8n 워크플로우 |
| OCR 폴링 간격 | 5초 | OCRWorker Schedule Trigger |

---

## 상세 설명

### 1. 파일 선택

- **컴포넌트**: `FileUploadArea.tsx`
- **방식**: 드래그앤드롭 또는 클릭

### 2. 프론트엔드 검증

- **파일 크기**: 50MB 초과 시 업로드 차단
- **바이러스 검사**: ClamAV 활성화 시 `scanFile()` 호출
  - 감염 파일 감지 시 업로드 차단

### 3. 업로드 처리

**uploadService.ts 주요 로직:**

```typescript
// FormData 구성
formData.append('file', file)
formData.append('userId', userId)
formData.append('customerId', customerId)  // 선택적

// JWT 인증 헤더
xhr.setRequestHeader('Authorization', `Bearer ${token}`)

// XMLHttpRequest로 진행률 추적
xhr.upload.addEventListener('progress', ...)
```

**병렬 업로드 관리:**
```typescript
while (
  this.activeUploads.size < 3 &&  // 최대 3개 동시
  this.uploadQueue.length > 0
) {
  const file = this.uploadQueue.shift()
  this.uploadFile(file)
}
```

### 4. nginx 프록시

**설정 파일**: `/etc/nginx/sites-available/n8nd`

```nginx
location /webhook/ {
    client_max_body_size 50M;
    proxy_pass http://localhost:5678;
    ...
}
```

### 5. n8n DocPrepMain 워크플로우

**MongoDB 작업 순서 (DocPrepMain 내):**
1. `Save OwnerId` → **INSERT** (ownerId, customerId) - 새 문서 생성
2. `Save File Info` → **UPDATE** (upload.*) - 업로드 정보 추가
3. `Update Meta in MongoDB` → **UPDATE** (meta.*) - 메타데이터 추가
4. `Update OCR Queue in MongoDB` → **UPDATE** (ocr.status, ocr.queued_at) - OCR 큐 상태

**처리 순서:**
1. 새 문서 생성 (MongoDB INSERT)
2. 파일 저장 → `/data/files/users/{ownerId}/YYYY/MM/{timestamp}_{random}.{ext}`
3. 업로드 정보 저장 (MongoDB UPDATE)
4. 메타데이터 추출 → `meta.*` 필드 (MongoDB UPDATE)
5. PDF 텍스트 추출 → `meta.full_text`
6. OCR 큐잉 (full_text 없는 경우) → Redis XADD + MongoDB UPDATE

### 6. OCRWorker 비동기 처리

**처리 순서:**
1. Redis XREADGROUP으로 메시지 읽기 (5초마다)
2. 파일 읽기 (file_path)
3. MongoDB UPDATE (ocr.status = "running")
4. DocOCR 호출 → **Upstage AI OCR API** 사용
5. DocSummary 호출 → **GPT-4.1-mini** 로 요약/태그 생성
6. MongoDB UPDATE (ocr.* 필드)
7. Redis XACK + XDEL (메시지 완료 처리)

---

## MongoDB 스키마 (files 컬렉션)

```javascript
{
  _id: ObjectId,
  ownerId: "설계사_ID",
  customerId: ObjectId,  // 고객 연결 (선택적)

  upload: {
    originalName: "원본파일명.pdf",
    saveName: "251213235434_3n32ifug.pdf",
    destPath: "/data/files/users/.../파일.pdf",
    uploaded_at: "2025-12-14T08:54:34.177+09:00",
    sourcePath: "",
    conversion_status: "not_required | completed",
    convPdfPath: "변환된 PDF 경로",  // Office 파일 변환 시
    converted_at: Date  // Office 파일 변환 시
  },

  meta: {
    filename: "저장된파일명.pdf",
    extension: ".pdf",
    mime: "application/pdf",
    size_bytes: "75032",
    created_at: "2025-12-13T23:54:34.156Z",
    meta_status: "ok",
    exif: "{}",
    pdf_pages: "2",
    full_text: "PDF에서 추출된 텍스트...",
    pdf_text_ratio: "{...}",
    summary: "요약 (DocMeta에서 생성)",
    length: 숫자,
    truncated: boolean,
    tags: [],
    file_hash: "sha256해시값"
  },

  ocr: {
    status: "queued | running | done | error",
    queued_at: "2025-12-14T08:54:50.856+09:00",
    started_at: "2025-12-14T08:54:52.304+09:00",
    done_at: "2025-12-14T08:55:00.311+09:00",
    confidence: "0.9139",
    full_text: "OCR로 추출된 텍스트...",
    summary: "AI 요약 (DocSummary에서 생성)",
    tags: ["태그1", "태그2", ...]
  }
}
```

---

## 관련 파일 경로

### 프론트엔드

| 파일 | 역할 |
|------|------|
| `DocumentRegistrationView/FileUploadArea.tsx` | 파일 선택 UI |
| `DocumentRegistrationView/services/uploadService.ts` | 업로드 서비스 |
| `DocumentRegistrationView/services/userContextService.ts` | 설정 및 FormData 생성 |
| `features/batch-upload/api/batchUploadApi.ts` | 배치 업로드 API |

### 서버

| 경로 | 역할 |
|------|------|
| `/etc/nginx/sites-available/n8nd` | n8n 프록시 설정 |
| n8n 워크플로우 (포트 5678) | 문서 처리 로직 |
| `/data/files/users/` | 파일 저장 위치 |
| `/home/rossi/aims/backend/n8n_flows/` | n8n 워크플로우 JSON 파일 |

---

## n8n 워크플로우 상세

### 사용되는 n8n 노드

| 노드 | 역할 |
|------|------|
| `n8n-nodes-base.webhook` | HTTP POST 요청 수신 |
| `n8n-nodes-base.readWriteFile` | 파일 저장/읽기 |
| `n8n-nodes-base.executeCommand` | 쉘 명령 실행 (mkdir, mv, redis-cli) |
| `n8n-nodes-base.code` | JavaScript 로직 |
| `n8n-nodes-base.mongoDb` | MongoDB 직접 연결 |
| `n8n-nodes-base.set` | 데이터 필드 설정 |
| `n8n-nodes-base.if` | 조건 분기 |
| `n8n-nodes-base.httpRequest` | 외부 API 호출 (Upstage, 내부 webhook) |
| `n8n-nodes-base.respondToWebhook` | HTTP 응답 반환 |
| `n8n-nodes-base.scheduleTrigger` | 스케줄 트리거 (OCRWorker) |
| `@n8n/n8n-nodes-langchain.agent` | AI Agent (DocSummary) |
| `@n8n/n8n-nodes-langchain.lmChatOpenAi` | OpenAI Chat Model |

### n8n MongoDB 연결 정보

```
Credentials ID: RT7gatMve2ExTlAp
Database: docupload
Collection: files
```

### 관련 워크플로우

| 워크플로우 | webhook 경로 | 트리거 | 역할 |
|-----------|-------------|--------|------|
| **DocPrepMain** | `/webhook/docprep-main` | HTTP POST | 메인 오케스트레이터 |
| DocUpload | `/webhook/docupload` | 내부 호출 | 파일 저장 (MongoDB 작업 없음) |
| DocMeta | `/webhook/docmeta` | 내부 호출 | 메타데이터 추출 |
| **OCRWorker** | - | 5초 스케줄 | Redis 폴링 → DocOCR 호출 |
| DocOCR | `/webhook/dococr` | 내부 호출 | **Upstage AI OCR** + DocSummary 호출 |
| DocSummary | `/webhook/docsummary` | 내부 호출 | **GPT-4.1-mini** 요약/태그 생성 |

### 외부 API 연동

| API | 용도 | 위치 |
|-----|------|------|
| Upstage AI | OCR (문서 디지털화) | DocOCR |
| OpenAI GPT-4.1-mini | 요약 및 태그 생성 | DocSummary |

### Redis Stream 구조

```
Stream: ocr_stream
Consumer Group: ocr_consumer_group
Consumer: worker-1

XADD Message 구조:
- file_id: MongoDB _id
- file_path: 파일 경로
- doc_id: 문서 ID
- owner_id: 설계사 ID
- queued_at: 큐잉 시각

XREADGROUP Command:
redis-cli XREADGROUP GROUP ocr_consumer_group worker-1 COUNT 1 BLOCK 5000 STREAMS ocr_stream ">"
```

---

## 주의사항

1. **aims_api 미사용**: 문서 등록은 n8n에 직접 요청 (aims_api 프록시 존재하지만 미사용)
2. **임베딩/Qdrant**: 문서 등록 시점에 생성되지 않음 (별도 처리)
3. **JWT 필수**: `localStorage('auth-storage')`에서 토큰 가져옴
4. **n8n이 백엔드**: 파일 저장, DB 연동 모두 n8n 워크플로우에서 직접 처리
5. **OCR 엔진**: Tesseract가 아닌 **Upstage AI API** 사용
6. **요약 생성**: **GPT-4.1-mini (OpenAI)** 사용
7. **MongoDB INSERT**: DocUpload가 아닌 **DocPrepMain의 Save OwnerId** 노드에서 수행
