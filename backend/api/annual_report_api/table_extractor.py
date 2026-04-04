"""
Annual Report 테이블 추출기 (완전 일반화 구현)

핵심 원리:
- pdfplumber의 테이블 추출 기능을 사용하여 셀 경계 보존
- 텍스트 추출(구조 손실) 대신 테이블 추출(구조 보존) 사용
- 테이블 헤더를 동적으로 분석하여 열 인덱스 매핑
- 하드코딩된 패턴 완전 제거

오버피팅 방지:
- 특정 회사명, 상품명, 상태값을 하드코딩하지 않음
- 증권번호: 10자리 숫자 (00 시작 가정 제거)
- 상태값: 열 위치 기반 추출 (하드코딩 제거)
- 보험기간/납입기간: 열 위치 기반 추출 (패턴 제거)
- 새로운 데이터에도 자동으로 대응

@see docs/ANNUAL_REPORT_PARSER.md
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

            if not data or len(data) == 0:
                continue

            first_row_text = ' '.join([str(c) for c in data[0] if c])

            # 부활가능 실효계약 섹션 감지
            if '부활가능' in first_row_text or '실효계약' in first_row_text:
                is_lapsed_section = True

            # 테이블 내 모든 행에서 계약 헤더 탐색
            # (섹션 제목과 데이터가 하나의 테이블로 병합될 수 있음)
            for row_idx, row in enumerate(data):
                row_text = ' '.join([str(c) for c in row if c])
                if '순번' in row_text and '증권번호' in row_text:
                    column_map = build_column_map(row)
                    logger.debug(f"열 매핑: {column_map}")

                    for data_row in data[row_idx + 1:]:
                        contract = parse_contract_row_by_columns(data_row, column_map)
                        if contract:
                            if is_lapsed_section:
                                lapsed_contracts.append(contract)
                            else:
                                contracts.append(contract)
                    break

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

    지원 PDF 형식:
    - 메트라이프 원본 PDF
    - ar_generator로 생성한 PDF
    """
    text = page.extract_text() or ""
    lines = text.split('\n')

    result = {
        "insuredName": "",
        "totalContracts": 0,
        "monthlyPremiumTotal": 0
    }

    # 1. 전체 텍스트에서 월보험료 직접 추출 시도 (가장 신뢰성 높음)
    # PDF 텍스트 추출 시 줄바꿈이 다양하게 처리될 수 있으므로, 전체 텍스트에서 패턴 매칭
    text_single_line = re.sub(r'\s+', ' ', text)  # 모든 공백을 단일 공백으로

    premium_patterns = [
        r'월\s*보험료[는은가]?\s*총\s*([\d,]+)\s*원',      # "월 보험료는 총 1,809,150 원"
        r'총\s*월\s*보험료[:\s]*([\d,]+)\s*원',            # "총 월보험료: 1,809,150원"
        r'납입중인\s*월\s*보험료.*?([\d,]+)\s*원',         # "납입중인 월 보험료...1,809,150 원"
    ]

    for pattern in premium_patterns:
        match = re.search(pattern, text_single_line)
        if match:
            try:
                result["monthlyPremiumTotal"] = int(match.group(1).replace(',', ''))
                logger.debug(f"월보험료 추출 (패턴 매칭): {result['monthlyPremiumTotal']}")
                break
            except (ValueError, IndexError):
                continue

    # 2. 라인별 분석
    for i, line in enumerate(lines):
        # "{이름} {숫자}" 패턴 (피보험자 + 계약건수)
        # 예: "김보성 6", "안영미 10"
        match = re.match(r'^([가-힣]+)\s+(\d+)$', line.strip())
        if match:
            result["insuredName"] = match.group(1)
            result["totalContracts"] = int(match.group(2))
            continue

        # 월보험료 (아직 추출 안 된 경우에만)
        if result["monthlyPremiumTotal"] == 0:
            # 패턴 A: 숫자만 있는 줄 → 다음 줄에 "현재 납입중인"
            if i + 1 < len(lines):
                next_line = lines[i + 1]
                if '현재 납입중인' in next_line or '월 보험료' in next_line:
                    premium_match = re.match(r'^([\d,]+)$', line.strip())
                    if premium_match:
                        result["monthlyPremiumTotal"] = int(premium_match.group(1).replace(',', ''))
                        logger.debug(f"월보험료 추출 (패턴 A): {result['monthlyPremiumTotal']}")

            # 패턴 B: "현재 납입중인" 줄 → 이전 줄에 숫자 (역순)
            if result["monthlyPremiumTotal"] == 0 and i > 0:
                if '현재 납입중인' in line or '월 보험료' in line:
                    prev_line = lines[i - 1]
                    premium_match = re.match(r'^([\d,]+)$', prev_line.strip())
                    if premium_match:
                        result["monthlyPremiumTotal"] = int(premium_match.group(1).replace(',', ''))
                        logger.debug(f"월보험료 추출 (패턴 B): {result['monthlyPremiumTotal']}")

    return result


def build_column_map(header_row: List[Optional[str]]) -> Dict[str, int]:
    """
    테이블 헤더 행에서 열 이름과 인덱스를 매핑

    Args:
        header_row: 헤더 행 (각 셀은 열 이름)

    Returns:
        dict: {열이름: 인덱스} 매핑
    """
    column_map = {}

    # 열 이름 정규화 매핑 (다양한 헤더명 대응)
    # 순서 중요: 더 긴(구체적인) 패턴을 먼저 검사
    name_mapping = [
        ('증권번호', 'policyNumber'),
        ('보험상품', 'productName'),
        ('상품명', 'productName'),
        ('피보험자', 'insured'),
        ('계약자', 'contractor'),
        ('계약일', 'contractDate'),
        ('계약상태', 'status'),
        ('가입금액', 'coverageAmount'),
        ('보험기간', 'insurancePeriod'),
        ('납입기간', 'paymentPeriod'),
        ('보험료', 'premium'),
        ('순번', 'seq'),
    ]

    for idx, cell in enumerate(header_row):
        if cell:
            # 줄바꿈 제거 후 매칭
            cell_text = str(cell).replace('\n', '').strip()
            # 매핑 테이블에서 찾기 (순서대로 검사)
            for korean, english in name_mapping:
                if korean in cell_text and english not in column_map:
                    column_map[english] = idx
                    break

    return column_map


def parse_contract_row_by_columns(row: List[Optional[str]], column_map: Dict[str, int]) -> Optional[Dict[str, Any]]:
    """
    열 인덱스 매핑을 사용하여 테이블 행을 계약 정보로 파싱

    핵심: 헤더에서 동적으로 열 위치를 파악하여 추출
    - 상태값, 보험기간 등 하드코딩 없이 위치 기반 추출
    - 새로운 값이 나와도 자동 대응

    Args:
        row: 테이블 행 (각 셀은 문자열 또는 None)
        column_map: {열이름: 인덱스} 매핑

    Returns:
        dict: 계약 정보 또는 None (파싱 불가)
    """
    if not row:
        return None

    # None을 빈 문자열로 변환, 줄바꿈 제거
    cells = [str(c).replace('\n', '').strip() if c else '' for c in row]

    # 순번 확인 (필수)
    seq_idx = column_map.get('seq', 0)
    try:
        seq = int(cells[seq_idx])
    except (ValueError, TypeError, IndexError):
        return None  # 헤더 행이거나 데이터 아님

    # 증권번호 확인 (10자리 숫자)
    policy_idx = column_map.get('policyNumber', 1)
    policy_number = cells[policy_idx] if policy_idx < len(cells) else ''
    if not re.match(r'^\d{10}$', policy_number):
        return None

    # 계약일 확인 (YYYY-MM-DD)
    date_idx = column_map.get('contractDate')
    contract_date = ''
    if date_idx is not None and date_idx < len(cells):
        contract_date = cells[date_idx]
    else:
        # 열 매핑 없으면 패턴으로 찾기
        for cell in cells:
            if re.match(r'^\d{4}-\d{2}-\d{2}$', cell):
                contract_date = cell
                break

    if not contract_date:
        return None

    # 각 필드 열 위치 기반 추출 (하드코딩 없음)
    def get_cell(key: str, default: str = '') -> str:
        idx = column_map.get(key)
        if idx is not None and idx < len(cells):
            return cells[idx]
        return default

    product_name = get_cell('productName', '')
    contractor = get_cell('contractor', '')
    insured = get_cell('insured', '')
    status = get_cell('status', '')  # 하드코딩 없이 위치 기반 추출
    insurance_period = get_cell('insurancePeriod', '')  # 하드코딩 없이 위치 기반 추출
    payment_period = get_cell('paymentPeriod', '')  # 하드코딩 없이 위치 기반 추출

    # 가입금액 (숫자 파싱)
    coverage_str = get_cell('coverageAmount', '0')
    try:
        coverage_amount = float(coverage_str.replace(',', '')) if coverage_str else 0.0
    except ValueError:
        coverage_amount = 0.0

    # 보험료 (숫자 파싱)
    premium_str = get_cell('premium', '0')
    try:
        premium = int(premium_str.replace(',', '')) if premium_str else 0
    except ValueError:
        premium = 0

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
    import json
    import sys

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
