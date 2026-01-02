"""
Customer Review Service 판단 로직
PDF 1페이지를 읽고 Customer Review Service 문서 여부 판단 및 메타데이터 추출
"""
import os
import re
from typing import Dict
import logging

from utils.pdf_utils import extract_text_from_page, validate_pdf_file
from system_logger import send_error_log

logger = logging.getLogger(__name__)


def is_customer_review(pdf_path: str) -> Dict[str, any]:
    """
    PDF 1페이지를 읽고 Customer Review Service 문서 여부 판단

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        dict: {
            "is_customer_review": bool,
            "confidence": float,  # 0.0 ~ 1.0
            "reason": str,
            "matched_keywords": list
        }

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
    """
    logger.info(f"Customer Review 판단 시작: {os.path.basename(pdf_path)}")

    try:
        # 1. PDF 유효성 검증
        validation = validate_pdf_file(pdf_path)
        if not validation["valid"]:
            return {
                "is_customer_review": False,
                "confidence": 0.0,
                "reason": f"PDF 유효성 검증 실패: {validation.get('error')}",
                "matched_keywords": []
            }

        # 2. 1페이지 텍스트 추출
        try:
            first_page_text = extract_text_from_page(pdf_path, page_num=0)
        except Exception as e:
            logger.error(f"1페이지 텍스트 추출 실패: {e}")
            send_error_log("annual_report_api", f"CR 판단 - 1페이지 텍스트 추출 실패: {e}", e)
            return {
                "is_customer_review": False,
                "confidence": 0.0,
                "reason": f"텍스트 추출 실패: {str(e)}",
                "matched_keywords": []
            }

        # 2.5. 텍스트 정규화 (줄바꿈/공백 통합)
        # PDF에서 "Customer\nReview Service"로 추출되는 경우 처리
        normalized_text = re.sub(r'\s+', ' ', first_page_text)

        # 3. 필수 키워드 정의
        # 메트라이프 Customer Review Service 특징적인 키워드들
        required_keywords = [
            "Customer Review Service",
            "메트라이프"
        ]

        # 선택 키워드 (가중치 낮음)
        optional_keywords = [
            "변액",
            "적립금",
            "투자수익률",
            "펀드",
            "해지환급금",
            "계약자",
            "피보험자"
        ]

        # 4. 키워드 매칭 (정규화된 텍스트 사용)
        matched_required = [kw for kw in required_keywords if kw in normalized_text]
        matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

        all_matched = matched_required + matched_optional

        # 5. Confidence 점수 계산
        # 필수 키워드: 각 50% (총 100%)
        # 선택 키워드: 보너스 (최대 20%)
        required_score = (len(matched_required) / len(required_keywords)) * 1.0
        optional_bonus = (len(matched_optional) / len(optional_keywords)) * 0.2

        confidence = min(required_score + optional_bonus, 1.0)

        # 6. 판단 기준
        # "Customer Review Service" 필수 + 다른 키워드 1개 이상
        # 또는 confidence >= 0.7
        has_cr_keyword = "Customer Review Service" in normalized_text
        is_review = (has_cr_keyword and len(all_matched) >= 2) or confidence >= 0.7

        # 7. 결과 로깅
        if is_review:
            logger.info(
                f"✅ Customer Review 확인 (confidence: {confidence:.2f}): "
                f"{os.path.basename(pdf_path)}"
            )
            logger.debug(f"매칭된 키워드: {all_matched}")
        else:
            logger.info(
                f"❌ Customer Review 아님 (confidence: {confidence:.2f}): "
                f"{os.path.basename(pdf_path)}"
            )
            logger.debug(f"매칭된 키워드: {all_matched}")

        return {
            "is_customer_review": is_review,
            "confidence": round(confidence, 2),
            "reason": (
                f"키워드 매칭: {len(matched_required)}/{len(required_keywords)} 필수, "
                f"{len(matched_optional)}/{len(optional_keywords)} 선택"
            ),
            "matched_keywords": all_matched
        }

    except FileNotFoundError:
        logger.error(f"파일을 찾을 수 없습니다: {pdf_path}")
        raise

    except Exception as e:
        logger.error(f"Customer Review 판단 중 오류: {e}")
        send_error_log("annual_report_api", f"Customer Review 판단 중 오류: {e}", e)
        return {
            "is_customer_review": False,
            "confidence": 0.0,
            "reason": f"오류 발생: {str(e)}",
            "matched_keywords": []
        }


def extract_cr_metadata_from_first_page(pdf_path: str) -> Dict[str, str]:
    """
    Customer Review Service 1페이지에서 메타데이터 추출 (AI 불사용, 간단한 텍스트 파싱)

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        dict: {
            "product_name": str (optional),       # 상품명
            "issue_date": str (optional),         # 발행일 (YYYY-MM-DD 형식)
            "contractor_name": str (optional),    # 계약자
            "insured_name": str (optional),       # 피보험자
            "death_beneficiary": str (optional),  # 사망 수익자
            "fsr_name": str (optional)            # FSR 이름
        }
    """
    try:
        first_page_text = extract_text_from_page(pdf_path, page_num=0)

        result = {}

        # 1. 상품명 추출
        # 패턴: "무) 실버플랜 변액유니버셜V보험(일시납) 종신, 0년납"
        # "무)" 또는 "유)" 로 시작하는 상품명
        product_pattern = r"([무유]\)\s*[^\n]+(?:종신|년납|만기)[^\n]*)"
        product_match = re.search(product_pattern, first_page_text)
        if product_match:
            result["product_name"] = product_match.group(1).strip()
        else:
            # 대체 패턴: 변액 보험 상품명
            alt_product_pattern = r"([가-힣]+\s*변액[^\n]+보험[^\n]*)"
            alt_match = re.search(alt_product_pattern, first_page_text)
            if alt_match:
                result["product_name"] = alt_match.group(1).strip()

        # 2. 발행(기준)일 추출
        # 패턴: "발행(기준)일: 2025년 9월 9일" 또는 "발행일: 2025년 9월 9일"
        date_pattern = r"발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
        date_match = re.search(date_pattern, first_page_text)
        if date_match:
            year, month, day = date_match.groups()
            result["issue_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        else:
            # 대체 패턴: 일반 날짜
            alt_date_pattern = r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
            alt_date_match = re.search(alt_date_pattern, first_page_text)
            if alt_date_match:
                year, month, day = alt_date_match.groups()
                result["issue_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        # 3. 계약자 추출
        # 패턴: "계약자 : 고영자" 또는 "계약자: 고영자"
        contractor_pattern = r"계약자\s*[:\s]+([가-힣]{2,4})"
        contractor_match = re.search(contractor_pattern, first_page_text)
        if contractor_match:
            result["contractor_name"] = contractor_match.group(1).strip()

        # 4. 피보험자 추출
        # 패턴: "피보험자 : 유진호" 또는 "피보험자: 유진호"
        insured_pattern = r"피보험자\s*[:\s]+([가-힣]{2,4})"
        insured_match = re.search(insured_pattern, first_page_text)
        if insured_match:
            result["insured_name"] = insured_match.group(1).strip()

        # 5. 사망 수익자 추출
        # 패턴: "사망 수익자 : 상속인" 또는 "사망수익자: 상속인"
        beneficiary_pattern = r"사망\s*수익자\s*[:\s]+([가-힣]{2,6})"
        beneficiary_match = re.search(beneficiary_pattern, first_page_text)
        if beneficiary_match:
            result["death_beneficiary"] = beneficiary_match.group(1).strip()

        # 6. FSR 이름 추출
        # 패턴 1: "송유미FSR" 또는 "송 유 미 FSR"
        fsr_pattern1 = r"([가-힣]{2,4})\s*FSR"
        fsr_match1 = re.search(fsr_pattern1, first_page_text)
        if fsr_match1:
            result["fsr_name"] = fsr_match1.group(1).replace(" ", "").strip()
        else:
            # 패턴 2: "송 유 미\nFSR" (이름이 FSR 위에 있는 경우)
            fsr_pattern2 = r"([가-힣]\s*[가-힣]\s*[가-힣])\s*\n\s*FSR"
            fsr_match2 = re.search(fsr_pattern2, first_page_text)
            if fsr_match2:
                result["fsr_name"] = fsr_match2.group(1).replace(" ", "").strip()

        logger.info(f"📄 Customer Review 1페이지 메타데이터 추출: {result}")
        return result

    except Exception as e:
        logger.warning(f"Customer Review 1페이지 메타데이터 추출 실패: {e}")
        return {}
