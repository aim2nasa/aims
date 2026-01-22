"""
Naver Clova OCR 연동 모듈
한글 인식 정확도가 높은 OCR 서비스
"""
import os
import json
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
        셀 데이터를 컬럼에 매핑

        Args:
            row_data: {column_index: cell_text} 형태의 데이터

        Returns:
            매핑된 행 데이터
        """
        if not row_data:
            return None

        # 컬럼 인덱스와 컬럼명 매핑
        row = {}
        for col_idx, col_name in enumerate(self.COLUMNS):
            cell_text = row_data.get(col_idx, "")
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

        # 순번이 있어야 유효한 행
        if row.get("순번") is None:
            return None

        return row

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
        한 줄의 필드를 행 데이터로 변환

        Args:
            line_fields: 한 줄의 OCR 필드 목록

        Returns:
            파싱된 행 데이터
        """
        texts = [f.get("inferText", "") for f in line_fields]

        # 첫 번째 필드가 숫자(순번)인지 확인
        if not texts or not texts[0].isdigit():
            return None

        row = {}
        for i, col_name in enumerate(self.COLUMNS):
            if i < len(texts):
                text = texts[i].strip()
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
