"""
AR/CRS 파일명에서 메타데이터 추출
파일명 = Source of Truth (PDF 분석 결과가 인코딩된 이름)
"""
import logging
import re

logger = logging.getLogger(__name__)


def parse_ar_filename(filename: str) -> dict:
    """
    AR 파일명에서 메타데이터 추출
    형식: {고객명}_AR_{YYYY-MM-DD}.pdf

    Returns: {"customer_name": str, "issue_date": str} or {}
    """
    if not filename:
        return {}

    # .pdf 확장자 제거 (대소문자 무관)
    name = re.sub(r'\.pdf$', '', filename, flags=re.IGNORECASE)

    # _AR_ 마커로 분할
    match = re.match(r'^(.+?)_AR_(\d{4}-\d{2}-\d{2})$', name)
    if not match:
        logger.warning(f"AR 파일명 파싱 실패: {filename}")
        return {}

    result = {
        "customer_name": match.group(1),
        "issue_date": match.group(2)
    }
    logger.info(f"AR 파일명 파싱 성공: {result}")
    return result


def parse_crs_filename(filename: str) -> dict:
    """
    CRS 파일명에서 메타데이터 추출 (끝에서부터 역방향 파싱)
    형식: {고객명}_CRS_{상품명}_{증권번호}_{YYYY-MM-DD}.pdf

    Returns: {"customer_name": str, "product_name": str,
              "policy_number": str, "issue_date": str} or {}
    """
    if not filename:
        return {}

    # .pdf 확장자 제거
    name = re.sub(r'\.pdf$', '', filename, flags=re.IGNORECASE)

    # 1단계: 끝에서 날짜 추출 (_YYYY-MM-DD)
    date_match = re.search(r'_(\d{4}-\d{2}-\d{2})$', name)
    if not date_match:
        logger.warning(f"CRS 파일명 날짜 파싱 실패: {filename}")
        return {}

    issue_date = date_match.group(1)
    name = name[:date_match.start()]

    # 2단계: 끝에서 증권번호 추출 (_숫자8~15자리)
    policy_match = re.search(r'_(\d{8,15})$', name)
    if not policy_match:
        logger.warning(f"CRS 파일명 증권번호 파싱 실패: {filename}")
        return {}

    policy_number = policy_match.group(1)
    name = name[:policy_match.start()]

    # 3단계: _CRS_ 마커로 분할 → 고객명 + 상품명
    crs_idx = name.find('_CRS_')
    if crs_idx == -1:
        logger.warning(f"CRS 파일명 _CRS_ 마커 없음: {filename}")
        return {}

    customer_name = name[:crs_idx]
    product_name = name[crs_idx + 5:]  # len('_CRS_') == 5

    result = {
        "customer_name": customer_name,
        "product_name": product_name,
        "policy_number": policy_number,
        "issue_date": issue_date
    }
    logger.info(f"CRS 파일명 파싱 성공: {result}")
    return result
