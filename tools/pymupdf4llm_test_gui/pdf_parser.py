"""
pymupdf4llm을 사용한 PDF 파싱 스크립트
- Markdown 변환
- 페이지별 파싱
- 테이블 추출
- 이미지 추출
"""

import pymupdf4llm
import pymupdf
import json
import sys
import os


def parse_to_markdown(pdf_path: str) -> str:
    """PDF 전체를 마크다운으로 변환"""
    md_text = pymupdf4llm.to_markdown(pdf_path)
    return md_text


def parse_by_pages(pdf_path: str) -> list[dict]:
    """페이지별로 마크다운 변환 (메타데이터 포함)"""
    pages = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
    results = []
    for page in pages:
        results.append({
            "page": page.get("metadata", {}).get("page", ""),
            "text": page.get("text", ""),
            "metadata": page.get("metadata", {}),
        })
    return results


def extract_tables(pdf_path: str) -> list[dict]:
    """PDF에서 테이블 추출"""
    doc = pymupdf.open(pdf_path)
    tables = []
    for page_num, page in enumerate(doc):
        tab = page.find_tables()
        for i, table in enumerate(tab.tables):
            tables.append({
                "page": page_num + 1,
                "table_index": i,
                "data": table.extract(),
            })
    doc.close()
    return tables


def extract_images(pdf_path: str, output_dir: str = "images") -> list[dict]:
    """PDF에서 이미지 추출 후 저장"""
    os.makedirs(output_dir, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    images = []
    for page_num, page in enumerate(doc):
        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            base_image = doc.extract_image(xref)
            ext = base_image["ext"]
            filename = f"page{page_num + 1}_img{img_index + 1}.{ext}"
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "wb") as f:
                f.write(base_image["image"])
            images.append({
                "page": page_num + 1,
                "filename": filename,
                "size": len(base_image["image"]),
                "width": base_image.get("width"),
                "height": base_image.get("height"),
            })
    doc.close()
    return images


def parse_pdf(pdf_path: str, mode: str = "markdown"):
    """
    PDF 파싱 메인 함수

    Args:
        pdf_path: PDF 파일 경로
        mode: 파싱 모드
            - "markdown": 전체 마크다운 변환
            - "pages": 페이지별 파싱
            - "tables": 테이블 추출
            - "images": 이미지 추출
            - "all": 전체 (마크다운 + 테이블)
    """
    if not os.path.exists(pdf_path):
        print(f"파일을 찾을 수 없습니다: {pdf_path}")
        return None

    print(f"파싱 중: {pdf_path} (모드: {mode})")

    if mode == "markdown":
        result = parse_to_markdown(pdf_path)
        print(result)
        return result

    elif mode == "pages":
        pages = parse_by_pages(pdf_path)
        for p in pages:
            print(f"\n{'='*60}")
            print(f"📄 페이지 {p['page']}")
            print(f"{'='*60}")
            print(p["text"])
        return pages

    elif mode == "tables":
        tables = extract_tables(pdf_path)
        if not tables:
            print("테이블이 없습니다.")
        for t in tables:
            print(f"\n[페이지 {t['page']} - 테이블 {t['table_index'] + 1}]")
            for row in t["data"]:
                print(" | ".join(str(cell) for cell in row))
        return tables

    elif mode == "images":
        images = extract_images(pdf_path)
        if not images:
            print("이미지가 없습니다.")
        for img in images:
            print(f"  저장: {img['filename']} ({img['width']}x{img['height']}, {img['size']} bytes)")
        return images

    elif mode == "all":
        result = {
            "markdown": parse_to_markdown(pdf_path),
            "tables": extract_tables(pdf_path),
        }
        print(result["markdown"])
        if result["tables"]:
            print(f"\n테이블 {len(result['tables'])}개 발견")
        return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python pdf_parser.py <pdf파일경로> [모드]")
        print("모드: markdown(기본), pages, tables, images, all")
        sys.exit(1)

    pdf_file = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "markdown"
    parse_pdf(pdf_file, mode)
