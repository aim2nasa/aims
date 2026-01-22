"""
Upstage Information Extract API 연동 모듈
스키마 기반으로 테이블 데이터를 정확하게 추출

비용: $0.04/페이지 (Document Parse $0.01의 4배)
장점: 스키마 기반 추출로 셀 경계 오인식 문제 해결
"""
import os
import json
import base64
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx


class UpstageIEExtractor:
    """Upstage Information Extract API를 사용한 테이블 데이터 추출기

    스키마 기반 추출:
    - JSON 스키마로 원하는 필드 정의
    - 테이블의 여러 행을 배열로 추출
    - 템플릿/훈련 불필요
    """

    # Information Extract API (OpenAI Chat Completion 형식)
    API_URL = "https://api.upstage.ai/v1/information-extraction"

    # MetLife 계약 테이블 스키마
    CONTRACT_SCHEMA = {
        "type": "object",
        "properties": {
            "contracts": {
                "type": "array",
                "description": "계약 목록 테이블의 각 행",
                "items": {
                    "type": "object",
                    "properties": {
                        "순번": {
                            "type": "integer",
                            "description": "행 번호"
                        },
                        "계약일": {
                            "type": "string",
                            "description": "계약 날짜 (YYYY-MM-DD 형식)"
                        },
                        "계약자": {
                            "type": "string",
                            "description": "계약자 이름"
                        },
                        "생년월일": {
                            "type": "string",
                            "description": "생년월일 (YYMMDD 형식)"
                        },
                        "성별": {
                            "type": "string",
                            "description": "성별 (남/여)"
                        },
                        "지역": {
                            "type": "string",
                            "description": "지역 (예: 서울 강남구, 경기 고양시)"
                        },
                        "피보험자": {
                            "type": "string",
                            "description": "피보험자 이름"
                        },
                        "증권번호": {
                            "type": "string",
                            "description": "10자리 증권번호"
                        },
                        "보험상품": {
                            "type": "string",
                            "description": "보험 상품명"
                        },
                        "통화": {
                            "type": "string",
                            "description": "통화 (KRW, USD, EUR, JPY)"
                        },
                        "월납입보험료": {
                            "type": "integer",
                            "description": "월 납입 보험료 (숫자만)"
                        },
                        "상태": {
                            "type": "string",
                            "description": "계약 상태 (정상, 만기, 해지 등)"
                        },
                        "수금방법": {
                            "type": "string",
                            "description": "수금 방법 (자동이체, 직납, 지로 등)"
                        },
                        "납입상태": {
                            "type": "string",
                            "description": "납입 상태 (납입중, 납입완료 등)"
                        },
                        "전자청약": {
                            "type": "string",
                            "description": "전자청약 여부 (Y/N)"
                        },
                        "모집이양": {
                            "type": "string",
                            "description": "모집/이양 구분 (모집, 이양)"
                        },
                        "신탁": {
                            "type": "string",
                            "description": "신탁 여부 (Y/N)"
                        }
                    },
                    "required": ["순번", "계약자", "증권번호"]
                }
            }
        },
        "required": ["contracts"]
    }

    def __init__(self, api_key: Optional[str] = None, timeout: float = 120.0, debug: bool = False):
        self.api_key = api_key or os.environ.get("UPSTAGE_API_KEY")
        if not self.api_key:
            raise ValueError("UPSTAGE_API_KEY 환경변수 또는 api_key 파라미터 필요")
        self.timeout = timeout
        self.debug = debug

    def _encode_image(self, image_path: str) -> str:
        """이미지를 base64로 인코딩"""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    def _get_mime_type(self, image_path: str) -> str:
        """이미지 MIME 타입 반환"""
        suffix = Path(image_path).suffix.lower()
        return {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".pdf": "application/pdf",
        }.get(suffix, "application/octet-stream")

    def _call_ie_api(self, image_path: str) -> Dict[str, Any]:
        """Information Extract API 호출"""
        try:
            image_data = self._encode_image(image_path)
            mime_type = self._get_mime_type(image_path)

            # OpenAI Chat Completion 형식
            request_body = {
                "model": "information-extract",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_data}"
                                }
                            }
                        ]
                    }
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "metlife_contracts",
                        "schema": self.CONTRACT_SCHEMA
                    }
                }
            }

            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    self.API_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json=request_body
                )

                if response.status_code != 200:
                    error_detail = ""
                    try:
                        error_data = response.json()
                        error_detail = error_data.get("error", {}).get("message", "")
                    except Exception:
                        error_detail = response.text[:200]
                    return {
                        "error": True,
                        "status": response.status_code,
                        "message": f"API 오류: HTTP {response.status_code} - {error_detail}",
                    }

                data = response.json()

                if self.debug:
                    debug_path = Path(image_path).with_suffix(".ie_response.json")
                    with open(debug_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"[DEBUG] API 응답 저장: {debug_path}")

                return {
                    "error": False,
                    "status": 200,
                    "data": data
                }

        except httpx.TimeoutException:
            return {"error": True, "status": 504, "message": "처리 시간 초과"}
        except Exception as e:
            return {"error": True, "status": 500, "message": f"처리 실패: {str(e)}"}

    def _parse_response(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """API 응답에서 계약 데이터 추출"""
        try:
            # OpenAI 형식: choices[0].message.content
            choices = data.get("choices", [])
            if not choices:
                return []

            content = choices[0].get("message", {}).get("content", "")
            if not content:
                return []

            # JSON 파싱
            parsed = json.loads(content)
            contracts = parsed.get("contracts", [])

            return contracts

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"[ERROR] 응답 파싱 실패: {e}")
            return []

    def extract_from_image(self, image_path: str) -> Dict[str, Any]:
        """단일 이미지에서 테이블 데이터 추출"""
        api_result = self._call_ie_api(image_path)

        if api_result.get("error"):
            print(f"[ERROR] API 오류: {api_result.get('message')}")
            return {
                "error": api_result.get("message"),
                "source_image": image_path,
                "rows": [],
                "page_info": {"visible_rows": 0},
            }

        data = api_result.get("data", {})
        rows = self._parse_response(data)

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
