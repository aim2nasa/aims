"""
Meta Service Unit Tests
@since 2026-02-05

테스트 범위:
1. extract_metadata - 메타데이터 추출
2. _extract_pdf_info - PDF 텍스트/페이지
3. _extract_image_info - 이미지 EXIF/크기
4. 에러 처리
"""
import pytest
import io
import tempfile
import os
from unittest.mock import patch, MagicMock
from pathlib import Path

# Import path setup
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.meta_service import MetaService


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def sample_pdf_content():
    """Minimal PDF content"""
    return b"""%PDF-1.4
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


@pytest.fixture
def sample_pdf_with_text():
    """텍스트가 포함된 실제 PDF (pypdfium2 regression 테스트용)"""
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import A4
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.setFont("Helvetica", 12)
        c.drawString(72, 700, "Annual Review Report")
        c.drawString(72, 680, "MetLife Insurance Coverage Summary")
        c.drawString(72, 660, "Customer Name: Test User")
        c.showPage()
        c.drawString(72, 700, "Page 2: Contract Details")
        c.drawString(72, 680, "Premium: 50,000 KRW")
        c.showPage()
        c.save()
        return buf.getvalue()
    except ImportError:
        pytest.skip("reportlab not installed")


@pytest.fixture
def sample_text_content():
    """Sample text content"""
    return b"This is sample text content for testing."


# =============================================================================
# 1. extract_metadata 기본 테스트
# =============================================================================

class TestExtractMetadataBasic:
    """메타데이터 추출 기본 테스트"""

    @pytest.mark.asyncio
    async def test_extract_from_content(self, sample_text_content):
        """바이트 콘텐츠에서 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_text_content,
            filename="test.txt"
        )

        assert result["error"] is False
        assert result["filename"] == "test.txt"
        assert result["extension"] == ".txt"
        assert result["file_size"] == len(sample_text_content)

    @pytest.mark.asyncio
    async def test_extract_from_file_path(self):
        """파일 경로에서 추출"""
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f:
            f.write(b"test content")
            f.flush()
            temp_path = f.name

        try:
            result = await MetaService.extract_metadata(file_path=temp_path)
            assert result["error"] is False
            assert ".txt" in result["extension"]
        finally:
            os.unlink(temp_path)

    @pytest.mark.asyncio
    async def test_extract_computes_hash(self, sample_text_content):
        """해시 계산"""
        result = await MetaService.extract_metadata(
            file_content=sample_text_content,
            filename="test.txt"
        )

        assert result["file_hash"] is not None
        assert len(result["file_hash"]) == 64  # SHA-256

    @pytest.mark.asyncio
    async def test_extract_mime_type(self):
        """MIME 타입 추출"""
        result = await MetaService.extract_metadata(
            file_content=b"content",
            filename="document.pdf"
        )

        assert result["mime_type"] == "application/pdf"


# =============================================================================
# 2. 에러 처리 테스트
# =============================================================================

class TestExtractMetadataErrors:
    """에러 처리 테스트"""

    @pytest.mark.asyncio
    async def test_no_input_error(self):
        """입력 없으면 에러"""
        result = await MetaService.extract_metadata()

        assert result["error"] is True
        assert result["code"] == "NO_INPUT"

    @pytest.mark.asyncio
    async def test_file_not_found_error(self):
        """파일 없으면 에러"""
        result = await MetaService.extract_metadata(
            file_path="/nonexistent/path/file.txt"
        )

        assert result["error"] is True
        assert result["code"] == "FILE_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_error_response_structure(self):
        """에러 응답 구조"""
        result = await MetaService.extract_metadata()

        assert "status" in result
        assert "code" in result
        assert "message" in result


# =============================================================================
# 3. PDF 추출 테스트
# =============================================================================

class TestExtractPdfInfo:
    """PDF 정보 추출 테스트"""

    @pytest.mark.asyncio
    async def test_pdf_mime_type_detected(self, sample_pdf_content):
        """PDF MIME 타입 감지"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_content,
            filename="test.pdf"
        )

        assert result["mime_type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_pdf_without_pypdfium2(self, sample_pdf_content):
        """pypdfium2 없으면 num_pages=None"""
        with patch.dict("sys.modules", {"pypdfium2": None}):
            with patch("services.meta_service.HAS_PYPDFIUM2", False):
                result = await MetaService.extract_metadata(
                    file_content=sample_pdf_content,
                    filename="test.pdf"
                )

                # pypdfium2 없어도 에러 아님
                assert result["error"] is False


# =============================================================================
# 4. 이미지 추출 테스트
# =============================================================================

class TestExtractImageInfo:
    """이미지 정보 추출 테스트"""

    def test_extract_image_info_without_libs(self):
        """라이브러리 없으면 빈 결과"""
        with patch("services.meta_service.HAS_PIL", False), \
             patch("services.meta_service.HAS_EXIFREAD", False):

            content = b"\x89PNG..."
            result = MetaService._extract_image_info(content, "image/png")

            assert result["width"] is None
            assert result["height"] is None
            assert result["exif"] is None

    def test_extract_image_info_returns_dict(self):
        """딕셔너리 반환"""
        result = MetaService._extract_image_info(b"", "image/jpeg")

        assert isinstance(result, dict)
        assert "width" in result
        assert "height" in result
        assert "exif" in result


# =============================================================================
# 5. Office 문서 추출 테스트
# =============================================================================

class TestExtractOfficeInfo:
    """Office 문서 추출 테스트"""

    def test_xlsx_without_openpyxl(self):
        """openpyxl 없으면 빈 결과"""
        with patch("services.meta_service.HAS_OPENPYXL", False):
            content = b"xlsx content"
            mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

            result = MetaService._extract_xlsx_info(content, mime)

            assert result["extracted_text"] is None

    def test_docx_without_python_docx(self):
        """python-docx 없으면 빈 결과"""
        with patch("services.meta_service.HAS_DOCX", False):
            content = b"docx content"
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

            result = MetaService._extract_docx_info(content, mime)

            assert result["extracted_text"] is None

    def test_pptx_without_python_pptx(self):
        """python-pptx 없으면 빈 결과"""
        with patch("services.meta_service.HAS_PPTX", False):
            content = b"pptx content"

            result = MetaService._extract_pptx_info(content)

            assert result["extracted_text"] is None
            assert result["num_pages"] is None


# =============================================================================
# 6. _error_response 테스트
# =============================================================================

class TestErrorResponse:
    """에러 응답 테스트"""

    def test_error_response_structure(self):
        """에러 응답 구조"""
        result = MetaService._error_response("TEST_ERROR", "Test message")

        assert result["status"] == 500
        assert result["error"] is True
        assert result["code"] == "TEST_ERROR"
        assert result["message"] == "Test message"
        assert result["filename"] is None

    def test_error_response_all_fields_present(self):
        """모든 필드 포함"""
        result = MetaService._error_response("CODE", "msg")

        expected_fields = [
            "status", "error", "code", "message",
            "filename", "extension", "mime_type", "file_size",
            "created_at", "file_hash", "extracted_text",
            "num_pages", "pdf_text_ratio", "exif", "width", "height"
        ]

        for field in expected_fields:
            assert field in result


# =============================================================================
# 7. 텍스트 파일 추출 테스트
# =============================================================================

class TestTextExtraction:
    """텍스트 파일 추출 테스트"""

    @pytest.mark.asyncio
    async def test_text_file_content_extracted(self, sample_text_content):
        """텍스트 파일 내용 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_text_content,
            filename="test.txt"
        )

        assert result["extracted_text"] is not None
        assert "sample text" in result["extracted_text"]

    @pytest.mark.asyncio
    async def test_unknown_mime_defaults(self):
        """알 수 없는 MIME → application/octet-stream"""
        result = await MetaService.extract_metadata(
            file_content=b"binary data",
            filename="unknown.zzzzxxx"  # 존재하지 않는 확장자
        )

        assert result["mime_type"] == "application/octet-stream"


# =============================================================================
# 8. pypdfium2 Regression 테스트
# =============================================================================

class TestPypdfium2Regression:
    """pypdfium2 텍스트 추출 교체 regression 테스트"""

    @pytest.mark.asyncio
    async def test_pdf_text_extraction(self, sample_pdf_with_text):
        """PDF에서 텍스트 추출 확인"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_with_text,
            filename="test.pdf"
        )

        assert result["error"] is False
        assert result["extracted_text"] is not None
        assert len(result["extracted_text"]) > 0

    @pytest.mark.asyncio
    async def test_pdf_page_count(self, sample_pdf_with_text):
        """페이지 수 정확히 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_with_text,
            filename="test.pdf"
        )

        assert result["num_pages"] == 2

    @pytest.mark.asyncio
    async def test_pdf_text_ratio(self, sample_pdf_with_text):
        """pdf_text_ratio 계산 확인"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_with_text,
            filename="test.pdf"
        )

        assert result["pdf_text_ratio"] is not None
        assert result["pdf_text_ratio"] > 0

    @pytest.mark.asyncio
    async def test_pdf_keywords_preserved(self, sample_pdf_with_text):
        """AR/CRS 감지 키워드가 텍스트에 보존되는지 확인"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_with_text,
            filename="test.pdf"
        )

        text = result["extracted_text"]
        assert "Annual Review Report" in text
        assert "MetLife" in text
        assert "Customer Name" in text

    @pytest.mark.asyncio
    async def test_pdf_multipage_text(self, sample_pdf_with_text):
        """다중 페이지 텍스트가 모두 추출되는지 확인"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_with_text,
            filename="test.pdf"
        )

        text = result["extracted_text"]
        # 1페이지 텍스트
        assert "Annual Review Report" in text
        # 2페이지 텍스트
        assert "Page 2" in text or "Contract" in text or "Premium" in text

    @pytest.mark.asyncio
    async def test_empty_pdf_no_error(self, sample_pdf_content):
        """텍스트 없는 PDF도 에러 없이 처리"""
        result = await MetaService.extract_metadata(
            file_content=sample_pdf_content,
            filename="empty.pdf"
        )

        assert result["error"] is False
        assert result["num_pages"] is not None

    @pytest.mark.asyncio
    async def test_corrupt_pdf_graceful_error(self):
        """손상된 PDF 입력 시 graceful 에러 처리"""
        result = await MetaService.extract_metadata(
            file_content=b"not a valid pdf content at all",
            filename="corrupt.pdf"
        )

        # 에러가 나더라도 crash 없이 결과 반환
        assert isinstance(result, dict)
