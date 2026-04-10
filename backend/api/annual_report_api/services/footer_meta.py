"""
Footer 메타데이터 추출 모듈 (Phase 5 + Phase 5.5)

목적
----
- Phase 5:  텍스트형 + 표지 없음 AR PDF의 **푸터** 텍스트에서 발행일/FSR/보험사 메타를 추출
- Phase 5.5: 이미지형 AR에서 Upstage OCR 결과(`files.meta.full_text`) 텍스트를
             입력으로 받아 동일 정규식으로 누락 메타(특히 고객명 포함)를 보강.

두 경로 모두 **동일한 순수 정규식 매칭 로직**을 공유한다.
- `extract_footer_meta_from_text(text)` — 순수 텍스트 입력 (Phase 5.5 신규)
- `extract_footer_meta(pdf_path)`       — pdfplumber로 텍스트를 뽑은 뒤 위 함수를 호출

호출자 계약
----------
- 반환 dict 키 (Phase 5.5 확장):
    {"issue_date", "fsr_name", "company_name", "customer_name"}
- 매칭 실패 키는 None.
- 입력이 비어있거나 내부 예외가 발생해도 항상 **빈 dict({})** 혹은
  **모든 값이 None인 dict**를 반환한다. (호출자는 None 체크만 하면 됨)
- OpenAI/Upstage 등 외부 API를 절대 호출하지 않는다 (오프라인 결정적 동작).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# 정규식 / 화이트리스트 (Phase 5와 Phase 5.5가 공유)
# ─────────────────────────────────────────────────────────────

# 보험사 화이트리스트 (확장 가능)
# 정규식 → 정규화된 이름 매핑. 앞에서부터 순서대로 매칭한다.
# 주의: 더 구체적인 패턴을 먼저 배치 (예: "메트라이프생명"을 "MetLife"보다 먼저).
COMPANY_WHITELIST: list[tuple[str, str]] = [
    (r"메트라이프\s*생명", "메트라이프생명"),
    (r"MetLife", "MetLife"),
    (r"삼성\s*생명", "삼성생명"),
    (r"한화\s*생명", "한화생명"),
    (r"교보\s*생명", "교보생명"),
    (r"신한\s*라이프", "신한라이프"),
    (r"동양\s*생명", "동양생명"),
    (r"흥국\s*생명", "흥국생명"),
    (r"ABL\s*생명", "ABL생명"),
    (r"KB\s*라이프", "KB라이프"),
    (r"푸본\s*현대\s*생명", "푸본현대생명"),
    (r"iM\s*라이프", "iM라이프"),
]

# 발행(기준)일 패턴 — Phase 3-C PoC에서 확인한 실제 푸터 표기
# 예: "발행(기준)일 : 2025년 9월 10일", "발행 기준 일 : 2025년 09월 05일"
ISSUE_DATE_PATTERN = re.compile(
    r"발행\s*\(?\s*기준\s*\)?\s*일\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일"
)

# FSR 이름 패턴 — 푸터의 "담당 : 홍길동 FSR" (공백 섞인 이름 허용)
FSR_PATTERN = re.compile(
    r"담당\s*[:：]\s*([가-힣](?:\s*[가-힣]){1,3})\s*FSR"
)

# 고객명(피보험자) 패턴 — Phase 5.5 신규
# 실제 본문 텍스트 예 (이불/마리치 계열 AR):
#   "김보성 6\n님을 피보험자로 하는 보유계약은 현재 건이며,"
#   "송연 님은 ... 보유계약은 현재 ..."
# OCR 결과에서는 이름과 "님을" 사이에 공백/숫자/개행이 섞여 있을 수 있다.
# 숫자/공백/개행은 허용하되 한글 2~4자만 이름 후보로 포획한다.
CUSTOMER_NAME_PEER_PATTERN = re.compile(
    # 유계 quantifier {0,20}로 ReDoS 방지. 이름과 "님을" 사이에는
    # 공백/숫자/개행이 들어갈 수 있으나 20자를 초과하면 다른 문맥이다.
    r"([가-힣]{2,4})[\s\d\n]{0,20}님을\s*피보험자로\s*하는"
)
CUSTOMER_NAME_HOLDER_PATTERN = re.compile(
    r"([가-힣]{2,4})\s*님은[^\n]{0,40}보유계약은\s*현재"
)


# ─────────────────────────────────────────────────────────────
# 내부 매칭 헬퍼
# ─────────────────────────────────────────────────────────────

def _match_issue_date(text: str) -> Optional[str]:
    """푸터 발행일 정규식 매칭 → 'YYYY-MM-DD' 또는 None."""
    m = ISSUE_DATE_PATTERN.search(text)
    if not m:
        return None
    year, month, day = m.groups()
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"


def _match_fsr(text: str) -> Optional[str]:
    """푸터 FSR 이름 매칭 → 공백 제거한 한글 이름 또는 None."""
    m = FSR_PATTERN.search(text)
    if not m:
        return None
    return m.group(1).replace(" ", "").strip()


def _match_company(text: str) -> Optional[str]:
    """화이트리스트 기반 보험사 매칭. 미매칭 → None (억지 매칭 금지)."""
    for pattern, canonical in COMPANY_WHITELIST:
        if re.search(pattern, text):
            return canonical
    return None


def _match_customer_name(text: str) -> Optional[str]:
    """
    본문 고객명(피보험자) 매칭. 두 패턴 중 먼저 매칭되는 것을 채택.
    - "XX [숫자?] 님을 피보험자로 하는" (peer)
    - "XX 님은 ... 보유계약은 현재" (holder)
    """
    m = CUSTOMER_NAME_PEER_PATTERN.search(text)
    if m:
        return m.group(1).strip()
    m = CUSTOMER_NAME_HOLDER_PATTERN.search(text)
    if m:
        return m.group(1).strip()
    return None


# ─────────────────────────────────────────────────────────────
# PDF → 텍스트 (Phase 5 전용 경로)
# ─────────────────────────────────────────────────────────────

def _extract_all_text(pdf_path: str) -> Optional[str]:
    """
    pdfplumber로 PDF 전체 페이지 텍스트를 결합해서 반환.

    실패(라이브러리 미설치, 손상, 이미지 PDF 등) → None.
    """
    if not os.path.exists(pdf_path):
        logger.warning(f"[footer_meta] PDF 파일 없음: {pdf_path}")
        return None
    try:
        import pdfplumber  # 지연 import — 모듈 import 실패 방어
    except ImportError as e:
        logger.error(f"[footer_meta] pdfplumber import 실패: {e}")
        return None

    try:
        texts: list[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                try:
                    t = page.extract_text() or ""
                except Exception as pe:
                    logger.debug(f"[footer_meta] 페이지 추출 실패(건너뜀): {pe}")
                    continue
                if t:
                    texts.append(t)
        return "\n".join(texts) if texts else ""
    except Exception as e:
        logger.warning(f"[footer_meta] pdfplumber 전체 추출 실패: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# 공개 API
# ─────────────────────────────────────────────────────────────

def extract_footer_meta_from_text(text: Optional[str]) -> Dict[str, Optional[str]]:
    """
    주어진 텍스트에서 푸터/본문 메타를 추출한다 (Phase 5.5 신규).

    Args:
        text: 매칭 대상 텍스트 (pdfplumber 추출 결과, OCR full_text 등).
              None/빈 문자열이면 빈 dict 반환.

    Returns:
        dict: {
            "issue_date":    "YYYY-MM-DD" | None,
            "fsr_name":      str | None,
            "company_name":  str | None,
            "customer_name": str | None,
        }
        텍스트가 비어있거나 예외 발생 시 **빈 dict({})**.
    """
    if text is None or text == "":
        return {}
    try:
        return {
            "issue_date": _match_issue_date(text),
            "fsr_name": _match_fsr(text),
            "company_name": _match_company(text),
            "customer_name": _match_customer_name(text),
        }
    except Exception as e:
        # 방어선: 호출자 계약 "실패해도 빈 dict 반환" 보장
        logger.warning(f"[footer_meta] 텍스트 매칭 중 예외 → 빈 dict: {e}")
        return {}


def extract_footer_meta(pdf_path: str) -> Dict[str, Optional[str]]:
    """
    텍스트형 PDF 전체에서 푸터 메타 정보를 추출한다 (Phase 5 경로).

    내부적으로 pdfplumber로 전체 텍스트를 추출한 뒤
    `extract_footer_meta_from_text`로 위임한다. (DRY)

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        dict: extract_footer_meta_from_text 반환 포맷과 동일.
              - pdfplumber가 동작 불가하거나 텍스트가 전혀 없으면 빈 dict({}) 반환.
              - 개별 필드 미매칭은 None.
    """
    try:
        text = _extract_all_text(pdf_path)
        if text is None or text == "":
            logger.info(
                f"[footer_meta] 텍스트 추출 불가 → 빈 dict 반환: "
                f"{os.path.basename(pdf_path) if pdf_path else pdf_path}"
            )
            return {}
        result = extract_footer_meta_from_text(text)
        # PII(고객명/FSR)가 평문으로 찍히지 않도록 매칭 여부만 info, 값은 debug.
        logger.info(
            "[footer_meta] 추출 완료 — issue_date=%s fsr=%s company=%s customer=%s",
            "Y" if result.get("issue_date") else "N",
            "Y" if result.get("fsr_name") else "N",
            "Y" if result.get("company_name") else "N",
            "Y" if result.get("customer_name") else "N",
        )
        logger.debug(f"[footer_meta] 상세 결과(debug): {result}")
        return result
    except Exception as e:
        # 최상위 방어선 — 호출자 계약 "실패해도 빈 dict 반환" 보장
        logger.warning(f"[footer_meta] 예상치 못한 예외 → 빈 dict: {e}")
        return {}
