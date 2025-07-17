import exifread

def extract_exif(file_path: str) -> dict:
    """이미지 파일에서 EXIF 메타데이터 추출"""
    try:
        with open(file_path, "rb") as f:
            tags = exifread.process_file(f, details=False)
        return {tag: str(value) for tag, value in tags.items()}
    except Exception:
        return {}

