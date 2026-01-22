"""
Upstage OCR 연동 모듈
이미지에서 텍스트 추출 후 파싱
"""
import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx


class UpstageOCRExtractor:
    """Upstage OCR을 사용한 테이블 데이터 추출기"""

    API_URL = "https://api.upstage.ai/v1/document-digitization"

    # 테이블 컬럼 순서 (OCR 텍스트 파싱용)
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

    def _call_ocr_api(self, image_path: str) -> Dict[str, Any]:
        """
        Upstage OCR API 호출

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
                        "model": "ocr"
                    }
                )

                if response.status_code != 200:
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"OCR API 오류: HTTP {response.status_code}",
                        "text": None
                    }

                data = response.json()
                return {
                    "error": False,
                    "status": 200,
                    "text": data.get("text", ""),
                    "confidence": data.get("confidence"),
                    "pages": data.get("pages", [])
                }

        except httpx.TimeoutException:
            return {
                "error": True,
                "status": 504,
                "message": "OCR 처리 시간 초과",
                "text": None
            }
        except Exception as e:
            return {
                "error": True,
                "status": 500,
                "message": f"OCR 처리 실패: {str(e)}",
                "text": None
            }

    def _parse_table_row(self, line: str) -> Optional[Dict[str, Any]]:
        """
        OCR 텍스트 라인을 테이블 행으로 파싱

        Args:
            line: OCR에서 추출된 한 줄

        Returns:
            파싱된 행 데이터 또는 None
        """
        # 순번으로 시작하는 줄만 처리 (숫자 3~4자리)
        if not re.match(r"^\d{3,4}\s", line):
            return None

        # 공백으로 분리
        parts = line.split()
        if len(parts) < 10:  # 최소 필수 필드
            return None

        try:
            row = {
                "순번": int(parts[0]),
                "계약일": parts[1] if len(parts) > 1 else None,
                "계약자": parts[2] if len(parts) > 2 else "",
                "생년월일": parts[3] if len(parts) > 3 else None,
                "성별": parts[4] if len(parts) > 4 else None,
            }

            # 나머지 필드는 패턴에 따라 파싱 (복잡한 경우가 많음)
            # 증권번호: 10자리 숫자
            for i, part in enumerate(parts):
                if re.match(r"^\d{10}$", part):
                    row["증권번호"] = part
                    break

            # 월납입보험료: 쉼표가 있는 숫자 또는 순수 숫자
            for part in parts:
                cleaned = re.sub(r"[,]", "", part)
                if re.match(r"^\d{4,}$", cleaned) and int(cleaned) > 1000:
                    row["월납입보험료"] = int(cleaned)
                    break

            # 통화: KRW, USD 등
            for part in parts:
                if part in ("KRW", "USD", "EUR", "JPY"):
                    row["통화"] = part
                    break
            else:
                row["통화"] = "KRW"

            return row

        except (ValueError, IndexError):
            return None

    def _parse_ocr_text(self, text: str) -> List[Dict[str, Any]]:
        """
        OCR 텍스트를 테이블 행 목록으로 파싱

        Args:
            text: OCR 전체 텍스트

        Returns:
            파싱된 행 목록
        """
        rows = []
        lines = text.split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            row = self._parse_table_row(line)
            if row:
                rows.append(row)

        return rows

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
                "raw_text": None
            }

        text = ocr_result.get("text", "")
        rows = self._parse_ocr_text(text)

        return {
            "source_image": image_path,
            "rows": rows,
            "page_info": {
                "visible_rows": len(rows),
                "confidence": ocr_result.get("confidence")
            },
            "raw_text": text  # 디버깅용
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


# 참고: Upstage OCR은 테이블 구조를 직접 파악하지 못하므로
# Claude Vision에 비해 정확도가 떨어질 수 있습니다.
# 복잡한 테이블의 경우 Claude Vision 사용을 권장합니다.
