"""
Customer Review Service PDF Parser (pdfplumber 기반)

메트라이프 변액보험 리뷰 리포트 PDF 파서
OpenAI API 대신 pdfplumber를 사용하여 빠르고 비용 없이 파싱

주요 기능:
- 계약정보 추출 (증권번호, 계약일자, 적립금, 투자수익률 등)
- 납입원금 추출 (기본보험료, 추가납입, 중도출금 등)
- 펀드 구성 현황 추출 (펀드명, 적립금, 구성비율, 수익률, 투입원금)
"""

import pdfplumber
import re
import os
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict

from system_logger import send_error_log

logger = logging.getLogger(__name__)


# 펀드명 순서 (고정)
FUND_GROUPS = [
    ['가치주식형', '성장주식형', '인덱스주식형', '글로벌ESG주식형', '미국주식형'],
    ['글로벌주식형', '아시아주식형', '유럽주식형', '브릭스주식형', '채권형'],
    ['글로벌채권형', '배당주식형', '골드투자형', '글로벌고배당주식형', '글로벌하이일드채권형'],
    ['글로벌멀티인컴', 'MMF형', '안정포트폴리오형', '중립포트폴리오형', '적극포트폴리오형'],
    ['달러단기채권형', '미국채권형', '글로벌IT섹터', '글로벌헬스케어섹터', '글로벌미디어커뮤니케이션섹터'],
    ['중국주식형', '성장주식형2호', '가치주식형2호', '인덱스주식형2호', '미국주식형3호'],
    ['배당주식형2호'],
]

# 플랫 펀드 리스트 (순서대로)
FLAT_FUND_LIST = [fund for group in FUND_GROUPS for fund in group]


def parse_number(value) -> int:
    """숫자 문자열을 정수로 변환"""
    if not value:
        return 0
    cleaned = re.sub(r'[^\d]', '', str(value))
    try:
        return int(cleaned) if cleaned else 0
    except ValueError:
        return 0


def parse_float(value) -> float:
    """숫자 문자열을 실수로 변환"""
    if not value:
        return 0.0
    cleaned = re.sub(r'[^\d.-]', '', str(value))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def extract_contract_info(text: str) -> Dict:
    """
    페이지 2 텍스트에서 계약정보 추출

    Returns:
        dict: contract_info 형식
    """
    info = {
        "policy_number": "",
        "contract_date": "",
        "insured_amount": 0,
        "accumulated_amount": 0,
        "investment_return_rate": 0.0,
        "surrender_value": 0,
        "surrender_rate": 0.0,
        "accumulation_rate": 0.0,
        "monthly_premium": 0
    }

    # 증권번호 (10-11자리 숫자)
    policy_match = re.search(r'(\d{10,11})', text)
    if policy_match:
        info["policy_number"] = policy_match.group(1)

    # 계약일자: "2013년 11월 12일" → "2013-11-12"
    contract_date_match = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', text)
    if contract_date_match:
        info["contract_date"] = f"{contract_date_match.group(1)}-{contract_date_match.group(2).zfill(2)}-{contract_date_match.group(3).zfill(2)}"

    # 보험가입금액
    insured_match = re.search(r'보험가입금액\s*[:\s]*([\d,]+)', text)
    if insured_match:
        info["insured_amount"] = parse_number(insured_match.group(1))

    # 적립금
    accumulated_match = re.search(r'[·\s]적립금\s*[:\s]*([\d,]+)', text)
    if accumulated_match:
        info["accumulated_amount"] = parse_number(accumulated_match.group(1))

    # 투자수익률
    return_match = re.search(r'투자수익률\s*[:\s]*([\d.]+)\s*[％%]', text)
    if return_match:
        info["investment_return_rate"] = parse_float(return_match.group(1))

    # 해지환급금
    surrender_match = re.search(r'해지환급금[^:]*[:\s]*([\d,]+)', text)
    if surrender_match:
        info["surrender_value"] = parse_number(surrender_match.group(1))

    # 해지환급율
    surrender_rate_match = re.search(r'해지환급율\s*[:\s]*([\d.]+)\s*[％%]', text)
    if surrender_rate_match:
        info["surrender_rate"] = parse_float(surrender_rate_match.group(1))

    # 적립금비율
    acc_rate_match = re.search(r'적립금비율[^:]*[:\s]*([\d.]+)\s*[％%]', text)
    if acc_rate_match:
        info["accumulation_rate"] = parse_float(acc_rate_match.group(1))

    # 월납보험료
    monthly_match = re.search(r'보험료\s*[:\s]*([\d,]+)\s*원', text)
    if monthly_match:
        info["monthly_premium"] = parse_number(monthly_match.group(1))

    return info


def extract_premium_info(text: str) -> Dict:
    """
    페이지 2 텍스트에서 납입원금 정보 추출

    Returns:
        dict: premium_info 형식
    """
    info = {
        "basic_premium": 0,
        "additional_premium": 0,      # 수시추가납(B)
        "regular_additional": 0,       # 정기추가납(C)
        "withdrawal": 0,               # 중도출금(D)
        "net_premium": 0,              # 계(A+B+C-D)
        "policy_loan": 0               # 약관대출
    }

    # 기본보험료(A)
    basic_match = re.search(r'기본\s*보험료\s*\(A\)[^0-9]*([\d,]+)', text)
    if basic_match:
        info["basic_premium"] = parse_number(basic_match.group(1))

    # 수시추가납(B)
    irregular_match = re.search(r'수시추가납\s*보험료\s*\(B\)[^0-9]*([\d,]+)', text)
    if irregular_match:
        info["additional_premium"] = parse_number(irregular_match.group(1))

    # 정기추가납(C)
    regular_match = re.search(r'정기추가납\s*보험료\s*\(C\)[^0-9]*([\d,]+)', text)
    if regular_match:
        info["regular_additional"] = parse_number(regular_match.group(1))

    # 중도출금(D)
    withdrawal_match = re.search(r'중도출금\s*\(D\)[^0-9]*([\d,]+)', text)
    if withdrawal_match:
        info["withdrawal"] = parse_number(withdrawal_match.group(1))

    # 계(A+B+C-D)
    total_match = re.search(r'계\s*\(A\+B\+C-D\)[^0-9]*([\d,]+)', text)
    if total_match:
        info["net_premium"] = parse_number(total_match.group(1))

    # 약관대출
    loan_match = re.search(r'약관대출[^0-9]*([\d,]+)', text)
    if loan_match:
        info["policy_loan"] = parse_number(loan_match.group(1))

    return info


def find_fund_data_in_table(table: list, start_fund_idx: int = 0, verbose: bool = False) -> Tuple[Dict[str, dict], int]:
    """
    테이블에서 펀드 데이터 찾기 (위치 기반)

    Args:
        table: 테이블 데이터
        start_fund_idx: 시작 펀드 인덱스 (이전 테이블에서 이어받음)
        verbose: 상세 출력 여부

    Returns:
        (fund_data, next_fund_idx): 펀드 데이터와 다음 시작 인덱스
    """
    fund_data = {}
    current_fund_idx = start_fund_idx

    row_idx = 0
    while row_idx < len(table):
        row = table[row_idx]
        if not row:
            row_idx += 1
            continue

        # 펀드 헤더 행 찾기: "기본납입"과 "추가납입"이 있는 행
        is_header = False
        header_cols = []
        for col_idx, cell in enumerate(row):
            if cell and '기본' in str(cell) and '납입' in str(cell):
                is_header = True
                header_cols.append(col_idx)

        if is_header and len(header_cols) >= 2:
            # 현재 펀드 그룹 (5개 펀드씩)
            group_idx = current_fund_idx // 5
            if group_idx >= len(FUND_GROUPS):
                row_idx += 1
                continue

            current_funds = FUND_GROUPS[group_idx]

            if verbose:
                logger.debug(f"  [Table] Fund group {group_idx + 1} (idx={current_fund_idx}) at row {row_idx}: {current_funds}")

            # 데이터 행 파싱 (헤더 다음 4-5행)
            for data_offset in range(1, 6):
                data_row_idx = row_idx + data_offset
                if data_row_idx >= len(table):
                    break

                data_row = table[data_row_idx]
                if not data_row:
                    continue

                # 다음 펀드 그룹 헤더인지 확인
                is_next_header = False
                for cell in data_row:
                    if cell and '기본' in str(cell) and '납입' in str(cell):
                        row_text = ' '.join(str(c) for c in data_row if c)
                        if '추가' in row_text and '현재' not in str(cell) and '투입비율' not in str(cell):
                            is_next_header = True
                            break

                if is_next_header:
                    break

                # 행 유형 판단
                row_type = None
                for cell in data_row[:3]:
                    if not cell:
                        continue
                    cell_str = str(cell)
                    if '금액' in cell_str and '투입' not in cell_str:
                        row_type = 'amount'
                        break
                    elif '구성비율' in cell_str:
                        row_type = 'ratio'
                        break
                    elif '수익률' in cell_str and '투자' not in cell_str:
                        row_type = 'return'
                        break
                    elif '투입원금' in cell_str:
                        row_type = 'principal'
                        break

                if not row_type:
                    continue

                # 각 펀드의 데이터 추출
                for fund_offset, fund_name in enumerate(current_funds):
                    # 열 인덱스: 2 + (펀드_오프셋 * 2) for 기본납입
                    basic_col = 2 + (fund_offset * 2)
                    additional_col = basic_col + 1

                    if basic_col >= len(data_row):
                        continue

                    if fund_name not in fund_data:
                        fund_data[fund_name] = {
                            'amount': 0, 'additional_amount': 0,
                            'ratio': 0.0, 'additional_ratio': 0.0,
                            'return': 0.0, 'additional_return': 0.0,
                            'principal': 0, 'additional_principal': 0
                        }

                    cell_val = data_row[basic_col]
                    additional_val = data_row[additional_col] if additional_col < len(data_row) else None

                    if row_type == 'amount':
                        if cell_val:
                            val = parse_number(cell_val)
                            if val > 0:
                                fund_data[fund_name]['amount'] = val
                        if additional_val:
                            val = parse_number(additional_val)
                            if val > 0:
                                fund_data[fund_name]['additional_amount'] = val
                    elif row_type == 'ratio':
                        if cell_val:
                            val = parse_float(cell_val)
                            if val > 0:
                                fund_data[fund_name]['ratio'] = val
                        if additional_val:
                            val = parse_float(additional_val)
                            if val > 0:
                                fund_data[fund_name]['additional_ratio'] = val
                    elif row_type == 'return':
                        if cell_val:
                            val = parse_float(cell_val)
                            if val != 0:  # 수익률은 음수도 가능
                                fund_data[fund_name]['return'] = val
                        if additional_val:
                            val = parse_float(additional_val)
                            if val != 0:
                                fund_data[fund_name]['additional_return'] = val
                    elif row_type == 'principal':
                        if cell_val:
                            val = parse_number(cell_val)
                            if val > 0:
                                fund_data[fund_name]['principal'] = val
                        if additional_val:
                            val = parse_number(additional_val)
                            if val > 0:
                                fund_data[fund_name]['additional_principal'] = val

            current_fund_idx += 5  # 다음 펀드 그룹으로

        row_idx += 1

    return fund_data, current_fund_idx


def parse_customer_review(pdf_path: str, end_page: int = 4) -> Dict:
    """
    Customer Review Service PDF를 pdfplumber로 파싱

    Args:
        pdf_path: PDF 파일 경로
        end_page: 마지막 페이지 번호 (보통 4)

    Returns:
        dict: {
            "contract_info": {
                "policy_number": str,           # 증권번호
                "contract_date": "YYYY-MM-DD",  # 계약일자
                "insured_amount": int,          # 보험가입금액 (원)
                "accumulated_amount": int,      # 적립금 (원)
                "investment_return_rate": float,# 투자수익률 (%)
                "surrender_value": int,         # 해지환급금 (원)
                "surrender_rate": float         # 해지환급율 (%)
            },
            "premium_info": {
                "basic_premium": int,           # 기본보험료(A) (원)
                "additional_premium": int,      # 수시추가납(B) (원)
                "regular_additional": int,      # 정기추가납(C) (원)
                "withdrawal": int,              # 중도출금(D) (원)
                "net_premium": int,             # 계(A+B+C-D) (원)
                "policy_loan": int              # 약관대출 (원)
            },
            "fund_allocations": [
                {
                    "fund_name": str,               # 펀드명
                    "basic_accumulated": int,       # 기본적립금 (원)
                    "additional_accumulated": int,  # 추가적립금 (원, optional)
                    "allocation_ratio": float,      # 구성비율 (%)
                    "return_rate": float,           # 수익률/기본수익률 (%)
                    "additional_return_rate": float,# 추가수익률 (%, optional)
                    "invested_principal": int       # 투입원금 (원)
                }
            ],
            "total_accumulated_amount": int,    # 총 적립금 (원)
            "fund_count": int                   # 펀드 수
        }

        파싱 실패 시:
        {
            "error": str
        }

    Raises:
        FileNotFoundError: PDF 파일이 존재하지 않을 때
    """
    logger.info(f"📄 Customer Review pdfplumber 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""

            # 페이지 2의 텍스트 (계약정보, 납입원금)
            if len(pdf.pages) > 1:
                full_text = pdf.pages[1].extract_text() or ""

            # 계약정보 추출
            contract_info = extract_contract_info(full_text)
            logger.info(f"📝 계약정보: 증권번호={contract_info['policy_number']}, 적립금={contract_info['accumulated_amount']:,}원")

            # 납입원금 추출
            premium_info = extract_premium_info(full_text)
            logger.info(f"📝 납입원금: 기본={premium_info['basic_premium']:,}원, 순납입={premium_info['net_premium']:,}원")

            # 펀드 테이블 찾기 (페이지 2-3의 큰 테이블)
            all_fund_data = {}
            global_fund_idx = 0  # 모든 테이블에서 연속적으로 추적

            for page_idx in range(1, min(end_page, len(pdf.pages))):
                page = pdf.pages[page_idx]
                tables = page.extract_tables()

                logger.debug(f"  Page {page_idx + 1}: {len(tables)} tables found")

                for table_idx, table in enumerate(tables):
                    # 펀드 테이블은 보통 10행 이상
                    if len(table) >= 10:
                        logger.debug(f"    Processing table {table_idx + 1} ({len(table)} rows), starting at fund_idx={global_fund_idx}")

                        fund_data, next_idx = find_fund_data_in_table(table, global_fund_idx)

                        # 펀드 데이터가 발견되었으면 인덱스 업데이트
                        if fund_data:
                            global_fund_idx = next_idx
                            logger.debug(f"    Found {len(fund_data)} funds, next fund_idx={global_fund_idx}")

                        # 기존 데이터와 병합
                        for fund_name, data in fund_data.items():
                            if fund_name not in all_fund_data:
                                all_fund_data[fund_name] = data
                            else:
                                # 0이 아닌 값으로 업데이트
                                for key, val in data.items():
                                    if isinstance(val, (int, float)) and val != 0:
                                        all_fund_data[fund_name][key] = val

            # 적립금이 있는 펀드만 추출 (CustomerReviewModal 형식으로 변환)
            fund_allocations = []
            for fund_name in FLAT_FUND_LIST:  # 정해진 순서대로
                if fund_name in all_fund_data:
                    data = all_fund_data[fund_name]
                    if data['amount'] > 0 or data.get('additional_amount', 0) > 0:
                        fund_allocations.append({
                            "fund_name": fund_name,
                            "basic_accumulated": data['amount'],
                            "additional_accumulated": data.get('additional_amount', 0),
                            "allocation_ratio": data['ratio'],
                            "return_rate": data['return'],
                            "additional_return_rate": data.get('additional_return', 0.0) if data.get('additional_return', 0.0) != 0 else None,
                            "invested_principal": data['principal']
                        })

            # 총 적립금 계산
            total_accumulated = sum(
                f['basic_accumulated'] + f.get('additional_accumulated', 0)
                for f in fund_allocations
            )

            logger.info(f"✅ Customer Review 파싱 성공: 펀드={len(fund_allocations)}개, 총적립금={total_accumulated:,}원")

            return {
                "contract_info": contract_info,
                "premium_info": premium_info,
                "fund_allocations": fund_allocations,
                "total_accumulated_amount": total_accumulated,
                "fund_count": len(fund_allocations)
            }

    except Exception as e:
        logger.error(f"❌ Customer Review pdfplumber 파싱 중 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Review pdfplumber 파싱 중 오류: {e}", e)
        return {
            "error": f"파싱 실패: {str(e)}"
        }
