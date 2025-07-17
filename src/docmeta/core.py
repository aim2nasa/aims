import pathlib
from datetime import datetime
from src.shared.mime_utils import get_mime_type
from src.shared.exif_utils import extract_exif
from src.shared.pdf_utils import get_pdf_page_count

def get_file_metadata(file_path: str):
    path = pathlib.Path(file_path)

    if not path.exists() or not path.is_file():
        return {
            "filename": path.name,
            "mime": None,
            "extension": path.suffix,
            "size_bytes": 0,
            "created_at": None,
            "reason": "file not found",
            "status": "not_found",
            "exif": {},
            "pdf_pages": None
        }

    mime_type = get_mime_type(str(path))
    stat = path.stat()

    meta = {
        "filename": path.name,
        "mime": mime_type,
        "extension": path.suffix,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "status": "ok",
        "exif": {},
        "pdf_pages": None
    }

    # PDF면 페이지 수 추출
    if mime_type == "application/pdf":
        meta["pdf_pages"] = get_pdf_page_count(str(path))

    # 이미지인 경우에만 EXIF 추출
    if mime_type and mime_type.startswith("image/"):
        meta["exif"] = extract_exif(str(path))

    return meta

