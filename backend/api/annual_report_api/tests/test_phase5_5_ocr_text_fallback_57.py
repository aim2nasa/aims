"""
Phase 5.5 Regression 테스트: 이미지 PDF OCR 텍스트 폴백 (#57)

목적
----
Upstage 파서가 계약 테이블은 잘 뽑지만 `customer_name/issue_date/fsr_name/
insurer_name`은 누락되는 이미지형 AR에 대해, files 컬렉션의 `meta.full_text`
(OCR 결과)를 정규식 폴백 경로로 사용하여 메타를 백필한다.

검증 대상
---------
1. services/footer_meta.extract_footer_meta_from_text(text)
   - 순수 텍스트 입력 기반 정규식 매칭
   - issue_date / fsr_name / company_name / customer_name(신규)
2. services/detector.extract_ar_meta(pdf_path, has_cover, ocr_text)
   - ocr_text 파라미터를 통한 OCR 폴백
   - 표지/pdf-footer/ocr-text 3단 우선순위 병합
3. 회귀: 기존 Phase 5 동작(표지 우선, pdf 푸터 폴백)은 변경 없음

모든 테스트는 오프라인 결정적. 외부 API 호출 금지. PII 없음(합성 데이터만).
"""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# annual_report_api/ 루트를 import path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

# reportlab/PIL은 합성 PDF fixture 전용. 로컬(Python 3.13)에는 없을 수 있으므로
# 해당 의존성을 쓰는 테스트 메서드만 선택적 skip한다. 본 파일 대부분은
# 순수 텍스트 기반 OCR 폴백 테스트로 reportlab 없이도 실행되어야 한다.
try:
    import reportlab  # noqa: F401
    import PIL  # noqa: F401
    _HAS_PDF_FIXTURE_DEPS = True
except ImportError:
    _HAS_PDF_FIXTURE_DEPS = False

_skip_no_fixture_deps = pytest.mark.skipif(
    not _HAS_PDF_FIXTURE_DEPS,
    reason="reportlab/PIL 미설치 - 합성 PDF 회귀 테스트 skip",
)


# ─────────────────────────────────────────────────────────────
# 픽스처: 실제 AR PDF의 OCR 결과를 모사한 합성 텍스트 (PII-FREE)
# ─────────────────────────────────────────────────────────────
# 실제 메트라이프 AR 푸터/본문 레이아웃을 재현.
# 피보험자 이름/FSR 이름/증권번호는 모두 합성/마스킹 값.
OCR_TEXT_PEER_PATTERN = """\
보유계약 현황
Annual Review Report | 2 / 16
테스트 3
님을 피보험자로 하는 보유계약은 현재 건이며,
450,000
현재 납입중인 월 보험료는 총 원 입니다.
계약 가입금액 보험 납입
순번 증권번호 보험상품 계약자 피보험자 계약일 보험료 (원)
1 XXXXXXXXX0001 무배당 테스트종신보험 테스트 테스트 2020-01-15 정상 3000 종신 20년 150000
2 XXXXXXXXX0002 무배당 테스트건강보험 테스트 테스트 2021-03-22 정상 2000 80세 20년 85000
3 XXXXXXXXX0003 무배당 테스트암보험 테스트 테스트 2022-07-01 정상 1500 90세 15년 65000
위의 가입상품에 대한 보장내용 및 보험금 지급 등에 대한 자세한 사항은 반드시 해당 약관과 보험증권을 참조하시기 바랍니다.
발행(기준)일 : 2025년 8월 28일 | 담당 : 홍길동 FSR
MetLife
"""

OCR_TEXT_HOLDER_PATTERN = """\
보유계약 현황
Annual Review Report | 2 / 8
샘플님은 현재 계약을 보유하고 계십니다. 보유계약은 현재 2건이며,
현재 납입중인 월 보험료는 총 120,000원 입니다.
순번 증권번호 보험상품 계약자 피보험자
1 XXXXXXXXX9001 테스트연금 샘플 샘플 2019-05-10 정상 2000 종신 10년 75000
2 XXXXXXXXX9002 테스트저축 샘플 샘플 2020-11-03 정상 1500 종신 전기납 45000
발행(기준)일 : 2024년 12월 15일 | 담당 : 김 담 당 FSR
삼성생명
"""

OCR_TEXT_EMPTY_FOOTER = """\
보유계약 현황
Annual Review Report | 1 / 2
순번 증권번호 보험상품 계약자 피보험자
1 XXXXXXXXX0001 상품A 계약자 피보험자 2020-01-01
"""


# ─────────────────────────────────────────────────────────────
# A. extract_footer_meta_from_text — 순수 텍스트 매칭
# ─────────────────────────────────────────────────────────────
class TestFooterMetaFromText:
    """services/footer_meta.extract_footer_meta_from_text 단위 테스트"""

    def test_module_exports_new_function(self):
        """공개 함수 extract_footer_meta_from_text 존재"""
        from services import footer_meta

        assert hasattr(footer_meta, "extract_footer_meta_from_text")
        assert callable(footer_meta.extract_footer_meta_from_text)

    def test_extracts_all_fields_from_peer_pattern(self):
        """실제 OCR 레이아웃(Peer 패턴) — 4개 필드 모두 추출"""
        from services.footer_meta import extract_footer_meta_from_text

        result = extract_footer_meta_from_text(OCR_TEXT_PEER_PATTERN)

        assert result.get("issue_date") == "2025-08-28", (
            f"issue_date 추출 실패: {result}"
        )
        assert result.get("fsr_name") == "홍길동", (
            f"fsr_name 추출 실패: {result}"
        )
        assert result.get("company_name") == "MetLife", (
            f"company_name 추출 실패: {result}"
        )
        assert result.get("customer_name") == "테스트", (
            f"customer_name 추출 실패(peer): {result}"
        )

    def test_extracts_customer_from_holder_pattern(self):
        """'XX 님은 ... 보유계약은 현재' 패턴에서 customer_name 추출"""
        from services.footer_meta import extract_footer_meta_from_text

        result = extract_footer_meta_from_text(OCR_TEXT_HOLDER_PATTERN)

        assert result.get("customer_name") == "샘플", (
            f"customer_name 추출 실패(holder): {result}"
        )
        # 다른 필드도 함께 추출되는지 확인
        assert result.get("issue_date") == "2024-12-15"
        assert result.get("fsr_name") == "김담당"  # 공백 제거
        assert result.get("company_name") == "삼성생명"

    def test_peer_pattern_priority_over_holder(self):
        """
        두 패턴이 모두 매칭 가능해도 정규식 순서상 peer 패턴이 먼저 시도됨.
        (구현상 peer → holder 순서)
        """
        from services.footer_meta import extract_footer_meta_from_text

        text = (
            "첫째 님은 안녕하세요 보유계약은 현재 1건\n"
            "둘째\n님을 피보험자로 하는 보유계약은 현재\n"
        )
        result = extract_footer_meta_from_text(text)
        # peer 패턴이 먼저 매칭되어 "둘째" 반환
        assert result.get("customer_name") == "둘째"

    def test_returns_empty_dict_on_none(self):
        """None 입력 → 빈 dict (예외 없음)"""
        from services.footer_meta import extract_footer_meta_from_text

        result = extract_footer_meta_from_text(None)
        assert result == {}

    def test_returns_empty_dict_on_empty_string(self):
        """빈 문자열 → 빈 dict"""
        from services.footer_meta import extract_footer_meta_from_text

        result = extract_footer_meta_from_text("")
        assert result == {}

    def test_missing_footer_returns_all_none(self):
        """푸터 정보가 전혀 없는 텍스트 → 모든 필드 None"""
        from services.footer_meta import extract_footer_meta_from_text

        result = extract_footer_meta_from_text(OCR_TEXT_EMPTY_FOOTER)
        assert isinstance(result, dict)
        assert result.get("issue_date") is None
        assert result.get("fsr_name") is None
        assert result.get("company_name") is None
        assert result.get("customer_name") is None

    @_skip_no_fixture_deps
    def test_pdfplumber_path_still_works(self, tmp_path):
        """
        회귀: 기존 extract_footer_meta(pdf_path) 경로도 동일 정규식을 사용하므로
        기존 동작이 유지되어야 한다. (리팩토링 검증)
        """
        from services.footer_meta import extract_footer_meta
        from tests.fixtures.synth_pdf import make_text_ar_without_cover

        pdf = tmp_path / "regression.pdf"
        make_text_ar_without_cover(
            str(pdf),
            issue_date="2025년 9월 10일",
            fsr_name="홍길동",
            company_name="MetLife",
        )
        result = extract_footer_meta(str(pdf))
        assert result.get("issue_date") == "2025-09-10"
        assert result.get("fsr_name") == "홍길동"
        assert result.get("company_name") == "MetLife"


# ─────────────────────────────────────────────────────────────
# B. extract_ar_meta — ocr_text 파라미터 동작
# ─────────────────────────────────────────────────────────────
class TestExtractArMetaOcrFallback:
    """services/detector.extract_ar_meta의 Phase 5.5 ocr_text 폴백"""

    def test_signature_accepts_ocr_text_kwarg(self):
        """extract_ar_meta는 ocr_text 키워드 인자를 받는다"""
        import inspect

        from services import detector

        sig = inspect.signature(detector.extract_ar_meta)
        assert "ocr_text" in sig.parameters
        # 기본값 None (이전 호출자 호환)
        assert sig.parameters["ocr_text"].default is None

    def test_image_pdf_with_ocr_text_gets_meta(self, tmp_path):
        """
        이미지 PDF 시나리오: 표지 추출 실패 + pdf 푸터 실패 + ocr_text로 성공.
        """
        from services import detector

        # 손상 PDF로 시작 — 텍스트 추출 경로 전부 실패
        pdf = tmp_path / "image_like.pdf"
        pdf.write_bytes(b"%PDF-1.4\n(corrupted for test)")

        # 표지/pdf-푸터 추출 둘 다 빈 결과 반환하도록 mock
        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value={},
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={},
            ):
                result = detector.extract_ar_meta(
                    str(pdf),
                    has_cover=True,
                    ocr_text=OCR_TEXT_PEER_PATTERN,
                )

        # OCR 폴백으로 4개 필드 모두 채워져야 함
        assert result.get("customer_name") == "테스트"
        assert result.get("issue_date") == "2025-08-28"
        assert result.get("fsr_name") == "홍길동"
        assert result.get("insurer_name") == "MetLife"  # company_name → insurer_name

    def test_image_pdf_without_ocr_text_returns_empty(self, tmp_path):
        """
        이미지 PDF 시나리오: ocr_text=None이면 기존 동작(빈 결과) 유지.
        """
        from services import detector

        pdf = tmp_path / "no_ocr.pdf"
        pdf.write_bytes(b"%PDF-1.4\n(corrupted)")

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value={},
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={},
            ):
                result = detector.extract_ar_meta(
                    str(pdf), has_cover=True, ocr_text=None
                )

        # 추출된 필드 없음
        assert result.get("customer_name") is None
        assert result.get("issue_date") is None
        assert result.get("fsr_name") is None
        assert result.get("insurer_name") is None

    def test_cover_beats_ocr_text(self, tmp_path):
        """
        우선순위: 표지 결과 > OCR 폴백.
        표지에서 모든 필드가 추출되면 ocr_text는 덮어쓰지 않는다.
        """
        from services import detector

        pdf = tmp_path / "cover_wins.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        cover_result = {
            "customer_name": "표지고객",
            "issue_date": "2024-01-01",
            "fsr_name": "표지FSR",
            "insurer_name": "표지생명",
        }

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={},
            ):
                result = detector.extract_ar_meta(
                    str(pdf),
                    has_cover=True,
                    ocr_text=OCR_TEXT_PEER_PATTERN,  # 다른 값으로 유혹
                )

        # 표지 값이 그대로 유지됨
        assert result["customer_name"] == "표지고객"
        assert result["issue_date"] == "2024-01-01"
        assert result["fsr_name"] == "표지FSR"
        assert result["insurer_name"] == "표지생명"

    def test_ocr_text_backfills_only_missing_fields(self, tmp_path):
        """표지에 일부 필드만 있으면 OCR은 누락 필드만 채운다."""
        from services import detector

        pdf = tmp_path / "partial.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        cover_result = {"customer_name": "표지고객"}  # 나머지 없음

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={},
            ):
                result = detector.extract_ar_meta(
                    str(pdf),
                    has_cover=False,  # 푸터 폴백 적극 호출
                    ocr_text=OCR_TEXT_PEER_PATTERN,
                )

        # 표지에 있던 customer_name은 보존
        assert result["customer_name"] == "표지고객"
        # 나머지는 OCR 폴백으로 채워짐
        assert result["issue_date"] == "2025-08-28"
        assert result["fsr_name"] == "홍길동"
        assert result["insurer_name"] == "MetLife"

    def test_pdf_footer_beats_ocr_text(self, tmp_path):
        """
        우선순위: pdf-footer > ocr-text.
        pdf 푸터에서 일부 필드가 나오면 OCR은 나머지만 채운다.
        """
        from services import detector

        pdf = tmp_path / "pdf_footer_wins.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value={},
        ):
            # pdf 푸터에서는 issue_date만 추출된 상황
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={
                    "issue_date": "2023-01-01",
                    "fsr_name": None,
                    "company_name": None,
                    "customer_name": None,
                },
            ):
                result = detector.extract_ar_meta(
                    str(pdf),
                    has_cover=False,
                    ocr_text=OCR_TEXT_PEER_PATTERN,
                )

        # issue_date는 pdf 푸터 값 유지
        assert result["issue_date"] == "2023-01-01"
        # 나머지는 OCR에서 채워짐
        assert result["customer_name"] == "테스트"
        assert result["fsr_name"] == "홍길동"
        assert result["insurer_name"] == "MetLife"


# ─────────────────────────────────────────────────────────────
# C. 회귀: Phase 5 동작 유지
# ─────────────────────────────────────────────────────────────
class TestPhase5Regression:
    """Phase 5(텍스트형 + 표지 없음) 경로가 그대로 동작하는지 회귀 검증"""

    @_skip_no_fixture_deps
    def test_text_ar_without_cover_still_works(self, tmp_path):
        """기존 Phase 5 E2E — ocr_text 없이 텍스트 AR 처리"""
        from services import detector
        from services.detector import has_cover_page
        from tests.fixtures.synth_pdf import make_text_ar_without_cover

        pdf = tmp_path / "regression_no_cover.pdf"
        make_text_ar_without_cover(
            str(pdf),
            issue_date="2025년 9월 10일",
            fsr_name="홍길동",
            company_name="MetLife",
        )
        assert has_cover_page(str(pdf)) is False

        # ocr_text 파라미터 없이 호출 (기존 호출 시그니처)
        result = detector.extract_ar_meta(str(pdf), has_cover=False)

        assert result.get("issue_date") == "2025-09-10"
        assert result.get("fsr_name") == "홍길동"
        assert result.get("insurer_name") == "MetLife"
