"""
합성 PDF 생성 유틸 — Phase 4.5 단위 테스트용

목적
----
CI/로컬 단위 테스트에서 PII 없는 결정적 PDF를 런타임에 생성한다.

- `make_text_ar_pdf(path, ...)`
  · reportlab으로 텍스트 레이어가 있는 가상 AR PDF 생성
  · pdfplumber로 텍스트/표 추출 가능 → is_image_pdf=False
  · 표(보유계약 현황 형식)와 "월 보험료는 총 N원" 문장 포함

- `make_image_only_pdf(path, ...)`
  · PIL로 이미지(회색 사각형)를 만들고 reportlab으로 PDF에 drawImage
  · 텍스트 레이어가 전혀 없는 PDF → is_image_pdf=True

본 모듈은 테스트 전용이며 런타임 프로덕션 코드에서 사용하지 않는다.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import List, Optional, Sequence

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

# 한글 CID 폰트 등록 (reportlab 내장, 외부 파일 의존성 없음)
# Phase 5: 표지 없는 텍스트 AR fixture의 푸터 한글 메타를 pdfplumber가
# 실제 유니코드로 추출할 수 있도록 보장한다.
_KOREAN_FONT = "HYSMyeongJo-Medium"
try:
    pdfmetrics.registerFont(UnicodeCIDFont(_KOREAN_FONT))
except Exception:
    # 이미 등록되어 있거나(드물게) 환경에 CID 폰트가 없을 때도 fixture 생성은
    # 계속 진행되어야 한다. 호출부에서 해당 폰트 사용 전에 fallback 처리.
    pass


DEFAULT_CONTRACTS: List[List[str]] = [
    # 순번, 증권번호, 보험상품, 계약자, 피보험자, 계약일, 상태, 가입금액(만원), 보험기간, 납입기간, 보험료(원)
    ["1", "TEST-0001", "테스트종신보험", "홍길동", "홍길동", "2020-01-15", "유효", "5000", "종신", "20년", "150000"],
    ["2", "TEST-0002", "테스트건강보험",   "홍길동", "김영희", "2021-03-22", "유효", "3000", "80세", "20년", "85000"],
    ["3", "TEST-0003", "테스트암보험",     "홍길동", "홍길동", "2022-07-01", "유효", "2000", "90세", "15년", "45000"],
]

DEFAULT_TOTAL_PREMIUM = 280_000


def make_text_ar_pdf(
    path: str,
    contracts: Optional[Sequence[Sequence[str]]] = None,
    total_premium: Optional[int] = None,
) -> str:
    """
    텍스트 레이어가 있는 가상 AR PDF를 생성한다.

    Args:
        path: 출력 PDF 경로 (str)
        contracts: 표에 기록할 계약 행 리스트 (기본: DEFAULT_CONTRACTS)
        total_premium: 총 월보험료 (기본: DEFAULT_TOTAL_PREMIUM)

    Returns:
        생성된 PDF의 절대 경로
    """
    if contracts is None:
        contracts = DEFAULT_CONTRACTS
    if total_premium is None:
        total_premium = DEFAULT_TOTAL_PREMIUM

    Path(path).parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4

    # 제목
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, height - 60, "Synthetic Annual Report (TEST FIXTURE)")
    c.setFont("Helvetica", 10)
    c.drawString(60, height - 80, "PII-FREE FIXTURE FOR UNIT TESTS")

    # 표 헤더
    headers = [
        "No.", "PolicyNo", "Product", "Holder", "Insured",
        "StartDate", "Status", "SumInsured", "Period", "PayTerm", "Premium"
    ]
    header_row_korean = (
        "순번 증권번호 보험상품 계약자 피보험자 계약일 계약상태 가입금액(만원) 보험기간 납입기간 보험료(원)"
    )
    c.setFont("Helvetica-Bold", 9)
    c.drawString(60, height - 120, header_row_korean)
    c.drawString(60, height - 135, " ".join(headers))

    # 데이터 행 (pdfplumber가 추출 가능한 평문)
    c.setFont("Helvetica", 9)
    y = height - 160
    for row in contracts:
        line = " | ".join(row)
        c.drawString(60, y, line)
        y -= 15
        if y < 100:
            c.showPage()
            y = height - 60

    # 총 월보험료 문장 (parser_upstage/parser_pdfplumber의 정규식 대상)
    y -= 10
    total_line = f"현재 납입중인 월 보험료는 총 {total_premium:,}원 입니다"
    c.setFont("Helvetica", 10)
    c.drawString(60, y, total_line)

    c.showPage()
    c.save()
    return str(Path(path).resolve())


def make_text_ar_without_cover(
    path: str,
    issue_date: str = "2025년 9월 10일",
    fsr_name: str = "홍길동",
    company_name: str = "MetLife",
    contracts: Optional[Sequence[Sequence[str]]] = None,
) -> str:
    """
    표지가 없는 텍스트형 Annual Report PDF 합성 (Phase 5 테스트용).

    구조:
        - Page 1: "보유계약 현황" 본문 (표지 없이 바로 계약 테이블)
        - Page 2: 푸터 메타 정보
            * "발행(기준)일 : {issue_date}"
            * "담당 : {fsr_name} FSR"
            * "{company_name}"

    표지("Annual Review Report" + "고객님을 위한")는 포함하지 않는다.
    → has_cover_page() 결과가 False.
    → extract_customer_info_from_first_page로는 issue_date/fsr_name/insurer를
       모두 추출할 수 없고 (표지가 없어서), footer_meta 폴백이 필요하다.

    Args:
        path: 출력 PDF 경로
        issue_date: 푸터에 찍을 발행일 (한국어 형식)
        fsr_name: 푸터에 찍을 FSR 이름
        company_name: 푸터 보험사 이름 (화이트리스트에 있어야 매칭됨)
        contracts: 계약 행 리스트 (기본 DEFAULT_CONTRACTS)

    Returns:
        생성된 PDF의 절대 경로
    """
    if contracts is None:
        contracts = DEFAULT_CONTRACTS

    Path(path).parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4

    # Page 1: 본문 — 표지 없음, "보유계약 현황" 제목으로 바로 시작
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, height - 60, "Synthetic AR (NO COVER) - TEST FIXTURE")
    # 한글은 CID 폰트로 렌더링해야 pdfplumber가 유니코드로 추출한다.
    c.setFont(_KOREAN_FONT, 12)
    c.drawString(60, height - 90, "보유계약 현황")
    c.setFont(_KOREAN_FONT, 10)
    c.drawString(60, height - 115, "순번 증권번호 계약자 피보험자 계약일 보험료")

    c.setFont("Helvetica", 9)
    y = height - 140
    for row in contracts:
        line = " | ".join(row)
        c.drawString(60, y, line)
        y -= 15
        if y < 100:
            break

    c.showPage()

    # Page 2: 푸터 메타 정보 — extract_footer_meta가 스캔해야 하는 내용
    c.setFont("Helvetica", 10)
    c.drawString(60, height - 60, "(continued)")
    # 푸터는 페이지 하단에 배치 — 한글은 CID 폰트로
    c.setFont(_KOREAN_FONT, 10)
    footer_y = 80
    c.drawString(60, footer_y + 30, f"발행(기준)일 : {issue_date}")
    c.drawString(60, footer_y + 15, f"담당 : {fsr_name} FSR")
    c.drawString(60, footer_y, company_name)

    c.showPage()
    c.save()
    return str(Path(path).resolve())


def make_image_only_pdf(
    path: str,
    width_px: int = 600,
    height_px: int = 800,
) -> str:
    """
    텍스트 레이어가 전혀 없는 이미지 전용 PDF를 생성한다.

    PIL로 단색 이미지를 만들고 reportlab으로 PDF에 drawImage만 수행한다.
    어떠한 drawString도 호출하지 않기 때문에 pdfplumber는 0자를 반환한다.

    Args:
        path: 출력 PDF 경로
        width_px: 이미지 가로 픽셀
        height_px: 이미지 세로 픽셀

    Returns:
        생성된 PDF의 절대 경로
    """
    Path(path).parent.mkdir(parents=True, exist_ok=True)

    # 단색 + 단순 체커 패턴 이미지 생성 (PIL) — 결정적, drawString 0회
    img = Image.new("RGB", (width_px, height_px), color=(230, 230, 230))
    block = Image.new("RGB", (20, 20), color=(200, 200, 200))
    for x in range(0, width_px, 40):
        for y in range(0, height_px, 40):
            img.paste(block, (x, y))

    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)

    # reportlab은 ImageReader로 BytesIO 이미지를 직접 받을 수 있음
    from reportlab.lib.utils import ImageReader

    c = canvas.Canvas(path, pagesize=A4)
    page_w, page_h = A4
    c.drawImage(
        ImageReader(img_buf),
        x=40,
        y=40,
        width=page_w - 80,
        height=page_h - 80,
        preserveAspectRatio=True,
        mask="auto",
    )
    # 중요: drawString 호출 금지 (텍스트 레이어 0자 유지)
    c.showPage()
    c.save()
    return str(Path(path).resolve())
