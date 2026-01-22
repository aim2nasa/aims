"""
Upstage Document AI 연동 모듈
테이블 구조 인식이 가능한 Document Parse API 사용

정직한 파싱: OCR 결과를 그대로 신뢰하고 출력
"""
import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from html.parser import HTMLParser

import httpx


class TableHTMLParser(HTMLParser):
    """HTML 테이블 파싱을 위한 파서"""

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
            self.current_table = []
        elif tag == "tr" and self.in_row:
            self.in_row = False
            if self.current_row:
                self.current_table.append(self.current_row)
            self.current_row = []
        elif tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            self.current_row.append(self.current_cell.strip())

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell += data


class UpstageOCRExtractor:
    """Upstage Document AI를 사용한 테이블 데이터 추출기

    정직한 파싱 원칙:
    - OCR 엔진 결과를 그대로 신뢰
    - 패턴 기반 셀 분리/재정렬 없음
    - 헤더 기반 컬럼 매핑
    """

    # Document Parse API (테이블 인식 지원)
    API_URL = "https://api.upstage.ai/v1/document-ai/document-parse"

    # 기본 컬럼 (헤더가 없을 때 폴백)
    DEFAULT_COLUMNS = [
        "순번", "계약일", "계약자", "생년월일", "성별", "지역",
        "피보험자", "증권번호", "보험상품", "통화", "월납입보험료",
        "상태", "수금방법", "납입상태", "전자청약", "모집이양", "신탁"
    ]

    @staticmethod
    def _fix_mojibake(text: str) -> str:
        """이중 인코딩된 텍스트 복원"""
        if not text:
            return text
        try:
            return text.encode('latin-1').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            return text

    def __init__(self, api_key: Optional[str] = None, timeout: float = 120.0, debug: bool = False):
        self.api_key = api_key or os.environ.get("UPSTAGE_API_KEY")
        if not self.api_key:
            raise ValueError("UPSTAGE_API_KEY 환경변수 또는 api_key 파라미터 필요")
        self.timeout = timeout
        self.debug = debug

    def _call_document_parse_api(self, image_path: str) -> Dict[str, Any]:
        """Document Parse API 호출"""
        try:
            with open(image_path, "rb") as f:
                file_content = f.read()

            filename = Path(image_path).name

            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    self.API_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"document": (filename, file_content)},
                    data={"output_formats": '["html", "text"]'},
                )

                if response.status_code != 200:
                    error_detail = ""
                    try:
                        error_data = json.loads(response.content.decode("utf-8"))
                        error_detail = error_data.get("message", "")
                    except Exception:
                        error_detail = response.text[:200]
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"API 오류: HTTP {response.status_code} - {error_detail}",
                    }

                data = json.loads(response.content.decode("utf-8"))

                if self.debug:
                    debug_path = Path(image_path).with_suffix(".api_response.json")
                    with open(debug_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"[DEBUG] API 응답 저장: {debug_path}")

                return {
                    "error": False,
                    "status": 200,
                    "elements": data.get("elements", []),
                    "text": self._fix_mojibake(data.get("text", "")),
                    "html": self._fix_mojibake(data.get("html", "")),
                }

        except httpx.TimeoutException:
            return {"error": True, "status": 504, "message": "처리 시간 초과"}
        except Exception as e:
            return {"error": True, "status": 500, "message": f"처리 실패: {str(e)}"}

    def _is_header_row(self, row: List[str]) -> bool:
        """헤더 행인지 판단"""
        if not row:
            return False
        first_cell = str(row[0]).strip()
        # 첫 셀이 숫자가 아니면 헤더로 간주
        if not first_cell.isdigit():
            return True
        return False

    def _normalize_header(self, header: str) -> str:
        """헤더 정규화 (공백, 슬래시 등 처리)"""
        header = header.strip()
        # 모집/이양 → 모집이양
        header = header.replace("/", "")
        return header

    def _parse_cell_value(self, col_name: str, cell_text: str) -> Any:
        """셀 값 파싱 (타입 변환)"""
        cell_text = cell_text.strip() if cell_text else ""

        # "None" 문자열 처리
        if cell_text in ("None", "none", "null", "NULL"):
            cell_text = ""

        if col_name == "순번":
            try:
                return int(cell_text) if cell_text else None
            except ValueError:
                return None
        elif col_name == "월납입보험료":
            try:
                cleaned = re.sub(r"[,\s]", "", cell_text)
                return int(cleaned) if cleaned else 0
            except ValueError:
                return 0
        else:
            return cell_text if cell_text else None

    def _parse_html_tables(self, html: str) -> List[Dict[str, Any]]:
        """HTML에서 테이블 데이터 추출 (정직하게)"""
        if not html:
            return []

        parser = TableHTMLParser()
        try:
            parser.feed(html)
        except Exception as e:
            print(f"[ERROR] HTML 파싱 오류: {e}")
            return []

        rows = []
        for table in parser.tables:
            if not table:
                continue

            # 헤더 확인
            if self._is_header_row(table[0]):
                # 헤더가 있으면 헤더 사용
                headers = [self._normalize_header(self._fix_mojibake(h)) for h in table[0]]
                data_rows = table[1:]
            else:
                # 헤더가 없으면 기본 컬럼 사용
                headers = self.DEFAULT_COLUMNS
                data_rows = table

            # 데이터 행 파싱
            for row_cells in data_rows:
                row_cells = [self._fix_mojibake(cell) for cell in row_cells]

                # 첫 셀이 숫자(순번)가 아니면 스킵
                if not row_cells or not str(row_cells[0]).strip().isdigit():
                    continue

                # 헤더와 매핑 (정직하게 - 셀 개수만큼만)
                row = {}
                for i, cell in enumerate(row_cells):
                    if i < len(headers):
                        col_name = headers[i]
                        row[col_name] = self._parse_cell_value(col_name, cell)

                # 순번이 있어야 유효한 행
                if row.get("순번") is not None:
                    rows.append(row)

        return rows

    def _parse_table_elements(self, elements: List[Dict]) -> List[Dict[str, Any]]:
        """Document Parse 응답의 elements에서 테이블 파싱"""
        rows = []

        for element in elements:
            category = element.get("category", "")

            if category == "table":
                # 방법 1: content.html
                content = element.get("content", {})
                if isinstance(content, dict):
                    html_content = self._fix_mojibake(content.get("html", ""))
                    if html_content:
                        parsed = self._parse_html_tables(html_content)
                        if parsed:
                            rows.extend(parsed)
                            continue

                # 방법 2: html 속성
                html_attr = self._fix_mojibake(element.get("html", ""))
                if html_attr:
                    parsed = self._parse_html_tables(html_attr)
                    if parsed:
                        rows.extend(parsed)

        return rows

    def _parse_text_fallback(self, text: str) -> List[Dict[str, Any]]:
        """텍스트 기반 파싱 (폴백) - 정직하게"""
        rows = []
        lines = text.split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 숫자로 시작하는 줄만 처리
            if not re.match(r"^\d{1,4}\s", line):
                continue

            parts = line.split()
            if len(parts) < 5:
                continue

            # 헤더 줄 스킵
            if parts[0] in ("순번", "번호", "No", "NO"):
                continue

            # 기본 컬럼에 매핑 (정직하게 - 있는 만큼만)
            row = {}
            for i, cell in enumerate(parts):
                if i < len(self.DEFAULT_COLUMNS):
                    col_name = self.DEFAULT_COLUMNS[i]
                    row[col_name] = self._parse_cell_value(col_name, cell)

            if row.get("순번") is not None:
                rows.append(row)

        return rows

    def extract_from_image(self, image_path: str) -> Dict[str, Any]:
        """단일 이미지에서 테이블 데이터 추출"""
        api_result = self._call_document_parse_api(image_path)

        if api_result.get("error"):
            print(f"[ERROR] API 오류: {api_result.get('message')}")
            return {
                "error": api_result.get("message"),
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
            }

        elements = api_result.get("elements", [])
        html = api_result.get("html", "")
        text = api_result.get("text", "")

        # 방법 1: 테이블 요소에서 파싱
        rows = self._parse_table_elements(elements)

        # 방법 2: 전체 HTML에서 파싱
        if not rows and html:
            rows = self._parse_html_tables(html)

        # 방법 3: 텍스트 폴백
        if not rows and text:
            rows = self._parse_text_fallback(text)

        return {
            "source_image": image_path,
            "rows": rows,
            "page_info": {"visible_rows": len(rows)},
        }

    def extract_from_images(
        self,
        image_paths: List[str],
        progress_callback: Optional[callable] = None
    ) -> List[Dict[str, Any]]:
        """여러 이미지에서 테이블 데이터 추출"""
        results = []
        total = len(image_paths)

        for i, path in enumerate(image_paths):
            if progress_callback:
                progress_callback(i + 1, total)

            result = self.extract_from_image(path)
            results.append(result)

        return results
