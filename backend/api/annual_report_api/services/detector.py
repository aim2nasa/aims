"""
Annual Report 판단 로직
PDF 1페이지를 읽고 Annual Report 여부 판단
"""
import logging
import os
from typing import Dict, Optional

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

        # 3. 키워드 정의 (보험사 중립 — 메트라이프뿐 아니라 다른 보험사 AR도 감지)
        # 제목 키워드: 이 중 하나라도 있으면 AR 후보
        title_keywords = [
            "Annual Review Report",
            "보유계약 현황"
        ]

        # 필드 키워드: AR 본문에 일반적으로 나타나는 계약 테이블 필드명
        field_keywords = [
            "증권번호",
            "계약자",
            "피보험자",
            "보험료",
            "계약일",
            "계약상태",
            "보험상품",
            "보험기간",
            "납입기간"
        ]

        # 4. 키워드 매칭
        matched_title = [kw for kw in title_keywords if kw in first_page_text]
        matched_fields = [kw for kw in field_keywords if kw in first_page_text]

        all_matched = matched_title + matched_fields

        # 5. Confidence 점수 계산
        # 제목 키워드: 최대 60% (1개=60%, 2개=60%)
        # 필드 키워드: 최대 40% (보너스)
        title_score = 0.6 if len(matched_title) >= 1 else 0.0
        field_score = min(len(matched_fields) / 5.0, 1.0) * 0.4

        confidence = min(title_score + field_score, 1.0)

        # 6. 판단 기준
        # (표지 있음) 제목 키워드 1개 이상 + 필드 키워드 2개 이상
        # (표지 없음) 제목 키워드 '보유계약 현황' + 필드 키워드 2개 이상
        # → 통합: 제목 1개 이상 + 필드 2개 이상
        is_report = len(matched_title) >= 1 and len(matched_fields) >= 2

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
                f"키워드 매칭: {len(matched_title)}/{len(title_keywords)} 제목, "
                f"{len(matched_fields)}/{len(field_keywords)} 필드"
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


def has_cover_page(pdf_path: str) -> bool:
    """
    AR의 1페이지가 표지(cover)인지 판단

    표지 판별 기준:
        - "Annual Review Report" AND "고객님을 위한" 동시 포함 → 표지 있음
        - 그 외 → 표지 없음 (본문이 1페이지부터 시작)

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        bool: True면 표지 있음, False면 표지 없음
    """
    try:
        first_page_text = extract_text_from_page(pdf_path, page_num=0)
        has_title = "Annual Review Report" in first_page_text
        has_greeting = "고객님을 위한" in first_page_text
        result = has_title and has_greeting
        logger.info(
            f"📄 표지 판별: has_cover={result} "
            f"(title={has_title}, greeting={has_greeting}) — {os.path.basename(pdf_path)}"
        )
        return result
    except Exception as e:
        logger.warning(f"표지 판별 실패, 기본값 True 사용: {e}")
        return True


def extract_customer_info_from_first_page(pdf_path: str) -> Dict[str, str]:
    """
    1페이지에서 메타데이터 추출 (AI 불사용, 간단한 텍스트 파싱)

    Args:
        pdf_path: PDF 파일 경로

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

        # 1-b. Fallback: 표지 없는 AR 대응
        # "{고객명} 님은" 또는 "{고객명} 님의" 패턴 (본문 인사말에 주로 등장)
        if "customer_name" not in result:
            name_fallback = re.search(r"([가-힣]{2,4})\s*님[은의]", first_page_text)
            if name_fallback:
                result["customer_name"] = name_fallback.group(1).strip()
                logger.info(f"📄 고객명 추출 (님은/님의 fallback): {result['customer_name']}")

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

        # 3. 발행기준일 추출
        # 우선순위 1: "발행(기준)일 : 2025년 8월 28일" 패턴 (표지 및 본문 푸터에서 주로 등장)
        issue_date_pattern = r"발행\s*(?:\(기준\))?\s*일\s*[:：]?\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
        issue_date_match = re.search(issue_date_pattern, first_page_text)
        if issue_date_match:
            year, month, day = issue_date_match.groups()
            result["issue_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        else:
            # 우선순위 2: 일반 날짜 패턴 (fallback)
            date_pattern = r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
            date_match = re.search(date_pattern, first_page_text)
            if date_match:
                year, month, day = date_match.groups()
                result["issue_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        # 4. FSR 이름 추출
        # 패턴 0: "담당 : 송유미 FSR" 또는 "담당: 송 유 미 FSR" (푸터 한 줄 형식)
        fsr_pattern0 = r"담당\s*[:：]?\s*([가-힣](?:\s*[가-힣]){1,3})\s*FSR"
        fsr_match0 = re.search(fsr_pattern0, first_page_text)
        if fsr_match0:
            result["fsr_name"] = fsr_match0.group(1).replace(" ", "").strip()
        else:
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
                else:
                    # 패턴 3: "송유미FSR" (공백 없이 붙은 경우, 푸터에서 흔함)
                    fsr_pattern3 = r"([가-힣]{2,4})\s*FSR"
                    fsr_match3 = re.search(fsr_pattern3, first_page_text)
                    if fsr_match3:
                        result["fsr_name"] = fsr_match3.group(1).strip()

        # 5. 보험사명 추출 (푸터 로고 텍스트 또는 본문 내 보험사명)
        # "메트라이프생명", "MetLife" 등
        insurer_patterns = [
            (r"메트라이프\s*생명", "메트라이프생명"),
            (r"MetLife", "MetLife"),
            (r"([가-힣]{2,10}생명보험\s*주식회사)", None),
            (r"([가-힣]{2,10}\s*생명)", None),
        ]
        for pat, fixed_name in insurer_patterns:
            m = re.search(pat, first_page_text)
            if m:
                result["insurer_name"] = fixed_name if fixed_name else m.group(1).strip()
                break

        logger.info(f"📄 1페이지 메타데이터 추출: {result}")
        return result

    except Exception as e:
        logger.warning(f"1페이지 메타데이터 추출 실패: {e}")
        return {}


def extract_ar_meta(
    pdf_path: str,
    has_cover: bool = True,
    ocr_text: Optional[str] = None,
) -> Dict[str, str]:
    """
    AR PDF에서 메타데이터를 추출한다 (Phase 5 + Phase 5.5 통합 진입점).

    동작
    ----
    1. 표지 기반 추출(`extract_customer_info_from_first_page`)을 먼저 시도.
       (이미지 PDF여서 텍스트 레이어가 없으면 대부분 빈 dict)
    2. 누락 필드가 있으면 **푸터 폴백** 2단 시도:
         2-a. 텍스트 레이어(pdfplumber) 기반 — `extract_footer_meta(pdf_path)`
         2-b. OCR 텍스트 기반 — `extract_footer_meta_from_text(ocr_text)`
              (Phase 5.5: 이미지 PDF에서 `files.meta.full_text` 전달 시)
    3. 우선순위: 표지 결과 > 텍스트 푸터 > OCR 푸터.
       누락 키만 하위 원천에서 **백필**하므로 상위 원천 값을 덮어쓰지 않는다.

    백필 대상 필드:
        - issue_date
        - fsr_name
        - insurer_name  (footer_meta는 내부적으로 `company_name` 키 사용)
        - customer_name (Phase 5.5 — OCR 본문 "XX 님을 피보험자로 하는" 패턴)

    Args:
        pdf_path: PDF 파일 경로
        has_cover: 표지 유무. False여도 표지 추출을 먼저 시도하여
                   기존 fallback 로직(님은/님의 등)을 재사용한다.
                   False일 때는 푸터 폴백이 더 적극적으로 동작한다.
        ocr_text: 이미지 PDF의 OCR 결과 전문 (files.meta.full_text).
                  None이면 OCR 폴백은 건너뛴다. Phase 5.5 신규.

    Returns:
        dict: customer_name/report_title/issue_date/fsr_name/insurer_name 중
              추출된 키만 포함. 실패 시 빈 dict.
    """
    # 1. 표지(또는 1페이지) 기반 추출
    # 이미지 PDF면 내부에서 pdfplumber 텍스트가 비어있어 {} 또는 부분 결과.
    try:
        result: Dict[str, str] = extract_customer_info_from_first_page(pdf_path)
    except Exception as e:
        logger.warning(f"extract_customer_info_from_first_page 실패: {e}")
        result = {}

    def _needs_fallback() -> bool:
        return (
            not result.get("issue_date")
            or not result.get("fsr_name")
            or not result.get("insurer_name")
            or not result.get("customer_name")
        )

    # 표지가 없는 것으로 판단되면 항상 푸터 폴백 시도 (적극적)
    need_fallback = _needs_fallback() or (not has_cover)

    if not need_fallback and not ocr_text:
        return result

    # 2-a. 텍스트 푸터 폴백 (pdfplumber 경로)
    if need_fallback:
        try:
            from services.footer_meta import extract_footer_meta
            footer = extract_footer_meta(pdf_path) or {}
        except Exception as e:
            logger.warning(f"footer_meta(pdf) 폴백 실패: {e}")
            footer = {}

        _merge_footer_into_result(result, footer, source="pdf-footer")

    # 2-b. OCR 텍스트 폴백 (Phase 5.5 — 이미지 PDF 경로)
    # ocr_text가 주어졌고 여전히 누락 필드가 있으면 시도한다.
    if ocr_text and _needs_fallback():
        try:
            from services.footer_meta import extract_footer_meta_from_text
            ocr_meta = extract_footer_meta_from_text(ocr_text) or {}
        except Exception as e:
            logger.warning(f"footer_meta(ocr_text) 폴백 실패: {e}")
            ocr_meta = {}

        _merge_footer_into_result(result, ocr_meta, source="ocr-text")

    return result


def _merge_footer_into_result(
    result: Dict[str, str],
    footer: Dict[str, Optional[str]],
    source: str,
) -> None:
    """
    footer_meta 결과를 result에 **누락 필드만** 백필한다 (in-place).

    Args:
        result: 표지 추출 결과 + 상위 백필까지 반영된 dict
        footer: extract_footer_meta / extract_footer_meta_from_text 결과
        source: 로그용 식별자 ("pdf-footer" | "ocr-text")
    """
    if not footer:
        return

    if not result.get("issue_date") and footer.get("issue_date"):
        result["issue_date"] = footer["issue_date"]
        logger.info(f"📄 issue_date {source} 폴백 적용")

    if not result.get("fsr_name") and footer.get("fsr_name"):
        result["fsr_name"] = footer["fsr_name"]
        logger.info(f"📄 fsr_name {source} 폴백 적용")

    if not result.get("insurer_name") and footer.get("company_name"):
        result["insurer_name"] = footer["company_name"]
        logger.info(f"📄 insurer_name {source} 폴백 적용")

    # Phase 5.5: customer_name 백필 (본문 "XX 님을 피보험자로 하는" 패턴)
    if not result.get("customer_name") and footer.get("customer_name"):
        result["customer_name"] = footer["customer_name"]
        logger.info(f"📄 customer_name {source} 폴백 적용")
