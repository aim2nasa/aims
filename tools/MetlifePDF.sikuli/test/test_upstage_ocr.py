# -*- coding: utf-8 -*-
"""
Upstage Document Parse OCR 테스트 - 고객목록
테이블 구조 인식 가능한 Document Parse API 사용
"""
import os
import sys
import json
import time
from pathlib import Path

sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import httpx

API_URL = "https://api.upstage.ai/v1/document-ai/document-parse"
API_KEY = os.environ.get("UPSTAGE_API_KEY")

if not API_KEY:
    print("[ERROR] 환경변수 필요: UPSTAGE_API_KEY")
    sys.exit(1)


def call_upstage_ocr(image_path: str) -> dict:
    """Upstage Document Parse API 호출"""
    with open(image_path, "rb") as f:
        file_content = f.read()

    filename = Path(image_path).name

    print(f"[INFO] Upstage Document Parse API 호출 중...")
    start = time.time()

    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            API_URL,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"document": (filename, file_content)},
            data={"output_formats": '["html", "text"]'},
        )

    elapsed = time.time() - start
    print(f"[INFO] 응답 시간: {elapsed:.2f}초")

    if response.status_code != 200:
        print(f"[ERROR] HTTP {response.status_code}")
        print(response.text[:500])
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


def extract_customer_data(ocr_result: dict) -> list:
    """OCR 결과에서 고객 데이터 추출"""
    html = ocr_result.get("content", {}).get("html", "") or ocr_result.get("html", "")

    if not html:
        # elements에서 테이블 찾기
        for element in ocr_result.get("elements", []):
            if element.get("category") == "table":
                content = element.get("content", {})
                if isinstance(content, dict):
                    html = content.get("html", "")
                    if html:
                        break

    if not html:
        print("[WARN] HTML 테이블 없음")
        return []

    tables = parse_html_table(html)
    if not tables:
        print("[WARN] 파싱된 테이블 없음")
        return []

    # 가장 큰 테이블 선택
    main_table = max(tables, key=lambda t: len(t))

    # 헤더 정규화 매핑
    HEADER_NORMALIZE = {
        "고객명 ↓": "고객명",
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

    for row in main_table:
        # 헤더 행 찾기 (고객명 포함하는 셀이 있으면)
        if any("고객명" in str(cell) for cell in row):
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

    return rows


def main():
    print("=" * 50)
    print("Upstage Document Parse 테스트 - 고객목록")
    print("=" * 50)

    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        image_path = r"D:\captures\customerList.png"

    if not os.path.exists(image_path):
        print(f"[ERROR] 이미지 없음: {image_path}")
        sys.exit(1)

    print(f"\n이미지: {image_path}")

    ocr_result = call_upstage_ocr(image_path)

    if ocr_result.get("error"):
        print("[ERROR] OCR 실패")
        return

    # 디버깅용 응답 저장
    with open("upstage_response.json", "w", encoding="utf-8") as f:
        json.dump(ocr_result, f, ensure_ascii=False, indent=2)
    print("[INFO] 원본 응답 저장: upstage_response.json")

    # 고객 데이터 추출
    rows = extract_customer_data(ocr_result)

    print(f"\n[Upstage OCR 결과] {len(rows)}행 추출")

    # 테이블 출력
    print()
    print("| No | 고객명 | 구분 | 생년월일 | 나이 | 성별 | 이메일 | 휴대폰 | 가입설계만료일 |")
    print("|---:|:-------|:-----|:---------|-----:|:-----|:-------|:-------|:---------------|")

    for i, row in enumerate(rows[:15]):
        print(f"| {i+1} | {row.get('고객명', '')} | {row.get('구분', '')} | {row.get('생년월일', '')} | {row.get('보험나이', '')} | {row.get('성별', '')} | {row.get('이메일', '')} | {row.get('휴대폰', '')} | {row.get('가입설계만료일', '')} |")

    print(f"\n총 {len(rows)}행")


if __name__ == "__main__":
    main()
