#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 분류 및 메타데이터 추출 모듈
AR(Annual Report)과 CRS(Customer Review Service/변액리포트) PDF를 분류하고
고객명, 상품명, 발행일 등 메타데이터를 추출한다.

추출 패턴은 aims-uix3 pdfParser.ts 및 doc_prep_main.py에서 검증된 로직을 재사용한다.
"""

import re
from pathlib import Path
from dataclasses import dataclass, field

try:
    from pdfminer.high_level import extract_text
except ImportError:
    extract_text = None  # GUI에서 설치 안내

# ──────────────────────────────────────────────
# 데이터 구조
# ──────────────────────────────────────────────

@dataclass
class PDFMetadata:
    """PDF 분류 및 메타데이터 결과"""
    file_path: Path
    doc_type: str = "UNKNOWN"       # 'AR', 'CRS', 'UNKNOWN'
    confidence: float = 0.0         # 0.0 ~ 1.0
    customer_name: str = ""         # 고객명 (폴더명으로 사용)
    readable_title: str = ""        # 읽기 쉬운 제목 (displayName)
    new_filename: str = ""          # 새 파일명
    issue_date: str = ""            # YYYY-MM-DD
    product_name: str = ""          # 상품명 (CRS only)
    error_message: str = ""


# ──────────────────────────────────────────────
# PDF 텍스트 추출
# ──────────────────────────────────────────────

def extract_first_page_text(pdf_path: Path) -> str:
    """PDF 첫 페이지 텍스트 추출 (pdfminer.six)"""
    if extract_text is None:
        raise ImportError("pdfminer.six가 설치되어 있지 않습니다. pip install pdfminer.six")
    return extract_text(str(pdf_path), page_numbers=[0]) or ""


# ──────────────────────────────────────────────
# AR (Annual Report) 감지
# ──────────────────────────────────────────────

# 키워드 정의 (detector.py:61-74, pdfParser.ts:118-119)
AR_REQUIRED_KEYWORDS = ["Annual Review Report"]
AR_OPTIONAL_KEYWORDS = ["보유계약 현황", "MetLife", "고객님을 위한", "메트라이프생명", "메트라이프"]


def detect_annual_report(text: str) -> dict:
    """
    AR 여부 판단.
    필수 키워드 + 선택 키워드 1개 이상 → AR 확정.

    Returns:
        {"is_ar": bool, "confidence": float, "matched": list}
    """
    normalized = re.sub(r"\s+", " ", text)
    matched_req = [kw for kw in AR_REQUIRED_KEYWORDS if kw in normalized]
    matched_opt = [kw for kw in AR_OPTIONAL_KEYWORDS if kw in normalized]

    is_ar = len(matched_req) > 0 and len(matched_opt) > 0
    confidence = 1.0 if is_ar else (0.3 if matched_req else 0.0)

    return {
        "is_ar": is_ar,
        "confidence": confidence,
        "matched": matched_req + matched_opt,
    }


# ──────────────────────────────────────────────
# CRS (Customer Review Service / 변액리포트) 감지
# ──────────────────────────────────────────────

# 키워드 정의 (doc_prep_main.py:456-472, pdfParser.ts checkCustomerReviewFromPDF)
CRS_REQUIRED_KEYWORDS = ["Customer Review Service"]
CRS_OPTIONAL_KEYWORDS = ["메트라이프", "변액", "적립금", "투자수익률", "펀드", "해지환급금"]


def detect_customer_review(text: str) -> dict:
    """
    CRS 여부 판단.
    필수 키워드 + 선택 키워드 1개 이상 → CRS 확정.

    Returns:
        {"is_crs": bool, "confidence": float, "matched": list}
    """
    normalized = re.sub(r"\s+", " ", text)
    matched_req = [kw for kw in CRS_REQUIRED_KEYWORDS if kw in normalized]
    matched_opt = [kw for kw in CRS_OPTIONAL_KEYWORDS if kw in normalized]

    is_crs = len(matched_req) > 0 and len(matched_opt) > 0
    confidence = 1.0 if is_crs else (0.3 if matched_req else 0.0)

    return {
        "is_crs": is_crs,
        "confidence": confidence,
        "matched": matched_req + matched_opt,
    }


# ──────────────────────────────────────────────
# 고객명 추출 (AR/CRS 공통)
# ──────────────────────────────────────────────

def _find_customer_name_line(text: str) -> str:
    """
    고객명이 있는 줄을 찾는다.
    AR: "Annual" 바로 윗줄
    CRS: "Customer" 바로 윗줄
    찾지 못하면 빈 문자열 반환.
    """
    lines = text.strip().split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("Annual") or stripped.startswith("Customer"):
            if i > 0:
                return lines[i - 1].strip()
            break
    return ""


def extract_customer_name(text: str) -> str:
    """
    고객명 추출.
    "Customer" 또는 "Annual" 바로 윗줄 = 고객명 라인.
    해당 줄에서 접미사 ("고객님을 위한" → "고객" → "고") 를 제거하면 고객명.
    긴 법인명의 경우 접미사가 잘리거나 아예 없을 수 있다.
    "계약자" 필드가 있으면 보완하여 가장 긴(완전한) 이름을 반환한다.
    """
    candidates = []

    # 방법 1: "Customer"/"Annual" 바로 윗줄에서 접미사 제거
    name_line = _find_customer_name_line(text)
    if name_line:
        name = name_line
        for suffix in [" 고객님을 위한", " 고객님을", " 고객님", " 고객", " 고"]:
            if name.endswith(suffix):
                name = name[: -len(suffix)].strip()
                break
        # 괄호 제거: "NAME(한글명)" → "NAME"
        paren = name.find("(")
        if paren > 0:
            name = name[:paren].strip()
        # "고객..."으로 시작하면 이름이 아닌 접미사 잔여물 → 무시
        if name and len(name) >= 2 and not name.startswith("고객"):
            candidates.append(name)

    # 방법 2: "계약자" 필드 (CRS 등에서 전체 이름 보장)
    normalized = re.sub(r"\s+", " ", text)
    idx = normalized.find("계약자")
    if idx >= 0:
        after = normalized[idx + len("계약자") :].lstrip(" :：\t")
        # 다음 필드 마커 앞까지
        end = len(after)
        for marker in ["피보험자", "사망", "증권번호", "보험기간", "보험료"]:
            pos = after.find(marker)
            if 0 < pos < end:
                end = pos
        name = after[:end].strip()
        if name:
            candidates.append(name)

    # 가장 긴 이름 반환 (잘림 방지)
    if candidates:
        return max(candidates, key=len)

    return ""


# ──────────────────────────────────────────────
# CRS 상품명 추출 (AR과의 핵심 차이점)
# ──────────────────────────────────────────────

def extract_product_name(text: str) -> str:
    """
    CRS 상품명 추출.
    "Review Service" 바로 아랫줄 전체 = 상품명.
    예: "무배당 My Fund 변액연금IV보험 적립형 종신, 20년납"
    """
    lines = text.strip().split("\n")
    for i, line in enumerate(lines):
        if line.strip().startswith("Review Service"):
            # 다음 비어있지 않은 줄 = 상품명
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if candidate:
                    return candidate
            break
    return ""


# ──────────────────────────────────────────────
# 날짜 추출
# ──────────────────────────────────────────────

def extract_issue_date(text: str, is_crs: bool = False) -> str:
    """
    발행일 추출 → YYYY-MM-DD 형식.

    CRS: "발행(기준)일: YYYY년 MM월 DD일" 우선 (pdfParser.ts:194)
    AR/대체: "YYYY년 MM월 DD일" (pdfParser.ts:81)
    """
    if is_crs:
        # CRS 전용: "발행(기준)일: 2026년 1월 29일"
        m = re.search(
            r"발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일",
            text,
        )
        if m:
            y, mo, d = m.groups()
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    # 공통: 일반 날짜 패턴
    m = re.search(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", text)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    # YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
    m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", text)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    return ""


# ──────────────────────────────────────────────
# 파일명 유틸리티
# ──────────────────────────────────────────────

ILLEGAL_CHARS = r'\/:*?"<>|'


def sanitize_filename(name: str) -> str:
    """Windows 파일명 불가 문자 제거 (rename_crs.py:17-22)"""
    for ch in ILLEGAL_CHARS:
        name = name.replace(ch, "")
    name = re.sub(r"\s+", " ", name).strip()
    return name


def unique_path(dest: Path) -> Path:
    """중복 파일명 자동 넘버링: file.pdf → file(2).pdf (rename_crs.py:100-109)"""
    if not dest.exists():
        return dest
    stem, suf = dest.stem, dest.suffix
    i = 2
    while True:
        candidate = dest.with_name(f"{stem}({i}){suf}")
        if not candidate.exists():
            return candidate
        i += 1


# ──────────────────────────────────────────────
# displayName 생성 (aims 시스템 형식)
# ──────────────────────────────────────────────

def build_display_name(doc_type: str, customer: str, issue_date: str, product: str = "") -> str:
    """
    aims 시스템과 동일한 displayName 형식 생성.

    AR:  {고객명}_AR_{YYYY-MM-DD}.pdf           (doc_prep_main.py:385)
    CRS: {고객명}_CRS_{상품명}_{YYYY-MM-DD}.pdf  (doc_prep_main.py:534)
    CRS (상품명 없음): {고객명}_CRS_{YYYY-MM-DD}.pdf (doc_prep_main.py:538)
    """
    if doc_type == "AR":
        base = f"{customer}_AR_{issue_date}.pdf"
    elif doc_type == "CRS":
        if product:
            safe_product = sanitize_filename(product)
            base = f"{customer}_CRS_{safe_product}_{issue_date}.pdf"
        else:
            base = f"{customer}_CRS_{issue_date}.pdf"
    else:
        return ""  # UNKNOWN은 원본 파일명 유지

    return sanitize_filename(base)


# ──────────────────────────────────────────────
# 통합 분류 + 추출 진입점
# ──────────────────────────────────────────────

def classify_and_extract(pdf_path: Path) -> PDFMetadata:
    """
    PDF 파일을 분류하고 메타데이터를 추출한다.

    1. 첫 페이지 텍스트 추출
    2. AR → CRS → UNKNOWN 순서로 분류
    3. 고객명, 상품명(CRS), 발행일 추출
    4. displayName 생성

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        PDFMetadata: 분류 결과 + 메타데이터
    """
    meta = PDFMetadata(file_path=pdf_path)

    try:
        text = extract_first_page_text(pdf_path)
    except Exception as e:
        meta.error_message = f"텍스트 추출 실패: {e}"
        return meta

    if not text.strip():
        meta.error_message = "텍스트가 비어 있음 (이미지 PDF 또는 빈 파일)"
        return meta

    # 1. AR 감지
    ar_result = detect_annual_report(text)
    if ar_result["is_ar"]:
        meta.doc_type = "AR"
        meta.confidence = ar_result["confidence"]
        meta.customer_name = extract_customer_name(text)
        meta.issue_date = extract_issue_date(text, is_crs=False)

        # 추출 실패 항목 수집 (fallback 없음)
        errors = []
        if not meta.customer_name:
            errors.append("고객명")
        if not meta.issue_date:
            errors.append("발행일")
        if errors:
            meta.error_message = f"추출 실패: {', '.join(errors)}"
        else:
            display = build_display_name("AR", meta.customer_name, meta.issue_date)
            meta.readable_title = display
            meta.new_filename = display
        return meta

    # 2. CRS 감지
    crs_result = detect_customer_review(text)
    if crs_result["is_crs"]:
        meta.doc_type = "CRS"
        meta.confidence = crs_result["confidence"]
        meta.customer_name = extract_customer_name(text)
        meta.product_name = extract_product_name(text)
        meta.issue_date = extract_issue_date(text, is_crs=True)

        # 추출 실패 항목 수집 (fallback 없음)
        errors = []
        if not meta.customer_name:
            errors.append("고객명")
        if not meta.product_name:
            errors.append("상품명")
        if not meta.issue_date:
            errors.append("발행일")
        if errors:
            meta.error_message = f"추출 실패: {', '.join(errors)}"
        else:
            display = build_display_name("CRS", meta.customer_name, meta.issue_date, meta.product_name)
            meta.readable_title = display
            meta.new_filename = display
        return meta

    # 3. UNKNOWN
    meta.error_message = "AR/CRS 키워드 미감지"
    return meta
