"""
pdfplumber 기반 AR 파서

특징:
- 로컬 실행 (API 호출 없음)
- 무료
- 평균 0.93초/건 (OpenAI 대비 80배 빠름)
"""

import logging
import os
import re
from typing import Dict, List, Optional

import pdfplumber
from services.parser_interface import create_error_result, create_success_result, normalize_contract

logger = logging.getLogger(__name__)


def extract_total_premium(text: str) -> Optional[int]:
    """
    텍스트에서 총 월보험료 추출

    패턴 예시:
    - "현재 납입중인 월 보험료는 총 1,809,150원 입니다"
    - "1,809,150\n현재 납입중인 월 보험료는 총 원 입니다" (줄바꿈된 경우)

    Args:
        text: PDF 페이지 텍스트

    Returns:
        총 월보험료 (정수) 또는 None
    """
    # 줄바꿈을 공백으로 대체하여 한 줄로 만듦
    text_single_line = re.sub(r'\s+', ' ', text)

    patterns = [
        r'월\s*보험료는\s*총\s*([\d,]+)\s*원',
        r'월\s*보험료\s*총\s*([\d,]+)\s*원',
        r'총\s*월\s*보험료\s*([\d,]+)\s*원',
        r'납입중인\s*월\s*보험료.*?([\d,]+)\s*원',
    ]

    for pattern in patterns:
        match = re.search(pattern, text_single_line)
        if match:
            try:
                return int(match.group(1).replace(",", ""))
            except (ValueError, TypeError):
                continue

    # 특수 패턴: "N\n현재 납입중인 월 보험료는 총 원" (숫자가 앞줄에 있는 경우)
    special_match = re.search(r'([\d,]+)\s*현재\s*납입중인\s*월\s*보험료는\s*총\s*원', text_single_line)
    if special_match:
        try:
            return int(special_match.group(1).replace(",", ""))
        except (ValueError, TypeError):
            pass

    return None


def is_korean(char: str) -> bool:
    """한글 문자인지 확인"""
    if not char:
        return False
    code = ord(char)
    # 한글 유니코드 범위: 가-힣 (0xAC00-0xD7A3), ㄱ-ㅎ (0x3131-0x314E), ㅏ-ㅣ (0x314F-0x3163)
    return (0xAC00 <= code <= 0xD7A3) or (0x3131 <= code <= 0x3163)


def smart_join_lines(text: str) -> str:
    """
    줄바꿈을 스마트하게 처리
    - 한글-한글 사이: 공백 없이 연결 (예: "캐치업\\n코리아" → "캐치업코리아")
    - 그 외: 공백으로 연결
    """
    if not text:
        return ""

    lines = text.split("\n")
    if len(lines) == 1:
        return text.strip()

    result = []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        if result:
            prev_char = result[-1][-1] if result[-1] else ""
            curr_char = line[0] if line else ""

            # 한글-한글 사이는 공백 없이 연결
            if is_korean(prev_char) and is_korean(curr_char):
                result.append(line)
            else:
                result.append(" " + line)
        else:
            result.append(line)

    return "".join(result).strip()


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
        int(str(row[0]).strip())  # 순번이 숫자인지 확인
    except (ValueError, TypeError):
        return None

    contract = {}
    for j, val in enumerate(row):
        if j < len(headers) and headers[j]:
            key = str(headers[j]).replace("\n", "").strip()
            # 셀 내 줄바꿈을 스마트하게 처리 (한글은 공백 없이 연결)
            if val:
                val_str = smart_join_lines(str(val))
                # 연속 공백 제거
                val_str = " ".join(val_str.split())
                contract[key] = val_str
            else:
                contract[key] = ""

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


def is_lapsed_contract_table(table: List[List]) -> bool:
    """
    테이블이 부활가능 실효계약 테이블인지 판별

    Args:
        table: 표 데이터

    Returns:
        부활가능 실효계약 테이블이면 True
    """
    if not table:
        return False

    # 첫 몇 행에서 "부활가능" 또는 "실효계약" 확인
    for row in table[:3]:
        if row:
            row_text = " ".join(str(cell) for cell in row if cell)
            if "부활가능" in row_text or "실효계약" in row_text:
                return True
    return False


def parse_annual_report(
    pdf_path: str,
    customer_name: Optional[str] = None,
    end_page: Optional[int] = None,
    has_cover: bool = True
) -> Dict:
    """
    pdfplumber로 AR PDF 파싱

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (미사용, 인터페이스 호환성)
        end_page: 마지막 페이지 (미사용, 인터페이스 호환성)
        has_cover: 표지 유무 (미사용, 인터페이스 호환성)

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

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # 텍스트 추출
                text = page.extract_text() or ""

                # 총 월보험료 추출 (첫 페이지에서 주로 발견)
                if total_premium is None:
                    total_premium = extract_total_premium(text)
                    if total_premium:
                        logger.info(f"✅ 총 월보험료 추출: {total_premium:,}원")

                # 표 추출 (여러 설정 시도)
                table_settings_list = [
                    # 설정 1: 기본 lines 전략
                    {
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "snap_tolerance": 3,
                        "join_tolerance": 3,
                    },
                    # 설정 2: text 전략 (백업)
                    {
                        "vertical_strategy": "text",
                        "horizontal_strategy": "lines",
                        "snap_tolerance": 5,
                        "join_tolerance": 5,
                        "text_tolerance": 3,
                    },
                ]

                all_tables = []
                for settings in table_settings_list:
                    try:
                        tables = page.extract_tables(settings)
                        if tables:
                            all_tables.extend(tables)
                            break  # 첫 번째 성공한 설정 사용
                    except Exception:
                        continue

                tables = all_tables

                for table in tables:
                    if not table:
                        continue

                    # 헤더 찾기
                    header_idx = find_header_row(table)
                    if header_idx is None:
                        continue

                    # 테이블별 섹션 판별 (페이지 텍스트가 아닌 테이블 자체에서)
                    is_lapsed = is_lapsed_contract_table(table)

                    headers = [str(h).strip() if h else "" for h in table[header_idx]]

                    # 데이터 행 파싱
                    for row in table[header_idx + 1:]:
                        contract = parse_table_row(row, headers)
                        if contract:
                            if is_lapsed:
                                lapsed_contracts.append(contract)
                            else:
                                contracts.append(contract)

        logger.info(
            f"✅ pdfplumber 파싱 완료: "
            f"계약 {len(contracts)}건, 부활가능 {len(lapsed_contracts)}건, "
            f"총월보험료 {total_premium:,}원" if total_premium is not None else "총월보험료 추출실패"
        )

        return create_success_result(
            total_premium=total_premium,
            contracts=contracts,
            lapsed_contracts=lapsed_contracts
        )

    except Exception as e:
        logger.error(f"❌ pdfplumber 파싱 중 오류: {e}")
        return create_error_result(f"파싱 실패: {str(e)}")
