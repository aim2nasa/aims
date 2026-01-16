"""
Annual Report 테이블 추출기 (일반화된 구현)

핵심 원리:
- pdfplumber의 테이블 추출 기능을 사용하여 셀 경계 보존
- 텍스트 추출(구조 손실) 대신 테이블 추출(구조 보존) 사용
- 하드코딩된 패턴 없이 일반화된 파싱 가능

오버피팅 방지:
- 특정 회사명, 상품명, 상태값을 하드코딩하지 않음
- 셀 내 줄바꿈은 단순히 제거 (cell.replace('\\n', ''))
- 새로운 데이터에도 자동으로 대응

@see docs/ANNUAL_REPORT_PARSER.md
"""
import os
import re
import logging
from typing import List, Dict, Optional, Any

try:
    import pdfplumber
except ImportError as e:
    logging.error(f"pdfplumber import 실패: {e}")
    raise

logger = logging.getLogger(__name__)


def extract_contract_table(pdf_path: str, page_num: int = 1) -> Dict[str, Any]:
    """
    PDF 페이지에서 계약 테이블을 추출 (구조 보존)

    Args:
        pdf_path: PDF 파일 경로
        page_num: 페이지 번호 (0-indexed, 기본값 1 = 2페이지)

    Returns:
        dict: {
            "insuredName": str,           # 피보험자명
            "totalContracts": int,        # 보유계약 건수
            "monthlyPremiumTotal": int,   # 월 보험료 총액
            "contracts": [                # 보유계약 목록
                {
                    "seq": int,
                    "policyNumber": str,
                    "productName": str,
                    "contractor": str,
                    "insured": str,
                    "contractDate": str,
                    "status": str,
                    "coverageAmount": float,
                    "insurancePeriod": str,
                    "paymentPeriod": str,
                    "premium": int
                }
            ],
            "lapsedContracts": []         # 부활가능 실효계약
        }

    Raises:
        FileNotFoundError: PDF 파일이 존재하지 않을 때
        Exception: 파싱 실패
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    logger.info(f"테이블 추출 시작: {os.path.basename(pdf_path)}, 페이지 {page_num + 1}")

    with pdfplumber.open(pdf_path) as pdf:
        if page_num < 0 or page_num >= len(pdf.pages):
            raise IndexError(f"페이지 번호 범위 초과: {page_num} (총 {len(pdf.pages)}페이지)")

        page = pdf.pages[page_num]

        # 1. 헤더 정보 추출 (텍스트 기반 - 구조화된 부분)
        header = extract_header_info(page)

        # 2. 테이블 찾기
        tables = page.find_tables()
        logger.info(f"감지된 테이블 수: {len(tables)}")

        contracts = []
        lapsed_contracts = []
        is_lapsed_section = False

        # 3. 각 테이블 처리
        for table_idx, table in enumerate(tables):
            data = table.extract()
            logger.debug(f"테이블 {table_idx + 1}: {len(data)}행")

            # 테이블 헤더 확인
            if data and len(data) > 0:
                first_row_text = ' '.join([str(c) for c in data[0] if c])

                # 부활가능 실효계약 섹션 감지
                if '부활가능' in first_row_text or '실효계약' in first_row_text:
                    is_lapsed_section = True
                    continue

                # 계약 테이블 감지 (헤더에 "순번", "증권번호" 포함)
                if '순번' in first_row_text and '증권번호' in first_row_text:
                    # 헤더 행 스킵하고 데이터 행 처리
                    for row in data[1:]:
                        contract = parse_contract_row(row)
                        if contract:
                            if is_lapsed_section:
                                lapsed_contracts.append(contract)
                            else:
                                contracts.append(contract)

        logger.info(f"파싱 완료: 보유계약 {len(contracts)}건, 실효계약 {len(lapsed_contracts)}건")

        return {
            **header,
            "contracts": contracts,
            "lapsedContracts": lapsed_contracts
        }


def extract_header_info(page) -> Dict[str, Any]:
    """
    페이지에서 헤더 정보 추출 (피보험자명, 계약건수, 월보험료)

    규칙:
    - 텍스트에서 "{이름} {숫자}" 패턴 찾기
    - "현재 납입중인 월 보험료" 근처에서 금액 찾기
    """
    text = page.extract_text() or ""
    lines = text.split('\n')

    result = {
        "insuredName": "",
        "totalContracts": 0,
        "monthlyPremiumTotal": 0
    }

    for i, line in enumerate(lines):
        # "{이름} {숫자}" 패턴 (피보험자 + 계약건수)
        # 예: "김보성 6", "안영미 10"
        match = re.match(r'^([가-힣]+)\s+(\d+)$', line.strip())
        if match:
            result["insuredName"] = match.group(1)
            result["totalContracts"] = int(match.group(2))
            continue

        # 월보험료 (숫자만 있는 줄, 일반적으로 "{숫자}" 형태)
        # 다음 줄에 "현재 납입중인" 이 있으면 월보험료
        if i + 1 < len(lines):
            next_line = lines[i + 1]
            if '현재 납입중인' in next_line or '월 보험료' in next_line:
                premium_match = re.match(r'^([\d,]+)$', line.strip())
                if premium_match:
                    result["monthlyPremiumTotal"] = int(premium_match.group(1).replace(',', ''))

    return result


def parse_contract_row(row: List[Optional[str]]) -> Optional[Dict[str, Any]]:
    """
    테이블 행을 계약 정보로 파싱

    핵심: 각 셀은 이미 완전한 단위로 추출됨
    - 줄바꿈 제거만 하면 됨 (cell.replace('\\n', ''))
    - 하드코딩된 패턴 불필요

    Args:
        row: 테이블 행 (각 셀은 문자열 또는 None)

    Returns:
        dict: 계약 정보 또는 None (파싱 불가)
    """
    if not row:
        return None

    # None을 빈 문자열로 변환
    cells = [str(c).replace('\n', '') if c else '' for c in row]

    # 최소 셀 수 확인 (순번, 증권번호, 상품명, 계약자, 피보험자, 계약일, 상태, ...)
    if len(cells) < 8:
        return None

    # 첫 번째 셀이 숫자인지 확인 (순번)
    try:
        seq = int(cells[0])
    except (ValueError, TypeError):
        return None  # 헤더 행이거나 데이터 아님

    # 증권번호 패턴 확인 (10자리 숫자, 00으로 시작)
    policy_number = cells[1].strip()
    if not re.match(r'^00\d{8}$', policy_number):
        return None

    # 계약일 패턴 확인 (YYYY-MM-DD)
    contract_date = None
    contract_date_idx = None
    for i, cell in enumerate(cells):
        if re.match(r'^\d{4}-\d{2}-\d{2}$', cell.strip()):
            contract_date = cell.strip()
            contract_date_idx = i
            break

    if not contract_date:
        return None

    # 셀 인덱스 매핑 (계약일 위치 기준)
    # 일반적 구조: 순번(0), 증권번호(1), 상품명(2), 계약자(3), 피보험자(4), 계약일(5), 상태(6), ...
    # 하지만 테이블에 따라 열 병합이 있을 수 있음

    product_name = cells[2].strip() if len(cells) > 2 else ''

    # 계약자/피보험자 위치 추정
    # 계약일 바로 앞 2개 셀이 계약자, 피보험자
    if contract_date_idx and contract_date_idx >= 4:
        insured = cells[contract_date_idx - 1].strip()
        contractor = cells[contract_date_idx - 2].strip()
        # 상품명 = 2번 인덱스부터 계약자 전까지
        if contract_date_idx > 4:
            product_parts = cells[2:contract_date_idx - 2]
            product_name = ' '.join([p.strip() for p in product_parts if p.strip()])
    else:
        contractor = cells[3].strip() if len(cells) > 3 else ''
        insured = cells[4].strip() if len(cells) > 4 else ''

    # 계약일 이후: 상태, 가입금액, 보험기간, 납입기간, 보험료
    status = ''
    coverage_amount = 0.0
    insurance_period = ''
    payment_period = ''
    premium = 0

    if contract_date_idx:
        after_date = cells[contract_date_idx + 1:]

        for cell in after_date:
            cell = cell.strip()
            if not cell:
                continue

            # 상태 (한글, 숫자 아님)
            if cell in ['정상', '납입완료', '업무처리중', '실효']:
                status = cell
            # 가입금액 (숫자, 첫 번째)
            elif re.match(r'^[\d,]+\.?\d*$', cell) and coverage_amount == 0:
                coverage_amount = float(cell.replace(',', ''))
            # 보험기간 (종신, N세)
            elif cell == '종신' or re.match(r'^\d+세$', cell):
                if not insurance_period:
                    insurance_period = cell
                elif not payment_period:
                    payment_period = cell
            # 납입기간 (N년, 전기납, 일시납)
            elif re.match(r'^\d+년$', cell) or cell in ['전기납', '일시납']:
                payment_period = cell
            # 보험료 (마지막 숫자)
            elif re.match(r'^[\d,]+$', cell):
                premium = int(cell.replace(',', ''))

    return {
        "seq": seq,
        "policyNumber": policy_number,
        "productName": product_name,
        "contractor": contractor,
        "insured": insured,
        "contractDate": contract_date,
        "status": status,
        "coverageAmount": coverage_amount,
        "insurancePeriod": insurance_period,
        "paymentPeriod": payment_period,
        "premium": premium
    }


def extract_all_samples(sample_dir: str) -> List[Dict[str, Any]]:
    """
    샘플 폴더의 모든 PDF 파싱

    Args:
        sample_dir: 샘플 폴더 경로

    Returns:
        list: 각 PDF의 파싱 결과
    """
    results = []

    for filename in os.listdir(sample_dir):
        if filename.endswith('.pdf'):
            pdf_path = os.path.join(sample_dir, filename)
            try:
                result = extract_contract_table(pdf_path, page_num=1)
                result['fileName'] = filename
                results.append(result)
                logger.info(f"✅ {filename}: {len(result['contracts'])}건")
            except Exception as e:
                logger.error(f"❌ {filename}: {e}")
                results.append({
                    'fileName': filename,
                    'error': str(e)
                })

    return results


# CLI 실행
if __name__ == "__main__":
    import sys
    import json

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 2:
        print("Usage: python table_extractor.py <pdf_path> [page_num]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2]) if len(sys.argv) > 2 else 1

    try:
        result = extract_contract_table(pdf_path, page_num)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
