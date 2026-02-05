"""
Tests for DocOCR Router
OCR Processing Handler - Replaces n8n DocOCR workflow

Tests cover:
- PDF OCR success
- Image OCR success
- Upstage API call verification
- Text extraction result verification
- Error handling
- Empty file handling
- No filename handling
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO


class TestDocOCRSuccess:
    """DocOCR 정상 처리 테스트"""

    @pytest.mark.asyncio
    async def test_pdf_ocr_success(self, client, sample_pdf):
        """PDF OCR 성공 케이스"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            # Upstage mock
            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "PDF에서 추출된 텍스트입니다. 문서 내용이 포함되어 있습니다.",
                "confidence": 0.95,
                "num_pages": 5,
                "pages": [
                    {"page": 1, "text": "페이지 1"},
                    {"page": 2, "text": "페이지 2"},
                    {"page": 3, "text": "페이지 3"},
                    {"page": 4, "text": "페이지 4"},
                    {"page": 5, "text": "페이지 5"}
                ]
            })

            # OpenAI mock for summary
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "PDF 문서 요약입니다.",
                "tags": ["PDF", "문서", "테스트"]
            })

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={
                    "owner_id": "test_user_123",
                    "document_id": "doc_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            # n8n 응답 형식 검증
            assert data["status"] == 200
            assert data["error"] == False
            assert data["userMessage"] == "OCR 성공"
            assert data["confidence"] == 0.95
            assert data["summary"] == "PDF 문서 요약입니다."
            assert "PDF" in data["tags"]
            assert data["full_text"] == "PDF에서 추출된 텍스트입니다. 문서 내용이 포함되어 있습니다."
            assert data["num_pages"] == 5
            assert len(data["pages"]) == 5

    @pytest.mark.asyncio
    async def test_image_ocr_success(self, client, sample_image):
        """이미지 OCR 성공 케이스"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            # Upstage mock
            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "이미지에서 추출된 텍스트입니다.",
                "confidence": 0.88,
                "num_pages": 1,
                "pages": [{"page": 1, "text": "이미지 텍스트"}]
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "이미지 문서 요약",
                "tags": ["이미지"]
            })

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.png", sample_image.read(), "image/png")},
                data={"owner_id": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == 200
            assert data["error"] == False
            assert data["confidence"] == 0.88
            assert data["num_pages"] == 1

    @pytest.mark.asyncio
    async def test_jpeg_image_ocr(self, client):
        """JPEG 이미지 OCR 테스트"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            # Upstage mock
            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "JPEG 이미지 텍스트",
                "confidence": 0.92,
                "num_pages": 1,
                "pages": [{"page": 1, "text": "JPEG 텍스트"}]
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "JPEG 요약",
                "tags": ["JPEG"]
            })

            # Minimal JPEG header
            jpeg_content = BytesIO(bytes([
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
                0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
                0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
            ]))

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.jpg", jpeg_content.read(), "image/jpeg")}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["error"] == False


class TestDocOCRUpstageAPI:
    """Upstage API 호출 검증 테스트"""

    @pytest.mark.asyncio
    async def test_upstage_api_called_with_content(self, client, sample_pdf):
        """Upstage API가 파일 내용으로 호출되는지 확인"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "테스트",
                "confidence": 0.9,
                "num_pages": 1,
                "pages": []
            })

            mock_openai.summarize_text = AsyncMock(return_value={"summary": "요약", "tags": []})

            pdf_content = sample_pdf.read()
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", pdf_content, "application/pdf")}
            )

            assert response.status_code == 200

            # Verify Upstage API was called
            mock_upstage.process_ocr.assert_called_once()
            call_args = mock_upstage.process_ocr.call_args
            assert call_args[0][1] == "test.pdf"  # filename

    @pytest.mark.asyncio
    async def test_summary_generation_on_text_extracted(self, client, sample_pdf):
        """텍스트 추출 시 요약 생성 호출 확인"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            extracted_text = "긴 텍스트 내용입니다. " * 100

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": extracted_text,
                "confidence": 0.95,
                "num_pages": 3,
                "pages": []
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "긴 문서 요약",
                "tags": ["긴", "문서"]
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200

            # Verify OpenAI summarize was called with extracted text
            mock_openai.summarize_text.assert_called_once()
            call_args = mock_openai.summarize_text.call_args
            assert call_args[0][0] == extracted_text  # 첫 번째 위치 인수


class TestDocOCRErrors:
    """에러 처리 테스트"""

    @pytest.mark.asyncio
    async def test_no_filename_error(self, client):
        """파일명 없음 에러 - FastAPI 422 validation error"""
        # Send file without filename - FastAPI rejects with 422 validation error
        response = await client.post(
            "/webhook/dococr",
            files={"file": ("", b"", "application/pdf")}  # Empty filename
        )

        # FastAPI returns 422 for validation errors before reaching handler
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_file_error(self, client):
        """빈 파일 에러 - 400 응답"""
        response = await client.post(
            "/webhook/dococr",
            files={"file": ("test.pdf", b"", "application/pdf")}  # Empty content
        )

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == 400
        assert data["error"] == True
        assert "빈 파일" in data["userMessage"]

    @pytest.mark.asyncio
    async def test_upstage_api_error(self, client, sample_pdf):
        """Upstage API 에러 처리"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": True,
                "status": 500,
                "userMessage": "Upstage API 오류: 서버 내부 오류"
            })

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == 500
            assert data["error"] == True
            assert "Upstage API" in data["userMessage"]
            assert data["confidence"] is None
            assert data["summary"] is None

    @pytest.mark.asyncio
    async def test_upstage_timeout_error(self, client, sample_pdf):
        """Upstage API 타임아웃 에러"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": True,
                "status": 408,
                "userMessage": "OCR 처리 시간 초과"
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["error"] == True
            assert data["status"] == 408

    @pytest.mark.asyncio
    async def test_summary_generation_failure(self, client, sample_pdf):
        """요약 생성 실패 시에도 OCR 결과는 반환"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "OCR 텍스트",
                "confidence": 0.9,
                "num_pages": 1,
                "pages": []
            })

            # OpenAI raises exception
            mock_openai.summarize_text = AsyncMock(side_effect=Exception("OpenAI API 오류"))

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            # OCR 결과는 반환되어야 함
            assert data["error"] == False
            assert data["full_text"] == "OCR 텍스트"
            # 요약은 실패해도 None
            assert data["summary"] is None
            assert data["tags"] == []

    @pytest.mark.asyncio
    async def test_unexpected_exception(self, client, sample_pdf):
        """예상치 못한 예외 처리"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage:

            mock_upstage.process_ocr = AsyncMock(side_effect=Exception("Unexpected error"))

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == 500
            assert data["error"] == True
            assert "OCR 처리 실패" in data["userMessage"]


class TestDocOCRResponseFormat:
    """n8n 응답 형식 호환성 테스트"""

    @pytest.mark.asyncio
    async def test_success_response_format(self, client, sample_pdf):
        """성공 응답 형식이 n8n과 일치하는지 확인"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "텍스트",
                "confidence": 0.9,
                "num_pages": 2,
                "pages": [{"page": 1, "text": "p1"}, {"page": 2, "text": "p2"}]
            })

            mock_openai.summarize_text = AsyncMock(return_value={"summary": "요약", "tags": ["태그"]})

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            data = response.json()

            # n8n 응답 필수 필드 확인
            required_fields = [
                "status", "error", "userMessage", "confidence",
                "summary", "tags", "full_text", "num_pages", "pages"
            ]

            for field in required_fields:
                assert field in data, f"Missing required field: {field}"

            # 타입 검증
            assert isinstance(data["status"], int)
            assert isinstance(data["error"], bool)
            assert isinstance(data["userMessage"], str)
            assert data["confidence"] is None or isinstance(data["confidence"], (int, float))
            assert data["summary"] is None or isinstance(data["summary"], str)
            assert isinstance(data["tags"], list)
            assert data["full_text"] is None or isinstance(data["full_text"], str)
            assert data["num_pages"] is None or isinstance(data["num_pages"], int)
            assert isinstance(data["pages"], list)

    @pytest.mark.asyncio
    async def test_error_response_format(self, client, sample_pdf):
        """에러 응답 형식이 n8n과 일치하는지 확인"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": True,
                "status": 500,
                "userMessage": "API 오류"
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            data = response.json()

            # 에러 시에도 동일한 필드 구조
            required_fields = [
                "status", "error", "userMessage", "confidence",
                "summary", "tags", "full_text", "num_pages", "pages"
            ]

            for field in required_fields:
                assert field in data, f"Missing required field in error response: {field}"

            # 에러 시 값 검증
            assert data["error"] == True
            assert data["confidence"] is None
            assert data["summary"] is None
            assert data["tags"] == []
            assert data["full_text"] is None
            assert data["num_pages"] is None
            assert data["pages"] == []


class TestDocOCREdgeCases:
    """엣지 케이스 테스트"""

    @pytest.mark.asyncio
    async def test_large_pdf(self, client):
        """대용량 PDF 처리"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            # 100페이지 분량 시뮬레이션
            pages = [{"page": i, "text": f"페이지 {i} 내용"} for i in range(1, 101)]
            full_text = "\n".join([p["text"] for p in pages])

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": full_text,
                "confidence": 0.85,
                "num_pages": 100,
                "pages": pages
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "대용량 문서 요약",
                "tags": ["대용량"]
            })

            # Create larger PDF content
            large_pdf = BytesIO(b"%PDF-1.4\n" + b"x" * 10000 + b"\n%%EOF")

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("large.pdf", large_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["error"] == False
            assert data["num_pages"] == 100
            assert len(data["pages"]) == 100

    @pytest.mark.asyncio
    async def test_no_text_extracted(self, client, sample_image):
        """텍스트 없는 이미지 (순수 그래픽)"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": "",  # No text extracted
                "confidence": 0.0,
                "num_pages": 1,
                "pages": [{"page": 1, "text": ""}]
            })

            # summarize_text not called when no text
            mock_openai.summarize_text = AsyncMock()

            response = await client.post(
                "/webhook/dococr",
                files={"file": ("graphic.png", sample_image.read(), "image/png")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["error"] == False
            assert data["full_text"] == ""
            # Summary should not be generated for empty text
            # (depends on implementation - check actual behavior)

    @pytest.mark.asyncio
    async def test_special_characters_in_text(self, client, sample_pdf):
        """특수 문자가 포함된 텍스트"""
        with patch("routers.doc_ocr.upstage_service") as mock_upstage, \
             patch("routers.doc_ocr.openai_service") as mock_openai:

            special_text = "테스트 문서 <script>alert('xss')</script> & 특수문자: \"'`\\n\\t"

            mock_upstage.process_ocr = AsyncMock(return_value={
                "error": False,
                "status": 200,
                "full_text": special_text,
                "confidence": 0.9,
                "num_pages": 1,
                "pages": [{"page": 1, "text": special_text}]
            })

            mock_openai.summarize_text = AsyncMock(return_value={"summary": "요약", "tags": []})

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/dococr",
                files={"file": ("special.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["error"] == False
            assert data["full_text"] == special_text
