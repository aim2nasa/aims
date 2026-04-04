"""
Customer Review Service 테이블 추출기 (완전 일반화 구현)

핵심 원리:
- pdfplumber의 테이블 추출 기능을 사용하여 셀 경계 보존
- 테이블 헤더를 동적으로 분석하여 펀드명/열 인덱스 매핑
- 하드코딩된 펀드명 배열 완전 제거

오버피팅 방지:
- 펀드명: 헤더에서 동적 추출 (FUND_GROUPS 배열 미사용)
- 펀드 개수: 헤더 열 개수로 자동 계산
- 열 위치: build_fund_column_map()으로 동적 매핑
- 구성비율: "적립금 구성비율" vs "현재투입비율 구성비율" 구분
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional

try:
    import pdfplumber
except ImportError as e:
    logging.error(f"pdfplumber import 실패: {e}")
    raise

logger = logging.getLogger(__name__)


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
    """숫자 문자열을 실수로 변환 (음수 지원)"""
    if not value:
        return 0.0
    # 음수 부호와 숫자, 소수점만 남기기
    cleaned = re.sub(r'[^\d.\-]', '', str(value))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def build_fund_column_map(header_row: List[Optional[str]], prev_row: List[Optional[str]] = None) -> Dict[str, Dict[str, int]]:
    """
    테이블 헤더에서 펀드명과 열 인덱스를 동적으로 매핑

    CR 테이블 구조 (예시):
    | (empty) | (empty) | 채권형     |          | 미국주식형 |          | ...
    | (empty) | (empty) | 기본납입   | 추가납입 | 기본납입   | 추가납입 | ...

    Args:
        header_row: "기본납입/추가납입" 행
        prev_row: 펀드명 행 (헤더 바로 위 행)

    Returns:
        dict: {펀드명: {"basic": col_idx, "additional": col_idx or None}}
    """
    column_map = {}

    if not header_row:
        return column_map

    # 기본납입/추가납입 열 인덱스 찾기
    basic_cols = []
    additional_cols = []

    for idx, cell in enumerate(header_row):
        if cell:
            cell_str = str(cell).strip()
            if '기본' in cell_str and '납입' in cell_str:
                basic_cols.append(idx)
            elif '추가' in cell_str and '납입' in cell_str:
                additional_cols.append(idx)

    logger.debug(f"기본납입 열: {basic_cols}, 추가납입 열: {additional_cols}")

    # 펀드명 추출 (prev_row에서)
    if prev_row and len(basic_cols) > 0:
        # 각 기본납입 열에 해당하는 펀드명 찾기
        # 펀드명은 기본납입 열과 같은 위치 또는 이전 열에 있음
        for i, basic_col in enumerate(basic_cols):
            # 펀드명 찾기: basic_col 또는 그 주변에서
            fund_name = None

            # 1. 정확히 같은 위치에서 찾기
            if basic_col < len(prev_row) and prev_row[basic_col]:
                fund_name = str(prev_row[basic_col]).strip()

            # 2. 같은 위치가 비어있으면 이전 셀들에서 찾기 (merge된 셀)
            if not fund_name:
                for check_col in range(basic_col, -1, -1):
                    if check_col < len(prev_row) and prev_row[check_col]:
                        candidate = str(prev_row[check_col]).strip()
                        # "형" 또는 "MMF" 등 펀드 이름 패턴
                        if candidate and len(candidate) >= 2 and candidate not in column_map:
                            fund_name = candidate
                            break

            if fund_name and fund_name not in ['', '기본납입', '추가납입']:
                # 추가납입 열 인덱스 찾기 (기본납입 바로 다음 열)
                additional_col = None
                if i < len(additional_cols):
                    additional_col = additional_cols[i]
                elif basic_col + 1 < len(header_row):
                    # 다음 열이 추가납입인지 확인
                    next_cell = header_row[basic_col + 1]
                    if next_cell and '추가' in str(next_cell):
                        additional_col = basic_col + 1

                column_map[fund_name] = {
                    "basic": basic_col,
                    "additional": additional_col
                }
                logger.debug(f"펀드 매핑: {fund_name} -> basic={basic_col}, additional={additional_col}")

    return column_map


def identify_row_type(row: List[Optional[str]]) -> Optional[str]:
    """
    행 유형 판별

    Returns:
        str: 'amount' | 'accumulated_ratio' | 'current_ratio' | 'return' | 'principal' | None

    핵심: "적립금 구성비율" vs "현재투입비율 구성비율" 구분

    테이블 행 예시:
    - ['적립금', '금액', ...] → amount
    - ['', '구성비율', ...] → accumulated_ratio
    - ['', '수익률', ...] → return
    - ['기본납입\n현재투입비율', '추가납입\n구성비율', ...] → current_ratio (무시)
    - ['투입원금', '금액', ...] → principal
    """
    if not row:
        return None

    # 처음 3개 셀 텍스트 결합 (전체 행 컨텍스트 파악)
    row_text = ' '.join(str(c).strip() for c in row[:3] if c)

    # 1. 투입원금 행 (첫 번째 셀이 "투입원금"인 경우)
    first_cell = str(row[0]).strip() if row[0] else ''
    if '투입원금' in first_cell:
        return 'principal'

    # 2. 적립금 금액 행 (첫 번째 셀이 "적립금"인 경우)
    if '적립금' in first_cell and '금액' in row_text:
        return 'amount'

    # 3. 현재투입비율 구성비율 (무시해야 함)
    if '현재투입비율' in row_text or '투입비율' in row_text:
        return 'current_ratio'

    # 4. 적립금 구성비율
    if '구성비율' in row_text:
        return 'accumulated_ratio'

    # 5. 수익률 (투자수익률은 제외)
    if '수익률' in row_text and '투자수익률' not in row_text:
        return 'return'

    # 6. 금액 행 (적립금 컨텍스트에서의 금액)
    if '금액' in row_text:
        return 'amount'

    return None


def is_fund_header_row(row: List[Optional[str]]) -> bool:
    """
    펀드 헤더 행인지 확인 (기본납입/추가납입이 있는 행)

    실제 헤더 행 예시:
    ['', '', '기본납입', '추가납입', '기본납입', '추가납입', ...]
    - '기본납입'과 '추가납입'이 여러 번 반복 (펀드 개수만큼)
    - 열 인덱스 2 이상에서 나타남

    오탐지 행 예시 (이 행은 헤더가 아님):
    ['기본납입\n현재투입비율', '추가납입\n구성비율', '0.0', ...]
    - '기본납입'이 '현재투입비율'과 같은 셀에 있음
    - 열 인덱스 0-1에만 나타남
    """
    if not row:
        return False

    basic_count = 0
    additional_count = 0

    for idx, cell in enumerate(row):
        if cell:
            cell_str = str(cell)

            # '현재투입비율' 또는 '구성비율'이 포함된 셀은 헤더가 아님
            if '현재투입비율' in cell_str or ('구성비율' in cell_str and '납입' in cell_str):
                return False

            # 열 인덱스 2 이상에서 '기본납입' 또는 '추가납입' 카운트
            if idx >= 2:
                if '기본' in cell_str and '납입' in cell_str:
                    basic_count += 1
                if '추가' in cell_str and '납입' in cell_str:
                    additional_count += 1

    # 최소 2개 이상의 '기본납입'과 '추가납입' 쌍이 있어야 함
    return basic_count >= 2 and additional_count >= 2


def extract_fund_data_from_rows(
    rows: List[List[Optional[str]]],
    column_map: Dict[str, Dict[str, int]]
) -> Dict[str, Dict[str, Any]]:
    """
    행들에서 펀드 데이터 추출

    Args:
        rows: 데이터 행들
        column_map: {펀드명: {"basic": col_idx, "additional": col_idx}}

    Returns:
        dict: {펀드명: {amount, ratio, return, principal, ...}}
    """
    fund_data = {}

    # 초기화
    for fund_name in column_map:
        fund_data[fund_name] = {
            'amount': 0,
            'additional_amount': 0,
            'ratio': 0.0,
            'additional_ratio': 0.0,
            'return': 0.0,
            'additional_return': 0.0,
            'principal': 0,
            'additional_principal': 0
        }

    for row in rows:
        if not row:
            continue

        row_type = identify_row_type(row)
        if not row_type or row_type == 'current_ratio':
            # current_ratio는 무시 (현재투입비율 구성비율)
            continue

        # 각 펀드별 데이터 추출
        for fund_name, col_info in column_map.items():
            basic_col = col_info['basic']
            additional_col = col_info.get('additional')

            # 기본납입 값
            if basic_col < len(row):
                basic_val = row[basic_col]
                if basic_val:
                    if row_type == 'amount':
                        fund_data[fund_name]['amount'] = parse_number(basic_val)
                    elif row_type == 'accumulated_ratio':
                        fund_data[fund_name]['ratio'] = parse_float(basic_val)
                    elif row_type == 'return':
                        fund_data[fund_name]['return'] = parse_float(basic_val)
                    elif row_type == 'principal':
                        fund_data[fund_name]['principal'] = parse_number(basic_val)

            # 추가납입 값
            if additional_col and additional_col < len(row):
                additional_val = row[additional_col]
                if additional_val:
                    if row_type == 'amount':
                        fund_data[fund_name]['additional_amount'] = parse_number(additional_val)
                    elif row_type == 'accumulated_ratio':
                        fund_data[fund_name]['additional_ratio'] = parse_float(additional_val)
                    elif row_type == 'return':
                        fund_data[fund_name]['additional_return'] = parse_float(additional_val)
                    elif row_type == 'principal':
                        fund_data[fund_name]['additional_principal'] = parse_number(additional_val)

    return fund_data


def extract_cr_fund_table(pdf_path: str, page_nums: List[int] = None) -> Dict[str, Any]:
    """
    CR PDF에서 펀드 테이블 추출 (메인 함수)

    Args:
        pdf_path: PDF 파일 경로
        page_nums: 페이지 번호 목록 (0-indexed, 기본값: [1, 2] = 2~3페이지)

    Returns:
        dict: {
            "fund_allocations": [
                {
                    "fund_name": str,
                    "basic_accumulated": int,
                    "additional_accumulated": int,
                    "allocation_ratio": float,
                    "additional_allocation_ratio": float,
                    "return_rate": float,
                    "additional_return_rate": float,
                    "invested_principal": int,
                    "additional_invested_principal": int
                }
            ],
            "fund_count": int,
            "total_accumulated_amount": int
        }
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    if page_nums is None:
        page_nums = [1, 2]  # 2페이지, 3페이지

    logger.info(f"CR 테이블 추출 시작: {os.path.basename(pdf_path)}")

    all_fund_data = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num in page_nums:
            if page_num >= len(pdf.pages):
                continue

            page = pdf.pages[page_num]
            tables = page.extract_tables()

            logger.debug(f"페이지 {page_num + 1}: {len(tables)}개 테이블 발견")

            for table_idx, table in enumerate(tables):
                if not table or len(table) < 5:
                    continue

                logger.debug(f"  테이블 {table_idx + 1}: {len(table)}행")

                # 펀드 헤더 행 찾기
                for row_idx, row in enumerate(table):
                    if is_fund_header_row(row):
                        # 이전 행에서 펀드명 추출
                        prev_row = table[row_idx - 1] if row_idx > 0 else None

                        # 열 매핑 생성
                        column_map = build_fund_column_map(row, prev_row)

                        if column_map:
                            logger.debug(f"  펀드 매핑 발견 (행 {row_idx}): {list(column_map.keys())}")

                            # 데이터 행들 추출 (헤더 다음 ~ 다음 헤더 또는 테이블 끝)
                            data_rows = []
                            for data_row_idx in range(row_idx + 1, len(table)):
                                data_row = table[data_row_idx]

                                # 다음 펀드 그룹 헤더인지 확인
                                if is_fund_header_row(data_row):
                                    break

                                data_rows.append(data_row)

                            # 펀드 데이터 추출
                            fund_data = extract_fund_data_from_rows(data_rows, column_map)

                            # 기존 데이터와 병합
                            for fund_name, data in fund_data.items():
                                if fund_name not in all_fund_data:
                                    all_fund_data[fund_name] = data
                                else:
                                    # 0이 아닌 값으로 업데이트
                                    for key, val in data.items():
                                        if isinstance(val, (int, float)) and val != 0:
                                            all_fund_data[fund_name][key] = val

    # 결과 변환 (적립금이 있는 펀드만)
    fund_allocations = []
    for fund_name, data in all_fund_data.items():
        if data['amount'] > 0 or data.get('additional_amount', 0) > 0:
            fund_allocations.append({
                "fund_name": fund_name,
                "basic_accumulated": data['amount'],
                "additional_accumulated": data.get('additional_amount', 0),
                "allocation_ratio": data['ratio'],
                "additional_allocation_ratio": data.get('additional_ratio', 0.0) if data.get('additional_ratio', 0.0) != 0 else None,
                "return_rate": data['return'],
                "additional_return_rate": data.get('additional_return', 0.0) if data.get('additional_return', 0.0) != 0 else None,
                "invested_principal": data['principal'],
                "additional_invested_principal": data.get('additional_principal', 0) if data.get('additional_principal', 0) != 0 else None,
            })

    # 총 적립금
    total_accumulated = sum(
        f['basic_accumulated'] + f.get('additional_accumulated', 0)
        for f in fund_allocations
    )

    logger.info(f"✅ CR 테이블 추출 완료: 펀드={len(fund_allocations)}개, 총적립금={total_accumulated:,}원")

    return {
        "fund_allocations": fund_allocations,
        "fund_count": len(fund_allocations),
        "total_accumulated_amount": total_accumulated
    }


# CLI 실행
if __name__ == "__main__":
    import json
    import sys

    logging.basicConfig(level=logging.DEBUG)

    if len(sys.argv) < 2:
        print("Usage: python cr_table_extractor.py <pdf_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        result = extract_cr_fund_table(pdf_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
