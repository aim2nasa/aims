import pathlib
import mimetypes
from datetime import datetime

def get_file_metadata(file_path):
    path = pathlib.Path(file_path)
    if not path.exists() or not path.is_file():
        return {
            "filename": path.name,
            "type": "unknown",
            "reason": "file not found"
        }

    mime_type, _ = mimetypes.guess_type(path)
    stat = path.stat()

    return {
        "filename": path.name,
        "mime": mime_type or "application/octet-stream",
        "type": detect_type(mime_type),
        "extension": path.suffix,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
    }

def detect_type(mime):
    if mime is None:
        return "unknown"
    if mime.startswith("image/"):
        return "image"
    if mime == "application/pdf":
        return "pdf"
    if mime.startswith("text/"):
        return "text"
    return "unknown"

