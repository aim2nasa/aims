"""
Annual Report 판단 로직
PDF 1페이지를 읽고 Annual Report 여부 판단
"""
import logging
import os
from typing import Dict

from system_logger import send_error_log
from utils.pdf_utils import extract_text_from_page, validate_pdf_file

logger = logging.getLogger(__name__)


def is_annual_report(pdf_path: str) -> Dict[str, any]:
    """
    PDF 1페이지를 읽고 Annual Report 여부 판단

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        dict: {
            "is_annual_report": bool,
            "confidence": float,  # 0.0 ~ 1.0
            "reason": str,
            "matched_keywords": list
        }

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
    """
    logger.info(f"Annual Report 판단 시작: {os.path.basename(pdf_path)}")

    try:
        # 1. PDF 유효성 검증
        validation = validate_pdf_file(pdf_path)
        if not validation["valid"]:
            return {
                "is_annual_report": False,
                "confidence": 0.0,
                "reason": f"PDF 유효성 검증 실패: {validation.get('error')}",
                "matched_keywords": []
            }

        # 2. 1페이지 텍스트 추출
        try:
            first_page_text = extract_text_from_page(pdf_path, page_num=0)
        except Exception as e:
            logger.error(f"1페이지 텍스트 추출 실패: {e}")
            send_error_log("annual_report_api", f"AR 판단 - 1페이지 텍스트 추출 실패: {e}", e)
            return {
                "is_annual_report": False,
                "confidence": 0.0,
                "reason": f"텍스트 추출 실패: {str(e)}",
                "matched_keywords": []
            }

        # 3. 필수 키워드 정의
        # 메트라이프 Annual Report 특징적인 키워드들
        required_keywords = [
            "Annual Review Report",
            "보유계약 현황",
            "메트라이프생명"
        ]

        # 선택 키워드 (가중치 낮음)
        optional_keywords = [
            "고객님의 보험계약",
            "보험료",
            "계약일",
            "계약상태",
            "증권번호"
        ]

        # 4. 키워드 매칭
        matched_required = [kw for kw in required_keywords if kw in first_page_text]
        matched_optional = [kw for kw in optional_keywords if kw in first_page_text]

        all_matched = matched_required + matched_optional

        # 5. Confidence 점수 계산
        # 필수 키워드: 각 33.3% (총 100%)
        # 선택 키워드: 보너스 (최대 20%)
        required_score = (len(matched_required) / len(required_keywords)) * 1.0
        optional_bonus = (len(matched_optional) / len(optional_keywords)) * 0.2

        confidence = min(required_score + optional_bonus, 1.0)

        # 6. 판단 기준
        # 필수 키워드 2개 이상 또는 confidence >= 0.8
        is_report = len(matched_required) >= 2 or confidence >= 0.8

        # 7. 결과 로깅
        if is_report:
            logger.info(
                f"✅ Annual Report 확인 (confidence: {confidence:.2f}): "
                f"{os.path.basename(pdf_path)}"
            )
            logger.debug(f"매칭된 키워드: {all_matched}")
        else:
            logger.info(
                f"❌ Annual Report 아님 (confidence: {confidence:.2f}): "
                f"{os.path.basename(pdf_path)}"
            )
            logger.debug(f"매칭된 키워드: {all_matched}")

        return {
            "is_annual_report": is_report,
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
        logger.error(f"Annual Report 판단 중 오류: {e}")
        send_error_log("annual_report_api", f"Annual Report 판단 중 오류: {e}", e)
        return {
            "is_annual_report": False,
            "confidence": 0.0,
            "reason": f"오류 발생: {str(e)}",
            "matched_keywords": []
        }


def extract_customer_info_from_first_page(pdf_path: str, original_filename: str = None) -> Dict[str, str]:
    """
    1페이지에서 메타데이터 추출 (AI 불사용, 간단한 텍스트 파싱)

    Args:
        pdf_path: PDF 파일 경로
        original_filename: 원본 파일명 (Source of Truth, 한글/영문 모두 지원)

    Returns:
        dict: {
            "customer_name": str (optional),
            "report_title": str (optional),
            "issue_date": str (optional, YYYY-MM-DD 형식),
            "fsr_name": str (optional)
        }
    """
    try:
        first_page_text = extract_text_from_page(pdf_path, page_num=0)

        result = {}
        import re

        # 1. 고객명 추출: "Annual" 키워드가 포함된 줄의 바로 위 줄에서 추출 (🔴 파일명 사용 절대 금지!)
        # PDF 포맷: "{NAME} 고객님을 위한\nAnnual Review Report"
        # 에뮬레이션 파일: "MetLife\n{NAME} 고객님을 위한\nAnnual Review Report"
        # → "Annual" 위 줄 = "{NAME} 고객님을 위한" → 고객명 추출
        lines = first_page_text.split('\n')
        for i, line in enumerate(lines):
            if 'Annual' in line:
                if i > 0:
                    name_line = lines[i - 1].strip()
                    go_idx = name_line.find(' 고')
                    if go_idx > 0:
                        name = name_line[:go_idx]
                    else:
                        space_idx = name_line.find(' ')
                        name = name_line[:space_idx] if space_idx > 0 else name_line
                    if len(name) >= 2:
                        result["customer_name"] = name
                        logger.info(f"📄 고객명 추출 (Annual 위 줄): {name}")
                break

        # 2. Report 제목 추출 (예: "Annual Review Report")
        title_pattern = r"(Annual\s+Review\s+Report)"
        title_match = re.search(title_pattern, first_page_text, re.IGNORECASE)
        if title_match:
            result["report_title"] = title_match.group(1).strip()
        else:
            # fallback: 한글 제목 (예: "보유계약 현황")
            title_pattern_kr = r"(보유계약\s*현황)"
            title_match_kr = re.search(title_pattern_kr, first_page_text)
            if title_match_kr:
                result["report_title"] = title_match_kr.group(1).strip()

        # 3. 발행기준일 추출 (예: "2025년 8월 27일")
        date_pattern = r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
        date_match = re.search(date_pattern, first_page_text)
        if date_match:
            year, month, day = date_match.groups()
            # YYYY-MM-DD 형식으로 변환
            result["issue_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        # 4. FSR 이름 추출
        # 패턴 1: "송 유 미\nFSR" (이름이 FSR 위에 있는 경우, 공백 포함)
        fsr_pattern1 = r"([가-힣]\s*[가-힣]\s*[가-힣])\s*\n\s*FSR"
        fsr_match1 = re.search(fsr_pattern1, first_page_text)
        if fsr_match1:
            # 공백 제거: "송 유 미" -> "송유미"
            result["fsr_name"] = fsr_match1.group(1).replace(" ", "").strip()
        else:
            # 패턴 2: "FSR: 홍길동" 또는 "담당자: 홍길동" (이름이 FSR 뒤에 있는 경우)
            fsr_pattern2 = r"(?:FSR|담당자|설계사)[:\s]*([가-힣]{2,4})"
            fsr_match2 = re.search(fsr_pattern2, first_page_text)
            if fsr_match2:
                result["fsr_name"] = fsr_match2.group(1).strip()

        logger.info(f"📄 1페이지 메타데이터 추출: {result}")
        return result

    except Exception as e:
        logger.warning(f"1페이지 메타데이터 추출 실패: {e}")
        return {}
