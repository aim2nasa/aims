"""
pdfplumber 테이블 추출 테스트
텍스트 추출 vs 테이블 추출 비교
"""
import pdfplumber
import json
import sys

# 테스트 PDF 경로
PDF_PATH = r"D:\MetlifeReport\AnnualReport\신상철보유계약현황2025081.pdf"

def test_text_extraction(pdf_path: str, page_num: int = 1):
    """기존 방식: 텍스트 추출 (구조 손실)"""
    print("=" * 60)
    print("[ 텍스트 추출 (기존 방식) ]")
    print("=" * 60)

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]
        text = page.extract_text()
        print(text)
        print()


def test_table_extraction(pdf_path: str, page_num: int = 1):
    """새 방식: 테이블 추출 (구조 보존)"""
    print("=" * 60)
    print("[ 테이블 추출 (새 방식 - 구조 보존) ]")
    print("=" * 60)

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]

        # 테이블 추출 설정
        tables = page.extract_tables({
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
            "intersection_tolerance": 10,
        })

        if not tables:
            print("❌ 테이블을 찾지 못했습니다. 다른 전략 시도...")
            tables = page.extract_tables({
                "vertical_strategy": "text",
                "horizontal_strategy": "text",
            })

        print(f"발견된 테이블 수: {len(tables)}")
        print()

        for idx, table in enumerate(tables):
            print(f"--- 테이블 {idx + 1} ---")
            for row_num, row in enumerate(table):
                print(f"  Row {row_num}: {row}")
            print()

        return tables


def test_table_with_bounding_boxes(pdf_path: str, page_num: int = 1):
    """바운딩 박스로 테이블 영역 확인"""
    print("=" * 60)
    print("[ 테이블 바운딩 박스 분석 ]")
    print("=" * 60)

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]

        # 페이지에서 감지된 테이블 객체들
        tables = page.find_tables()

        print(f"감지된 테이블 수: {len(tables)}")

        for idx, table in enumerate(tables):
            print(f"\n테이블 {idx + 1}:")
            print(f"  위치: {table.bbox}")

            # 테이블 데이터 추출
            data = table.extract()
            print(f"  행 수: {len(data)}")
            for row_num, row in enumerate(data[:5]):  # 처음 5행만
                print(f"    Row {row_num}: {row}")
            if len(data) > 5:
                print(f"    ... ({len(data) - 5}행 더 있음)")


def test_extract_words_with_positions(pdf_path: str, page_num: int = 1):
    """단어별 위치 정보 추출 (열 경계 복원용)"""
    print("=" * 60)
    print("[ 단어별 위치 정보 (열 경계 복원) ]")
    print("=" * 60)

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]
        words = page.extract_words()

        print(f"총 단어 수: {len(words)}")
        print("\n처음 20개 단어:")
        for word in words[:20]:
            print(f"  x0={word['x0']:.1f}, x1={word['x1']:.1f}, "
                  f"top={word['top']:.1f}, text='{word['text']}'")


if __name__ == "__main__":
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else PDF_PATH
    page_num = int(sys.argv[2]) if len(sys.argv) > 2 else 1  # 0-indexed

    print(f"\nPDF: {pdf_path}")
    print(f"페이지: {page_num + 1} (0-indexed: {page_num})")
    print()

    # 1. 기존 텍스트 추출 (문제점 확인)
    test_text_extraction(pdf_path, page_num)

    # 2. 테이블 추출 (새 방식)
    test_table_extraction(pdf_path, page_num)

    # 3. 바운딩 박스 분석
    test_table_with_bounding_boxes(pdf_path, page_num)

    # 4. 단어별 위치 정보
    test_extract_words_with_positions(pdf_path, page_num)
