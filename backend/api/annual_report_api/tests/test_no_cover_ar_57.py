"""
Regression 테스트: 표지 없는 Annual Report 파싱 지원 (#57)

이전 버그:
    - detector.py의 required_keywords에 '메트라이프생명' 포함
      → 다른 보험사 AR 미감지
    - parser.py가 start_page=2 고정
      → 표지 없는 AR(본문이 1페이지)에서 계약 테이블 누락
    - extract_customer_info_from_first_page가 'Annual' 위 줄에만 의존
      → 표지 없는 AR에서 고객명 추출 실패

수정:
    - detector.is_annual_report: 제목 키워드(Annual Review Report OR 보유계약 현황)
      1개 이상 + 필드 키워드 2개 이상
    - detector.has_cover_page: 표지 판별 함수 신규 추가
    - detector.extract_customer_info_from_first_page:
      '{이름} 님은/님의' 패턴, '발행(기준)일:' 우선 패턴, 푸터 FSR 패턴 추가
    - parser.parse_annual_report: has_cover 파라미터 추가,
      False면 start_page=1로 본문 1페이지부터 전달
    - 시스템 프롬프트에 푸터 메타데이터 추출 지시 추가
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestDetectorInsurerNeutral:
    """보험사 중립 감지"""

    def test_required_keywords_no_metlife(self):
        """detector.py의 키워드 구조에서 '메트라이프생명'이 판정 필수에서 제거되었는지"""
        source = Path(__file__).parents[1] / "services" / "detector.py"
        content = source.read_text(encoding="utf-8")

        # required_keywords 리스트가 더 이상 없거나, '메트라이프생명'이 판정 필수에서 제거되어야 함
        assert "title_keywords" in content, (
            "detector.py에 title_keywords 변수가 없습니다 (보험사 중립 구조 필요)"
        )
        assert "field_keywords" in content, (
            "detector.py에 field_keywords 변수가 없습니다"
        )

        # 판정 로직: title >= 1 AND field >= 2
        assert "len(matched_title) >= 1" in content, (
            "제목 키워드 1개 이상 판정 로직이 없습니다"
        )
        assert "len(matched_fields) >= 2" in content, (
            "필드 키워드 2개 이상 판정 로직이 없습니다"
        )


class TestDetectorHasCoverPage:
    """표지 판별 함수"""

    def test_has_cover_page_function_exists(self):
        """detector.py에 has_cover_page 함수가 존재하는지"""
        source = Path(__file__).parents[1] / "services" / "detector.py"
        content = source.read_text(encoding="utf-8")
        assert "def has_cover_page(" in content, (
            "detector.py에 has_cover_page 함수가 없습니다"
        )
        # 표지 판별 기준: 'Annual Review Report' AND '고객님을 위한'
        assert "Annual Review Report" in content
        assert "고객님을 위한" in content


class TestDetectorFallbackExtraction:
    """표지 없는 AR 대응 fallback 추출"""

    def test_customer_name_fallback_pattern(self):
        """detector.py에 '{이름} 님은/님의' fallback 패턴이 있는지"""
        source = Path(__file__).parents[1] / "services" / "detector.py"
        content = source.read_text(encoding="utf-8")
        assert "님[은의]" in content, (
            "detector.py에 '님은/님의' fallback 패턴이 없습니다"
        )

    def test_issue_date_footer_pattern(self):
        """detector.py에 '발행(기준)일:' 우선 패턴이 있는지"""
        source = Path(__file__).parents[1] / "services" / "detector.py"
        content = source.read_text(encoding="utf-8")
        assert "발행" in content and "기준" in content, (
            "detector.py에 '발행(기준)일:' 패턴이 없습니다"
        )

    def test_fsr_footer_pattern(self):
        """detector.py에 '담당 : {이름} FSR' 푸터 패턴이 있는지"""
        source = Path(__file__).parents[1] / "services" / "detector.py"
        content = source.read_text(encoding="utf-8")
        # 푸터 형식: "담당 : 송유미 FSR" 또는 "담당: 송 유 미 FSR"
        assert '담당' in content and 'FSR' in content, (
            "detector.py에 '담당 : FSR' 푸터 패턴이 없습니다"
        )


class TestParserHasCoverParameter:
    """parser.parse_annual_report의 has_cover 파라미터"""

    def test_parse_annual_report_has_cover_param(self):
        """parser.py의 parse_annual_report에 has_cover 파라미터가 있는지"""
        source = Path(__file__).parents[1] / "services" / "parser.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover: bool = True" in content, (
            "parser.py의 parse_annual_report에 has_cover 파라미터가 없습니다"
        )

    def test_parser_start_page_branch(self):
        """parser.py에 has_cover에 따른 start_page 분기가 있는지"""
        source = Path(__file__).parents[1] / "services" / "parser.py"
        content = source.read_text(encoding="utf-8")
        # start_page = 2 if has_cover else 1
        assert "start_page = 2 if has_cover else 1" in content, (
            "parser.py에 has_cover 기반 start_page 분기가 없습니다"
        )

    def test_parser_footer_extraction_prompt(self):
        """parser.py 시스템 프롬프트에 푸터 메타데이터 추출 지시가 있는지"""
        source = Path(__file__).parents[1] / "services" / "parser.py"
        content = source.read_text(encoding="utf-8")
        assert "발행기준일" in content, "프롬프트에 발행기준일 추출 지시가 없습니다"
        assert "FSR_이름" in content, "프롬프트에 FSR_이름 추출 지시가 없습니다"
        assert "보험사명" in content, "프롬프트에 보험사명 추출 지시가 없습니다"


class TestOtherParsersHasCoverCompatibility:
    """다른 파서들(pdfplumber/upstage)의 has_cover 인터페이스 호환성"""

    def test_parser_pdfplumber_has_cover(self):
        source = Path(__file__).parents[1] / "services" / "parser_pdfplumber.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover: bool = True" in content, (
            "parser_pdfplumber.py에 has_cover 파라미터가 없습니다 (인터페이스 호환성)"
        )

    def test_parser_pdfplumber_table_has_cover(self):
        source = Path(__file__).parents[1] / "services" / "parser_pdfplumber_table.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover: bool = True" in content, (
            "parser_pdfplumber_table.py에 has_cover 파라미터가 없습니다"
        )

    def test_parser_upstage_has_cover(self):
        source = Path(__file__).parents[1] / "services" / "parser_upstage.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover: bool = True" in content, (
            "parser_upstage.py에 has_cover 파라미터가 없습니다"
        )


class TestCallSitesPassHasCover:
    """호출부에서 has_cover를 전달하는지"""

    def test_parse_route_passes_has_cover(self):
        source = Path(__file__).parents[1] / "routes" / "parse.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover_page(" in content, (
            "routes/parse.py에서 has_cover_page() 호출이 없습니다"
        )
        assert "has_cover=has_cover" in content, (
            "routes/parse.py에서 has_cover 전달이 없습니다"
        )

    def test_background_route_passes_has_cover(self):
        source = Path(__file__).parents[1] / "routes" / "background.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover_page(" in content, (
            "routes/background.py에서 has_cover_page() 호출이 없습니다"
        )
        assert content.count("has_cover=has_cover") >= 2, (
            "routes/background.py의 두 호출부 모두 has_cover 전달이 필요합니다"
        )

    def test_auto_parse_passes_has_cover(self):
        source = Path(__file__).parents[1] / "auto_parse_annual_reports.py"
        content = source.read_text(encoding="utf-8")
        assert "has_cover_page(" in content, (
            "auto_parse_annual_reports.py에서 has_cover_page() 호출이 없습니다"
        )
        assert "has_cover=has_cover" in content, (
            "auto_parse_annual_reports.py에서 has_cover 전달이 없습니다"
        )


class TestDetectorIsAnnualReportUnit:
    """detector.is_annual_report 순수 함수 유닛 테스트 (모의 PDF 경로 대신 텍스트 주입)"""

    def test_is_annual_report_with_cover(self, monkeypatch, tmp_path):
        """표지 있는 AR: 'Annual Review Report' + 필드 2개"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "송유미 고객님을 위한\n"
                "Annual Review Report\n"
                "증권번호 123456\n"
                "계약자 이불\n"
                "피보험자 이불\n"
                "보험료 100,000원\n"
            )
        )
        monkeypatch.setattr(
            detector, "validate_pdf_file",
            lambda path: {"valid": True}
        )

        fake_pdf = tmp_path / "fake.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        result = detector.is_annual_report(str(fake_pdf))
        assert result["is_annual_report"] is True
        assert "Annual Review Report" in result["matched_keywords"]
        assert result["confidence"] > 0.5

    def test_is_annual_report_without_cover(self, monkeypatch, tmp_path):
        """표지 없는 AR: '보유계약 현황' + 필드 2개 (메트라이프 키워드 없어도 감지)"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "보유계약 현황\n"
                "증권번호 789\n"
                "계약자 마리치\n"
                "피보험자 마리치\n"
                "보험료 50,000원\n"
            )
        )
        monkeypatch.setattr(
            detector, "validate_pdf_file",
            lambda path: {"valid": True}
        )

        fake_pdf = tmp_path / "no_cover.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        result = detector.is_annual_report(str(fake_pdf))
        assert result["is_annual_report"] is True, (
            f"표지 없는 AR을 감지하지 못함: {result}"
        )
        assert "보유계약 현황" in result["matched_keywords"]

    def test_is_annual_report_rejects_non_ar(self, monkeypatch, tmp_path):
        """AR이 아닌 문서는 false"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: "일반 문서 내용입니다. 특별한 키워드 없음."
        )
        monkeypatch.setattr(
            detector, "validate_pdf_file",
            lambda path: {"valid": True}
        )

        fake_pdf = tmp_path / "not_ar.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        result = detector.is_annual_report(str(fake_pdf))
        assert result["is_annual_report"] is False

    def test_has_cover_page_true(self, monkeypatch, tmp_path):
        """'Annual Review Report' + '고객님을 위한' 동시 존재 → True"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "이불 고객님을 위한\n"
                "Annual Review Report\n"
            )
        )

        fake_pdf = tmp_path / "cover.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        assert detector.has_cover_page(str(fake_pdf)) is True

    def test_has_cover_page_false(self, monkeypatch, tmp_path):
        """표지 요소 없으면 False"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "보유계약 현황\n"
                "증권번호 123\n"
            )
        )

        fake_pdf = tmp_path / "no_cover.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        assert detector.has_cover_page(str(fake_pdf)) is False

    def test_extract_customer_info_name_fallback(self, monkeypatch, tmp_path):
        """'{이름} 님은' 패턴 fallback"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "보유계약 현황\n"
                "마리치 님은 소중한 고객입니다.\n"
            )
        )

        fake_pdf = tmp_path / "fallback.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        info = detector.extract_customer_info_from_first_page(str(fake_pdf))
        assert info.get("customer_name") == "마리치"

    def test_extract_issue_date_footer_priority(self, monkeypatch, tmp_path):
        """'발행(기준)일 : YYYY년 M월 D일'이 일반 날짜보다 우선"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "2024년 1월 1일 계약일\n"  # 일반 날짜
                "발행(기준)일 : 2025년 8월 28일\n"  # 발행일 (우선)
            )
        )

        fake_pdf = tmp_path / "date.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        info = detector.extract_customer_info_from_first_page(str(fake_pdf))
        assert info.get("issue_date") == "2025-08-28"

    def test_extract_fsr_footer_pattern(self, monkeypatch, tmp_path):
        """'담당 : 송유미 FSR' 푸터 패턴"""
        from services import detector

        monkeypatch.setattr(
            detector, "extract_text_from_page",
            lambda path, page_num: (
                "발행(기준)일 : 2025년 8월 28일  |  담당 : 송유미 FSR\n"
            )
        )

        fake_pdf = tmp_path / "fsr.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4")

        info = detector.extract_customer_info_from_first_page(str(fake_pdf))
        assert info.get("fsr_name") == "송유미"
