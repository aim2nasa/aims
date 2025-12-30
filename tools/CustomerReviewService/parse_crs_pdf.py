#!/usr/bin/env python3
"""
Customer Review Service PDF Parser
메트라이프 변액보험 리뷰 리포트 PDF 파서

주요 기능:
- 계약정보 추출 (증권번호, 계약일자, 적립금, 투자수익률 등)
- 납입원금 추출 (기본보험료, 추가납입, 중도출금 등)
- 펀드 구성 현황 추출 (펀드명, 적립금, 구성비율, 수익률, 투입원금)

사용법:
    python parse_crs_pdf.py                    # samples 폴더의 모든 PDF 처리
    python parse_crs_pdf.py path/to/file.pdf   # 특정 PDF 처리
    python parse_crs_pdf.py -v                 # 상세 출력 모드
"""

import pdfplumber
import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple


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


@dataclass
class ContractInfo:
    product_name: str = ""
    policy_number: str = ""
    contract_date: str = ""
    insured_amount: int = 0
    accumulated_amount: int = 0
    investment_return: float = 0.0
    surrender_value: int = 0
    surrender_rate: float = 0.0
    accumulation_rate: float = 0.0
    monthly_premium: int = 0


@dataclass
class PremiumInfo:
    basic_premium: int = 0
    irregular_additional: int = 0
    regular_additional: int = 0
    withdrawal: int = 0
    total: int = 0
    policy_loan: int = 0


@dataclass
class FundInfo:
    fund_name: str = ""
    basic_amount: int = 0
    additional_amount: int = 0
    basic_ratio: float = 0.0
    additional_ratio: float = 0.0
    basic_return: float = 0.0
    additional_return: float = 0.0
    basic_input_ratio: float = 0.0
    additional_input_ratio: float = 0.0
    basic_principal: int = 0
    additional_principal: int = 0


def parse_number(value) -> int:
    if not value:
        return 0
    cleaned = re.sub(r'[^\d]', '', str(value))
    try:
        return int(cleaned) if cleaned else 0
    except ValueError:
        return 0


def parse_float(value) -> float:
    if not value:
        return 0.0
    cleaned = re.sub(r'[^\d.-]', '', str(value))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def extract_contract_info(text: str) -> ContractInfo:
    info = ContractInfo()

    policy_match = re.search(r'(\d{10,11})', text)
    if policy_match:
        info.policy_number = policy_match.group(1)

    contract_date_match = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', text)
    if contract_date_match:
        info.contract_date = f"{contract_date_match.group(1)}-{contract_date_match.group(2).zfill(2)}-{contract_date_match.group(3).zfill(2)}"

    insured_match = re.search(r'보험가입금액\s*[:\s]*([\d,]+)', text)
    if insured_match:
        info.insured_amount = parse_number(insured_match.group(1))

    accumulated_match = re.search(r'[·\s]적립금\s*[:\s]*([\d,]+)', text)
    if accumulated_match:
        info.accumulated_amount = parse_number(accumulated_match.group(1))

    return_match = re.search(r'투자수익률\s*[:\s]*([\d.]+)\s*[％%]', text)
    if return_match:
        info.investment_return = parse_float(return_match.group(1))

    surrender_match = re.search(r'해지환급금[^:]*[:\s]*([\d,]+)', text)
    if surrender_match:
        info.surrender_value = parse_number(surrender_match.group(1))

    surrender_rate_match = re.search(r'해지환급율\s*[:\s]*([\d.]+)\s*[％%]', text)
    if surrender_rate_match:
        info.surrender_rate = parse_float(surrender_rate_match.group(1))

    acc_rate_match = re.search(r'적립금비율[^:]*[:\s]*([\d.]+)\s*[％%]', text)
    if acc_rate_match:
        info.accumulation_rate = parse_float(acc_rate_match.group(1))

    # 월납보험료
    monthly_match = re.search(r'보험료\s*[:\s]*([\d,]+)\s*원', text)
    if monthly_match:
        info.monthly_premium = parse_number(monthly_match.group(1))

    return info


def extract_premium_info(text: str) -> PremiumInfo:
    info = PremiumInfo()

    basic_match = re.search(r'기본\s*보험료\s*\(A\)[^0-9]*([\d,]+)', text)
    if basic_match:
        info.basic_premium = parse_number(basic_match.group(1))

    irregular_match = re.search(r'수시추가납\s*보험료\s*\(B\)[^0-9]*([\d,]+)', text)
    if irregular_match:
        info.irregular_additional = parse_number(irregular_match.group(1))

    regular_match = re.search(r'정기추가납\s*보험료\s*\(C\)[^0-9]*([\d,]+)', text)
    if regular_match:
        info.regular_additional = parse_number(regular_match.group(1))

    withdrawal_match = re.search(r'중도출금\s*\(D\)[^0-9]*([\d,]+)', text)
    if withdrawal_match:
        info.withdrawal = parse_number(withdrawal_match.group(1))

    total_match = re.search(r'계\s*\(A\+B\+C-D\)[^0-9]*([\d,]+)', text)
    if total_match:
        info.total = parse_number(total_match.group(1))

    loan_match = re.search(r'약관대출[^0-9]*([\d,]+)', text)
    if loan_match:
        info.policy_loan = parse_number(loan_match.group(1))

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
                print(f"  [Table] Fund group {group_idx + 1} (idx={current_fund_idx}) at row {row_idx}: {current_funds}")

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


def parse_crs_pdf(pdf_path: str, verbose: bool = False) -> dict:
    result = {
        'file': Path(pdf_path).name,
        'contract': None,
        'premium': None,
        'funds': [],
        'summary': {}
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""

            # 페이지 2의 텍스트 (계약정보, 납입원금)
            if len(pdf.pages) > 1:
                full_text = pdf.pages[1].extract_text() or ""

            # 계약정보
            contract = extract_contract_info(full_text)
            result['contract'] = asdict(contract)

            # 납입원금
            premium = extract_premium_info(full_text)
            result['premium'] = asdict(premium)

            # 펀드 테이블 찾기 (페이지 2-3의 큰 테이블)
            all_fund_data = {}
            global_fund_idx = 0  # 모든 테이블에서 연속적으로 추적

            for page_idx in range(1, min(4, len(pdf.pages))):
                page = pdf.pages[page_idx]
                tables = page.extract_tables()

                if verbose:
                    print(f"\n  Page {page_idx + 1}: {len(tables)} tables found")

                for table_idx, table in enumerate(tables):
                    # 펀드 테이블은 보통 10행 이상
                    if len(table) >= 10:
                        if verbose:
                            print(f"    Processing table {table_idx + 1} ({len(table)} rows), starting at fund_idx={global_fund_idx}")

                        fund_data, next_idx = find_fund_data_in_table(table, global_fund_idx, verbose)

                        # 펀드 데이터가 발견되었으면 인덱스 업데이트
                        if fund_data:
                            global_fund_idx = next_idx
                            if verbose:
                                print(f"    Found {len(fund_data)} funds, next fund_idx={global_fund_idx}")

                        # 기존 데이터와 병합
                        for fund_name, data in fund_data.items():
                            if fund_name not in all_fund_data:
                                all_fund_data[fund_name] = data
                            else:
                                # 0이 아닌 값으로 업데이트
                                for key, val in data.items():
                                    if isinstance(val, (int, float)) and val != 0:
                                        all_fund_data[fund_name][key] = val

            # 적립금이 있는 펀드만 추출
            funds = []
            for fund_name in FLAT_FUND_LIST:  # 정해진 순서대로
                if fund_name in all_fund_data:
                    data = all_fund_data[fund_name]
                    if data['amount'] > 0 or data.get('additional_amount', 0) > 0:
                        funds.append(FundInfo(
                            fund_name=fund_name,
                            basic_amount=data['amount'],
                            additional_amount=data.get('additional_amount', 0),
                            basic_ratio=data['ratio'],
                            additional_ratio=data.get('additional_ratio', 0.0),
                            basic_return=data['return'],
                            additional_return=data.get('additional_return', 0.0),
                            basic_principal=data['principal'],
                            additional_principal=data.get('additional_principal', 0)
                        ))

            result['funds'] = [asdict(f) for f in funds]

            # 요약
            total_fund_amount = sum(f.basic_amount + f.additional_amount for f in funds)
            result['summary'] = {
                'total_pages': len(pdf.pages),
                'total_funds': len(funds),
                'total_fund_amount': total_fund_amount
            }

    except Exception as e:
        result['error'] = str(e)
        if verbose:
            import traceback
            traceback.print_exc()

    return result


def print_result(result: dict, verbose: bool = False):
    print("\n" + "=" * 70)
    print(f"  파일: {result['file']}")
    print("=" * 70)

    if 'error' in result:
        print(f"  오류: {result['error']}")
        return

    if result['contract']:
        print("\n  [계약정보]")
        c = result['contract']
        if c['policy_number']:
            print(f"    증권번호: {c['policy_number']}")
        if c['contract_date']:
            print(f"    계약일자: {c['contract_date']}")
        if c['insured_amount']:
            print(f"    보험가입금액: {c['insured_amount']:,}원")
        if c['accumulated_amount']:
            print(f"    적립금: {c['accumulated_amount']:,}원")
        if c['investment_return']:
            print(f"    투자수익률: {c['investment_return']}%")
        if c['surrender_value']:
            print(f"    해지환급금: {c['surrender_value']:,}원")
        if c.get('monthly_premium'):
            print(f"    월납보험료: {c['monthly_premium']:,}원")

    if result['premium']:
        print("\n  [납입원금]")
        p = result['premium']
        print(f"    기본 보험료(A): {p['basic_premium']:,}원")
        print(f"    수시추가납(B): {p['irregular_additional']:,}원")
        print(f"    정기추가납(C): {p['regular_additional']:,}원")
        print(f"    중도출금(D): {p['withdrawal']:,}원")
        print(f"    계(A+B+C-D): {p['total']:,}원")
        print(f"    약관대출: {p['policy_loan']:,}원")

    if result['funds']:
        print("\n  [펀드 구성 현황]")
        print(f"    {'펀드명':<25} {'기본적립금':>15} {'추가적립금':>12} {'기본비율':>8} {'기본수익률':>10}")
        print("    " + "-" * 80)
        for f in result['funds']:
            ratio_str = f"{f['basic_ratio']:.1f}%" if f['basic_ratio'] else "-"
            return_str = f"{f['basic_return']:.2f}%" if f['basic_return'] else "-"
            add_str = f"{f['additional_amount']:,}" if f.get('additional_amount') else "-"
            print(f"    {f['fund_name']:<25} {f['basic_amount']:>15,}원 {add_str:>12} {ratio_str:>8} {return_str:>10}")

        total = sum(f['basic_amount'] + f.get('additional_amount', 0) for f in result['funds'])
        print("    " + "-" * 80)
        print(f"    {'합계':<25} {total:>15,}원")

    if result.get('summary'):
        s = result['summary']
        print(f"\n  [요약] 페이지: {s['total_pages']}, 펀드: {s['total_funds']}개, 총적립금: {s['total_fund_amount']:,}원")


def main():
    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('-')]

    samples_dir = Path(__file__).parent / "samples"

    if args:
        pdf_path = Path(args[0])
        if pdf_path.exists():
            result = parse_crs_pdf(str(pdf_path), verbose)
            print_result(result, verbose)
            return
        else:
            print(f"파일을 찾을 수 없습니다: {pdf_path}")
            return

    if not samples_dir.exists():
        print(f"샘플 폴더를 찾을 수 없습니다: {samples_dir}")
        return

    pdf_files = list(samples_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"PDF 파일이 없습니다: {samples_dir}")
        return

    print(f"\n총 {len(pdf_files)}개 PDF 파일 처리\n")

    all_results = []
    for pdf_path in sorted(pdf_files):
        result = parse_crs_pdf(str(pdf_path), verbose)
        print_result(result, verbose)
        all_results.append(result)

    output_file = Path(__file__).parent / "parsed_results.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n결과가 저장되었습니다: {output_file}")


if __name__ == "__main__":
    main()
