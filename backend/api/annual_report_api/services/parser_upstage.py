"""
Upstage Document AI 기반 AR 파서

특징:
- 클라우드 API (Document Parse API)
- 한국어 문서 최적화
- 평균 5.89초/건

디스크 캐시 (Phase 4-C):
- `{pdf_path}.upstage.json` 에 API 응답을 캐시
- 동일 PDF 재파싱 시 Upstage API 호출을 스킵 (비용/시간 절약)
- 캐시 무효화: 파일 크기 or mtime이 달라지면 캐시 재생성
- 파싱 로직만 변경되는 경우에도 캐시 재사용 가능하도록 "원본 API 응답(JSON)"을 저장
"""

import json
import logging
import os
import re
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from services.parser_interface import create_error_result, create_success_result, normalize_contract

logger = logging.getLogger(__name__)

UPSTAGE_API_URL = "https://api.upstage.ai/v1/document-ai/document-parse"

# 디스크 캐시 버전: 캐시 포맷이 바뀔 때 증가시켜 과거 캐시를 자동 무효화
_CACHE_FORMAT_VERSION = 1


def _cache_path(pdf_path: str) -> str:
    """PDF 경로에 대응하는 Upstage 캐시 파일 경로."""
    return f"{pdf_path}.upstage.json"


def _load_cached_response(pdf_path: str) -> Optional[Dict]:
    """
    디스크 캐시에서 Upstage API 응답을 로드.

    캐시 유효 조건:
    - 캐시 파일 존재
    - 포맷 버전 일치
    - 원본 PDF의 size, mtime이 캐시 기록과 일치

    Returns:
        캐시 유효 시 원본 API 응답(dict), 아니면 None
    """
    cache_file = _cache_path(pdf_path)
    if not os.path.exists(cache_file):
        return None

    try:
        src_stat = os.stat(pdf_path)
        with open(cache_file, "r", encoding="utf-8") as f:
            cached = json.load(f)

        if cached.get("format_version") != _CACHE_FORMAT_VERSION:
            logger.info(
                f"💾 Upstage 캐시 버전 불일치, 재생성: {os.path.basename(pdf_path)}"
            )
            return None

        if (
            cached.get("source_size") != src_stat.st_size
            or cached.get("source_mtime") != src_stat.st_mtime
        ):
            logger.info(
                f"💾 Upstage 캐시 무효 (파일 변경됨), 재생성: {os.path.basename(pdf_path)}"
            )
            return None

        response = cached.get("response")
        if not isinstance(response, dict):
            logger.warning(
                f"⚠️ Upstage 캐시 손상 (response 없음), 재생성: {os.path.basename(pdf_path)}"
            )
            return None

        return response

    except (OSError, json.JSONDecodeError) as e:
        logger.warning(
            f"⚠️ Upstage 캐시 읽기 실패, 재생성: "
            f"{os.path.basename(pdf_path)} — {type(e).__name__}: {e}"
        )
        return None


def _save_cached_response(pdf_path: str, response: Dict) -> None:
    """
    Upstage API 응답을 디스크 캐시에 저장.

    실패는 WARN만 남기고 계속 진행 (파싱 결과 반환을 막지 않음).
    """
    cache_file = _cache_path(pdf_path)
    try:
        src_stat = os.stat(pdf_path)
        payload = {
            "format_version": _CACHE_FORMAT_VERSION,
            # PII 보호: 절대 경로에 고객명이 포함될 수 있으므로 basename만 저장
            "source_path": os.path.basename(pdf_path),
            "source_size": src_stat.st_size,
            "source_mtime": src_stat.st_mtime,
            "response": response,
        }
        # 원자적 쓰기: 임시 파일 → rename
        tmp_file = cache_file + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp_file, cache_file)
        logger.info(f"💾 Upstage 응답 캐시 저장: {os.path.basename(cache_file)}")
    except OSError as e:
        logger.warning(
            f"⚠️ Upstage 캐시 저장 실패 (무시하고 계속): "
            f"{os.path.basename(pdf_path)} — {type(e).__name__}: {e}"
        )


def _call_upstage_api(pdf_path: str, api_key: str) -> Dict:
    """
    Upstage Document Parse API를 호출하고 원본 JSON 응답을 반환.

    예외는 상위 parse_annual_report에서 처리.
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    with open(pdf_path, "rb") as f:
        files = {"document": f}
        data = {"output_formats": "['text', 'html']"}
        response = requests.post(
            UPSTAGE_API_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=60,
        )

    if response.status_code != 200:
        # 상위에서 create_error_result로 감쌀 수 있도록 raise
        raise requests.exceptions.HTTPError(
            f"Upstage API 오류: {response.status_code}",
            response=response,
        )

    return response.json()


def extract_total_premium(text: str) -> Optional[int]:
    """
    텍스트에서 총 월보험료 추출

    Args:
        text: 문서 텍스트

    Returns:
        총 월보험료 (정수) 또는 None
    """
    patterns = [
        r'월\s*보험료는\s*총\s*([\d,]+)\s*원',
        r'월\s*보험료\s*총\s*([\d,]+)\s*원',
        r'총\s*월\s*보험료\s*([\d,]+)\s*원',
        r'납입중인\s*월\s*보험료.*?([\d,]+)\s*원',
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return int(match.group(1).replace(",", ""))
            except (ValueError, TypeError):
                continue

    return None


def parse_html_table(html: str) -> List[Dict]:
    """
    HTML에서 표 파싱

    Args:
        html: HTML 문자열

    Returns:
        계약 정보 리스트
    """
    contracts = []

    try:
        soup = BeautifulSoup(html, 'html.parser')
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')
            if not rows:
                continue

            # 헤더 찾기
            header_idx = None
            for i, row in enumerate(rows):
                if "증권번호" in row.get_text():
                    header_idx = i
                    break

            if header_idx is None:
                continue

            # 헤더 추출
            header_row = rows[header_idx]
            headers = [cell.get_text().strip() for cell in header_row.find_all(['th', 'td'])]

            # 데이터 행 파싱
            for row in rows[header_idx + 1:]:
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue

                # 순번 확인
                try:
                    int(cells[0].get_text().strip())  # 순번 확인
                except (ValueError, TypeError):
                    continue

                contract = {}
                for j, cell in enumerate(cells):
                    if j < len(headers) and headers[j]:
                        contract[headers[j]] = cell.get_text().strip()

                normalized = normalize_contract(contract)
                if normalized:
                    contracts.append(normalized)

    except Exception as e:
        logger.error(f"HTML 테이블 파싱 오류: {e}")

    return contracts


def parse_annual_report(
    pdf_path: str,
    customer_name: Optional[str] = None,
    end_page: Optional[int] = None,
    has_cover: bool = True
) -> Dict:
    """
    Upstage Document AI로 AR PDF 파싱

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (미사용, 인터페이스 호환성)
        end_page: 마지막 페이지 (미사용, 인터페이스 호환성)
        has_cover: 표지 유무 (미사용, 인터페이스 호환성)

    Returns:
        파싱 결과 딕셔너리
    """
    logger.info(f"📄 Upstage 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        return create_error_result(f"파일이 존재하지 않음: {pdf_path}")

    try:
        # 🔑 Phase 4-C: 디스크 캐시 확인 (API 호출 스킵)
        cached_response = _load_cached_response(pdf_path)
        if cached_response is not None:
            logger.info(
                f"💾 Upstage 캐시 히트: {os.path.basename(pdf_path)} (API 호출 스킵)"
            )
            result = cached_response
        else:
            api_key = os.getenv("UPSTAGE_API_KEY")
            if not api_key:
                return create_error_result(
                    "UPSTAGE_API_KEY 환경변수가 설정되지 않았습니다"
                )

            result = _call_upstage_api(pdf_path, api_key)

            # 성공 응답만 캐시에 저장
            _save_cached_response(pdf_path, result)

        # HTML에서 표 파싱
        html_content = result.get("content", {}).get("html", "")
        contracts = parse_html_table(html_content)

        # 텍스트에서 총 월보험료 추출
        text_content = result.get("content", {}).get("text", "")
        total_premium = extract_total_premium(text_content)

        # 부활가능 실효계약 분리 (현재는 미구현, 필요시 추가)
        lapsed_contracts = []

        if total_premium is not None:
            logger.info(
                f"✅ Upstage 파싱 완료: 계약 {len(contracts)}건, "
                f"총월보험료 {total_premium:,}원"
            )
        else:
            logger.info(
                f"✅ Upstage 파싱 완료: 계약 {len(contracts)}건, "
                f"총월보험료 추출실패"
            )

        return create_success_result(
            total_premium=total_premium,
            contracts=contracts,
            lapsed_contracts=lapsed_contracts
        )

    except requests.exceptions.Timeout:
        return create_error_result("Upstage API 타임아웃 (60초)")

    except requests.exceptions.HTTPError as e:
        resp = getattr(e, "response", None)
        status = resp.status_code if resp is not None else "unknown"
        raw = resp.text[:500] if resp is not None else ""
        logger.error(f"❌ Upstage API HTTP 오류: {status}")
        return create_error_result(
            f"Upstage API 오류: {status}",
            raw_output=raw,
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Upstage API 요청 오류: {e}")
        return create_error_result(f"API 요청 실패: {str(e)}")

    except Exception as e:
        logger.error(f"❌ Upstage 파싱 중 오류: {e}")
        return create_error_result(f"파싱 실패: {str(e)}")
