from PyPDF2 import PdfReader

def get_pdf_page_count(file_path: str) -> int:
    """PDF 페이지 수 반환, 실패 시 0"""
    try:
        reader = PdfReader(file_path)
        return len(reader.pages)
    except Exception:
        return 0

