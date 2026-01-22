"""
Claude Vision API 연동 모듈
이미지에서 테이블 데이터 추출
"""
import base64
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

import anthropic


class ClaudeVisionExtractor:
    """Claude Vision API를 사용한 테이블 데이터 추출기"""

    SYSTEM_PROMPT = """당신은 보험 계약 데이터 추출 전문가입니다.
이미지에서 테이블 데이터를 정확히 추출하여 JSON으로 반환하세요.

규칙:
1. 반드시 유효한 JSON만 반환 (마크다운 코드블록 없이)
2. 빈 셀은 null로 표시
3. 숫자는 쉼표 제거 후 정수로 (예: "1,234,567" → 1234567)
4. 날짜는 원본 형식 유지 (변환 불필요)
5. 중복 행이 있으면 모두 포함 (이후 처리에서 중복 제거)
6. 테이블이 보이지 않거나 비어있으면 빈 rows 반환
7. 한글 이름 주의: 형/동, 술/송, 기/긴 등 유사 자형 정확히 구분
8. 보험상품명: "유)" 접두어, 긴 상품명 전체를 빠짐없이 추출"""

    TABLE_EXTRACTION_PROMPT = """이 이미지에서 계약사항 조회 테이블의 모든 행을 추출하세요.

테이블 컬럼 (순서대로):
1. 순번 (number)
2. 계약일 (string, 예: "2005-09-04")
3. 계약자 (string)
4. 생년월일 (string, 예: "720214" 또는 "651117")
5. 성별 (string, "남" 또는 "여")
6. 지역 (string, 예: "서울 마포구", "경기 고양시")
7. 피보험자 (string)
8. 증권번호 (string, 예: "0003074200")
9. 보험상품 (string, 예: "유) 하이라이프 종신보험")
10. 통화 (string, "KRW" 등)
11. 월납입보험료 (number, 쉼표 제거된 정수)
12. 상태 (string, "정상" 등)
13. 수금방법 (string, "직납", "자동이체" 등)
14. 납입상태 (string, "납입완료", "납입중" 등)
15. 전자청약 (string, "N" 또는 "Y")
16. 모집/이양 (string, "모집", "이양" 등)
17. 신탁 (string, "N" 또는 "Y")

JSON 형식으로 반환:
{
  "rows": [
    {
      "순번": 1001,
      "계약일": "2005-09-04",
      "계약자": "박술기",
      "생년월일": "720214",
      "성별": "여",
      "지역": "서울 마포구",
      "피보험자": "박술기",
      "증권번호": "0003074200",
      "보험상품": "유) 하이라이프 종신보험",
      "통화": "KRW",
      "월납입보험료": 74340,
      "상태": "정상",
      "수금방법": "직납",
      "납입상태": "납입완료",
      "전자청약": "N",
      "모집이양": "모집",
      "신탁": "N"
    }
  ],
  "page_info": {
    "visible_rows": 11,
    "first_row_number": 1001,
    "last_row_number": 991
  }
}

중요: JSON만 반환하세요. 설명이나 마크다운 코드블록 없이 순수 JSON만."""

    def __init__(self, api_key: Optional[str] = None, model: str = "claude-opus-4-20250514"):
        """
        Args:
            api_key: Anthropic API 키 (없으면 환경변수에서 읽음)
            model: 사용할 모델 ID
        """
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY 환경변수 또는 api_key 파라미터 필요")

        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = model

    def _encode_image(self, image_path: str) -> str:
        """이미지를 base64로 인코딩"""
        with open(image_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8")

    def _get_media_type(self, image_path: str) -> str:
        """이미지 MIME 타입 결정"""
        suffix = Path(image_path).suffix.lower()
        return {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(suffix, "image/png")

    def _parse_response(self, response_text: str) -> Dict[str, Any]:
        """응답 텍스트를 JSON으로 파싱"""
        text = response_text.strip()

        # 직접 JSON 파싱 시도
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 마크다운 코드블록 제거 시도
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        try:
            return json.loads(text.strip())
        except json.JSONDecodeError as e:
            return {
                "error": f"JSON 파싱 실패: {e}",
                "raw_response": response_text[:500],
                "rows": [],
                "page_info": {"visible_rows": 0}
            }

    def extract_from_image(self, image_path: str) -> Dict[str, Any]:
        """
        단일 이미지에서 테이블 데이터 추출

        Args:
            image_path: 이미지 파일 경로

        Returns:
            추출된 데이터 (rows, page_info 포함)
        """
        try:
            image_data = self._encode_image(image_path)
            media_type = self._get_media_type(image_path)

            message = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=self.SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data,
                                },
                            },
                            {
                                "type": "text",
                                "text": self.TABLE_EXTRACTION_PROMPT,
                            },
                        ],
                    }
                ],
            )

            response_text = message.content[0].text
            result = self._parse_response(response_text)
            result["source_image"] = image_path

            return result

        except anthropic.APIError as e:
            return {
                "error": f"API 오류: {e}",
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
            }
        except Exception as e:
            return {
                "error": f"추출 실패: {e}",
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
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
            progress_callback: 진행 상황 콜백 (현재 인덱스, 총 개수)

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
