#!/usr/bin/env python3
"""
PDF Metadata Fix Proxy Service
@since 2025-12-09

PDF 파일을 서빙할 때 실시간으로 메타데이터 인코딩을 수정하는 프록시 서비스.

문제:
- "Microsoft: Print To PDF"로 생성된 PDF의 메타데이터가 깨져서 브라우저에서 보임

해결:
- PDF 요청 시 메타데이터를 수정하여 반환
- 원본 파일은 수정하지 않음 (실시간 처리)
"""

import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF

from version import VERSION_INFO, log_version_info
from system_logger import send_error_log

# 시작 시 버전 정보 출력
log_version_info()

app = FastAPI(
    title="PDF Metadata Fix Proxy",
    description="Fixes PDF metadata encoding on-the-fly",
    version=VERSION_INFO["version"]
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 파일 저장소 기본 경로
BASE_PATH = "/data/files"


def is_likely_garbled(text: str) -> bool:
    """
    텍스트가 인코딩 문제로 깨졌는지 판단
    """
    if not text:
        return False

    high_byte_chars = sum(1 for c in text if 0x80 <= ord(c) <= 0xFF)
    has_korean = any('\uAC00' <= c <= '\uD7AF' for c in text)
    high_ratio = high_byte_chars / len(text) if text else 0

    return high_ratio > 0.3 and not has_korean


def fix_pdf_metadata_in_memory(pdf_bytes: bytes, replacement_title: Optional[str] = None) -> tuple[bytes, bool, str]:
    """
    메모리에서 PDF 메타데이터 수정
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        send_error_log("pdf_proxy", f"PDF open failed: {e}", e, {"title": replacement_title})
        return pdf_bytes, False, f"PDF open failed: {e}"

    metadata = doc.metadata
    modified = False
    changes = []

    fields_to_check = ['title', 'author', 'subject', 'keywords', 'creator', 'producer']

    # 파일명에서 확장자 제거 (제목으로 사용)
    title_from_filename = None
    if replacement_title:
        title_from_filename = os.path.splitext(replacement_title)[0]

    new_metadata = {}
    for field in fields_to_check:
        value = metadata.get(field, '')
        if value and is_likely_garbled(value):
            # title 필드는 파일명으로 대체
            if field == 'title' and title_from_filename:
                new_metadata[field] = title_from_filename
                changes.append(f"title: replaced with '{title_from_filename}'")
                modified = True
            else:
                # 복원 불가 - 빈 값으로 설정
                new_metadata[field] = ''
                changes.append(f"{field}: cleared")
                modified = True
        else:
            new_metadata[field] = value

    if not modified:
        doc.close()
        return pdf_bytes, False, "No fix needed"

    try:
        doc.set_metadata(new_metadata)
        result_bytes = doc.tobytes(garbage=0, deflate=False)
        doc.close()
        return result_bytes, True, f"Fixed: {', '.join(changes)}"
    except Exception as e:
        doc.close()
        send_error_log("pdf_proxy", f"PDF save failed: {e}", e, {"title": replacement_title})
        return pdf_bytes, False, f"Save failed: {e}"


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "service": "pdf-proxy",
        "version": VERSION_INFO["fullVersion"],
        "versionInfo": VERSION_INFO
    }


@app.get("/pdf/{file_path:path}")
async def serve_pdf(
    file_path: str,
    title: Optional[str] = Query(None, description="대체 제목 (원본 파일명)")
):
    """
    PDF 파일을 메타데이터 수정 후 서빙

    Args:
        file_path: /data/files 기준 상대 경로
        title: PDF 제목으로 사용할 원본 파일명 (쿼리 파라미터)
    """
    # 전체 경로 구성
    full_path = Path(BASE_PATH) / file_path

    # 보안: 경로 탈출 방지
    try:
        full_path = full_path.resolve()
        if not str(full_path).startswith(BASE_PATH):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    # 파일 존재 확인
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # PDF 파일인지 확인
    if not str(full_path).lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Not a PDF file")

    # 파일 읽기
    try:
        pdf_bytes = full_path.read_bytes()
    except Exception as e:
        send_error_log("pdf_proxy", f"파일 읽기 실패: {e}", e, {"path": str(full_path)})
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    # 제목이 없으면 파일명 사용
    if not title:
        title = full_path.name

    # 메타데이터 수정
    fixed_bytes, was_fixed, message = fix_pdf_metadata_in_memory(pdf_bytes, title)

    # 응답 헤더 (HTTP 헤더는 ASCII만 허용)
    from urllib.parse import quote
    headers = {
        "Content-Type": "application/pdf",
        "X-PDF-Fixed": str(was_fixed).lower(),
        "X-PDF-Fix-Message": quote(message),  # URL 인코딩으로 ASCII 변환
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
    }

    # Content-Disposition 설정 (inline으로 브라우저에서 표시)
    # 한글 파일명은 RFC 5987 방식으로만 설정 (latin-1 헤더 문제 방지)
    if title:
        from urllib.parse import quote
        # ASCII로 변환 가능한 부분만 기본 filename으로 사용
        ascii_safe_name = ''.join(c if ord(c) < 128 else '_' for c in title)
        encoded_name = quote(title)
        headers["Content-Disposition"] = f"inline; filename=\"{ascii_safe_name}\"; filename*=UTF-8''{encoded_name}"

    return Response(content=fixed_bytes, headers=headers)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
