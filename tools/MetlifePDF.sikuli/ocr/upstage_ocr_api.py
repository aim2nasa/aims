# -*- coding: utf-8 -*-
"""
Upstage Enhanced OCR API 호출 스크립트
SikuliX에서 subprocess로 호출하여 사용

Usage:
    python upstage_ocr_api.py <image_path> <output_json_path>
"""
import os
import sys
import json
import time
import re
from pathlib import Path

sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import httpx

# Document Digitization API (Enhanced 모드 지원)
API_URL = "https://api.upstage.ai/v1/document-digitization"
API_KEY = os.environ.get("UPSTAGE_API_KEY")


def call_upstage_enhanced(image_path: str) -> dict:
    """Upstage Document Digitization API 호출 (Enhanced 모드)"""
    with open(image_path, "rb") as f:
        file_content = f.read()

    filename = Path(image_path).name

    start = time.time()

    with httpx.Client(timeout=180.0) as client:
        response = client.post(
            API_URL,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"document": (filename, file_content)},
            data={
                "model": "document-parse-nightly",
                "mode": "enhanced",
                "output_formats": '["html", "text"]',
            },
        )

    elapsed = time.time() - start

    if response.status_code != 200:
        print(f"  [OCR] ERROR: HTTP {response.status_code}")
        return {"error": True}

    return response.json()


def parse_html_table(html: str) -> list:
    """HTML에서 테이블 파싱"""
    from html.parser import HTMLParser

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.tables = []
            self.current_table = []
            self.current_row = []
            self.current_cell = ""
            self.in_table = False
            self.in_row = False
            self.in_cell = False

        def handle_starttag(self, tag, attrs):
            if tag == "table":
                self.in_table = True
                self.current_table = []
            elif tag == "tr" and self.in_table:
                self.in_row = True
                self.current_row = []
            elif tag in ("td", "th") and self.in_row:
                self.in_cell = True
                self.current_cell = ""

        def handle_endtag(self, tag):
            if tag == "table" and self.in_table:
                self.in_table = False
                if self.current_table:
                    self.tables.append(self.current_table)
            elif tag == "tr" and self.in_row:
                self.in_row = False
                if self.current_row:
                    self.current_table.append(self.current_row)
            elif tag in ("td", "th") and self.in_cell:
                self.in_cell = False
                self.current_row.append(self.current_cell.strip())

        def handle_data(self, data):
            if self.in_cell:
                self.current_cell += data

    parser = TableParser()
    parser.feed(html)
    return parser.tables


def extract_customer_data(ocr_result: dict, max_rows: int = 15) -> list:
    """OCR 결과에서 고객 데이터 추출 (기본 15행)"""
    all_tables = []

    # 1. content.html에서 테이블 추출
    html = ocr_result.get("content", {}).get("html", "") or ocr_result.get("html", "")
    if html:
        tables = parse_html_table(html)
        all_tables.extend(tables)

    # 2. elements에서 테이블 추출 (더 정확한 테이블이 여기 있을 수 있음)
    for element in ocr_result.get("elements", []):
        if element.get("category") == "table":
            content = element.get("content", {})
            if isinstance(content, dict):
                element_html = content.get("html", "")
                if element_html:
                    tables = parse_html_table(element_html)
                    all_tables.extend(tables)

    if not all_tables:
        return []

    # 고객 데이터 테이블 선택
    main_table = None

    # 1. "고객명" 헤더가 있고 실제 데이터(생년월일 패턴)가 있는 테이블 찾기
    date_pattern = re.compile(r'\d{4}-\d{2}-\d{2}')

    for table in all_tables:
        has_header = False
        has_data = False
        for row in table:
            row_str = " ".join(str(cell) for cell in row)
            if "고객명" in row_str:
                has_header = True
            if date_pattern.search(row_str):
                has_data = True
            if has_header and has_data:
                main_table = table
                break
        if main_table:
            break

    # 2. 없으면 "고객명" 헤더만 있는 테이블 (데이터가 적은 경우)
    if not main_table:
        for table in all_tables:
            for row in table:
                if any("고객명" in str(cell) for cell in row):
                    # 필터 영역 텍스트 제외 (너무 긴 셀은 필터 영역)
                    first_cell = str(row[0]) if row else ""
                    if len(first_cell) < 50:  # 필터 영역은 보통 매우 긴 텍스트
                        main_table = table
                        break
            if main_table:
                break

    # 3. 그래도 없으면 가장 큰 테이블 선택
    if not main_table:
        main_table = max(all_tables, key=lambda t: len(t))

    # 헤더 정규화 매핑
    HEADER_NORMALIZE = {
        "고객명 ↓": "고객명",
        "고객명↓": "고객명",
        "고객명 →": "고객명",
        "고객명→": "고객명",
        "고객명": "고객명",
        "구분": "구분",
        "생년월일": "생년월일",
        "보험나이": "보험나이",
        "성별": "성별",
        "이메일": "이메일",
        "휴대폰": "휴대폰",
        "가입설계만료일": "가입설계만료일",
    }

    rows = []
    headers = None
    first_row_data = None  # 헤더+데이터 합쳐진 경우 첫 고객

    for row in main_table:
        # 헤더 행 찾기 (고객명 포함하는 셀이 있으면)
        if any("고객명" in str(cell) for cell in row):
            # 헤더+데이터 합쳐진 형식 감지: "고객명 ↓ 김태형" (↓ 기호가 있으면)
            first_cell = str(row[0]) if row else ""
            if "↓" in first_cell or ("고객명" in first_cell and " " in first_cell and len(first_cell) > 5):
                # 합쳐진 형식 - 헤더와 데이터 분리
                headers = []
                first_row_data = {}
                for cell in row:
                    cell_str = str(cell).strip() if cell else ""
                    # "고객명 ↓ 김태형" → 헤더: "고객명", 데이터: "김태형"
                    # "구분 계약" → 헤더: "구분", 데이터: "계약"
                    # "생년월일 1991-02-10" → 헤더: "생년월일", 데이터: "1991-02-10"

                    # ↓ 기호로 분리 시도
                    if "↓" in cell_str:
                        parts = cell_str.split("↓", 1)
                        header_part = parts[0].strip()
                        data_part = parts[1].strip() if len(parts) >= 2 else ""
                    else:
                        # 공백으로 분리
                        parts = cell_str.split(" ", 1)
                        if len(parts) >= 2:
                            header_part = parts[0].strip()
                            data_part = parts[1].strip()
                        else:
                            header_part = cell_str
                            data_part = ""

                    normalized_header = HEADER_NORMALIZE.get(header_part, header_part)
                    headers.append(normalized_header)
                    first_row_data[normalized_header] = data_part
            else:
                # 일반 헤더 행
                headers = [HEADER_NORMALIZE.get(cell.strip(), cell.strip()) for cell in row]
            continue

        # 데이터 행
        if headers and len(row) >= 2:
            row_data = {}
            for i, cell in enumerate(row):
                if i < len(headers):
                    col_name = headers[i]
                    row_data[col_name] = cell.strip() if cell else ""

            if row_data.get("고객명"):
                rows.append(row_data)

    # 헤더+데이터 합쳐진 첫 행이 있으면 맨 앞에 추가
    if first_row_data and first_row_data.get("고객명"):
        rows.insert(0, first_row_data)

    # 최대 행수 제한 (마지막 행은 잘릴 수 있으므로)
    return rows[:max_rows]


def main():
    if not API_KEY:
        print("  [OCR] ERROR: UPSTAGE_API_KEY 환경변수 필요")
        sys.exit(1)

    if len(sys.argv) < 3:
        sys.exit(1)

    image_path = sys.argv[1]
    output_json_path = sys.argv[2]

    if not os.path.exists(image_path):
        print("  [OCR] ERROR: 이미지 없음")
        sys.exit(1)

    # OCR 호출 (로그 출력 없음 - 메인 스크립트에서 출력)
    ocr_result = call_upstage_enhanced(image_path)

    if ocr_result.get("error"):
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False)
        sys.exit(1)

    # 고객 데이터 추출 (15행)
    customers = extract_customer_data(ocr_result, max_rows=16)

    # 결과 저장
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(customers, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
