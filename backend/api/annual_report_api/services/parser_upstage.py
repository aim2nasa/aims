"""
Upstage Document AI 기반 AR 파서

특징:
- 클라우드 API (Document Parse API)
- 한국어 문서 최적화
- 평균 5.89초/건
"""

import logging
import os
import re
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from services.parser_interface import create_error_result, create_success_result, normalize_contract

logger = logging.getLogger(__name__)

UPSTAGE_API_URL = "https://api.upstage.ai/v1/document-ai/document-parse"


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
    end_page: Optional[int] = None
) -> Dict:
    """
    Upstage Document AI로 AR PDF 파싱

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (미사용, 인터페이스 호환성)
        end_page: 마지막 페이지 (미사용, 인터페이스 호환성)

    Returns:
        파싱 결과 딕셔너리
    """
    logger.info(f"📄 Upstage 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        return create_error_result(f"파일이 존재하지 않음: {pdf_path}")

    api_key = os.getenv("UPSTAGE_API_KEY")
    if not api_key:
        return create_error_result("UPSTAGE_API_KEY 환경변수가 설정되지 않았습니다")

    try:
        # Upstage API 호출
        headers = {"Authorization": f"Bearer {api_key}"}

        with open(pdf_path, 'rb') as f:
            files = {"document": f}
            data = {"output_formats": "['text', 'html']"}

            response = requests.post(
                UPSTAGE_API_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )

        if response.status_code != 200:
            return create_error_result(
                f"Upstage API 오류: {response.status_code}",
                raw_output=response.text[:500]
            )

        result = response.json()

        # HTML에서 표 파싱
        html_content = result.get("content", {}).get("html", "")
        contracts = parse_html_table(html_content)

        # 텍스트에서 총 월보험료 추출
        text_content = result.get("content", {}).get("text", "")
        total_premium = extract_total_premium(text_content)

        # 부활가능 실효계약 분리 (현재는 미구현, 필요시 추가)
        lapsed_contracts = []

        logger.info(
            f"✅ Upstage 파싱 완료: "
            f"계약 {len(contracts)}건, "
            f"총월보험료 {total_premium:,}원" if total_premium is not None else "총월보험료 추출실패"
        )

        return create_success_result(
            total_premium=total_premium,
            contracts=contracts,
            lapsed_contracts=lapsed_contracts
        )

    except requests.exceptions.Timeout:
        return create_error_result("Upstage API 타임아웃 (60초)")

    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Upstage API 요청 오류: {e}")
        return create_error_result(f"API 요청 실패: {str(e)}")

    except Exception as e:
        logger.error(f"❌ Upstage 파싱 중 오류: {e}")
        return create_error_result(f"파싱 실패: {str(e)}")
