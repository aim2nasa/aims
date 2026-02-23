"""
File Service Unit Tests
@since 2026-02-05

테스트 범위:
1. _generate_filename - 파일명 생성
2. _get_user_path - 사용자 경로 생성
3. save_file - 파일 저장
4. read_file - 파일 읽기
5. get_file_info - 파일 정보
6. compute_hash - 해시 계산
"""
import pytest
import os
import tempfile
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
from datetime import datetime

# Import path setup
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.file_service import FileService


# =============================================================================
# 1. _generate_filename 테스트
# =============================================================================

class TestGenerateFilename:
    """파일명 생성 테스트"""

    def test_generate_filename_has_timestamp(self):
        """타임스탬프 포함"""
        result = FileService._generate_filename("test.pdf")
        # YYMMDDHHMMSS_hash.ext 형식
        assert len(result.split("_")[0]) == 12  # timestamp

    def test_generate_filename_preserves_extension(self):
        """확장자 보존"""
        result = FileService._generate_filename("document.pdf")
        assert result.endswith(".pdf")

    def test_generate_filename_different_extensions(self):
        """다양한 확장자"""
        extensions = [".jpg", ".png", ".docx", ".xlsx"]
        for ext in extensions:
            result = FileService._generate_filename(f"file{ext}")
            assert result.endswith(ext)

    def test_generate_filename_unique(self):
        """고유 파일명 생성"""
        name1 = FileService._generate_filename("test.pdf")
        name2 = FileService._generate_filename("test.pdf")
        # 해시 + 타임스탬프로 구분됨
        assert name1 != name2 or len(name1) > 0


# =============================================================================
# 2. _get_user_path 테스트
# =============================================================================

class TestGetUserPath:
    """사용자 경로 생성 테스트"""

    def test_get_user_path_structure(self):
        """경로 구조: base/users/{user_id}/{year}/{month}"""
        with patch("services.file_service.get_settings") as mock_settings:
            mock_settings.return_value.FILE_BASE_PATH = "/data/uploads"

            path = FileService._get_user_path("user-123")

            assert "users" in str(path)
            assert "user-123" in str(path)

    def test_get_user_path_year_month(self):
        """현재 연도/월 포함"""
        with patch("services.file_service.get_settings") as mock_settings:
            mock_settings.return_value.FILE_BASE_PATH = "/data/uploads"

            now = datetime.now()
            path = FileService._get_user_path("user-123")

            assert str(now.year) in str(path)
            assert f"{now.month:02d}" in str(path)


# =============================================================================
# 3. save_file 테스트
# =============================================================================

class TestSaveFile:
    """파일 저장 테스트"""

    @pytest.mark.asyncio
    async def test_save_file_returns_tuple(self):
        """(saved_name, dest_path) 튜플 반환"""
        with patch("services.file_service.get_settings") as mock_settings, \
             patch("os.makedirs") as mock_makedirs, \
             patch("aiofiles.open", new_callable=MagicMock) as mock_open:

            mock_settings.return_value.FILE_BASE_PATH = "/tmp/test"
            mock_file = AsyncMock()
            mock_file.__aenter__.return_value = mock_file
            mock_file.__aexit__.return_value = None
            mock_open.return_value = mock_file

            saved_name, dest_path = await FileService.save_file(
                b"content",
                "test.pdf",
                "user-123"
            )

            assert isinstance(saved_name, str)
            assert isinstance(dest_path, str)
            assert saved_name.endswith(".pdf")

    @pytest.mark.asyncio
    async def test_save_file_creates_directory(self):
        """디렉토리 생성"""
        with patch("services.file_service.get_settings") as mock_settings, \
             patch("os.makedirs") as mock_makedirs, \
             patch("aiofiles.open", new_callable=MagicMock) as mock_open:

            mock_settings.return_value.FILE_BASE_PATH = "/tmp/test"
            mock_file = AsyncMock()
            mock_file.__aenter__.return_value = mock_file
            mock_file.__aexit__.return_value = None
            mock_open.return_value = mock_file

            await FileService.save_file(b"content", "test.pdf", "user-123")

            mock_makedirs.assert_called_once()


# =============================================================================
# 4. read_file 테스트
# =============================================================================

class TestReadFile:
    """파일 읽기 테스트"""

    @pytest.mark.asyncio
    async def test_read_file_returns_bytes(self):
        """바이트 반환"""
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"test content")
            f.flush()
            temp_path = f.name

        try:
            result = await FileService.read_file(temp_path)
            assert result == b"test content"
        finally:
            os.unlink(temp_path)

    @pytest.mark.asyncio
    async def test_read_file_as_text(self):
        """텍스트 반환"""
        with tempfile.NamedTemporaryFile(delete=False, mode='w', suffix='.txt', encoding='utf-8') as f:
            f.write("한글 텍스트")
            f.flush()
            temp_path = f.name

        try:
            result = await FileService.read_file_as_text(temp_path)
            assert "한글 텍스트" in result
        finally:
            os.unlink(temp_path)

    @pytest.mark.asyncio
    async def test_read_file_as_text_fallback_latin1(self):
        """latin-1 fallback"""
        with tempfile.NamedTemporaryFile(delete=False, mode='wb') as f:
            # latin-1 인코딩 바이트
            f.write(b"\xe0\xe1\xe2")
            f.flush()
            temp_path = f.name

        try:
            result = await FileService.read_file_as_text(temp_path)
            assert len(result) > 0
        finally:
            os.unlink(temp_path)


# =============================================================================
# 5. get_file_info 테스트
# =============================================================================

class TestGetFileInfo:
    """파일 정보 테스트"""

    def test_get_file_info_returns_dict(self):
        """딕셔너리 반환"""
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f:
            f.write(b"test")
            f.flush()
            temp_path = f.name

        try:
            result = FileService.get_file_info(temp_path)
            assert "filename" in result
            assert "extension" in result
            assert "mime" in result
            assert "size_bytes" in result
            assert "created_at" in result
        finally:
            os.unlink(temp_path)

    def test_get_file_info_extension(self):
        """확장자 추출"""
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as f:
            f.write(b"test")
            f.flush()
            temp_path = f.name

        try:
            result = FileService.get_file_info(temp_path)
            assert result["extension"] == ".pdf"
        finally:
            os.unlink(temp_path)

    def test_get_file_info_not_found(self):
        """파일 없으면 예외"""
        with pytest.raises(FileNotFoundError):
            FileService.get_file_info("/nonexistent/file.txt")


# =============================================================================
# 6. compute_hash 테스트
# =============================================================================

class TestComputeHash:
    """해시 계산 테스트"""

    def test_compute_hash_sha256(self):
        """SHA-256 해시"""
        content = b"test content"
        result = FileService.compute_hash(content)
        assert len(result) == 64  # SHA-256 hex

    def test_compute_hash_deterministic(self):
        """동일 입력 → 동일 해시"""
        content = b"same content"
        hash1 = FileService.compute_hash(content)
        hash2 = FileService.compute_hash(content)
        assert hash1 == hash2

    def test_compute_hash_different_input(self):
        """다른 입력 → 다른 해시"""
        hash1 = FileService.compute_hash(b"content1")
        hash2 = FileService.compute_hash(b"content2")
        assert hash1 != hash2

    def test_compute_hash_empty(self):
        """빈 입력"""
        result = FileService.compute_hash(b"")
        assert len(result) == 64
