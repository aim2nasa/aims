"""
Phase 5 Regression 테스트: 텍스트형 + 표지 없는 AR 푸터 메타 추출 (#57)

목적
----
텍스트형 PDF에서 표지가 없을 때에도 발행일/FSR/보험사 같은
푸터 메타 정보를 파싱 결과에 포함시켜야 한다.

검증 대상
---------
1. services/footer_meta.py
   - extract_footer_meta(pdf_path)
   - 정규식 매칭 (발행일/FSR/보험사)
   - 이미지 PDF / 푸터 없음 / 손상 PDF → 빈 dict 또는 None 필드
2. services/detector.py
   - extract_ar_meta(pdf_path, has_cover)
   - 표지 우선, 푸터 폴백 병합
3. E2E
   - make_text_ar_without_cover로 생성한 합성 PDF를
     extract_ar_meta로 통과시켰을 때 최종 dict에 푸터 메타가 모두 포함

모든 테스트는 오프라인 결정적. 외부 API 호출 금지.
"""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# 합성 PDF 생성 의존성이 없는 환경에서는 본 파일 전체를 skip.
# reportlab/PIL은 테스트 전용이며 프로덕션 파이프라인은 별도 테스트에서 커버한다.
pytest.importorskip("reportlab", reason="reportlab 미설치 - 합성 PDF fixture skip")
pytest.importorskip("PIL", reason="Pillow 미설치 - 합성 PDF fixture skip")

# annual_report_api/ 루트를 import path에 추가 (다른 Phase 테스트와 동일 규약)
sys.path.insert(0, str(Path(__file__).parent.parent))

from tests.fixtures.synth_pdf import (  # noqa: E402
    make_image_only_pdf,
    make_text_ar_pdf,
    make_text_ar_without_cover,
)


# ─────────────────────────────────────────────────────────────
# A. footer_meta 단위 테스트
# ─────────────────────────────────────────────────────────────
class TestFooterMetaUnit:
    """services/footer_meta.py 정규식 + 추출 동작"""

    def test_module_exports(self):
        """공개 함수 extract_footer_meta 존재"""
        from services import footer_meta

        assert hasattr(footer_meta, "extract_footer_meta")
        assert hasattr(footer_meta, "COMPANY_WHITELIST")
        assert callable(footer_meta.extract_footer_meta)

    def test_footer_meta_extracts_issue_date(self, tmp_path):
        """푸터 발행일 정규식 매칭 → YYYY-MM-DD 정규화"""
        from services.footer_meta import extract_footer_meta

        pdf = tmp_path / "date.pdf"
        make_text_ar_without_cover(
            str(pdf),
            issue_date="2025년 9월 10일",
            fsr_name="홍길동",
            company_name="MetLife",
        )

        result = extract_footer_meta(str(pdf))
        assert result.get("issue_date") == "2025-09-10", (
            f"발행일 YYYY-MM-DD 정규화 실패: {result}"
        )

    def test_footer_meta_extracts_fsr(self, tmp_path):
        """푸터 FSR 이름 매칭"""
        from services.footer_meta import extract_footer_meta

        pdf = tmp_path / "fsr.pdf"
        make_text_ar_without_cover(
            str(pdf),
            fsr_name="송유미",
        )

        result = extract_footer_meta(str(pdf))
        assert result.get("fsr_name") == "송유미", (
            f"FSR 이름 추출 실패: {result}"
        )

    def test_footer_meta_extracts_company(self, tmp_path):
        """보험사 화이트리스트 매칭 — MetLife"""
        from services.footer_meta import extract_footer_meta

        pdf = tmp_path / "company.pdf"
        make_text_ar_without_cover(
            str(pdf),
            company_name="MetLife",
        )

        result = extract_footer_meta(str(pdf))
        assert result.get("company_name") == "MetLife", (
            f"보험사 이름 추출 실패: {result}"
        )

    def test_footer_meta_company_whitelist_normalization(self, tmp_path):
        """화이트리스트 매칭 시 canonical 이름으로 정규화"""
        from services.footer_meta import extract_footer_meta

        pdf = tmp_path / "samsung.pdf"
        make_text_ar_without_cover(
            str(pdf),
            company_name="삼성생명",
        )

        result = extract_footer_meta(str(pdf))
        assert result.get("company_name") == "삼성생명"

    def test_footer_meta_empty_on_missing_footer(self, tmp_path):
        """푸터가 없는 텍스트 PDF → 세 필드 모두 None"""
        from services.footer_meta import extract_footer_meta

        # make_text_ar_pdf는 푸터 메타를 넣지 않는다 (계약 테이블만)
        pdf = tmp_path / "no_footer.pdf"
        make_text_ar_pdf(str(pdf))

        result = extract_footer_meta(str(pdf))
        # dict 자체는 반환되지만 모든 필드가 None이어야 함
        assert isinstance(result, dict)
        assert result.get("issue_date") is None
        assert result.get("fsr_name") is None
        assert result.get("company_name") is None

    def test_footer_meta_returns_empty_on_image_pdf(self, tmp_path):
        """이미지 PDF → 빈 dict (pdfplumber 텍스트 0)"""
        from services.footer_meta import extract_footer_meta

        pdf = tmp_path / "image.pdf"
        make_image_only_pdf(str(pdf))

        result = extract_footer_meta(str(pdf))
        # 텍스트가 전혀 없으므로 {} 또는 모든 필드 None
        assert result == {} or all(v is None for v in result.values())

    def test_footer_meta_returns_empty_on_missing_file(self):
        """존재하지 않는 파일 → 빈 dict (예외 미발생)"""
        from services.footer_meta import extract_footer_meta

        result = extract_footer_meta("/nonexistent/path/to/file.pdf")
        assert result == {}

    def test_footer_meta_returns_empty_on_corrupted_pdf(self, tmp_path):
        """손상된 PDF → 빈 dict (예외 미발생, 호출자 계약 보장)"""
        from services.footer_meta import extract_footer_meta

        bad = tmp_path / "bad.pdf"
        bad.write_bytes(b"not a pdf at all")

        result = extract_footer_meta(str(bad))
        assert result == {}


# ─────────────────────────────────────────────────────────────
# B. extract_ar_meta — 표지 우선 + 푸터 폴백 병합
# ─────────────────────────────────────────────────────────────
class TestExtractArMetaMerge:
    """services/detector.extract_ar_meta 통합 동작"""

    def test_extract_ar_meta_function_exists(self):
        """detector.py에 extract_ar_meta 함수 존재"""
        from services import detector

        assert hasattr(detector, "extract_ar_meta")
        assert callable(detector.extract_ar_meta)

    def test_extract_ar_meta_uses_cover_when_available(self, tmp_path):
        """표지 결과가 있으면 푸터 폴백이 덮어쓰지 않는다 (표지 우선)"""
        from services import detector

        pdf = tmp_path / "cover_wins.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        # 표지 추출은 모든 필드를 반환한다고 가정
        cover_result = {
            "customer_name": "표지고객",
            "issue_date": "2024-01-01",
            "fsr_name": "표지FSR",
            "insurer_name": "표지생명",
            "report_title": "Annual Review Report",
        }
        footer_result = {
            "issue_date": "2099-12-31",
            "fsr_name": "푸터FSR",
            "company_name": "푸터생명",
        }

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value=footer_result,
            ):
                result = detector.extract_ar_meta(str(pdf), has_cover=True)

        # 표지 값이 모두 유지되어야 함
        assert result["issue_date"] == "2024-01-01"
        assert result["fsr_name"] == "표지FSR"
        assert result["insurer_name"] == "표지생명"
        assert result["customer_name"] == "표지고객"

    def test_extract_ar_meta_falls_back_to_footer(self, tmp_path):
        """표지에서 누락된 필드만 푸터로 백필"""
        from services import detector

        pdf = tmp_path / "fallback.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        # 표지 추출이 customer_name만 있고 나머지는 없음
        cover_result = {"customer_name": "홍길동"}
        footer_result = {
            "issue_date": "2025-09-10",
            "fsr_name": "송유미",
            "company_name": "MetLife",
        }

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value=footer_result,
            ):
                result = detector.extract_ar_meta(str(pdf), has_cover=False)

        assert result["customer_name"] == "홍길동"
        assert result["issue_date"] == "2025-09-10"
        assert result["fsr_name"] == "송유미"
        assert result["insurer_name"] == "MetLife"  # company_name → insurer_name 매핑

    def test_extract_ar_meta_no_footer_call_when_all_fields_present(self, tmp_path):
        """표지 결과에 모든 필드가 있고 has_cover=True면 footer_meta 미호출 (성능)"""
        from services import detector

        pdf = tmp_path / "complete.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        cover_result = {
            "customer_name": "홍길동",
            "issue_date": "2024-01-01",
            "fsr_name": "홍FSR",
            "insurer_name": "MetLife",
        }

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta"
            ) as mock_footer:
                result = detector.extract_ar_meta(str(pdf), has_cover=True)
                mock_footer.assert_not_called()

        assert result == cover_result

    def test_extract_ar_meta_has_cover_false_always_calls_footer(self, tmp_path):
        """has_cover=False면 모든 필드가 채워져 있어도 푸터를 시도한다"""
        from services import detector

        pdf = tmp_path / "no_cover_force.pdf"
        pdf.write_bytes(b"%PDF-1.4")

        cover_result = {
            "customer_name": "홍길동",
            "issue_date": "2024-01-01",
            "fsr_name": "홍FSR",
            "insurer_name": "MetLife",
        }

        with patch.object(
            detector,
            "extract_customer_info_from_first_page",
            return_value=cover_result,
        ):
            with patch(
                "services.footer_meta.extract_footer_meta",
                return_value={
                    "issue_date": None,
                    "fsr_name": None,
                    "company_name": None,
                },
            ) as mock_footer:
                detector.extract_ar_meta(str(pdf), has_cover=False)
                mock_footer.assert_called_once()


# ─────────────────────────────────────────────────────────────
# C. E2E — 합성 PDF로 전 경로 검증
# ─────────────────────────────────────────────────────────────
class TestE2ETextArWithoutCover:
    """make_text_ar_without_cover → extract_ar_meta → 최종 dict 확인"""

    def test_e2e_text_ar_without_cover_gets_footer_meta(self, tmp_path):
        """
        E2E: 표지 없는 텍스트 AR 합성 PDF를 extract_ar_meta로 처리하면
        최종 dict에 발행일/FSR/보험사가 모두 포함되어야 한다.
        """
        from services import detector
        from services.detector import has_cover_page

        pdf = tmp_path / "e2e_no_cover.pdf"
        make_text_ar_without_cover(
            str(pdf),
            issue_date="2025년 9월 10일",
            fsr_name="홍길동",
            company_name="MetLife",
        )

        # 표지 판별이 False로 나와야 (표지 없음)
        assert has_cover_page(str(pdf)) is False

        # extract_ar_meta 실행 — 실제 footer_meta와 detector가 연결됨
        result = detector.extract_ar_meta(str(pdf), has_cover=False)

        # 푸터 메타가 모두 포함되어야 함
        assert result.get("issue_date") == "2025-09-10", (
            f"E2E 발행일 누락: {result}"
        )
        assert result.get("fsr_name") == "홍길동", (
            f"E2E FSR 이름 누락: {result}"
        )
        assert result.get("insurer_name") == "MetLife", (
            f"E2E 보험사 이름 누락: {result}"
        )
