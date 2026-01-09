"""
Tests for DocMeta Router
Metadata Extraction Handler - Replaces n8n DocMeta workflow

Tests cover:
- PDF metadata extraction
- Image metadata extraction
- OCR decision logic (text PDF vs scanned PDF)
- Binary mode vs Path mode
- Summary generation
- Error handling
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO


class TestDocMetaSuccess:
    """DocMeta 정상 처리 테스트"""

    @pytest.mark.asyncio
    async def test_pdf_metadata_binary_mode(self, client, sample_pdf):
        """PDF 메타데이터 추출 - Binary 모드"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            # MetaService mock
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "created_at": "2026-01-05T12:00:00Z",
                "exif": None,
                "num_pages": 5,
                "extracted_text": "추출된 텍스트 내용입니다.",
                "pdf_text_ratio": 0.85,
                "file_hash": "abc123def456",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "PDF 문서 요약입니다.",
                "tags": ["PDF", "문서"],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"owner_id": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            # n8n 응답 형식 검증
            assert data["status"] == "OK"
            assert data["filename"] == "test.pdf"
            assert data["extension"] == "pdf"
            assert data["mime"] == "application/pdf"
            assert data["size_bytes"] == 12345
            assert data["pdf_pages"] == 5
            assert data["summary"] == "PDF 문서 요약입니다."
            assert "PDF" in data["tags"]
            assert data["file_hash"] == "abc123def456"
            assert data["error"] is None

    @pytest.mark.asyncio
    async def test_pdf_metadata_path_mode(self, client):
        """PDF 메타데이터 추출 - Path 모드"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "document.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 54321,
                "num_pages": 10,
                "extracted_text": "Path 모드 텍스트",
                "file_hash": "xyz789",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "Path 모드 요약",
                "tags": ["Path"],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta",
                data={"path": "/data/uploads/user/document.pdf"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "OK"
            assert data["filename"] == "document.pdf"

    @pytest.mark.asyncio
    async def test_image_metadata(self, client, sample_image):
        """이미지 메타데이터 추출"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "image.png",
                "extension": "png",
                "mime_type": "image/png",
                "file_size": 2048,
                "created_at": "2026-01-05T12:00:00Z",
                "exif": '{"width": 1920, "height": 1080}',
                "num_pages": None,
                "extracted_text": "",  # 이미지는 텍스트 없음
                "file_hash": "img123",
                "error": None
            })

            # 텍스트 없으면 요약 생성 안 함
            mock_openai.summarize_text = AsyncMock()

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("image.png", sample_image.read(), "image/png")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "OK"
            assert data["mime"] == "image/png"
            assert data["exif"] == '{"width": 1920, "height": 1080}'
            assert data["pdf_pages"] is None
            assert data["extracted_text"] == ""

    @pytest.mark.asyncio
    async def test_json_endpoint(self, client):
        """JSON 엔드포인트 (/docmeta/json)"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "json_test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 9999,
                "num_pages": 3,
                "extracted_text": "JSON 테스트",
                "file_hash": "json123",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "JSON 요약",
                "tags": ["JSON"],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta/json",
                json={"path": "/data/uploads/user/json_test.pdf"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "OK"
            assert data["filename"] == "json_test.pdf"


class TestDocMetaOCRDecision:
    """OCR 필요 여부 판단 테스트"""

    @pytest.mark.asyncio
    async def test_text_pdf_no_ocr_needed(self, client, sample_pdf):
        """텍스트 PDF - OCR 불필요"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "text_pdf.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "num_pages": 5,
                "extracted_text": "이 PDF는 텍스트를 포함하고 있습니다. 충분한 양의 텍스트가 있어 OCR이 필요하지 않습니다.",
                "pdf_text_ratio": 0.9,  # 높은 텍스트 비율
                "file_hash": "text123",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "텍스트 PDF 요약",
                "tags": ["텍스트"],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("text.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["extracted_text"] != ""
            assert len(data["extracted_text"]) > 10
            assert data["summary"] is not None

    @pytest.mark.asyncio
    async def test_scanned_pdf_ocr_needed(self, client, sample_pdf):
        """스캔 PDF - OCR 필요"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "scanned.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 54321,
                "num_pages": 3,
                "extracted_text": "",  # 텍스트 없음 = 스캔 PDF
                "pdf_text_ratio": 0.0,  # 낮은 텍스트 비율
                "file_hash": "scan123",
                "error": None
            })

            # 텍스트 없으면 요약 생성 안 함
            mock_openai.summarize_text = AsyncMock()

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("scanned.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["extracted_text"] == ""
            assert data["summary"] is None

    @pytest.mark.asyncio
    async def test_mixed_pdf(self, client, sample_pdf):
        """혼합 PDF (일부 텍스트, 일부 스캔)"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "mixed.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 99999,
                "num_pages": 10,
                "extracted_text": "일부 텍스트만 추출됨",  # 부분적 텍스트
                "pdf_text_ratio": 0.3,  # 중간 정도 텍스트 비율
                "file_hash": "mix123",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "혼합 PDF 요약",
                "tags": ["혼합"],
                "truncated": False
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("mixed.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            # 부분적 텍스트가 있어도 처리됨
            assert data["extracted_text"] == "일부 텍스트만 추출됨"
            assert data["pdf_text_ratio"] == 0.3


class TestDocMetaErrors:
    """에러 처리 테스트"""

    @pytest.mark.asyncio
    async def test_no_input_error(self, client):
        """파일/경로 없음 에러"""
        response = await client.post("/webhook/docmeta")

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "ERROR"
        assert data["error"] == "NO_INPUT"
        assert "파일 또는 경로가 필요합니다" in data["message"]

    @pytest.mark.asyncio
    async def test_empty_file_error(self, client):
        """빈 파일 에러"""
        with patch("routers.doc_meta.MetaService") as mock_meta:
            # MetaService is not called for empty files
            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("test.pdf", b"", "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "ERROR"
            assert data["error"] == "NO_CONTENT"

    @pytest.mark.asyncio
    async def test_metadata_extraction_error(self, client, sample_pdf):
        """메타데이터 추출 실패"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "error": True,
                "status": 500,
                "code": "EXTRACTION_FAILED",
                "message": "PDF 파싱 중 오류 발생"
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("corrupted.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "ERROR"
            assert data["error"] == "EXTRACTION_FAILED"

    @pytest.mark.asyncio
    async def test_file_not_found_error(self, client):
        """파일 경로 없음 (Path 모드)"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "error": True,
                "status": 404,
                "code": "FILE_NOT_FOUND",
                "message": "파일을 찾을 수 없습니다"
            })

            response = await client.post(
                "/webhook/docmeta",
                data={"path": "/non/existent/file.pdf"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "ERROR"
            assert data["error"] == "FILE_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_summary_generation_failure(self, client, sample_pdf):
        """요약 생성 실패 - 메타데이터는 반환"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "num_pages": 5,
                "extracted_text": "텍스트 내용",
                "file_hash": "hash123",
                "error": None
            })

            # OpenAI 에러
            mock_openai.summarize_text = AsyncMock(side_effect=Exception("API 오류"))

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            assert response.status_code == 200
            data = response.json()

            # 메타데이터는 정상 반환
            assert data["status"] == "OK"
            assert data["filename"] == "test.pdf"
            # 요약은 실패해도 None
            assert data["summary"] is None


class TestDocMetaResponseFormat:
    """n8n 응답 형식 호환성 테스트"""

    @pytest.mark.asyncio
    async def test_success_response_format(self, client, sample_pdf):
        """성공 응답 형식 검증"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "created_at": "2026-01-05T12:00:00Z",
                "exif": None,
                "num_pages": 5,
                "extracted_text": "텍스트",
                "pdf_text_ratio": 0.8,
                "file_hash": "hash",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약",
                "tags": ["태그"],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
            )

            data = response.json()

            # n8n 응답 필수 필드
            required_fields = [
                "filename", "extension", "mime", "size_bytes",
                "created_at", "status", "exif", "pdf_pages",
                "extracted_text", "pdf_text_ratio", "summary",
                "length", "truncated", "tags", "file_hash", "error"
            ]

            for field in required_fields:
                assert field in data, f"Missing required field: {field}"

    @pytest.mark.asyncio
    async def test_error_response_format(self, client):
        """에러 응답 형식 검증"""
        response = await client.post("/webhook/docmeta")  # No input

        data = response.json()

        # 에러 시에도 동일한 필드 구조
        required_fields = [
            "filename", "extension", "mime", "size_bytes",
            "created_at", "status", "exif", "pdf_pages",
            "extracted_text", "pdf_text_ratio", "summary",
            "length", "truncated", "tags", "file_hash", "error"
        ]

        for field in required_fields:
            assert field in data, f"Missing required field in error response: {field}"

        # 에러 시 값
        assert data["status"] == "ERROR"
        assert data["error"] is not None
        assert data["filename"] is None


class TestDocMetaFileTypes:
    """다양한 파일 형식 테스트"""

    @pytest.mark.asyncio
    async def test_jpeg_image(self, client):
        """JPEG 이미지 메타데이터"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "photo.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "file_size": 5000,
                "exif": '{"Make": "Canon", "Model": "EOS 5D"}',
                "num_pages": None,
                "extracted_text": "",
                "file_hash": "jpg123",
                "error": None
            })

            jpeg_content = BytesIO(bytes([0xFF, 0xD8, 0xFF, 0xE0]))

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("photo.jpg", jpeg_content.read(), "image/jpeg")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["mime"] == "image/jpeg"
            assert data["exif"] is not None

    @pytest.mark.asyncio
    async def test_tiff_image(self, client):
        """TIFF 이미지 메타데이터"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "scan.tiff",
                "extension": "tiff",
                "mime_type": "image/tiff",
                "file_size": 50000,
                "num_pages": None,
                "extracted_text": "",
                "file_hash": "tiff123",
                "error": None
            })

            tiff_content = BytesIO(b"II*\x00")  # Little-endian TIFF header

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("scan.tiff", tiff_content.read(), "image/tiff")}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["mime"] == "image/tiff"

    @pytest.mark.asyncio
    async def test_word_document(self, client):
        """Word 문서 메타데이터"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "document.docx",
                "extension": "docx",
                "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "file_size": 25000,
                "num_pages": None,
                "extracted_text": "Word 문서 내용",
                "file_hash": "docx123",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "Word 요약",
                "tags": ["Word"],
                "truncated": False
            })

            docx_content = BytesIO(b"PK\x03\x04")  # DOCX is ZIP-based

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("document.docx", docx_content.read(),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
            )

            assert response.status_code == 200
            data = response.json()

            assert "word" in data["mime"].lower() or "openxmlformats" in data["mime"].lower()


class TestDocMetaExifResponse:
    """EXIF 메타데이터 응답 테스트"""

    @pytest.mark.asyncio
    async def test_image_exif_fields_in_response(self, client, sample_jpeg_with_exif):
        """이미지 응답에 EXIF 필드 포함 확인"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "photo.jpg",
                "extension": ".jpg",
                "mime_type": "image/jpeg",
                "file_size": 1234567,
                "created_at": "2026-01-09T12:00:00Z",
                "file_hash": "abc123",
                "error": False,
                "width": 3024,
                "height": 4032,
                "exif": {
                    "Image Make": "Samsung",
                    "Image Model": "SM-N960N",
                    "EXIF DateTimeOriginal": "2026:01:04 05:13:51",
                },
                "date_taken": "2026:01:04 05:13:51",
                "camera_make": "Samsung",
                "camera_model": "SM-N960N",
                "orientation": "1",
                "gps_latitude": None,
                "gps_longitude": None,
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("photo.jpg", sample_jpeg_with_exif, "image/jpeg")}
            )

            assert response.status_code == 200
            data = response.json()

            # EXIF 관련 필드 검증
            assert data["width"] == 3024
            assert data["height"] == 4032
            assert data["date_taken"] == "2026:01:04 05:13:51"
            assert data["camera_make"] == "Samsung"
            assert data["camera_model"] == "SM-N960N"
            assert data["orientation"] == "1"

    @pytest.mark.asyncio
    async def test_image_response_includes_all_exif_fields(self, client, sample_jpeg_with_exif):
        """이미지 응답에 모든 EXIF 필드 키 포함"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "photo.jpg",
                "extension": ".jpg",
                "mime_type": "image/jpeg",
                "file_size": 1000,
                "file_hash": "hash",
                "error": False,
                "width": 100,
                "height": 100,
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("photo.jpg", sample_jpeg_with_exif, "image/jpeg")}
            )

            data = response.json()

            # 모든 EXIF 관련 필드가 응답에 포함되어야 함
            exif_fields = [
                "width", "height", "date_taken",
                "camera_make", "camera_model",
                "gps_latitude", "gps_longitude",
                "gps_latitude_ref", "gps_longitude_ref",
                "orientation"
            ]

            for field in exif_fields:
                assert field in data, f"Missing EXIF field in response: {field}"

    @pytest.mark.asyncio
    async def test_pdf_no_exif_fields(self, client, sample_pdf):
        """PDF 응답에는 EXIF 필드가 None"""
        with patch("routers.doc_meta.MetaService") as mock_meta, \
             patch("routers.doc_meta.OpenAIService") as mock_openai:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "document.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "file_hash": "hash",
                "num_pages": 5,
                "extracted_text": "텍스트",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약",
                "tags": [],
                "truncated": False
            })

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("doc.pdf", sample_pdf.read(), "application/pdf")}
            )

            data = response.json()

            # PDF는 이미지 관련 필드가 None
            assert data["width"] is None
            assert data["height"] is None
            assert data["date_taken"] is None
            assert data["camera_make"] is None
            assert data["camera_model"] is None

    @pytest.mark.asyncio
    async def test_image_with_gps_coordinates(self, client):
        """GPS 좌표가 있는 이미지 응답"""
        with patch("routers.doc_meta.MetaService") as mock_meta:

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "gps_photo.jpg",
                "extension": ".jpg",
                "mime_type": "image/jpeg",
                "file_size": 2000000,
                "file_hash": "gps_hash",
                "error": False,
                "width": 4000,
                "height": 3000,
                "exif": {
                    "GPS GPSLatitude": "[37, 30, 0]",
                    "GPS GPSLongitude": "[127, 0, 0]",
                    "GPS GPSLatitudeRef": "N",
                    "GPS GPSLongitudeRef": "E",
                },
                "gps_latitude": "[37, 30, 0]",
                "gps_longitude": "[127, 0, 0]",
                "gps_latitude_ref": "N",
                "gps_longitude_ref": "E",
            })

            jpeg_header = bytes([0xFF, 0xD8, 0xFF, 0xE0])

            response = await client.post(
                "/webhook/docmeta",
                files={"file": ("gps.jpg", jpeg_header, "image/jpeg")}
            )

            data = response.json()

            assert data["gps_latitude"] == "[37, 30, 0]"
            assert data["gps_longitude"] == "[127, 0, 0]"
            assert data["gps_latitude_ref"] == "N"
            assert data["gps_longitude_ref"] == "E"

    @pytest.mark.asyncio
    async def test_error_response_includes_exif_fields(self, client):
        """에러 응답에도 EXIF 필드 포함 (None 값)"""
        response = await client.post("/webhook/docmeta")  # No input

        data = response.json()

        # 에러 응답에도 EXIF 필드가 포함되어야 함
        exif_fields = [
            "width", "height", "date_taken",
            "camera_make", "camera_model",
            "gps_latitude", "gps_longitude",
            "gps_latitude_ref", "gps_longitude_ref",
            "orientation"
        ]

        for field in exif_fields:
            assert field in data, f"Missing EXIF field in error response: {field}"
            assert data[field] is None
