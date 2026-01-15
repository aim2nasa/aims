"""
pdfplumber 기반 AR 파서

특징:
- 로컬 실행 (API 호출 없음)
- 무료
- 평균 0.93초/건 (OpenAI 대비 80배 빠름)
"""

import os
import re
import logging
from typing import Dict, List, Optional

import pdfplumber

from services.parser_interface import (
    normalize_contract,
    create_error_result,
    create_success_result
)

logger = logging.getLogger(__name__)


def extract_total_premium(text: str) -> Optional[int]:
    """
    텍스트에서 총 월보험료 추출

    패턴 예시:
    - "현재 납입중인 월 보험료는 총 1,809,150원 입니다"
    - "월보험료는 총 1,809,150원"

    Args:
        text: PDF 페이지 텍스트

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


def parse_table_row(row: List, headers: List[str]) -> Optional[Dict]:
    """
    표의 한 행을 파싱

    Args:
        row: 행 데이터 리스트
        headers: 헤더 리스트

    Returns:
        계약 정보 딕셔너리 또는 None
    """
    if not row or not row[0]:
        return None

    # 순번이 숫자인지 확인 (데이터 행 판별)
    try:
        seq = int(str(row[0]).strip())
    except (ValueError, TypeError):
        return None

    contract = {}
    for j, val in enumerate(row):
        if j < len(headers) and headers[j]:
            key = str(headers[j]).replace("\n", "").strip()
            contract[key] = str(val).strip() if val else ""

    return normalize_contract(contract)


def find_header_row(table: List[List]) -> Optional[int]:
    """
    표에서 헤더 행 찾기

    Args:
        table: 표 데이터 (2D 리스트)

    Returns:
        헤더 행 인덱스 또는 None
    """
    for i, row in enumerate(table):
        if row and any("증권번호" in str(cell) for cell in row if cell):
            return i
    return None


def parse_annual_report(
    pdf_path: str,
    customer_name: Optional[str] = None,
    end_page: Optional[int] = None
) -> Dict:
    """
    pdfplumber로 AR PDF 파싱

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (미사용, 인터페이스 호환성)
        end_page: 마지막 페이지 (미사용, 인터페이스 호환성)

    Returns:
        파싱 결과 딕셔너리:
        {
            "총_월보험료": int,
            "보유계약 현황": [...],
            "부활가능 실효계약": [...]
        }
        또는
        {
            "error": str,
            "raw_output": str
        }
    """
    logger.info(f"📄 pdfplumber 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        return create_error_result(f"파일이 존재하지 않음: {pdf_path}")

    try:
        contracts = []
        lapsed_contracts = []
        total_premium = None
        current_section = "보유계약"  # "보유계약" 또는 "부활가능"

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # 텍스트 추출
                text = page.extract_text() or ""

                # 총 월보험료 추출 (첫 페이지에서 주로 발견)
                if total_premium is None:
                    total_premium = extract_total_premium(text)
                    if total_premium:
                        logger.info(f"✅ 총 월보험료 추출: {total_premium:,}원")

                # 섹션 판별
                if "부활가능" in text or "실효계약" in text:
                    current_section = "부활가능"

                # 표 추출
                tables = page.extract_tables()

                for table in tables:
                    if not table:
                        continue

                    # 헤더 찾기
                    header_idx = find_header_row(table)
                    if header_idx is None:
                        continue

                    headers = [str(h).strip() if h else "" for h in table[header_idx]]

                    # 데이터 행 파싱
                    for row in table[header_idx + 1:]:
                        contract = parse_table_row(row, headers)
                        if contract:
                            if current_section == "부활가능":
                                lapsed_contracts.append(contract)
                            else:
                                contracts.append(contract)

        logger.info(
            f"✅ pdfplumber 파싱 완료: "
            f"계약 {len(contracts)}건, 부활가능 {len(lapsed_contracts)}건, "
            f"총월보험료 {total_premium:,}원" if total_premium else f"총월보험료 추출실패"
        )

        return create_success_result(
            total_premium=total_premium,
            contracts=contracts,
            lapsed_contracts=lapsed_contracts
        )

    except Exception as e:
        logger.error(f"❌ pdfplumber 파싱 중 오류: {e}")
        return create_error_result(f"파싱 실패: {str(e)}")
