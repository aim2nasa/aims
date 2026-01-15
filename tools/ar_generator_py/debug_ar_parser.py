#!/usr/bin/env python3
"""
AR Generator PDF Parser 디버그 - 테이블 구조 확인
"""

import os
import sys
import fitz  # PyMuPDF

def debug_pdf_table(pdf_path: str):
    """PDF 테이블 구조 출력"""
    doc = fitz.open(pdf_path)

    print(f"\n{'='*80}")
    print(f"파일: {os.path.basename(pdf_path)}")
    print(f"총 페이지: {len(doc)}")
    print(f"{'='*80}")

    for page_num in range(len(doc)):
        page = doc[page_num]
        print(f"\n--- 페이지 {page_num + 1} ---")

        # 테이블 추출
        tables = page.find_tables()
        if tables and len(tables.tables) > 0:
            for t_idx, table in enumerate(tables.tables):
                data = table.extract()
                print(f"\n[테이블 {t_idx + 1}] ({len(data)} 행)")

                for row_idx, row in enumerate(data):
                    # 계약 테이블만 전체 출력 (순번, 증권번호 포함된 테이블)
                    row_text = ' '.join([str(cell) if cell else '' for cell in row])
                    if '증권번호' in row_text or (len(row) >= 10 and row[1] and str(row[1]).strip().isdigit() and len(str(row[1]).strip()) == 10):
                        cells = []
                        for cell in row:
                            cell_str = str(cell).replace('\n', ' ') if cell else '-'
                            cells.append(cell_str[:25])
                        print(f"  Row {row_idx}: {cells}")
                    elif row_idx < 3:
                        cells = [str(cell)[:20] if cell else '-' for cell in row]
                        print(f"  Row {row_idx}: {cells}")
        else:
            print("  테이블 없음")

    doc.close()

if __name__ == '__main__':
    base_path = os.path.dirname(os.path.abspath(__file__))
    annual_report_path = os.path.join(os.path.dirname(base_path), 'annual_report')

    files = [
        '안영미annual report202508_p2p3.pdf',
        '정부균보유계약현황202508_p2p3.pdf',
        '김보성보유계약현황202508_p2p3.pdf',
    ]

    for filename in files:
        pdf_path = os.path.join(annual_report_path, filename)
        if os.path.exists(pdf_path):
            debug_pdf_table(pdf_path)
        else:
            print(f"파일 없음: {pdf_path}")
