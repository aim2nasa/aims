# xPipeWeb v2 기술 설계서

**작성일**: 2026-03-19
**작성자**: Alex
**상태**: 설계 완료, 구현 대기
**목적**: v1 FAIL 판정(F1~F7) 해결 + R1~R5 구현

---

## 1. v1 실패 원인 요약 및 v2 해결 전략

| v1 문제 | 근본 원인 | v2 해결 |
|---------|----------|---------|
| F1 파이프라인 블랙박스 | 스테이지가 context에 데이터를 저장하지 않음 | 각 스테이지가 `stage_data`에 입력/출력 기록 |
| F2 텍스트 미표시 | ExtractStage가 빈 문자열 반환 | TXT 실제 읽기 + stub 명시 |
| F3 모델 미표시 | 모델 정보가 context/응답에 없음 | `models` 설정 → 스테이지 출력에 포함 |
| F4 모델 변경 불가 | config에 models 필드 없음 | `PUT /api/config`에 models 추가 |
| F5 의미 없는 stub 값 | stub 모드에서 실제인 척 하는 수치 | 모든 stub 값에 `(stub)` 표기, 품질 점수 `-` |
| F6 OCR 미표시 | OCR 경로가 아예 없음 | 이미지 → OCR 스테이지 분기 + 모델 표시 |
| F7 직관성 부족 | 데이터 흐름이 안 보임 | 스테이지별 입력→출력 펼침 UI |

---

## 2. 백엔드 API 스펙

### 2.1 엔드포인트 목록

| Method | Path | 설명 | 변경 |
|--------|------|------|------|
| `POST` | `/api/upload` | 단일 파일 업로드 + 파이프라인 실행 | **응답 구조 변경** |
| `POST` | `/api/upload/batch` | 다중 파일 업로드 | 유지 |
| `GET` | `/api/stages/{doc_id}` | **신규** — 스테이지별 상세 데이터 | **신규** |
| `GET` | `/api/text/{doc_id}` | **신규** — 추출된 텍스트 전문 | **신규** |
| `GET` | `/api/status/{doc_id}` | 처리 상태 조회 | **응답에 mode 추가** |
| `GET` | `/api/results/{doc_id}` | 처리 결과 조회 | **응답에 stage_data, mode, models 추가** |
| `GET` | `/api/documents` | 전체 문서 목록 | **응답에 mode, models 추가** |
| `GET` | `/api/events` | SSE 실시간 스트림 | **이벤트에 stage_data 포함** |
| `PUT` | `/api/config` | 설정 변경 | **models 필드 추가** |
| `GET` | `/api/config` | 현재 설정 조회 | **models, available_models 추가** |
| `GET` | `/api/benchmark` | 벤치마크 요약 | **mode 필드 추가** |
| `GET` | `/api/audit/{doc_id}` | 감사 로그 | 유지 |
| `GET` | `/api/cost` | 비용 요약 | 유지 |
| `POST` | `/api/retry/{doc_id}` | 재시도 | 유지 |
| `DELETE` | `/api/documents/{doc_id}` | 삭제 | 유지 |

---

### 2.2 `POST /api/upload` 응답

```jsonc
// 요청: multipart/form-data (file 필드)
// 응답 200:
{
    "doc_id": "a1b2c3d4",
    "filename": "보험증권.pdf",
    "status": "queued",
    "mode": "stub",            // 신규: "stub" | "real"
    "models": {                // 신규: 이 문서에 적용되는 모델 설정
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small"
    },
    "config": {                // 신규: 이 문서에 적용된 전체 설정 스냅샷
        "adapter": "insurance",
        "preset": "aims-insurance",
        "mode": "stub",
        "models": { "llm": "gpt-4o-mini", "ocr": "PaddleOCR", "embedding": "text-embedding-3-small" }
    }
}
```

---

### 2.3 `GET /api/stages/{doc_id}` (신규)

**v2 핵심 API** — R1(스테이지별 입력/출력) 직접 해결.

```jsonc
// 응답 200:
{
    "doc_id": "a1b2c3d4",
    "mode": "stub",
    "stages": [
        {
            "name": "ingest",
            "status": "completed",     // "pending" | "running" | "completed" | "skipped" | "error"
            "duration_ms": 12,
            "input": {
                "filename": "보험증권.pdf",
                "file_size": 2412544,
                "mime_type": "application/pdf"
            },
            "output": {
                "saved_path": "/tmp/xpipe_demo_xxx/a1b2c3d4_보험증권.pdf",
                "file_hash": "sha256:abc123..."
            }
        },
        {
            "name": "extract",
            "status": "completed",
            "duration_ms": 823,
            "input": {
                "file_path": "/tmp/xpipe_demo_xxx/a1b2c3d4_보험증권.pdf",
                "mime_type": "application/pdf"
            },
            "output": {
                "method": "pdfplumber",     // "pdfplumber" | "ocr" | "direct_read" | "stub"
                "text_length": 3247,
                "text_preview": "MetLife\n홍길동 고객님을 위한\nAnnual Review Report...",
                "ocr_model": null           // 이미지일 때만 값 있음
            }
        },
        {
            "name": "classify",
            "status": "completed",
            "duration_ms": 1230,
            "input": {
                "text_length": 3247,
                "adapter": "insurance"
            },
            "output": {
                "classification": "보험증권",
                "confidence": 0.92,           // stub이면: -1 (UI에서 "-" 표시)
                "confidence_display": "0.92",  // stub이면: "- (stub)"
                "model": "gpt-4o-mini",
                "model_display": "gpt-4o-mini (stub)",  // mode에 따라 접미사
                "cost": 0.002,
                "cost_display": "$0.002 (stub 추정)"    // stub이면 추정 표기
            }
        },
        {
            "name": "detect_special",
            "status": "completed",
            "duration_ms": 50,
            "input": {
                "text_length": 3247,
                "mime_type": "application/pdf"
            },
            "output": {
                "detections": [
                    {
                        "doc_type": "annual_report",
                        "confidence": 0.95,
                        "metadata": {
                            "customer_name": "홍길동",
                            "issue_date": "2026-01-15"
                        }
                    }
                ],
                "matched_keywords": {
                    "required": ["Annual Review Report"],
                    "optional": ["보유계약 현황", "MetLife"]
                }
            }
        },
        {
            "name": "embed",
            "status": "completed",
            "duration_ms": 2100,
            "input": {
                "text_length": 3247,
                "chunks": 3
            },
            "output": {
                "dimensions": 1536,
                "chunks": 3,
                "model": "text-embedding-3-small",
                "model_display": "text-embedding-3-small (stub)",
                "cost": 0.001,
                "cost_display": "$0.001 (stub 추정)"
            }
        },
        {
            "name": "complete",
            "status": "completed",
            "duration_ms": 10,
            "input": {
                "classification": "보험증권",
                "detections_count": 1
            },
            "output": {
                "display_name": "홍길동_AR_2026-01-15.pdf",
                "total_time_ms": 4225,
                "total_cost": 0.003,
                "total_cost_display": "$0.003 (stub 추정)"
            }
        }
    ]
}
```

**스킵된 스테이지 예시:**
```jsonc
{
    "name": "extract",
    "status": "skipped",
    "duration_ms": 0,
    "skip_reason": "has_text (텍스트가 이미 존재)",
    "input": null,
    "output": null
}
```

**에러 스테이지 예시:**
```jsonc
{
    "name": "classify",
    "status": "error",
    "duration_ms": 1500,
    "input": { "text_length": 3247, "adapter": "insurance" },
    "output": null,
    "error": {
        "type": "TimeoutError",
        "message": "OpenAI API 호출 타임아웃 (30초)",
        "recoverable": true
    }
}
```

---

### 2.4 `GET /api/text/{doc_id}` (신규)

R2(추출 텍스트 전문) 직접 해결.

```jsonc
// 응답 200:
{
    "doc_id": "a1b2c3d4",
    "mode": "stub",
    "has_text": true,
    "text": "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n...(전체 텍스트)...",
    "text_length": 3247,
    "extract_method": "pdfplumber",       // "pdfplumber" | "ocr" | "direct_read" | "stub"
    "extract_method_display": "pdfplumber",
    "ocr_model": null,                    // 이미지 OCR 시: "PaddleOCR (stub)"
    "note": null                          // stub일 때: "[stub] 실제 텍스트가 아닌 시뮬레이션입니다"
}
```

**stub 모드 + PDF 파일:**
```jsonc
{
    "doc_id": "a1b2c3d4",
    "mode": "stub",
    "has_text": true,
    "text": "[stub] 보험증권.pdf에서 추출된 텍스트 시뮬레이션\n\n이 텍스트는 stub 모드에서 생성된 시뮬레이션입니다.\n실제 텍스트를 보려면 real 모드를 사용하세요.",
    "text_length": 89,
    "extract_method": "stub",
    "extract_method_display": "stub (시뮬레이션)",
    "ocr_model": null,
    "note": "[stub] 실제 텍스트가 아닌 시뮬레이션입니다. real 모드에서 pdfplumber로 추출 가능합니다."
}
```

**stub 모드 + TXT 파일 (TXT는 stub에서도 실제 읽기):**
```jsonc
{
    "doc_id": "e5f6g7h8",
    "mode": "stub",
    "has_text": true,
    "text": "(실제 TXT 파일 내용)",
    "text_length": 1523,
    "extract_method": "direct_read",
    "extract_method_display": "직접 읽기 (TXT)",
    "ocr_model": null,
    "note": null
}
```

---

### 2.5 `PUT /api/config` (확장)

R3(모델 선택/변경) + R5(OCR 모델) 해결.

```jsonc
// 요청 body:
{
    "adapter": "insurance",          // 선택: "insurance" | "legal" | "none"
    "preset": "aims-insurance",      // 선택: "aims-insurance" | "minimal"
    "mode": "stub",                  // 신규: "stub" | "real"
    "models": {                      // 신규: 모델 설정
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small"
    }
}
```

```jsonc
// 응답 200:
{
    "config": {
        "adapter": "insurance",
        "preset": "aims-insurance",
        "mode": "stub",
        "quality_gate": true,
        "models": {
            "llm": "gpt-4o-mini",
            "ocr": "PaddleOCR",
            "embedding": "text-embedding-3-small"
        }
    },
    "message": "설정이 업데이트되었습니다 (다음 업로드부터 적용)"
}
```

### 2.6 `GET /api/config` (확장)

```jsonc
// 응답 200:
{
    "config": {
        "adapter": "insurance",
        "preset": "aims-insurance",
        "mode": "stub",
        "quality_gate": true,
        "models": {
            "llm": "gpt-4o-mini",
            "ocr": "PaddleOCR",
            "embedding": "text-embedding-3-small"
        }
    },
    "available_presets": [...],
    "available_adapters": ["insurance", "legal", "none"],
    "available_modes": ["stub", "real"],
    "available_models": {               // 신규: 선택 가능한 모델 목록
        "llm": [
            { "id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai" },
            { "id": "gpt-4o", "name": "GPT-4o", "provider": "openai" },
            { "id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic" },
            { "id": "claude-haiku", "name": "Claude Haiku", "provider": "anthropic" }
        ],
        "ocr": [
            { "id": "PaddleOCR", "name": "PaddleOCR", "provider": "local" },
            { "id": "Upstage", "name": "Upstage Document AI", "provider": "upstage" },
            { "id": "Tesseract", "name": "Tesseract OCR", "provider": "local" }
        ],
        "embedding": [
            { "id": "text-embedding-3-small", "name": "text-embedding-3-small", "provider": "openai" },
            { "id": "text-embedding-3-large", "name": "text-embedding-3-large", "provider": "openai" }
        ]
    }
}
```

---

### 2.7 `GET /api/results/{doc_id}` (확장)

```jsonc
// 응답 200:
{
    "id": "a1b2c3d4",
    "filename": "보험증권.pdf",
    "status": "completed",
    "mode": "stub",                     // 신규
    "models": {                         // 신규
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small"
    },
    "result": {
        "document_type": "보험증권",
        "classification_confidence": 0.92,       // stub이면 -1
        "classification_confidence_display": "0.92",  // stub이면 "- (stub)"
        "detections": [...],
        "text_length": 3247,
        "extract_method": "pdfplumber",
        "stages_executed": ["ingest", "extract", "classify", "detect_special", "embed", "complete"],
        "stages_skipped": []
    },
    "quality": null,            // stub 모드에서는 항상 null (R4: 의미 없는 값 제거)
    "cost": 0.003,
    "cost_display": "$0.003 (stub 추정)",  // 신규
    "duration": 4.225,
    "config": { ... }
}
```

**핵심 변경: stub 모드에서 `quality`는 `null`** (F5 해결. 의미 없는 가짜 품질 점수 제거.)

---

### 2.8 SSE 이벤트 구조 (확장)

```jsonc
// stage_start 이벤트
{
    "id": 1,
    "event_type": "stage_start",
    "document_id": "a1b2c3d4",
    "stage": "classify",
    "payload": {
        "pipeline": "aims-insurance",
        "mode": "stub",                  // 신규
        "model": "gpt-4o-mini (stub)"    // 신규: 이 스테이지에서 사용할 모델
    },
    "timestamp": "2026-03-19T12:00:01Z"
}

// stage_complete 이벤트 (v2 핵심 변경)
{
    "id": 2,
    "event_type": "stage_complete",
    "document_id": "a1b2c3d4",
    "stage": "classify",
    "payload": {
        "pipeline": "aims-insurance",
        "mode": "stub",
        "duration_ms": 1230,
        "stage_data": {                   // 신규: 스테이지 출력 데이터 요약
            "classification": "보험증권",
            "confidence_display": "0.92 (stub)",
            "model_display": "gpt-4o-mini (stub)",
            "cost_display": "$0.002 (stub 추정)"
        }
    },
    "timestamp": "2026-03-19T12:00:02Z"
}

// stage_skip 이벤트 (신규)
{
    "id": 3,
    "event_type": "stage_skip",
    "document_id": "a1b2c3d4",
    "stage": "extract",
    "payload": {
        "skip_reason": "has_text"
    },
    "timestamp": "2026-03-19T12:00:01Z"
}

// document_processed 이벤트
{
    "id": 10,
    "event_type": "document_processed",
    "document_id": "a1b2c3d4",
    "stage": "complete",
    "payload": {
        "document_type": "보험증권",
        "duration_ms": 4225,
        "mode": "stub",
        "display_name": "홍길동_AR_2026-01-15.pdf",
        "total_cost_display": "$0.003 (stub 추정)"
    },
    "timestamp": "2026-03-19T12:00:05Z"
}
```

---

## 3. context 데이터 구조 (스테이지별)

각 스테이지가 context에 저장하는 데이터를 정확히 정의한다. `context["stage_data"][stage_name]`에 입력/출력을 기록한다.

### 3.1 context 초기 구조 (업로드 시)

```python
context = {
    "document_id": "a1b2c3d4",
    "file_path": "/tmp/xpipe_demo_xxx/a1b2c3d4_보험증권.pdf",
    "filename": "보험증권.pdf",
    "original_name": "보험증권.pdf",
    "mode": "stub",                       # 신규
    "models": {                           # 신규
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small",
    },
    "stage_data": {},                     # 신규: 스테이지별 입력/출력 저장소
}
```

### 3.2 IngestStage 출력

```python
# context["stage_data"]["ingest"]
{
    "input": {
        "filename": "보험증권.pdf",
        "file_size": 2412544,
        "mime_type": "application/pdf",   # mimetypes.guess_type() 사용
    },
    "output": {
        "saved_path": "/tmp/xpipe_demo_xxx/a1b2c3d4_보험증권.pdf",
        "file_hash": "sha256:abc123...",  # hashlib.sha256 사용
    },
    "duration_ms": 12,
}

# context에 추가되는 키
context["ingested"] = True
context["mime_type"] = "application/pdf"
context["file_size"] = 2412544
```

**구현 방식**: `mimetypes.guess_type()`으로 MIME 감지, `hashlib.sha256`으로 해시 계산. 코어 수정 없이 스테이지 내부에서 처리.

### 3.3 ExtractStage 출력

```python
# context["stage_data"]["extract"]
{
    "input": {
        "file_path": "/tmp/xpipe_demo_xxx/a1b2c3d4_보험증권.pdf",
        "mime_type": "application/pdf",
    },
    "output": {
        "method": "stub",                    # "pdfplumber" | "ocr" | "direct_read" | "stub"
        "text_length": 89,                   # stub이면 시뮬레이션 텍스트 길이
        "text_preview": "[stub] 보험증권.pdf에서 추출된 텍스트...",  # 처음 200자
        "ocr_model": None,                   # 이미지 OCR 시: "PaddleOCR (stub)"
    },
    "duration_ms": 823,
}

# context에 추가되는 키
context["extracted"] = True
context["text"] = "(추출된 전체 텍스트)"
context["text_length"] = 3247
context["extract_method"] = "pdfplumber"
```

**mode별 동작:**

| 파일 유형 | stub 모드 | real 모드 |
|-----------|----------|----------|
| `.txt` | 실제 파일 읽기 (`direct_read`) | 실제 파일 읽기 (`direct_read`) |
| `.pdf` | 시뮬레이션 텍스트 (`stub`) | pdfplumber 추출 (`pdfplumber`) |
| 이미지 (jpg/png) | 시뮬레이션 텍스트 (`stub`) + OCR 모델명 표시 | OCR 실제 호출 (`ocr`) |
| 기타 (hwp/doc) | 시뮬레이션 텍스트 (`stub`) | 시뮬레이션 텍스트 (`stub`) + 미지원 표기 |

### 3.4 ClassifyStage 출력

```python
# context["stage_data"]["classify"]
{
    "input": {
        "text_length": 3247,
        "adapter": "insurance",
    },
    "output": {
        "classification": "보험증권",
        "confidence": -1,                # stub이면 -1, real이면 0.0~1.0
        "confidence_display": "- (stub)",
        "model": "gpt-4o-mini",
        "model_display": "gpt-4o-mini (stub)",
        "cost": 0.002,
        "cost_display": "$0.002 (stub 추정)",
    },
    "duration_ms": 1230,
}

# context에 추가되는 키
context["classified"] = True
context["document_type"] = "보험증권"
context["classification_confidence"] = -1   # stub
```

**stub 분류 로직**: 기존 `_stub_classify(filename)` 함수를 스테이지 내부로 이동. 파일명 기반 추정이지만, `confidence`는 `-1`로 표기하여 실제 AI 결과가 아님을 명시.

### 3.5 DetectSpecialStage 출력

```python
# context["stage_data"]["detect_special"]
{
    "input": {
        "text_length": 3247,
        "mime_type": "application/pdf",
        "filename": "보험증권.pdf",
    },
    "output": {
        "detections": [
            {
                "doc_type": "annual_report",
                "confidence": 0.95,
                "metadata": {
                    "customer_name": "홍길동",
                    "issue_date": "2026-01-15",
                }
            }
        ],
        "matched_keywords": {
            "required": ["Annual Review Report"],
            "optional": ["보유계약 현황", "MetLife"],
        },
        "detection_count": 1,
    },
    "duration_ms": 50,
}

# context에 추가되는 키
context["special_detected"] = True
context["detections"] = [...]
```

**핵심**: `InsuranceAdapter.detect_special_documents(text, mime_type, filename)` 실제 호출. 이 메서드는 AI가 아닌 pdfplumber 기반 규칙 매칭이므로, stub/real 구분 없이 항상 실제 로직 실행 가능. 단, adapter가 `none`이면 빈 결과.

### 3.6 EmbedStage 출력

```python
# context["stage_data"]["embed"]
{
    "input": {
        "text_length": 3247,
        "chunks": 3,         # ceil(text_length / 1000) 등 청킹 로직 결과
    },
    "output": {
        "dimensions": 1536,
        "chunks": 3,
        "model": "text-embedding-3-small",
        "model_display": "text-embedding-3-small (stub)",
        "cost": 0.001,
        "cost_display": "$0.001 (stub 추정)",
    },
    "duration_ms": 2100,
}

# context에 추가되는 키
context["embedded"] = True
```

### 3.7 CompleteStage 출력

```python
# context["stage_data"]["complete"]
{
    "input": {
        "classification": "보험증권",
        "detections_count": 1,
    },
    "output": {
        "display_name": "홍길동_AR_2026-01-15.pdf",
        "total_time_ms": 4225,
        "total_cost": 0.003,
        "total_cost_display": "$0.003 (stub 추정)",
    },
    "duration_ms": 10,
}

# context에 추가되는 키
context["completed"] = True
context["status"] = "completed"
context["display_name"] = "홍길동_AR_2026-01-15.pdf"
```

---

## 4. 모델 설정 구조

### 4.1 current_config 구조 (서버 인메모리)

```python
current_config: dict[str, Any] = {
    "adapter": "insurance",
    "preset": "aims-insurance",
    "quality_gate": True,
    "mode": "stub",                  # 신규: "stub" | "real" (v1의 "provider"를 대체)
    "models": {                      # 신규
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small",
    },
}
```

**변경 사항**: v1의 `provider` 필드를 `mode`로 이름 변경. "stub"/"real"의 의미를 더 직관적으로.

### 4.2 AVAILABLE_MODELS 상수

```python
AVAILABLE_MODELS = {
    "llm": [
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai"},
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic"},
        {"id": "claude-haiku", "name": "Claude Haiku", "provider": "anthropic"},
    ],
    "ocr": [
        {"id": "PaddleOCR", "name": "PaddleOCR", "provider": "local"},
        {"id": "Upstage", "name": "Upstage Document AI", "provider": "upstage"},
        {"id": "Tesseract", "name": "Tesseract OCR", "provider": "local"},
    ],
    "embedding": [
        {"id": "text-embedding-3-small", "name": "text-embedding-3-small", "provider": "openai"},
        {"id": "text-embedding-3-large", "name": "text-embedding-3-large", "provider": "openai"},
    ],
}
```

---

## 5. stub vs real 구분 규칙

### 5.1 원칙

모든 API 응답에 `mode` 필드를 포함하여 stub인지 real인지 명시한다.

### 5.2 표시 규칙

| 항목 | stub 모드 | real 모드 |
|------|----------|----------|
| 모델명 | `gpt-4o-mini (stub)` | `gpt-4o-mini` |
| confidence | `-1` (표시: `- (stub)`) | `0.0~1.0` (실제 값) |
| 비용 | `$0.002 (stub 추정)` | `$0.002` |
| 품질 점수 | `null` (표시 안 함) | 실제 평가 결과 |
| 텍스트(PDF) | `[stub] 시뮬레이션 텍스트` | 실제 추출 텍스트 |
| 텍스트(TXT) | 실제 파일 내용 | 실제 파일 내용 |
| 감지(detect) | 실제 로직 실행 (규칙 기반) | 실제 로직 실행 |
| OCR 모델 | `PaddleOCR (stub)` | `PaddleOCR` |

### 5.3 `_display` 접미사 필드 규칙

모든 수치/모델 관련 출력에 `xxx_display` 필드를 함께 제공한다. 프론트엔드는 항상 `_display` 필드를 렌더링하면 된다.

```python
def _format_display(value, label: str, mode: str) -> str:
    """표시용 문자열 생성"""
    if mode == "stub":
        if isinstance(value, (int, float)) and value < 0:
            return f"- (stub)"
        return f"{value} (stub)"
    return str(value)

def _format_cost_display(cost: float, mode: str) -> str:
    """비용 표시용"""
    if mode == "stub":
        return f"${cost:.3f} (stub 추정)"
    return f"${cost:.3f}"

def _format_model_display(model: str, mode: str) -> str:
    """모델명 표시용"""
    if mode == "stub":
        return f"{model} (stub)"
    return model
```

---

## 6. 스테이지 구현 상세

**원칙**: xpipe 코어 모듈(`pipeline.py`, `stage.py`, `events.py`, `adapter.py` 등)은 수정하지 않는다. `server.py`와 `stages/*.py`의 내장 스테이지만 수정한다.

### 6.1 IngestStage 변경

```python
# xpipe/stages/ingest.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import hashlib
    import mimetypes
    import os
    import time

    start = time.monotonic()

    file_path = context.get("file_path", "")
    filename = context.get("filename", "")

    # MIME 감지
    mime_type, _ = mimetypes.guess_type(filename)
    mime_type = mime_type or "application/octet-stream"

    # 파일 크기
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    # 해시 계산
    file_hash = ""
    if os.path.exists(file_path):
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        file_hash = f"sha256:{h.hexdigest()[:16]}"

    duration_ms = int((time.monotonic() - start) * 1000)

    # context 갱신
    context["ingested"] = True
    context["mime_type"] = mime_type
    context["file_size"] = file_size

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["ingest"] = {
        "input": {
            "filename": filename,
            "file_size": file_size,
            "mime_type": mime_type,
        },
        "output": {
            "saved_path": file_path,
            "file_hash": file_hash,
        },
        "duration_ms": duration_ms,
    }

    return context
```

### 6.2 ExtractStage 변경

```python
# xpipe/stages/extract.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import time

    start = time.monotonic()
    file_path = context.get("file_path", "")
    filename = context.get("filename", "")
    mime_type = context.get("mime_type", "application/octet-stream")
    mode = context.get("mode", "stub")
    models = context.get("models", {})

    text = ""
    method = "stub"
    ocr_model = None

    # TXT 파일: 항상 실제 읽기
    if filename.lower().endswith(".txt"):
        try:
            # 인코딩 자동 감지 시도
            for enc in ("utf-8", "cp949", "euc-kr", "latin-1"):
                try:
                    with open(file_path, "r", encoding=enc) as f:
                        text = f.read()
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            method = "direct_read"
        except Exception:
            text = f"[오류] {filename} 읽기 실패"
            method = "stub"

    # PDF 파일
    elif mime_type == "application/pdf":
        if mode == "real":
            # pdfplumber 사용 (서버에 설치된 경우)
            try:
                import pdfplumber
                with pdfplumber.open(file_path) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            pages_text.append(page_text)
                    text = "\n".join(pages_text)
                method = "pdfplumber"
            except ImportError:
                text = f"[stub] pdfplumber 미설치. pip install pdfplumber 필요."
                method = "stub"
            except Exception as e:
                text = f"[오류] PDF 텍스트 추출 실패: {e}"
                method = "stub"
        else:
            text = f"[stub] {filename}에서 추출된 텍스트 시뮬레이션\n\n이 텍스트는 stub 모드에서 생성된 시뮬레이션입니다.\n실제 텍스트를 보려면 real 모드를 사용하세요."
            method = "stub"

    # 이미지 파일
    elif mime_type and mime_type.startswith("image/"):
        ocr_model_name = models.get("ocr", "PaddleOCR")
        if mode == "real":
            # OCR 실제 호출 (향후 구현)
            text = f"[미구현] {ocr_model_name} OCR 실제 호출은 향후 구현 예정"
            method = "ocr"
            ocr_model = ocr_model_name
        else:
            text = f"[stub] {filename}에서 OCR({ocr_model_name})로 추출된 텍스트 시뮬레이션"
            method = "stub"
            ocr_model = f"{ocr_model_name} (stub)"

    # 기타 파일
    else:
        text = f"[stub] {filename} ({mime_type}) — 텍스트 추출 미지원"
        method = "stub"

    duration_ms = int((time.monotonic() - start) * 1000)

    # context 갱신
    context["extracted"] = True
    context["text"] = text
    context["text_length"] = len(text)
    context["extract_method"] = method

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["extract"] = {
        "input": {
            "file_path": file_path,
            "mime_type": mime_type,
        },
        "output": {
            "method": method,
            "text_length": len(text),
            "text_preview": text[:200],
            "ocr_model": ocr_model,
        },
        "duration_ms": duration_ms,
    }

    return context
```

### 6.3 ClassifyStage 변경

```python
# xpipe/stages/classify.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import time

    start = time.monotonic()
    mode = context.get("mode", "stub")
    models = context.get("models", {})
    llm_model = models.get("llm", "gpt-4o-mini")
    adapter_name = context.get("_stage_config", {}).get("adapter", "insurance")
    # adapter_name은 server.py에서 context에 주입
    text = context.get("text", "")
    filename = context.get("filename", "")

    if mode == "real":
        # 실제 AI 분류 (향후 구현)
        classification = "general"
        confidence = 0.0
        cost = 0.0
    else:
        # stub 분류 (파일명 기반)
        classification = _stub_classify(filename)
        confidence = -1  # stub을 명시적으로 표현
        cost = 0.002     # stub 추정 비용

    duration_ms = int((time.monotonic() - start) * 1000)

    # context 갱신
    context["classified"] = True
    context["document_type"] = classification
    context["classification_confidence"] = confidence

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["classify"] = {
        "input": {
            "text_length": len(text),
            "adapter": adapter_name,
        },
        "output": {
            "classification": classification,
            "confidence": confidence,
            "confidence_display": f"{confidence:.2f}" if confidence >= 0 else "- (stub)",
            "model": llm_model,
            "model_display": f"{llm_model} (stub)" if mode == "stub" else llm_model,
            "cost": cost,
            "cost_display": f"${cost:.3f} (stub 추정)" if mode == "stub" else f"${cost:.3f}",
        },
        "duration_ms": duration_ms,
    }

    return context


def _stub_classify(filename: str) -> str:
    """파일명 기반 stub 분류"""
    fn = filename.lower()
    mapping = [
        (["보험", "증권", "policy"], "보험증권"),
        (["계약", "contract"], "계약서"),
        (["청구", "claim"], "보험금청구서"),
        (["ar", "annual", "연간"], "연간보고서"),
        (["crs", "review", "검토"], "고객검토서"),
        (["진단", "medical"], "진단서"),
    ]
    for keywords, doc_type in mapping:
        if any(k in fn for k in keywords):
            return doc_type
    return "일반문서"
```

### 6.4 DetectSpecialStage 변경

```python
# xpipe/stages/detect_special.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import time

    start = time.monotonic()
    text = context.get("text", "")
    mime_type = context.get("mime_type", "application/octet-stream")
    filename = context.get("filename", "")

    detections = []
    matched_keywords = {"required": [], "optional": []}

    # InsuranceAdapter.detect_special_documents() 호출 시도
    # 이 메서드는 규칙 기반(AI 불필요)이므로 stub/real 구분 없이 실행 가능
    try:
        # 어댑터 임포트는 server.py에서 선택적으로 수행
        adapter = context.get("_adapter")
        if adapter and hasattr(adapter, "detect_special_documents"):
            raw_detections = await adapter.detect_special_documents(
                text=text, mime_type=mime_type, filename=filename
            )
            for det in raw_detections:
                detections.append({
                    "doc_type": det.doc_type,
                    "confidence": det.confidence,
                    "metadata": det.metadata,
                })
            # 키워드 매칭 정보는 metadata에서 추출
            if detections:
                for det in detections:
                    meta = det.get("metadata", {})
                    matched_keywords["required"] = meta.get("required_keywords", [])
                    matched_keywords["optional"] = meta.get("optional_keywords", [])
    except Exception:
        pass  # 어댑터 없으면 빈 결과

    duration_ms = int((time.monotonic() - start) * 1000)

    # context 갱신
    context["special_detected"] = True
    context["detections"] = detections

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["detect_special"] = {
        "input": {
            "text_length": len(text),
            "mime_type": mime_type,
            "filename": filename,
        },
        "output": {
            "detections": detections,
            "matched_keywords": matched_keywords,
            "detection_count": len(detections),
        },
        "duration_ms": duration_ms,
    }

    return context
```

### 6.5 EmbedStage 변경

```python
# xpipe/stages/embed.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import math
    import time

    start = time.monotonic()
    mode = context.get("mode", "stub")
    models = context.get("models", {})
    embed_model = models.get("embedding", "text-embedding-3-small")
    text = context.get("text", "")

    # 청킹 (단순 분할)
    chunk_size = 1000
    chunks = max(1, math.ceil(len(text) / chunk_size)) if text else 1

    # 차원 (모델에 따라)
    dimensions_map = {
        "text-embedding-3-small": 1536,
        "text-embedding-3-large": 3072,
    }
    dimensions = dimensions_map.get(embed_model, 1536)

    cost = 0.001 * chunks  # stub 추정

    duration_ms = int((time.monotonic() - start) * 1000)

    # context 갱신
    context["embedded"] = True

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["embed"] = {
        "input": {
            "text_length": len(text),
            "chunks": chunks,
        },
        "output": {
            "dimensions": dimensions,
            "chunks": chunks,
            "model": embed_model,
            "model_display": f"{embed_model} (stub)" if mode == "stub" else embed_model,
            "cost": cost,
            "cost_display": f"${cost:.3f} (stub 추정)" if mode == "stub" else f"${cost:.3f}",
        },
        "duration_ms": duration_ms,
    }

    return context
```

### 6.6 CompleteStage 변경

```python
# xpipe/stages/complete.py
async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
    import time

    start = time.monotonic()
    mode = context.get("mode", "stub")

    classification = context.get("document_type", "general")
    detections = context.get("detections", [])
    filename = context.get("filename", "")

    # 표시명 생성
    display_name = filename
    if detections:
        det = detections[0]
        meta = det.get("metadata", {})
        customer = meta.get("customer_name", "")
        date = meta.get("issue_date", "")
        doc_type = det.get("doc_type", "")
        type_label = {"annual_report": "AR", "customer_review": "CRS"}.get(doc_type, "")
        if customer and type_label:
            display_name = f"{customer}_{type_label}"
            if date:
                display_name += f"_{date}"
            display_name += ".pdf"

    # 총 비용 합산
    stage_data = context.get("stage_data", {})
    total_cost = 0.0
    total_time_ms = 0
    for sd in stage_data.values():
        total_cost += sd.get("output", {}).get("cost", 0)
        total_time_ms += sd.get("duration_ms", 0)

    duration_ms = int((time.monotonic() - start) * 1000)
    total_time_ms += duration_ms

    # context 갱신
    context["completed"] = True
    context["status"] = "completed"
    context["display_name"] = display_name

    # stage_data 기록
    context.setdefault("stage_data", {})
    context["stage_data"]["complete"] = {
        "input": {
            "classification": classification,
            "detections_count": len(detections),
        },
        "output": {
            "display_name": display_name,
            "total_time_ms": total_time_ms,
            "total_cost": round(total_cost, 6),
            "total_cost_display": f"${total_cost:.3f} (stub 추정)" if mode == "stub" else f"${total_cost:.3f}",
        },
        "duration_ms": duration_ms,
    }

    return context
```

---

## 7. server.py 변경 사항

### 7.1 current_config 구조 변경

```python
# Before (v1)
current_config = {
    "adapter": "insurance",
    "preset": "aims-insurance",
    "quality_gate": True,
    "provider": "stub",          # 삭제
}

# After (v2)
current_config = {
    "adapter": "insurance",
    "preset": "aims-insurance",
    "quality_gate": True,
    "mode": "stub",              # "provider" → "mode" 이름 변경
    "models": {                  # 신규
        "llm": "gpt-4o-mini",
        "ocr": "PaddleOCR",
        "embedding": "text-embedding-3-small",
    },
}
```

### 7.2 `_run_pipeline()` 변경

핵심 변경: context에 `mode`, `models`를 주입하고, 파이프라인 실행 후 `stage_data`를 문서 상태에 저장한다.

```python
async def _run_pipeline(doc_id: str, file_path: str, filename: str) -> None:
    # ... (기존 초기화)

    # v2: context에 mode, models 주입
    context = {
        "document_id": doc_id,
        "file_path": file_path,
        "filename": filename,
        "original_name": filename,
        "mode": doc["config"]["mode"],
        "models": doc["config"]["models"],
        "stage_data": {},
    }

    # ... (파이프라인 실행)
    result = await pipeline.run(context)

    # v2: stage_data를 문서 상태에 저장
    doc["stage_data"] = result.get("stage_data", {})
    doc["text"] = result.get("text", "")
    doc["text_length"] = result.get("text_length", 0)
    doc["extract_method"] = result.get("extract_method", "stub")

    # v2: stub 모드에서 quality는 null
    if doc["config"]["mode"] == "stub":
        doc["quality"] = None
    elif current_config.get("quality_gate"):
        # real 모드에서만 품질 평가
        score = quality_gate.evaluate({...})
        doc["quality"] = {...}

    # ... (나머지 결과 반영)
```

### 7.3 신규 API 라우트

```python
@app.get("/api/stages/{doc_id}")
async def get_stages(doc_id: str):
    """스테이지별 상세 데이터 (R1)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    stage_data = doc.get("stage_data", {})
    preset_data = get_preset(doc["config"]["preset"])
    stage_names = [s["name"] for s in preset_data["stages"]]

    stages = []
    for name in stage_names:
        sd = stage_data.get(name)
        detail = doc.get("stages_detail", {}).get(name, {})

        if sd:
            stages.append({
                "name": name,
                "status": detail.get("status", "completed"),
                "duration_ms": sd.get("duration_ms", 0),
                "input": sd.get("input"),
                "output": sd.get("output"),
            })
        else:
            # 아직 실행 안 됨 또는 스킵됨
            stages.append({
                "name": name,
                "status": detail.get("status", "pending"),
                "duration_ms": 0,
                "input": None,
                "output": None,
                "skip_reason": detail.get("skip_reason"),
            })

    return {
        "doc_id": doc_id,
        "mode": doc["config"].get("mode", "stub"),
        "stages": stages,
    }


@app.get("/api/text/{doc_id}")
async def get_text(doc_id: str):
    """추출된 텍스트 전문 (R2)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    text = doc.get("text", "")
    mode = doc["config"].get("mode", "stub")
    method = doc.get("extract_method", "stub")

    # OCR 모델 정보
    extract_sd = doc.get("stage_data", {}).get("extract", {})
    ocr_model = extract_sd.get("output", {}).get("ocr_model")

    # stub 안내 메시지
    note = None
    if method == "stub":
        note = "[stub] 실제 텍스트가 아닌 시뮬레이션입니다. real 모드에서 추출 가능합니다."

    # 추출 방법 표시명
    method_display_map = {
        "pdfplumber": "pdfplumber",
        "ocr": f"OCR ({ocr_model})" if ocr_model else "OCR",
        "direct_read": "직접 읽기 (TXT)",
        "stub": "stub (시뮬레이션)",
    }

    return {
        "doc_id": doc_id,
        "mode": mode,
        "has_text": bool(text),
        "text": text,
        "text_length": len(text),
        "extract_method": method,
        "extract_method_display": method_display_map.get(method, method),
        "ocr_model": ocr_model,
        "note": note,
    }
```

### 7.4 ConfigUpdate 모델 변경

```python
class ConfigUpdate(BaseModel):
    adapter: Optional[str] = None
    preset: Optional[str] = None
    quality_gate: Optional[bool] = None
    mode: Optional[str] = None            # v1의 "provider" 대체
    models: Optional[dict[str, str]] = None  # 신규

# PUT /api/config 핸들러에서:
if body.mode is not None:
    if body.mode not in ("stub", "real"):
        raise HTTPException(400, f"유효하지 않은 모드: {body.mode}")
    current_config["mode"] = body.mode

if body.models is not None:
    # 유효성 검증
    valid_model_ids = {
        category: {m["id"] for m in models}
        for category, models in AVAILABLE_MODELS.items()
    }
    for category, model_id in body.models.items():
        if category not in valid_model_ids:
            raise HTTPException(400, f"유효하지 않은 모델 카테고리: {category}")
        if model_id not in valid_model_ids[category]:
            raise HTTPException(400, f"유효하지 않은 모델: {category}={model_id}")
    current_config["models"].update(body.models)
```

---

## 8. 문서 상태 구조 (인메모리)

```python
documents[doc_id] = {
    "id": doc_id,
    "filename": file.filename,
    "file_size": len(content),
    "file_path": file_path,
    "status": "queued",            # "queued" | "processing" | "completed" | "error"
    "progress": 0,
    "current_stage": None,
    "stages_detail": {...},         # 기존 유지
    "stage_data": {},               # 신규: 스테이지별 입력/출력 데이터
    "text": "",                     # 신규: 추출된 전체 텍스트
    "text_length": 0,               # 신규
    "extract_method": "stub",       # 신규
    "result": None,
    "quality": None,                # stub 모드에서는 항상 None
    "cost": 0.0,
    "error": None,
    "created_at": time.time(),
    "started_at": None,
    "completed_at": None,
    "duration": None,
    "config": {                     # 업로드 시점의 설정 스냅샷
        "adapter": "insurance",
        "preset": "aims-insurance",
        "mode": "stub",
        "quality_gate": True,
        "models": {...},
    },
}
```

---

## 9. 영향 분석

### 수정 대상 파일

| 파일 | 변경 유형 | 변경 범위 |
|------|----------|----------|
| `xpipe/console/web/server.py` | **대규모 수정** | config 구조, upload 응답, 신규 API 2개, _run_pipeline, SSE 이벤트 |
| `xpipe/stages/ingest.py` | **수정** | stage_data 기록 + MIME/해시 계산 |
| `xpipe/stages/extract.py` | **수정** | TXT 읽기, stub/real 분기, stage_data 기록 |
| `xpipe/stages/classify.py` | **수정** | _stub_classify 이동, 모델 표시, stage_data 기록 |
| `xpipe/stages/detect_special.py` | **수정** | 어댑터 연동, 키워드 매칭, stage_data 기록 |
| `xpipe/stages/embed.py` | **수정** | 모델/차원 매핑, stage_data 기록 |
| `xpipe/stages/complete.py` | **수정** | 표시명 생성, 비용 합산, stage_data 기록 |
| `xpipe/console/web/index.html` | **대규모 수정** | R1~R5 UI 반영 |
| `xpipe/console/web/style.css` | **대규모 수정** | 새 UI 스타일 |
| `xpipe/console/web/app.js` | **대규모 수정** | 새 API 호출, SSE 처리, 데이터 렌더링 |

### 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `xpipe/pipeline.py` | 코어 모듈 — 수정 금지 |
| `xpipe/stage.py` | 코어 ABC — 수정 금지 |
| `xpipe/events.py` | 코어 EventBus — 수정 금지 |
| `xpipe/adapter.py` | 코어 ABC — 수정 금지 |
| `xpipe/audit.py` | 코어 모듈 — 수정 금지 |
| `xpipe/cost_tracker.py` | 코어 모듈 — 수정 금지 |
| `xpipe/quality.py` | 코어 모듈 — 수정 금지 |
| `xpipe/pipeline_presets.py` | 코어 모듈 — 수정 금지 |

---

## 10. 설계 결정 근거

| # | 결정 | 근거 |
|---|------|------|
| D1 | `stage_data`를 context dict에 저장 | 코어 Pipeline은 context dict를 순회 전달. 새 키 추가는 코어 수정 없이 가능 |
| D2 | `_display` 접미사 필드 | 프론트엔드가 stub/real 분기 로직을 가질 필요 없음. 서버가 표시용 문자열 생성 |
| D3 | `confidence = -1` (stub) | `0.0`은 실제 낮은 confidence와 구분 불가. `-1`은 "측정하지 않음" 의미 |
| D4 | `quality = null` (stub) | F5(의미 없는 값) 근본 해결. stub에서 품질 점수 자체를 생성하지 않음 |
| D5 | TXT는 stub에서도 실제 읽기 | 단순 파일 읽기는 외부 의존 없음. stub 모드의 목적(AI API 키 불필요)에 부합 |
| D6 | `provider` → `mode` 이름 변경 | "provider"는 AI 제공사 의미로 혼동. "mode"가 stub/real 동작 방식을 더 직관적으로 표현 |
| D7 | detect_special은 stub/real 구분 없음 | 규칙 기반 매칭(pdfplumber)이므로 AI 불필요. 항상 실제 로직 실행 |
