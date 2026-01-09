"""
Pytest fixtures for Document Pipeline tests
"""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from io import BytesIO
from datetime import datetime
from bson import ObjectId

from main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """Async HTTP client for testing"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_pdf():
    """Create a minimal PDF for testing"""
    # Minimal valid PDF
    pdf_content = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
196
%%EOF"""
    return BytesIO(pdf_content)


@pytest.fixture
def sample_image():
    """Create a minimal PNG image for testing"""
    # 1x1 transparent PNG
    png_content = bytes([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,  # PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 pixels
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,  # IDAT chunk
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,  # IEND chunk
        0x42, 0x60, 0x82
    ])
    return BytesIO(png_content)


@pytest.fixture
def sample_jpeg_minimal():
    """Create a minimal JPEG without EXIF for testing"""
    # Minimal valid JPEG structure
    jpeg_content = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,  # SOI + APP0 marker
        0x4A, 0x46, 0x49, 0x46, 0x00,        # JFIF identifier
        0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,  # JFIF data
        0xFF, 0xDB, 0x00, 0x43, 0x00,        # DQT marker
        0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07,
        0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14,
        0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13,
        0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A,
        0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22,
        0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C,
        0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39,
        0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
        0xFF, 0xC0, 0x00, 0x0B, 0x08,        # SOF0 marker
        0x00, 0x01, 0x00, 0x01,              # 1x1 pixel
        0x01, 0x01, 0x11, 0x00,
        0xFF, 0xC4, 0x00, 0x14, 0x00,        # DHT marker
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,  # SOS marker
        0x00, 0x00, 0x3F, 0x00, 0x7F,
        0xFF, 0xD9                            # EOI marker
    ])
    return jpeg_content


@pytest.fixture
def sample_jpeg_with_exif():
    """Create a JPEG with EXIF data for testing"""
    # JPEG with basic EXIF APP1 marker containing camera info
    exif_data = bytes([
        0xFF, 0xD8,                          # SOI
        0xFF, 0xE1, 0x00, 0x5E,              # APP1 marker + length
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,  # "Exif\0\0"
        0x4D, 0x4D, 0x00, 0x2A,              # TIFF header (big-endian)
        0x00, 0x00, 0x00, 0x08,              # IFD0 offset
        0x00, 0x03,                          # 3 IFD entries
        # Entry 1: Make (Tag 0x010F)
        0x01, 0x0F, 0x00, 0x02, 0x00, 0x00, 0x00, 0x08,
        0x00, 0x00, 0x00, 0x32,              # Offset to "Samsung\0"
        # Entry 2: Model (Tag 0x0110)
        0x01, 0x10, 0x00, 0x02, 0x00, 0x00, 0x00, 0x0A,
        0x00, 0x00, 0x00, 0x3A,              # Offset to "SM-N960N\0"
        # Entry 3: Orientation (Tag 0x0112)
        0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00,              # Value: 1 (normal)
        0x00, 0x00, 0x00, 0x00,              # Next IFD offset (none)
        # Value data
        0x53, 0x61, 0x6D, 0x73, 0x75, 0x6E, 0x67, 0x00,  # "Samsung\0"
        0x53, 0x4D, 0x2D, 0x4E, 0x39, 0x36, 0x30, 0x4E, 0x00, 0x00,  # "SM-N960N\0\0"
        # Minimal SOF0 (2x2 image)
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02, 0x00, 0x02,
        0x01, 0x01, 0x11, 0x00,
        # Minimal DHT
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
        # SOS + data
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0x7F,
        0xFF, 0xD9                            # EOI
    ])
    return exif_data


@pytest.fixture
def sample_jpeg_with_gps():
    """Create a JPEG with GPS EXIF data for testing (mocked)"""
    # For GPS testing, return basic EXIF JPEG
    # Actual GPS extraction is tested with mocks due to EXIF complexity
    return bytes([
        0xFF, 0xD8,                          # SOI
        0xFF, 0xE1, 0x00, 0x26,              # APP1 marker
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,  # "Exif\0\0"
        0x4D, 0x4D, 0x00, 0x2A,              # TIFF header
        0x00, 0x00, 0x00, 0x08,              # IFD0 offset
        0x00, 0x01,                          # 1 IFD entry
        # Entry: GPS IFD pointer (Tag 0x8825) - points to empty GPS IFD
        0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x1A,
        0x00, 0x00, 0x00, 0x00,              # Next IFD
        0x00, 0x00,                          # GPS IFD entries count (empty)
        # Minimal image data
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
        0x01, 0x01, 0x11, 0x00,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0x7F,
        0xFF, 0xD9
    ])


@pytest.fixture
def mock_meta_service_with_exif():
    """Mock MetaService returning image with EXIF data"""
    with patch("services.meta_service.MetaService.extract_metadata") as mock:
        mock.return_value = {
            "filename": "photo.jpg",
            "extension": ".jpg",
            "mime_type": "image/jpeg",
            "file_size": 1234567,
            "file_hash": "abc123def456",
            "created_at": datetime.utcnow().isoformat(),
            "error": False,
            "width": 3024,
            "height": 4032,
            "exif": {
                "Image Make": "Samsung",
                "Image Model": "SM-N960N",
                "EXIF DateTimeOriginal": "2026:01:04 05:13:51",
                "Image Orientation": "1",
            },
            "date_taken": "2026:01:04 05:13:51",
            "camera_make": "Samsung",
            "camera_model": "SM-N960N",
            "orientation": "1",
            "gps_latitude": None,
            "gps_longitude": None,
            "gps_latitude_ref": None,
            "gps_longitude_ref": None,
        }
        yield mock


@pytest.fixture
def sample_text():
    """Sample text for summarization testing"""
    return """
    인공지능(AI)은 인간의 학습 능력, 추론 능력, 지각 능력을 인공적으로 구현한
    컴퓨터 프로그램 또는 이를 포함한 컴퓨터 시스템입니다.
    머신러닝은 AI의 한 분야로, 명시적인 프로그래밍 없이 컴퓨터가 데이터로부터 학습하고
    예측하는 능력을 갖추도록 하는 기술입니다.
    딥러닝은 머신러닝의 한 종류로, 인공 신경망을 기반으로 하며
    대량의 데이터에서 복잡한 패턴을 학습할 수 있습니다.
    """


# ========================================
# Sample Data Fixtures
# ========================================

@pytest.fixture
def sample_document():
    """Sample MongoDB document for testing"""
    return {
        "_id": "507f1f77bcf86cd799439011",
        "ownerId": "test_user_123",
        "customerId": "test_customer_456",
        "createdAt": datetime.utcnow(),
        "upload": {
            "originalName": "test_document.pdf",
            "saveName": "20260105_143022_test_document.pdf",
            "destPath": "/data/uploads/test_user_123/20260105_143022_test_document.pdf",
            "uploaded_at": datetime.utcnow().isoformat()
        },
        "meta": {
            "filename": "20260105_143022_test_document.pdf",
            "extension": "pdf",
            "mime": "application/pdf",
            "size_bytes": 12345,
            "pdf_pages": 5,
            "full_text": "Sample document text content",
            "summary": "테스트 문서 요약입니다.",
            "tags": ["테스트", "문서"],
            "meta_status": "done"
        },
        "ocr": {
            "status": "completed"
        }
    }


@pytest.fixture
def sample_customer():
    """Sample customer data for testing"""
    return {
        "_id": "test_customer_456",
        "name": "테스트 고객",
        "ownerId": "test_user_123",
        "customer_type": "personal",
        "created_at": datetime.utcnow().isoformat()
    }


# ========================================
# Mock Fixtures - MongoDB
# ========================================

@pytest.fixture
def mock_mongo_collection():
    """Mock MongoDB collection with common operations"""
    mock_collection = AsyncMock()

    # Default find_one response
    mock_collection.find_one.return_value = {
        "_id": "test_doc_id",
        "ownerId": "test_user_123",
        "meta": {"status": "pending"}
    }

    # Default update_one response
    mock_result = MagicMock()
    mock_result.modified_count = 1
    mock_collection.update_one.return_value = mock_result

    # Default insert_one response
    mock_insert = MagicMock()
    mock_insert.inserted_id = ObjectId()
    mock_collection.insert_one.return_value = mock_insert

    # Default find response (returns async iterator)
    async def mock_find_to_list(*args, **kwargs):
        return []

    mock_cursor = AsyncMock()
    mock_cursor.to_list = mock_find_to_list
    mock_collection.find.return_value = mock_cursor

    return mock_collection


@pytest.fixture
def mock_mongo_service(mock_mongo_collection):
    """Mock MongoService.get_collection()"""
    with patch("services.mongo_service.MongoService.get_collection") as mock:
        mock.return_value = mock_mongo_collection
        yield mock_mongo_collection


# ========================================
# Mock Fixtures - External APIs
# ========================================

@pytest.fixture
def mock_openai_service():
    """Mock OpenAI service for summarization"""
    with patch("services.openai_service.OpenAIService.summarize_text") as mock:
        mock.return_value = {
            "summary": "테스트 문서 요약입니다.",
            "tags": ["테스트", "문서", "AI"],
            "truncated": False
        }
        yield mock


@pytest.fixture
def mock_upstage_service():
    """Mock Upstage OCR service"""
    with patch("services.upstage_service.UpstageService.process_ocr") as mock:
        mock.return_value = {
            "error": False,
            "status": 200,
            "full_text": "OCR로 추출된 텍스트입니다.",
            "confidence": 0.95,
            "num_pages": 3,
            "pages": [
                {"page": 1, "text": "페이지 1 텍스트"},
                {"page": 2, "text": "페이지 2 텍스트"},
                {"page": 3, "text": "페이지 3 텍스트"}
            ]
        }
        yield mock


@pytest.fixture
def mock_upstage_service_error():
    """Mock Upstage OCR service with error response"""
    with patch("services.upstage_service.UpstageService.process_ocr") as mock:
        mock.return_value = {
            "error": True,
            "status": 500,
            "userMessage": "OCR 처리 실패: API 오류"
        }
        yield mock


# ========================================
# Mock Fixtures - File Service
# ========================================

@pytest.fixture
def mock_file_service():
    """Mock FileService for file operations"""
    with patch("services.file_service.FileService.save_file") as mock_save:
        mock_save.return_value = (
            "20260105_143022_test.pdf",
            "/data/uploads/test_user/20260105_143022_test.pdf"
        )

        with patch("services.file_service.FileService.read_file_as_text") as mock_read:
            mock_read.return_value = "파일 내용입니다."
            yield {"save_file": mock_save, "read_file_as_text": mock_read}


# ========================================
# Mock Fixtures - Meta Service
# ========================================

@pytest.fixture
def mock_meta_service():
    """Mock MetaService for metadata extraction"""
    with patch("services.meta_service.MetaService.extract_metadata") as mock:
        mock.return_value = {
            "filename": "test_document.pdf",
            "extension": "pdf",
            "mime_type": "application/pdf",
            "file_size": 12345,
            "file_hash": "abc123def456",
            "num_pages": 5,
            "extracted_text": "추출된 텍스트 내용입니다.",
            "created_at": datetime.utcnow().isoformat(),
            "error": None
        }
        yield mock


@pytest.fixture
def mock_meta_service_no_text():
    """Mock MetaService returning no text (OCR needed)"""
    with patch("services.meta_service.MetaService.extract_metadata") as mock:
        mock.return_value = {
            "filename": "scanned_document.pdf",
            "extension": "pdf",
            "mime_type": "application/pdf",
            "file_size": 54321,
            "file_hash": "xyz789",
            "num_pages": 3,
            "extracted_text": "",  # No text - OCR needed
            "created_at": datetime.utcnow().isoformat(),
            "error": None
        }
        yield mock


@pytest.fixture
def mock_meta_service_error():
    """Mock MetaService with error response"""
    with patch("services.meta_service.MetaService.extract_metadata") as mock:
        mock.return_value = {
            "error": True,
            "status": 500,
            "code": "EXTRACTION_FAILED",
            "message": "메타데이터 추출 실패"
        }
        yield mock


# ========================================
# Mock Fixtures - Redis Service
# ========================================

@pytest.fixture
def mock_redis_service():
    """Mock RedisService for OCR queue operations"""
    with patch("services.redis_service.RedisService.add_to_stream") as mock_add:
        mock_add.return_value = "stream_message_id_123"

        with patch("services.redis_service.RedisService.read_from_stream") as mock_read:
            mock_read.return_value = []
            yield {"add_to_stream": mock_add, "read_from_stream": mock_read}


# ========================================
# Mock Fixtures - Shadow Mode
# ========================================

@pytest.fixture
def reset_shadow_mode():
    """Reset Shadow Mode state before/after tests"""
    from middleware.shadow_mode import ShadowMode, ServiceMode
    original_mode = ShadowMode.service_mode
    original_enabled = ShadowMode.enabled
    yield
    ShadowMode.service_mode = original_mode
    ShadowMode.enabled = original_enabled


# ========================================
# Integration Test Fixtures
# ========================================

@pytest.fixture
def mock_httpx_client():
    """Mock httpx.AsyncClient for external API calls"""
    with patch("httpx.AsyncClient") as mock:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "success"}
        mock_client.post.return_value = mock_response
        mock_client.get.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock.return_value = mock_client
        yield mock_client
