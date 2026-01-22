"""
Upstage Document AI 연동 모듈
테이블 구조 인식이 가능한 Document Parse API 사용
"""
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx


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

    def __init__(self, api_key: Optional[str] = None, timeout: float = 120.0):
        """
        Args:
            api_key: Upstage API 키 (없으면 환경변수에서 읽음)
            timeout: API 타임아웃 (초)
        """
        self.api_key = api_key or os.environ.get("UPSTAGE_API_KEY")
        if not self.api_key:
            raise ValueError("UPSTAGE_API_KEY 환경변수 또는 api_key 파라미터 필요")

        self.timeout = timeout

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
                        error_detail = response.json().get("message", "")
                    except Exception:
                        error_detail = response.text[:200]
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"Document Parse API 오류: HTTP {response.status_code} - {error_detail}",
                        "elements": [],
                    }

                data = response.json()
                return {
                    "error": False,
                    "status": 200,
                    "elements": data.get("elements", []),
                    "text": data.get("text", ""),
                    "html": data.get("html", ""),
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
                table_data = element.get("data", {})
                table_rows = table_data.get("rows", [])

                for row_data in table_rows:
                    row = self._parse_table_row_data(row_data)
                    if row:
                        rows.append(row)

            # 테이블 셀 요소 (개별 셀로 오는 경우)
            elif category == "table_cell":
                # 셀 단위로 오는 경우 처리 필요
                pass

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

        row = {}
        for i, cell in enumerate(row_data):
            if i >= len(self.COLUMNS):
                break

            col_name = self.COLUMNS[i]
            cell_text = cell.get("text", "").strip() if isinstance(cell, dict) else str(cell).strip()

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

            # 순번(3~4자리 숫자)으로 시작하는 줄
            if not re.match(r"^\d{3,4}\s", line):
                continue

            parts = line.split()
            if len(parts) < 10:
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
            return {
                "error": api_result.get("message"),
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
            }

        # 테이블 요소에서 파싱 시도
        elements = api_result.get("elements", [])
        rows = self._parse_table_elements(elements)

        # 테이블 인식 실패 시 텍스트 폴백
        if not rows:
            text = api_result.get("text", "")
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
