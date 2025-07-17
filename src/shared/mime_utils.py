import os
import shutil
import tempfile
import uuid
import magic

# 확장자 기반 후처리 매핑
EXTENSION_MIME_MAP = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".hwp": "application/x-hwp",
}

def get_mime_type(file_path: str) -> str:
    """
    libmagic 기반 MIME 탐지 + 확장자 후처리 매핑.
    한글 경로 문제 해결을 위해 임시 복사 후 분석.
    """
    if not os.path.exists(file_path):
        return None

    original_ext = os.path.splitext(file_path)[1].lower()

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_filename = str(uuid.uuid4()) + original_ext
            temp_path = os.path.join(tmpdir, temp_filename)
            shutil.copy2(file_path, temp_path)

            # libmagic으로 MIME 분석
            mime_type = magic.from_file(temp_path, mime=True)

            # 확장자 기반 후처리
            if original_ext in EXTENSION_MIME_MAP:
                mime_type = EXTENSION_MIME_MAP[original_ext]

            return mime_type or "application/octet-stream"

    except Exception:
        return "application/octet-stream"


def detect_logical_type(mime: str) -> str:
    """MIME → 논리적 타입(image/pdf/text/unknown) 매핑"""
    if mime is None:
        return "unknown"
    if mime.startswith("image/"):
        return "image"
    if mime == "application/pdf":
        return "pdf"
    if mime.startswith("text/"):
        return "text"
    return "unknown"

