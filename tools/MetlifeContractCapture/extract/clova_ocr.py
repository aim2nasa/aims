"""
Naver Clova OCR 연동 모듈
한글 인식 정확도가 높은 OCR 서비스
"""
import os
import json
import re
import uuid
import time
import base64
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx


class ClovaOCRExtractor:
    """Naver Clova OCR을 사용한 테이블 데이터 추출기"""

    # 테이블 컬럼 순서
    COLUMNS = [
        "순번", "계약일", "계약자", "생년월일", "성별", "지역",
        "피보험자", "증권번호", "보험상품", "통화", "월납입보험료",
        "상태", "수금방법", "납입상태", "전자청약", "모집이양", "신탁"
    ]

    def __init__(
        self,
        api_url: Optional[str] = None,
        secret_key: Optional[str] = None,
        timeout: float = 60.0
    ):
        """
        Args:
            api_url: Clova OCR API URL (APIGW Invoke URL)
            secret_key: Clova OCR Secret Key
            timeout: API 타임아웃 (초)
        """
        self.api_url = api_url or os.environ.get("CLOVA_OCR_API_URL")
        self.secret_key = secret_key or os.environ.get("CLOVA_OCR_SECRET_KEY")

        if not self.api_url:
            raise ValueError("CLOVA_OCR_API_URL 환경변수 또는 api_url 파라미터 필요")
        if not self.secret_key:
            raise ValueError("CLOVA_OCR_SECRET_KEY 환경변수 또는 secret_key 파라미터 필요")

        self.timeout = timeout

    def _encode_image(self, image_path: str) -> str:
        """이미지를 base64로 인코딩"""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    def _get_image_format(self, image_path: str) -> str:
        """이미지 포맷 반환"""
        suffix = Path(image_path).suffix.lower()
        return {
            ".png": "png",
            ".jpg": "jpg",
            ".jpeg": "jpg",
            ".gif": "gif",
            ".tiff": "tiff",
            ".tif": "tiff",
        }.get(suffix, "png")

    def _call_ocr_api(self, image_path: str) -> Dict[str, Any]:
        """
        Clova OCR API 호출

        Args:
            image_path: 이미지 파일 경로

        Returns:
            API 응답 또는 에러 정보
        """
        try:
            image_data = self._encode_image(image_path)
            image_format = self._get_image_format(image_path)

            request_json = {
                "images": [
                    {
                        "format": image_format,
                        "name": Path(image_path).stem,
                        "data": image_data,
                    }
                ],
                "requestId": str(uuid.uuid4()),
                "version": "V2",
                "timestamp": int(time.time() * 1000),
            }

            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    self.api_url,
                    headers={
                        "X-OCR-SECRET": self.secret_key,
                        "Content-Type": "application/json",
                    },
                    json=request_json,
                )

                if response.status_code != 200:
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"Clova OCR API 오류: HTTP {response.status_code}",
                        "fields": [],
                    }

                return {
                    "error": False,
                    "status": 200,
                    "data": response.json(),
                }

        except httpx.TimeoutException:
            return {
                "error": True,
                "status": 504,
                "message": "Clova OCR 처리 시간 초과",
                "fields": [],
            }
        except Exception as e:
            return {
                "error": True,
                "status": 500,
                "message": f"Clova OCR 처리 실패: {str(e)}",
                "fields": [],
            }

    def _parse_table_from_response(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Clova OCR 응답에서 테이블 데이터 추출

        Args:
            data: Clova OCR API 응답

        Returns:
            파싱된 행 목록
        """
        rows = []

        # images[0].tables 또는 images[0].fields에서 데이터 추출
        images = data.get("images", [])
        if not images:
            return rows

        image_result = images[0]

        # 테이블 인식 결과가 있는 경우
        tables = image_result.get("tables", [])
        if tables:
            for table in tables:
                cells = table.get("cells", [])
                # 셀을 행별로 그룹화
                row_map: Dict[int, Dict[int, str]] = {}
                for cell in cells:
                    row_idx = cell.get("rowIndex", 0)
                    col_idx = cell.get("columnIndex", 0)
                    text = cell.get("cellTextLines", [])
                    cell_text = " ".join(
                        word.get("inferText", "")
                        for line in text
                        for word in line.get("cellWords", [])
                    ).strip()

                    if row_idx not in row_map:
                        row_map[row_idx] = {}
                    row_map[row_idx][col_idx] = cell_text

                # 행별로 데이터 변환 (첫 번째 행은 헤더로 가정)
                for row_idx in sorted(row_map.keys()):
                    if row_idx == 0:  # 헤더 스킵
                        continue

                    row_data = row_map[row_idx]
                    row = self._map_row_to_columns(row_data)
                    if row:
                        rows.append(row)
        else:
            # 테이블 인식 실패 시 필드에서 텍스트 추출 후 줄 단위 파싱
            fields = image_result.get("fields", [])
            lines = self._group_fields_into_lines(fields)
            for line in lines:
                row = self._parse_line_to_row(line)
                if row:
                    rows.append(row)

        return rows

    def _map_row_to_columns(self, row_data: Dict[int, str]) -> Optional[Dict[str, Any]]:
        """
        셀 데이터를 컬럼에 매핑 (앵커 기반 재정렬 포함)

        Args:
            row_data: {column_index: cell_text} 형태의 데이터

        Returns:
            매핑된 행 데이터
        """
        if not row_data:
            return None

        # dict를 list로 변환
        max_col = max(row_data.keys()) if row_data else 0
        cells = [row_data.get(i, "") for i in range(max_col + 1)]

        # 첫 셀이 숫자(순번)가 아니면 스킵
        if not cells or not str(cells[0]).strip().isdigit():
            return None

        # 앵커 기반 재정렬
        cells = self._expand_merged_cells(cells)
        cells = self._realign_columns(cells)

        # 컬럼에 매핑
        return self._parse_row_cells(cells)

    def _parse_row_cells(self, cells: List[str]) -> Optional[Dict[str, Any]]:
        """
        셀 리스트를 컬럼에 매핑

        Args:
            cells: 재정렬된 셀 리스트 (17개)

        Returns:
            매핑된 행 데이터
        """
        row = {}
        for i, col_name in enumerate(self.COLUMNS):
            if i < len(cells):
                cell_text = str(cells[i]).strip() if cells[i] else ""
                if col_name == "순번":
                    try:
                        row[col_name] = int(cell_text) if cell_text else None
                    except ValueError:
                        row[col_name] = None
                elif col_name == "월납입보험료":
                    try:
                        cleaned = cell_text.replace(",", "").replace(" ", "")
                        row[col_name] = int(cleaned) if cleaned else 0
                    except ValueError:
                        row[col_name] = 0
                else:
                    row[col_name] = cell_text if cell_text else None
            else:
                row[col_name] = None

        # 순번이 있어야 유효한 행
        if row.get("순번") is None:
            return None

        return row

    def _expand_merged_cells(self, cells: List[str]) -> List[str]:
        """
        병합된 셀을 분리하여 17개 컬럼에 맞춤

        Args:
            cells: 원본 셀 리스트

        Returns:
            처리된 셀 리스트
        """
        result = []
        i = 0

        while i < len(cells):
            cell_text = str(cells[i]).strip() if cells[i] else ""

            # 패턴 1: 성별 + 지역 병합 ("남 서울", "여 경기 고양시")
            gender_match = re.match(r"^(남|여)\s+(.+)$", cell_text)
            if gender_match:
                result.append(gender_match.group(1))  # 성별
                partial_region = gender_match.group(2)
                next_cell = str(cells[i + 1]).strip() if i + 1 < len(cells) else ""

                # 다음 셀이 "구/시/군 + 사람이름" 패턴
                region_name_match = re.match(r"^([가-힣]+[구시군동])\s+([가-힣]{2,4})$", next_cell)
                if region_name_match:
                    result.append(f"{partial_region} {region_name_match.group(1)}")
                    result.append(region_name_match.group(2))
                    i += 2
                    continue
                elif next_cell and re.match(r"^[가-힣]+[구시군]$", next_cell):
                    result.append(f"{partial_region} {next_cell}")
                    i += 2
                    continue
                else:
                    result.append(partial_region)
                    i += 1
                    continue

            # 패턴 2: 통화 + 금액 병합 ("KRW 36,600")
            currency_match = re.match(r"^(KRW|USD|EUR|JPY)\s+([\d,]+)$", cell_text)
            if currency_match:
                result.append(currency_match.group(1))
                result.append(currency_match.group(2))
                i += 1
                continue

            # 패턴 3: "이름 증권번호" 형태 ("문경천 0000152646")
            name_policy = re.match(r"^([가-힣]{2,4})\s+(\d{10})$", cell_text)
            if name_policy:
                result.append(name_policy.group(1))
                result.append(name_policy.group(2))
                i += 1
                continue

            # 기본: 그대로 추가
            result.append(cell_text)
            i += 1

        # 17개로 자르지 않음 - _realign_columns에서 처리
        return result

    def _realign_columns(self, cells: List[str]) -> List[str]:
        """
        앵커 기반으로 컬럼 재정렬 (개선된 버전)

        증권번호(10자리), 통화(KRW 등)를 앵커로 사용하여 정렬.
        OCR에서 분리된 필드들을 적절히 병합하여 17개 컬럼에 매핑.

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
            while len(cells) < 17:
                cells.append("")
            return cells[:17]

        # 결과 배열 초기화
        result = [""] * 17

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

        if policy_idx == -1 or currency_idx == -1:
            # 앵커를 찾지 못하면 기존 방식으로 처리
            for i, val in enumerate(cells[:17]):
                result[i] = val
            return result

        # === 구간별 매핑 ===

        # 구간 A: 순번 ~ 피보험자 (컬럼 0~6, 7개)
        # 증권번호 앞의 모든 필드
        before_policy = cells[:policy_idx]

        # 순번(0), 계약일(1), 계약자(2), 생년월일(3), 성별(4)는 고정 위치
        for i in range(min(5, len(before_policy))):
            result[i] = before_policy[i]

        # 지역(5)과 피보험자(6): 나머지 필드 처리
        if len(before_policy) > 5:
            remaining = before_policy[5:]
            if len(remaining) == 1:
                # 지역+피보험자가 합쳐진 경우 또는 피보험자만 있는 경우
                val = str(remaining[0]).strip()
                # 한글 이름 패턴 (2~4글자)
                if re.match(r"^[가-힣]{2,4}$", val):
                    result[6] = val  # 피보험자
                else:
                    result[5] = val  # 지역
            elif len(remaining) == 2:
                result[5] = remaining[0]  # 지역
                result[6] = remaining[1]  # 피보험자
            elif len(remaining) >= 3:
                # 지역이 여러 필드로 분리된 경우 (예: "경기", "고양시")
                # 마지막은 피보험자, 나머지는 지역으로 병합
                result[5] = " ".join(str(r) for r in remaining[:-1] if r)
                result[6] = remaining[-1]

        # 구간 B: 증권번호(7), 보험상품(8)
        result[7] = cells[policy_idx]  # 증권번호

        # 보험상품: 증권번호 다음 ~ 통화 전
        if currency_idx > policy_idx + 1:
            product_parts = cells[policy_idx + 1:currency_idx]
            result[8] = " ".join(str(p) for p in product_parts if p)
        elif currency_idx == policy_idx + 1:
            result[8] = ""

        # 구간 C: 통화(9) ~ 신탁(16)
        after_currency = cells[currency_idx:]

        # 통화(9), 월납입보험료(10), 상태(11), 수금방법(12), 납입상태(13),
        # 전자청약(14), 모집이양(15), 신탁(16)
        for i, val in enumerate(after_currency):
            target_idx = 9 + i
            if target_idx < 17:
                result[target_idx] = str(val) if val else ""

        # === 후처리 ===

        # 피보험자(6)에 "지역 + 이름" 패턴이 있으면 분리
        if result[6]:
            insured = str(result[6]).strip()
            region_name = re.match(r"^([가-힣]+[시군구동])\s+([가-힣]{2,4})$", insured)
            if region_name:
                if result[5]:
                    result[5] = f"{result[5]} {region_name.group(1)}"
                else:
                    result[5] = region_name.group(1)
                result[6] = region_name.group(2)

        # "None" 문자열을 빈 문자열로 변환 (나중에 null 처리)
        for i in range(17):
            if result[i] == "None" or result[i] == "none":
                result[i] = ""

        return result

    def _group_fields_into_lines(self, fields: List[Dict]) -> List[List[Dict]]:
        """
        필드를 Y 좌표 기준으로 줄 단위로 그룹화

        Args:
            fields: OCR 필드 목록

        Returns:
            줄별로 그룹화된 필드 목록
        """
        if not fields:
            return []

        # Y 좌표 기준 정렬
        sorted_fields = sorted(
            fields,
            key=lambda f: f.get("boundingPoly", {}).get("vertices", [{}])[0].get("y", 0)
        )

        lines = []
        current_line = []
        current_y = None
        y_threshold = 15  # 같은 줄로 판단하는 Y 좌표 오차

        for field in sorted_fields:
            vertices = field.get("boundingPoly", {}).get("vertices", [{}])
            y = vertices[0].get("y", 0) if vertices else 0

            if current_y is None:
                current_y = y
                current_line.append(field)
            elif abs(y - current_y) <= y_threshold:
                current_line.append(field)
            else:
                if current_line:
                    # X 좌표 기준 정렬
                    current_line.sort(
                        key=lambda f: f.get("boundingPoly", {}).get("vertices", [{}])[0].get("x", 0)
                    )
                    lines.append(current_line)
                current_line = [field]
                current_y = y

        if current_line:
            current_line.sort(
                key=lambda f: f.get("boundingPoly", {}).get("vertices", [{}])[0].get("x", 0)
            )
            lines.append(current_line)

        return lines

    def _parse_line_to_row(self, line_fields: List[Dict]) -> Optional[Dict[str, Any]]:
        """
        한 줄의 필드를 행 데이터로 변환 (앵커 기반 재정렬 적용)

        Args:
            line_fields: 한 줄의 OCR 필드 목록

        Returns:
            파싱된 행 데이터
        """
        texts = [f.get("inferText", "") for f in line_fields]

        # 첫 번째 필드가 숫자(순번)인지 확인
        if not texts or not texts[0].isdigit():
            return None

        # 1. 병합된 셀 분리
        expanded = self._expand_merged_cells(texts)

        # 2. 앵커 기반 컬럼 재정렬
        aligned = self._realign_columns(expanded)

        # 3. 정렬된 셀로 행 데이터 생성
        row = {}
        for i, col_name in enumerate(self.COLUMNS):
            if i < len(aligned):
                text = str(aligned[i]).strip() if aligned[i] else ""
                if col_name == "순번":
                    try:
                        row[col_name] = int(text)
                    except ValueError:
                        return None
                elif col_name == "월납입보험료":
                    try:
                        cleaned = text.replace(",", "").replace(" ", "")
                        row[col_name] = int(cleaned) if cleaned else 0
                    except ValueError:
                        row[col_name] = 0
                else:
                    row[col_name] = text if text else None
            else:
                row[col_name] = None

        return row

    def extract_from_image(self, image_path: str) -> Dict[str, Any]:
        """
        단일 이미지에서 테이블 데이터 추출

        Args:
            image_path: 이미지 파일 경로

        Returns:
            추출된 데이터
        """
        ocr_result = self._call_ocr_api(image_path)

        if ocr_result.get("error"):
            return {
                "error": ocr_result.get("message"),
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
            }

        data = ocr_result.get("data", {})
        rows = self._parse_table_from_response(data)

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
