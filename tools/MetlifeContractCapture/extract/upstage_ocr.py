"""
Upstage Document AI 연동 모듈
테이블 구조 인식이 가능한 Document Parse API 사용
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
    """Upstage Document AI를 사용한 테이블 데이터 추출기"""

    # Document Parse API (테이블 인식 지원)
    API_URL = "https://api.upstage.ai/v1/document-ai/document-parse"

    # 테이블 컬럼 순서
    COLUMNS = [
        "순번", "계약일", "계약자", "생년월일", "성별", "지역",
        "피보험자", "증권번호", "보험상품", "통화", "월납입보험료",
        "상태", "수금방법", "납입상태", "전자청약", "모집이양", "신탁"
    ]

    @staticmethod
    def _fix_mojibake(text: str) -> str:
        """
        이중 인코딩된 텍스트 복원 (UTF-8 → Latin-1 → UTF-8 문제 해결)

        Upstage API가 UTF-8 텍스트를 Latin-1로 잘못 해석 후 다시 UTF-8로
        인코딩하는 버그가 있음. 이를 역으로 복원.

        Args:
            text: mojibake된 텍스트

        Returns:
            복원된 UTF-8 텍스트
        """
        if not text:
            return text

        try:
            # 이중 인코딩 복원: mojibake 텍스트를 Latin-1로 인코딩 후 UTF-8로 디코딩
            return text.encode('latin-1').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            # 복원 실패 시 원본 반환
            return text

    def __init__(self, api_key: Optional[str] = None, timeout: float = 120.0, debug: bool = False):
        """
        Args:
            api_key: Upstage API 키 (없으면 환경변수에서 읽음)
            timeout: API 타임아웃 (초)
            debug: 디버그 모드 (API 응답을 파일로 저장)
        """
        self.api_key = api_key or os.environ.get("UPSTAGE_API_KEY")
        if not self.api_key:
            raise ValueError("UPSTAGE_API_KEY 환경변수 또는 api_key 파라미터 필요")

        self.timeout = timeout
        self.debug = debug

    def _call_document_parse_api(self, image_path: str) -> Dict[str, Any]:
        """
        Upstage Document Parse API 호출

        Args:
            image_path: 이미지 파일 경로

        Returns:
            API 응답 또는 에러 정보
        """
        try:
            with open(image_path, "rb") as f:
                file_content = f.read()

            filename = Path(image_path).name

            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    self.API_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}"
                    },
                    files={
                        "document": (filename, file_content)
                    },
                    data={
                        "output_formats": '["html", "text"]',  # HTML과 텍스트 둘 다 요청
                    }
                )

                if response.status_code != 200:
                    error_detail = ""
                    try:
                        # 에러 응답도 UTF-8로 명시적 디코딩
                        error_data = json.loads(response.content.decode("utf-8"))
                        error_detail = error_data.get("message", "")
                    except Exception:
                        error_detail = response.text[:200]
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"Document Parse API 오류: HTTP {response.status_code} - {error_detail}",
                        "elements": [],
                    }

                # 명시적으로 UTF-8 디코딩 (httpx가 인코딩 잘못 감지하는 경우 방지)
                data = json.loads(response.content.decode("utf-8"))

                # 디버그 모드: API 응답을 파일로 저장
                if self.debug:
                    debug_path = Path(image_path).with_suffix(".api_response.json")
                    with open(debug_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"[DEBUG] API 응답 저장: {debug_path}")

                # mojibake 수정 적용 (Upstage API의 이중 인코딩 버그 대응)
                raw_text = data.get("text", "")
                raw_html = data.get("html", "")

                return {
                    "error": False,
                    "status": 200,
                    "elements": data.get("elements", []),
                    "text": self._fix_mojibake(raw_text),
                    "html": self._fix_mojibake(raw_html),
                }

        except httpx.TimeoutException:
            return {
                "error": True,
                "status": 504,
                "message": "Document Parse 처리 시간 초과",
                "elements": [],
            }
        except Exception as e:
            return {
                "error": True,
                "status": 500,
                "message": f"Document Parse 처리 실패: {str(e)}",
                "elements": [],
            }

    def _is_header_row(self, row: List[str]) -> bool:
        """
        헤더 행인지 판단

        Args:
            row: 셀 리스트

        Returns:
            헤더 여부
        """
        if not row:
            return False

        first_cell = str(row[0]).strip()

        # 명시적 헤더 키워드
        if first_cell in ("순번", "번호", "No", "NO", "no"):
            return True

        # 첫 셀이 숫자가 아니면 헤더로 간주
        if not first_cell.isdigit():
            return True

        return False

    def _parse_html_tables(self, html: str) -> List[Dict[str, Any]]:
        """
        HTML에서 테이블 데이터 추출

        Args:
            html: HTML 문자열

        Returns:
            파싱된 행 목록
        """
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

            # 첫 번째 행이 헤더인지 확인
            start_idx = 1 if self._is_header_row(table[0]) else 0

            for row_cells in table[start_idx:]:
                # mojibake 수정 적용
                row_cells = [self._fix_mojibake(cell) for cell in row_cells]

                # 첫 셀이 숫자(순번)가 아니면 스킵
                if not row_cells or not str(row_cells[0]).strip().isdigit():
                    continue

                expanded = self._expand_merged_cells(row_cells)
                aligned = self._realign_columns(expanded)
                row = self._parse_row_cells(aligned)
                if row:
                    rows.append(row)

        return rows

    def _parse_row_cells(self, cells: List[str]) -> Optional[Dict[str, Any]]:
        """
        셀 리스트를 컬럼에 매핑

        Args:
            cells: 셀 텍스트 리스트

        Returns:
            매핑된 행 데이터
        """
        if not cells or len(cells) < 5:
            return None

        row = {}
        for i, col_name in enumerate(self.COLUMNS):
            if i >= len(cells):
                row[col_name] = None
                continue

            cell_text = cells[i].strip() if cells[i] else ""

            if col_name == "순번":
                try:
                    row[col_name] = int(cell_text) if cell_text else None
                except ValueError:
                    row[col_name] = None
            elif col_name == "월납입보험료":
                try:
                    cleaned = re.sub(r"[,\s]", "", cell_text)
                    row[col_name] = int(cleaned) if cleaned else 0
                except ValueError:
                    row[col_name] = 0
            else:
                row[col_name] = cell_text if cell_text else None

        # 순번이 없으면 유효하지 않은 행
        if row.get("순번") is None:
            return None

        return row

    def _parse_table_elements(self, elements: List[Dict]) -> List[Dict[str, Any]]:
        """
        Document Parse 응답에서 테이블 요소 파싱

        Args:
            elements: Document Parse API 응답의 elements

        Returns:
            파싱된 행 목록
        """
        rows = []

        for element in elements:
            category = element.get("category", "")

            # 테이블 요소 처리
            if category == "table":
                # 방법 1: data.rows 구조
                table_data = element.get("data", {})
                table_rows = table_data.get("rows", [])

                if table_rows:
                    for row_data in table_rows:
                        row = self._parse_table_row_data(row_data)
                        if row:
                            rows.append(row)
                    continue

                # 방법 2: table.cells 구조 (Upstage 특유)
                table_info = element.get("table", {})
                cells = table_info.get("cells", [])
                if cells:
                    parsed = self._parse_table_cells_structure(cells)
                    rows.extend(parsed)
                    continue

                # 방법 3: content.html에서 테이블 파싱
                content = element.get("content", {})
                if isinstance(content, dict):
                    html_content = content.get("html", "")
                    if html_content:
                        # mojibake 수정 적용
                        html_content = self._fix_mojibake(html_content)
                        parsed = self._parse_html_tables(html_content)
                        if parsed:
                            rows.extend(parsed)
                            continue

                # 방법 4: html 속성에 직접 있는 경우
                html_attr = element.get("html", "")
                if html_attr:
                    # mojibake 수정 적용
                    html_attr = self._fix_mojibake(html_attr)
                    parsed = self._parse_html_tables(html_attr)
                    if parsed:
                        rows.extend(parsed)

            # 테이블 셀 요소 (개별 셀로 오는 경우)
            elif category == "table_cell":
                # 셀 단위로 오는 경우 - 나중에 행으로 그룹화 필요
                pass

        return rows

    def _expand_merged_cells(self, cells: List[str]) -> List[str]:
        """
        병합된 셀을 분리/병합하여 17개 컬럼에 맞춤

        MetLife 테이블은 17개 컬럼이지만 Upstage가 일관성 없이 인식.
        패턴 기반으로 분리/병합 처리.

        Args:
            cells: 원본 셀 리스트

        Returns:
            처리된 셀 리스트 (17개)
        """
        result = []
        i = 0

        while i < len(cells):
            cell_text = str(cells[i]).strip() if cells[i] else ""

            # 패턴 1: 성별 + 지역 병합 ("남 서울", "여 경기 고양시")
            # 성별을 분리하고, 다음 셀이 구/시 이름이면 지역과 병합
            gender_match = re.match(r"^(남|여)\s+(.+)$", cell_text)
            if gender_match:
                result.append(gender_match.group(1))  # 성별

                # 지역 처리: 다음 셀이 구/시/군 이름인지 확인
                partial_region = gender_match.group(2)
                next_cell = str(cells[i + 1]).strip() if i + 1 < len(cells) else ""

                # 다음 셀이 "구/시/군 + 사람이름" 패턴인지 확인 ("동대문 위옥순", "송파구 김철수")
                region_name_match = re.match(r"^([가-힣]+[구시군동])\s+([가-힣]{2,4})$", next_cell)
                if region_name_match:
                    # 지역은 합치고, 피보험자는 분리
                    result.append(f"{partial_region} {region_name_match.group(1)}")  # 지역
                    result.append(region_name_match.group(2))  # 피보험자
                    i += 2
                    continue
                # 다음 셀이 구/시/군으로 끝나면 병합 (예: "서울" + "송파구" = "서울 송파구")
                elif next_cell and re.match(r"^[가-힣]+[구시군]$", next_cell):
                    result.append(f"{partial_region} {next_cell}")  # 지역 병합
                    i += 2
                    continue
                # 다음 셀이 비어있으면 스킵 (OCR이 잘못 분리한 경우)
                elif next_cell == "":
                    result.append(partial_region)  # 지역 그대로
                    i += 2  # 빈 셀 스킵
                    continue
                else:
                    result.append(partial_region)  # 지역 그대로
                    i += 1
                    continue

            # 패턴 2: 통화 + 금액 병합 ("KRW 36,600", "USD 100,000")
            currency_match = re.match(r"^(KRW|USD|EUR|JPY)\s+([\d,]+)$", cell_text)
            if currency_match:
                result.append(currency_match.group(1))  # 통화
                result.append(currency_match.group(2))  # 월납입보험료
                i += 1
                continue

            # 패턴 2-1: "보험기간 KRW" 형태 ("종신, 10년납 KRW", "개인 80세, 10년납 KRW")
            period_currency = re.match(r"^(.+?)\s+(KRW|USD|EUR|JPY)$", cell_text)
            if period_currency:
                # 보험기간은 앞 셀(보험상품)에 추가해야 하므로 표시
                result.append(f"__PERIOD__{period_currency.group(1)}")  # 보험기간 (나중에 처리)
                result.append(period_currency.group(2))  # 통화
                i += 1
                continue

            # 패턴 2-2: "이름 증권번호" 형태 ("문경천 0000152646")
            name_policy = re.match(r"^([가-힣]{2,4})\s+(\d{10})$", cell_text)
            if name_policy:
                result.append(name_policy.group(1))  # 피보험자
                result.append(name_policy.group(2))  # 증권번호
                i += 1
                continue

            # 패턴 3: 모집이양 + 신탁 병합 ("모집 N", "이양 Y")
            transfer_match = re.match(r"^(모집|이양)\s+([NYny])$", cell_text)
            if transfer_match:
                result.append(transfer_match.group(1))  # 모집이양
                result.append(transfer_match.group(2).upper())  # 신탁
                i += 1
                continue

            # 기본: 그대로 추가
            result.append(cell_text)
            i += 1

        # 17개로 맞춤
        while len(result) < 17:
            result.append("")

        return result[:17]

    def _realign_columns(self, cells: List[str]) -> List[str]:
        """
        앵커 기반으로 컬럼 재정렬

        Upstage OCR이 셀을 불일치하게 분리하는 문제 해결.
        증권번호(10자리), 통화(KRW 등)를 앵커로 사용하여 정렬.

        컬럼 구조 (0-indexed):
        0:순번 1:계약일 2:계약자 3:생년월일 4:성별 5:지역
        6:피보험자 7:증권번호 8:보험상품 9:통화 10:월납입보험료
        11:상태 12:수금방법 13:납입상태 14:전자청약 15:모집이양 16:신탁

        Args:
            cells: 셀 리스트 (expand 후)

        Returns:
            재정렬된 셀 리스트 (17개)
        """
        if len(cells) < 10:
            return cells

        # 앵커 1: 증권번호 찾기 (10자리 숫자, 컬럼 7)
        policy_idx = -1
        for i, cell in enumerate(cells):
            if re.match(r"^\d{10}$", str(cell)):
                policy_idx = i
                break

        # 앵커 2: 통화 찾기 (KRW/USD/EUR/JPY, 컬럼 9)
        currency_idx = -1
        for i, cell in enumerate(cells):
            if str(cell).strip() in ("KRW", "USD", "EUR", "JPY"):
                currency_idx = i
                break

        # 증권번호 앵커로 정렬
        if policy_idx != -1 and policy_idx != 7:
            if policy_idx > 7:
                # 증권번호가 오른쪽으로 밀려있음 - 피보험자(6)에 앞 셀 병합
                extra = policy_idx - 7
                if extra > 0 and len(cells) > 6:
                    # 피보험자 셀에 잘못 밀린 셀들 병합
                    parts = [cells[6]]
                    for j in range(1, extra + 1):
                        if 6 + j < len(cells):
                            parts.append(str(cells[6 + j]))
                    # 증권번호가 섞여있으면 제외
                    merged = " ".join(p for p in parts if p and not re.match(r"^\d{10}$", p))
                    cells = cells[:6] + [merged] + cells[policy_idx:]
                    # 인덱스 재계산
                    policy_idx = 7
                    for i, cell in enumerate(cells):
                        if str(cell).strip() in ("KRW", "USD", "EUR", "JPY"):
                            currency_idx = i
                            break

            elif policy_idx < 7:
                # 증권번호가 왼쪽으로 밀려있음 - 앞에 빈 셀 삽입
                empty_count = 7 - policy_idx
                cells = cells[:policy_idx] + [""] * empty_count + cells[policy_idx:]
                # 인덱스 재계산
                policy_idx = 7
                for i, cell in enumerate(cells):
                    if str(cell).strip() in ("KRW", "USD", "EUR", "JPY"):
                        currency_idx = i
                        break

        # 통화 앵커로 정렬 (컬럼 9)
        if currency_idx != -1 and currency_idx != 9:
            if currency_idx > 9:
                # 통화가 오른쪽으로 밀려있음 - 보험상품(8)에 앞 셀들 병합
                extra = currency_idx - 9
                if extra > 0 and len(cells) > 8:
                    parts = [cells[8]]
                    for j in range(1, extra + 1):
                        if 8 + j < len(cells):
                            parts.append(str(cells[8 + j]))
                    merged = " ".join(p for p in parts if p)
                    cells = cells[:8] + [merged] + cells[currency_idx:]

            elif currency_idx < 9 and currency_idx > 7:
                # 통화가 왼쪽으로 밀려있음 (보험상품이 없는 경우)
                empty_count = 9 - currency_idx
                cells = cells[:currency_idx] + [""] * empty_count + cells[currency_idx:]

        # 금액 분리 (통화에 금액이 붙어있는 경우: "KRW 36,600")
        if len(cells) > 9:
            currency_cell = str(cells[9]).strip()
            currency_amount = re.match(r"^(KRW|USD|EUR|JPY)\s+([\d,]+)$", currency_cell)
            if currency_amount:
                cells = cells[:9] + [currency_amount.group(1), currency_amount.group(2)] + cells[10:]

        # 금액 위치 확인 (컬럼 10이 숫자여야 함)
        if len(cells) > 10:
            premium_cell = str(cells[10]).strip() if cells[10] else ""
            if not re.match(r"^[\d,]+$", premium_cell):
                # 금액이 잘못된 위치에 있음 - 근처에서 찾기
                for offset in [-1, 1, -2, 2]:
                    check_idx = 10 + offset
                    if 0 <= check_idx < len(cells):
                        check_cell = str(cells[check_idx]).strip()
                        if re.match(r"^[\d,]+$", check_cell) and len(check_cell) >= 3:
                            # 발견된 금액과 현재 위치 교환
                            cells[10], cells[check_idx] = cells[check_idx], cells[10]
                            break

        # 보험상품에 증권번호가 섞인 경우 분리 ("0000169560 평생보장보험...")
        if len(cells) > 8:
            product = str(cells[8]).strip()
            product_with_policy = re.match(r"^(\d{10})\s+(.+)$", product)
            if product_with_policy:
                # 증권번호가 앞에 있으면 분리
                cells[7] = product_with_policy.group(1)  # 증권번호
                cells[8] = product_with_policy.group(2)  # 보험상품

        # __PERIOD__ 마커 처리: 보험기간을 보험상품에 병합
        for i, cell in enumerate(cells):
            if str(cell).startswith("__PERIOD__"):
                period = str(cell).replace("__PERIOD__", "")
                # 앞 셀(보험상품)에 병합
                if i > 0 and cells[i - 1]:
                    cells[i - 1] = f"{cells[i - 1]} {period}"
                cells[i] = ""  # 현재 셀 비움

        # 빈 셀 정리 (연속된 빈 셀 제거)
        cells = [c for c in cells if c != ""]

        # 17개로 맞춤
        while len(cells) < 17:
            cells.append("")

        return cells[:17]

    def _parse_table_cells_structure(self, cells: List[Dict]) -> List[Dict[str, Any]]:
        """
        Upstage table.cells 구조 파싱

        Args:
            cells: 셀 목록 (row_id, col_id, text 포함)

        Returns:
            파싱된 행 목록
        """
        # 셀을 행별로 그룹화
        row_map: Dict[int, Dict[int, str]] = {}
        for cell in cells:
            row_id = cell.get("row_id", cell.get("rowIndex", 0))
            col_id = cell.get("col_id", cell.get("columnIndex", 0))
            text = cell.get("text", cell.get("content", ""))
            if isinstance(text, dict):
                text = text.get("text", "")

            # mojibake 수정 적용
            text = self._fix_mojibake(str(text).strip())

            if row_id not in row_map:
                row_map[row_id] = {}
            row_map[row_id][col_id] = text

        rows = []
        for row_id in sorted(row_map.keys()):
            row_data = row_map[row_id]
            # dict를 list로 변환 (컬럼 순서대로)
            max_col = max(row_data.keys()) if row_data else 0
            cell_list = [row_data.get(i, "") for i in range(max_col + 1)]

            # 헤더 행 스킵 (통일된 로직 사용)
            if self._is_header_row(cell_list):
                continue

            # 첫 셀이 숫자(순번)가 아니면 스킵
            if not cell_list or not str(cell_list[0]).strip().isdigit():
                continue

            # 병합된 셀 확장 및 재정렬 후 파싱
            expanded = self._expand_merged_cells(cell_list)
            aligned = self._realign_columns(expanded)
            row = self._parse_row_cells(aligned)
            if row:
                rows.append(row)

        return rows

    def _parse_table_row_data(self, row_data: List[Dict]) -> Optional[Dict[str, Any]]:
        """
        테이블 행 데이터를 컬럼에 매핑

        Args:
            row_data: 테이블 행의 셀 목록

        Returns:
            매핑된 행 데이터
        """
        if not row_data:
            return None

        # 셀 텍스트 추출 (mojibake 수정 포함)
        cell_list = []
        for cell in row_data:
            cell_text = cell.get("text", "").strip() if isinstance(cell, dict) else str(cell).strip()
            cell_list.append(self._fix_mojibake(cell_text))

        # 헤더 행 스킵
        if self._is_header_row(cell_list):
            return None

        # 첫 셀이 숫자(순번)가 아니면 스킵
        if not cell_list or not str(cell_list[0]).strip().isdigit():
            return None

        # 병합된 셀 확장 및 재정렬
        expanded = self._expand_merged_cells(cell_list)
        aligned = self._realign_columns(expanded)

        # _parse_row_cells 호출하여 일관된 처리
        return self._parse_row_cells(aligned)

    def _parse_text_fallback(self, text: str) -> List[Dict[str, Any]]:
        """
        테이블 인식 실패 시 텍스트 기반 파싱 (폴백)

        Args:
            text: OCR 텍스트

        Returns:
            파싱된 행 목록
        """
        rows = []
        lines = text.split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 순번(1~4자리 숫자)으로 시작하는 줄 (1, 10, 100, 1000 모두 포함)
            if not re.match(r"^\d{1,4}\s", line):
                continue

            parts = line.split()
            if len(parts) < 10:
                continue

            # 첫 번째 필드가 헤더("순번", "번호" 등)면 스킵
            if parts[0] in ("순번", "번호", "No", "NO"):
                continue

            try:
                row = {
                    "순번": int(parts[0]),
                    "계약일": parts[1] if len(parts) > 1 else None,
                    "계약자": parts[2] if len(parts) > 2 else "",
                    "생년월일": parts[3] if len(parts) > 3 else None,
                    "성별": parts[4] if len(parts) > 4 else None,
                }

                # 증권번호: 10자리 숫자
                for part in parts:
                    if re.match(r"^\d{10}$", part):
                        row["증권번호"] = part
                        break

                # 월납입보험료: 쉼표 숫자
                for part in parts:
                    cleaned = re.sub(r"[,]", "", part)
                    if re.match(r"^\d{4,}$", cleaned) and int(cleaned) > 1000:
                        row["월납입보험료"] = int(cleaned)
                        break

                # 통화
                for part in parts:
                    if part in ("KRW", "USD", "EUR", "JPY"):
                        row["통화"] = part
                        break
                else:
                    row["통화"] = "KRW"

                rows.append(row)

            except (ValueError, IndexError):
                continue

        return rows

    def extract_from_image(self, image_path: str) -> Dict[str, Any]:
        """
        단일 이미지에서 테이블 데이터 추출

        Args:
            image_path: 이미지 파일 경로

        Returns:
            추출된 데이터
        """
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

        # 방법 1: 테이블 요소에서 파싱 시도
        rows = self._parse_table_elements(elements)

        # 방법 2: 전체 HTML에서 테이블 파싱 시도
        if not rows and html:
            rows = self._parse_html_tables(html)

        # 방법 3: 텍스트 폴백
        if not rows and text:
            rows = self._parse_text_fallback(text)

        return {
            "source_image": image_path,
            "rows": rows,
            "page_info": {
                "visible_rows": len(rows),
            },
        }

    def extract_from_images(
        self,
        image_paths: List[str],
        progress_callback: Optional[callable] = None
    ) -> List[Dict[str, Any]]:
        """
        여러 이미지에서 테이블 데이터 추출

        Args:
            image_paths: 이미지 파일 경로 목록
            progress_callback: 진행 상황 콜백

        Returns:
            각 이미지의 추출 결과 목록
        """
        results = []
        total = len(image_paths)

        for i, path in enumerate(image_paths):
            if progress_callback:
                progress_callback(i + 1, total)

            result = self.extract_from_image(path)
            results.append(result)

        return results
