"""
시스템 파일 업로드 차단 테스트
Thumbs.db, .DS_Store 등 OS 자동 생성 파일이 업로드되지 않도록 필터링

Tests cover:
- 시스템 파일명으로 업로드 시 400 반환
- 정상 파일명은 통과 (400이 아닌 응답)
- _is_system_file() 유틸 함수 단위 테스트
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO

from routers.doc_prep_main import _is_system_file


class TestIsSystemFile:
    """_is_system_file 유틸 함수 단위 테스트"""

    def test_thumbs_db(self):
        assert _is_system_file("Thumbs.db") is True
        assert _is_system_file("thumbs.db") is True

    def test_ds_store(self):
        assert _is_system_file(".DS_Store") is True

    def test_desktop_ini(self):
        assert _is_system_file("desktop.ini") is True
        assert _is_system_file("Desktop.ini") is True

    def test_ehthumbs(self):
        assert _is_system_file("ehthumbs.db") is True
        assert _is_system_file("ehthumbs_vista.db") is True

    def test_normal_files_pass(self):
        assert _is_system_file("document.pdf") is False
        assert _is_system_file("image.jpg") is False
        assert _is_system_file("report.xlsx") is False
        assert _is_system_file("my_thumbs.db") is False
        assert _is_system_file("thumbs.pdf") is False

    def test_path_with_directory(self):
        """경로가 포함된 경우에도 basename으로 판단"""
        assert _is_system_file("/some/path/Thumbs.db") is True
        assert _is_system_file("C:\\Users\\test\\.DS_Store") is True
        assert _is_system_file("/some/path/document.pdf") is False


class TestSystemFileUploadBlocking:
    """시스템 파일 업로드 API 차단 테스트"""

    @pytest.mark.asyncio
    async def test_thumbs_db_rejected(self, client):
        """Thumbs.db 업로드 시 400 반환"""
        response = await client.post(
            "/webhook/docprep-main",
            files={"file": ("Thumbs.db", BytesIO(b"fake content"), "application/octet-stream")},
            data={"userId": "test_user"},
        )
        assert response.status_code == 400
        data = response.json()
        assert "시스템 파일" in data["detail"]

    @pytest.mark.asyncio
    async def test_ds_store_rejected(self, client):
        """.DS_Store 업로드 시 400 반환"""
        response = await client.post(
            "/webhook/docprep-main",
            files={"file": (".DS_Store", BytesIO(b"fake content"), "application/octet-stream")},
            data={"userId": "test_user"},
        )
        assert response.status_code == 400
        data = response.json()
        assert "시스템 파일" in data["detail"]

    @pytest.mark.asyncio
    async def test_desktop_ini_rejected(self, client):
        """desktop.ini 업로드 시 400 반환"""
        response = await client.post(
            "/webhook/docprep-main",
            files={"file": ("desktop.ini", BytesIO(b"[.ShellClassInfo]"), "text/plain")},
            data={"userId": "test_user"},
        )
        assert response.status_code == 400
        data = response.json()
        assert "시스템 파일" in data["detail"]

    @pytest.mark.asyncio
    async def test_normal_pdf_not_rejected(self, client, sample_pdf):
        """정상 PDF 파일은 시스템 파일 필터에 걸리지 않음 (다른 이유로 실패 가능)"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.check_credit_for_upload") as mock_credit, \
             patch("routers.doc_prep_main._connect_document_to_customer") as mock_connect, \
             patch("routers.doc_prep_main._notify_document_complete") as mock_notify:

            mock_credit.return_value = {"allowed": True}
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            mock_insert.inserted_id = "test_id"
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_mongo.get_collection.return_value = mock_collection

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 1000,
                "file_hash": "abc123",
                "extracted_text": "테스트 텍스트",
                "error": None,
            })
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약", "tags": ["테스트"],
            })
            mock_file.save_file = AsyncMock(return_value=("saved.pdf", "/path/saved.pdf"))

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("document.pdf", sample_pdf, "application/pdf")},
                data={"userId": "test_user"},
            )
            # 시스템 파일 필터(400)에는 걸리지 않아야 함
            assert response.status_code != 400
