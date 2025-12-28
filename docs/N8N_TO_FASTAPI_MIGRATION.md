# n8n → FastAPI 마이그레이션 전략

> 작성일: 2025-12-28
> 최종 수정: 2025-12-28
> 목적: n8n 워크플로우를 FastAPI로 점진적 마이그레이션

---

## 0. 요약

| 항목 | 값 |
|------|-----|
| 마이그레이션 대상 | **8개** 워크플로우 |
| 제외 (미사용) | DocReadAI |
| 예상 기간 | 약 2.5-3주 |
| 전략 | Strangler Fig Pattern (점진적 교체) |

---

## 1. 현재 상황

### 1.1 워크플로우 목록

#### 마이그레이션 대상 (8개)

| 워크플로우 | 용도 | 트리거 | 복잡도 |
|-----------|------|--------|--------|
| DocUpload | 파일 저장 | Webhook POST | ⭐ 낮음 |
| DocSummary | 텍스트 요약 | Webhook POST | ⭐ 낮음 |
| ErrorLogger | 에러 로깅 | Error Trigger | ⭐ 낮음 |
| DocOCR | Upstage OCR | Webhook POST | ⭐⭐ 중간 |
| DocMeta | 메타데이터 추출 | Webhook POST | ⭐⭐ 중간 |
| SmartSearch | 문서 검색 | Webhook POST | ⭐⭐ 중간 |
| OCRWorker | Redis 큐 처리 | Schedule (5초) | ⭐⭐⭐ 높음 |
| DocPrepMain | 메인 오케스트레이터 | Webhook POST | ⭐⭐⭐ 높음 |

#### 제외 (삭제 예정)

| 워크플로우 | 상태 | 사유 |
|-----------|------|------|
| DocReadAI | ❌ 미사용 | 다른 워크플로우에서 호출하지 않음. n8n에서 비활성화/삭제 권장 |

### 1.2 외부 연동

| 서비스 | 용도 | 사용 워크플로우 |
|--------|------|----------------|
| MongoDB | 문서 메타데이터 저장 | DocPrepMain, OCRWorker, SmartSearch |
| Redis Stream | OCR 작업 큐 | DocPrepMain, OCRWorker |
| Upstage AI | OCR 처리 | DocOCR |
| OpenAI | 요약 생성 | DocSummary |
| Slack | 에러 알림 | ErrorLogger |
| Google Sheets | 에러 로깅 | ErrorLogger |

### 1.3 데이터 흐름

```
업로드 요청
    │
    ▼
DocPrepMain ──► DocUpload (파일 저장)
    │
    ▼
DocPrepMain ──► DocMeta (메타 추출) ──► DocSummary (요약)
    │
    ▼
DocPrepMain ──► Redis Stream (OCR 큐잉)
    │
    ▼
OCRWorker (5초 폴링) ──► DocOCR (Upstage) ──► DocSummary (요약)
    │
    ▼
MongoDB 저장 + 처리 완료 알림
```

---

## 2. 마이그레이션 전략

### 2.1 Strangler Fig Pattern (점진적 교체)

기존 n8n을 유지하면서 FastAPI로 하나씩 교체하는 방식.

```
┌─────────────────────────────────────────────────────────────┐
│                    병행 운영 아키텍처                        │
│                                                             │
│  ┌─────────┐                         ┌─────────┐           │
│  │  n8n    │◄────── nginx ──────────►│ FastAPI │           │
│  │ (기존)   │      (라우터)            │  (신규)  │           │
│  └────┬────┘                         └────┬────┘           │
│       │                                   │                 │
│       └───────────┬───────────────────────┘                 │
│                   ▼                                         │
│           동일한 MongoDB / Redis                            │
└─────────────────────────────────────────────────────────────┘
```

**장점:**
- 롤백이 즉시 가능 (nginx 설정만 변경)
- 하나씩 검증하며 이전
- 서비스 중단 없음

### 2.2 마이그레이션 순서 (의존성 기반)

```
Phase 1: 독립 모듈 (의존성 없음) ─────────────── 3-4일
├── DocUpload      ← 파일 저장만 담당 (가장 단순)
├── DocSummary     ← 텍스트→요약 변환만
└── ErrorLogger    ← 로깅만 담당

Phase 2: OCR 파이프라인 ──────────────────────── 3-4일
├── DocOCR         ← Upstage API 연동
└── DocMeta        ← 메타데이터 추출 + DocSummary 호출

Phase 3: 워커 + 검색 ─────────────────────────── 3-4일
├── OCRWorker      ← Redis Consumer + 비동기 처리
└── SmartSearch    ← MongoDB 쿼리

Phase 4: 메인 오케스트레이터 ─────────────────── 4-5일
└── DocPrepMain    ← 전체 흐름 조율

검증 및 안정화 ───────────────────────────────── 2-3일
└── 병행 운영 + E2E 테스트

────────────────────────────────────────────────
총 예상 기간: 약 2.5-3주 (8개 워크플로우)
```

### 2.3 DocReadAI 처리

DocReadAI는 **마이그레이션 대상에서 제외**합니다.

- **현황**: n8n에 워크플로우 존재하나 어디서도 호출하지 않음
- **조치**: 마이그레이션 완료 후 n8n에서 삭제
- **대안**: 향후 필요 시 FastAPI에서 새로 구현

---

## 3. FastAPI 프로젝트 구조

```
backend/api/document_pipeline/
├── main.py                    # FastAPI 앱 진입점
├── config.py                  # 설정 (DB, Redis, API Keys)
├── dependencies.py            # 의존성 주입
│
├── routers/
│   ├── __init__.py
│   ├── doc_upload.py          # POST /webhook/docupload
│   ├── doc_meta.py            # POST /webhook/docmeta
│   ├── doc_ocr.py             # POST /webhook/dococr
│   ├── doc_summary.py         # POST /webhook/docsummary
│   ├── doc_prep_main.py       # POST /webhook/docprep-main
│   └── smart_search.py        # POST /webhook/smartsearch
│
├── workers/
│   ├── __init__.py
│   ├── ocr_worker.py          # Redis consumer (APScheduler)
│   └── error_logger.py        # 에러 처리
│
├── services/
│   ├── __init__.py
│   ├── file_service.py        # 파일 저장/읽기
│   ├── mongo_service.py       # MongoDB CRUD
│   ├── redis_service.py       # Redis Stream 연산
│   ├── upstage_service.py     # Upstage OCR API
│   ├── openai_service.py      # OpenAI API (요약)
│   └── notification_service.py # Slack, Google Sheets
│
├── models/
│   ├── __init__.py
│   ├── document.py            # Pydantic 모델
│   └── responses.py           # 응답 스키마
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py            # pytest fixtures
│   ├── test_compatibility.py  # n8n vs FastAPI 비교 테스트
│   ├── test_doc_upload.py
│   ├── test_doc_meta.py
│   └── ...
│
├── requirements.txt
├── Dockerfile
└── deploy_document_pipeline.sh
```

---

## 4. API 호환성 명세

### 4.1 DocUpload

```python
# 요청
POST /webhook/docupload
Content-Type: multipart/form-data

file: <binary>
source_path: string (optional)
userId: string (required)
customerId: string (optional)

# 성공 응답
{
    "result": "success",
    "original": "document.pdf",
    "sourcePath": "/path/to/source",
    "saved_name": "250128143052_abcd1234.pdf",
    "path": "/data/files/users/user123/2025/01/250128143052_abcd1234.pdf"
}

# 에러 응답
{
    "result": "error",
    "code": "REQUEST_INVALID",
    "message": "No file provided"
}
```

### 4.2 DocMeta

```python
# 요청
POST /webhook/docmeta
Content-Type: multipart/form-data OR application/json

# 바이너리 모드
file: <binary>

# 경로 모드
{
    "path": "/data/files/...",
    "owner_id": "user123",
    "document_id": "507f1f77bcf86cd799439011"
}

# 성공 응답
{
    "filename": "document.pdf",
    "extension": ".pdf",
    "mime": "application/pdf",
    "size_bytes": 123456,
    "created_at": "2025-01-28T14:30:00Z",
    "status": "OK",
    "pdf_pages": 5,
    "extracted_text": "문서 내용...",
    "summary": "3-5줄 요약",
    "tags": ["키워드1", "키워드2"],
    "file_hash": "abc123..."
}
```

### 4.3 DocSummary

```python
# 요청
POST /webhook/docsummary
Content-Type: application/json

{
    "full_text": "전체 문서 텍스트...",
    "user_id": "user123",
    "document_id": "507f1f77bcf86cd799439011"
}

# 성공 응답
{
    "summary": "문서 요약 내용 (3-5줄)",
    "length": 150,
    "truncated": false,
    "tags": ["태그1", "태그2", "태그3"]
}
```

### 4.4 DocOCR

```python
# 요청
POST /webhook/dococr
Content-Type: multipart/form-data

file: <binary>

# 성공 응답
{
    "status": 200,
    "error": false,
    "userMessage": "OCR 성공",
    "confidence": 0.95,
    "summary": "OCR 결과 요약",
    "tags": ["태그1", "태그2"],
    "full_text": "OCR 추출 텍스트",
    "num_pages": 5,
    "pages": [...]
}

# 에러 응답
{
    "status": 500,
    "error": true,
    "userMessage": "OCR 처리 실패"
}
```

---

## 5. 테스트 전략

### 5.1 테스트 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                        테스트 피라미드                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐                                         │
│  │   E2E 비교 테스트   │  ← n8n vs FastAPI 실제 호출 비교        │
│  │    (소수, 느림)     │                                         │
│  └────────────────────┘                                         │
│           ▲                                                      │
│  ┌────────────────────────────┐                                 │
│  │    계약 테스트 (Contract)   │  ← 요청/응답 스키마 검증         │
│  │       (중간, 중간)          │                                 │
│  └────────────────────────────┘                                 │
│           ▲                                                      │
│  ┌────────────────────────────────────┐                         │
│  │      단위 테스트 + Mock 서비스      │  ← 외부 의존성 격리      │
│  │          (다수, 빠름)               │                         │
│  └────────────────────────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 골든 파일 테스트 (Golden File Testing)

n8n 워크플로우의 예상 입출력을 JSON 파일로 저장하고, FastAPI 구현이 동일한 출력을 생성하는지 검증.

```
tests/
├── golden_files/
│   ├── doc_upload/
│   │   ├── success_pdf.input.json      # 요청 데이터
│   │   ├── success_pdf.output.json     # n8n 예상 응답
│   │   ├── error_no_file.input.json
│   │   └── error_no_file.output.json
│   ├── doc_meta/
│   │   ├── pdf_with_text.input.json
│   │   └── pdf_with_text.output.json
│   └── doc_summary/
│       ├── korean_text.input.json
│       └── korean_text.output.json
```

```python
# tests/test_golden_files.py

import pytest
import json
from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "golden_files"

class TestDocUploadGolden:
    """골든 파일 기반 DocUpload 테스트"""

    @pytest.fixture
    def golden_cases(self):
        """골든 파일에서 테스트 케이스 로드"""
        cases = []
        doc_upload_dir = GOLDEN_DIR / "doc_upload"
        for input_file in doc_upload_dir.glob("*.input.json"):
            output_file = input_file.with_suffix("").with_suffix(".output.json")
            if output_file.exists():
                cases.append({
                    "name": input_file.stem.replace(".input", ""),
                    "input": json.loads(input_file.read_text()),
                    "expected": json.loads(output_file.read_text())
                })
        return cases

    def test_all_golden_cases(self, golden_cases, fastapi_client):
        """모든 골든 케이스 검증"""
        for case in golden_cases:
            response = fastapi_client.post(
                "/webhook/docupload",
                **case["input"]
            )

            # 동적 필드 제외하고 비교 (timestamp, path 등)
            actual = self._normalize_response(response.json())
            expected = self._normalize_response(case["expected"])

            assert actual == expected, f"Failed: {case['name']}"

    def _normalize_response(self, resp):
        """비교를 위해 동적 필드 제거"""
        excluded = ["path", "saved_name", "timestamp", "uploaded_at"]
        return {k: v for k, v in resp.items() if k not in excluded}
```

### 5.3 Mock 서비스 전략

외부 의존성을 Mock으로 대체하여 빠르고 안정적인 테스트 수행.

```python
# tests/conftest.py

import pytest
from unittest.mock import AsyncMock, patch
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis

# ============================================
# MongoDB Mock
# ============================================
@pytest.fixture
def mock_mongodb():
    """MongoDB 작업 Mock"""
    with patch("services.mongo_service.get_collection") as mock:
        collection = AsyncMock()
        collection.insert_one = AsyncMock(return_value=AsyncMock(inserted_id="mock_id"))
        collection.find_one_and_update = AsyncMock(return_value={"_id": "mock_id"})
        collection.find = AsyncMock(return_value=AsyncMock(to_list=AsyncMock(return_value=[])))
        mock.return_value = collection
        yield collection

# ============================================
# Redis Mock
# ============================================
@pytest.fixture
def mock_redis():
    """Redis Stream 작업 Mock"""
    with patch("services.redis_service.get_redis") as mock:
        redis = AsyncMock()
        redis.xadd = AsyncMock(return_value="1234567890-0")
        redis.xreadgroup = AsyncMock(return_value=[])
        redis.xack = AsyncMock(return_value=1)
        redis.xdel = AsyncMock(return_value=1)
        mock.return_value = redis
        yield redis

# ============================================
# Upstage OCR Mock
# ============================================
@pytest.fixture
def mock_upstage():
    """Upstage OCR API Mock"""
    with patch("services.upstage_service.call_ocr") as mock:
        mock.return_value = {
            "status": 200,
            "error": False,
            "full_text": "Mock OCR 결과 텍스트",
            "confidence": 0.95,
            "num_pages": 1,
            "pages": [{"text": "Mock OCR 결과 텍스트"}]
        }
        yield mock

# ============================================
# OpenAI Mock
# ============================================
@pytest.fixture
def mock_openai():
    """OpenAI API Mock"""
    with patch("services.openai_service.generate_summary") as mock:
        mock.return_value = {
            "summary": "Mock 요약 결과입니다.",
            "tags": ["태그1", "태그2", "태그3"],
            "length": 50,
            "truncated": False
        }
        yield mock

# ============================================
# 파일 시스템 Mock
# ============================================
@pytest.fixture
def mock_filesystem(tmp_path):
    """파일 시스템 작업 Mock"""
    with patch("services.file_service.UPLOAD_DIR", str(tmp_path)):
        yield tmp_path
```

### 5.4 워크플로우별 단위 테스트

```python
# tests/test_doc_upload.py

import pytest
from fastapi.testclient import TestClient
from io import BytesIO

class TestDocUpload:
    """DocUpload 워크플로우 단위 테스트"""

    # ----------------------------------------
    # 성공 케이스
    # ----------------------------------------
    def test_upload_pdf_success(self, client, mock_filesystem):
        """PDF 파일 업로드 성공"""
        pdf_content = b"%PDF-1.4 mock content"

        response = client.post(
            "/webhook/docupload",
            files={"file": ("test.pdf", BytesIO(pdf_content), "application/pdf")},
            data={"userId": "user123"}
        )

        assert response.status_code == 200
        assert response.json()["result"] == "success"
        assert "path" in response.json()
        assert response.json()["original"] == "test.pdf"

    def test_upload_with_customer_id(self, client, mock_filesystem):
        """customerId 포함 업로드"""
        response = client.post(
            "/webhook/docupload",
            files={"file": ("test.pdf", BytesIO(b"content"), "application/pdf")},
            data={"userId": "user123", "customerId": "cust456"}
        )

        assert response.status_code == 200
        # 경로에 customerId 반영되지 않음 (userId 기준)
        assert "user123" in response.json()["path"]

    # ----------------------------------------
    # 에러 케이스
    # ----------------------------------------
    def test_upload_no_file(self, client):
        """파일 없이 요청 - 400 에러"""
        response = client.post(
            "/webhook/docupload",
            data={"userId": "user123"}
        )

        assert response.status_code == 400
        assert response.json()["result"] == "error"
        assert response.json()["code"] == "REQUEST_INVALID"

    def test_upload_no_user_id(self, client, mock_filesystem):
        """userId 없이 요청 - 400 에러"""
        response = client.post(
            "/webhook/docupload",
            files={"file": ("test.pdf", BytesIO(b"content"), "application/pdf")}
        )

        assert response.status_code == 400


# tests/test_doc_summary.py

class TestDocSummary:
    """DocSummary 워크플로우 단위 테스트"""

    def test_summary_success(self, client, mock_openai):
        """요약 생성 성공"""
        response = client.post(
            "/webhook/docsummary",
            json={
                "full_text": "테스트 문서 내용입니다. " * 100,
                "user_id": "user123",
                "document_id": "doc456"
            }
        )

        assert response.status_code == 200
        assert "summary" in response.json()
        assert "tags" in response.json()
        assert isinstance(response.json()["tags"], list)

    def test_summary_truncation(self, client, mock_openai):
        """5000자 초과 시 truncated=True"""
        long_text = "가" * 6000  # 5000자 초과

        response = client.post(
            "/webhook/docsummary",
            json={"full_text": long_text, "user_id": "user123"}
        )

        assert response.status_code == 200
        # 실제 구현에서 truncated 플래그 확인

    def test_summary_empty_text(self, client):
        """빈 텍스트 - 빈 요약 반환"""
        response = client.post(
            "/webhook/docsummary",
            json={"full_text": "", "user_id": "user123"}
        )

        assert response.status_code == 200
        assert response.json()["summary"] == ""


# tests/test_doc_ocr.py

class TestDocOCR:
    """DocOCR 워크플로우 단위 테스트"""

    def test_ocr_pdf_success(self, client, mock_upstage, mock_openai):
        """PDF OCR 성공"""
        pdf_content = b"%PDF-1.4 mock content"

        response = client.post(
            "/webhook/dococr",
            files={"file": ("scan.pdf", BytesIO(pdf_content), "application/pdf")}
        )

        assert response.status_code == 200
        assert response.json()["error"] == False
        assert "full_text" in response.json()
        assert "summary" in response.json()

    def test_ocr_image_success(self, client, mock_upstage, mock_openai):
        """이미지 OCR 성공"""
        # 최소한의 PNG 헤더
        png_content = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100

        response = client.post(
            "/webhook/dococr",
            files={"file": ("scan.png", BytesIO(png_content), "image/png")}
        )

        assert response.status_code == 200

    def test_ocr_upstage_error(self, client, mock_openai):
        """Upstage API 에러 처리"""
        with patch("services.upstage_service.call_ocr") as mock:
            mock.return_value = {
                "status": 500,
                "error": True,
                "userMessage": "OCR 처리 실패"
            }

            response = client.post(
                "/webhook/dococr",
                files={"file": ("scan.pdf", BytesIO(b"content"), "application/pdf")}
            )

            assert response.json()["error"] == True
            assert response.json()["status"] == 500
```

### 5.5 OCRWorker 테스트 (스케줄러)

```python
# tests/test_ocr_worker.py

import pytest
from unittest.mock import AsyncMock, patch
from workers.ocr_worker import process_ocr_queue

class TestOCRWorker:
    """OCRWorker 스케줄러 테스트"""

    @pytest.fixture
    def mock_redis_message(self):
        """Redis Stream 메시지 Mock"""
        return [
            ("ocr_stream", [
                ("1234567890-0", {
                    b"file_id": b"file123",
                    b"file_path": b"/data/files/test.pdf",
                    b"doc_id": b"doc456",
                    b"owner_id": b"user789",
                    b"queued_at": b"2025-01-01T00:00:00Z"
                })
            ])
        ]

    async def test_process_empty_queue(self, mock_redis):
        """빈 큐 처리 - 아무 작업 안 함"""
        mock_redis.xreadgroup.return_value = []

        result = await process_ocr_queue()

        assert result == {"processed": 0}
        mock_redis.xack.assert_not_called()

    async def test_process_ocr_success(
        self, mock_redis, mock_redis_message,
        mock_mongodb, mock_upstage, mock_openai
    ):
        """OCR 성공 처리"""
        mock_redis.xreadgroup.return_value = mock_redis_message

        result = await process_ocr_queue()

        assert result["processed"] == 1
        mock_redis.xack.assert_called_once()
        mock_redis.xdel.assert_called_once()
        # MongoDB 업데이트 확인
        mock_mongodb.find_one_and_update.assert_called()

    async def test_process_quota_exceeded(
        self, mock_redis, mock_redis_message, mock_mongodb
    ):
        """OCR 한도 초과 처리"""
        mock_redis.xreadgroup.return_value = mock_redis_message

        with patch("services.quota_service.check_quota") as mock_quota:
            mock_quota.return_value = {"allowed": False, "reason": "한도 초과"}

            result = await process_ocr_queue()

            # MongoDB에 quota_exceeded 상태 저장
            update_call = mock_mongodb.find_one_and_update.call_args
            assert "quota_exceeded" in str(update_call)
```

### 5.6 E2E 비교 테스트 (n8n vs FastAPI)

마이그레이션 검증 단계에서만 실행. 실제 n8n과 FastAPI 모두 호출하여 비교.

```python
# tests/e2e/test_compatibility.py

import pytest
import requests
from deepdiff import DeepDiff

N8N_BASE = "https://n8nd.giize.com/webhook"
FASTAPI_BASE = "http://localhost:8000/webhook"

# 비교 시 무시할 필드 (동적 생성값)
IGNORE_FIELDS = {
    "path", "saved_name", "timestamp", "uploaded_at",
    "queued_at", "done_at", "created_at"
}

class TestN8nVsFastAPI:
    """n8n과 FastAPI 결과 비교 테스트"""

    @pytest.mark.e2e
    def test_docupload_comparison(self, test_pdf_file):
        """DocUpload 결과 비교"""
        files = {"file": test_pdf_file}
        data = {"userId": "test_user"}

        n8n_resp = requests.post(f"{N8N_BASE}/docupload", files=files, data=data)
        fastapi_resp = requests.post(f"{FASTAPI_BASE}/docupload", files=files, data=data)

        diff = self._compare_responses(n8n_resp.json(), fastapi_resp.json())
        assert not diff, f"응답 불일치: {diff}"

    @pytest.mark.e2e
    def test_docsummary_comparison(self):
        """DocSummary 결과 비교"""
        payload = {
            "full_text": "테스트 문서입니다. " * 50,
            "user_id": "test_user",
            "document_id": "test_doc"
        }

        n8n_resp = requests.post(f"{N8N_BASE}/docsummary", json=payload)
        fastapi_resp = requests.post(f"{FASTAPI_BASE}/docsummary", json=payload)

        # 요약 결과는 AI 모델 특성상 정확히 같지 않을 수 있음
        # 구조와 필드 존재 여부만 검증
        assert set(n8n_resp.json().keys()) == set(fastapi_resp.json().keys())
        assert type(n8n_resp.json()["tags"]) == type(fastapi_resp.json()["tags"])

    def _compare_responses(self, n8n, fastapi):
        """동적 필드 제외하고 비교"""
        n8n_filtered = {k: v for k, v in n8n.items() if k not in IGNORE_FIELDS}
        fastapi_filtered = {k: v for k, v in fastapi.items() if k not in IGNORE_FIELDS}

        return DeepDiff(n8n_filtered, fastapi_filtered, ignore_order=True)
```

### 5.7 테스트 실행 명령어

```bash
# 단위 테스트 (Mock 사용, 빠름)
pytest tests/ -v --ignore=tests/e2e/

# 골든 파일 테스트
pytest tests/test_golden_files.py -v

# E2E 비교 테스트 (n8n + FastAPI 모두 실행 필요)
pytest tests/e2e/ -v -m e2e

# 커버리지 리포트
pytest tests/ --cov=routers --cov=services --cov=workers --cov-report=html

# 특정 워크플로우만 테스트
pytest tests/test_doc_upload.py -v
pytest tests/test_doc_ocr.py -v
```

### 5.8 CI/CD 통합

```yaml
# .github/workflows/test.yml

name: Test Pipeline

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements.txt -r requirements-dev.txt

      - name: Run unit tests
        run: pytest tests/ -v --ignore=tests/e2e/ --cov=. --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # main 브랜치에서만 실행
    needs: unit-tests
    steps:
      - name: Run E2E comparison
        run: pytest tests/e2e/ -v -m e2e
```

---

## 6. 인터페이스 계약 기반 마이그레이션 검증

### 6.1 핵심 개념

n8n 워크플로우의 **입출력 인터페이스를 계약(Contract)으로 정의**하고, FastAPI 구현이 동일한 계약을 만족하는지 자동 검증하는 방식.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    인터페이스 계약 기반 검증 흐름                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [1] 계약 정의                                                          │
│   ┌─────────────────────┐                                               │
│   │  Pydantic Schema    │  ← 각 워크플로우 입출력 모델링                 │
│   │  (Request/Response) │                                               │
│   └─────────────────────┘                                               │
│            │                                                             │
│            ▼                                                             │
│   [2] 테스트 케이스 수집                                                 │
│   ┌─────────────────────┐     ┌─────────────────────┐                   │
│   │   n8n 프록시        │ ──► │   Golden Files      │                   │
│   │   (실제 트래픽 캡처) │     │   (input/output)    │                   │
│   └─────────────────────┘     └─────────────────────┘                   │
│            │                           │                                 │
│            ▼                           ▼                                 │
│   [3] 검증 실행                                                          │
│   ┌─────────────────────────────────────────────────┐                   │
│   │  pytest: FastAPI(input) == expected_output?     │                   │
│   │  동적 필드 제외, 스키마 검증, 비즈니스 로직 검증  │                   │
│   └─────────────────────────────────────────────────┘                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 워크플로우별 인터페이스 계약 정의

각 워크플로우의 입출력을 Pydantic 모델로 엄격하게 정의.

```python
# contracts/doc_upload.py

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

# ============================================
# DocUpload 계약
# ============================================

class DocUploadRequest(BaseModel):
    """DocUpload 요청 스키마"""
    file: bytes = Field(..., description="업로드할 파일 바이너리")
    userId: str = Field(..., min_length=1, description="사용자 ID")
    customerId: Optional[str] = Field(None, description="고객 ID (선택)")

class DocUploadSuccessResponse(BaseModel):
    """DocUpload 성공 응답 스키마"""
    result: Literal["success"]
    path: str = Field(..., description="저장된 파일 경로")
    original: str = Field(..., description="원본 파일명")
    saved_name: str = Field(..., description="저장된 파일명 (UUID)")
    size: int = Field(..., ge=0, description="파일 크기 (bytes)")
    mime: str = Field(..., description="MIME 타입")
    uploaded_at: datetime

class DocUploadErrorResponse(BaseModel):
    """DocUpload 에러 응답 스키마"""
    result: Literal["error"]
    code: str = Field(..., description="에러 코드")
    message: str = Field(..., description="에러 메시지")


# contracts/doc_ocr.py

class DocOCRRequest(BaseModel):
    """DocOCR 요청 스키마"""
    file: bytes = Field(..., description="OCR 대상 파일")

class DocOCRSuccessResponse(BaseModel):
    """DocOCR 성공 응답 스키마"""
    status: Literal[200]
    error: Literal[False]
    userMessage: str
    confidence: float = Field(..., ge=0, le=1, description="OCR 신뢰도")
    full_text: str = Field(..., description="추출된 텍스트")
    summary: str = Field(..., description="요약")
    tags: list[str] = Field(..., max_length=10)
    num_pages: int = Field(..., ge=1)
    pages: list[dict]

class DocOCRErrorResponse(BaseModel):
    """DocOCR 에러 응답 스키마"""
    status: int = Field(..., ge=400)
    error: Literal[True]
    userMessage: str


# contracts/doc_summary.py

class DocSummaryRequest(BaseModel):
    """DocSummary 요청 스키마"""
    full_text: str = Field(..., description="요약할 텍스트")
    user_id: str
    document_id: Optional[str] = None

class DocSummaryResponse(BaseModel):
    """DocSummary 응답 스키마"""
    summary: str = Field(..., max_length=500, description="요약문 (최대 500자)")
    tags: list[str] = Field(..., max_length=10, description="태그 (최대 10개)")
    length: int = Field(..., description="원본 텍스트 길이")
    truncated: bool = Field(..., description="5000자 초과 여부")


# contracts/ocr_worker.py

class OCRWorkerRedisMessage(BaseModel):
    """OCRWorker Redis Stream 메시지 스키마"""
    file_id: str
    file_path: str
    doc_id: str
    owner_id: str
    queued_at: datetime
    message_id: str

class OCRWorkerMongoUpdate(BaseModel):
    """OCRWorker MongoDB 업데이트 스키마"""
    ocr: dict = Field(..., description="OCR 결과 또는 에러 정보")
    # status: done | error | quota_exceeded
```

### 6.3 n8n 트래픽 캡처 프록시

실제 운영 중인 n8n 트래픽을 캡처하여 골든 파일 자동 생성.

```python
# tools/n8n_traffic_capture.py

"""
n8n 트래픽 캡처 프록시
- nginx에서 n8n 앞에 배치
- 요청/응답을 JSON 파일로 저장
- 마이그레이션 검증용 테스트 케이스 자동 생성
"""

import json
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Request, Response
import httpx

app = FastAPI()
CAPTURE_DIR = Path("/data/n8n_captures")
N8N_BASE = "http://localhost:5678"

# 캡처 대상 워크플로우
WORKFLOWS = ["docupload", "dococr", "docsummary", "docmeta", "smartsearch"]

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_and_capture(request: Request, path: str):
    """n8n으로 프록시하면서 요청/응답 캡처"""

    workflow = path.split("/")[-1].lower()
    should_capture = any(wf in workflow for wf in WORKFLOWS)

    # 요청 데이터 수집
    body = await request.body()
    headers = dict(request.headers)

    # n8n으로 전달
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method=request.method,
            url=f"{N8N_BASE}/{path}",
            content=body,
            headers={k: v for k, v in headers.items() if k.lower() != "host"}
        )

    # 캡처 (성공 응답만)
    if should_capture and response.status_code == 200:
        capture_id = f"{workflow}_{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}"
        capture_dir = CAPTURE_DIR / workflow
        capture_dir.mkdir(parents=True, exist_ok=True)

        # 입력 저장
        input_data = {
            "method": request.method,
            "path": path,
            "headers": {k: v for k, v in headers.items()
                       if k.lower() not in ["authorization", "cookie"]},
            "body": body.decode("utf-8", errors="replace") if body else None,
            "captured_at": datetime.now().isoformat()
        }
        (capture_dir / f"{capture_id}.input.json").write_text(
            json.dumps(input_data, ensure_ascii=False, indent=2)
        )

        # 출력 저장
        try:
            output_data = response.json()
        except:
            output_data = {"raw": response.text}

        (capture_dir / f"{capture_id}.output.json").write_text(
            json.dumps(output_data, ensure_ascii=False, indent=2)
        )

    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=dict(response.headers)
    )
```

### 6.4 동적 필드 처리 전략

타임스탬프, UUID 등 실행마다 달라지는 값을 처리하는 전략.

```python
# contracts/dynamic_fields.py

"""
동적 필드 정규화 전략
- 마이그레이션 검증 시 동적 필드를 무시하거나 패턴 매칭
"""

from typing import Any
import re
from datetime import datetime

# ============================================
# 워크플로우별 동적 필드 목록
# ============================================

DYNAMIC_FIELDS = {
    "docupload": {
        "ignore": ["path", "saved_name", "uploaded_at"],
        "pattern": {
            "path": r"^/data/files/[a-f0-9-]+/.*$",
            "saved_name": r"^[a-f0-9-]{36}\.\w+$"
        }
    },
    "dococr": {
        "ignore": ["done_at", "started_at", "processing_time"],
        "pattern": {}
    },
    "docsummary": {
        "ignore": ["created_at"],
        # 요약 내용은 AI 특성상 정확히 같지 않을 수 있음
        "semantic_compare": ["summary"]
    },
    "ocr_worker": {
        "ignore": ["message_id", "queued_at", "done_at"],
        "pattern": {
            "message_id": r"^\d+-\d+$"  # Redis Stream ID 형식
        }
    }
}

def normalize_response(workflow: str, response: dict) -> dict:
    """비교를 위해 동적 필드 정규화"""
    config = DYNAMIC_FIELDS.get(workflow, {})
    ignore_fields = config.get("ignore", [])
    patterns = config.get("pattern", {})

    normalized = {}
    for key, value in response.items():
        if key in ignore_fields:
            # 패턴 검증만 수행
            if key in patterns:
                pattern = patterns[key]
                if isinstance(value, str) and re.match(pattern, value):
                    normalized[key] = f"<DYNAMIC:{key}>"
                else:
                    raise ValueError(f"Field '{key}' doesn't match pattern: {pattern}")
            else:
                normalized[key] = f"<DYNAMIC:{key}>"
        else:
            normalized[key] = value

    return normalized

def compare_responses(
    workflow: str,
    expected: dict,
    actual: dict
) -> tuple[bool, list[str]]:
    """두 응답 비교, 차이점 반환"""
    config = DYNAMIC_FIELDS.get(workflow, {})
    semantic_fields = config.get("semantic_compare", [])

    norm_expected = normalize_response(workflow, expected)
    norm_actual = normalize_response(workflow, actual)

    differences = []

    for key in set(norm_expected.keys()) | set(norm_actual.keys()):
        exp_val = norm_expected.get(key)
        act_val = norm_actual.get(key)

        if key in semantic_fields:
            # 시맨틱 비교: 길이 비슷하면 OK (AI 요약 특성)
            if isinstance(exp_val, str) and isinstance(act_val, str):
                len_diff = abs(len(exp_val) - len(act_val)) / max(len(exp_val), 1)
                if len_diff > 0.5:  # 50% 이상 길이 차이나면 실패
                    differences.append(f"{key}: length diff > 50%")
        elif exp_val != act_val:
            differences.append(f"{key}: expected={exp_val}, actual={act_val}")

    return len(differences) == 0, differences
```

### 6.5 계약 기반 테스트 러너

골든 파일과 계약을 기반으로 FastAPI 구현 검증.

```python
# tests/contract_test_runner.py

"""
계약 기반 테스트 러너
- 골든 파일 로드
- FastAPI 호출
- 계약 검증 (스키마 + 비즈니스 로직)
"""

import pytest
import json
from pathlib import Path
from pydantic import ValidationError
from contracts.doc_upload import DocUploadSuccessResponse, DocUploadErrorResponse
from contracts.doc_ocr import DocOCRSuccessResponse, DocOCRErrorResponse
from contracts.dynamic_fields import compare_responses

GOLDEN_DIR = Path("tests/golden_files")
CONTRACTS = {
    "docupload": {
        "success": DocUploadSuccessResponse,
        "error": DocUploadErrorResponse
    },
    "dococr": {
        "success": DocOCRSuccessResponse,
        "error": DocOCRErrorResponse
    }
}

class ContractTestRunner:
    """계약 기반 테스트 실행기"""

    def __init__(self, workflow: str, fastapi_client):
        self.workflow = workflow
        self.client = fastapi_client
        self.golden_dir = GOLDEN_DIR / workflow

    def load_golden_cases(self) -> list[dict]:
        """골든 파일에서 테스트 케이스 로드"""
        cases = []
        for input_file in self.golden_dir.glob("*.input.json"):
            output_file = input_file.with_suffix("").with_suffix(".output.json")
            if output_file.exists():
                cases.append({
                    "name": input_file.stem.replace(".input", ""),
                    "input": json.loads(input_file.read_text()),
                    "expected": json.loads(output_file.read_text())
                })
        return cases

    def validate_schema(self, response: dict) -> tuple[bool, str]:
        """응답이 계약 스키마를 만족하는지 검증"""
        contracts = CONTRACTS.get(self.workflow, {})

        # 성공/에러 응답 구분
        if response.get("result") == "error" or response.get("error") == True:
            schema = contracts.get("error")
        else:
            schema = contracts.get("success")

        if not schema:
            return True, "No schema defined"

        try:
            schema(**response)
            return True, "Schema valid"
        except ValidationError as e:
            return False, str(e)

    def run_test(self, case: dict) -> dict:
        """단일 테스트 케이스 실행"""
        input_data = case["input"]
        expected = case["expected"]

        # FastAPI 호출
        response = self.client.post(
            f"/webhook/{self.workflow}",
            **self._prepare_request(input_data)
        )
        actual = response.json()

        # 1. 스키마 검증
        schema_valid, schema_msg = self.validate_schema(actual)

        # 2. 값 비교 (동적 필드 제외)
        values_match, differences = compare_responses(
            self.workflow, expected, actual
        )

        return {
            "case": case["name"],
            "passed": schema_valid and values_match,
            "schema_valid": schema_valid,
            "schema_message": schema_msg,
            "values_match": values_match,
            "differences": differences,
            "actual": actual
        }

    def run_all(self) -> list[dict]:
        """모든 골든 케이스 실행"""
        cases = self.load_golden_cases()
        return [self.run_test(case) for case in cases]

    def _prepare_request(self, input_data: dict) -> dict:
        """입력 데이터를 HTTP 요청으로 변환"""
        # 파일 업로드인 경우
        if "file" in input_data:
            return {
                "files": {"file": input_data["file"]},
                "data": {k: v for k, v in input_data.items() if k != "file"}
            }
        # JSON 요청인 경우
        return {"json": input_data}


# pytest 통합
class TestDocUploadContract:
    """DocUpload 계약 테스트"""

    def test_all_golden_cases(self, fastapi_client):
        runner = ContractTestRunner("docupload", fastapi_client)
        results = runner.run_all()

        for result in results:
            assert result["passed"], (
                f"Case '{result['case']}' failed:\n"
                f"  Schema: {result['schema_message']}\n"
                f"  Differences: {result['differences']}"
            )


class TestDocOCRContract:
    """DocOCR 계약 테스트"""

    def test_all_golden_cases(self, fastapi_client):
        runner = ContractTestRunner("dococr", fastapi_client)
        results = runner.run_all()

        for result in results:
            assert result["passed"], f"Case '{result['case']}' failed"
```

### 6.6 마이그레이션 검증 체크리스트

| 검증 단계 | 내용 | 자동화 |
|----------|------|--------|
| 스키마 검증 | 응답 필드/타입이 계약과 일치 | ✅ Pydantic |
| 값 일치 검증 | 동적 필드 제외 후 값 비교 | ✅ compare_responses |
| 패턴 검증 | 동적 필드가 예상 패턴과 일치 | ✅ regex |
| 시맨틱 검증 | AI 생성 필드 (요약, 태그) 유사성 | ⚠️ 길이/키워드 비교 |
| 부수효과 검증 | MongoDB/Redis 상태 변경 | ⚠️ 수동 확인 필요 |

### 6.7 CI/CD 통합

```yaml
# .github/workflows/contract-test.yml

name: Contract Tests

on:
  push:
    paths:
      - 'backend/api/document_pipeline/**'
  pull_request:
    paths:
      - 'backend/api/document_pipeline/**'

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements.txt -r requirements-dev.txt

      - name: Run contract tests
        run: |
          pytest tests/contract_test_runner.py -v --tb=short
          pytest tests/test_golden_files.py -v --tb=short

      - name: Generate compatibility report
        run: python tools/generate_compat_report.py > compatibility.md

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: compatibility-report
          path: compatibility.md
```

### 6.8 점진적 마이그레이션 안전망

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        마이그레이션 안전망 구조                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [개발 단계]                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │ 단위 테스트  │ ──► │ 계약 테스트  │ ──► │ 골든 파일   │               │
│  │ (Mock)      │     │ (Schema)    │     │ (실제 값)   │               │
│  └─────────────┘     └─────────────┘     └─────────────┘               │
│                                                                          │
│  [스테이징 단계]                                                         │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  Shadow Mode: n8n과 FastAPI 동시 호출               │               │
│  │  - n8n 응답 반환 (실제 사용)                         │               │
│  │  - FastAPI 응답은 로깅만 (비교용)                    │               │
│  │  - 불일치 시 알림                                    │               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                          │
│  [프로덕션 단계]                                                         │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  Canary Release: 트래픽 점진적 이전                  │               │
│  │  - 1% → 10% → 50% → 100%                            │               │
│  │  - 에러율 모니터링                                   │               │
│  │  - 롤백 자동화 (에러율 > 1%)                         │               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.9 Shadow Mode 구현

```python
# middleware/shadow_mode.py

"""
Shadow Mode 미들웨어
- n8n과 FastAPI 동시 호출
- n8n 응답 반환, FastAPI 응답은 비교 로깅
"""

import asyncio
import httpx
from datetime import datetime
from contracts.dynamic_fields import compare_responses

N8N_BASE = "https://n8nd.giize.com/webhook"
FASTAPI_BASE = "http://localhost:8000/webhook"

async def shadow_call(workflow: str, request_data: dict) -> dict:
    """n8n과 FastAPI 동시 호출, 결과 비교"""

    async with httpx.AsyncClient() as client:
        # 병렬 호출
        n8n_task = client.post(f"{N8N_BASE}/{workflow}", **request_data)
        fastapi_task = client.post(f"{FASTAPI_BASE}/{workflow}", **request_data)

        n8n_resp, fastapi_resp = await asyncio.gather(
            n8n_task, fastapi_task, return_exceptions=True
        )

    # n8n 응답 우선 반환
    primary_response = n8n_resp.json() if not isinstance(n8n_resp, Exception) else None

    # 비교 로깅
    if primary_response and not isinstance(fastapi_resp, Exception):
        is_match, diffs = compare_responses(
            workflow,
            primary_response,
            fastapi_resp.json()
        )

        if not is_match:
            log_mismatch(workflow, primary_response, fastapi_resp.json(), diffs)

    return primary_response

def log_mismatch(workflow: str, n8n: dict, fastapi: dict, diffs: list):
    """불일치 로깅 (Slack/DB 저장)"""
    # TODO: Slack 알림 또는 DB 저장
    print(f"[SHADOW MISMATCH] {workflow}: {diffs}")
```

### 6.10 Shadow Mode 불일치 처리 프로세스

Shadow mode에서 n8n과 FastAPI 응답 불일치 발견 시 처리 절차:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Shadow Mode 불일치 처리 워크플로우                      │
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 불일치   │───►│ 로깅 &   │───►│ 개발자   │───►│ 수정 &   │          │
│  │ 감지     │    │ 알림     │    │ 분석     │    │ 배포     │          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│       │                              │               │                  │
│       ▼                              ▼               ▼                  │
│  - 필드 비교         - Slack 알림         - 근본 원인 파악    - FastAPI 코드 수정 │
│  - 동적 필드 제외     - MongoDB 저장       - 의도된 차이인지?  - 테스트 재실행      │
│  - diff 생성         - 대시보드 집계      - 계약 누락인지?    - Shadow 재검증      │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 6.10.1 불일치 로깅 구조

```python
# models/shadow_mismatch.py

from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class FieldDiff(BaseModel):
    """개별 필드 차이"""
    path: str                    # 예: "result.data.file_path"
    n8n_value: Optional[str]
    fastapi_value: Optional[str]
    diff_type: str               # "missing" | "extra" | "value_mismatch"

class ShadowMismatchLog(BaseModel):
    """Shadow mode 불일치 로그"""
    id: str
    workflow: str                # "DocUpload", "DocOCR" 등
    timestamp: datetime
    request_data: dict           # 원본 요청
    n8n_response: dict           # n8n 응답
    fastapi_response: dict       # FastAPI 응답
    diffs: List[FieldDiff]       # 차이점 목록
    status: str = "open"         # "open" | "analyzing" | "fixed" | "wontfix"
    assignee: Optional[str]      # 담당 개발자
    resolution_note: Optional[str]  # 해결 메모
```

#### 6.10.2 알림 및 집계

```python
# services/mismatch_alerter.py

async def alert_mismatch(log: ShadowMismatchLog):
    """불일치 발생 시 알림"""

    # 1. MongoDB에 저장
    await db.shadow_mismatches.insert_one(log.dict())

    # 2. 동일 패턴 집계 (중복 알림 방지)
    similar_count = await db.shadow_mismatches.count_documents({
        "workflow": log.workflow,
        "diffs.path": log.diffs[0].path if log.diffs else None,
        "status": "open",
        "timestamp": {"$gte": datetime.now() - timedelta(hours=1)}
    })

    # 3. 첫 발생 또는 임계치 초과 시 Slack 알림
    if similar_count <= 1 or similar_count % 10 == 0:
        await send_slack_alert(
            channel="#aims-migration",
            text=f"🔴 Shadow Mismatch: {log.workflow}\n"
                 f"Diff: {log.diffs[0].path if log.diffs else 'N/A'}\n"
                 f"Count (1h): {similar_count}"
        )
```

#### 6.10.3 개발자 분석 프로세스

| 단계 | 담당 | 행동 | 도구 |
|------|------|------|------|
| 1. 알림 수신 | 당번 개발자 | Slack에서 불일치 알림 확인 | Slack |
| 2. 로그 조회 | 당번 개발자 | 상세 diff 확인 | MongoDB/대시보드 |
| 3. 분류 | 당번 개발자 | 의도된 차이 vs 버그 판별 | - |
| 4. 할당 | 당번 개발자 | 담당자 지정 (자신 또는 전문가) | Jira/GitHub |
| 5. 수정 | 담당 개발자 | FastAPI 코드 수정 | IDE |
| 6. 검증 | 담당 개발자 | Golden file 테스트 재실행 | pytest |
| 7. 배포 | 담당 개발자 | FastAPI 재배포 | deploy script |
| 8. 종료 | 담당 개발자 | 로그 status → "fixed" | MongoDB |

#### 6.10.4 분류 기준: 수정 vs Wontfix

```
불일치 발생
    │
    ▼
┌───────────────────┐
│ n8n 응답이 맞는가? │
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
   YES        NO
    │         │
    ▼         ▼
FastAPI      n8n 버그 발견!
수정 필요    (계약 업데이트 고려)
    │         │
    ▼         ▼
코드 수정    1. n8n도 수정하거나
& 테스트    2. FastAPI에서 개선된 응답 사용
             (계약 스키마 업데이트)
```

**Wontfix 사유 예시:**
- 타임스탬프 포맷 미세 차이 (ISO8601 vs 커스텀) → 동적 필드 제외 목록에 추가
- n8n의 레거시 필드가 실제로는 불필요 → 계약에서 제거
- 소수점 정밀도 차이 (0.1234 vs 0.12340000) → 비교 로직 개선

#### 6.10.5 수정 사이클

```bash
# 1. 불일치 로그에서 request_data 추출
mongosh --eval "db.shadow_mismatches.findOne({status: 'open'})"

# 2. Golden file로 저장
echo "$REQUEST_DATA" > tests/golden/docupload_case_42.json

# 3. FastAPI 코드 수정
vim src/workflows/doc_upload.py

# 4. 단일 케이스 테스트
pytest tests/contract/test_doc_upload.py::test_case_42 -v

# 5. 전체 계약 테스트
pytest tests/contract/ -v

# 6. 배포
./deploy_workflow_api.sh

# 7. Shadow mode에서 재검증 (자동)
# → 다음 동일 요청에서 불일치 없으면 OK

# 8. 로그 종료
mongosh --eval "db.shadow_mismatches.updateOne(
  {_id: ObjectId('...')},
  {\$set: {status: 'fixed', resolution_note: 'Fixed field X mapping'}}
)"
```

#### 6.10.6 졸업 기준 (Traffic Migration 진행 조건)

| 조건 | 기준값 | 측정 기간 |
|------|--------|-----------|
| 불일치율 | < 0.1% | 최근 24시간 |
| Open 불일치 | 0건 | 현재 |
| 연속 일치 | 1,000건 이상 | 최근 |
| 에러율 | n8n과 동일 | 최근 24시간 |

```python
# tools/migration_readiness.py

async def check_readiness(workflow: str) -> dict:
    """워크플로우별 마이그레이션 준비 상태 확인"""

    last_24h = datetime.now() - timedelta(hours=24)

    total_calls = await db.shadow_logs.count_documents({
        "workflow": workflow,
        "timestamp": {"$gte": last_24h}
    })

    mismatches = await db.shadow_mismatches.count_documents({
        "workflow": workflow,
        "timestamp": {"$gte": last_24h}
    })

    open_issues = await db.shadow_mismatches.count_documents({
        "workflow": workflow,
        "status": "open"
    })

    mismatch_rate = mismatches / total_calls if total_calls > 0 else 1.0

    return {
        "workflow": workflow,
        "ready": mismatch_rate < 0.001 and open_issues == 0 and total_calls >= 1000,
        "mismatch_rate": f"{mismatch_rate:.4%}",
        "open_issues": open_issues,
        "total_calls_24h": total_calls,
        "recommendation": "PROCEED" if mismatch_rate < 0.001 else "FIX_ISSUES"
    }
```

### 6.11 자동화된 수정 파이프라인 (Claude-in-the-Loop)

수동 분석/수정은 현실적으로 불가능. **Claude Code가 불일치를 자동으로 분석하고 수정**하는 파이프라인.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude-in-the-Loop 자동 수정 파이프라인                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [1] 불일치 감지                                                             │
│  ┌──────────────┐                                                           │
│  │ Shadow Mode  │───► 불일치 발생                                           │
│  │ Middleware   │                                                           │
│  └──────────────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│  [2] 리포트 생성                                                             │
│  ┌──────────────┐     ┌─────────────────────────────────────────┐          │
│  │ Report       │───► │ {                                        │          │
│  │ Generator    │     │   workflow: "DocUpload",                 │          │
│  │              │     │   request: {...},                        │          │
│  │              │     │   n8n_response: {...},                   │          │
│  │              │     │   fastapi_response: {...},               │          │
│  │              │     │   diffs: [...]                           │          │
│  │              │     │ }                                        │          │
│  └──────────────┘     └─────────────────────────────────────────┘          │
│          │                                                                   │
│          ▼                                                                   │
│  [3] Claude 분석 & 수정                                                      │
│  ┌──────────────┐                                                           │
│  │ Claude Code  │───► FastAPI 코드 자동 수정                                 │
│  │ (Headless)   │                                                           │
│  └──────────────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│  [4] 자동 검증 & 배포                                                        │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │ pytest       │───► │ PR 생성      │───► │ 자동 배포    │                │
│  │ (계약 테스트) │     │ (GitHub)     │     │ (승인 시)    │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 6.11.1 불일치 리포트 생성기

Claude가 이해할 수 있는 구조화된 리포트 생성.

```python
# tools/mismatch_reporter.py

"""
불일치 리포트 생성기
- Claude Code가 분석할 수 있는 형식으로 리포트 생성
- 관련 소스 코드도 함께 포함
"""

import json
from pathlib import Path
from datetime import datetime

FASTAPI_SRC = Path("/home/rossi/aims/backend/api/document_pipeline")

async def generate_fix_report(mismatch_id: str) -> dict:
    """Claude가 분석할 수 있는 수정 리포트 생성"""

    # 불일치 로그 조회
    mismatch = await db.shadow_mismatches.find_one({"_id": mismatch_id})
    if not mismatch:
        raise ValueError(f"Mismatch not found: {mismatch_id}")

    workflow = mismatch["workflow"]

    # 관련 소스 코드 로드
    router_file = FASTAPI_SRC / "routers" / f"{workflow.lower()}.py"
    service_file = FASTAPI_SRC / "services" / f"{workflow.lower()}_service.py"

    report = {
        "mismatch_id": mismatch_id,
        "workflow": workflow,
        "timestamp": mismatch["timestamp"].isoformat(),

        # 요청/응답 비교
        "comparison": {
            "request": mismatch["request_data"],
            "n8n_response": mismatch["n8n_response"],
            "fastapi_response": mismatch["fastapi_response"],
            "differences": [d.dict() for d in mismatch["diffs"]]
        },

        # 관련 소스 코드
        "source_files": {
            "router": {
                "path": str(router_file),
                "content": router_file.read_text() if router_file.exists() else None
            },
            "service": {
                "path": str(service_file),
                "content": service_file.read_text() if service_file.exists() else None
            }
        },

        # 계약 스키마
        "contract_schema": get_contract_schema(workflow),

        # 수정 지침
        "instructions": f"""
## 수정 요청

### 문제
FastAPI의 `{workflow}` 워크플로우 응답이 n8n과 일치하지 않습니다.

### 차이점
{json.dumps(mismatch["diffs"], indent=2, ensure_ascii=False)}

### 목표
FastAPI 응답을 n8n 응답과 동일하게 수정하세요.

### 주의사항
1. 동적 필드 (timestamp, uuid 등)는 값이 달라도 OK
2. 필드 이름, 타입, 구조가 일치해야 함
3. 비즈니스 로직 결과값이 동일해야 함

### 수정 후
1. 계약 테스트 실행: `pytest tests/contract/test_{workflow.lower()}.py -v`
2. 테스트 통과 시 PR 생성
"""
    }

    return report


def get_contract_schema(workflow: str) -> dict:
    """워크플로우의 계약 스키마 반환"""
    contract_file = FASTAPI_SRC / "contracts" / f"{workflow.lower()}.py"
    if contract_file.exists():
        return {"path": str(contract_file), "content": contract_file.read_text()}
    return None
```

#### 6.11.2 Claude Code 자동 실행

```bash
#!/bin/bash
# scripts/auto_fix_mismatch.sh
#
# 사용법: ./auto_fix_mismatch.sh <mismatch_id>

MISMATCH_ID=$1
REPORT_FILE="/tmp/mismatch_report_${MISMATCH_ID}.json"
FIX_BRANCH="fix/shadow-mismatch-${MISMATCH_ID}"

# 1. 리포트 생성
python -c "
import asyncio
from tools.mismatch_reporter import generate_fix_report
import json

async def main():
    report = await generate_fix_report('${MISMATCH_ID}')
    print(json.dumps(report, indent=2, ensure_ascii=False))

asyncio.run(main())
" > "$REPORT_FILE"

# 2. 수정 브랜치 생성
cd /home/rossi/aims
git checkout main && git pull
git checkout -b "$FIX_BRANCH"

# 3. Claude Code 실행 (headless 모드)
claude --print --dangerously-skip-permissions << EOF
다음 Shadow Mode 불일치 리포트를 분석하고 FastAPI 코드를 수정해주세요.

$(cat "$REPORT_FILE")

수정 완료 후:
1. 변경된 파일 저장
2. pytest tests/contract/ -v 실행하여 테스트 통과 확인
EOF

# 4. 테스트 실행
cd /home/rossi/aims/backend/api/document_pipeline
pytest tests/contract/ -v
TEST_RESULT=$?

# 5. 테스트 통과 시 PR 생성
if [ $TEST_RESULT -eq 0 ]; then
    git add -A
    git commit -m "fix: Shadow mode 불일치 수정 - ${MISMATCH_ID}

- 워크플로우: $(jq -r '.workflow' $REPORT_FILE)
- 차이점: $(jq -r '.comparison.differences | length' $REPORT_FILE)개 필드

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

    git push -u origin "$FIX_BRANCH"

    gh pr create \
        --title "fix: Shadow mode 불일치 자동 수정 - ${MISMATCH_ID}" \
        --body "$(cat << BODY
## Shadow Mode 불일치 자동 수정

### 워크플로우
$(jq -r '.workflow' $REPORT_FILE)

### 차이점
\`\`\`json
$(jq '.comparison.differences' $REPORT_FILE)
\`\`\`

### 테스트 결과
✅ 모든 계약 테스트 통과

### 검증
- [ ] PR 리뷰
- [ ] Shadow mode 재검증 (merge 후 자동)

🤖 이 PR은 Claude Code가 자동으로 생성했습니다.
BODY
)"

    # 6. 불일치 로그 상태 업데이트
    mongosh --eval "db.shadow_mismatches.updateOne(
        {_id: ObjectId('${MISMATCH_ID}')},
        {\$set: {status: 'pr_created', pr_branch: '${FIX_BRANCH}'}}
    )"

    echo "✅ PR 생성 완료: $FIX_BRANCH"
else
    echo "❌ 테스트 실패. 수동 확인 필요."
    # 실패 시 Slack 알림
    curl -X POST "$SLACK_WEBHOOK" -d "{\"text\": \"❌ Shadow mismatch 자동 수정 실패: ${MISMATCH_ID}\"}"
fi
```

#### 6.11.3 자동 실행 스케줄러

```python
# workers/mismatch_fixer.py

"""
불일치 자동 수정 워커
- 주기적으로 open 상태의 불일치 확인
- Claude Code로 자동 수정 시도
"""

import asyncio
import subprocess
from datetime import datetime, timedelta

MAX_AUTO_FIX_PER_HOUR = 5  # 시간당 최대 자동 수정 횟수
AUTO_FIX_COOLDOWN = 300    # 같은 워크플로우 재시도 대기 (5분)

async def mismatch_fixer_loop():
    """메인 루프: open 불일치를 찾아 자동 수정"""

    while True:
        try:
            # 최근 1시간 자동 수정 횟수 확인
            recent_fixes = await db.shadow_mismatches.count_documents({
                "status": {"$in": ["pr_created", "fixing"]},
                "auto_fix_started_at": {"$gte": datetime.now() - timedelta(hours=1)}
            })

            if recent_fixes >= MAX_AUTO_FIX_PER_HOUR:
                await asyncio.sleep(60)
                continue

            # 가장 오래된 open 불일치 찾기
            mismatch = await db.shadow_mismatches.find_one(
                {"status": "open"},
                sort=[("timestamp", 1)]
            )

            if not mismatch:
                await asyncio.sleep(30)
                continue

            mismatch_id = str(mismatch["_id"])

            # 상태 업데이트
            await db.shadow_mismatches.update_one(
                {"_id": mismatch["_id"]},
                {"$set": {"status": "fixing", "auto_fix_started_at": datetime.now()}}
            )

            # Claude Code 자동 수정 실행
            result = subprocess.run(
                ["bash", "/home/rossi/aims/scripts/auto_fix_mismatch.sh", mismatch_id],
                capture_output=True,
                text=True,
                timeout=600  # 10분 타임아웃
            )

            if result.returncode != 0:
                # 실패 시 상태 복구 (다음 시도 허용)
                await db.shadow_mismatches.update_one(
                    {"_id": mismatch["_id"]},
                    {"$set": {
                        "status": "auto_fix_failed",
                        "auto_fix_error": result.stderr[:1000]
                    }}
                )

        except Exception as e:
            print(f"[MismatchFixer] Error: {e}")
            await asyncio.sleep(60)

        await asyncio.sleep(10)  # 10초 대기 후 다음 체크


# systemd 서비스로 실행
if __name__ == "__main__":
    asyncio.run(mismatch_fixer_loop())
```

#### 6.11.4 PR 승인 후 자동 배포

```yaml
# .github/workflows/auto-deploy-shadow-fix.yml

name: Auto Deploy Shadow Fix

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  deploy-if-merged:
    if: github.event.pull_request.merged == true && startsWith(github.event.pull_request.head.ref, 'fix/shadow-mismatch-')
    runs-on: ubuntu-latest
    steps:
      - name: Extract mismatch ID
        id: extract
        run: |
          BRANCH="${{ github.event.pull_request.head.ref }}"
          MISMATCH_ID="${BRANCH#fix/shadow-mismatch-}"
          echo "mismatch_id=$MISMATCH_ID" >> $GITHUB_OUTPUT

      - name: Deploy FastAPI
        run: |
          ssh tars.giize.com 'cd ~/aims/backend/api/document_pipeline && ./deploy.sh'

      - name: Update mismatch status
        run: |
          ssh tars.giize.com "mongosh --eval \"db.shadow_mismatches.updateOne(
            {_id: ObjectId('${{ steps.extract.outputs.mismatch_id }}')},
            {\\\$set: {status: 'deployed', deployed_at: new Date()}}
          )\""

      - name: Notify success
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -d '{"text": "✅ Shadow mismatch 자동 수정 배포 완료: ${{ steps.extract.outputs.mismatch_id }}"}'
```

#### 6.11.5 전체 자동화 흐름 요약

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         완전 자동화 파이프라인                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 실시간 트래픽                                                           │
│     │                                                                       │
│     ▼                                                                       │
│  2. Shadow Mode ──► 불일치 감지 ──► MongoDB 저장                            │
│     │                                                                       │
│     ▼                                                                       │
│  3. Mismatch Fixer Worker (데몬)                                           │
│     │  - open 상태 불일치 발견                                              │
│     │  - 리포트 생성                                                        │
│     │                                                                       │
│     ▼                                                                       │
│  4. Claude Code (headless)                                                 │
│     │  - 불일치 분석                                                        │
│     │  - FastAPI 코드 수정                                                  │
│     │  - 계약 테스트 실행                                                   │
│     │                                                                       │
│     ▼                                                                       │
│  5. GitHub PR 자동 생성                                                     │
│     │                                                                       │
│     ▼                                                                       │
│  6. 사람 리뷰 & Merge ◄──── 유일한 수동 단계!                              │
│     │                                                                       │
│     ▼                                                                       │
│  7. GitHub Actions ──► 자동 배포                                           │
│     │                                                                       │
│     ▼                                                                       │
│  8. Shadow Mode 재검증 ──► 동일 패턴 불일치 없으면 완료                     │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘

👤 사람이 개입하는 유일한 지점: PR 리뷰 & Merge
   (필요 시 이것도 자동화 가능: 테스트 통과 + 특정 조건 시 auto-merge)
```

#### 6.11.6 하이브리드 AI 아키텍처 (실시간 + On-Demand)

두 가지 모드를 결합하여 효율성과 비용을 최적화.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       하이브리드 AI 아키텍처                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [1] 실시간 모드 (Always Running)                                            │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │  Haiku (경량 모델)                                              │        │
│  │  - Shadow Mode 미들웨어와 함께 상시 동작                         │        │
│  │  - 패턴 기반 빠른 분류 (단순 오류 vs 복잡한 로직)                 │        │
│  │  - 단순 수정 즉시 처리 (필드 이름 변경, 타입 캐스팅 등)           │        │
│  │  - 응답 시간: ~1초                                               │        │
│  │  - 비용: 저렴                                                    │        │
│  └────────────────────────────────────────────────────────────────┘        │
│          │                                                                   │
│          │ 복잡한 문제 발견 시                                               │
│          ▼                                                                   │
│  [2] On-Demand 모드 (필요시 호출)                                            │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │  Sonnet/Opus (고성능 모델)                                       │        │
│  │  - Haiku가 해결 못한 복잡한 케이스만 처리                         │        │
│  │  - 비즈니스 로직 분석, 다중 파일 수정                             │        │
│  │  - 전체 코드베이스 컨텍스트 활용                                  │        │
│  │  - 응답 시간: ~30초-2분                                          │        │
│  │  - 비용: 상대적으로 높음 (하지만 호출 빈도 낮음)                  │        │
│  └────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**실시간 모드 구현 (Haiku)**

```python
# middleware/realtime_fixer.py

"""
실시간 불일치 수정기 (Haiku 기반)
- Shadow Mode와 통합
- 단순 패턴 즉시 수정
"""

import anthropic
from typing import Optional

client = anthropic.Anthropic()

# 단순 수정 가능한 패턴들
SIMPLE_PATTERNS = {
    "field_rename": r"missing field '(\w+)', expected '(\w+)'",
    "type_mismatch": r"expected (\w+), got (\w+)",
    "null_handling": r"null vs empty string",
}

async def try_realtime_fix(mismatch: dict) -> Optional[dict]:
    """
    실시간 수정 시도 (Haiku)
    - 성공: 수정 패치 반환
    - 실패/복잡: None 반환 → On-Demand로 에스컬레이션
    """

    # 1. 패턴 분류
    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""
불일치 분류:
{json.dumps(mismatch['diffs'], indent=2)}

다음 중 하나로 분류:
1. SIMPLE_FIELD_RENAME - 필드명만 다름
2. SIMPLE_TYPE_CAST - 타입만 다름 (string vs int 등)
3. SIMPLE_NULL_EMPTY - null vs "" 차이
4. COMPLEX - 비즈니스 로직 관련

응답: 분류코드만 (예: SIMPLE_FIELD_RENAME)
"""
        }]
    )

    classification = response.content[0].text.strip()

    # 2. 단순 패턴이면 즉시 수정
    if classification.startswith("SIMPLE_"):
        fix = await generate_simple_fix(classification, mismatch)
        if fix:
            return fix

    # 3. 복잡하면 None → On-Demand로
    return None


async def generate_simple_fix(pattern: str, mismatch: dict) -> Optional[dict]:
    """단순 패턴 수정 코드 생성"""

    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": f"""
패턴: {pattern}
워크플로우: {mismatch['workflow']}
차이점: {mismatch['diffs']}

수정 JSON 생성:
{{
  "file": "routers/xxx.py",
  "line": 42,
  "old": "원래 코드",
  "new": "수정된 코드"
}}
"""
        }]
    )

    try:
        return json.loads(response.content[0].text)
    except:
        return None
```

**Shadow Mode 통합**

```python
# middleware/shadow_mode_hybrid.py

async def shadow_call_with_autofix(workflow: str, request_data: dict) -> dict:
    """Shadow Mode + 실시간 자동 수정"""

    # 1. n8n/FastAPI 동시 호출
    n8n_resp, fastapi_resp = await parallel_call(workflow, request_data)

    # 2. 비교
    is_match, diffs = compare_responses(workflow, n8n_resp, fastapi_resp)

    if is_match:
        return n8n_resp  # 일치 → 정상

    # 3. 불일치 발생 → 실시간 수정 시도 (Haiku)
    mismatch = {
        "workflow": workflow,
        "request": request_data,
        "n8n": n8n_resp,
        "fastapi": fastapi_resp,
        "diffs": diffs
    }

    fix = await try_realtime_fix(mismatch)

    if fix:
        # 4a. 단순 수정 성공 → 즉시 적용 & PR
        await apply_and_create_pr(fix, mismatch, model="haiku")
        await db.shadow_mismatches.insert_one({
            **mismatch,
            "status": "auto_fixed_realtime",
            "fixed_by": "haiku"
        })
    else:
        # 4b. 복잡한 문제 → On-Demand 큐에 추가
        await db.shadow_mismatches.insert_one({
            **mismatch,
            "status": "pending_ondemand",
            "complexity": "high"
        })
        # Sonnet이 나중에 처리

    return n8n_resp  # 항상 n8n 응답 반환 (사용자 영향 없음)
```

**On-Demand 워커 (Sonnet/Opus)**

```python
# workers/ondemand_fixer.py

"""
On-Demand 수정 워커 (Sonnet/Opus)
- Haiku가 해결 못한 복잡한 케이스 처리
- 시간당 5개 제한 (비용 관리)
"""

async def ondemand_fixer_loop():
    while True:
        # pending_ondemand 상태인 케이스 찾기
        mismatch = await db.shadow_mismatches.find_one({
            "status": "pending_ondemand"
        })

        if not mismatch:
            await asyncio.sleep(60)
            continue

        # Sonnet으로 분석 & 수정
        fix = await fix_with_sonnet(mismatch)

        if fix:
            await apply_and_create_pr(fix, mismatch, model="sonnet")
            await db.shadow_mismatches.update_one(
                {"_id": mismatch["_id"]},
                {"$set": {"status": "auto_fixed_ondemand", "fixed_by": "sonnet"}}
            )
        else:
            # Sonnet도 실패 → 사람 개입 필요
            await db.shadow_mismatches.update_one(
                {"_id": mismatch["_id"]},
                {"$set": {"status": "needs_human", "escalated_at": datetime.now()}}
            )
            await send_slack_alert("🔴 사람 개입 필요: ...")


async def fix_with_sonnet(mismatch: dict) -> Optional[dict]:
    """Sonnet으로 복잡한 수정"""

    # 관련 소스 코드 로드
    source_files = await load_related_sources(mismatch["workflow"])

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": f"""
## 복잡한 불일치 수정 요청

### 워크플로우
{mismatch['workflow']}

### 요청 데이터
{json.dumps(mismatch['request'], indent=2)}

### n8n 응답 (정답)
{json.dumps(mismatch['n8n'], indent=2)}

### FastAPI 응답 (틀림)
{json.dumps(mismatch['fastapi'], indent=2)}

### 차이점
{json.dumps(mismatch['diffs'], indent=2)}

### 관련 소스 코드
{source_files}

### 요청
1. 왜 이 차이가 발생했는지 분석
2. FastAPI 코드 수정안 제시

JSON 형식으로 응답:
{{
  "analysis": "문제 분석",
  "root_cause": "근본 원인",
  "files": [
    {{"path": "...", "changes": [{{"line": N, "old": "...", "new": "..."}}]}}
  ]
}}
"""
        }]
    )

    try:
        return json.loads(response.content[0].text)
    except:
        return None
```

**비용/효율 비교**

| 모드 | 모델 | 응답시간 | 비용/호출 | 처리 케이스 |
|------|------|----------|-----------|-------------|
| 실시간 | Haiku | ~1초 | ~$0.001 | 단순 패턴 (70%) |
| On-Demand | Sonnet | ~30초 | ~$0.05 | 복잡한 로직 (25%) |
| 에스컬레이션 | 사람 | - | - | 최종 실패 (5%) |

**예상 월간 비용 (1000건 불일치 가정)**
- Haiku: 1000 × $0.001 = $1
- Sonnet: 300 × $0.05 = $15
- 총: ~$16/월

#### 6.11.7 Auto-Merge 옵션 (완전 무인 운영)

```yaml
# .github/workflows/auto-merge-shadow-fix.yml

name: Auto Merge Shadow Fix

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  auto-merge:
    if: startsWith(github.event.pull_request.head.ref, 'fix/shadow-mismatch-')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run all tests
        run: |
          cd backend/api/document_pipeline
          pip install -r requirements.txt
          pytest tests/ -v

      - name: Check PR conditions
        id: check
        run: |
          # 조건: 테스트 통과 + 변경 파일 5개 이하 + 특정 디렉토리만 변경
          CHANGED_FILES=$(gh pr view ${{ github.event.pull_request.number }} --json files -q '.files | length')
          if [ "$CHANGED_FILES" -le 5 ]; then
            echo "auto_merge=true" >> $GITHUB_OUTPUT
          else
            echo "auto_merge=false" >> $GITHUB_OUTPUT
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto merge
        if: steps.check.outputs.auto_merge == 'true'
        run: |
          gh pr merge ${{ github.event.pull_request.number }} \
            --auto --squash \
            --subject "fix: Auto-merged shadow mismatch fix"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 6.11.8 Claude Code MAX vs Anthropic API 비용 구조

자동화 파이프라인에서 AI 호출 비용에 대한 이해가 필요합니다.

| 항목 | Claude Code MAX | Anthropic API |
|------|-----------------|---------------|
| **결제 방식** | 월 정액 구독 ($100 또는 $200) | 토큰 사용량 기반 종량제 |
| **용도** | Claude Code CLI 도구 사용 | 프로그래밍 방식 API 호출 |
| **결제 시스템** | claude.ai 구독 | console.anthropic.com |
| **상호 포함** | ❌ API 크레딧 미포함 | ❌ MAX 미포함 |

**핵심**: MAX 구독과 API 사용은 **완전히 별도 결제 시스템**입니다.

**API 사용 시작 방법**

1. **console.anthropic.com** 접속
2. 결제 수단 등록
3. API 키 발급
4. 환경변수 설정: `ANTHROPIC_API_KEY=sk-ant-...`

**하이브리드 아키텍처 예상 비용 (월 1,000건 mismatch 기준)**

```
├── Haiku (실시간):     1,000건 × $0.001 =  $1
├── Sonnet (복잡 10%):    100건 × $0.05  =  $5
├── 예비 버퍼:                              $10
└── 월 총계:                              ~$16
```

**권장사항**: Shadow mode 자동화에는 API 사용을 권장합니다. 월 $16 수준이면 MAX 구독비 대비 부담이 크지 않고, 안정적인 자동화가 가능합니다.

**대안: Claude Code CLI 직접 활용**

API 비용을 피하려면 Claude Code CLI를 직접 호출하는 방식도 가능:

```python
# MAX 구독으로 커버되는 방식
import subprocess

result = subprocess.run(
    ["claude", "-p", prompt, "--output-format", "json"],
    capture_output=True, text=True
)
```

하지만 이 방식은:
- 실시간 처리에 부적합 (CLI 초기화 오버헤드)
- 동시성 제한
- 서버 백그라운드 프로세스로 운영 어려움

따라서 **프로덕션 자동화에는 API 사용을 권장**합니다.

---

## 7. 배포 전략

### 7.1 Feature Flag 기반 라우팅

```python
# config.py

WORKFLOW_ROUTING = {
    "docupload": "fastapi",    # Phase 1 완료
    "docsummary": "fastapi",   # Phase 1 완료
    "docmeta": "n8n",          # Phase 2 진행 중
    "dococr": "n8n",
    "docprep-main": "n8n",
    "smartsearch": "n8n",
}
```

### 7.2 nginx 라우팅 설정

```nginx
# /etc/nginx/conf.d/aims-workflow.conf

upstream n8n_backend {
    server localhost:5678;
}

upstream fastapi_backend {
    server localhost:8000;
}

map $uri $workflow_backend {
    ~^/webhook/docupload    fastapi_backend;
    ~^/webhook/docsummary   fastapi_backend;
    default                 n8n_backend;
}

server {
    location /webhook/ {
        proxy_pass http://$workflow_backend;
    }
}
```

### 7.3 롤백 절차

1. nginx 설정에서 해당 워크플로우를 n8n으로 변경
2. `nginx -s reload`
3. 즉시 롤백 완료 (서비스 중단 없음)

---

## 8. 리스크 및 대응

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|----------|
| 응답 형식 불일치 | 높음 | 호환성 테스트 필수 통과 전 배포 금지 |
| 동시성 문제 | 중간 | 별도 Redis Consumer Group 사용 |
| 성능 저하 | 중간 | 각 단계마다 벤치마크 |
| 장애 시 복구 | 낮음 | nginx 라우팅 변경으로 즉시 롤백 |

---

## 9. 예상 일정

| Phase | 대상 | 워크플로우 수 | 예상 기간 |
|-------|------|-------------|----------|
| Phase 1 | DocUpload, DocSummary, ErrorLogger | 3개 | 3-4일 |
| Phase 2 | DocOCR, DocMeta | 2개 | 3-4일 |
| Phase 3 | OCRWorker, SmartSearch | 2개 | 3-4일 |
| Phase 4 | DocPrepMain | 1개 | 4-5일 |
| 검증 | 병행 운영 + E2E 테스트 | - | 2-3일 |
| **합계** | **8개 워크플로우** | | **약 2.5-3주** |

> **참고**: DocReadAI는 미사용으로 마이그레이션 대상에서 제외됨

---

## 10. 체크리스트

### Phase 1 시작 전
- [ ] FastAPI 프로젝트 구조 생성
- [ ] 테스트 인프라 구축 (pytest, fixtures)
- [ ] CI/CD 파이프라인 설정
- [ ] 로컬 개발 환경 구성

### 각 워크플로우 마이그레이션
- [ ] n8n 워크플로우 로직 분석
- [ ] FastAPI 엔드포인트 구현
- [ ] 단위 테스트 작성
- [ ] 호환성 테스트 통과
- [ ] 성능 벤치마크
- [ ] 코드 리뷰
- [ ] 스테이징 배포 및 검증
- [ ] 프로덕션 배포 (Feature Flag)
- [ ] 모니터링 (24시간)

### 전체 마이그레이션 완료 후
- [ ] n8n 워크플로우 비활성화
- [ ] DocReadAI 워크플로우 삭제 (미사용)
- [ ] n8n 서버 종료 (선택적)
- [ ] 문서 업데이트
- [ ] deploy/pull 스크립트에서 DocReadAI 제거

---

## 11. 참고 자료

- [n8n 워크플로우 JSON 파일](../backend/n8n_flows/)
- [기존 aims_api 구조](../backend/api/aims_api/)
- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)

---

## 12. 계획 검토 결과

> 작성일: 2025-12-28
> 검토자: Claude

### 12.1 현재 계획 커버리지

| 섹션 | 내용 | 상태 |
|------|------|------|
| 0-1 | 현황 분석 (8개 워크플로우, 외부 연동, 데이터 흐름) | ✅ 충분 |
| 2 | Strangler Fig Pattern, 의존성 기반 마이그레이션 순서 | ✅ 충분 |
| 3-4 | FastAPI 프로젝트 구조, API 호환성 명세 | ✅ 충분 |
| 5 | 테스트 전략 (Golden File, Mock, E2E, CI/CD) | ✅ 충분 |
| 6 | 인터페이스 계약, Shadow Mode, Claude 자동화 | ✅ 매우 상세 |
| 7 | 배포 전략 (Feature Flag, nginx, 롤백) | ✅ 충분 |
| 8-10 | 리스크, 일정, 체크리스트 | ✅ 충분 |

### 12.2 추가 고려 가능한 영역

| 영역 | 현재 상태 | 필요성 | 설명 |
|------|----------|--------|------|
| **모니터링/관측성** | 미언급 | 선택적 | Prometheus/Grafana 대시보드로 실시간 성능 모니터링 |
| **성능 벤치마크** | 미언급 | 선택적 | n8n vs FastAPI 응답시간 비교 |
| **장애 플레이북** | 롤백만 언급 | 선택적 | 시나리오별 대응 절차 |
| **데이터 무결성 검증** | Shadow Mode로 커버 | ✅ 충분 | - |

#### 모니터링/관측성 (Observability) 이란?

마이그레이션 중 시스템 상태를 실시간으로 파악하는 능력:

| 요소 | 설명 | 예시 |
|------|------|------|
| **Metrics** | 숫자 지표 | 응답시간, 에러율, 처리량 |
| **Logs** | 이벤트 기록 | 요청/응답 로그, 에러 스택트레이스 |
| **Traces** | 요청 추적 | 단일 요청이 어떤 서비스를 거쳤는지 |

현재 계획의 **Shadow Mode**가 이미 n8n vs FastAPI 비교를 수행하므로, 별도 모니터링 시스템 없이도 마이그레이션 검증은 가능합니다.

### 12.3 결론

**현재 계획으로 마이그레이션 시작하기에 충분합니다.**

핵심적인 모든 영역이 다뤄져 있으며, 특히 Section 6의 "인터페이스 계약 + Shadow Mode + Claude 자동화"는 마이그레이션 리스크를 크게 낮춥니다.

- 문서 분량: **11개 섹션, 2500+ 라인**
- 핵심 안전망: Shadow Mode (병행 운영)
- 자동화 수준: Claude-in-the-Loop (Haiku + Sonnet 하이브리드)
- 예상 자동화 비용: ~$16/월 (1000건 mismatch 기준)

---

## 13. 진행 기록

### 13.1 Shadow Mode 구현 완료 (2025-12-28)

#### 구현 내용

| 항목 | 상태 |
|------|------|
| document_pipeline API | ✅ localhost:8100 |
| Shadow Mode 미들웨어 | ✅ 구현 완료 |
| Claude 자동 분석 | ✅ 구현 (비활성화 상태) |
| nginx 프록시 | ✅ `/shadow/*` 경로 |
| 외부 접근 | ✅ `https://aims.giize.com/shadow/*` |

#### 구현된 Shadow 엔드포인트

| 엔드포인트 | n8n 워크플로우 | 테스트 결과 |
|------------|---------------|-------------|
| `/shadow/docsummary` | DocSummary | ✅ Match |
| `/shadow/docupload` | DocUpload | ✅ Match |
| `/shadow/dococr` | DocOCR | ✅ Match |
| `/shadow/docmeta` | DocMeta | ✅ Match |
| `/shadow/smart-search` | SmartSearch | ✅ Match |
| `/shadow/docprep-main` | DocPrepMain | ✅ Match |

#### 생성된 파일

```
backend/api/document_pipeline/
├── middleware/
│   └── shadow_mode.py       # Shadow call 로직
├── contracts/
│   └── dynamic_fields.py    # 응답 비교 로직 (IGNORE_FIELDS)
├── routers/
│   └── shadow_router.py     # Shadow 엔드포인트
└── services/
    └── anthropic_service.py # Claude 분석
```

#### IGNORE_FIELDS (응답 비교 시 무시)

동적 생성값, 시간 필드, AI 생성 필드 등 비교에서 제외:
- 파일 경로: `path`, `saved_name`, `dest_path`, `sourcePath`
- 시간: `created_at`, `timestamp`, `queued_at`, `done_at`
- ID: `file_hash`, `_id`, `id`, `document_id`
- AI 생성: `summary`, `tags`, `length`
- 메타데이터: `pdf_pages`, `extracted_text`, `mime`, `extension` 등

#### 사용 방법

```bash
# 상태 확인
curl https://aims.giize.com/shadow/status

# Shadow 모드 비활성화 (n8n만 호출)
curl -X POST https://aims.giize.com/shadow/disable

# Shadow 모드 활성화 (기본값)
curl -X POST https://aims.giize.com/shadow/enable

# Claude 자동 분석 활성화
curl -X POST https://aims.giize.com/shadow/auto-fix/true
```

#### 모니터링

```bash
# Mismatch 로그 확인
mongosh docupload --eval "db.shadow_mismatches.find().sort({timestamp:-1}).limit(5).pretty()"

# FastAPI 에러 로그
mongosh docupload --eval "db.shadow_errors.find().sort({timestamp:-1}).limit(5).pretty()"
```

---

## 14. 다음 단계 옵션

Shadow Mode 구현이 완료되었습니다. 아래 옵션 중 선택하세요:

### Option A: 프론트엔드 Shadow 연동 (검증 강화)

프론트엔드에서 `/shadow/*` 엔드포인트를 사용하여 실제 운영 환경에서 검증.

**변경 대상**: `frontend/aims-uix3/src/services/DocumentService.ts`
- `n8nd.giize.com/webhook/*` → `aims.giize.com/shadow/*`

**장점**: 실제 사용자 트래픽으로 검증
**단점**: 추가 구현 필요

### Option B: n8n 완전 교체 (직접 전환)

Shadow Mode 검증이 충분하다면 n8n을 FastAPI로 직접 교체.

**변경 대상**: nginx 설정
- `/webhook/*` → `localhost:8100/webhook/*`

**장점**: 빠른 마이그레이션 완료
**단점**: 롤백 시 nginx 재설정 필요

### Option C: 병행 운영 유지 (안정화)

현재 상태 유지. Shadow 엔드포인트로 간헐적 테스트만 수행.

**장점**: 리스크 최소화
**단점**: n8n + FastAPI 이중 운영 비용

### Option D: OCRWorker 마이그레이션

아직 마이그레이션되지 않은 **OCRWorker**(Redis 큐 폴링)를 FastAPI로 구현.

**복잡도**: ⭐⭐⭐ 높음 (5초 폴링, Consumer Group)
**장점**: 전체 파이프라인 FastAPI화 완성
