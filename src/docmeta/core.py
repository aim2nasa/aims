import pathlib
from datetime import datetime
from src.shared.mime_utils import get_mime_type

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
            "status": "not_found"
        }

    mime_type = get_mime_type(str(path))
    stat = path.stat()

    return {
        "filename": path.name,
        "mime": mime_type,
        "extension": path.suffix,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "status": "ok"
    }

