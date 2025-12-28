# n8n → FastAPI 마이그레이션 진행 보고서

> 시작일: 2025-12-28
> 마지막 업데이트: 2025-12-29
> 기준 문서: [N8N_TO_FASTAPI_MIGRATION.md](./N8N_TO_FASTAPI_MIGRATION.md)

---

## 진행 현황 요약

| Phase | 대상 | 상태 | 완료일 |
|-------|------|------|--------|
| Phase 1 | DocUpload, DocSummary, ErrorLogger | ✅ 완료 | 2025-12-28 |
| Phase 2 | DocOCR, DocMeta | ✅ 완료 | 2025-12-28 |
| Phase 3 | OCRWorker, SmartSearch | ✅ 완료 | 2025-12-28 |
| Phase 4 | DocPrepMain | ✅ 완료 | 2025-12-28 |
| Phase 5 | Shadow Mode 검증 | 🔄 진행 중 | - |

---

## Phase 1: 독립 모듈 (2025-12-28)

### 목표
- DocUpload: 파일 저장
- DocSummary: 텍스트 요약 (OpenAI)
- ErrorLogger: 에러 로깅

### 완료 항목

#### 1. 프로젝트 구조 생성
```
backend/api/document_pipeline/
├── main.py                 # FastAPI 앱 진입점
├── config.py               # 설정 (환경변수)
├── pyproject.toml          # 프로젝트 메타데이터
├── pytest.ini              # 테스트 설정
├── requirements.txt        # 의존성
├── .env.example            # 환경변수 템플릿
│
├── routers/
│   ├── doc_upload.py       # POST /webhook/docupload
│   └── doc_summary.py      # POST /webhook/docsummary
│
├── services/
│   ├── file_service.py     # 파일 저장/읽기
│   ├── mongo_service.py    # MongoDB CRUD
│   └── openai_service.py   # OpenAI 요약 API
│
├── workers/
│   └── error_logger.py     # 에러 로깅 + Slack 알림
│
├── models/
│   ├── document.py         # Pydantic 모델
│   └── responses.py        # 응답 스키마
│
└── tests/
    ├── conftest.py         # pytest fixtures
    ├── test_doc_upload.py  # 5개 테스트
    └── test_doc_summary.py # 3개 테스트
```

#### 2. 테스트 결과
```
========================= 8 passed in 1.35s =========================
- test_upload_success ✅
- test_upload_no_file ✅
- test_upload_no_user_id ✅
- test_upload_with_customer_id ✅
- test_upload_with_source_path ✅
- test_summary_success ✅
- test_summary_empty_text ✅
- test_summary_with_document_id ✅
```

#### 3. 배포 상태
| 항목 | 값 |
|------|-----|
| 서비스명 | document_pipeline |
| 포트 | 8100 |
| PM2 상태 | ✅ online |
| 헬스체크 | ✅ `/health` 정상 |

#### 4. 엔드포인트 테스트

**DocUpload** ✅
```bash
curl -X POST http://localhost:8100/webhook/docupload \
  -F "file=@test.txt" \
  -F "userId=test_user_123"

# 응답
{
  "result": "success",
  "original": "test.txt",
  "saved_name": "251228192821_78f44c2b.txt",
  "path": "/data/files/users/test_user_123/2025/12/251228192821_78f44c2b.txt"
}
```

**DocSummary** ✅
```bash
curl -X POST http://localhost:8100/webhook/docsummary \
  -H "Content-Type: application/json" \
  -d '{"full_text": "인공지능은 컴퓨터가 인간의 지능을 모방하는 기술입니다."}'

# 응답
{
  "summary": "인공지능은 컴퓨터가 인간의 지능을 모방하여...",
  "length": 51,
  "truncated": false,
  "tags": ["인공지능", "컴퓨터", "지능", "기술", "모방"]
}
```

### 미완료 항목
- [ ] nginx 라우팅 설정 (n8n → FastAPI 전환)

### 다음 단계 (Phase 2)
1. DocOCR: Upstage OCR API 연동
2. DocMeta: 메타데이터 추출 + DocSummary 호출

---

## Phase 2: OCR 파이프라인 (2025-12-28)

> 상태: ✅ 완료

### 목표
- DocOCR: Upstage API 연동
- DocMeta: 메타데이터 추출 + DocSummary 호출

### 완료 항목

#### 1. 신규 파일 추가
```
backend/api/document_pipeline/
├── routers/
│   ├── doc_ocr.py          # POST /webhook/dococr
│   └── doc_meta.py         # POST /webhook/docmeta
│
└── services/
    ├── upstage_service.py  # Upstage OCR API 연동
    └── meta_service.py     # PDF 메타데이터 추출 (PyMuPDF)
```

#### 2. 의존성 추가
```
# requirements.txt에 추가
PyMuPDF>=1.24.0
```

#### 3. 엔드포인트 테스트

**DocOCR** ✅ (Upstage OCR API)
```bash
curl -X POST http://localhost:8100/webhook/dococr \
  -F "file=@image.jpg"

# 응답
{
  "status": 200,
  "error": false,
  "userMessage": "OCR 성공",
  "confidence": 0.95,
  "summary": "이 이미지는...",
  "tags": ["태그1", "태그2"],
  "full_text": "추출된 텍스트...",
  "num_pages": 1,
  "pages": [...]
}
```

**DocMeta** ✅ (메타데이터 + 요약)
```bash
# 파일 업로드 모드
curl -X POST http://localhost:8100/webhook/docmeta \
  -F "file=@document.pdf"

# 파일 경로 모드
curl -X POST http://localhost:8100/webhook/docmeta \
  -F "path=/data/files/document.pdf"

# 응답
{
  "status": 200,
  "error": false,
  "filename": "document.pdf",
  "mime_type": "application/pdf",
  "file_size": 123456,
  "file_hash": "sha256:...",
  "num_pages": 28,
  "extracted_text_length": 37344,
  "summary": "문서 요약...",
  "tags": ["태그1", "태그2", ...]
}
```

#### 4. 배포 상태
| 항목 | 값 |
|------|-----|
| 서비스명 | document_pipeline |
| 포트 | 8100 |
| PM2 상태 | ✅ online |
| 환경변수 | UPSTAGE_API_KEY 추가 |

### 기술 상세

#### UpstageService
- API: `https://api.upstage.ai/v1/document-digitization`
- 모델: `document-parse`
- 지원 형식: PDF, 이미지 (JPG, PNG 등)
- 에러 핸들링: 할당량 초과, 빈 파일, API 오류 처리

#### MetaService
- PyMuPDF 기반 PDF 텍스트 추출
- SHA256 파일 해시 생성
- MIME 타입 자동 감지
- 페이지 수 / 텍스트 길이 추출

### 다음 단계 (Phase 3)
1. OCRWorker: Redis Consumer + 비동기 처리
2. SmartSearch: MongoDB 쿼리

---

## Phase 3: 워커 + 검색 (2025-12-28)

> 상태: ✅ 완료

### 목표
- OCRWorker: Redis Consumer + 비동기 처리
- SmartSearch: MongoDB 쿼리

### 완료 항목

#### 1. 신규 파일 추가
```
backend/api/document_pipeline/
├── routers/
│   └── smart_search.py     # POST /webhook/smartsearch
│
├── services/
│   └── redis_service.py    # Redis Stream 연동
│
└── workers/
    └── ocr_worker.py       # Redis Stream Consumer
```

#### 2. SmartSearch 엔드포인트

**기능:**
- ID로 문서 검색
- 키워드로 다중 필드 검색 (OR/AND 모드)
- 소유자(user_id) + 고객(customer_id) 필터링

**검색 대상 필드:**
- `upload.originalName`
- `ocr.full_text`, `ocr.summary`, `ocr.tags`
- `meta.filename`, `meta.full_text`, `meta.summary`, `meta.tags`
- `text.full_text`
- `customer_relation.notes`

**테스트 결과** ✅
```bash
# ID 검색
curl -X POST http://localhost:8100/webhook/smartsearch \
  -H "Content-Type: application/json" \
  -d '{"id": "694fe165907ae2a0bd0bf979", "user_id": "694f9415a0f94f0a13f49894"}'
# → 1개 문서 반환

# 키워드 검색
curl -X POST http://localhost:8100/webhook/smartsearch \
  -H "Content-Type: application/json" \
  -d '{"query": "김보성", "user_id": "694f9415a0f94f0a13f49894"}'
# → 27개 문서 반환
```

#### 3. OCRWorker 구현

**기능:**
- Redis Stream (`ocr_stream`) polling (XREADGROUP)
- OCR 할당량 체크 (AIMS API 연동)
- Upstage OCR + OpenAI 요약 처리
- MongoDB 상태 업데이트 (running → done/error)
- 처리 완료 알림 (webhook)

**처리 플로우:**
```
Redis Stream → 할당량 체크 → OCR 처리 → MongoDB 업데이트 → 알림
```

**상태 관리:**
- `ocr.status`: queued → running → done/error/quota_exceeded
- `ocr.queued_at`, `ocr.started_at`, `ocr.done_at` 타임스탬프

#### 4. 배포 상태
| 항목 | 값 |
|------|-----|
| 서비스명 | document_pipeline |
| 포트 | 8100 |
| PM2 상태 | ✅ online |
| SmartSearch | ✅ 정상 동작 |
| OCRWorker | ✅ 코드 완료 (별도 프로세스로 실행 필요) |

### 기술 상세

#### RedisService
- `redis.asyncio` 기반 비동기 클라이언트
- Consumer Group: `ocr_consumer_group`
- Stream Name: `ocr_stream`
- XREADGROUP + XACK + XDEL 패턴

#### SmartSearch 쿼리 빌더
- Pydantic 모델 기반 요청 검증
- MongoDB $regex 검색 (case-insensitive)
- ObjectId 자동 변환

### 다음 단계 (Phase 4)
1. DocPrepMain: 전체 문서 처리 흐름 조율

---

## Phase 4: 메인 오케스트레이터 (2025-12-28)

> 상태: ✅ 완료

### 목표
- DocPrepMain: 전체 문서 처리 흐름 조율

### 완료 항목

#### 1. 신규 파일 추가
```
backend/api/document_pipeline/
├── routers/
│   └── doc_prep_main.py   # POST /webhook/docprep-main
```

#### 2. DocPrepMain 엔드포인트

**기능:**
- 문서 업로드 + 메타데이터 추출 + MIME 타입별 라우팅
- MongoDB 문서 생성 및 상태 관리
- Redis 큐잉 (OCR 필요 시)
- 고객 연결 (customerId 제공 시)

**처리 흐름:**
```
1. MongoDB에 문서 생성 (ownerId, customerId)
2. 파일 저장 (FileService)
3. 메타데이터 추출 (MetaService)
4. OpenAI 요약 생성 (텍스트 있을 경우)
5. MIME 타입별 분기:
   - text/plain → 텍스트 저장, 완료 반환
   - unsupported (zip, ps, octet-stream) → 415 반환
   - OCR 필요 → Redis 큐잉
   - 텍스트 있음 → 완료 알림
```

**테스트 결과** ✅
```bash
# 텍스트 파일 처리
curl -X POST http://localhost:8100/webhook/docprep-main \
  -F "file=@test.txt" -F "userId=test_user_123"
# → {"result": "success", "status": "completed", "mime_type": "text/plain"}

# 지원하지 않는 형식
curl -X POST http://localhost:8100/webhook/docprep-main \
  -F "file=@test.zip" -F "userId=test_user_123"
# → {"status": 415, "userMessage": "OCR 생략: 지원하지 않는 문서 형식입니다."}

# 이미지 파일 (OCR 큐잉)
curl -X POST http://localhost:8100/webhook/docprep-main \
  -F "file=@test.png" -F "userId=test_user_123"
# → {"result": "success", "ocr": {"status": "queued", "queued_at": "..."}}
```

#### 3. 서비스 리팩토링

모든 서비스를 classmethod 패턴으로 통일:
- `FileService`: 파일 저장/읽기
- `MetaService`: 메타데이터 추출
- `OpenAIService`: 텍스트 요약
- `RedisService`: Redis Stream 연동

#### 4. 배포 상태
| 항목 | 값 |
|------|-----|
| 서비스명 | document_pipeline |
| 포트 | 8100 |
| PM2 상태 | ✅ online |
| DocPrepMain | ✅ 정상 동작 |
| Redis 큐잉 | ✅ 정상 동작 |

### 기술 상세

#### DocPrepMain 라우팅 로직
```
if mime_type == "text/plain":
    → 텍스트 파일 처리, 완료 반환
elif mime_type in ["application/postscript", "application/zip", "application/octet-stream"]:
    → 415 Unsupported Media Type 반환
elif not full_text or len(full_text.strip()) == 0:
    → Redis ocr_stream에 큐잉
else:
    → 텍스트 추출 완료, 완료 알림
```

---

## Phase 5: Shadow Mode 검증 (2025-12-29 ~)

> 상태: 🔄 진행 중

### 목표
- n8n과 FastAPI 병렬 호출로 응답 일치 여부 검증
- Match Rate 99% 이상, Error Rate 1% 미만 달성
- 최소 100회 이상 호출, 7일 이상 관측 후 전환 결정

### Shadow Mode 아키텍처
```
요청 → Shadow Router → n8n (운영)     → 응답 반환
                    └→ FastAPI (검증) → 비교 후 로깅
```

- **운영**: n8n 워크플로우가 실제 요청 처리 (응답 반환)
- **검증**: FastAPI가 백그라운드에서 동일 요청 처리 후 비교만 수행

### Switch Readiness 조건
| 항목 | 기준 | 현재 |
|------|------|------|
| 최소 호출 수 | ≥ 100 | - |
| Match Rate | ≥ 99% | - |
| Error Rate | ≤ 1% | - |
| 관측 기간 | ≥ 7일 | - |

### Shadow Monitor 기능 (aims-admin)
| 기능 | 설명 |
|------|------|
| 통계 조회 | Match/Mismatch/Error 비율, 워크플로우별 통계 |
| 불일치 분석 | diff 상세 보기, Claude 프롬프트 복사 |
| Resolved 정리 | 해결된 불일치 기록 일괄 삭제 |
| 통계 초기화 | 모든 호출/불일치/오류 기록 삭제 후 재시작 |
| 자동 갱신 | 30초마다 데이터 자동 새로고침 |

### 주요 수정 사항 (2025-12-29)

#### 1. n8n DocMeta analyzer 의존성 수정
- `form-data`, `mongodb` npm 패키지 누락 → 서버에 설치
- `tools/mime_type_analyzer/package.json` 업데이트

#### 2. IGNORE_FIELDS 추가
- `raw` 필드 추가 (n8n 템플릿 미평가 시 발생하는 차이 무시)
- `contracts/dynamic_fields.py` 업데이트

#### 3. Shadow Monitor UI 개선
- "Resolved 정리" 버튼 추가 (해결된 기록 삭제)
- "통계 초기화" 버튼 추가 (전체 초기화 후 재집계)
- 수동 Resolved 방지 (자동 Resolved만 허용)
- 불일치 목록에 번호 표시 추가

#### 4. 자동 Resolved 기능
- Match 발생 시 동일 workflow의 open mismatch 자동 해결
- `shadow_mode.py`의 `_auto_resolve_mismatches()` 함수

### Shadow Mode 활용 프로세스
```
1. 통계 관찰: Match Rate, Error Rate 모니터링
2. Mismatch 분석: diff 확인 → 원인 파악
3. 수정: FastAPI 코드 또는 IGNORE_FIELDS 조정
4. 재검증: Match 확인 → 자동 Resolved
5. 정리: Resolved 기록 삭제, 필요시 통계 초기화
6. 전환 판단: Switch Readiness "Ready" 시 FastAPI 전환
```

### 다음 단계
1. [ ] 운영 환경에서 지속적 모니터링
2. [ ] Switch Readiness 조건 충족 확인
3. [ ] n8n 비활성화 및 FastAPI 직접 호출로 전환

---

## 마이그레이션 완료

> 🎉 모든 n8n 워크플로우가 FastAPI로 마이그레이션되었습니다. (Phase 5 검증 진행 중)

### 최종 프로젝트 구조
```
backend/api/document_pipeline/
├── main.py                 # FastAPI 앱 진입점
├── config.py               # 설정 (환경변수)
├── requirements.txt        # 의존성
│
├── routers/
│   ├── doc_upload.py       # POST /webhook/docupload
│   ├── doc_summary.py      # POST /webhook/docsummary
│   ├── doc_ocr.py          # POST /webhook/dococr
│   ├── doc_meta.py         # POST /webhook/docmeta
│   ├── smart_search.py     # POST /webhook/smartsearch
│   └── doc_prep_main.py    # POST /webhook/docprep-main
│
├── services/
│   ├── file_service.py     # 파일 저장/읽기
│   ├── mongo_service.py    # MongoDB CRUD
│   ├── openai_service.py   # OpenAI 요약 API
│   ├── upstage_service.py  # Upstage OCR API
│   ├── meta_service.py     # 메타데이터 추출
│   └── redis_service.py    # Redis Stream 연동
│
├── workers/
│   ├── error_logger.py     # 에러 로깅 + Slack 알림
│   └── ocr_worker.py       # Redis Stream Consumer
│
└── models/
    ├── document.py         # Pydantic 모델
    └── responses.py        # 응답 스키마
```

### 다음 단계
1. [ ] nginx 라우팅 설정 (n8n → FastAPI 전환)
2. [ ] OCRWorker PM2 프로세스 등록
3. [ ] 운영 환경 테스트
4. [ ] n8n 워크플로우 비활성화

---

## 태그 기록

| 태그 | 설명 | 커밋 |
|------|------|------|
| `pre-fastapi-migration` | 마이그레이션 시작 전 | 034efed1 |
| `fastapi-phase-1` | Phase 1 완료 | f440738c |
| `fastapi-phase-2` | Phase 2 완료 | 0ce58d35 |
| `fastapi-phase-3` | Phase 3 완료 | ec58f454 |
| `fastapi-phase-4` | Phase 4 완료 (마이그레이션 완료) | 600ae88b |

---

## 참고 사항

### 롤백 절차
```bash
# Phase 1 이전으로 롤백
git reset --hard pre-fastapi-migration

# 서비스 중지
ssh tars.giize.com 'pm2 delete document_pipeline'
```

### 환경 변수 설정
```bash
# 서버에서 .env 파일 생성
ssh tars.giize.com 'cd ~/aims/backend/api/document_pipeline && cp .env.example .env'
# .env 파일 편집하여 API 키 설정
```
